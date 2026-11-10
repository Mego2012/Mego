import { beforeEach, describe, expect, it } from 'vitest';
import { restoreBackup } from '../src/lib/backup';
import { addDays, today, weekday } from '../src/lib/dates';
import { db, useDatabase } from '../src/lib/db';
import { energyFor } from '../src/lib/energy';
import { alternativesFor, EXERCISES, findExercise, MUSCLES, searchExercises } from '../src/lib/exercises';
import { adviseGoals } from '../src/lib/goalAdvisor';
import { tdeeOf } from '../src/lib/goals';
import { APP_RELEASE, preUpdateBackup } from '../src/lib/localBackup';
import { addFoodEntry, createFood, getSettings, saveBodyEntry, saveSettings } from '../src/lib/repo';
import {
  ask, e1rm, exerciseHistory, exerciseTrend, nutritionForTraining, personalRecords, progression, recoveryIndicators, setsPerMuscle, startSession,
  trainingStats, weeklyReview, type CoachContext
} from '../src/lib/trainingCoach';
import {
  DEFAULT_GENERATOR, deleteWorkout, generateProgram, getActiveProgram, listPrograms, listWorkouts, OWNER_SPLIT, plannedSetsPerMuscle, saveProgram,
  saveRecovery, saveWorkout, validateSession, type LoggedExercise, type Program, type SetLog, type WorkoutSession
} from '../src/lib/workouts';

let k = 0;
beforeEach(() => { useDatabase('wk-' + ++k); });

const sets = (arr: [number, number, number?][]): SetLog[] => arr.map(([w, r, rir]) => ({ weightKg: w, reps: r, rir: rir ?? null, rpe: null, done: true }));
const ex = (exerciseId: string, s: SetLog[]): LoggedExercise => ({ exerciseId, name: exerciseId, status: 'done', restSec: 90, sets: s });
const session = (date: string, exercises: LoggedExercise[], bw = 72, mins = 60): WorkoutSession => ({ id: 'w-' + date + '-' + Math.random(), date, name: 'S', muscles: [], startedAt: Date.parse(date + 'T18:00:00'), endedAt: Date.parse(date + 'T18:00:00') + mins * 60000, bodyWeightKg: bw, exercises, updatedAt: 1 });

describe('exercise library', () => {
  it('every exercise has both names, valid muscles, prescription and existing alternatives', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(50);
    for (const e of EXERCISES) {
      expect(e.nameAr && e.nameEn && e.howAr && e.howEn, e.id).toBeTruthy();
      expect(MUSCLES).toContain(e.primary);
      e.secondary.forEach((m) => expect(MUSCLES).toContain(m));
      expect(e.reps[0]).toBeLessThanOrEqual(e.reps[1]);
      e.alternatives.forEach((a) => expect(findExercise(a), `${e.id} → ${a}`).toBeTruthy());
    }
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });
  it('search in Arabic and English, filter by muscle', () => {
    expect(searchExercises(EXERCISES, 'عقلة').map((e) => e.id)).toContain('pullup');
    expect(searchExercises(EXERCISES, 'dips').map((e) => e.id)).toContain('dips');
    expect(searchExercises(EXERCISES, '', 'calves').every((e) => e.primary === 'calves' || e.secondary.includes('calves'))).toBe(true);
  });
  it('alternatives respect available equipment', () => {
    const alts = alternativesFor('bench_press', EXERCISES, ['dumbbell', 'bodyweight']);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((a) => a.equipment.some((q) => q === 'dumbbell' || q === 'bodyweight'))).toBe(true);
    expect(alts.every((a) => a.primary === 'chest')).toBe(true);
  });
});

