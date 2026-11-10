/**
 * Training intelligence — deterministic, rule-based logic that runs on the device (no AI service, no cost).
 * Every answer names the data it used and a confidence level; nothing is changed without the user's approval.
 *
 *  - Strength: estimated 1RM per set (Epley: w × (1 + reps/30), sets ≤ 12 reps), best set, volume (load × reps;
 *    body-weight exercises use body weight + added load), personal records.
 *  - Trend per exercise: mean e1RM of the last 3 sessions vs the 3 before → improving (> +2 %), declining (< −2 %), stable.
 *  - Progression (double progression): increase load only when EVERY prescribed set reached the top of the rep range
 *    with reps in reserve (RIR ≥ 1, or RPE ≤ 9); if RIR/RPE were not recorded the advice is given with medium confidence.
 *    Reps within range → add reps; below range → keep load, or reduce ~5 % after two such sessions; long stall → swap.
 */
import { addDays, today, weekday } from './dates';
import { findExercise, MUSCLES, type Exercise, type Muscle } from './exercises';
import { tdeeOf } from './goals';
import { buildPeriod, progressEstimate, rollingWeightAverage, type DataBundle } from './reports';
import { totalsFor, type CardioSession } from './cardio';
import { fitnessOf } from './energy';
import {
  dayFor, doneSets, isCompleted, SETS_RANGE, type LoggedExercise, type Program, type ProgramExercise, type RecoveryLog, type SetLog, type WorkoutSession
} from './workouts';
import { uid } from './repo';

export type Confidence = 'high' | 'medium' | 'low';
export interface Line { key: string; params?: Record<string, string | number> }

/* ------------------------------------------------------------------ strength analytics */

export const e1rm = (w: number, reps: number) => (reps <= 0 ? 0 : reps === 1 ? w : w * (1 + Math.min(reps, 12) / 30));
const load = (s: SetLog, ex: Exercise | undefined, bw: number) => (s.weightKg ?? 0) + (ex?.bodyweight ? bw : 0);

export interface ExercisePoint { date: string; sessionId: string; bestE1rm: number; topWeight: number; topReps: number; totalReps: number; volume: number; sets: SetLog[] }

export function exerciseHistory(exerciseId: string, workouts: WorkoutSession[], list?: Exercise[]): ExercisePoint[] {
  const ex = findExercise(exerciseId, list);
  const pts: ExercisePoint[] = [];
  for (const w of workouts) for (const x of w.exercises) {
    if (x.exerciseId !== exerciseId) continue;
    const sets = doneSets(x);
    if (!sets.length) continue;
    let best = 0, topW = 0, topR = 0, vol = 0, reps = 0;
    for (const s of sets) {
      const l = load(s, ex, w.bodyWeightKg);
      const r = s.reps ?? 0;
      best = Math.max(best, e1rm(l, r));
      if ((s.weightKg ?? 0) > topW || ((s.weightKg ?? 0) === topW && r > topR)) { topW = s.weightKg ?? 0; topR = r; }
      vol += l * r;
      reps += r;
    }
    pts.push({ date: w.date, sessionId: w.id, bestE1rm: Math.round(best * 10) / 10, topWeight: topW, topReps: topR, totalReps: reps, volume: Math.round(vol), sets });
  }
  return pts.sort((a, b) => a.date.localeCompare(b.date));
}

export interface Records { bestE1rm: number; maxWeight: number; maxReps: number; maxVolume: number; dates: Record<'bestE1rm' | 'maxWeight' | 'maxReps' | 'maxVolume', string> }
export function personalRecords(h: ExercisePoint[]): Records | null {
  if (!h.length) return null;
  const pick = (f: (p: ExercisePoint) => number) => h.reduce((a, b) => (f(b) > f(a) ? b : a));
  const e = pick((p) => p.bestE1rm), w = pick((p) => p.topWeight), r = pick((p) => Math.max(...p.sets.map((s) => s.reps ?? 0))), v = pick((p) => p.volume);
  return {
    bestE1rm: e.bestE1rm, maxWeight: w.topWeight, maxReps: Math.max(...r.sets.map((s) => s.reps ?? 0)), maxVolume: v.volume,
    dates: { bestE1rm: e.date, maxWeight: w.date, maxReps: r.date, maxVolume: v.date }
  };
}

