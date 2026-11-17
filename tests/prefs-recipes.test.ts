/** Food preferences (exclusions, yogurt per day, 3 meals), recommendation filters, part-4 recipes. */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { excludedBy, yogurtLeftG, yogurtPerServingG, type FoodPrefs } from '../src/lib/foodPrefs';
import { allIngredients, computeLibraryRecipe, generatePlan, hasTrait, LIBRARY, suggest } from '../src/lib/recipeEngine';
import { LIBRARY_4 } from '../src/lib/recipeLibraryData4';
import { refById, setRefData } from '../src/lib/refFoods';
import type { DiaryEntry } from '../src/lib/types';

let lib: ReturnType<typeof computeLibraryRecipe>[] = [];
beforeAll(() => { setRefData(JSON.parse(readFileSync('public/fooddb/usda.json', 'utf8'))); lib = LIBRARY.map((l) => computeLibraryRecipe(l, new Map(), refById)); });
const ME: FoodPrefs = { exclude: ['whey', 'oats'], yogurtPerDay: 1, mealsPerDay: 3 };
const names = (id: string) => allIngredients(LIBRARY.find((l) => l.id === id)!).map((i) => i[0]);

describe('food preferences', () => {
  it('detects excluded ingredients (whey, oats) by name', () => {
    const whey = LIBRARY.filter((l) => excludedBy(allIngredients(l).map((i) => i[0]), ME).includes('whey'));
    expect(whey.length).toBeGreaterThanOrEqual(3);
    expect(excludedBy(names('lib4-chocolate-yogurt-mousse'), ME)).toEqual([]); // the new desserts have no whey
  });
  it('yogurt: containers of 170 g, minus what is already logged today', () => {
    const e = { name: 'زبادي يوناني خالي الدسم', grams: 100 } as DiaryEntry;
    expect(yogurtLeftG(ME, [e])).toBe(70);
    expect(yogurtLeftG({ exclude: [] }, [e])).toBe(Infinity);
    expect(yogurtPerServingG(allIngredients(LIBRARY.find((l) => l.id === 'lib4-chicken-biryani-light')!), 4)).toBe(37.5);
  });
});

describe('recommendations', () => {
  const rem = { kcal: 650, protein: 55, carbs: 70, fat: 20 };
  it('650 kcal left and 55 g protein needed: every suggestion fits the calories AND brings real protein', () => {
    const s = suggest(rem, 1, lib, [], {});
    expect(s.length).toBeGreaterThan(3);
    for (const x of s) { expect(x.macros.kcal).toBeLessThanOrEqual(650 * 1.05 + 20); expect(x.macros.protein).toBeGreaterThanOrEqual(19); }
  });
  it('preferences: no recipe with whey/oats; yogurt above what is left today is not suggested', () => {
    const s = suggest(rem, 1, lib, [], { prefs: ME, yogurtLeftG: 0 });
    for (const x of s) {
      const ing = allIngredients(x.computed!.lib).map((i) => i[0]);
      expect(excludedBy(ing, ME)).toEqual([]);
      expect(yogurtPerServingG(allIngredients(x.computed!.lib), x.computed!.lib.servings)).toBe(0);
    }
  });
  it('filters: cooking method and dietary characteristics; fiber gap is a bonus, never the only reason', () => {
    const air = suggest(rem, 1, lib, [], { method: 'air-fryer' });
    expect(air.length).toBeGreaterThan(0);
    for (const x of air) expect(x.computed!.lib.methods).toContain('air-fryer');
    const hp = suggest(rem, 1, lib, [], { traits: ['highProtein', 'lowCarb'] });
    for (const x of hp) { expect(hasTrait('highProtein', x.macros)).toBe(true); expect(x.macros.carbs).toBeLessThanOrEqual(20); }
    const fib = suggest(rem, 1, lib, [], { fiberGap: 10 });
    for (const x of fib) expect(x.macros.protein).toBeGreaterThanOrEqual(19); // fiber never replaces protein / calories
  });
});

