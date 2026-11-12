import { describe, expect, it } from 'vitest';
import { addDays } from '../src/lib/dates';
import { adviseDiet, scheduleFromProgram, type AdvisorInput } from '../src/lib/dietAdvisor';
import { defaultSettings } from '../src/lib/defaults';
import type { CheckIn } from '../src/lib/goalAdvisor';
import type { BodyEntry, DiaryEntry, Macros, Settings } from '../src/lib/types';
import type { Program } from '../src/lib/workouts';

const END = '2026-11-12';
const settings = (over: Partial<Settings['profile']> = {}): Settings => {
  const s = defaultSettings();
  s.profile = { ...s.profile, ...over };
  s.targets = { training: { kcal: 2110, protein: 158, carbs: 237, fat: 59 }, rest: { kcal: 2110, protein: 158, carbs: 237, fat: 59 } };
  return s;
};
const entries = (days: number, m: Macros): DiaryEntry[] => Array.from({ length: days }, (_, i) => ({
  id: 'e' + i, date: addDays(END, -i), meal: 'lunch', name: 'x', state: 'cooked', quantity: 1, unit: 'serving', grams: 500, basis: {}, macros: m, order: 0, createdAt: 1, updatedAt: 1
}) as DiaryEntry);
const weights = (days: number, start: number, perDay: number): BodyEntry[] => Array.from({ length: days }, (_, i) => ({ id: 'b' + i, date: addDays(END, -(days - 1 - i)), weight: Math.round((start + perDay * i) * 100) / 100, notes: '', createdAt: 1, updatedAt: 1 }));
const input = (o: Partial<AdvisorInput> & { s?: Settings; e?: DiaryEntry[]; b?: BodyEntry[] }): AdvisorInput => ({
  data: { settings: o.s ?? settings(), entries: o.e ?? [], days: [], body: o.b ?? [] }, workouts: o.workouts ?? [], program: o.program, cardio: [], recovery: o.recovery ?? [], checkins: o.checkins ?? [], history: o.history, date: END
});
const check = (h: number, strength: CheckIn['strength'] = 'same', recovery = 3): CheckIn[] => [addDays(END, -10), addDays(END, -3)].map((week) => ({ week, strength, hunger: h, recovery, resistanceSessions: 6, updatedAt: 1 }));