export type Trend = 'improving' | 'stable' | 'declining' | 'insufficient';
export function exerciseTrend(h: ExercisePoint[]): { trend: Trend; changePct: number | null } {
  if (h.length < 4) return { trend: 'insufficient', changePct: null };
  const last = h.slice(-3), prev = h.slice(-6, -3);
  const m = (a: ExercisePoint[]) => a.reduce((s, p) => s + p.bestE1rm, 0) / a.length;
  const pct = ((m(last) - m(prev)) / m(prev)) * 100;
  return { trend: pct > 2 ? 'improving' : pct < -2 ? 'declining' : 'stable', changePct: Math.round(pct * 10) / 10 };
}

/** New PRs set in a date range (best e1RM or max load above everything before the range). */
export function prsInRange(exerciseIds: string[], workouts: WorkoutSession[], from: string, to: string, list?: Exercise[]): { exerciseId: string; date: string; e1rm: number }[] {
  const out: { exerciseId: string; date: string; e1rm: number }[] = [];
  for (const id of exerciseIds) {
    const h = exerciseHistory(id, workouts, list);
    let best = 0;
    for (const p of h) {
      if (p.date >= from && p.date <= to && p.bestE1rm > best && best > 0) out.push({ exerciseId: id, date: p.date, e1rm: p.bestE1rm });
      best = Math.max(best, p.bestE1rm);
    }
  }
  return out;
}

/** Completed hard sets per muscle in the given dates (primary 1, secondary 0.5). */
export function setsPerMuscle(workouts: WorkoutSession[], dates: string[], list?: Exercise[]): Record<Muscle, number> {
  const set = new Set(dates);
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const w of workouts) if (set.has(w.date)) for (const x of w.exercises) {
    const e = findExercise(x.exerciseId, list);
    const n = doneSets(x).length;
    if (!e || !n) continue;
    out[e.primary] += n;
    for (const s of e.secondary) out[s] += n * 0.5;
  }
  return out;
}

export function trainingStats(workouts: WorkoutSession[], dates: string[], program?: Program, list?: Exercise[]) {
  const set = new Set(dates);
  const done = workouts.filter((w) => set.has(w.date) && isCompleted(w));
  const planned = program ? dates.filter((d) => { const day = dayFor(program, d); return day && !day.rest; }).length : 0;
  const sets = done.reduce((a, w) => a + w.exercises.reduce((b, x) => b + doneSets(x).length, 0), 0);
  const volume = done.reduce((a, w) => a + w.exercises.reduce((b, x) => {
    const e = findExercise(x.exerciseId, list);
    return b + doneSets(x).reduce((c, s) => c + load(s, e, w.bodyWeightKg) * (s.reps ?? 0), 0);
  }, 0), 0);
  return {
    sessions: done.length, planned, consistencyPct: planned ? Math.min(100, Math.round((done.length / planned) * 100)) : null,
    sets, volume: Math.round(volume), activeDays: new Set(done.map((w) => w.date)).size
  };
}

/* ------------------------------------------------------------------ progression */

export type ProgressAction = 'start' | 'increase_weight' | 'increase_reps' | 'maintain' | 'reduce' | 'replace';
export interface Progression { action: ProgressAction; weightKg: number | null; reps: [number, number]; confidence: Confidence; reasons: Line[]; alternatives?: string[] }

const round05 = (x: number) => Math.round(x * 2) / 2;
export function loadStep(e: Exercise | undefined, w: number): number {
  if (!e) return 2.5;
  if (e.lower && e.category === 'compound') return w >= 100 ? 5 : 2.5;
  return w < 20 ? 1 : 2.5;
}

