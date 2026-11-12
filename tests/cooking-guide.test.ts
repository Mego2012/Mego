/** Cooking Guide: exact seasonings counted once, scaling, substitutions, timers, owner targets 2,110 kcal / 160 g protein. */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { allIngredients, computeLibraryRecipe, generatePlan, indexFoods, isSauce, LIBRARY, suggest, whatCanICook } from '../src/lib/recipeEngine';
import { LIBRARY as LIB1 } from '../src/lib/recipeLibraryData';
import { LIBRARY_2 } from '../src/lib/recipeLibraryData2';
import { LIBRARY_3 } from '../src/lib/recipeLibraryData3';
import { RECIPE_REF } from '../src/lib/recipeRefMap';
import { refById, setRefData, type RefDb } from '../src/lib/refFoods';
import { GROUPS, householdMeasure, seasoningsFromGroups } from '../src/lib/seasonings';
import { stepTimers, SWAPS, swapsFor, variantId, variantOf } from '../src/lib/cooking';
import type { Food, Macros } from '../src/lib/types';

const REF = JSON.parse(readFileSync('public/fooddb/usda.json', 'utf8')) as RefDb;
beforeAll(() => setRefData(REF));
const ref = (id: string) => refById(id);
const none = indexFoods([]);
const kcalOf = (m: Macros) => 4 * m.protein + 4 * m.carbs + 9 * m.fat;

describe('library data', () => {
  it('contains the original 101 recipes plus the flavour recipes, all with unique ids', () => {
    expect(LIB1.length + LIBRARY_2.length).toBe(101);
    expect(LIBRARY.length).toBe(101 + LIBRARY_3.length);
    expect(LIBRARY_3.length).toBeGreaterThanOrEqual(19);
    expect(new Set(LIBRARY.map((l) => l.id)).size).toBe(LIBRARY.length);
  });

  it('every legacy seasoning group converts to exact lines (no recipe keeps a rough "uncounted" guess)', () => {
    for (const l of [...LIB1, ...LIBRARY_2]) for (const [, en] of l.uncounted) expect(GROUPS[en], `${l.id}: ${en}`).toBeTruthy();
    for (const l of LIBRARY) {
      expect(l.uncounted, l.id).toEqual([]);
      expect(l.seasonings, l.id).toBeDefined();
    }
  });

  it('every seasoning, sauce and marinade line resolves to a USDA record (only labneh may be missing)', () => {
    for (const l of LIBRARY) for (const [name] of allIngredients(l)) {
      if (name === 'لبنة') continue;
      const id = RECIPE_REF[name];
      expect(id, `${l.id}: ${name}`).toBeTruthy();
      expect(refById(id!), `${l.id}: ${name}`).toBeTruthy();
    }
  });

  it('oil, sauces and seasonings are listed once per recipe (never counted twice)', () => {
    for (const l of LIBRARY) {
      const names = allIngredients(l).map((i) => i[0]);
      expect(new Set(names).size, `${l.id}: ${names.join(', ')}`).toBe(names.length);
      for (const m of l.marinade ?? []) expect(names, `${l.id} marinade ${m}`).toContain(m);
    }
  });

  it('steps exist in both languages with the same number of steps', () => {
    for (const l of LIBRARY) {
      expect(l.stepsAr.length, l.id).toBeGreaterThan(0);
      expect(l.stepsAr.length, l.id).toBe(l.stepsEn.length);
    }
  });

  it('flavour recipes state marinating time, temperature or serving guidance and have exact amounts', () => {
    for (const l of LIBRARY_3) {
      expect(l.servingAr && l.servingEn, l.id).toBeTruthy();
      for (const [, g] of allIngredients(l)) expect(g, l.id).toBeGreaterThan(0);
      if (l.marinade?.length && !l.tags.includes('pasta')) expect(l.marinateMin, l.id).toBeGreaterThan(0);
    }
    const kinds = ['chicken', 'rice', 'potato', 'pasta', 'eggs', 'sauce', 'side'];
    for (const k of kinds) expect(LIBRARY_3.some((l) => (l.tags as string[]).includes(k)), k).toBe(true);
    expect(LIBRARY_3.filter((l) => l.tags.includes('sauce')).length).toBeGreaterThanOrEqual(5);
  });
});