describe('diet advisor', () => {
  it('without data: a sustainable strategy, low confidence, asks for data, never keto, nothing restrictive on top', () => {
    const r = adviseDiet(input({}));
    expect(r.confidence).toBe('low');
    expect(['high_protein', 'flexible']).toContain(r.recommended.mode);
    expect(r.recommended.mode).not.toBe('keto');
    expect(r.alternatives).toHaveLength(2);
    expect(r.adjustments.map((a) => a.id)).toEqual(expect.arrayContaining(['log', 'weigh', 'checkin']));
    expect(r.signals.tdeeBasis).toBe('guideline');
    for (const o of r.options) expect(Math.abs(4 * o.targets.protein + 4 * o.targets.carbs + 9 * o.targets.fat - o.targets.kcal)).toBeLessThanOrEqual(5);
  });
  it('every reason says whether it comes from the user data or from established guidance', () => {
    const r = adviseDiet(input({ e: entries(21, { kcal: 2100, protein: 150, carbs: 230, fat: 60 }), b: weights(28, 72, -0.03), checkins: check(4) }));
    for (const o of r.options) for (const w of o.why) expect(['data', 'guideline']).toContain(w.basis);
    for (const a of r.adjustments) expect(['data', 'guideline']).toContain(a.basis);
  });
  it('weight stalled for 4 weeks with good adherence → maintenance estimated from the data and a −150 kcal suggestion', () => {
    const r = adviseDiet(input({ s: settings({ activityLevel: 'moderate', targetWeight: 68 }), e: entries(28, { kcal: 2110, protein: 158, carbs: 237, fat: 59 }), b: weights(28, 72, 0), checkins: check(3) }));
    expect(r.signals.tdeeBasis).toBe('data');
    expect(r.signals.dataTdee).toBe(2110); // eating 2,110 and weight flat → maintenance ≈ 2,110
    expect((r.adjustments.find((a) => a.id === 'stall')!.action as { delta: number }).delta).toBeLessThan(0);
  });
  it('losing faster than 1 % a week → suggests eating more (muscle preservation)', () => {
    const r = adviseDiet(input({ s: settings({ targetWeight: 65 }), e: entries(28, { kcal: 1700, protein: 150, carbs: 180, fat: 50 }), b: weights(28, 75, -0.16), checkins: check(3) }));
    expect(r.adjustments.find((a) => a.id === 'fast')?.action).toEqual({ kind: 'kcal', delta: 150 });
  });
  it('high hunger → high-protein recommended and a hunger adjustment', () => {
    const r = adviseDiet(input({ e: entries(21, { kcal: 2100, protein: 100, carbs: 260, fat: 60 }), b: weights(28, 72, -0.05), checkins: check(5) }));
    expect(r.recommended.mode).toBe('high_protein');
    expect(r.adjustments.find((a) => a.id === 'hunger')).toBeTruthy();
  });
  it('habitual very-low-carb eating is respected but keto still does not beat a sustainable option for a 6-day trainee', () => {
    const r = adviseDiet(input({ s: settings({ trainingDaysPerWeek: 6 }), e: entries(21, { kcal: 2100, protein: 150, carbs: 40, fat: 150 }), b: weights(28, 72, -0.05), checkins: check(3) }));
    expect(r.recommended.mode).not.toBe('keto');
    expect(r.options.find((o) => o.mode === 'keto')!.why.some((w) => w.key === 'da_w_habitKeto')).toBe(true);
  });
  it('declining performance on few carbs with a 6-day program → carb cycling suggested, with leg/back days high', () => {
    const program: Program = { id: 'p', name: 'p', createdAt: 1, updatedAt: 1, days: [
      { id: 'd1', name: 'Legs', weekday: 1, muscles: ['quads', 'hamstrings'], rest: false, exercises: [] },
      { id: 'd2', name: 'Chest', weekday: 2, muscles: ['chest', 'triceps'], rest: false, exercises: [] },
      { id: 'd3', name: 'Rest', weekday: 5, muscles: [], rest: true, exercises: [] }] };
    expect(scheduleFromProgram(program, [1, 2], 6).slice(1, 3)).toEqual(['high', 'moderate']);
    const r = adviseDiet(input({ s: settings({ goalType: 'recomp', trainingDaysPerWeek: 6 }), program, e: entries(21, { kcal: 2300, protein: 160, carbs: 150, fat: 95 }), b: weights(28, 72, 0), checkins: check(3, 'down') }));
    const perf = r.adjustments.find((a) => a.id === 'perf');
    expect(perf?.action).toEqual({ kind: 'mode', mode: 'carb_cycling' });
    const cyc = r.options.find((o) => o.mode === 'carb_cycling')!;
    expect(cyc.cycle!.schedule[1]).toBe('high');
    expect(cyc.cycle!.schedule[5]).toBe('rest');
  });
  it('target weight reached → suggests switching to maintenance', () => {
    const r = adviseDiet(input({ s: settings({ targetWeight: 70 }), e: entries(21, { kcal: 2100, protein: 150, carbs: 230, fat: 60 }), b: weights(28, 70.4, -0.01), checkins: check(3) }));
    expect(r.adjustments.find((a) => a.id === 'reached')?.action).toEqual({ kind: 'maintain' });
  });
  it('a data estimate far from the formula (> 25 %, e.g. incomplete logging) is not trusted', () => {
    const r = adviseDiet(input({ s: settings({ activityLevel: 'active' }), e: entries(28, { kcal: 2110, protein: 158, carbs: 237, fat: 59 }), b: weights(28, 72, 0), checkins: check(3) }));
    expect(r.signals.dataTdee).toBeNull();
    expect(r.signals.tdeeBasis).toBe('guideline');
  });
  it('a target that already fits within ±5 % is kept (no needless change of the saved 2,110 kcal)', () => {
    const r = adviseDiet(input({ s: settings({ activityLevel: 'moderate', goalType: 'fat_loss_preserve' }) }));
    expect(r.signals.kcal).toBe(2110);
  });
});