export function progression(target: Pick<ProgramExercise, 'sets' | 'repMin' | 'repMax'>, h: ExercisePoint[], e: Exercise | undefined, recoveryPoor = false): Progression {
  const reps: [number, number] = [target.repMin, target.repMax];
  const last = h[h.length - 1];
  if (!last) return { action: 'start', weightKg: null, reps, confidence: 'low', reasons: [{ key: 'pg_start', params: { min: target.repMin, max: target.repMax } }] };
  const w = last.topWeight;
  const sets = last.sets;
  const enoughSets = sets.length >= target.sets;
  const allTop = enoughSets && sets.slice(0, target.sets).every((s) => (s.reps ?? 0) >= target.repMax);
  const rirs = sets.map((s) => s.rir).filter((x): x is number => x != null);
  const rpes = sets.map((s) => s.rpe).filter((x): x is number => x != null);
  const effortKnown = rirs.length === sets.length || rpes.length === sets.length;
  const reserve = rirs.length === sets.length ? rirs.every((r) => r >= 1) : rpes.length === sets.length ? rpes.every((r) => r <= 9) : null;
  const trend = exerciseTrend(h);
  const lastLine = { key: 'pg_last', params: { sets: sets.map((s) => `${s.weightKg ?? 0}×${s.reps ?? 0}${s.rir != null ? ` @${s.rir}` : ''}`).join(', ') } };

  if (trend.trend === 'declining' && (recoveryPoor || (trend.changePct ?? 0) < -5)) {
    return { action: 'reduce', weightKg: round05(w * 0.9), reps, confidence: 'medium', reasons: [lastLine, { key: recoveryPoor ? 'pg_declineRecovery' : 'pg_decline', params: { pct: trend.changePct ?? 0 } }] };
  }
  // stalled: ≥ 6 sessions and the best of the last 3 is not above the best before
  if (h.length >= 6) {
    const bestRecent = Math.max(...h.slice(-3).map((p) => p.bestE1rm));
    const bestBefore = Math.max(...h.slice(0, -3).map((p) => p.bestE1rm));
    if (bestRecent <= bestBefore && !allTop) {
      return { action: 'replace', weightKg: w, reps, confidence: 'medium', reasons: [lastLine, { key: 'pg_stall', params: { n: h.length } }], alternatives: e?.alternatives.slice(0, 3) };
    }
  }
  if (allTop && reserve !== false) {
    const step = e?.bodyweight && w === 0 ? 2.5 : loadStep(e, w);
    return {
      action: 'increase_weight', weightKg: round05(w + step), reps, confidence: effortKnown ? 'high' : 'medium',
      reasons: [lastLine, { key: 'pg_allTop', params: { max: target.repMax, sets: target.sets } }, effortKnown ? { key: 'pg_reserveOk' } : { key: 'pg_reserveUnknown' }, { key: 'pg_step', params: { step } }]
    };
  }
  if (allTop && reserve === false) {
    return { action: 'maintain', weightKg: w, reps, confidence: 'high', reasons: [lastLine, { key: 'pg_noReserve' }] };
  }
  const work = sets.slice(0, target.sets);
  if (enoughSets && work.every((s) => (s.reps ?? 0) >= target.repMin)) {
    return { action: 'increase_reps', weightKg: w, reps, confidence: effortKnown ? 'high' : 'medium', reasons: [lastLine, { key: 'pg_addReps', params: { max: target.repMax } }] };
  }
  const prev = h[h.length - 2];
  const prevBelow = prev && prev.topWeight === w && prev.sets.slice(0, target.sets).some((s) => (s.reps ?? 0) < target.repMin);
  if (prevBelow) return { action: 'reduce', weightKg: round05(w * 0.95), reps, confidence: 'medium', reasons: [lastLine, { key: 'pg_belowTwice', params: { min: target.repMin } }] };
  return { action: 'maintain', weightKg: w, reps, confidence: enoughSets ? 'medium' : 'low', reasons: [lastLine, { key: enoughSets ? 'pg_belowOnce' : 'pg_fewSets', params: { min: target.repMin, sets: target.sets } }] };
}

