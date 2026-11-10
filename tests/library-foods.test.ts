import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../src/lib/db';
import { fillMissingNames, planNames, setFoodNames } from '../src/lib/foodNames';
import { completeFoodDatabase, planLibraryFoods, RECIPE_FOOD_CATEGORY } from '../src/lib/libraryFoods';
import { LIBRARY } from '../src/lib/recipeEngine';
import { refById, setRefData } from '../src/lib/refFoods';
import { createFood } from '../src/lib/repo';

const names = JSON.parse(readFileSync('public/fooddb/food-names.json', 'utf8')).names as Record<string, string>;
beforeAll(() => { setRefData(JSON.parse(readFileSync('public/fooddb/usda.json', 'utf8'))); setFoodNames(names); });

describe('complete my food database from the recipe library', () => {
  it('plan: every ingredient is either addable from USDA or reported missing (labneh), never estimated', () => {
    const p = planLibraryFoods([], refById);
    const missing = p.ingredients.filter((i) => i.status === 'missing').map((i) => i.name);
    expect(missing).toEqual(['لبنة']);
    expect(p.recipes.filter((r) => r.status === 'add')).toHaveLength(LIBRARY.length - 1);
    expect(p.recipes.find((r) => r.status === 'incomplete')?.missing).toEqual(['لبنة']);
    for (const r of p.recipes.filter((x) => x.status === 'add')) {
      // per-100 g and per-serving are the same recipe: serving grams × per100 / 100 ≈ per serving
      expect(Math.abs((r.per100.kcal * r.servingGrams) / 100 - r.perServing.kcal)).toBeLessThan(2);
    }
  });
  it('apply: adds ingredients and ready meals only, keeps existing foods untouched, and is idempotent', async () => {
    const mine = await createFood({ nameAr: 'تمر', nameEn: '', category: 'فواكه', per100: { kcal: 282, protein: 2.5, carbs: 75, fat: 0.4 }, state: 'raw', stateLabel: 'نيء', prep: '', notes: 'my own value' });
    const r = await completeFoodDatabase();
    expect(r.missing).toEqual(['لبنة']);
    expect(r.recipesAdded).toBe(LIBRARY.length - 1);
    const all = await db.foods.toArray();
    expect(all.filter((f) => f.nameAr === 'تمر')).toHaveLength(1);
    expect((await db.foods.get(mine.id))!.per100.kcal).toBe(282); // own food never changed
    const meal = all.find((f) => f.category === RECIPE_FOOD_CATEGORY)!;
    expect(meal.nameEn).toBeTruthy();
    expect(meal.servings[0].grams).toBeGreaterThan(50);
    const chicken = all.find((f) => f.nameAr === 'صدر دجاج مشوي');
    if (chicken) expect(chicken.nameEn).toBe(names['صدر دجاج مشوي']); // short English name, not the USDA description
    expect(await db.backups.where('reason').equals('pre-import').count()).toBeGreaterThan(0);
    const again = await completeFoodDatabase();
    expect(again.ingredientsAdded + again.recipesAdded).toBe(0);
  });
});

describe('Arabic and English names', () => {
  it('fills only empty names, both directions, and lists what is left', async () => {
    const a = await createFood({ nameAr: 'كبد جمل مشوي', nameEn: '', category: 'x', per100: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 }, state: 'raw', stateLabel: '', prep: '', notes: '' }, { allowDuplicate: true });
    const b = await createFood({ nameAr: '', nameEn: 'Camel liver, raw', category: 'x', per100: { kcal: 125, protein: 20, carbs: 2, fat: 4 }, state: 'raw', stateLabel: '', prep: '', notes: '' }, { allowDuplicate: true });
    const c = await createFood({ nameAr: 'خبز صاج منزلي', nameEn: '', category: 'x', per100: { kcal: 270, protein: 9, carbs: 55, fat: 1 }, state: 'cooked', stateLabel: '', prep: '', notes: '' }, { allowDuplicate: true });
    const keep = await createFood({ nameAr: 'موز', nameEn: 'My banana', category: 'x', per100: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 }, state: 'raw', stateLabel: '', prep: '', notes: '' }, { allowDuplicate: true });
    const p = planNames(await db.foods.toArray(), names);
    expect(p.noEnglish.map((f) => f.id)).toContain(c.id);
    expect(await fillMissingNames()).toBeGreaterThanOrEqual(2);
    expect((await db.foods.get(a.id))!.nameEn).toBe('Camel liver, grilled');
    expect((await db.foods.get(b.id))!.nameAr).toBe('كبد جمل نيء');
    // a name that would duplicate another food is left empty instead of failing
    const dupe = await createFood({ nameAr: '', nameEn: 'Avocado', category: 'x', per100: { kcal: 160, protein: 2, carbs: 8.5, fat: 14.7 }, state: 'raw', stateLabel: '', prep: '', notes: '' }, { allowDuplicate: true });
    await fillMissingNames();
    expect((await db.foods.get(dupe.id))!.nameEn).toBe('Avocado');
    expect((await db.foods.get(c.id))!.nameEn).toBe('');
    expect((await db.foods.get(keep.id))!.nameEn).toBe('My banana');
  });
});
