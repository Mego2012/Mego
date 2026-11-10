/**
 * Workout programs and sessions. Storage: existing synced kv table — "program:<id>", "activeProgram",
 * "workout:<id>" (one per session), "recovery:<date>". No schema change; per-account isolation as for all kv data.
 */
import { addDays, today, weekday } from './dates';
import { db } from './db';
import { EXERCISES, findExercise, LEGS, MUSCLES, type Equipment, type Exercise, type Muscle } from './exercises';
import { kvDelete, kvSet, uid } from './repo';

export interface ProgramExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  /** Target reps in reserve on the last set (effort guide). */
  targetRir: number;
  /** Why the generator chose it (i18n key). */
  why?: string;
}
export interface ProgramDay {
  id: string;
  name: string;
  /** 0=Sunday … 6=Saturday; -1 = not tied to a weekday. */
  weekday: number;
  muscles: Muscle[];
  rest: boolean;
  exercises: ProgramExercise[];
}
export interface Program {
  id: string;
  name: string;
  days: ProgramDay[];
  createdAt: number;
  updatedAt: number;
}

export interface SetLog { reps: number | null; weightKg: number | null; rir?: number | null; rpe?: number | null; done: boolean }
export interface LoggedExercise {
  exerciseId: string;
  name: string;
  status: 'pending' | 'done' | 'skipped';
  restSec: number;
  notes?: string;
  target?: { sets: number; repMin: number; repMax: number; targetRir: number };
  sets: SetLog[];
}
export interface WorkoutSession {
  id: string;
  date: string;
  programId?: string;
  dayId?: string;
  name: string;
  muscles: Muscle[];
  startedAt: number;
  endedAt?: number;
  /** Body weight at the session (for body-weight exercises and relative strength). */
  bodyWeightKg: number;
  exercises: LoggedExercise[];
  notes?: string;
  updatedAt: number;
}
export interface RecoveryLog { date: string; sleepH?: number | null; soreness?: number | null; energy?: number | null; fatigue?: number | null; updatedAt: number }

export const PROGRAM_PREFIX = 'program:';
export const WORKOUT_PREFIX = 'workout:';
export const RECOVERY_PREFIX = 'recovery:';
export const ACTIVE_PROGRAM_KEY = 'activeProgram';

/* ------------------------------------------------------------------ generator */

export type Experience = 'beginner' | 'intermediate' | 'advanced';
export interface GeneratorInput {
  days: { name: string; muscles: Muscle[]; rest: boolean; weekday: number }[];
  experience: Experience;
  equipment: Equipment[];
  /** Weekly sets target per muscle (default by experience). */
  setsPerMuscle?: number;
  pullupsPerWeek: number;
  dipsPerWeek: number;
  preferred?: string[];
  /** Exercises the user has actually trained recently (kept when possible — "don't fix what works"). */
  history?: string[];
  exercises?: Exercise[];
}

export const SETS_BY_EXPERIENCE: Record<Experience, number> = { beginner: 10, intermediate: 14, advanced: 16 };
/** Weekly hard sets per muscle: ~10–20 is the commonly supported hypertrophy range; > 20–25 adds fatigue with little benefit. */
export const SETS_RANGE = { min: 10, max: 20 } as const;
const SMALL = new Set<Muscle>(['biceps', 'triceps', 'abs', 'calves', 'forearms', 'shoulders']);

/** The owner's split: 6 training days + rest, starting Saturday (matching the training weekdays in settings). */
export const OWNER_SPLIT: GeneratorInput['days'] = [
  { name: 'Chest + Triceps', muscles: ['chest', 'triceps'], rest: false, weekday: 6 },
  { name: 'Back + Biceps', muscles: ['back', 'biceps'], rest: false, weekday: 0 },
  { name: 'Shoulders + Abs', muscles: ['shoulders', 'abs'], rest: false, weekday: 1 },
  { name: 'Legs', muscles: [...LEGS], rest: false, weekday: 2 },
  { name: 'Chest + Biceps', muscles: ['chest', 'biceps'], rest: false, weekday: 3 },
  { name: 'Back + Triceps', muscles: ['back', 'triceps'], rest: false, weekday: 4 },
  { name: 'Rest', muscles: [], rest: true, weekday: 5 }
];

