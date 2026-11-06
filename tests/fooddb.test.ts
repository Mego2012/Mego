/**
 * Shared reference food database (USDA FoodData Central) + bilingual search.
 * Uses the real public/fooddb/usda.json shipped with the app.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, useDatabase } from '../src/lib/db';
import { today } from '../src/lib/dates';
import { editDistance, expandQuery, matchesLocal } from '../src/lib/foodSearch';
import { basisFromFood, macrosFor } from '../src/lib/nutrition';
import { inferState, materializeRefFood, searchRefFoods, setRefData, type RefDb } from '../src/lib/refFoods';
import { addFoodEntry } from '../src/lib/repo';

const DATA = JSON.parse(readFileSync(new URL('../public/fooddb/usda.json', import.meta.url), 'utf8')) as RefDb;
let n = 0;
beforeAll(() => setRefData(DATA));
beforeEach(() => { useDatabase('fooddb-' + ++n); });
const names = (q: string, f = {}) => searchRefFoods(q, f, 15).map((x) => x.name);

describe('reference database integrity', () => {
  it('12,879 USDA foods with sources, valid numbers, no invented values', () => {
    expect(DATA.meta.format).toBe('mego-fooddb');
    expect(DATA.rows.length).toBe(12879);
    expect(DATA.meta.sources.every((s) => /Public domain/.test(s.license))).toBe(true);
    const ids = new Set<string>();
    for (const r of DATA.rows) {
      expect(ids.has(r[0])).toBe(false);
      ids.add(r[0]);
      for (const k of [3, 4, 5, 6]) expect(Number.isFinite(Number(r[k])) && Number(r[k]) >= 0).toBe(true);
      expect(r[4] + r[5] + r[6]).toBeLessThanOrEqual(100.5); // grams per 100 g
    }
  });
  it('published USDA values are copied exactly (spot checks)', () => {
    const get = (id: string) => DATA.rows.find((r) => r[0] === id)!;
    // Chicken, broilers or fryers, breast, meat only, cooked, roasted (FDC 171477)
    expect(get('S171477').slice(3, 7)).toEqual([165, 31.02, 0, 3.57]);
    // Egg, whole, raw, fresh (FDC 171287)
    expect(get('S171287').slice(3, 7)).toEqual([143, 12.56, 0.72, 9.51]);
    // Rice, white, long-grain, regular, enriched, cooked (FDC 168878)
    expect(get('S168878').slice(3, 7)).toEqual([130, 2.69, 28.17, 0.28]);
  });
});

describe('bilingual search', () => {
  it('"صدور فراخ" (Egyptian) finds chicken breast', () => {
    const r = names('صدور فراخ');
    expect(r.length).toBeGreaterThan(3);
    expect(r.slice(0, 8).every((x) => /chicken/i.test(x) && /breast/i.test(x))).toBe(true);
  });
  it('Arabic state words narrow results: "صدر دجاج مشوي" vs "صدر دجاج نيء"', () => {
    expect(names('صدر دجاج نيء')[0]).toMatch(/breast.*raw|raw.*breast/i);
    expect(names('صدر دجاج نيء').every((x) => /raw/i.test(x))).toBe(true);
    expect(names('صدر دجاج مشوي').slice(0, 5).some((x) => /roasted|grilled|broiled/i.test(x))).toBe(true);
  });
  it('rice, eggs, oats, lentils in Arabic and English, singular/plural', () => {
    expect(names('رز مطبوخ')[0]).toMatch(/rice/i);
    expect(names('ارز ابيض مطبوخ').slice(0, 5).some((x) => /rice, white.*cooked/i.test(x))).toBe(true);
    expect(names('بيض')[0]).toMatch(/egg/i);
    expect(names('eggs')[0]).toMatch(/egg/i);
    expect(names('شوفان').some((x) => /oat/i.test(x))).toBe(true);
    expect(names('عدس').some((x) => /lentil/i.test(x))).toBe(true);
    expect(names('بطاطس').some((x) => /potato/i.test(x))).toBe(true);
  });
  it('typo tolerance and partial words', () => {
    expect(names('chiken brest').slice(0, 5).some((x) => /chicken.*breast/i.test(x))).toBe(true);
    expect(names('broc').some((x) => /broccoli/i.test(x))).toBe(true);
    expect(editDistance('brest', 'breast')).toBe(1);
  });
  it('regional, international, restaurant and brand searches', () => {
    expect(names('حمص')).toEqual(expect.arrayContaining([expect.stringMatching(/hummus|chickpea/i)]));
    expect(names('طعمية').some((x) => /falafel/i.test(x))).toBe(true);
    expect(names('برياني').some((x) => /biryani/i.test(x))).toBe(true);
    expect(names('ماكدونالدز').some((x) => /mcdonald/i.test(x))).toBe(true);
    expect(names('shawerma').some((x) => /gyro|shawarma/i.test(x))).toBe(true);
    expect(names('بيتزا').some((x) => /pizza/i.test(x))).toBe(true);
  });
  it('nutrition filters: high protein / low calorie', () => {
    const r = searchRefFoods('chicken', { minProtein: 25, maxKcal: 200 }, 30);
    expect(r.length).toBeGreaterThan(3);
    expect(r.every((x) => x.per100.protein >= 25 && x.per100.kcal <= 200)).toBe(true);
  });
  it('English query also matches Arabic-named local foods', () => {
    expect(matchesLocal('صدر دجاج مشوي', expandQuery('chicken breast'))).toBe(true);
    expect(matchesLocal('أرز أبيض مطبوخ', expandQuery('rice'))).toBe(true);
    expect(matchesLocal('زيت زيتون', expandQuery('chicken'))).toBe(false);
  });
});

describe('using a reference food', () => {
  it('raw / cooked are inferred from the USDA name, never converted', () => {
    expect(inferState('Chicken, broilers or fryers, breast, meat only, raw')).toBe('raw');
    expect(inferState('Chicken, broilers or fryers, breast, meat only, cooked, roasted')).toBe('cooked');
    expect(inferState('Hummus, plain')).toBe('other');
  });
  it('logging copies the food once with source + USDA portions; diary values = USDA values', async () => {
    const rf = searchRefFoods('Egg, whole, raw, fresh').find((x) => x.id === 'S171287')!;
    const f = await materializeRefFood(rf);
    expect(f).toMatchObject({ source: 'usda', sourceRef: 'USDA FDC 171287 (SR Legacy)', state: 'raw' });
    expect(f.servings.find((s) => s.name === '1 large')!.grams).toBe(50);
    expect((await materializeRefFood(rf)).id).toBe(f.id); // reused, no duplicate
    expect(await db.foods.count()).toBe(1);
    const e = await addFoodEntry(today(), 'breakfast', f, 2, 'serving', f.servings.find((s) => s.name === '1 large')!.id);
    expect(e.grams).toBe(100);
    expect(e.macros).toEqual(macrosFor(basisFromFood(f), 100, 'g').macros);
    expect(e.macros.kcal).toBe(143);
    expect(e.macros.satFat).toBe(3.13);
  });
});

describe('personal foods: never stuck when a food is missing', () => {
  it('a food not in any database is created from its label and logged immediately', async () => {
    const { createFood } = await import('../src/lib/repo');
    // label: per 30 g serving → 120 kcal, 3 g protein, 18 g carbs, 4 g fat → per 100 g = ×100/30
    const f = await createFood({ nameAr: 'كعك العيد بالتمر', nameEn: '', category: 'حلويات', per100: { kcal: 400, protein: 10, carbs: 60, fat: 13.33 }, state: 'other', stateLabel: 'محضّر', prep: '', notes: 'from label',
      servings: [{ id: 's', name: 'حصة الملصق', grams: 30 }] });
    const e = await addFoodEntry(today(), 'snacks', f, 2, 'serving', 's');
    expect(e.grams).toBe(60);
    expect(e.macros.kcal).toBe(240);
  });
  it('export → import of personal foods (JSON) restores them without duplicates', async () => {
    const { exportCustomFoods, importCustomFoods } = await import('../src/lib/customFoods');
    const { createFood } = await import('../src/lib/repo');
    await createFood({ nameAr: 'طعام خاص', nameEn: 'My food', category: '', per100: { kcal: 100, protein: 10, carbs: 5, fat: 4, satFat: 1 }, state: 'cooked', stateLabel: 'مطبوخ', prep: '', notes: '' });
    const rf = searchRefFoods('Egg, whole, raw, fresh').find((x) => x.id === 'S171287')!;
    await materializeRefFood(rf);
    const json = await exportCustomFoods();
    expect(JSON.parse(json).foods).toHaveLength(2);
    useDatabase('fooddb-import-' + ++n);
    expect(await importCustomFoods(json)).toEqual({ added: 2, skipped: 0, invalid: 0 });
    expect(await importCustomFoods(json)).toEqual({ added: 0, skipped: 2, invalid: 0 });
    const egg = (await db.foods.toArray()).find((f) => f.source === 'usda')!;
    expect(egg.sourceRef).toBe('USDA FDC 171287 (SR Legacy)');
    expect(egg.per100.kcal).toBe(143);
    await expect(importCustomFoods('{"format":"other"}')).rejects.toThrow('INVALID_FILE');
    expect(await importCustomFoods(JSON.stringify({ format: 'mego-custom-foods', foods: [{ nameAr: 'x', state: 'raw', per100: { kcal: -5, protein: 0, carbs: 0, fat: 0 } }] }))).toEqual({ added: 0, skipped: 0, invalid: 1 });
  });
});
