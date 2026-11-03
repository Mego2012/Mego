import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, useDatabase } from '../src/lib/db';
import { addDays, startOfWeek, today } from '../src/lib/dates';
import { macrosFor } from '../src/lib/nutrition';
import {
  addFoodEntry, addRecipeEntry, buildIngredient, copyDay, getSettings, saveBodyEntry, saveRecipe, saveSettings, updateEntry,
  updateDayLog, updateFood, logItems, saveTemplate, entryToPlanItem
} from '../src/lib/repo';
import { monthReport, summarizeDay, weekComparison, weekReport, weightTrend } from '../src/lib/reports';
import { generateInsights } from '../src/lib/insights';
import { auditFoods, importParsedFoods, parseCSV, parseFoodRows } from '../src/lib/sheetImport';
import { restoreBackup, snapshot } from '../src/lib/backup';
import type { Food } from '../src/lib/types';

let n = 0;
async function freshDb() {
  useDatabase('test-' + ++n);
  const rows = parseCSV(readFileSync(new URL('./fixtures/food-sheet-sample.csv', import.meta.url), 'utf8'));
  const parsed = parseFoodRows(rows);
  await importParsedFoods(parsed.foods);
  return parsed;
}
const food = async (name: string): Promise<Food> => (await db.foods.where('nameAr').equals(name).first())!;
async function bundle() {
  return { entries: await db.entries.toArray(), days: await db.days.toArray(), body: await db.body.toArray(), settings: await getSettings() };
}

describe('sheet import & audit', () => {
  beforeEach(freshDb);
  it('detects the header below a title row and imports every record (nothing dropped)', async () => {
    const rows = parseCSV(readFileSync(new URL('./fixtures/food-sheet-sample.csv', import.meta.url), 'utf8'));
    const parsed = parseFoodRows(rows);
    expect(parsed.headerRow).toBe(2);
    expect(parsed.foods).toHaveLength(10);
    expect(await db.foods.count()).toBe(10);
    const a = auditFoods(parsed.foods);
    expect(a.raw).toBe(5);
    expect(a.cooked).toBe(2);
    expect(a.zeroValues).toBe(1);
    expect(a.flagged).toBe(2);
    expect(a.energyMismatch).toBe(1); // mixed vegetables: 77 kcal vs 4*2.5+4*13+9*0.3 = 64.7
  });
  it('placeholder 0/0/0/0 records are kept but cannot be logged', async () => {
    const f = await food('فرخة متبلة كاملة — نيء');
    expect(f.incomplete).toBe(true);
    await expect(addFoodEntry(today(), 'lunch', f, 100, 'g')).rejects.toThrow('INCOMPLETE_FOOD');
  });
  it('re-import is idempotent and never deletes', async () => {
    const parsed = parseFoodRows(parseCSV(readFileSync(new URL('./fixtures/food-sheet-sample.csv', import.meta.url), 'utf8')));
    const r = await importParsedFoods(parsed.foods);
    expect(r).toMatchObject({ added: 0, updated: 0, unchanged: 10 });
    expect(await db.foods.count()).toBe(10);
  });
});

describe('TEST 1-4: logging calculations', () => {
  beforeEach(freshDb);
  it('TEST 1: 100 g raw chicken breast', async () => {
    const e = await addFoodEntry(today(), 'lunch', await food('صدر دجاج'), 100, 'g');
    expect(e.state).toBe('raw');
    expect(e.macros).toEqual({ kcal: 120, protein: 23, carbs: 0, fat: 2.6 });
  });
  it('TEST 2: 100 g cooked chicken breast uses the cooked record', async () => {
    const e = await addFoodEntry(today(), 'lunch', await food('صدر دجاج مشوي'), 100, 'g');
    expect(e.state).toBe('cooked');
    expect(e.macros).toEqual({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 });
  });
  it('TEST 3: three eggs (55 g each from the sheet)', async () => {
    const e = await addFoodEntry(today(), 'breakfast', await food('بيض كامل'), 3, 'piece');
    expect(e.grams).toBe(165);
    expect(e.macros).toEqual({ kcal: 236, protein: 21.5, carbs: 1.8, fat: 16.5 });
  });
  it('TEST 4: three slices of whole-wheat toast (28 g per slice)', async () => {
    const e = await addFoodEntry(today(), 'breakfast', await food('توست بر (خبز أسمر)'), 3, 'slice');
    expect(e.grams).toBe(84);
    expect(e.macros).toEqual({ kcal: 207, protein: 10.9, carbs: 34.4, fat: 2.9 });
  });
  it('kg / tbsp / tsp conversions', () => {
    const basis = { per100: { kcal: 884, protein: 0, carbs: 0, fat: 100 } };
    expect(macrosFor(basis, 1, 'tbsp').macros.kcal).toBe(133); // 15 g assumed (1 g/ml)
    expect(macrosFor({ ...basis, gramsPerMl: 0.91 }, 1, 'tbsp').grams).toBe(13.7);
    expect(macrosFor(basis, 0.1, 'kg').grams).toBe(100);
    expect(macrosFor(basis, 2, 'tsp').grams).toBe(10);
  });
  it('raw and cooked rice are different records with different values', async () => {
    const raw = await addFoodEntry(today(), 'lunch', await food('أرز أبيض'), 100, 'g');
    const cooked = await addFoodEntry(today(), 'lunch', await food('أرز أبيض مطبوخ'), 100, 'g');
    expect(raw.macros.kcal).toBe(360);
    expect(cooked.macros.kcal).toBe(130);
  });
  it('double-tap duplicate prevention', async () => {
    const f = await food('صدر دجاج');
    await addFoodEntry(today(), 'dinner', f, 150, 'g');
    await expect(addFoodEntry(today(), 'dinner', f, 150, 'g')).rejects.toThrow('DUPLICATE_ENTRY');
  });
});