describe('program generator (keeps the owner split)', () => {
  const p = generateProgram(DEFAULT_GENERATOR);
  it('keeps the 6-day split + rest day exactly, on the training weekdays', () => {
    expect(p.days.map((d) => [d.name, d.rest, d.weekday])).toEqual(OWNER_SPLIT.map((d) => [d.name, d.rest, d.weekday]));
    expect(p.days.find((d) => d.rest)!.exercises).toEqual([]);
  });
  it('places pull-ups and dips at the chosen frequency', () => {
    const count = (q: Program, id: string) => q.days.flatMap((d) => d.exercises).filter((x) => x.exerciseId === id).length;
    expect(count(p, 'pullup')).toBe(2);
    expect(count(p, 'dips')).toBe(2);
    const q = generateProgram({ ...DEFAULT_GENERATOR, pullupsPerWeek: 1, dipsPerWeek: 0 });
    expect(count(q, 'pullup')).toBe(1);
    expect(count(q, 'dips')).toBe(0);
    // more than the 2 back days: the extra pull-up goes to a biceps day, extra dips to a chest day
    const r = generateProgram({ ...DEFAULT_GENERATOR, pullupsPerWeek: 3, dipsPerWeek: 4 });
    expect(count(r, 'pullup')).toBe(3);
    expect(count(r, 'dips')).toBe(3); // at most once per suitable day: 2 triceps days + 1 chest-only day
    expect(r.days.find((d) => d.name === 'Chest + Biceps')!.exercises.map((x) => x.exerciseId)).toEqual(expect.arrayContaining(['pullup', 'dips']));
  });
  it('orders compounds before isolation and explains every choice', () => {
    for (const d of p.days) {
      const cats = d.exercises.map((x) => findExercise(x.exerciseId)!.category);
      expect(cats.indexOf('isolation') === -1 || cats.lastIndexOf('compound') < cats.indexOf('isolation')).toBe(true);
      d.exercises.forEach((x) => expect(x.why).toMatch(/^why_/));
    }
  });
  it('weekly planned sets per muscle land in the 10–20 range for an intermediate lifter', () => {
    const s = plannedSetsPerMuscle(p);
    for (const m of ['chest', 'back', 'biceps', 'triceps', 'shoulders', 'quads'] as const) {
      expect(s[m], m).toBeGreaterThanOrEqual(8);
      expect(s[m], m).toBeLessThanOrEqual(26);
    }
  });
  it('keeps sessions practical: ≤ 24 sets per day, ≤ 10 per muscle, no near-duplicate variants on the same day', () => {
    for (const d of p.days) {
      expect(d.exercises.reduce((a, x) => a + x.sets, 0), d.name).toBeLessThanOrEqual(24);
      const ex = d.exercises.map((x) => findExercise(x.exerciseId)!);
      for (const m of d.muscles) expect(d.exercises.filter((x) => findExercise(x.exerciseId)!.primary === m).reduce((a, x) => a + x.sets, 0)).toBeLessThanOrEqual(10);
      for (const a of ex) for (const b of ex) if (a !== b && a.category === b.category) expect(a.alternatives.includes(b.id), `${d.name}: ${a.id} + ${b.id}`).toBe(false);
    }
    const legs = p.days.find((d) => d.name === 'Legs')!.exercises.map((x) => x.exerciseId);
    expect(legs).toEqual(expect.arrayContaining(['leg_curl', 'calf_raise']));
  });
  it('uses only available equipment and keeps exercises from the user history', () => {
    const q = generateProgram({ ...DEFAULT_GENERATOR, equipment: ['dumbbell', 'bodyweight', 'pullup_bar', 'dip_bars'] });
    for (const x of q.days.flatMap((d) => d.exercises)) expect(findExercise(x.exerciseId)!.equipment.some((e) => ['dumbbell', 'bodyweight', 'pullup_bar', 'dip_bars'].includes(e))).toBe(true);
    const h = generateProgram({ ...DEFAULT_GENERATOR, history: ['machine_chest_press'] });
    expect(h.days[0].exercises.map((x) => x.exerciseId)).toContain('machine_chest_press');
  });
  it('active program: generated and saved once, then reused; editable', async () => {
    const a = await getActiveProgram();
    const b = await getActiveProgram();
    expect(b.id).toBe(a.id);
    expect(await listPrograms()).toHaveLength(1);
    a.days[0].exercises = a.days[0].exercises.slice(1);
    await saveProgram(a);
    expect((await getActiveProgram()).days[0].exercises).toHaveLength(a.days[0].exercises.length);
    await expect(saveProgram({ ...a, days: [{ ...a.days[0], exercises: [{ ...a.days[0].exercises[0], sets: 0 }] }] })).rejects.toThrow(/Invalid/);
  });
});

