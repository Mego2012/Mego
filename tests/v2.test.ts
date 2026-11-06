import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, useDatabase } from '../src/lib/db';
import { addDays, today, startOfWeek, weekDates } from '../src/lib/dates';
import { explainEnergy, gramsPerUnit, macrosFor, roundMacros } from '../src/lib/nutrition';
import {
  addFoodEntry, addWater, deleteEntries, endFast, getSettings, restoreEntries, saveBodyEntry, saveSettings, startFast, toggleHabit, updateEntry,
  addRecipeEntry, deleteEntry, duplicateRecipe
} from '../src/lib/repo';
import { monthReport, progressEstimate, summarizeDay, weekReport } from '../src/lib/reports';
import { importParsedFoods, parseCSV, parseFoodRows, auditFoods } from '../src/lib/sheetImport';
import { computeLibrary, generatePlan, applyGeneratedPlan, materializeLibraryRecipe, shoppingList, suggest } from '../src/lib/recipeEngine';
import { LIBRARY } from '../src/lib/recipeLibraryData';
import { recommend, differsFromRecommendation } from '../src/lib/goals';
import { restoreBackup, snapshot } from '../src/lib/backup';
import { saveLocalBackup, restoreLocalBackup } from '../src/lib/localBackup';
import { lookupBarcode, validBarcode } from '../src/lib/barcode';
import { targetsFor } from '../src/lib/targets';
import { createGas } from '../e2e/gas-mock.mjs';
import type { Food } from '../src/lib/types';

const CSV160 = readFileSync(new URL('./fixtures/foods-160.csv', import.meta.url), 'utf8');
let n = 0;
async function fresh160() {
  useDatabase('v2-' + ++n);
  const parsed = parseFoodRows(parseCSV(CSV160));
  await importParsedFoods(parsed.foods);
  return parsed;
}
const food = async (name: string): Promise<Food> => (await db.foods.where('nameAr').equals(name).first())!;
const bundle = async () => ({ entries: await db.entries.toArray(), days: await db.days.toArray(), body: await db.body.toArray(), settings: await getSettings() });

describe('food database (160 records)', () => {
  beforeEach(fresh160);
  it('imports all 160 rows exactly, nothing changed', async () => {
    const parsed = parseFoodRows(parseCSV(CSV160));
    expect(parsed.foods).toHaveLength(160);
    expect(await db.foods.count()).toBe(160);
    for (const p of parsed.foods) {
      const f = (await db.foods.where('sheetKey').equals(p.sheetKey).first())!;
      expect(f.per100).toEqual(p.per100);
    }
    const a = auditFoods(parsed.foods);
    expect(a).toMatchObject({ raw: 71, cooked: 61, other: 28, zeroValues: 4, missingValues: 0, duplicates: 0 });
  });
  it('energy check explains fiber / food-factor differences and flags only unexplained ones', async () => {
    expect(explainEnergy((await food('سبانخ')).per100, 'خضار')).toBeNull(); // 23 vs 29.6 kcal: < 8 kcal, treated as rounding
    expect(explainEnergy((await food('تمر')).per100, 'فاكهة')?.reason).toBe('fiber');
    expect(explainEnergy((await food('لوز')).per100, 'دهون')?.reason).toBe('nuts');
    expect(explainEnergy((await food('صدر دجاج مشوي')).per100, 'بروتين')?.reason).toBe('animal');
    expect(explainEnergy((await food('خضار مشكلة (بروكلي/سبانخ/فلفل)')).per100, 'خضار')?.reason).toBe('review');
    expect(explainEnergy((await food('صدر دجاج')).per100, 'بروتين')).toBeNull();
    const audit = auditFoods(parseFoodRows(parseCSV(CSV160)).foods);
    expect(audit.energyMismatch).toBeLessThanOrEqual(6);
  });
  it('raw vs cooked: 200 g raw rice ≠ 200 g cooked rice', async () => {
    const raw = await addFoodEntry(today(), 'lunch', await food('أرز أبيض'), 200, 'g');
    const cooked = await addFoodEntry(today(), 'lunch', await food('أرز أبيض مطبوخ'), 200, 'g');
    expect([raw.state, cooked.state]).toEqual(['raw', 'cooked']);
    expect(roundMacros(raw.macros).kcal).toBe(720);
    expect(roundMacros(cooked.macros).kcal).toBe(260);
  });
});