export const DEFAULT_GENERATOR: GeneratorInput = {
  days: OWNER_SPLIT, experience: 'intermediate', equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'pullup_bar', 'dip_bars', 'ez_bar', 'smith'],
  pullupsPerWeek: 2, dipsPerWeek: 2
};

/**
 * Fills the user's own split with exercises. Never changes the split itself.
 * Per muscle: weekly sets target ÷ times trained per week → sets per session, spread over 1–3 exercises
 * (compound first, then isolation; staples Pull-ups/Dips placed on matching days up to the chosen frequency).
 * In a fat-loss phase the heavy compound stays in the 5–10 range to retain strength; isolation work 10–20.
 */
export function generateProgram(input: GeneratorInput, name = 'My split'): Program {
  const list = input.exercises ?? EXERCISES;
  const target = input.setsPerMuscle ?? SETS_BY_EXPERIENCE[input.experience];
  const freq = new Map<Muscle, number>();
  for (const d of input.days) if (!d.rest) for (const m of d.muscles) freq.set(m, (freq.get(m) ?? 0) + 1);
  const can = (e: Exercise) => e.equipment.some((q) => input.equipment.includes(q));
  const usedEarlier = new Set<string>();
  // preferred and already-trained exercises first; on a muscle's second day of the week, variations not used yet
  const score = (e: Exercise) => (input.preferred?.includes(e.id) ? 4 : 0) + (input.history?.includes(e.id) ? 3 : 0) - (usedEarlier.has(e.id) ? 1 : 0);
  // Staples first go to their own muscle's days (pull-ups → back, dips → triceps); any extra weekly frequency is
  // placed on days that train a muscle they also work (pull-ups → biceps days, dips → chest days).
  const backDays = input.days.filter((d) => !d.rest && d.muscles.includes('back')).length;
  const triDays = input.days.filter((d) => !d.rest && d.muscles.includes('triceps')).length;
  let pullups = Math.min(input.pullupsPerWeek, backDays), dips = Math.min(input.dipsPerWeek, triDays);
  let pullExtra = Math.max(0, input.pullupsPerWeek - backDays), dipExtra = Math.max(0, input.dipsPerWeek - triDays);
  const days: ProgramDay[] = input.days.map((d) => {
    const exercises: ProgramExercise[] = [];
    if (!d.rest) {
      // per-session caps: ~6–10 hard sets per muscle per session (less when the day trains 3+ muscles), ≤ 24 per day
      const bigCap = d.muscles.length >= 3 ? 8 : 10;
      const samePattern = (a: Exercise, b: Exercise) => a.category === b.category && (a.alternatives.includes(b.id) || b.alternatives.includes(a.id));
      for (const m of d.muscles) {
        const perSession = Math.min(SMALL.has(m) ? 6 : bigCap, Math.max(SMALL.has(m) ? 2 : 3, Math.round(target / Math.max(1, freq.get(m) ?? 1))));
        const picks: { ex: Exercise; why: string }[] = [];
        if (m === 'back' && pullups > 0 && can(findExercise('pullup', list)!)) { picks.push({ ex: findExercise('pullup', list)!, why: 'why_staple' }); pullups--; }
        if (m === 'triceps' && dips > 0 && can(findExercise('dips', list)!)) { picks.push({ ex: findExercise('dips', list)!, why: 'why_staple' }); dips--; }
        if (m === 'biceps' && !d.muscles.includes('back') && pullExtra > 0 && can(findExercise('pullup', list)!)) { picks.push({ ex: findExercise('pullup', list)!, why: 'why_staple' }); pullExtra--; }
        if (m === 'chest' && !d.muscles.includes('triceps') && dipExtra > 0 && can(findExercise('dips', list)!)) { picks.push({ ex: findExercise('dips', list)!, why: 'why_staple' }); dipExtra--; }
        const used = () => [...picks.map((p) => p.ex), ...exercises.map((x) => findExercise(x.exerciseId, list)!).filter(Boolean)];
        const pool = list.filter((e) => e.primary === m && can(e) && !used().some((u) => u.id === e.id) && !(e.id === 'pullup' || e.id === 'dips'))
          .sort((a, b) => score(b) - score(a));
        const nEx = SMALL.has(m) ? (perSession >= 5 ? 2 : 1) : perSession >= 9 ? 3 : 2;
        const compound = pool.find((e) => e.category === 'compound' && !used().some((u) => samePattern(u, e)));
        if (picks.length < nEx && compound && !picks.some((p) => p.ex.category === 'compound')) picks.push({ ex: compound, why: score(compound) >= 2 ? 'why_history' : 'why_mainCompound' });
        for (const e of pool) {
          if (picks.length >= nEx) break;
          if (used().some((u) => u.id === e.id || samePattern(u, e))) continue; // no near-duplicates (e.g. two squat variants)
          const why = score(e) >= 2 ? 'why_history' : e.category === 'compound' ? 'why_secondAngle' : 'why_isolation';
          picks.push({ ex: e, why });
        }
        // distribute the session's sets over the picks (2–4 each)
        let left = perSession;
        picks.forEach((p, i) => {
          const sets = Math.max(2, Math.min(4, Math.round(left / (picks.length - i))));
          left -= sets;
          const heavy = p.ex.category === 'compound' && !p.ex.bodyweight;
          exercises.push({
            exerciseId: p.ex.id, sets, repMin: p.ex.reps[0], repMax: p.ex.reps[1], restSec: p.ex.restSec,
            targetRir: heavy ? 2 : 1, why: p.why
          });
        });
      }
      exercises.forEach((x) => usedEarlier.add(x.exerciseId));
      // whole-session cap: trim isolation sets first, never below 2 per exercise
      const MAX_DAY = 24;
      let total = exercises.reduce((a, x) => a + x.sets, 0);
      for (let guard = 0; total > MAX_DAY && guard < 50; guard++) {
        const cand = [...exercises].filter((x) => x.sets > 2).sort((a, b) => (findExercise(a.exerciseId, list)?.category === 'isolation' ? -1 : 1) - (findExercise(b.exerciseId, list)?.category === 'isolation' ? -1 : 1) || b.sets - a.sets)[0];
        if (!cand) break;
        cand.sets--; total--;
      }
      // order: compounds first (staples lead their muscle), isolation last
      exercises.sort((a, b) => rank(a) - rank(b));
    }
    return { id: uid(), name: d.name, weekday: d.weekday, muscles: d.muscles, rest: d.rest, exercises };
    function rank(x: ProgramExercise) { const e = findExercise(x.exerciseId, list); return e?.category === 'compound' ? (x.why === 'why_staple' ? 1 : 0) : 2; }
  });
  const now = Date.now();
  return { id: uid(), name, days, createdAt: now, updatedAt: now };
}

