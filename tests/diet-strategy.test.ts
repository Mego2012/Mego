import { describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { computeMacros, cycleDay, cycleTargets, defaultSchedule, DIET_MODES, modeDefaults, rebalance, strategyTargets, type DietStrategy } from '../src/lib/dietStrategy';
import { getSettings, saveSettings } from '../src/lib/repo';
import { targetsFor } from '../src/lib/targets';
import type { Macros } from '../src/lib/types';

const sumKcal = (m: Macros) => 4 * m.protein + 4 * m.carbs + 9 * m.fat;
const W = 72;

describe('diet strategy engine', () => {
  it('every mode adds up: 4·P + 4·C + 9·F matches the calorie target within one gram of the balancing macro', () => {
    for (const kcal of [1500, 2110, 2570, 3200]) for (const mode of DIET_MODES.filter((m) => m !== 'carb_cycling' && m !== 'custom')) {
      const r = computeMacros(mode, kcal, modeDefaults(mode, kcal, W));
      expect(r.macros.kcal).toBe(kcal);
      expect(Math.abs(sumKcal(r.macros) - kcal), `${mode} ${kcal}`).toBeLessThanOrEqual(5);
    }
  });
  it('flexible keeps protein and fat, carbs balance; keto / low-carb keep carbs, fat balances', () => {
    const f = computeMacros('flexible', 2110, { protein: 158, carbs: 0, fat: 59 }).macros;
    expect(f).toEqual({ kcal: 2110, protein: 158, carbs: 237, fat: 59 }); // = the saved 2,110 target's split
    const k = computeMacros('keto', 2110, modeDefaults('keto', 2110, W));
    expect(k.macros.carbs).toBe(25);
    expect(k.macros.fat).toBeGreaterThan(150);
    expect(k.warnings).toEqual([]);
    expect(computeMacros('keto', 2110, { protein: 130, carbs: 80, fat: 0 }).warnings).toContain('diet_w_ketoCarbs');
    const lc = computeMacros('low_carb', 2110, { protein: 144, carbs: 100, fat: 0 }).macros;
    expect(lc.carbs).toBe(100);
    expect(Math.abs(sumKcal(lc) - 2110)).toBeLessThanOrEqual(5);
  });
  it('high protein gets at least 30 % of calories from protein by default; custom = exactly the sum of its macros', () => {
    const hp = computeMacros('high_protein', 2110, modeDefaults('high_protein', 2110, W)).macros;
    expect((hp.protein * 4) / 2110).toBeGreaterThanOrEqual(0.3);
    const c = computeMacros('custom', 9999, { protein: 150, carbs: 200, fat: 70 }).macros;
    expect(c.kcal).toBe(150 * 4 + 200 * 4 + 70 * 9);
  });
  it('too few calories for the chosen protein/carbs is flagged, never negative grams', () => {
    const r = computeMacros('keto', 900, { protein: 200, carbs: 30, fat: 0 });
    expect(r.warnings).toContain('diet_w_tooLow');
    expect(r.macros.fat).toBeGreaterThanOrEqual(0);
    expect(computeMacros('flexible', 900, { protein: 200, carbs: 0, fat: 80 }).macros.carbs).toBe(0);
  });
  it('carb cycling: same protein every day, each day adds up, weekly average = base target', () => {
    const schedule = defaultSchedule([6, 0, 1, 2, 3, 4], 6); // Saturday–Thursday training, Friday rest
    expect(schedule[5]).toBe('rest');
    expect(schedule.filter((l) => l === 'high')).toHaveLength(2);
    const lv = cycleTargets(2110, 158, schedule);
    for (const l of ['high', 'moderate', 'low', 'rest'] as const) {
      expect(lv[l].protein).toBe(158);
      expect(Math.abs(sumKcal(lv[l]) - lv[l].kcal)).toBeLessThanOrEqual(5);
    }
    expect(lv.high.carbs).toBeGreaterThan(lv.moderate.carbs);
    expect(lv.moderate.carbs).toBeGreaterThan(lv.low.carbs);
    const avg = schedule.reduce((a, l) => a + lv[l].kcal, 0) / 7;
    expect(Math.abs(avg - 2110)).toBeLessThanOrEqual(10);
    const over = cycleTargets(2110, 158, schedule, { low: { kcal: 1600, protein: 160, carbs: 60, fat: 80 } });
    expect(over.low).toEqual({ kcal: 1600, protein: 160, carbs: 60, fat: 80 }); // hand-set level kept
  });
  it('rebalance keeps the strategy character when calories change (e.g. a Goals recommendation)', () => {
    const keto: DietStrategy = { mode: 'keto', kcal: 2110, protein: 130, carbs: 25, fat: 166, appliedAt: 1 };
    const r = rebalance(keto, { kcal: 2010, protein: 130, carbs: 237, fat: 59 });
    expect(r.carbs).toBe(25);
    expect(r.kcal).toBe(2010);
    expect(rebalance(undefined, { kcal: 2010, protein: 1, carbs: 2, fat: 3 })).toEqual({ kcal: 2010, protein: 1, carbs: 2, fat: 3 });
  });
});

describe('diet strategy in the app (targets per day, data untouched)', () => {
  it('without a strategy the saved targets are used exactly as before', async () => {
    const s = await getSettings();
    expect(s.dietStrategy).toBeUndefined();
    expect(targetsFor('2026-11-13', s)).toEqual(s.targets[s.trainingWeekdays.includes(5) ? 'training' : 'rest']);
  });
  it('switching strategies changes only settings: diary, weight and workout records stay identical', async () => {
    await db.entries.put({ id: 'e1', date: '2026-11-10', meal: 'lunch', name: 'x', state: 'cooked', quantity: 100, unit: 'g', grams: 100, basis: {}, macros: { kcal: 200, protein: 20, carbs: 10, fat: 5 }, order: 0, createdAt: 1, updatedAt: 1 } as never);
    await db.body.put({ id: 'b1', date: '2026-11-10', weight: 72, notes: '', createdAt: 1, updatedAt: 1 });
    await db.kv.put({ key: 'workout:w1', value: { id: 'w1' }, updatedAt: 1 });
    const snap = async () => JSON.stringify([await db.entries.toArray(), await db.body.toArray(), await db.kv.get('workout:w1')]);
    const before = await snap();
    for (const mode of ['keto', 'carb_cycling', 'flexible', 'custom'] as const) {
      const cur = await getSettings();
      const d = modeDefaults(mode, 2110, 72, cur.targets.training);
      const strat: DietStrategy = { mode, kcal: 2110, ...d, appliedAt: Date.now(), previousTargets: cur.targets, ...(mode === 'carb_cycling' ? { cycle: { schedule: defaultSchedule(cur.trainingWeekdays) } } : {}) };
      const m = strategyTargets(strat);
      await saveSettings((s) => { s.dietStrategy = strat; s.targets = { training: m, rest: m }; });
    }
    expect(await snap()).toBe(before);
  });
  it('carb cycling: each weekday gets its level; a diary override and a day marked rest win', async () => {
    const cur = await getSettings();
    const schedule = defaultSchedule(cur.trainingWeekdays, cur.weekStartsOn);
    const strat: DietStrategy = { mode: 'carb_cycling', kcal: 2110, protein: 158, carbs: 0, fat: 0, appliedAt: 1, cycle: { schedule } };
    const s = await saveSettings((x) => { x.dietStrategy = strat; x.targets = { training: strategyTargets(strat), rest: strategyTargets(strat) }; });
    const friday = '2026-11-13'; // weekday 5
    expect(cycleDay(friday, s)!.level).toBe(schedule[5]);
    expect(targetsFor(friday, s)).toEqual(cycleDay(friday, s)!.targets);
    expect(cycleDay('2026-11-14', s, { date: '2026-11-14', dayType: 'rest' } as never)!.level).toBe('rest');
    const o = { kcal: 1800, protein: 150, carbs: 150, fat: 60 };
    expect(targetsFor(friday, s, { date: friday, targetsOverride: o } as never)).toEqual(o);
  });
});

describe('meal plans and suggestions follow the strategy', () => {
  it('a keto day gets a much lower-carb generated plan than a flexible day; strict suggestions never exceed the carbs left', async () => {
    const { readFileSync } = await import('node:fs');
    const { setRefData, refById } = await import('../src/lib/refFoods');
    const { computeLibraryRecipe, generatePlan, indexFoods, LIBRARY, suggest } = await import('../src/lib/recipeEngine');
    setRefData(JSON.parse(readFileSync('public/fooddb/usda.json', 'utf8')));
    const lib = LIBRARY.map((l) => computeLibraryRecipe(l, indexFoods([]), refById));
    const flex = computeMacros('flexible', 2110, { protein: 158, carbs: 0, fat: 59 }).macros;
    const keto = computeMacros('keto', 2110, modeDefaults('keto', 2110, 72)).macros;
    const pf = generatePlan(['2026-11-16'], () => flex, lib)[0];
    const pk = generatePlan(['2026-11-16'], () => keto, lib)[0];
    expect(pk.total.carbs).toBeLessThan(pf.total.carbs * 0.6);
    const rem = { kcal: 700, protein: 50, carbs: 15, fat: 50 };
    for (const s of suggest(rem, 1, lib, [], { carbStrict: true })) expect(s.macros.carbs).toBeLessThanOrEqual(20);
  }, 60000);
});

describe('carb cycling stays aligned with the weekly target', () => {
  it('(2) hand-set days: the automatic days absorb the difference so the week still equals 7 × base', async () => {
    const { cycleWeek } = await import('../src/lib/dietStrategy');
    const schedule = defaultSchedule([6, 0, 1, 2, 3, 4], 6);
    const w = cycleWeek(2110, 158, schedule, { high: { kcal: 2700, protein: 158, carbs: 400, fat: 58 } });
    expect(w.levels.high.kcal).toBe(2700);
    expect(w.aligned).toBe(true);
    expect(Math.abs(w.weeklyKcal - 7 * 2110)).toBeLessThanOrEqual(7 * 2110 * 0.01);
    const impossible = cycleWeek(2110, 158, schedule, { high: { kcal: 4500, protein: 158, carbs: 800, fat: 58 } });
    expect(impossible.aligned).toBe(false); // flagged instead of starving the other days
    expect(Math.min(impossible.levels.low.kcal, impossible.levels.rest.kcal)).toBeGreaterThanOrEqual(Math.round(2110 * 0.7 / 10) * 10);
  });
  it('(3) protein / fat minimum warnings in every mode when the body weight is known', () => {
    expect(computeMacros('keto', 2110, { protein: 80, carbs: 25, fat: 0 }, 72).warnings).toContain('diet_w_proteinMin');
    expect(computeMacros('custom', 0, { protein: 160, carbs: 300, fat: 30 }, 72).warnings).toContain('diet_w_fatMin');
    expect(computeMacros('flexible', 2110, { protein: 158, carbs: 0, fat: 59 }, 72).warnings).toEqual([]);
  });
});

describe('strategy history', () => {
  it('(4) each change closes the open period; a second change on the same day replaces it; nothing else is written', async () => {
    const { readHistory, recordStrategyChange } = await import('../src/lib/dietHistory');
    const before = await db.entries.count();
    await recordStrategyChange('keto', 2110, '2026-10-01');
    await recordStrategyChange('flexible', 2110, '2026-10-20');
    await recordStrategyChange('high_protein', 2110, '2026-10-20'); // same day → replaces flexible
    await recordStrategyChange('none', 2110, '2026-11-05');
    const h = await readHistory();
    expect(h.map((x) => [x.mode, x.start, x.end ?? null])).toEqual([['keto', '2026-10-01', '2026-10-19'], ['high_protein', '2026-10-20', '2026-11-04'], ['none', '2026-11-05', null]]);
    expect(await db.entries.count()).toBe(before);
  });
});