describe('nutrition engine fixes', () => {
  beforeEach(fresh160);
  it('many small entries do not round to zero (precision storage)', async () => {
    const d = addDays(today(), -1);
    for (let i = 0; i < 10; i++) await addFoodEntry(d, 'snacks', await food('طماطم'), 2.7 + i * 0.001, 'g');
    const s = summarizeDay(d, await db.entries.toArray(), undefined, await getSettings());
    expect(s.totals.kcal).toBe(5); // exact 4.86
  });
  it('completeness threshold: a past snack-only day is partial, a real day is complete', async () => {
    const s = await getSettings();
    const d1 = addDays(today(), -2), d2 = addDays(today(), -3);
    await addFoodEntry(d1, 'snacks', await food('تفاح'), 180, 'g');
    await addFoodEntry(d2, 'lunch', await food('صدر دجاج مشوي'), 800, 'g');
    const all = await db.entries.toArray();
    expect(summarizeDay(d1, all, undefined, s).status).toBe('partial');
    expect(summarizeDay(d2, all, undefined, s).status).toBe('complete');
  });
  it('remaining macros = target − consumed', async () => {
    await addFoodEntry(today(), 'lunch', await food('صدر دجاج مشوي'), 200, 'g');
    const s = summarizeDay(today(), await db.entries.toArray(), undefined, await getSettings());
    expect(s.remaining).toEqual({ kcal: 2000 - 330, protein: 160 - 62, carbs: 200, fat: 62 - 7.2 });
  });
  it('cup / litre units and unit gram labels', async () => {
    const milk = await food('حليب قليل الدسم');
    const basis = { per100: milk.per100, pieceGrams: milk.pieceGrams };
    expect(macrosFor(basis, 1, 'cup').grams).toBe(240);
    expect(macrosFor(basis, 0.5, 'l').grams).toBe(500);
    expect(gramsPerUnit({ per100: milk.per100, pieceGrams: 55 }, 'piece')).toBe(55);
  });
  it('editing quantity updates totals immediately; undo restores', async () => {
    const e = await addFoodEntry(today(), 'lunch', await food('صدر دجاج مشوي'), 100, 'g');
    const before = structuredClone(e);
    await updateEntry(e.id, { quantity: 200 });
    let s = summarizeDay(today(), await db.entries.toArray(), undefined, await getSettings());
    expect(s.totals.kcal).toBe(330);
    await restoreEntries([before]);
    s = summarizeDay(today(), await db.entries.toArray(), undefined, await getSettings());
    expect(s.totals.kcal).toBe(165);
    await deleteEntries([e.id]);
    expect(await db.entries.count()).toBe(0);
  });
  it('recipe entry grams follow the servings when edited', async () => {
    const r = await materializeLibraryRecipe('lib-kabsa');
    const e = await addRecipeEntry(today(), 'lunch', r, 1);
    const e2 = await updateEntry(e.id, { quantity: 2 });
    expect(e2.grams).toBe(e.grams * 2);
    await deleteEntry(e.id);
    const dup = await duplicateRecipe(r.id);
    expect(roundMacros(dup.totals)).toEqual(roundMacros(r.totals));
  });
});

describe('import validation', () => {
  it('missing values block logging; decimal comma is read correctly and reported', async () => {
    useDatabase('v2-import-' + ++n);
    const rows = [['الاسم', 'سعرات', 'بروتين', 'كارب', 'دهون', 'الألياف'], ['a', '120', '23', '0', '', ''], ['b', '120', '2,6', '20', '1', '3']];
    const p = parseFoodRows(rows);
    expect(p.foods[0].missingValues).toBe(true);
    expect(p.foods[1].per100).toEqual({ kcal: 120, protein: 2.6, carbs: 20, fat: 1, fiber: 3 });
    expect(p.foods[1].issues).toContain('decimalComma');
    await importParsedFoods(p.foods);
    const a = (await db.foods.where('nameAr').equals('a').first())!;
    expect(a.incomplete).toBe(true);
    await expect(addFoodEntry(today(), 'lunch', a, 100, 'g')).rejects.toThrow('INCOMPLETE_FOOD');
  });
});