/** Weekly planned sets per muscle (primary 1, secondary 0.5) for a program. */
export function plannedSetsPerMuscle(p: Program, list: Exercise[] = EXERCISES): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const d of p.days) if (!d.rest) for (const x of d.exercises) {
    const e = findExercise(x.exerciseId, list);
    if (!e) continue;
    out[e.primary] += x.sets;
    for (const s of e.secondary) out[s] += x.sets * 0.5;
  }
  return out;
}

/* ------------------------------------------------------------------ storage */

export async function listPrograms(): Promise<Program[]> {
  return (await db.kv.where('key').startsWith(PROGRAM_PREFIX).toArray()).map((r) => r.value as Program).filter((p) => p && p.id)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function validateProgram(p: Program): string[] {
  const errs: string[] = [];
  if (!p.name.trim()) errs.push('name');
  if (!p.days.length || p.days.length > 14) errs.push('days');
  for (const d of p.days) for (const x of d.exercises) {
    if (!(x.sets >= 1 && x.sets <= 10)) errs.push('sets');
    if (!(x.repMin >= 1 && x.repMax >= x.repMin && x.repMax <= 50)) errs.push('reps');
    if (!(x.restSec >= 0 && x.restSec <= 600)) errs.push('rest');
  }
  return [...new Set(errs)];
}

export async function saveProgram(p: Program, makeActive = false): Promise<Program> {
  const errs = validateProgram(p);
  if (errs.length) throw new Error('Invalid program: ' + errs.join(', '));
  const rec = { ...p, updatedAt: Date.now() };
  await kvSet(PROGRAM_PREFIX + rec.id, rec);
  if (makeActive) await kvSet(ACTIVE_PROGRAM_KEY, rec.id);
  return rec;
}

/** Deletes a program only (never workout history). The active program cannot be deleted. */
export async function deleteProgram(id: string) {
  const active = (await db.kv.get(ACTIVE_PROGRAM_KEY))?.value;
  if (active === id) throw new Error('active program');
  await kvDelete(PROGRAM_PREFIX + id);
}

/** The active program; on first use the owner's split is generated and saved once (it can then be edited). */
export async function getActiveProgram(): Promise<Program> {
  const id = (await db.kv.get(ACTIVE_PROGRAM_KEY))?.value as string | undefined;
  const all = await listPrograms();
  const found = all.find((p) => p.id === id) ?? all[0];
  if (found) return found;
  return saveProgram(generateProgram(DEFAULT_GENERATOR), true);
}

export function dayFor(p: Program, date: string): ProgramDay | undefined {
  return p.days.find((d) => d.weekday === weekday(date));
}

export async function listWorkouts(): Promise<WorkoutSession[]> {
  return (await db.kv.where('key').startsWith(WORKOUT_PREFIX).toArray()).map((r) => r.value as WorkoutSession).filter((w) => w && w.id && w.date)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
}

export function validateSession(w: WorkoutSession): string[] {
  const errs: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) errs.push('date');
  for (const x of w.exercises) for (const s of x.sets) {
    if (s.reps !== null && !(s.reps >= 0 && s.reps <= 200)) errs.push('reps');
    if (s.weightKg !== null && !(s.weightKg >= 0 && s.weightKg <= 700)) errs.push('weight');
    if (s.rir != null && !(s.rir >= 0 && s.rir <= 10)) errs.push('rir');
    if (s.rpe != null && !(s.rpe >= 1 && s.rpe <= 10)) errs.push('rpe');
  }
  return [...new Set(errs)];
}