describe('meal plan with preferences', () => {
  it('3 meals a day, no whey/oats, at most one yogurt container per day, near 2,110 kcal / 160 g', () => {
    const T = { kcal: 2110, protein: 160, carbs: 235, fat: 59 };
    const days = generatePlan(['2026-11-20', '2026-11-21', '2026-11-22'], () => T, lib, undefined, { prefs: ME });
    expect(days).toHaveLength(3);
    for (const d of days) {
      expect(d.picks.map((p) => p.meal)).toEqual(['breakfast', 'lunch', 'dinner']);
      let yog = 0;
      for (const p of d.picks) {
        const l = LIBRARY.find((x) => x.id === p.libId)!;
        expect(excludedBy(allIngredients(l).map((i) => i[0]), ME)).toEqual([]);
        yog += yogurtPerServingG(allIngredients(l), l.servings) * p.servings;
      }
      expect(yog).toBeLessThanOrEqual(170.5);
      expect(Math.abs(d.total.kcal - 2110)).toBeLessThan(2110 * 0.12);
      expect(d.total.protein).toBeGreaterThan(130);
    }
  });
  it('a 7-day plan is varied and realistic: no dish twice, ≤ 1.5 servings, calories within 5 %, protein not far above target', () => {
    const T = { kcal: 2110, protein: 160, carbs: 235, fat: 59 };
    const days = generatePlan(['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'], () => T, lib, undefined, { prefs: ME });
    const ids = days.flatMap((d) => d.picks.map((p) => p.libId));
    expect(new Set(ids).size).toBe(ids.length); // 21 different dishes
    for (const d of days) {
      for (const p of d.picks) expect(p.servings).toBeLessThanOrEqual(1.5);
      expect(Math.abs(d.total.kcal - 2110)).toBeLessThanOrEqual(2110 * 0.05);
      expect(d.total.protein).toBeGreaterThanOrEqual(150);
      expect(d.total.protein).toBeLessThanOrEqual(160 * 1.2);
    }
  });
});

describe('part 4 recipes', () => {
  it('27 recipes, all ingredients from verified data, exact quantities, bilingual steps, storage instructions', () => {
    expect(LIBRARY_4).toHaveLength(27);
    for (const l of LIBRARY_4) {
      const c = lib.find((x) => x.lib.id === l.id)!;
      expect(c.ok).toBe(true);
      expect(c.isEstimate).toBe(false);
      expect(l.stepsAr.length).toBe(l.stepsEn.length);
      expect(l.storageAr && l.storageEn).toBeTruthy();
      for (const [, g] of allIngredients(l)) expect(g).toBeGreaterThan(0);
      expect(allIngredients(l).some(([n]) => /واي|شوفان/.test(n))).toBe(false); // owner: no whey, no oats
    }
  });
  it('main meals fit three meals a day at 2,110 kcal (≈ 450–700 kcal, ≥ 35 g protein)', () => {
    for (const l of LIBRARY_4.filter((x) => x.meals.includes('lunch') && !x.tags.includes('dessert') && !/lettuce/.test(x.nameEn))) {
      const p = lib.find((x) => x.lib.id === l.id)!.perServing;
      expect(p.kcal).toBeGreaterThan(450); expect(p.kcal).toBeLessThan(700); expect(p.protein).toBeGreaterThanOrEqual(35);
    }
  });
});

describe('storage guidance for every recipe', () => {
  it('148/148 have storage & reheating text; the 121 older recipes are marked as general food-safety guidance', () => {
    expect(LIBRARY.every((l) => !!l.storageAr && !!l.storageEn)).toBe(true);
    expect(LIBRARY.filter((l) => l.storageGeneric).length).toBe(LIBRARY.length - LIBRARY_4.length);
    const fish = LIBRARY.find((l) => l.id === 'lib-salmon-rice')!;
    if (fish.storageGeneric) expect(fish.storageEn).toMatch(/2 days/);
  });
});