describe('recipe library', () => {
  beforeEach(fresh160);
  it('has ≥ 50 complete recipes, all computable from the user database', async () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(50);
    const lib = await computeLibrary();
    const broken = lib.filter((c) => !c.ok).map((c) => `${c.lib.id}: ${c.missing.join(',')}`);
    expect(broken).toEqual([]);
    for (const c of lib) {
      expect(c.lib.stepsAr.length).toBeGreaterThan(0);
      expect(c.lib.stepsEn.length).toBe(c.lib.stepsAr.length);
      expect(c.lib.nameEn && c.lib.nameAr).toBeTruthy();
      expect(c.perServing.kcal).toBeGreaterThan(0);
    }
    const ids = new Set(LIBRARY.map((l) => l.id));
    expect(ids.size).toBe(LIBRARY.length);
    const tags = (t: string) => lib.filter((c) => (c.lib.tags as string[]).includes(t) || (c.derived as string[]).includes(t)).length;
    for (const t of ['high-protein', 'low-calorie', 'low-carb', 'chicken', 'eggs', 'rice', 'fish', 'meat', 'sandwich', 'meal-prep', 'high-fiber']) expect(tags(t)).toBeGreaterThan(0);
    expect(lib.every((c) => !c.lib.ingredients.some((i) => i[0].includes('شوفان')))).toBe(true);
  });
  it('per-serving nutrition equals the sum of database values / servings', async () => {
    const lib = await computeLibrary();
    const k = lib.find((c) => c.lib.id === 'lib-kabsa')!;
    // 600 g raw chicken + 300 g raw basmati + 100 onion + 150 tomato + 80 carrot + 15 olive oil
    const exact = (600 * 120 + 300 * 349 + 100 * 40 + 150 * 18 + 80 * 41 + 15 * 884) / 100;
    expect(Math.round(k.totals.kcal)).toBe(Math.round(exact));
    expect(Math.round(k.perServing.kcal)).toBe(Math.round(exact / 4));
    expect(k.isEstimate).toBe(true); // uncounted seasonings are disclosed
  });
  it('suggestions respect remaining calories AND protein (350 kcal / 25 g P / 10 g C)', async () => {
    const lib = await computeLibrary();
    const rem = { kcal: 350, protein: 25, carbs: 10, fat: 15 };
    const list = suggest(rem, 1, lib, [], { maxCarbs: 10 });
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) {
      expect(s.macros.kcal).toBeLessThanOrEqual(350 * 1.05 + 20);
      expect(s.macros.carbs).toBeLessThanOrEqual(10);
      expect(s.macros.protein).toBeGreaterThanOrEqual(8.75);
    }
    // no carb filter: still never just "low calorie without protein"
    for (const s of suggest(rem, 1, lib, [])) expect(s.macros.protein).toBeGreaterThanOrEqual(8.75);
    expect(suggest({ kcal: 30, protein: 0, carbs: 0, fat: 0 }, 1, lib, [])).toEqual([]);
  });
  it('generates a week plan close to 2000/160/200/62 and a shopping list', async () => {
    const lib = await computeLibrary();
    const s = await getSettings();
    const dates = weekDates(startOfWeek(today(), 6));
    const plan = generatePlan(dates, (d) => targetsFor(d, s), lib);
    expect(plan).toHaveLength(7);
    for (const d of plan) {
      expect(d.total.kcal).toBeGreaterThan(2000 * 0.85);
      expect(d.total.kcal).toBeLessThanOrEqual(2000 * 1.08);
      expect(d.total.protein).toBeGreaterThan(160 * 0.8);
    }
    const lunches = new Set(plan.map((d) => d.picks.find((p) => p.meal === 'lunch')!.libId));
    expect(lunches.size).toBeGreaterThan(3);
    await applyGeneratedPlan(plan.slice(0, 2));
    const shop = await shoppingList(dates);
    expect(shop.length).toBeGreaterThan(3);
    expect(shop.every((i) => i.grams > 0)).toBe(true);
  });
});

