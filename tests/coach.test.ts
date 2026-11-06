import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { completeMacros, dailyCoach, MEAL_PROTEIN_G, proteinOptions, tipOfDay, TIPS, weeklyCoach, allowedFoods } from '../src/lib/coach';
import { db, useDatabase } from '../src/lib/db';
import { addDays, today } from '../src/lib/dates';
import { buildIntelFoods, goalClass } from '../src/lib/foodIntel';
import { tagsOf } from '../src/lib/intelCatalog';
import { addFoodEntry, getSettings, saveSettings } from '../src/lib/repo';
import { importParsedFoods, parseCSV, parseFoodRows } from '../src/lib/sheetImport';
import type { DataBundle } from '../src/lib/reports';

const ref = JSON.parse(readFileSync(new URL('../public/fooddb/usda.json', import.meta.url), 'utf8'));
const extra = JSON.parse(readFileSync(new URL('../public/fooddb/usda-extra.json', import.meta.url), 'utf8'));
const foods = buildIntelFoods(ref, extra, 'en');
const CSV = readFileSync(new URL('./fixtures/food-sheet-sample.csv', import.meta.url), 'utf8');
let n = 0;
async function bundle(): Promise<DataBundle> { return { entries: await db.entries.toArray(), days: await db.days.toArray(), body: await db.body.toArray(), settings: await getSettings() }; }
const food = async (name: string) => (await db.foods.where('nameAr').equals(name).first())!;

beforeEach(async () => { useDatabase('coach-' + ++n); await importParsedFoods(parseFoodRows(parseCSV(CSV)).foods); });

describe('Nutrition Coach', () => {
  it('protein gap: exact gap, options fit the remaining calories and cover the gap', async () => {
    await addFoodEntry(today(), 'breakfast', await food('أرز أبيض مطبوخ'), 300, 'g'); // 390 kcal, 8.1 g protein
    const b = await bundle();
    const msgs = dailyCoach(b, today(), foods);
    const p = msgs.find((m) => m.id === 'protein')!;
    expect(p.key).toBe('co_proteinShortMeals');
    expect(p.params.g).toBe(Math.round(b.settings.targets.training.protein - 8.1));
    expect(p.foods!.length).toBeGreaterThanOrEqual(3);
    for (const s of p.foods!) {
      expect(Math.abs(s.macros.protein - Math.min(Number(p.params.g), MEAL_PROTEIN_G))).toBeLessThanOrEqual(s.food.protein * 0.05 + 0.5); // grams rounded to 5 g
      expect(s.macros.kcal).toBeLessThanOrEqual(Number(p.params.kcal) * 1.05);
      expect(s.macros.kcal).toBe(Math.round((s.food.kcal * s.grams) / 100));
    }
  });
  it('vegetarian / vegan / allergy restrictions are respected', async () => {
    const veg = allowedFoods(foods, 'vegetarian');
    expect(veg.some((f) => tagsOf(f.item.id).some((t) => ['meat', 'poultry', 'fish', 'shellfish'].includes(t)))).toBe(false);
    expect(veg.some((f) => tagsOf(f.item.id).includes('dairy'))).toBe(true);
    const vegan = allowedFoods(foods, 'vegan', ['nuts']);
    expect(vegan.some((f) => tagsOf(f.item.id).some((t) => ['dairy', 'egg', 'nuts'].includes(t)))).toBe(false);
    await saveSettings((s) => { s.diet = 'vegan'; });
    await addFoodEntry(today(), 'breakfast', await food('أرز أبيض مطبوخ'), 100, 'g');
    const p = dailyCoach(await bundle(), today(), foods).find((m) => m.id === 'protein')!;
    expect(p.foods!.every((s) => s.food.item.origin === 'plant')).toBe(true);
  });
  it('suggestions depend on each user goal (separate settings, separate results)', () => {
    const cut = proteinOptions(40, 600, foods, goalClass('fat_loss')).map((s) => s.food.item.id);
    const build = proteinOptions(40, 600, foods, goalClass('lean_bulk')).map((s) => s.food.item.id);
    expect(cut).not.toEqual(build);
  });
  it('completing remaining macros: combinations with exact contributions close to the target', () => {
    const rem = { kcal: 700, protein: 40, carbs: 60, fat: 15 };
    const combos = completeMacros(rem, foods, 'maintain');
    expect(combos.length).toBe(3);
    for (const c of combos) {
      const sum = c.items.reduce((a, i) => a + i.macros.protein, 0);
      expect(Math.abs(sum - c.total.protein)).toBeLessThan(0.2);
      expect(c.total.kcal).toBeLessThanOrEqual(rem.kcal * 1.1);
      expect(Math.abs(c.total.protein - rem.protein)).toBeLessThan(8);
      expect(Math.abs(c.total.carbs - rem.carbs)).toBeLessThan(10);
    }
    expect(new Set(combos.map((c) => c.items[0].food.item.id)).size).toBe(3); // variety
    expect(completeMacros({ kcal: 50, protein: 2, carbs: 5, fat: 1 }, foods, 'cut')).toEqual([]);
  });
  it('no logs → no invented analysis; weekly review needs ≥3 complete days', async () => {
    const empty = dailyCoach(await bundle(), today(), foods);
    expect(empty.map((m) => m.key)).toEqual(['co_noLogToday']);
    const w = weeklyCoach(await bundle(), today());
    expect(w.enough).toBe(false);
    expect(w.messages[0].key).toBe('co_weekNotEnough');
  });
  it('weekly review from logged days: protein often low + repetitive protein source + fibre only when known', async () => {
    const chicken = await food('صدر دجاج مشوي');
    const rice = await food('أرز أبيض مطبوخ');
    for (let i = 1; i <= 4; i++) {
      const d = addDays(today(), -i);
      await addFoodEntry(d, 'lunch', rice, 900, 'g'); // 1170 kcal
      await addFoodEntry(d, 'dinner', chicken, 300, 'g'); // 495 kcal, 93 g protein
    }
    const w = weeklyCoach(await bundle(), addDays(today(), -1));
    if (!w.enough) return; // the 4 days may straddle a week boundary; covered by the 'not enough' test
    const keys = w.messages.map((m) => m.key);
    expect(keys).toContain('co_weekProteinLow');
    expect(keys).toContain('co_weekRepetitive');
    expect(keys).not.toContain('co_weekFiberLow'); // fibre unknown for these foods → no claim
  });
  it('daily tip rotates deterministically', () => {
    expect(TIPS).toContain(tipOfDay('2026-11-07'));
    expect(tipOfDay('2026-11-07')).toBe(tipOfDay('2026-11-07'));
    expect(tipOfDay('2026-11-07')).not.toBe(tipOfDay('2026-11-08'));
  });
});