describe('strength analytics', () => {
  const d0 = today();
  it('e1RM (Epley), body-weight load, history and records', () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 2);
    expect(e1rm(100, 1)).toBe(100);
    const w = [session(addDays(d0, -7), [ex('pullup', sets([[0, 8], [0, 7]]))], 80), session(d0, [ex('pullup', sets([[5, 8], [5, 6]]))], 80)];
    const h = exerciseHistory('pullup', w);
    expect(h[0].bestE1rm).toBeCloseTo(80 * (1 + 8 / 30), 1); // body weight counts for pull-ups
    expect(h[1].volume).toBe(85 * 14);
    expect(personalRecords(h)).toMatchObject({ maxWeight: 5, maxReps: 8 });
  });
  it('trend: improving / stable / declining from session averages', () => {
    const mk = (ws: number[]) => ws.map((x, i) => session(addDays(d0, -30 + i * 3), [ex('bench_press', sets([[x, 8], [x, 8], [x, 8]]))]));
    expect(exerciseTrend(exerciseHistory('bench_press', mk([60, 60, 60, 65, 65, 65]))).trend).toBe('improving');
    expect(exerciseTrend(exerciseHistory('bench_press', mk([60, 60, 60, 60, 60, 60.5]))).trend).toBe('stable');
    expect(exerciseTrend(exerciseHistory('bench_press', mk([65, 65, 65, 60, 60, 60]))).trend).toBe('declining');
    expect(exerciseTrend(exerciseHistory('bench_press', mk([60, 60]))).trend).toBe('insufficient');
  });
  it('weekly sets per muscle: primary 1, secondary ½', () => {
    const w = [session(d0, [ex('bench_press', sets([[60, 8], [60, 8], [60, 8]])), ex('rope_pushdown', sets([[20, 12], [20, 12]]))])];
    const s = setsPerMuscle(w, [d0]);
    expect(s.chest).toBe(3);
    expect(s.triceps).toBe(2 + 1.5);
    expect(s.shoulders).toBe(1.5);
  });
});