/** A new session for a program day, prefilled from the progression advice (the user edits freely). */
export function startSession(date: string, program: Program, dayId: string, workouts: WorkoutSession[], bodyWeightKg: number, list?: Exercise[], recoveryPoor = false): WorkoutSession {
  const day = program.days.find((d) => d.id === dayId)!;
  const exercises: LoggedExercise[] = day.exercises.map((x) => {
    const e = findExercise(x.exerciseId, list);
    const p = progression(x, exerciseHistory(x.exerciseId, workouts, list), e, recoveryPoor);
    const reps = p.action === 'increase_reps' ? null : x.repMin;
    return {
      exerciseId: x.exerciseId, name: e?.nameEn ?? x.exerciseId, status: 'pending', restSec: x.restSec,
      target: { sets: x.sets, repMin: x.repMin, repMax: x.repMax, targetRir: x.targetRir },
      sets: Array.from({ length: x.sets }, () => ({ reps, weightKg: p.weightKg, rir: null, rpe: null, done: false }))
    };
  });
  const now = Date.now();
  return { id: uid(), date, programId: program.id, dayId, name: day.name, muscles: day.muscles, startedAt: now, bodyWeightKg, exercises, updatedAt: now };
}

/* ------------------------------------------------------------------ recovery */

export interface Indicator { key: string; level: 'good' | 'info' | 'warn'; params?: Record<string, string | number> }

export interface CoachContext {
  date?: string;
  data: DataBundle;
  workouts: WorkoutSession[];
  program: Program;
  cardio: CardioSession[];
  recovery: RecoveryLog[];
  exercises?: Exercise[];
}

