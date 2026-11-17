/** Flexible calorie budget (budget.ts): scenarios A–E from the brief, empty days, protein, safety, target history. */
import { describe, expect, it } from 'vitest';
import { computeBudget, daysInMonth, monthBudget, settingsOn, weekBudget, withTargetChange, type TargetHistoryEntry } from '../src/lib/budget';
import { defaultSettings } from '../src/lib/defaults';
import { weekDates } from '../src/lib/dates';
import type { DataBundle } from '../src/lib/reports';
import type { DiaryEntry, Settings } from '../src/lib/types';

const T = { kcal: 2110, protein: 160, carbs: 235, fat: 59 };
function settings(over: Partial<Settings> = {}): Settings {
  const s = defaultSettings();
  return { ...s, targets: { training: { ...T }, rest: { ...T } }, weekStartsOn: 6, profile: { ...s.profile, sex: 'male', currentWeight: 84, heightCm: 178, age: 31 }, ...over } as Settings;
}
let n = 0;
const entry = (date: string, kcal: number, protein = 160): DiaryEntry => ({
  id: 'e' + ++n, date, meal: 'lunch', name: 'x', state: 'cooked', quantity: 1, unit: 'g', grams: 1, basis: { kind: 'per100g' } as never,
  macros: { kcal, protein, carbs: 200, fat: 60 }, order: 1, createdAt: 1, updatedAt: 1
});
const bundle = (entries: DiaryEntry[], s = settings()): DataBundle => ({ entries, days: [], body: [], settings: s });
// a full past week (Saturday 2026-11-07 … Friday 2026-11-13), "now" after it
const WEEK = weekDates('2026-11-07');
const NOW = '2026-11-20';

describe('weekly budget', () => {
  it('A: seven days of 2,110 kcal = 14,770 kcal, exactly on budget', () => {
    const b = weekBudget('2026-11-07', bundle(WEEK.map((d) => entry(d, 2110))), [], NOW);
    expect(b.budget).toBe(14770);
    expect(b.consumed).toBe(14770);
    expect(b.remaining).toBe(0);
    expect(b.exceeded).toBe(false);
    expect(b.averageDaily).toBe(2110);
    expect(b.usedPct).toBe(100);
  });
  it('B: flexible week — some days above, some below; totals stay exact and no day is a failure', () => {
    const kcal = [2400, 1900, 2110, 2500, 1800, 2000, 2060];
    const b = weekBudget('2026-11-07', bundle(WEEK.map((d, i) => entry(d, kcal[i]))), [], NOW);
    expect(b.consumed).toBe(kcal.reduce((a, x) => a + x, 0));
    expect(b.remaining).toBe(14770 - 14770);
    expect(b.daysAbove).toBe(2);
    expect(b.days[0].diff).toBe(290); // 2,400 vs 2,110: +290 comes off the weekly budget
    expect(b.days[3].aboveFlex).toBe(true); // +390 > 300 soft guideline
    expect(b.days[0].aboveFlex).toBe(false);
  });
  it('C: weekly budget exceeded — excess shown, records untouched, no restriction imposed', () => {
    const entries = WEEK.map((d) => entry(d, 2500));
    const copy = JSON.stringify(entries);
    const b = weekBudget('2026-11-07', bundle(entries), [], NOW);
    expect(b.exceeded).toBe(true);
    expect(b.remaining).toBe(14770 - 17500);
    expect(b.suggestion).toBeNull(); // the week is over: nothing to suggest
    expect(JSON.stringify(entries)).toBe(copy);
  });
  it('mid-week: optional suggestion = remaining ÷ remaining days, never below the safe floor or flexibility band', () => {
    const now = '2026-11-10'; // Tuesday: Sat–Mon logged, today + 3 days remain
    const entries = [entry('2026-11-07', 2400), entry('2026-11-08', 2300), entry('2026-11-09', 2200)];
    const b = weekBudget('2026-11-07', bundle(entries), [], now);
    expect(b.remainingDays).toBe(4);
    expect(b.remaining).toBe(14770 - 6900);
    expect(b.suggestion!.exact).toBe(Math.round((14770 - 6900) / 4)); // 1,968
    expect(b.suggestion!.perDay).toBe(1968);
    expect(b.suggestion!.note).toBeNull();
    // a big overspend: full compensation would be very low → suggestion stops at target − 300 and says so
    const big = weekBudget('2026-11-07', bundle([entry('2026-11-07', 4000), entry('2026-11-08', 3800), entry('2026-11-09', 3600)]), [], now);
    expect(big.suggestion!.exact).toBeLessThan(1500);
    expect(big.suggestion!.perDay).toBe(2110 - 300);
    expect(big.suggestion!.note).toBe('floor');
  });
  it('under budget: the suggestion stays at the normal target (spare calories are never pushed)', () => {
    const b = weekBudget('2026-11-07', bundle([entry('2026-11-07', 1600), entry('2026-11-08', 1600), entry('2026-11-09', 1600)]), [], '2026-11-10');
    expect(b.suggestion!.exact).toBeGreaterThan(2110);
    expect(b.suggestion!.perDay).toBe(2110);
    expect(b.suggestion!.note).toBe('room');
  });
  it('days with nothing logged are not zero-calorie days', () => {
    const entries = [entry('2026-11-07', 2110), entry('2026-11-09', 2110)]; // Sunday not logged
    const b = weekBudget('2026-11-07', bundle(entries), [], '2026-11-10');
    expect(b.unloggedPastDays).toBe(1);
    expect(b.trackedBudget).toBe(14770 - 2110);
    expect(b.averageDaily).toBe(2110); // average over logged days only
    expect(b.days[1].consumed).toBeNull();
  });
  it('suggestions can be switched off; flexibility can be disabled', () => {
    const s = settings({ budget: { flexKcal: null, weekMethod: 'auto', monthMethod: 'auto', suggestions: false } });
    const b = weekBudget('2026-11-07', bundle([entry('2026-11-07', 2600)], s), [], '2026-11-08');
    expect(b.suggestion).toBeNull();
    expect(b.days[0].aboveFlex).toBe(false);
    expect(b.days[0].aboveTarget).toBe(true);
  });
  it('custom weekly budget', () => {
    const s = settings({ budget: { flexKcal: 300, weekMethod: 'custom', weekCustom: 14000, monthMethod: 'auto', suggestions: true } });
    const b = weekBudget('2026-11-07', bundle(WEEK.map((d) => entry(d, 2000)), s), [], NOW);
    expect(b.budget).toBe(14000);
    expect(b.method).toBe('custom');
    expect(b.remaining).toBe(0);
  });
  it('protein stays a daily target (never carried over)', () => {
    const b = weekBudget('2026-11-07', bundle(WEEK.map((d, i) => entry(d, 2110, i < 4 ? 165 : 120))), [], NOW);
    expect(b.protein.daysHit).toBe(4);
    expect(b.protein.target).toBe(160);
    expect(b.protein.average).toBeCloseTo((4 * 165 + 3 * 120) / 7, 1);
  });
});

