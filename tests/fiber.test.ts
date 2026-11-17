/** Dietary fiber: per-100 g scaling, servings, recipes (total / per serving / per 100 g / cooked), day totals, target,
 *  unknown ≠ 0, migration (fill-only), history untouched, AR/EN texts. */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { DEFAULT_FIBER_TARGET, fiberProgress, fiberTargetOf, fillMissingFiber, recipeFiber, refIdFromSource, validFiberTarget } from '../src/lib/fiber';
import { DICTS } from '../src/lib/i18n';
import { macrosFor, sumMacros, sumMacrosStrict } from '../src/lib/nutrition';
import { computeLibraryRecipe, LIBRARY } from '../src/lib/recipeEngine';
import { refById, setRefData } from '../src/lib/refFoods';
import { buildPeriod, summarizeDay } from '../src/lib/reports';
import { computeRecipe, createFood, saveSettings, updateFood, getSettings } from '../src/lib/repo';
import { defaultSettings } from '../src/lib/defaults';
import type { DiaryEntry, EntryBasis, RecipeIngredient, Settings } from '../src/lib/types';

beforeAll(() => setRefData(JSON.parse(readFileSync('public/fooddb/usda.json', 'utf8'))));

const basis: EntryBasis = { per100: { kcal: 100, protein: 3, carbs: 20, fat: 1, fiber: 5 }, pieceGrams: 40, servings: [{ id: 's', name: 'bowl', grams: 250 }] };
let k = 0;
const entry = (date: string, kcal: number, fiber?: number): DiaryEntry => ({
  id: 'f' + ++k, date, meal: 'lunch', name: 'x', state: 'cooked', quantity: 100, unit: 'g', grams: 100, basis: { per100: { kcal, protein: 10, carbs: 10, fat: 1 } },
  macros: { kcal, protein: 10, carbs: 10, fat: 1, ...(fiber !== undefined ? { fiber } : {}) }, order: 1, createdAt: 1, updatedAt: 1
});
const S = (over: Partial<Settings> = {}) => ({ ...defaultSettings(), ...over }) as Settings;

describe('1–2. per 100 g and serving conversions', () => {
  it('fiber scales with the eaten quantity (5 g/100 g → 50 g = 2.5, 150 g = 7.5, 200 g = 10)', () => {
    expect(macrosFor(basis, 50, 'g').macros.fiber).toBeCloseTo(2.5, 5);
    expect(macrosFor(basis, 150, 'g').macros.fiber).toBeCloseTo(7.5, 5);
    expect(macrosFor(basis, 200, 'g').macros.fiber).toBeCloseTo(10, 5);
  });
  it('pieces and named servings use their gram weight', () => {
    expect(macrosFor(basis, 2, 'piece').macros.fiber).toBeCloseTo(4, 5); // 2 × 40 g
    expect(macrosFor(basis, 1, 'serving', 's').macros.fiber).toBeCloseTo(12.5, 5); // 250 g
  });
  it('unknown fiber stays unknown after scaling (never 0)', () => {
    expect(macrosFor({ per100: { kcal: 100, protein: 1, carbs: 1, fat: 1 } }, 200, 'g').macros.fiber).toBeUndefined();
  });
});

