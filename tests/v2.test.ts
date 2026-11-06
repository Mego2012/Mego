import { existsSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, useDatabase } from '../src/lib/db';
import { addDays, today, startOfWeek, weekDates } from '../src/lib/dates';
import { explainEnergy, gramsPerUnit, macrosFor, roundMacros } from '../src/lib/nutrition';
import {
  addFoodEntry, addWater, deleteEntries, endFast, getSettings, restoreEntries, saveBodyEntry, saveSettings, startFast, toggleHabit, updateEntry,
  addRecipeEntry, deleteEntry, duplicateRecipe
} from '../src/lib/repo';
import { monthReport, progressEstimate, summarizeDay, weekReport } from '../src/lib/reports';
import { importParsedFoods, parseCSV, parseFoodRows, parseStructuredFoods, auditFoods } from '../src/lib/sheetImport';
import { testConnection } from '../src/lib/sync';
import { computeLibrary, generatePlan, applyGeneratedPlan, materializeLibraryRecipe, shoppingList, suggest } from '../src/lib/recipeEngine';
import { LIBRARY } from '../src/lib/recipeEngine';
import { recommend, differsFromRecommendation } from '../src/lib/goals';
import { restoreBackup, snapshot } from '../src/lib/backup';
import { saveLocalBackup, restoreLocalBackup } from '../src/lib/localBackup';
import { lookupBarcode, validBarcode } from '../src/lib/barcode';
import { targetsFor } from '../src/lib/targets';
import { createGas, HUB_ID } from '../e2e/gas-mock.mjs';
import type { Food } from '../src/lib/types';

/**
 * The user's real 160-food table is kept OUT of the public repository (tests/private/, git-ignored).
 * When it is present (local runs) value-specific tests use it; otherwise a synthetic fixture with the same
 * names/categories/states but made-up values is used and value-specific tests are skipped.
 */
const REAL_PATH = new URL('./private/foods-160.csv', import.meta.url);
const REAL = existsSync(REAL_PATH);
const CSV160 = readFileSync(REAL ? REAL_PATH : new URL('./fixtures/foods-synthetic.csv', import.meta.url), 'utf8');
const itReal = it.skipIf(!REAL);
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
  itReal('energy check explains fiber / food-factor differences and flags only unexplained ones', async () => {
    expect(explainEnergy((await food('سبانخ')).per100, 'خضار')).toBeNull(); // 23 vs 29.6 kcal: < 8 kcal, treated as rounding
    expect(explainEnergy((await food('تمر')).per100, 'فاكهة')?.reason).toBe('fiber');
    expect(explainEnergy((await food('لوز')).per100, 'دهون')?.reason).toBe('nuts');
    expect(explainEnergy((await food('صدر دجاج مشوي')).per100, 'بروتين')?.reason).toBe('animal');
    expect(explainEnergy((await food('خضار مشكلة (بروكلي/سبانخ/فلفل)')).per100, 'خضار')?.reason).toBe('review');
    expect(explainEnergy((await food('صدر دجاج')).per100, 'بروتين')).toBeNull();
    const audit = auditFoods(parseFoodRows(parseCSV(CSV160)).foods);
    expect(audit.energyMismatch).toBeLessThanOrEqual(6);
  });
  itReal('raw vs cooked: 200 g raw rice ≠ 200 g cooked rice', async () => {
    const raw = await addFoodEntry(today(), 'lunch', await food('أرز أبيض'), 200, 'g');
    const cooked = await addFoodEntry(today(), 'lunch', await food('أرز أبيض مطبوخ'), 200, 'g');
    expect([raw.state, cooked.state]).toEqual(['raw', 'cooked']);
    expect(roundMacros(raw.macros).kcal).toBe(720);
    expect(roundMacros(cooked.macros).kcal).toBe(260);
  });
});