describe('monthly budget (real calendar days)', () => {
  it('D: February 2026 (28), February 2028 (29), April (30), January (31)', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-04')).toBe(30);
    expect(daysInMonth('2027-01')).toBe(31);
    for (const [m, days] of [['2026-02', 28], ['2028-02', 29], ['2026-04', 30], ['2027-01', 31]] as const)
      expect(monthBudget(m, bundle([]), [], '2030-01-01').budget).toBe(2110 * days);
  });
  it('weekly breakdown of a month adds up to the month — nothing counted twice', () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
    const entries = dates.map((d, i) => entry(d, 1900 + (i % 5) * 100));
    const m = monthBudget('2026-11', bundle(entries), [], '2026-12-05');
    expect(m.weeks.reduce((a, w) => a + w.consumed, 0)).toBe(m.consumed);
    expect(m.weeks.reduce((a, w) => a + w.target, 0)).toBe(m.budget);
    // the same entries in the weeks of the month give the same total as the month
    const wk = weekBudget('2026-11-07', bundle(entries), [], '2026-12-05');
    expect(wk.consumed).toBe(entries.filter((e) => WEEK.includes(e.date)).reduce((a, e) => a + e.macros.kcal, 0));
  });
});

describe('target changes (E)', () => {
  it('a new daily target applies from the day of the change; earlier periods keep the old one', () => {
    const before = settings();
    const after = settings({ targets: { training: { ...T, kcal: 2000 }, rest: { ...T, kcal: 2000 } } });
    const hist: TargetHistoryEntry[] = withTargetChange([], before, after, '2026-11-15');
    expect(hist).toHaveLength(2);
    expect(settingsOn('2026-11-10', after, hist).targets.training.kcal).toBe(2110);
    expect(settingsOn('2026-11-15', after, hist).targets.training.kcal).toBe(2000);
    const entries = WEEK.map((d) => entry(d, 2110));
    const old = weekBudget('2026-11-07', bundle(entries, after), hist, NOW);
    expect(old.budget).toBe(14770); // the past week still uses 2,110
    const next = weekBudget('2026-11-21', bundle([], after), hist, '2026-11-21');
    expect(next.budget).toBe(14000);
    expect(JSON.stringify(entries)).toBe(JSON.stringify(WEEK.map((d, i) => ({ ...entries[i], date: d }))));
  });
  it('several changes on the same day keep only the last one', () => {
    const a = settings(), b = settings({ targets: { training: { ...T, kcal: 2000 }, rest: { ...T, kcal: 2000 } } }), c = settings({ targets: { training: { ...T, kcal: 1950 }, rest: { ...T, kcal: 1950 } } });
    const h = withTargetChange(withTargetChange([], a, b, '2026-11-15'), b, c, '2026-11-15');
    expect(h).toHaveLength(2);
    expect(h[1].targets.training.kcal).toBe(1950);
  });
  it('training and rest days with different targets: the week is the sum of each day', () => {
    const s = settings({ targets: { training: { ...T, kcal: 2300 }, rest: { ...T, kcal: 1800 } }, trainingWeekdays: [0, 1, 2, 3, 4, 6] });
    const b = computeBudget('week', WEEK, bundle([], s), [], NOW);
    expect(b.budget).toBe(6 * 2300 + 1800);
  });
});