describe('review improvements: weekly averages, safety, protein, trial, history, personalisation', () => {
  it('(1) never acts on single weigh-ins: one weigh-in a week → no 7-day-average trend, no calorie suggestion', () => {
    const sparse = [0, 7, 14, 21].map((k, i) => ({ id: 's' + i, date: addDays(END, -k), weight: 72 - i * 1.5, notes: '', createdAt: 1, updatedAt: 1 }));
    const r = adviseDiet(input({ s: settings({ targetWeight: 60 }), e: entries(28, { kcal: 2110, protein: 158, carbs: 237, fat: 59 }), b: sparse, checkins: check(3) }));
    expect(r.signals.trendWeeks).toBe(0);
    expect(r.signals.ratePerWeek).toBeNull();
    expect(r.adjustments.some((a) => a.action?.kind === 'kcal')).toBe(false);
    expect(r.adjustments.find((a) => a.id === 'weigh')).toBeTruthy();
  });
  it('(1) lowering calories needs ≥ 3 weeks of weekly averages; 2 weeks of a stall is not enough', () => {
    const two = adviseDiet(input({ s: settings({ activityLevel: 'moderate', targetWeight: 68 }), e: entries(28, { kcal: 2110, protein: 158, carbs: 237, fat: 59 }), b: weights(14, 72, 0), checkins: check(3) }));
    expect(two.signals.trendWeeks).toBe(2);
    expect(two.adjustments.find((a) => a.id === 'stall')).toBeUndefined();
    const four = adviseDiet(input({ s: settings({ activityLevel: 'moderate', targetWeight: 68 }), e: entries(28, { kcal: 2110, protein: 158, carbs: 237, fat: 59 }), b: weights(28, 72, 0), checkins: check(3) }));
    expect(four.signals.trendWeeks).toBe(4);
    expect(four.adjustments.find((a) => a.id === 'stall')?.action).toMatchObject({ kind: 'kcal' });
    expect((four.adjustments.find((a) => a.id === 'stall')!.action as { delta: number }).delta).toBeLessThan(0);
  });
  it('(6) safety: target never below the resting rate / 1,200–1,500 kcal, deficit never above 25 %', () => {
    const r = adviseDiet(input({ s: settings({ sex: 'female', age: 45, currentWeight: 50, heightCm: 152, activityLevel: 'sedentary', goalType: 'fat_loss', targetWeight: 45 }) }));
    expect(r.signals.kcal).toBeGreaterThanOrEqual(1200);
    expect(r.signals.kcal).toBeGreaterThanOrEqual(Math.ceil(r.signals.tdee * 0.75 / 10) * 10 - 10);
    for (const o of r.options.filter((x) => x.mode !== 'custom')) expect(o.targets.kcal).toBeGreaterThanOrEqual(1200);
  });
  it('(6) a −150 suggestion is withheld when it would cross the safety floor', () => {
    const s = settings({ activityLevel: 'moderate', targetWeight: 68 });
    s.targets.training = { ...s.targets.training, kcal: 1700 };
    const r = adviseDiet(input({ s, e: entries(28, { kcal: 1700, protein: 158, carbs: 140, fat: 55 }), b: weights(28, 72, 0), checkins: check(3) }));
    const stall = r.adjustments.find((a) => a.id === 'stall' || a.id === 'stallFloor');
    expect(stall?.action).toBeUndefined();
  });
  it('(3) protein is adequate in every strategy, keto and low carb included (≥ 1.6 g/kg)', () => {
    const r = adviseDiet(input({}));
    for (const o of r.options.filter((x) => x.mode !== 'custom')) expect(o.targets.protein / r.signals.weight, o.mode).toBeGreaterThanOrEqual(1.6);
    const low = settings(); low.targets.training = { kcal: 2110, protein: 90, carbs: 300, fat: 60 };
    expect(adviseDiet(input({ s: low })).adjustments.find((a) => a.id === 'proteinTarget')).toBeTruthy();
  });
  it('(5) trial: during the first 14 days no strategy/calorie changes except safety, current strategy favoured', () => {
    const s = settings({ targetWeight: 65 }); s.dietStrategy = { mode: 'low_carb', kcal: 2110, protein: 144, carbs: 100, fat: 145, appliedAt: 1 };
    const history = [{ mode: 'low_carb' as const, start: addDays(END, -5), kcal: 2110 }];
    const r = adviseDiet(input({ s, history, e: entries(21, { kcal: 2110, protein: 144, carbs: 100, fat: 145 }), b: weights(28, 72, 0), checkins: check(5, 'down') }));
    expect(r.trial).toMatchObject({ mode: 'low_carb', day: 6, done: false });
    expect(r.adjustments.find((a) => a.id === 'trial')).toBeTruthy();
    expect(r.adjustments.filter((a) => a.action && a.id !== 'fast')).toEqual([]);
    expect(r.options.find((o) => o.mode === 'low_carb')!.why.some((w) => w.key === 'da_w_inTrial')).toBe(true);
  });
  it('(5) after the trial: effective when the trend matches the goal with good adherence, otherwise not effective', () => {
    const s = settings({ targetWeight: 65, activityLevel: 'moderate' }); s.dietStrategy = { mode: 'flexible', kcal: 2110, protein: 158, carbs: 237, fat: 59, appliedAt: 1 };
    const history = [{ mode: 'flexible' as const, start: addDays(END, -20), kcal: 2110 }];
    const good = adviseDiet(input({ s, history, e: entries(28, { kcal: 2110, protein: 158, carbs: 237, fat: 59 }), b: weights(28, 74, -0.06), checkins: check(3) }));
    expect(good.trial?.verdict).toBe('effective');
    const flat = adviseDiet(input({ s, history, e: entries(28, { kcal: 2110, protein: 158, carbs: 237, fat: 59 }), b: weights(28, 72, 0), checkins: check(3) }));
    expect(flat.trial?.verdict).toBe('notEffective');
    expect(flat.adjustments.find((a) => a.id === 'trialEval')?.level).toBe('warn');
  });
  it('(4) results: previous vs current strategy from the records of each period', () => {
    const s = settings({ targetWeight: 65 }); s.dietStrategy = { mode: 'high_protein', kcal: 2110, protein: 180, carbs: 200, fat: 59, appliedAt: 1 };
    const history = [{ mode: 'keto' as const, start: addDays(END, -50), end: addDays(END, -22), kcal: 2110 }, { mode: 'high_protein' as const, start: addDays(END, -21), kcal: 2110 }];
    const b = weights(56, 76, -0.05);
    const r = adviseDiet(input({ s, history, e: entries(50, { kcal: 2110, protein: 170, carbs: 200, fat: 60 }), b, checkins: check(3) }));
    expect(r.results.previous?.period.mode).toBe('keto');
    expect(r.results.current?.period.mode).toBe('high_protein');
    expect(r.results.previous!.ratePerWeek).toBeLessThan(0);
    expect(r.results.current!.adherencePct).not.toBeNull();
  });
  it('(7) personalised: a strategy that failed for this user before is ranked down, one that worked is ranked up', () => {
    const s = settings({ targetWeight: 60, activityLevel: 'moderate' });
    const hardKeto = adviseDiet(input({ s, history: [{ mode: 'flexible', start: addDays(END, -27), end: addDays(END, -1), kcal: 2110 }, { mode: 'none', start: END, kcal: 2110 }],
      e: entries(28, { kcal: 2110, protein: 158, carbs: 237, fat: 59 }), b: weights(28, 74, -0.07), checkins: check(3) }));
    const flex = hardKeto.options.find((o) => o.mode === 'flexible')!;
    expect(flex.why.some((w) => w.key === 'da_w_workedBefore')).toBe(true);
    expect(hardKeto.recommended.mode).toBe('flexible');
  });
});