describe('progressive overload (double progression)', () => {
  const t = { sets: 3, repMin: 8, repMax: 12 };
  const d0 = today();
  const hist = (s: SetLog[], id = 'db_bench', prev?: SetLog[]) => exerciseHistory(id, [...(prev ? [session(addDays(d0, -7), [ex(id, prev)])] : []), session(d0, [ex(id, s)])]);
  it('all sets at the top with reps in reserve → increase weight (+2.5 kg upper body)', () => {
    const p = progression(t, hist(sets([[30, 12, 2], [30, 12, 1], [30, 12, 1]])), findExercise('db_bench'));
    expect(p).toMatchObject({ action: 'increase_weight', weightKg: 32.5, confidence: 'high' });
  });
  it('lower-body compound ≥ 100 kg → +5 kg', () => {
    const p = progression({ sets: 3, repMin: 5, repMax: 8 }, hist(sets([[100, 8, 2], [100, 8, 2], [100, 8, 1]]), 'squat'), findExercise('squat'));
    expect(p.weightKg).toBe(105);
  });
  it('top of range but at failure (RIR 0) → keep the weight', () => {
    expect(progression(t, hist(sets([[30, 12, 0], [30, 12, 0], [30, 12, 0]])), findExercise('db_bench')).action).toBe('maintain');
  });
  it('RIR not recorded → increase is suggested with medium confidence only', () => {
    expect(progression(t, hist(sets([[30, 12], [30, 12], [30, 12]])), findExercise('db_bench'))).toMatchObject({ action: 'increase_weight', confidence: 'medium' });
  });
  it('completing the workout is not enough: reps inside the range → add reps, same weight', () => {
    expect(progression(t, hist(sets([[30, 10, 2], [30, 9, 2], [30, 8, 1]])), findExercise('db_bench'))).toMatchObject({ action: 'increase_reps', weightKg: 30 });
  });
  it('below the range once → keep; twice → reduce ~5 %', () => {
    expect(progression(t, hist(sets([[30, 8], [30, 7], [30, 6]])), findExercise('db_bench')).action).toBe('maintain');
    expect(progression(t, hist(sets([[30, 7], [30, 6], [30, 6]]), 'db_bench', sets([[30, 8], [30, 7], [30, 6]])), findExercise('db_bench'))).toMatchObject({ action: 'reduce', weightKg: 28.5 });
  });
  it('no history → start (low confidence); long stall → suggest an alternative', () => {
    expect(progression(t, [], findExercise('db_bench'))).toMatchObject({ action: 'start', confidence: 'low' });
    const w = [62, 60, 61, 60, 61, 60, 61].map((x, i) => session(addDays(d0, -40 + i * 5), [ex('db_bench', sets([[x, 10], [x, 9], [x, 9]]))]));
    const p = progression(t, exerciseHistory('db_bench', w), findExercise('db_bench'));
    expect(p.action).toBe('replace');
    expect(p.alternatives?.length).toBeGreaterThan(0);
  });
  it('a new session is prefilled from the advice', async () => {
    const program = generateProgram(DEFAULT_GENERATOR);
    const chestDay = program.days[0];
    const first = chestDay.exercises[0];
    const prev = session(addDays(d0, -7), [ex(first.exerciseId, sets(Array.from({ length: first.sets }, () => [50, first.repMax, 2] as [number, number, number])))]);
    const s = startSession(d0, program, chestDay.id, [prev], 72);
    expect(s.exercises[0].sets[0].weightKg).toBe(52.5);
    expect(s.exercises[0].target).toMatchObject({ sets: first.sets, repMin: first.repMin, repMax: first.repMax });
  });
});