describe('nutrition', () => {
  it('seasonings are counted: totals equal the sum of every line, and seasoning lines carry real calories', () => {
    const c = computeLibraryRecipe(LIBRARY.find((l) => l.id === 'lib-lemon-herb-chicken')!, none, ref);
    expect(c.ok).toBe(true);
    const sum = c.items.reduce((a, i) => a + (i.macros?.kcal ?? 0), 0);
    expect(Math.abs(sum - c.totals.kcal)).toBeLessThan(1);
    const seas = c.items.filter((i) => i.role === 'seasoning');
    expect(seas.length).toBe(6);
    const paprika = seas.find((i) => i.name === 'بابريكا')!;
    expect(paprika.macros!.kcal).toBeCloseTo(4 * 2.82, 1); // 4 g × 282 kcal/100 g
    const salt = seas.find((i) => i.name === 'ملح')!;
    expect(salt.macros!.kcal).toBe(0);
    // olive oil 18 g = 159 kcal counted exactly once
    const oil = c.items.filter((i) => i.name === 'زيت زيتون');
    expect(oil).toHaveLength(1);
    expect(oil[0].macros!.kcal).toBeCloseTo(18 * 8.84, 0);
    expect(c.isEstimate).toBe(false);
  });

  it('legacy recipes now include their spices (e.g. shakshuka garlic + spices)', () => {
    const l = LIBRARY.find((x) => x.id === 'lib-shakshuka')!;
    expect(l.seasonings!.map((s) => s[0])).toEqual(expect.arrayContaining(['ثوم', 'ملح', 'كمون مطحون', 'بابريكا']));
    expect(l.seasonings!.find((s) => s[0] === 'ثوم')![1]).toBe(6); // 3 g per serving × 2 servings
    const c = computeLibraryRecipe(l, none, ref);
    const spice = c.items.filter((i) => i.role === 'seasoning').reduce((a, i) => a + i.macros!.kcal, 0);
    expect(spice).toBeGreaterThan(5);
    expect(c.uncountedKcal).toBe(0);
  });

  it('every computed recipe is internally consistent (kcal ≈ 4P+4C+9F within rounding of USDA energy factors)', () => {
    for (const l of LIBRARY) {
      const c = computeLibraryRecipe(l, none, ref);
      if (!c.ok) { expect(c.missing).toEqual(['لبنة']); continue; }
      expect(c.perServing.kcal, l.id).toBeGreaterThan(0);
      const diff = Math.abs(kcalOf(c.perServing) - c.perServing.kcal) / c.perServing.kcal;
      expect(diff, l.id).toBeLessThan(0.12);
    }
  });

  it('flavour recipes have realistic per-serving values', () => {
    const per = (id: string) => computeLibraryRecipe(LIBRARY.find((l) => l.id === id)!, none, ref).perServing;
    const ch = per('lib-lemon-herb-chicken');
    expect(ch.protein).toBeGreaterThan(40);
    expect(ch.kcal).toBeGreaterThan(250);
    expect(ch.kcal).toBeLessThan(330);
    const rice = per('lib-veg-rice');
    expect(rice.carbs).toBeGreaterThan(45);
    const sauce = per('lib-sauce-garlic-yogurt');
    expect(sauce.kcal).toBeLessThan(40);
  });

  it('a seasoning the user has in their own foods uses that record first', () => {
    const own = { id: 'x', nameAr: 'بابريكا', nameEn: 'My paprika', per100: { kcal: 300, protein: 14, carbs: 54, fat: 13 }, state: 'other', notes: '', servings: [] } as unknown as Food;
    const c = computeLibraryRecipe(LIBRARY.find((l) => l.id === 'lib-lemon-herb-chicken')!, indexFoods([own]), ref);
    const p = c.items.find((i) => i.name === 'بابريكا')!;
    expect(p.source).toBe('mine');
    expect(p.macros!.kcal).toBeCloseTo(12, 5);
  });
});

