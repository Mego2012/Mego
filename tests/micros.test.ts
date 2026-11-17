/** Vitamins, minerals and fat/carb details: data file integrity, scaling, sums, recipes, day status, DRIs, migration. */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { referenceFor, satFatLimit } from '../src/lib/dri';
import { planMicroFill } from '../src/lib/microMigration';
import { addMicros, MICRO_KEYS, microCoverage, microStatus, sumMicrosStrict, type MicroKey } from '../src/lib/micros';
import { macrosFor, roundMacros, scaleMacros, sumMacros, sumMacrosStrict } from '../src/lib/nutrition';
import { computeLibraryRecipe, LIBRARY } from '../src/lib/recipeEngine';
import { refById, setMicroData, setRefData } from '../src/lib/refFoods';
import { summarizeDay } from '../src/lib/reports';
import { defaultSettings } from '../src/lib/defaults';
import type { DiaryEntry, Food, Settings } from '../src/lib/types';

const micros = JSON.parse(readFileSync('public/fooddb/micros.json', 'utf8'));
beforeAll(() => { setRefData(JSON.parse(readFileSync('public/fooddb/usda.json', 'utf8'))); setMicroData(micros); });

describe('micros.json (built from USDA FoodData Central)', () => {
  it('covers the same foods as usda.json, known columns and units, no negative numbers, unknown = null', () => {
    const ids = new Set(JSON.parse(readFileSync('public/fooddb/usda.json', 'utf8')).rows.map((r: unknown[]) => r[0]));
    expect(micros.meta.format).toBe('mego-micros');
    expect(micros.meta.columns.every((c: string) => (MICRO_KEYS as readonly string[]).includes(c))).toBe(true);
    for (const [id, row] of Object.entries(micros.rows) as [string, (number | null)[]][]) {
      expect(ids.has(id)).toBe(true);
      for (const v of row) expect(v === null || v >= 0).toBe(true);
    }
  });
  it('published USDA values (spinach raw S168462, egg raw S171287, farmed salmon S175167)', () => {
    const m = (id: string) => refById(id)!.per100.micro!;
    expect(m('S168462')).toMatchObject({ vitK: 482.9, vitA: 469, folate: 194, iron: 2.71, potassium: 558 });
    expect(m('S171287')).toMatchObject({ cholesterol: 372, vitD: 2, b12: 0.89, selenium: 30.7 });
    expect(m('S175167').vitD).toBe(11);
  });
  it('sources without data stay unknown: no added sugar, sugar alcohol, iodine or biotin is invented', () => {
    for (const k of ['addedSugar', 'sugarAlcohol', 'iodine', 'b7']) expect(micros.meta.coverage[k]).toBe(0);
    expect(refById('S168462')!.per100.micro!.iodine).toBeUndefined();
  });
});

describe('scaling and sums', () => {
  it('scale with the eaten quantity (spinach 50 g → half the vitamin K of 100 g)', () => {
    const b = { per100: refById('S168462')!.per100 };
    expect(macrosFor(b, 50, 'g').macros.micro!.vitK).toBeCloseTo(241.45, 2);
    expect(roundMacros(scaleMacros(b.per100, 0.37)).micro!.vitK).toBe(178.673); // 3 decimals kept for micros
  });
  it('day totals: lenient sum + coverage; recipes: strict (a nutrient known only when every part has it)', () => {
    const a = { kcal: 1, protein: 0, carbs: 0, fat: 0, micro: { iron: 1, vitD: 2 } };
    const b = { kcal: 1, protein: 0, carbs: 0, fat: 0, micro: { iron: 2 } };
    expect(sumMacros([a, b]).micro).toEqual({ iron: 3, vitD: 2 });
    expect(sumMacrosStrict([a, b]).micro).toEqual({ iron: 3 });
    expect(sumMicrosStrict([{ iron: 1 }, undefined])).toBeUndefined();
    expect(addMicros(undefined, undefined)).toBeUndefined();
    expect(microCoverage([a.micro, b.micro, undefined])).toMatchObject({ iron: 2, vitD: 1 });
  });
  it('library recipes: whole recipe first, then per serving — no double counting', () => {
    for (const l of LIBRARY.slice(0, 40)) {
      const r = computeLibraryRecipe(l, new Map(), refById);
      if (!r.ok || !r.totals.micro?.iron) continue;
      const sumItems = r.items.reduce((s, i) => s + (i.macros?.micro?.iron ?? 0), 0);
      expect(r.totals.micro.iron).toBeCloseTo(sumItems, 2);
      expect(r.perServing.micro!.iron! * l.servings).toBeCloseTo(r.totals.micro.iron, 2);
    }
  });
  it('core macros unchanged by the micro layer', () => {
    const rf = refById('S171077')!; // chicken breast raw
    const m = macrosFor({ per100: rf.per100 }, 200, 'g').macros;
    expect(m.kcal).toBeCloseTo(rf.per100.kcal * 2, 6);
    expect(m.protein).toBeCloseTo(rf.per100.protein * 2, 6);
  });
});