describe('goals', () => {
  it('default goal and recommendation never auto-overwrite targets', async () => {
    useDatabase('v2-goal-' + ++n);
    const s = await getSettings();
    expect(s.profile.goalType).toBe('fat_loss_preserve');
    const r = recommend(s.profile);
    expect(r.targets!.protein).toBe(Math.round(72 * 2.2));
    expect(r.targets!.kcal).toBeGreaterThanOrEqual(r.bmr);
    expect(r.targets!.kcal).toBeLessThan(r.tdee);
    expect(recommend(s.profile, 'custom').targets).toBeNull();
    expect(recommend(s.profile, 'lean_bulk').targets!.kcal).toBeGreaterThan(r.tdee);
    await saveSettings((x) => { x.profile.goalType = 'bulk'; });
    const after = await getSettings();
    expect(after.targets.training).toEqual({ kcal: 2000, protein: 160, carbs: 200, fat: 62 });
    expect(differsFromRecommendation(after.targets.training, recommend(after.profile))).toBe(true);
  });
});

describe('body progress, water, habits, fasting', () => {
  beforeEach(fresh160);
  it('progress estimate needs ≥ 6 weigh-ins over 2 weeks and uses a trend line', async () => {
    expect(progressEstimate(await db.body.toArray(), 68).pace).toBe('insufficient');
    for (let i = 0; i < 21; i += 3) await saveBodyEntry(addDays(today(), -20 + i), { weight: 72 - (i / 7) * 0.5 });
    const e = progressEstimate(await db.body.toArray(), 68);
    expect(e.ratePerWeek).toBeCloseTo(-0.5, 1);
    expect(e.pace).toBe('healthy');
    expect(e.weeksToTarget).toBeGreaterThan(5);
  });
  it('water, habits and fasting persist', async () => {
    await addWater(today(), 500);
    await addWater(today(), 250);
    await toggleHabit(today(), 'h-veg');
    const log = await db.days.get(today());
    expect(log?.waterMl).toBe(750);
    expect(log?.habits?.['h-veg']).toBe(true);
    const f = await startFast(16, Date.now() - 17 * 3600000);
    await expect(startFast(16)).rejects.toThrow();
    const done = await endFast(f.id);
    expect((done!.end! - done!.start) / 3600000).toBeGreaterThan(16);
    const w = weekReport(today(), await bundle());
    expect(w.avgWaterMl).toBe(750);
    expect(monthReport(today().slice(0, 7), await bundle()).waterDays).toBe(1);
  });
});

describe('backups', () => {
  beforeEach(fresh160);
  it('validates backup files before restoring', async () => {
    await expect(restoreBackup('not json')).rejects.toThrow();
    await expect(restoreBackup(JSON.stringify({ format: 'mego-nutrition-backup', tables: { entries: [{ id: 'x' }] } }))).rejects.toThrow();
  });
  it('local backup → change → restore brings data back (merge, nothing deleted)', async () => {
    const e = await addFoodEntry(today(), 'lunch', await food('صدر دجاج'), 100, 'g');
    const b = await saveLocalBackup('manual');
    await db.entries.delete(e.id);
    await restoreLocalBackup(b.id!);
    expect(await db.entries.get(e.id)).toBeTruthy();
    expect((await db.backups.toArray()).some((x) => x.reason === 'pre-restore')).toBe(true);
    const snap = await snapshot();
    expect(snap.tables.foods).toHaveLength(160);
  });
});

describe('barcode', () => {
  it('validates check digits and maps Open Food Facts data (mocked network)', async () => {
    expect(validBarcode('5449000000996')).toBe(true);
    expect(validBarcode('5449000000997')).toBe(false);
    const fake = (async () => new Response(JSON.stringify({ status: 1, product: { product_name: 'Greek yogurt 2%', brands: 'Almarai', serving_quantity: 170, nutriments: { 'energy-kcal_100g': 73, proteins_100g: 10, carbohydrates_100g: 4, fat_100g: 1.5, sugars_100g: 4, sodium_100g: 0.04 } } }), { status: 200 })) as unknown as typeof fetch;
    const p = await lookupBarcode('5449000000996', fake);
    expect(p).toMatchObject({ name: 'Greek yogurt 2%', brand: 'Almarai', complete: true, per100: { kcal: 73, protein: 10, carbs: 4, fat: 1.5, sugar: 4, sodium: 40 } });
    const notFound = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    expect(await lookupBarcode('5449000000996', notFound)).toBeNull();
  });
});