describe('scaling and substitutions', () => {
  const lib = LIBRARY.find((l) => l.id === 'lib-lemon-herb-chicken')!;
  it('scaling servings scales every amount (seasonings too) and keeps the per-serving nutrition', () => {
    const v = variantOf(lib, {}, 8);
    expect(v.servings).toBe(8);
    expect(v.ingredients[0][1]).toBe(1600);
    expect(v.seasonings!.find((s) => s[0] === 'ملح')![1]).toBe(10);
    const a = computeLibraryRecipe(lib, none, ref), b = computeLibraryRecipe(v, none, ref);
    expect(b.totals.kcal).toBeCloseTo(a.totals.kcal * 2, 0);
    expect(Math.abs(b.perServing.kcal - a.perServing.kcal)).toBeLessThanOrEqual(1);
    const half = computeLibraryRecipe(variantOf(lib, {}, 2), none, ref);
    expect(Math.abs(half.perServing.protein - a.perServing.protein)).toBeLessThanOrEqual(0.5);
  });

  it('a substitution recalculates from the new food (chicken breast → thigh raises fat, oil → butter keeps fat)', () => {
    const a = computeLibraryRecipe(lib, none, ref);
    const thigh = computeLibraryRecipe(variantOf(lib, { 0: 'فخذ دجاج بدون جلد' }), none, ref);
    expect(thigh.items[0].name).toBe('فخذ دجاج بدون جلد');
    expect(thigh.perServing.fat).toBeGreaterThan(a.perServing.fat);
    const butter = computeLibraryRecipe(variantOf(lib, { 1: 'زبدة' }), none, ref);
    expect(butter.items[1].grams).toBe(22); // 18 g × 1.2 = 21.6 → whole grams above 20 g
    expect(Math.abs(butter.totals.fat - a.totals.fat)).toBeLessThan(2);
    expect(variantOf(lib, { 1: 'زبدة' }).marinade).toContain('زبدة');
  });

  it('every offered alternative resolves to real nutrition (none estimated)', () => {
    for (const [from, alts] of Object.entries(SWAPS)) for (const [alt, f] of alts) {
      expect(RECIPE_REF[alt], `${from} → ${alt}`).toBeTruthy();
      expect(f).toBeGreaterThan(0);
    }
    expect(swapsFor('صدر دجاج').length).toBeGreaterThan(0);
  });

  it('variant ids are stable and differ from the original', () => {
    expect(variantId(lib, {})).toBe(lib.id);
    expect(variantId(lib, { 1: 'زبدة', 0: 'فخذ دجاج بدون جلد' })).toBe(`${lib.id}~0=فخذ دجاج بدون جلد|1=زبدة`);
  });
});