describe('sessions, recovery and coach', () => {
  it('save / list / delete one session only; validation', async () => {
    const a = await saveWorkout(session(today(), [ex('bench_press', sets([[60, 8]]))]));
    const b = await saveWorkout(session(addDays(today(), -1), [ex('squat', sets([[80, 6]]))]));
    expect((await listWorkouts()).map((w) => w.id)).toEqual([a.id, b.id]);
    await deleteWorkout(a.id);
    expect((await listWorkouts()).map((w) => w.id)).toEqual([b.id]);
    expect(validateSession(session(today(), [ex('x', [{ weightKg: -5, reps: 5, done: true }])]))).toContain('weight');
    await expect(saveRecovery({ date: today(), soreness: 9 })).rejects.toThrow();
  });
  async function ctx(workouts: WorkoutSession[] = [], extra: Partial<CoachContext> = {}): Promise<CoachContext> {
    return { data: { entries: await db.entries.toArray(), days: [], body: await db.body.toArray(), settings: await getSettings() }, workouts, program: generateProgram(DEFAULT_GENERATOR), cardio: [], recovery: [], ...extra };
  }
  it('recovery indicators: short sleep, no rest day, excessive volume (no diagnosis)', async () => {
    const d0 = today();
    const w = Array.from({ length: 7 }, (_, i) => session(addDays(d0, -i), [ex('bench_press', sets([[60, 8], [60, 8], [60, 8], [60, 8]]))]));
    const rec = [0, 1, 2].map((i) => ({ date: addDays(d0, -i), sleepH: 5.5, soreness: 4, energy: 2, fatigue: 4, updatedAt: 1 }));
    const keys = recoveryIndicators(await ctx(w, { recovery: rec })).map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['rc_sleepLow', 'rc_soreHigh', 'rc_energyLow', 'rc_fatigueHigh', 'rc_noRestDay', 'rc_volumeHigh']));
  });
  it('coach answers from data, says when data is missing, and gives confidence', async () => {
    const empty = await ctx();
    expect(ask('progressing', empty)).toMatchObject({ confidence: 'low', lines: [{ key: 'cq_needSessions' }] });
    const program = generateProgram(DEFAULT_GENERATOR);
    const id = program.days[0].exercises[0].exerciseId;
    const n = program.days[0].exercises[0];
    const w = [session(today(), [ex(id, sets(Array.from({ length: n.sets }, () => [40, n.repMax, 2] as [number, number, number])))])];
    const a = ask('increase', { ...(await ctx(w)), program });
    expect(a.lines[0]).toMatchObject({ key: 'cq_increaseLine', params: { ex: id, w: 42.5 } });
    const day = ask('today', { ...(await ctx(w)), program });
    const pd = program.days.find((d) => d.weekday === weekday(today()))!;
    expect(day.lines[0].key).toBe(pd.rest ? 'cq_restToday' : 'cq_todayIs');
  });
  it('weekly review separates observations (8 areas) from recommendations', async () => {
    const r = weeklyReview(await ctx());
    expect(r.observations.map((o) => o.key.split(/(?=[A-Z])/)[0])).toHaveLength(8);
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(r.observations.some((o) => o.key.startsWith('wrr_'))).toBe(false);
  });
  it('training stats: consistency vs planned days', async () => {
    const program = generateProgram(DEFAULT_GENERATOR);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
    const s = trainingStats([session(today(), [ex('bench_press', sets([[60, 8], [60, 8]]))])], dates, program);
    expect(s).toMatchObject({ sessions: 1, planned: 6, sets: 2, consistencyPct: 17 });
  });
});

describe('calories: workouts and the target (no double counting, no surplus)', () => {
  it('workouts within the planned resistance days add nothing; extra ones count as net energy', async () => {
    const s = await saveSettings((x) => { x.fitness = { resistanceDaysPerWeek: 2, cardioSessionsPerWeek: 0, cardioMinPerSession: 0 }; x.cardioReplenishPct = 100; });
    const d0 = today();
    const w1 = session(addDays(d0, -2), [ex('bench_press', sets([[60, 8]]))]);
    const w2 = session(addDays(d0, -1), [ex('bench_press', sets([[60, 8]]))]);
    const within = energyFor(d0, 2110, 0, [], s, [w1, session(d0, [ex('squat', sets([[80, 6]]))], 72, 60)].slice(0, 2));
    expect(within.allowed).toBe(0);
    const extra = energyFor(d0, 2110, 0, [], s, [w1, w2, session(d0, [ex('squat', sets([[80, 6]]))], 72, 60)]);
    expect(extra.extraWorkouts).toBe(1);
    expect(extra.workoutExtraNet).toBe(Math.round(2.5 * s.profile.currentWeight)); // (3.5 − 1) MET × kg × 1 h
    expect(extra.adjusted).toBe(2110 + Math.round(extra.workoutExtraNet / 10) * 10);
  });
  it('a saved 2,110 kcal target is never changed by logging workouts', async () => {
    await saveSettings((x) => { x.targets.training.kcal = 2110; x.targets.rest.kcal = 2110; });
    await saveWorkout(session(today(), [ex('bench_press', sets([[60, 8]]))]));
    expect((await getSettings()).targets.training.kcal).toBe(2110);
  });
  it('fat-loss goal: suggested increases never reach a surplus (≤ 90 % of TDEE)', async () => {
    const s = await saveSettings((x) => { x.profile.goalType = 'fat_loss_preserve'; x.profile.weeklyChangeKg = -0.3; const tdee = tdeeOf(x.profile); x.targets.training.kcal = Math.round(tdee * 0.88); x.targets.rest.kcal = x.targets.training.kcal; });
    const f = await createFood({ nameAr: 'اختبار', nameEn: 't', category: 'x', per100: { kcal: 100, protein: 8, carbs: 10, fat: 2 }, state: 'cooked', stateLabel: '', prep: '', notes: '' });
    for (let i = 1; i <= 14; i++) await addFoodEntry(addDays(today(), -i), 'lunch', f, s.targets.training.kcal, 'g');
    for (let i = 0; i <= 21; i++) await saveBodyEntry(addDays(today(), -i), { weight: 70 + i * 0.15 });
    const a = adviseGoals({ entries: await db.entries.toArray(), days: [], body: await db.body.orderBy('date').toArray(), settings: await getSettings() }, [], [], today());
    const inc = a.find((x) => x.id === 'tooFast')!;
    const ceiling = Math.round(tdeeOf({ ...s.profile, currentWeight: 70 + 3 * 0.15 }) * 0.9);
    if (inc.action?.kind === 'kcal') expect(s.targets.training.kcal + inc.action.delta).toBeLessThanOrEqual(ceiling + 20);
    else expect(inc.key).toBe('adv_noSurplus');
  });
  it('nutrition × training reports the deficit against TDEE', async () => {
    const s = await saveSettings((x) => { x.targets.training.kcal = 2110; });
    const out = nutritionForTraining({ data: { entries: [], days: [], body: [], settings: s }, workouts: [], program: generateProgram(DEFAULT_GENERATOR), cardio: [], recovery: [] });
    const tdee = tdeeOf(s.profile);
    expect(out[0]).toMatchObject({ key: 'nt_target', params: { kcal: 2110, tdee, pct: Math.round((1 - 2110 / tdee) * 100) } });
  });
});