describe('3–5. recipes', () => {
  const ing = (name: string, grams: number, fiber?: number): RecipeIngredient =>
    ({ foodId: name, name, state: 'raw', quantity: grams, unit: 'g', grams, macros: { kcal: grams, protein: 1, carbs: 1, fat: 1, ...(fiber !== undefined ? { fiber } : {}) } });
  it('total = Σ ingredients (4 + 6 + 2 = 12), per serving = total ÷ servings (3 → 4)', () => {
    const c = computeRecipe([ing('A', 100, 4), ing('B', 100, 6), ing('C', 100, 2)], 3);
    expect(c.totals.fiber).toBe(12);
    expect(c.perServing.fiber).toBe(4);
    const f = recipeFiber([{ name: 'A', grams: 100, fiber: 4 }, { name: 'B', grams: 100, fiber: 6 }, { name: 'C', grams: 100, fiber: 2 }], 3);
    expect(f).toMatchObject({ total: 12, perServing: 4, per100: 4 });
    expect(f.parts.map((p) => p.fiber)).toEqual([4, 6, 2]); // contribution of each ingredient
  });
  it('cooked weight: per 100 g of the cooked dish (300 g raw → 240 g cooked)', () => {
    const f = recipeFiber([{ name: 'A', grams: 150, fiber: 6 }, { name: 'B', grams: 150, fiber: 6 }], 2, 240);
    expect(f.total).toBe(12);
    expect(f.per100).toBe(5); // 12 g / 240 g × 100 — cooking changes the weight, not the fiber
    expect(f.perServing).toBe(6);
  });
  it('one ingredient without fiber data → recipe fiber unknown (not under-counted); core macros unchanged', () => {
    const c = computeRecipe([ing('A', 100, 4), ing('B', 100)], 2);
    expect(c.totals.fiber).toBeUndefined();
    expect(c.totals.kcal).toBe(200);
    const f = recipeFiber([{ name: 'A', grams: 100, fiber: 4 }, { name: 'B', grams: 100 }], 2);
    expect(f.total).toBeUndefined();
    expect(f.unknown).toEqual(['B']);
    expect(f.knownSum).toBe(4);
    // the strict sum differs from the day-total sum only for the optional nutrient
    const parts = [{ kcal: 1, protein: 1, carbs: 1, fat: 1, fiber: 2 }, { kcal: 1, protein: 1, carbs: 1, fat: 1 }];
    expect(sumMacros(parts).fiber).toBe(2);
    expect(sumMacrosStrict(parts).fiber).toBeUndefined();
    expect({ ...sumMacrosStrict(parts) }).toEqual({ kcal: 2, protein: 2, carbs: 2, fat: 2 });
  });
  it('library: 116 of 121 recipes have complete fiber data; the rest name the missing ingredient', () => {
    const rs = LIBRARY.map((l) => computeLibraryRecipe(l, new Map(), refById));
    const known = rs.filter((r) => r.fiber.total !== undefined);
    expect(known.length).toBe(116);
    for (const r of known) {
      expect(r.totals.fiber).toBeCloseTo(r.fiber.total!, 1);
      expect(r.perServing.fiber! * r.lib.servings).toBeCloseTo(r.totals.fiber!, 1); // whole recipe first, then ÷ servings
    }
    for (const r of rs.filter((x) => x.fiber.total === undefined)) expect(r.fiber.unknown.length).toBeGreaterThan(0);
    const lentil = rs.find((r) => r.lib.id === 'lib-lentil-soup')!;
    expect(lentil.perServing.fiber).toBeGreaterThan(5); // legumes: real fiber from USDA rows
  });
});

describe('6–8. day totals, target, unknown values', () => {
  it('daily total and target progress', () => {
    const day = summarizeDay('2026-11-10', [entry('2026-11-10', 300, 8), entry('2026-11-10', 400, 10)], undefined, S(), '2026-11-11');
    const p = fiberProgress(day, 25);
    expect(p).toMatchObject({ consumed: 18, remaining: 7, pct: 72, complete: true, unknown: false });
  });
  it('entries without fiber data are not zero: partial and unknown are flagged', () => {
    const part = summarizeDay('2026-11-10', [entry('2026-11-10', 300, 8), entry('2026-11-10', 400)], undefined, S(), '2026-11-11');
    expect(fiberProgress(part, 25)).toMatchObject({ consumed: 8, complete: false, known: 1, entries: 2 });
    const none = summarizeDay('2026-11-10', [entry('2026-11-10', 400)], undefined, S(), '2026-11-11');
    expect(fiberProgress(none, 25).unknown).toBe(true);
  });
  it('target is a setting: default 25 g, custom value, invalid values rejected', () => {
    expect(fiberTargetOf(S())).toBe(DEFAULT_FIBER_TARGET);
    expect(DEFAULT_FIBER_TARGET).toBe(25);
    expect(fiberTargetOf(S({ fiberTarget: 30 }))).toBe(30);
    expect(fiberTargetOf(S({ fiberTarget: 0 }))).toBe(25);
    expect(validFiberTarget(500)).toBe(false);
  });
  it('weekly report: average over measured days only, low days listed, unmeasured days separate', () => {
    const dates = ['2026-11-07', '2026-11-08', '2026-11-09'];
    const full = (d: string, f?: number) => ['breakfast', 'lunch', 'dinner'].map((m) => ({ ...entry(d, 600, f), meal: m as DiaryEntry['meal'] }));
    const data = { entries: [...full('2026-11-07', 10), ...full('2026-11-08', 5), ...full('2026-11-09')], days: [], body: [], settings: S({ fiberTarget: 25 }) };
    const r = buildPeriod('week', 'w', dates, data, '2026-11-20');
    expect(r.fiber.measuredDays).toBe(2);
    expect(r.fiber.notMeasuredDays).toBe(1);
    expect(r.fiber.avg).toBe(22.5); // (30 + 15) / 2 — the unmeasured day is not a 0
    expect(r.fiber.daysMet).toBe(1);
    expect(r.fiber.lowDays).toEqual(['2026-11-08']);
    expect(r.averages!.kcal).toBe(1800); // calories unchanged by fiber
  });
});