describe('TEST 5: recipes', () => {
  beforeEach(freshDb);
  it('totals and per-serving values', async () => {
    const ings = [
      await buildIngredient((await food('صدر دجاج')).id, 500, 'g'),
      await buildIngredient((await food('أرز أبيض')).id, 300, 'g'),
      await buildIngredient((await food('زيت زيتون')).id, 1, 'tbsp')
    ];
    const r = await saveRecipe({ name: 'كبسة دجاج', servings: 4, ingredients: ings });
    // 500g chicken 600/115/0/13 + 300g rice 1080/21/237/1.8 + 15g oil 132.6/0/0/15
    expect(r.totals).toEqual({ kcal: 1813, protein: 136, carbs: 237, fat: 29.8 });
    expect(r.perServing).toEqual({ kcal: 453, protein: 34, carbs: 59.3, fat: 7.5 });
    const e = await addRecipeEntry(today(), 'lunch', r, 1.5);
    expect(e.macros).toEqual({ kcal: 680, protein: 51, carbs: 88.9, fat: 11.2 });
  });
});

describe('TEST 6-7: editable targets propagate', () => {
  beforeEach(freshDb);
  it('calorie 2000→2200 and protein 160→170 update day summaries and reports', async () => {
    const d = addDays(today(), -1);
    await addFoodEntry(d, 'lunch', await food('صدر دجاج مشوي'), 600, 'g'); // 990 kcal, 186 g protein
    let s = await getSettings();
    expect(summarizeDay(d, await db.entries.toArray(), undefined, s).target.kcal).toBe(2000);
    s = await saveSettings((x) => { x.targets.training.kcal = 2200; x.targets.rest.kcal = 2200; x.targets.training.protein = 170; x.targets.rest.protein = 170; });
    const sum = summarizeDay(d, await db.entries.toArray(), undefined, s);
    expect(sum.target).toMatchObject({ kcal: 2200, protein: 170 });
    const wk = weekReport(d, await bundle());
    expect(wk.averageTarget).toMatchObject({ kcal: 2200, protein: 170 });
    expect(wk.proteinHitDays).toBe(1);
    const mo = monthReport(d.slice(0, 7), await bundle());
    expect(mo.averageTarget?.kcal).toBe(2200);
  });
  it('rest-day targets and per-day overrides', async () => {
    const s = await saveSettings((x) => { x.targets.rest = { kcal: 1800, protein: 160, carbs: 150, fat: 62 }; });
    const friday = (() => { let d = today(); while (new Date(d + 'T12:00').getDay() !== 5) d = addDays(d, 1); return d; })();
    expect(summarizeDay(friday, [], undefined, s).target.kcal).toBe(1800);
    const log = await updateDayLog(friday, { dayType: 'training' });
    expect(summarizeDay(friday, [], log, s).target.kcal).toBe(2000);
  });
});

describe('TEST 8-10: history and reports', () => {
  beforeEach(freshDb);
  it('TEST 8: logging on a previous date', async () => {
    const d = addDays(today(), -10);
    const e = await addFoodEntry(d, 'dinner', await food('صدر دجاج'), 200, 'g');
    expect((await db.entries.get(e.id))!.date).toBe(d);
  });
  it('TEST 9/10: weekly & monthly reports distinguish complete / partial / empty days', async () => {
    const s = await getSettings();
    const start = startOfWeek(addDays(today(), -14), s.weekStartsOn);
    const chicken = await food('صدر دجاج مشوي');
    const rice = await food('أرز أبيض مطبوخ');
    // day 0: full day ~2000 kcal; day 1: partial; day 2: full; rest empty
    for (const i of [0, 2]) {
      const d = addDays(start, i);
      await addFoodEntry(d, 'lunch', chicken, 500, 'g'); // 825 kcal, 155 P
      await addFoodEntry(d, 'dinner', rice, 900, 'g'); // 1170 kcal
    }
    await addFoodEntry(addDays(start, 1), 'breakfast', chicken, 100, 'g');
    await updateDayLog(addDays(start, 1), { status: 'partial' });
    await saveBodyEntry(start, { weight: 72.4, waist: 82 });
    await saveBodyEntry(addDays(start, 3), { weight: 72.0, waist: 81.5 });
    const r = weekReport(start, await bundle());
    expect(r.completeDays).toBe(2);
    expect(r.partialDays).toBe(1);
    expect(r.emptyDays).toBe(4);
    expect(r.averages).toEqual({ kcal: 1995, protein: 179.3, carbs: 252, fat: 20.7 });
    expect(r.caloriesInRangeDays).toBe(2);
    expect(r.proteinHitDays).toBe(2);
    expect(r.calorieConsistencyPct).toBe(100);
    expect(r.weight).toMatchObject({ start: 72.4, end: 72, average: 72.2, waistChange: -0.5 });
    // empty days are not zero-calorie days
    expect(r.days.filter((d) => d.status === 'empty').every((d) => !d.calorieInRange)).toBe(true);
    const cmp = weekComparison(addDays(start, 7), await bundle());
    expect(cmp.previous.completeDays).toBe(2);
    expect(cmp.current.completeDays).toBe(0);
    expect(cmp.delta.kcal).toBeNull();
    const m = monthReport(start.slice(0, 7), await bundle());
    expect(m.completeDays).toBeGreaterThanOrEqual(1);
  });
});