describe('reference intakes and daily status', () => {
  it('DRIs by sex and age (NIH ODS)', () => {
    expect(referenceFor('iron', 'male', 31, 2110).target).toBe(8);
    expect(referenceFor('iron', 'female', 31, 2110).target).toBe(18);
    expect(referenceFor('magnesium', 'male', 31, 2110).target).toBe(420);
    expect(referenceFor('vitD', 'male', 31, 2110)).toMatchObject({ target: 15, ul: 100, ulScope: 'total' });
    expect(referenceFor('folate', 'male', 31, 2110)).toMatchObject({ target: 400, ulScope: 'supplemental' });
    expect(referenceFor('addedSugar', 'male', 31, 2110)).toMatchObject({ kind: 'limit', target: 53 });
    expect(satFatLimit(2110)).toBe(23);
  });
  const S = (o: Partial<Settings> = {}) => ({ ...defaultSettings(), ...o }) as Settings;
  const E = (micro: Record<string, number> | undefined): DiaryEntry => ({ id: Math.random().toString(), date: '2026-11-10', meal: 'lunch', name: 'x', state: 'cooked', quantity: 100, unit: 'g', grams: 100, basis: { per100: { kcal: 100, protein: 1, carbs: 1, fat: 1 } }, macros: { kcal: 100, protein: 1, carbs: 1, fat: 1, ...(micro ? { micro } : {}) }, order: 1, createdAt: 1, updatedAt: 1 });
  it('consumed / target / % / remaining, partial coverage, custom target, upper limit only where it applies to food', () => {
    const day = summarizeDay('2026-11-10', [E({ iron: 5, vitD: 120, folate: 1500 }), E({ iron: 1 }), E(undefined)], undefined, S(), '2026-11-11');
    const ref = (k: MicroKey) => referenceFor(k, 'male', 31, 2110);
    const rows = Object.fromEntries(microStatus(day.totals.micro, day.microCoverage, day.entryCount, ref, { zinc: 15 }).map((r) => [r.key, r]));
    expect(rows.iron).toMatchObject({ consumed: 6, target: 8, pct: 75, remaining: 2, known: 2, entries: 3, complete: false });
    expect(rows.vitD.aboveUl).toBe(true); // UL applies to total intake
    expect(rows.folate.aboveUl).toBe(false); // folate UL is for supplements / fortified forms only
    expect(rows.zinc).toMatchObject({ target: 15, custom: true, known: 0 });
    expect(rows.iodine.known).toBe(0); // unknown stays unknown, not 0 % "eaten"
  });
});

describe('migration (fill only)', () => {
  const food = (o: Partial<Food>): Food => ({ id: 'f' + Math.random(), nameAr: '', nameEn: 'x', category: '', per100: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 }, state: 'raw', stateLabel: '', prep: '', notes: '', servings: [], favorite: false, source: 'usda', sourceRef: 'USDA FDC 168462 (SR Legacy)', incomplete: false, archived: false, version: 1, createdAt: 1, updatedAt: 1, useCount: 0, ...o });
  it('adds only missing values from the linked USDA row; never overwrites; foods without a verified source untouched', () => {
    const typed = food({ per100: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, micro: { iron: 9.99 } } });
    const own = food({ source: 'custom', sourceRef: undefined });
    const plan = planMicroFill([food({}), typed, own], (id) => refById(id)?.per100.micro, () => undefined);
    expect(plan).toHaveLength(2);
    expect(plan[0].add.vitK).toBe(482.9);
    expect(plan[1].add.iron).toBeUndefined(); // the typed label value is kept
    expect(plan[1].add.vitK).toBe(482.9);
    expect(plan.some((p) => p.food === own)).toBe(false);
  });
});