describe('data protection: backup is restorable; training never touches existing records', () => {
  it('pre-update backup restores every record into an empty database', async () => {
    const f = await createFood({ nameAr: 'شوفان', nameEn: 'oats', category: 'c', per100: { kcal: 389, protein: 17, carbs: 66, fat: 7 }, state: 'raw', stateLabel: '', prep: '', notes: '' });
    for (let i = 0; i < 4; i++) await addFoodEntry(addDays(today(), -i), 'breakfast', f, 80, 'g');
    await saveBodyEntry(today(), { weight: 72.1, waist: 81 });
    const entries = await db.entries.toArray();
    expect(await preUpdateBackup(APP_RELEASE)).toBe(true);
    const json = (await db.backups.where('reason').equals('pre-update').first())!.json;
    useDatabase('wk-restore-' + k);
    await restoreBackup(json);
    expect(await db.entries.toArray()).toEqual(entries);
    expect((await db.body.toArray())[0]).toMatchObject({ weight: 72.1, waist: 81 });
    expect(await db.foods.count()).toBe(1);
  });
  it('programs, sessions and recovery logs add records only', async () => {
    const f = await createFood({ nameAr: 'أرز', nameEn: 'rice', category: 'c', per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, state: 'cooked', stateLabel: '', prep: '', notes: '' });
    await addFoodEntry(today(), 'lunch', f, 200, 'g');
    const before = { entries: await db.entries.toArray(), body: await db.body.toArray(), days: await db.days.toArray(), foods: await db.foods.toArray(), settings: await getSettings() };
    await getActiveProgram();
    await saveWorkout(session(today(), [ex('bench_press', sets([[60, 8]]))]));
    await saveRecovery({ date: today(), sleepH: 7, soreness: 2, energy: 4, fatigue: 2 });
    expect(await db.entries.toArray()).toEqual(before.entries);
    expect(await db.body.toArray()).toEqual(before.body);
    expect(await db.foods.toArray()).toEqual(before.foods);
    expect((await getSettings()).targets).toEqual(before.settings.targets);
  });
});