describe('TEST 11: historical entries keep their snapshot', () => {
  beforeEach(freshDb);
  it('editing a food does not change past entries, even when quantity is edited later', async () => {
    const f = await food('صدر دجاج');
    const e = await addFoodEntry(addDays(today(), -3), 'lunch', f, 200, 'g');
    expect(e.macros.kcal).toBe(240);
    await updateFood(f.id, { per100: { kcal: 110, protein: 24, carbs: 0, fat: 1.2 } });
    expect((await db.entries.get(e.id))!.macros.kcal).toBe(240);
    const edited = await updateEntry(e.id, { quantity: 100 });
    expect(edited.macros).toEqual({ kcal: 120, protein: 23, carbs: 0, fat: 2.6 });
    const after = await addFoodEntry(today(), 'lunch', await food('صدر دجاج'), 100, 'g');
    expect(after.macros.kcal).toBe(110);
    const changes = await db.foodChanges.where('foodId').equals(f.id).toArray();
    expect(changes.some((c) => c.action === 'update' && (c.before as Food).per100.kcal === 120)).toBe(true);
    // copied entries keep the original snapshot too
    const [copy] = await copyDay(addDays(today(), -3), addDays(today(), -2));
    expect(copy.macros.kcal).toBe(120);
  });
});

describe('templates, insights, backup', () => {
  beforeEach(freshDb);
  it('saved meals log in one step using current values', async () => {
    const e1 = await addFoodEntry(today(), 'breakfast', await food('بيض كامل'), 3, 'piece');
    const e2 = await addFoodEntry(today(), 'breakfast', await food('توست بر (خبز أسمر)'), 2, 'slice');
    const t = await saveTemplate({ name: 'فطوري', items: [e1, e2].map(entryToPlanItem), favorite: true });
    const r = await logItems(addDays(today(), 1), t.items);
    expect(r.logged).toHaveLength(2);
    expect(r.skipped).toHaveLength(0);
  });
  it('insights never fire without enough data and use weekly weight averages', async () => {
    const ins = generateInsights(await bundle(), today());
    expect(ins.map((i) => i.key)).toContain('notEnoughData');
    expect(ins.map((i) => i.key)).toContain('weightInsufficient');
    for (let i = 0; i < 14; i++) await saveBodyEntry(addDays(today(), -i), { weight: i < 7 ? 71.5 : 72.3 });
    expect(weightTrend(await db.body.toArray(), today())).toMatchObject({ direction: 'down', change: -0.8 });
    await saveBodyEntry(today(), { weight: 73 });
    const keys = generateInsights(await bundle(), today()).map((i) => i.key);
    expect(keys).toContain('fluctuation');
    expect(keys).not.toContain('plateauSuggestion');
  });
  it('protein-low insight from real logged data', async () => {
    const rice = await food('أرز أبيض مطبوخ');
    for (let i = 1; i <= 4; i++) await addFoodEntry(addDays(today(), -i), 'lunch', rice, 1500, 'g');
    const keys = generateInsights(await bundle(), today()).map((i) => i.key);
    expect(keys).toContain('proteinLow');
  });
  it('body entries: one per date; editing replaces', async () => {
    await saveBodyEntry('2026-10-01', { weight: 72 });
    await saveBodyEntry('2026-10-01', { weight: 71.8, waist: 82 });
    const all = await db.body.where('date').equals('2026-10-01').toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ weight: 71.8, waist: 82 });
    await expect(saveBodyEntry('2026-10-02', { weight: 7 })).rejects.toThrow();
  });
  it('backup → restore into an empty database', async () => {
    await addFoodEntry(today(), 'lunch', await food('صدر دجاج'), 100, 'g');
    const snap = await snapshot();
    useDatabase('restore-target-' + n);
    const counts = await restoreBackup(JSON.stringify(snap));
    expect(counts.entries).toBe(1);
    expect(await db.foods.count()).toBe(10);
  });
});