describe('cooking mode helpers', () => {
  it('finds step timers and ignores storage times', () => {
    expect(stepTimers('Grill 5 min per side')).toEqual([{ seconds: 300, label: '5 min' }]);
    expect(stepTimers('Bake 12–14 min until it flakes')[0].seconds).toBe(720);
    expect(stepTimers('Freeze 3 h, then break')[0].seconds).toBe(10800);
    expect(stepTimers('stir 30 s until fragrant')[0].seconds).toBe(30);
    expect(stepTimers('Keeps 4 days refrigerated')).toEqual([]);
    expect(stepTimers('leave only 15 min (no more than 30 min — the acid')).toHaveLength(1);
    const withTimers = LIBRARY.filter((l) => l.stepsEn.some((s) => stepTimers(s).length));
    expect(withTimers.length).toBeGreaterThan(80);
  });

  it('household measures', () => {
    expect(householdMeasure('ملح', 6, 'en')).toBe('1 tsp');
    expect(householdMeasure('عصير ليمون', 45, 'en')).toBe('3 tbsp');
    expect(householdMeasure('ثوم', 12, 'ar')).toBe('4 فص');
    expect(householdMeasure('بابريكا', 1.15, 'en')).toBe('½ tsp');
    expect(householdMeasure('صدر دجاج', 100, 'en')).toBe('');
    expect(householdMeasure('ملح', 5, 'en')).toBe('¾ tsp'); // not "a pinch"
    expect(householdMeasure('ملح', 0.3, 'en')).toBe('a pinch');
    expect(householdMeasure('زيت زيتون', 18, 'en')).toBe('1 ⅓ tbsp'); // = 4 tsp
    expect(householdMeasure('بابريكا', 8, 'en')).toBe('1 ⅛ tbsp'); // 3.5 tsp
  });

  it('groups convert per serving', () => {
    const s = seasoningsFromGroups([['ثوم', 'garlic', 10], ['x', 'spices (salt, pepper, cumin, paprika)', 5]], 4);
    expect(s.seasonings).toEqual(expect.arrayContaining([['ثوم', 12], ['ملح', 4]]));
    expect(s.unknown).toEqual([]);
  });
});

describe('diet strategy integration — owner targets 2,110 kcal / 160 g protein', () => {
  let lib: ReturnType<typeof computeLibraryRecipe>[] = [];
  beforeAll(() => { lib = LIBRARY.map((l) => computeLibraryRecipe(l, none, ref)); });
  const T: Macros = { kcal: 2110, protein: 160, carbs: 235, fat: 59 };

  it('sauces are never planned or suggested as a meal; sides are not planned as a main meal', () => {
    const days = generatePlan(['2026-11-15', '2026-11-16', '2026-11-17'], () => T, lib);
    const picked = days.flatMap((d) => d.picks.map((p) => LIBRARY.find((l) => l.id === p.libId)!));
    expect(picked.some((l) => isSauce(l) || l.tags.includes('side'))).toBe(false);
    const s = suggest(T, 4, lib, []);
    expect(s.some((x) => x.computed && isSauce(x.computed.lib))).toBe(false);
    expect(whatCanICook(lib, ['زبادي يوناني خالي الدسم', 'ثوم', 'عصير ليمون'], null).some((m) => isSauce(m.c.lib))).toBe(false);
  });

  it('a 7-day plan from the full library meets the targets (no target is changed)', () => {
    const dates = Array.from({ length: 7 }, (_, i) => `2026-11-${String(15 + i).padStart(2, '0')}`);
    const days = generatePlan(dates, () => T, lib);
    expect(days).toHaveLength(7);
    for (const d of days) {
      expect(d.total.kcal, d.date).toBeLessThanOrEqual(T.kcal * 1.05);
      expect(d.total.kcal, d.date).toBeGreaterThanOrEqual(T.kcal * 0.85);
      expect(d.total.protein, d.date).toBeGreaterThanOrEqual(T.protein * 0.9);
    }
    expect(T).toEqual({ kcal: 2110, protein: 160, carbs: 235, fat: 59 });
  });

  it('flavour recipes fit the owner day: chicken + rice + roasted vegetables + sauce ≈ a third of the day', () => {
    const per = (id: string) => lib.find((c) => c.lib.id === id)!.perServing;
    const meal = ['lib-lemon-herb-chicken', 'lib-veg-rice', 'lib-roasted-veg-tray', 'lib-sauce-garlic-yogurt'].map(per).reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(meal.kcal).toBeGreaterThan(T.kcal * 0.25);
    expect(meal.kcal).toBeLessThan(T.kcal * 0.4);
    expect(meal.protein).toBeGreaterThan(T.protein * 0.3);
  });

  it('a keto / low-carb day still gets low-carb picks', () => {
    const keto: Macros = { kcal: 2110, protein: 160, carbs: 25, fat: 151 };
    const [d] = generatePlan(['2026-11-20'], () => keto, lib);
    expect(d.total.carbs).toBeLessThan(110);
  });
});