describe('Apps Script backend (real Code.gs on an emulated spreadsheet)', () => {
  const rows = parseCSV(CSV160).filter((r) => r.length > 1);
  it('authorizes, reads the food tab, never writes it by default', () => {
    const gas = createGas({ foodRows: rows, token: 'tok' });
    expect(gas.post({ action: 'ping', token: 'bad' })).toEqual({ ok: false, error: 'unauthorized' });
    const ping = gas.post({ action: 'ping', token: 'tok' });
    expect(ping).toMatchObject({ ok: true, foodSheet: 'قاعدة بيانات الأطعمة', scriptVersion: 2 });
    const foods = gas.post({ action: 'foods', token: 'tok' });
    expect(parseFoodRows(foods.rows).foods).toHaveLength(160);
    const before = JSON.stringify(gas.sheet('قاعدة بيانات الأطعمة').data);
    gas.post({ action: 'push', token: 'tok', changes: [{ table: 'entries', key: 'e1', op: 'upsert', payload: { id: 'e1', updatedAt: 1 }, at: 1 }] });
    expect(JSON.stringify(gas.sheet('قاعدة بيانات الأطعمة').data)).toBe(before);
  });
  it('push/pull round trip, conflict detection, soft delete, data version, validation', () => {
    const gas = createGas({ foodRows: rows, token: 'tok' });
    const r1 = gas.post({ action: 'push', token: 'tok', clientSchema: 2, changes: [{ table: 'entries', key: 'e1', op: 'upsert', payload: { id: 'e1', name: 'A', updatedAt: 200 }, at: 200 }] });
    expect(r1).toMatchObject({ ok: true, applied: 1, conflicts: [], dataVersion: 1 });
    // an older copy from an offline device must not overwrite
    const r2 = gas.post({ action: 'push', token: 'tok', changes: [{ table: 'entries', key: 'e1', op: 'upsert', payload: { id: 'e1', name: 'OLD', updatedAt: 100 }, at: 100 }] });
    expect(r2.conflicts).toEqual([{ table: 'entries', key: 'e1' }]);
    expect(gas.post({ action: 'pull', token: 'tok' }).tables.entries[0].name).toBe('A');
    // delete moves the row to APP_trash
    gas.post({ action: 'push', token: 'tok', changes: [{ table: 'entries', key: 'e1', op: 'delete', at: 300 }] });
    expect(gas.post({ action: 'pull', token: 'tok' }).tables.entries).toEqual([]);
    expect(gas.sheet('APP_trash').getLastRow()).toBe(2); // header + trashed row
    // validation
    expect(gas.post({ action: 'push', token: 'tok', changes: [{ table: 'evil', key: 'x', op: 'upsert', payload: {} }] }).ok).toBe(false);
    expect(gas.post({ action: 'push', token: 'tok', changes: [{ table: 'entries', key: 'x', op: 'upsert', payload: { big: 'x'.repeat(50000) } }] }).ok).toBe(false);
  });
  it('optional food write-back backs the tab up first and logs before/after', () => {
    const gas = createGas({ foodRows: rows, token: 'tok' });
    const r = gas.post({ action: 'saveFoods', token: 'tok', foods: [{ sheetKey: 'صدر دجاج', sheetRow: 0, name: 'صدر دجاج', kcal: 118, protein: 23, carbs: 0, fat: 2.5, state: 'نيء' }] });
    expect(r).toMatchObject({ ok: true, updated: 1, appended: 0 });
    expect(gas.sheetNames().some((x) => x.startsWith('BACKUP_Foods_'))).toBe(true);
    expect(gas.sheet('APP_FoodSheetLog').getLastRow()).toBeGreaterThan(1);
    expect(gas.post({ action: 'saveFoods', token: 'tok', foods: [{ name: 'x', kcal: -5, protein: 0, carbs: 0, fat: 0 }] }).ok).toBe(false);
  });
  it('setup() makes a full spreadsheet copy before anything else', () => {
    const gas = createGas({ foodRows: rows, token: '' });
    gas.props.delete('APP_TOKEN');
    const token = gas.setup();
    expect(token.length).toBeGreaterThan(30);
    expect(gas.drive.copies[0]).toMatch(/FULL BACKUP/);
  });
});