export function recoveryIndicators(c: CoachContext): Indicator[] {
  const date = c.date ?? today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
  const logs = c.recovery.filter((r) => r.date > addDays(date, -7) && r.date <= date);
  const avg = (f: (r: RecoveryLog) => number | null | undefined) => { const v = logs.map(f).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const out: Indicator[] = [];
  const sleep = avg((r) => r.sleepH), sore = avg((r) => r.soreness), energy = avg((r) => r.energy), fatigue = avg((r) => r.fatigue);
  if (!logs.length) out.push({ key: 'rc_noLogs', level: 'info' });
  if (sleep !== null) out.push(sleep < 6.5 ? { key: 'rc_sleepLow', level: 'warn', params: { h: round1(sleep) } } : { key: 'rc_sleepOk', level: 'good', params: { h: round1(sleep) } });
  if (sore !== null && sore >= 4) out.push({ key: 'rc_soreHigh', level: 'warn', params: { v: round1(sore) } });
  if (energy !== null && energy <= 2) out.push({ key: 'rc_energyLow', level: 'warn', params: { v: round1(energy) } });
  if (fatigue !== null && fatigue >= 4) out.push({ key: 'rc_fatigueHigh', level: 'warn', params: { v: round1(fatigue) } });
  // consecutive training days up to today
  const trained = new Set(c.workouts.filter(isCompleted).map((w) => w.date));
  let streak = 0; for (let d = date; trained.has(d); d = addDays(d, -1)) streak++;
  if (streak >= 7) out.push({ key: 'rc_noRestDay', level: 'warn', params: { n: streak } });
  const sets = setsPerMuscle(c.workouts, week, c.exercises);
  const fit = fitnessOf(c.data.settings);
  const maxSets = Math.max(SETS_RANGE.max, (fit.setsPerMuscle ?? 14) + 6);
  const high = MUSCLES.filter((m) => sets[m] > maxSets);
  if (high.length) out.push({ key: 'rc_volumeHigh', level: 'warn', params: { list: high.join(', '), max: maxSets } });
  const ids = [...new Set(c.workouts.flatMap((w) => w.exercises.map((x) => x.exerciseId)))];
  const declining = ids.filter((id) => exerciseTrend(exerciseHistory(id, c.workouts, c.exercises)).trend === 'declining');
  if (declining.length >= 2) out.push({ key: 'rc_perfDown', level: 'warn', params: { n: declining.length } });
  const plan = fit.cardioSessionsPerWeek * fit.cardioMinPerSession;
  const cardioMin = totalsFor(c.cardio, week).minutes;
  if (plan > 0 && cardioMin > plan * 2 && declining.some((id) => findExercise(id, c.exercises)?.lower)) out.push({ key: 'rc_cardioInterference', level: 'warn', params: { min: cardioMin, plan } });
  if (!out.some((x) => x.level === 'warn') && logs.length) out.push({ key: 'rc_allOk', level: 'good' });
  return out;
}
const round1 = (x: number) => Math.round(x * 10) / 10;
export const recoveryPoor = (ind: Indicator[]) => ind.filter((i) => i.level === 'warn' && i.key !== 'rc_volumeHigh').length >= 2;

/* ------------------------------------------------------------------ nutrition × training */

export function nutritionForTraining(c: CoachContext): Indicator[] {
  const date = c.date ?? today();
  const s = c.data.settings, p = s.profile;
  const out: Indicator[] = [];
  const period = buildPeriod('week', '', Array.from({ length: 14 }, (_, i) => addDays(date, i - 13)), c.data, date);
  const w = rollingWeightAverage(c.data.body, date) ?? p.currentWeight;
  const tdee = tdeeOf({ ...p, currentWeight: w });
  const target = s.targets.training.kcal;
  const deficitPct = Math.round((1 - target / tdee) * 100);
  const loss = ['fat_loss', 'fat_loss_preserve', 'recomp'].includes(p.goalType);
  out.push({ key: 'nt_target', level: loss && deficitPct >= 10 && deficitPct <= 25 ? 'good' : 'info', params: { kcal: target, tdee, pct: deficitPct } });
  const est = progressEstimate(c.data.body, p.targetWeight, date);
  if (est.ratePctPerWeek === null) out.push({ key: 'nt_rateUnknown', level: 'info' });
  else if (loss && est.ratePctPerWeek < -1) out.push({ key: 'nt_rateFast', level: 'warn', params: { pct: est.ratePctPerWeek } });
  else if (loss && est.ratePctPerWeek > -0.25) out.push({ key: 'nt_rateSlow', level: 'info', params: { pct: est.ratePctPerWeek } });
  else out.push({ key: 'nt_rateOk', level: 'good', params: { pct: est.ratePctPerWeek } });
  if (period.averages && period.completeDays >= 3) {
    const pk = period.averages.protein / w, ck = period.averages.carbs / w;
    out.push(pk >= 1.8 ? { key: 'nt_proteinOk', level: 'good', params: { v: round1(pk) } } : { key: 'nt_proteinLow', level: 'warn', params: { v: round1(pk) } });
    out.push(ck < 2 ? { key: 'nt_carbsLow', level: 'info', params: { v: round1(ck) } } : { key: 'nt_carbsOk', level: 'good', params: { v: round1(ck) } });
  } else out.push({ key: 'nt_needLogs', level: 'info', params: { n: period.completeDays } });
  return out;
}

/* ------------------------------------------------------------------ coach Q&A */

export const QUESTIONS = ['today', 'weight_today', 'progressing', 'increase', 'decline_why', 'too_many_sets', 'volume_enough', 'attention', 'recovery_day'] as const;
export type Question = (typeof QUESTIONS)[number];
export interface Answer { lines: Line[]; confidence: Confidence; basedOn: Line }

export function ask(q: Question, c: CoachContext): Answer {
  const date = c.date ?? today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
  const done = c.workouts.filter(isCompleted);
  const basedOn: Line = { key: 'cq_basedOn', params: { w: done.length, r: c.recovery.length, d: c.data.entries.length ? new Set(c.data.entries.map((e) => e.date)).size : 0 } };
  const day = dayFor(c.program, date);
  const ids = [...new Set(c.program.days.flatMap((d) => d.exercises.map((x) => x.exerciseId)))];
  const target = (id: string) => c.program.days.flatMap((d) => d.exercises).find((x) => x.exerciseId === id);
  const name = (id: string) => findExercise(id, c.exercises)?.nameEn ?? id;
  const ind = recoveryIndicators(c);
  const poor = recoveryPoor(ind);
  const conf = (n: number): Confidence => (n >= 6 ? 'high' : n >= 3 ? 'medium' : 'low');
  const lines: Line[] = [];
  switch (q) {
    case 'today': {
      if (!day || day.rest) lines.push({ key: 'cq_restToday' });
      else {
        lines.push({ key: 'cq_todayIs', params: { name: day.name, muscles: day.muscles.join(','), n: day.exercises.length } });
        if (done.some((w) => w.date === date)) lines.push({ key: 'cq_alreadyDone' });
        if (poor) lines.push({ key: 'cq_recoveryCaution' });
      }
      return { lines, confidence: 'high', basedOn };
    }
    case 'weight_today': {
      if (!day || day.rest) return { lines: [{ key: 'cq_restToday' }], confidence: 'high', basedOn };
      let n = 0;
      for (const x of day.exercises) {
        const h = exerciseHistory(x.exerciseId, c.workouts, c.exercises);
        const pg = progression(x, h, findExercise(x.exerciseId, c.exercises), poor);
        n += h.length;
        lines.push({ key: pg.weightKg === null ? 'cq_weightStart' : 'cq_weightLine', params: { ex: x.exerciseId, w: pg.weightKg ?? '', min: x.repMin, max: x.repMax, action: pg.action } });
      }
      return { lines, confidence: conf(n / Math.max(1, day.exercises.length)), basedOn };
    }
    case 'progressing':
    case 'decline_why': {
      const tr = ids.map((id) => ({ id, ...exerciseTrend(exerciseHistory(id, c.workouts, c.exercises)) })).filter((x) => x.trend !== 'insufficient');
      if (!tr.length) return { lines: [{ key: 'cq_needSessions' }], confidence: 'low', basedOn };
      const up = tr.filter((x) => x.trend === 'improving'), down = tr.filter((x) => x.trend === 'declining');
      if (q === 'progressing') {
        lines.push({ key: 'cq_trendSummary', params: { up: up.length, flat: tr.length - up.length - down.length, down: down.length } });
        for (const x of up.slice(0, 3)) lines.push({ key: 'cq_upLine', params: { ex: x.id, pct: x.changePct ?? 0 } });
        for (const x of down.slice(0, 3)) lines.push({ key: 'cq_downLine', params: { ex: x.id, pct: x.changePct ?? 0 } });
      } else {
        if (!down.length) lines.push({ key: 'cq_noDecline' });
        else {
          lines.push({ key: 'cq_declineList', params: { list: down.map((x) => name(x.id)).join(', ') } });
          // possible factors that the data shows (never a diagnosis)
          for (const i of [...ind, ...nutritionForTraining(c)]) if (i.level === 'warn') lines.push({ key: 'cq_factor', params: { f: i.key } });
          if (lines.length === 1) lines.push({ key: 'cq_noFactor' });
        }
      }
      return { lines, confidence: conf(Math.min(...tr.map(() => done.length))), basedOn };
    }
    case 'increase': {
      for (const id of ids) {
        const t = target(id)!;
        const pg = progression(t, exerciseHistory(id, c.workouts, c.exercises), findExercise(id, c.exercises), poor);
        if (pg.action === 'increase_weight') lines.push({ key: 'cq_increaseLine', params: { ex: id, w: pg.weightKg ?? 0, conf: pg.confidence } });
      }
      if (!lines.length) lines.push({ key: done.length ? 'cq_noIncrease' : 'cq_needSessions' });
      return { lines, confidence: conf(done.length), basedOn };
    }
    case 'too_many_sets':
    case 'volume_enough':
    case 'attention': {
      if (!done.length) return { lines: [{ key: 'cq_needSessions' }], confidence: 'low', basedOn };
      const sets = setsPerMuscle(c.workouts, week, c.exercises);
      const goal = fitnessOf(c.data.settings).setsPerMuscle ?? 14;
      const trainedMuscles = MUSCLES.filter((m) => m !== 'forearms');
      const over = trainedMuscles.filter((m) => sets[m] > Math.max(SETS_RANGE.max, goal + 6));
      const under = trainedMuscles.filter((m) => sets[m] < Math.min(SETS_RANGE.min, goal) * 0.6);
      if (q === 'too_many_sets') lines.push(over.length ? { key: 'cq_over', params: { list: over.map((m) => `${m} ${sets[m]}`).join(', '), max: SETS_RANGE.max } } : { key: 'cq_notOver', params: { max: SETS_RANGE.max } });
      else if (q === 'volume_enough') lines.push(under.length ? { key: 'cq_under', params: { list: under.map((m) => `${m} ${sets[m]}`).join(', '), goal } } : { key: 'cq_enough', params: { goal } });
      else {
        const ranked = [...trainedMuscles].sort((a, b) => sets[a] / goal - sets[b] / goal).slice(0, 3);
        lines.push({ key: 'cq_attention', params: { list: ranked.map((m) => `${m} ${sets[m]}/${goal}`).join(', ') } });
      }
      const fullWeek = done.some((w) => w.date <= addDays(date, -6));
      return { lines, confidence: fullWeek ? 'high' : 'medium', basedOn };
    }
    case 'recovery_day': {
      const warns = ind.filter((i) => i.level === 'warn');
      lines.push(warns.length >= 2 ? { key: 'cq_extraRestYes', params: { n: warns.length } } : warns.length === 1 ? { key: 'cq_extraRestMaybe' } : { key: 'cq_extraRestNo' });
      for (const i of warns) lines.push({ key: 'cq_factor', params: { f: i.key } });
      return { lines, confidence: c.recovery.filter((r) => r.date > addDays(date, -7)).length >= 3 ? 'high' : 'low', basedOn };
    }
  }
}

/* ------------------------------------------------------------------ weekly review */

export interface WeeklyReview { from: string; to: string; observations: Line[]; recommendations: Line[] }

export function weeklyReview(c: CoachContext, end = c.date ?? today()): WeeklyReview {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  const prevDates = dates.map((d) => addDays(d, -7));
  const s = c.data.settings;
  const obs: Line[] = [], rec: Line[] = [];
  const nut = buildPeriod('week', '', dates, c.data, end);
  // 1 nutrition adherence
  obs.push(nut.completeDays ? { key: 'wr_nutrition', params: { c: nut.completeDays, inRange: nut.caloriesInRangeDays, protein: nut.proteinHitDays, kcal: Math.round(nut.averages?.kcal ?? 0), prot: Math.round(nut.averages?.protein ?? 0) } } : { key: 'wr_nutritionNone' });
  // 2 weight trend
  const wNow = rollingWeightAverage(c.data.body, end), wPrev = rollingWeightAverage(c.data.body, addDays(end, -7));
  obs.push(wNow !== null && wPrev !== null ? { key: 'wr_weight', params: { now: wNow, d: Math.round((wNow - wPrev) * 100) / 100 } } : { key: 'wr_weightNone' });
  // 3 waist
  const waists = c.data.body.filter((b) => b.waist && !b.deleted && b.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const wa = waists.filter((b) => b.date >= dates[0]).pop(), wb = waists.filter((b) => b.date < dates[0]).pop();
  obs.push(wa && wb ? { key: 'wr_waist', params: { now: wa.waist!, d: Math.round((wa.waist! - wb.waist!) * 10) / 10 } } : { key: 'wr_waistNone' });
  // 4 strength
  const ids = [...new Set(c.workouts.flatMap((w) => w.exercises.map((x) => x.exerciseId)))];
  const prs = prsInRange(ids, c.workouts, dates[0], end, c.exercises);
  const tr = ids.map((id) => exerciseTrend(exerciseHistory(id, c.workouts, c.exercises)).trend);
  obs.push({ key: 'wr_strength', params: { prs: prs.length, up: tr.filter((x) => x === 'improving').length, down: tr.filter((x) => x === 'declining').length } });
  // 5 consistency
  const st = trainingStats(c.workouts, dates, c.program, c.exercises);
  obs.push({ key: 'wr_training', params: { done: st.sessions, planned: st.planned, sets: st.sets } });
  // 6 cardio
  const fit = fitnessOf(s);
  const cw = totalsFor(c.cardio, dates), cp = totalsFor(c.cardio, prevDates);
  obs.push({ key: 'wr_cardio', params: { min: cw.minutes, goal: fit.cardioSessionsPerWeek * fit.cardioMinPerSession, sessions: cw.sessions, prev: cp.minutes } });
  // 7 recovery
  const ind = recoveryIndicators({ ...c, date: end });
  obs.push({ key: 'wr_recovery', params: { warn: ind.filter((i) => i.level === 'warn').length } });
  // 8 goals
  const p = s.profile;
  const cur = wNow ?? p.currentWeight;
  obs.push({ key: 'wr_goal', params: { cur, target: p.targetWeight, left: Math.round(Math.abs(cur - p.targetWeight) * 10) / 10 } });

  // recommendations (suggestions only)
  if (nut.completeDays < 5) rec.push({ key: 'wrr_logMore' });
  else if (nut.completeDays && nut.proteinHitDays / nut.completeDays < 0.7) rec.push({ key: 'wrr_protein' });
  if (st.planned && st.sessions < st.planned) rec.push({ key: 'wrr_sessions', params: { n: st.planned - st.sessions } });
  const ready = c.program.days.flatMap((d) => d.exercises).filter((x, i, a) => a.findIndex((y) => y.exerciseId === x.exerciseId) === i)
    .map((x) => ({ x, pg: progression(x, exerciseHistory(x.exerciseId, c.workouts, c.exercises), findExercise(x.exerciseId, c.exercises), recoveryPoor(ind)) }))
    .filter((r) => r.pg.action === 'increase_weight');
  if (ready.length) rec.push({ key: 'wrr_increase', params: { n: ready.length } });
  if (recoveryPoor(ind)) rec.push({ key: 'wrr_recovery' });
  for (const i of ind) if (i.key === 'rc_volumeHigh') rec.push({ key: 'wrr_volume', params: i.params });
  const nt = nutritionForTraining({ ...c, date: end });
  if (nt.some((i) => i.key === 'nt_rateFast')) rec.push({ key: 'wrr_rateFast' });
  if (nt.some((i) => i.key === 'nt_rateSlow') && nut.completeDays >= 5) rec.push({ key: 'wrr_rateSlow' });
  if (cw.minutes < fit.cardioSessionsPerWeek * fit.cardioMinPerSession) rec.push({ key: 'wrr_cardio' });
  if (!rec.length) rec.push({ key: 'wrr_keep' });
  return { from: dates[0], to: end, observations: obs, recommendations: rec };
}

/** The last completed week (ends the day before the week start setting) — the review "at the end of each week". */
export function lastWeekEnd(date: string, weekStartsOn: number): string {
  let d = addDays(date, -1);
  while ((weekday(d) + 1) % 7 !== weekStartsOn) d = addDays(d, -1);
  return d;
}