describe('9. Arabic and English', () => {
  it('requested labels exist in both languages', () => {
    const en = DICTS.en, ar = DICTS.ar;
    expect([en.fib_title, en.fib_target, en.fib_consumed, en.fib_remaining, en.fib_perServing, en.fib_highFoods])
      .toEqual(['Dietary Fiber', 'Fiber Target (g per day)', 'Fiber Consumed', 'Fiber Remaining', 'Fiber per Serving', 'High-Fiber Foods']);
    expect([ar.fib_title, ar.fib_consumed, ar.fib_remaining, ar.fib_perServing, ar.fib_highFoods])
      .toEqual(['الألياف الغذائية', 'الألياف المستهلكة', 'الألياف المتبقية', 'الألياف لكل حصة', 'أطعمة غنية بالألياف']);
    expect(ar.fib_target.startsWith('هدف الألياف')).toBe(true);
  });
});

describe('10. migration and history', () => {
  it('USDA source string → reference id', () => {
    expect(refIdFromSource('USDA FDC 171477 (SR Legacy)')).toBe('S171477');
    expect(refIdFromSource('USDA FDC 2705385 (FNDDS (Survey foods))')).toBe('N2705385');
    expect(refIdFromSource('my label')).toBeNull();
  });
  it('fills only missing fiber from verified sources, never overwrites, never writes 0 for unknown, diary untouched', async () => {
    await getSettings();
    const usda = await createFood({ nameAr: '', nameEn: 'Lentils test', category: 'x', per100: { kcal: 116, protein: 9, carbs: 20, fat: 0.4 }, state: 'cooked', stateLabel: '', prep: '', notes: '', source: 'usda', sourceRef: 'USDA FDC 172421 (SR Legacy)' }, { allowDuplicate: true });
    const own = await createFood({ nameAr: 'خبز بيتي', nameEn: '', category: 'x', per100: { kcal: 250, protein: 8, carbs: 50, fat: 2, fiber: 3.3 }, state: 'cooked', stateLabel: '', prep: '', notes: '' }, { allowDuplicate: true });
    const noSource = await createFood({ nameAr: 'طبق جدتي', nameEn: '', category: 'x', per100: { kcal: 150, protein: 8, carbs: 15, fat: 6 }, state: 'cooked', stateLabel: '', prep: '', notes: '' }, { allowDuplicate: true });
    await db.entries.put(entry('2026-11-01', 116));
    const before = JSON.stringify(await db.entries.toArray());
    let backups = 0;
    const r = await fillMissingFiber({ refFiber: (id) => refById(id)?.per100.fiber, backup: async () => { backups++; }, update: (id, c) => updateFood(id, c) });
    expect(backups).toBe(1);
    expect((await db.foods.get(usda.id))!.per100.fiber).toBe(refById('S172421')!.per100.fiber);
    expect((await db.foods.get(usda.id))!.per100.kcal).toBe(116); // nothing else changed
    expect((await db.foods.get(own.id))!.per100.fiber).toBe(3.3); // own value kept
    expect((await db.foods.get(noSource.id))!.per100.fiber).toBeUndefined(); // unknown stays unknown
    expect(r.foods).toContain(usda.id);
    expect(JSON.stringify(await db.entries.toArray())).toBe(before); // history untouched
    expect(await db.foodChanges.where('foodId').equals(usda.id).count()).toBeGreaterThan(1); // change logged
    const again = await fillMissingFiber({ refFiber: (id) => refById(id)?.per100.fiber, update: (id, c) => updateFood(id, c) });
    expect(again.filled).toBe(0); // idempotent
  });
  it('old entries without fiber keep working in day summaries', () => {
    const day = summarizeDay('2026-01-01', [entry('2026-01-01', 500)], undefined, S(), '2026-02-01');
    expect(day.totals.kcal).toBe(500);
    expect(day.totals.fiber).toBeUndefined();
  });
  it('settings: the fiber target is saved like other settings', async () => {
    await saveSettings((s) => { s.fiberTarget = 30; });
    expect(fiberTargetOf(await getSettings())).toBe(30);
  });
});