describe('final accuracy review', () => {
  const owner = () => { const s = settings({ sex: 'male', age: 26, heightCm: 170, currentWeight: 72, activityLevel: 'moderate', goalType: 'fat_loss_preserve', trainingDaysPerWeek: 6, targetWeight: 68 });
    s.targets = { training: { kcal: 2110, protein: 160, carbs: 235, fat: 59 }, rest: { kcal: 2110, protein: 160, carbs: 235, fat: 59 } }; return s; };
  it('(1) protein: own 160 g (2.2 g/kg) kept; a low own target is replaced by 2.2 g/kg for fat loss with muscle preservation', () => {
    expect(adviseDiet(input({ s: owner() })).signals).toMatchObject({ protein: 160, proteinBasis: 'current' });
    const s = owner(); s.targets.training.protein = 120; // 1.67 g/kg
    expect(adviseDiet(input({ s })).signals).toMatchObject({ protein: Math.round(72 * 2.2), proteinBasis: 'goal' });
  });
  it('(2) low carb and keto do not force excessive fat at 2,110 kcal', async () => {
    const { computeMacros, modeDefaults } = await import('../src/lib/dietStrategy');
    const lc = computeMacros('low_carb', 2110, { ...modeDefaults('low_carb', 2110, 72), protein: 160 }, 72);
    expect((9 * lc.macros.fat) / 2110).toBeLessThanOrEqual(0.45);
    expect(lc.warnings).toEqual([]);
    const k = computeMacros('keto', 2110, { protein: 160, carbs: 25, fat: 0 }, 72);
    expect((9 * k.macros.fat) / 2110).toBeLessThanOrEqual(0.75);
  });
  it('(3) carb cycling for the owner: every day adds up, no day below the resting rate, the week equals 7 × 2,110 — also with a hand-set day', async () => {
    const { cycleWeek, dayFloor } = await import('../src/lib/dietStrategy');
    const sched = ['high', 'moderate', 'high', 'moderate', 'high', 'rest', 'moderate'] as const; // Sun..Sat
    const floor = dayFloor(owner().profile);
    for (const ovr of [{}, { high: { kcal: 2600, protein: 160, carbs: 350, fat: 58 } }]) {
      const w = cycleWeek(2110, 160, [...sched], ovr, floor);
      expect(w.aligned).toBe(true);
      for (const l of new Set(sched)) {
        const m = w.levels[l];
        expect(m.kcal).toBeGreaterThanOrEqual(floor);
        expect(Math.abs(4 * m.protein + 4 * m.carbs + 9 * m.fat - m.kcal)).toBeLessThanOrEqual(5);
      }
    }
  });
  it('(4) weight loss with falling strength and low protein intake is flagged as a muscle risk, not as success', () => {
    const r = adviseDiet(input({ s: owner(), e: entries(28, { kcal: 1900, protein: 100, carbs: 230, fat: 60 }), b: weights(28, 74, -0.06), checkins: check(3, 'down') }));
    expect(r.adjustments.find((a) => a.id === 'muscleRisk')).toBeTruthy();
    expect(r.adjustments.find((a) => a.id === 'quality')?.level).toBe('info');
  });
  it('(4) stable weight with a smaller waist and kept strength = recomposition: no calorie cut', () => {
    const b = weights(28, 72, 0).map((x, i) => (i === 0 ? { ...x, waist: 83.5 } : i === 27 ? { ...x, waist: 82 } : x));
    const r = adviseDiet(input({ s: owner(), e: entries(28, { kcal: 2110, protein: 160, carbs: 235, fat: 59 }), b, checkins: check(3) }));
    expect(r.adjustments.find((a) => a.id === 'recomp')).toBeTruthy();
    expect(r.adjustments.find((a) => a.id === 'stall')).toBeUndefined();
  });
  it('(5) stability: without a data reason the current approach is recommended, even if another scores higher', () => {
    const r = adviseDiet(input({ s: owner(), e: entries(21, { kcal: 2110, protein: 160, carbs: 235, fat: 59 }), b: weights(28, 74, -0.04), checkins: check(3) }));
    expect(r.recommended.mode).toBe('flexible'); // the owner's saved targets are a flexible split
    const high = adviseDiet(input({ s: owner(), e: entries(21, { kcal: 2110, protein: 160, carbs: 235, fat: 59 }), b: weights(28, 74, -0.04), checkins: check(5) }));
    expect(high.recommended.mode).toBe('high_protein'); // a data reason (hunger 5/5) allows the change
    expect(high.recommended.why[0].key).toBe('da_w_reasonHunger');
  });
});