export async function saveWorkout(w: WorkoutSession): Promise<WorkoutSession> {
  const errs = validateSession(w);
  if (errs.length) throw new Error('Invalid workout: ' + errs.join(', '));
  const rec = JSON.parse(JSON.stringify({ ...w, updatedAt: Date.now() })) as WorkoutSession;
  await kvSet(WORKOUT_PREFIX + rec.id, rec);
  return rec;
}

/** Deletes one workout session (only that record). */
export async function deleteWorkout(id: string) {
  await kvDelete(WORKOUT_PREFIX + id);
}

export async function saveRecovery(r: Omit<RecoveryLog, 'updatedAt'>): Promise<RecoveryLog> {
  const bad = (v: number | null | undefined, lo: number, hi: number) => v != null && !(v >= lo && v <= hi);
  if (bad(r.sleepH, 0, 16) || bad(r.soreness, 1, 5) || bad(r.energy, 1, 5) || bad(r.fatigue, 1, 5)) throw new Error('Invalid recovery log');
  const rec = { ...r, updatedAt: Date.now() };
  await kvSet(RECOVERY_PREFIX + r.date, rec);
  return rec;
}

export async function listRecovery(): Promise<RecoveryLog[]> {
  return (await db.kv.where('key').startsWith(RECOVERY_PREFIX).toArray()).map((r) => r.value as RecoveryLog).sort((a, b) => a.date.localeCompare(b.date));
}

/** Completed working sets (done, with reps). */
export const doneSets = (x: LoggedExercise) => x.sets.filter((s) => s.done && (s.reps ?? 0) > 0);
export const isCompleted = (w: WorkoutSession) => w.exercises.some((x) => x.status === 'done' || doneSets(x).length > 0);

/** Session duration in minutes: start→end (capped at 3 h), else ≈ 2.5 min per completed set. */
export function sessionMinutes(w: WorkoutSession): number {
  if (w.endedAt && w.endedAt > w.startedAt) return Math.min(180, Math.round((w.endedAt - w.startedAt) / 60000));
  return Math.round(w.exercises.reduce((a, x) => a + doneSets(x).length, 0) * 2.5);
}

export const weekDatesFrom = (end = today(), n = 7) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));

const DEFAULT_NAMES = new Set(OWNER_SPLIT.map((d) => d.name).concat(['New day']));
/** Display name: the generated English default names are shown translated (from the day's muscles); user names as typed. */
export function dayLabel(d: Pick<ProgramDay, 'name' | 'muscles' | 'rest'>, t: (k: string) => string): string {
  if (!DEFAULT_NAMES.has(d.name)) return d.name;
  if (d.rest) return t('wk_rest');
  if (LEGS.every((m) => d.muscles.includes(m)) && d.muscles.length === LEGS.length) return t('wk_legs');
  return d.muscles.map((m) => t('mus_' + m)).join(' + ');
}
