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
  data: { settings: o.s ?? settings(), entries: o.e ?? [], days: [], body: o.b ?? [] }, workouts: o.workouts ?? [], program: o.program, cardio: [], recovery: o.recovery ?? [], checkins: o.checkins ?? [], date: END
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
    expect(r.adjustments.find((a) => a.id === 'stall')?.action).toEqual({ kind: 'kcal', delta: -150 });
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