describe('nutrition engine fixes', () => {
  beforeEach(fresh160);
  itReal('many small entries do not round to zero (precision storage)', async () => {
    const d = addDays(today(), -1);
    for (let i = 0; i < 10; i++) await addFoodEntry(d, 'snacks', await food('طماطم'), 2.7 + i * 0.001, 'g');
    const s = summarizeDay(d, await db.entries.toArray(), undefined, await getSettings());
    expect(s.totals.kcal).toBe(5); // exact 4.86
  });
  itReal('completeness threshold: a past snack-only day is partial, a real day is complete', async () => {
    const s = await getSettings();
    const d1 = addDays(today(), -2), d2 = addDays(today(), -3);
    await addFoodEntry(d1, 'snacks', await food('تفاح'), 180, 'g');
    await addFoodEntry(d2, 'lunch', await food('صدر دجاج مشوي'), 800, 'g');
    const all = await db.entries.toArray();
    expect(summarizeDay(d1, all, undefined, s).status).toBe('partial');
    expect(summarizeDay(d2, all, undefined, s).status).toBe('complete');
  });
  itReal('remaining macros = target − consumed', async () => {
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
    const per = (await food('صدر دجاج مشوي')).per100.kcal;
    let s = summarizeDay(today(), await db.entries.toArray(), undefined, await getSettings());
    expect(s.totals.kcal).toBe(Math.round(per * 2));
    await restoreEntries([before]);
    s = summarizeDay(today(), await db.entries.toArray(), undefined, await getSettings());
    expect(s.totals.kcal).toBe(Math.round(per));
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
    expect(LIBRARY.length).toBeGreaterThanOrEqual(100);
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
  itReal('per-serving nutrition equals the sum of database values / servings', async () => {
    const lib = await computeLibrary();
    const k = lib.find((c) => c.lib.id === 'lib-kabsa')!;
    // 600 g raw chicken + 300 g raw basmati + 100 onion + 150 tomato + 80 carrot + 15 olive oil
    const exact = (600 * 120 + 300 * 349 + 100 * 40 + 150 * 18 + 80 * 41 + 15 * 884) / 100;
    expect(Math.round(k.totals.kcal)).toBe(Math.round(exact));
    expect(Math.round(k.perServing.kcal)).toBe(Math.round(exact / 4));
    expect(k.isEstimate).toBe(true); // uncounted seasonings are disclosed
  });
  itReal('suggestions respect remaining calories AND protein (350 kcal / 25 g P / 10 g C)', async () => {
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
  itReal('generates a week plan close to 2000/160/200/62 and a shopping list', async () => {
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
  itReal('progress estimate needs ≥ 6 weigh-ins over 2 weeks and uses a trend line', async () => {
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

describe('MEGO Nutrition Hub backend (real Code.gs v3 on an emulated Hub)', () => {
  const rows = parseCSV(CSV160).filter((r) => r.length > 1);
  it('authorizes and reports the exact Hub ID; Excel Hub is read-only (temporary copy read, then deleted)', () => {
    const gas = createGas({ foodRows: rows, token: 'tok', mode: 'xlsx' });
    expect(gas.post({ action: 'ping', token: 'bad' })).toEqual({ ok: false, error: 'unauthorized' });
    expect(gas.post({ action: 'ping' }).error).toBe('unauthorized');
    const ping = gas.post({ action: 'ping', token: 'tok' });
    expect(ping).toMatchObject({ ok: true, spreadsheetId: HUB_ID, mode: 'xlsx', writable: false, scriptVersion: 3 });
    const before = JSON.stringify(gas.sheet('قاعدة بيانات الأطعمة').data);
    const foods = gas.post({ action: 'foods', token: 'tok' });
    expect(foods).toMatchObject({ ok: true, structured: false, readOnly: true });
    expect(parseFoodRows(foods.rows).foods).toHaveLength(160);
    expect(gas.state.trashed).toEqual(gas.state.tmpFiles.map((f) => f.id)); // temp copy removed
    const push = gas.post({ action: 'push', token: 'tok', changes: [{ table: 'entries', key: 'e1', op: 'upsert', payload: { id: 'e1', date: '2026-11-06', macros: { kcal: 1 }, updatedAt: 1 } }] });
    expect(push.ok).toBe(false);
    expect(push.error).toMatch(/HUB_IS_XLSX/);
    expect(JSON.stringify(gas.sheet('قاعدة بيانات الأطعمة').data)).toBe(before);
  });
  it('migrateHub (native): backup first, rename, structured tabs, 160 foods with stable IDs, original tab untouched, idempotent', () => {
    const gas = createGas({ foodRows: rows, token: 'tok', mode: 'native' });
    const before = JSON.stringify(gas.sheet('قاعدة بيانات الأطعمة').data);
    const report = gas.migrateHub();
    expect(gas.drive.copies[0]).toMatch(/BACKUP MEGO Nutrition Hub/);
    expect(gas.ss.name).toBe('MEGO Nutrition Hub');
    for (const t of ['Food_Database', 'Food_Aliases', 'Food_Log', 'Body_Measurements', 'Weight_Log', 'Water_Log', 'Habits_Log', 'Recipes', 'Recipe_Ingredients', 'Meal_Plans', 'Shopping_List', 'Settings_App', 'Sync_Metadata', 'Deleted_Records', 'Backup_Log', 'Hub_Dashboard', 'Migration_Report'])
      expect(gas.sheetNames()).toContain(t);
    expect(gas.sheet('Food_Database').getLastRow()).toBe(161);
    expect(gas.sheet('Food_Database').data[1][0]).toBe('F0001');
    expect(JSON.stringify(gas.sheet('قاعدة بيانات الأطعمة').data)).toBe(before);
    expect(report.find((r) => r[0] === 'Food_Database rows added')![1]).toBe(160);
    expect(report.find((r) => r[0] === 'zero-value placeholders (flagged, not changed)')![1]).toBe(4);
    gas.migrateHub();
    expect(gas.sheet('Food_Database').getLastRow()).toBe(161); // no duplicates
    // the app reads the structured tab and matches by stable IDs
    const foods = gas.post({ action: 'foods', token: 'tok' });
    expect(foods.structured).toBe(true);
    const parsed = parseStructuredFoods(foods.rows);
    expect(parsed.foods).toHaveLength(160);
    const orig = parseFoodRows(parseCSV(CSV160)).foods.find((f) => f.nameAr === 'صدر دجاج')!;
    expect(parsed.foods.find((f) => f.nameAr === 'صدر دجاج')!.per100).toEqual(orig.per100);
  });
  it('push/pull, conflict detection, soft delete, data version, validation (native)', () => {
    const gas = createGas({ foodRows: rows, token: 'tok', mode: 'native' });
    gas.migrateHub();
    const e = { id: 'e1', date: '2026-11-06', meal: 'lunch', name: 'A', macros: { kcal: 120, protein: 23, carbs: 0, fat: 2.6 }, updatedAt: 200 };
    const r1 = gas.post({ action: 'push', token: 'tok', clientSchema: 2, changes: [{ table: 'entries', key: 'e1', op: 'upsert', payload: e, at: 200 }] });
    expect(r1).toMatchObject({ ok: true, applied: 1, conflicts: [], dataVersion: 1 });
    expect(gas.sheet('Food_Log').data[1].slice(0, 3)).toEqual(['e1', '2026-11-06', 'lunch']);
    const r2 = gas.post({ action: 'push', token: 'tok', changes: [{ table: 'entries', key: 'e1', op: 'upsert', payload: { ...e, name: 'OLD', updatedAt: 100 }, at: 100 }] });
    expect(r2.conflicts).toEqual([{ table: 'entries', key: 'e1' }]);
    expect(gas.post({ action: 'pull', token: 'tok' }).tables.entries[0].name).toBe('A');
    expect(gas.post({ action: 'pull', token: 'tok', since: 999 }).tables.entries).toEqual([]); // incremental
    gas.post({ action: 'push', token: 'tok', changes: [{ table: 'body', key: 'b1', op: 'upsert', payload: { id: 'b1', date: '2026-11-06', weight: 71.8, waist: 81.5, updatedAt: 5 } }] });
    expect(gas.sheet('Weight_Log').data[1].slice(0, 2)).toEqual(['2026-11-06', 71.8]);
    gas.post({ action: 'push', token: 'tok', changes: [{ table: 'entries', key: 'e1', op: 'delete', at: 300 }] });
    expect(gas.post({ action: 'pull', token: 'tok' }).tables.entries).toEqual([]);
    expect(gas.sheet('Deleted_Records').data[1].slice(0, 2)).toEqual(['entries', 'e1']);
    gas.post({ action: 'push', token: 'tok', changes: [
      { table: 'recipes', key: 'r1', op: 'upsert', payload: { id: 'r1', name: 'كبسة', servings: 4, perServing: { kcal: 500 }, ingredients: [{ foodId: 'f1', name: 'صدر دجاج', quantity: 600, unit: 'g', grams: 600, macros: { kcal: 720, protein: 138, carbs: 0, fat: 15.6 } }], updatedAt: 9 } },
      { table: 'kv', key: 'shopping:2026-11-07', op: 'upsert', payload: { key: 'shopping:2026-11-07', value: ['f1'], updatedAt: 9 } }] });
    expect(gas.sheet('Recipe_Ingredients').data[1].slice(0, 4)).toEqual(['r1', 'f1', 'صدر دجاج', 600]);
    expect(gas.sheet('Shopping_List').data[1]).toEqual(['2026-11-07', 'f1', 'yes']);
    expect(gas.post({ action: 'push', token: 'tok', changes: [{ table: 'evil', key: 'x', op: 'upsert', payload: {} }] }).ok).toBe(false);
    expect(gas.post({ action: 'push', token: 'tok', changes: [{ table: 'entries', key: 'x', op: 'upsert', payload: { date: 'bad', macros: { kcal: 1 } } }] }).ok).toBe(false);
    expect(gas.post({ action: 'push', token: 'tok', changes: [{ table: 'body', key: 'x', op: 'upsert', payload: { weight: 7 } }] }).ok).toBe(false);
    expect(gas.post({ action: 'push', token: 'tok', changes: [{ table: 'entries', key: 'x', op: 'upsert', payload: { big: 'x'.repeat(50000) } }] }).ok).toBe(false);
  });
  itReal('food write-back updates Food_Database (never the original tab), after a daily Drive backup', () => {
    const gas = createGas({ foodRows: rows, token: 'tok', mode: 'native' });
    gas.migrateHub();
    const before = JSON.stringify(gas.sheet('قاعدة بيانات الأطعمة').data);
    const r = gas.post({ action: 'saveFoods', token: 'tok', foods: [{ foodId: 'F0076', name: 'صدر دجاج', kcal: 118, protein: 23, carbs: 0, fat: 2.5, state: 'نيء', updatedAt: Date.now() }] });
    expect(r.ok).toBe(true);
    expect(gas.drive.copies.length).toBe(2); // migration backup + daily write-back backup
    expect(JSON.stringify(gas.sheet('قاعدة بيانات الأطعمة').data)).toBe(before);
    expect(gas.post({ action: 'saveFoods', token: 'tok', foods: [{ name: 'x', kcal: -5, protein: 0, carbs: 0, fat: 0 }] }).ok).toBe(false);
  });
  it('setup creates a long token; conversion keeps the .xlsx as archive', () => {
    const gas = createGas({ foodRows: rows, token: '', mode: 'xlsx' });
    gas.props.delete('APP_TOKEN');
    expect(gas.setup().length).toBe(64);
    const newId = gas.convert();
    expect(newId).toMatch(/^tmp-/);
    expect(gas.ss.name).toMatch(/original \.xlsx archive/);
  });
  it('the app refuses a backend connected to any other spreadsheet', async () => {
    useDatabase('v2-hub-' + ++n);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, spreadsheet: 'TEST COPY T2', spreadsheetId: '1toC_IJu88iXz6IbevnkZTH_PcyHe0wijKcbkopT8HnU', foodSheet: 'x' }), { status: 200 })) as typeof fetch;
    try {
      await expect(testConnection({ url: 'https://script.google.com/x', token: 't', autoSync: true, writeFoodsToSheet: false })).rejects.toThrow(/WRONG_SPREADSHEET/);
      globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, spreadsheet: 'MEGO Nutrition Hub', spreadsheetId: HUB_ID, mode: 'xlsx', writable: false }), { status: 200 })) as typeof fetch;
      await expect(testConnection({ url: 'https://script.google.com/x', token: 't', autoSync: true, writeFoodsToSheet: false })).resolves.toMatchObject({ spreadsheetId: HUB_ID });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('switch to stable Hub food IDs', () => {
  it('foods imported by name are re-keyed to F-IDs without duplicates; diary history untouched', async () => {
    await fresh160();
    const e = await addFoodEntry(today(), 'lunch', await food('صدر دجاج'), 100, 'g');
    const gas = createGas({ foodRows: parseCSV(CSV160).filter((r) => r.length > 1), token: 'tok', mode: 'native' });
    gas.migrateHub();
    const structured = parseStructuredFoods(gas.post({ action: 'foods', token: 'tok' }).rows);
    const r = await importParsedFoods(structured.foods, 'sheet');
    expect(r.added).toBe(0);
    expect(await db.foods.count()).toBe(160);
    expect((await food('صدر دجاج')).sheetKey).toMatch(/^F\d{4}$/);
    expect((await db.entries.get(e.id))!.macros).toEqual(e.macros);
  });
});