describe('calories move in steps from the current target', () => {
  const owner = () => { const s = settings({ activityLevel: 'moderate', goalType: 'fat_loss_preserve', targetWeight: 68 });
    s.targets = { training: { kcal: 2110, protein: 160, carbs: 235, fat: 59 }, rest: { kcal: 2110, protein: 160, carbs: 235, fat: 59 } }; return s; };
  const log = entries(28, { kcal: 2110, protein: 160, carbs: 235, fat: 59 });
  it('on track (≈ −0.3 kg/week, good adherence) → the current 2,110 is kept, not recalculated', () => {
    const r = adviseDiet(input({ s: owner(), e: log, b: weights(28, 73.2, -0.043), checkins: check(3) }));
    expect(r.signals).toMatchObject({ kcal: 2110, kcalBasis: 'kept' });
  });
  it('stalled for 4 weeks → a measured 10 % deficit (2,110 → 1,890), not a jump to the formula target', () => {
    const r = adviseDiet(input({ s: owner(), e: log, b: weights(28, 72, 0), checkins: check(3) }));
    // measured maintenance = 2,110 (eating 2,110, weight flat) → at least a 10 % deficit: 1,890
    expect(r.signals).toMatchObject({ kcal: 1890, kcalBasis: 'adjusted' });
    expect(r.adjustments.find((a) => a.id === 'stall')?.action).toEqual({ kind: 'kcal', delta: -220 });
  });
  it('within 14 days of a calorie change no further cut is suggested (no double application)', () => {
    const history = [{ mode: 'none' as const, start: addDays(END, -6), kcal: 1960 }];
    const r = adviseDiet(input({ s: owner(), history, e: log, b: weights(28, 72, 0), checkins: check(3) }));
    expect(r.signals.kcal).toBe(2110);
    expect(r.adjustments.find((a) => a.id === 'stall')).toBeUndefined();
    expect(r.adjustments.find((a) => a.id === 'window')).toBeTruthy();
  });
});
