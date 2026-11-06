import { db } from './db';
import { macrosFor, preciseMacros, roundMacros, scaleMacros, sumMacros, basisFromFood } from './nutrition';
import { buildIngredient, saveRecipe, setPlannedDay, uid, kvGet } from './repo';
import { LIBRARY as LIB1, type LibraryRecipe } from './recipeLibraryData';
import { LIBRARY_2 } from './recipeLibraryData2';

export const LIBRARY: LibraryRecipe[] = [...LIB1, ...LIBRARY_2];
import { normalizeText } from './search';
import type { Food, Macros, MealType, PlanItem, Recipe } from './types';

export interface ComputedRecipe {
  lib: LibraryRecipe;
  ok: boolean;
  /** Ingredient names not found in the user's food database. */
  missing: string[];
  /** Ingredients whose database record is estimated / unverified / incomplete. */
  estimatedFoods: string[];
  uncountedKcal: number;
  totals: Macros;
  perServing: Macros;
  totalTime: number;
  /** high-protein / low-calorie / low-carb — derived from computed nutrition, not hand-labelled. */
  derived: ('high-protein' | 'low-calorie' | 'low-carb')[];
  isEstimate: boolean;
}

export function indexFoods(foods: Food[]): Map<string, Food> {
  const m = new Map<string, Food>();
  for (const f of foods) if (!f.archived) {
    m.set(f.nameAr, f);
    const n = normalizeText(f.nameAr);
    if (!m.has(n)) m.set(n, f);
  }
  return m;
}

export function findFood(index: Map<string, Food>, name: string): Food | undefined {
  return index.get(name) ?? index.get(normalizeText(name));
}

const EST = /(⚠|غير محقق|تقريبي|تقديري|للمراجعة)/;

export function computeLibraryRecipe(lib: LibraryRecipe, index: Map<string, Food>): ComputedRecipe {
  const missing: string[] = [];
  const estimatedFoods: string[] = [];
  const parts: Macros[] = [];
  for (const [name, grams] of lib.ingredients) {
    const f = findFood(index, name);
    if (!f || f.incomplete) {
      missing.push(name);
      continue;
    }
    if (EST.test(f.notes)) estimatedFoods.push(name);
    parts.push(macrosFor(basisFromFood(f), grams, 'g').macros);
  }
  const totals = preciseMacros(sumMacros(parts));
  const perServing = preciseMacros(scaleMacros(totals, 1 / lib.servings));
  const uncountedKcal = lib.uncounted.reduce((s, u) => s + u[2], 0) / lib.servings;
  const derived: ComputedRecipe['derived'] = [];
  if (perServing.protein >= 25 && (perServing.protein * 4) / Math.max(perServing.kcal, 1) >= 0.3) derived.push('high-protein');
  if (perServing.kcal <= 400) derived.push('low-calorie');
  if (perServing.carbs <= 20) derived.push('low-carb');
  return {
    lib, ok: missing.length === 0, missing, estimatedFoods, uncountedKcal: Math.round(uncountedKcal), totals, perServing,
    totalTime: lib.prepMin + lib.cookMin, derived, isEstimate: estimatedFoods.length > 0 || uncountedKcal >= 5
  };
}

export async function computeLibrary(): Promise<ComputedRecipe[]> {
  const index = indexFoods(await db.foods.toArray());
  return LIBRARY.map((l) => computeLibraryRecipe(l, index));
}

/** Creates (or reuses) an editable user Recipe from a library recipe, using the user's food records. */
export async function materializeLibraryRecipe(libId: string): Promise<Recipe> {
  const lib = LIBRARY.find((l) => l.id === libId);
  if (!lib) throw new Error('Recipe not found');
  const existing = (await db.recipes.toArray()).find((r) => r.libraryId === libId && !r.deleted);
  if (existing) return existing;
  const index = indexFoods(await db.foods.toArray());
  const ings = [];
  for (const [name, grams] of lib.ingredients) {
    const f = findFood(index, name);
    if (!f || f.incomplete) throw new Error('MISSING_INGREDIENT:' + name);
    ings.push(await buildIngredient(f.id, grams, 'g'));
  }
  const r = await saveRecipe({ name: lib.nameAr, servings: lib.servings, ingredients: ings, notes: `lib:${lib.id}` });
  await db.recipes.update(r.id, { libraryId: lib.id });
  return { ...r, libraryId: lib.id };
}

/* ------------------------------------------------------------------ suggestions */

export interface SuggestFilters {
  meal?: MealType | '';
  maxKcal?: number | '';
  minProtein?: number | '';
  maxCarbs?: number | '';
  maxFat?: number | '';
  maxMinutes?: number | '';
  /** Only recipes whose every ingredient is among these food names. */
  haveIngredients?: string[];
  favoritesOnly?: boolean;
}

export interface Suggestion {
  kind: 'library' | 'user';
  id: string;
  name: string;
  emoji: string;
  servings: number; // multiplier of one serving
  macros: Macros;
  score: number;
  minutes: number | null;
  reason: string[]; // i18n keys
  computed?: ComputedRecipe;
  recipe?: Recipe;
}

const MULTS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Ranks recipes for the remaining budget. A recipe is only suggested when it fits the calorie budget
 * (small tolerance) AND contributes meaningfully to remaining protein — low calories alone never qualify.
 */
export function suggest(
  remaining: Macros,
  mealsLeft: number,
  library: ComputedRecipe[],
  userRecipes: Recipe[],
  filters: SuggestFilters = {},
  favorites: Set<string> = new Set(),
  ratings: Record<string, number> = {}
): Suggestion[] {
  if (remaining.kcal < 60) return [];
  const ideal = Math.max(remaining.kcal / Math.max(mealsLeft, 1), Math.min(remaining.kcal, 250));
  const pool: { kind: 'library' | 'user'; id: string; name: string; emoji: string; per: Macros; minutes: number | null; meals: MealType[] | null; ingredients: string[]; computed?: ComputedRecipe; recipe?: Recipe }[] = [];
  for (const c of library) if (c.ok) pool.push({ kind: 'library', id: c.lib.id, name: c.lib.nameAr, emoji: c.lib.emoji, per: c.perServing, minutes: c.totalTime, meals: c.lib.meals, ingredients: c.lib.ingredients.map((i) => i[0]), computed: c });
  for (const r of userRecipes) if (!r.deleted && !r.libraryId) pool.push({ kind: 'user', id: r.id, name: r.name, emoji: '🍽️', per: scaleMacros(r.totals, 1 / r.servings), minutes: null, meals: null, ingredients: r.ingredients.map((i) => i.name), recipe: r });

  const out: Suggestion[] = [];
  for (const p of pool) {
    if (filters.meal && p.meals && !p.meals.includes(filters.meal)) continue;
    if (filters.maxMinutes && p.minutes !== null && p.minutes > Number(filters.maxMinutes)) continue;
    if (filters.haveIngredients?.length) {
      const have = new Set(filters.haveIngredients);
      if (!p.ingredients.every((i) => have.has(i))) continue;
    }
    if (filters.favoritesOnly && !favorites.has(p.id)) continue;
    let best: Suggestion | null = null;
    for (const m of MULTS) {
      const mac = roundMacros(scaleMacros(p.per, m));
      const kcalCap = filters.maxKcal ? Number(filters.maxKcal) : remaining.kcal * 1.05 + 20;
      if (mac.kcal > kcalCap) continue;
      if (filters.minProtein && mac.protein < Number(filters.minProtein)) continue;
      if (filters.maxCarbs !== undefined && filters.maxCarbs !== '' && mac.carbs > Number(filters.maxCarbs)) continue;
      if (filters.maxFat !== undefined && filters.maxFat !== '' && mac.fat > Number(filters.maxFat)) continue;
      const needP = Math.max(remaining.protein, 0);
      // Must help with protein when protein is still needed.
      if (needP >= 15 && mac.protein < Math.min(needP * 0.35, 20)) continue;
      const pFill = needP > 0 ? Math.min(1, mac.protein / Math.min(needP, needP / Math.max(mealsLeft, 1) + 10)) : 1;
      const kcalErr = Math.abs(mac.kcal - ideal) / Math.max(ideal, 1);
      const carbOver = Math.max(0, mac.carbs - Math.max(remaining.carbs, 0));
      const fatOver = Math.max(0, mac.fat - Math.max(remaining.fat, 0));
      const density = (mac.protein * 4) / Math.max(mac.kcal, 1);
      const score = 50 * pFill - 30 * kcalErr - 25 * (carbOver / Math.max(remaining.carbs, 25)) - 25 * (fatOver / Math.max(remaining.fat, 10)) + 15 * density
        + (favorites.has(p.id) ? 4 : 0) + (ratings[p.id] ? (ratings[p.id] - 3) * 2 : 0) - (m !== 1 ? 2 : 0);
      if (!best || score > best.score) {
        const reason: string[] = [];
        if (needP > 0 && mac.protein >= needP * 0.4) reason.push('why_protein');
        if (mac.kcal <= remaining.kcal) reason.push('why_fitsKcal');
        if (carbOver === 0) reason.push('why_carbsOk');
        if (fatOver === 0) reason.push('why_fatOk');
        if (p.minutes !== null && p.minutes <= 20) reason.push('why_quick');
        best = { kind: p.kind, id: p.id, name: p.name, emoji: p.emoji, servings: m, macros: mac, score, minutes: p.minutes, reason, computed: p.computed, recipe: p.recipe };
      }
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}

/* ------------------------------------------------------------------ weekly plan generator */

export interface GeneratedDay {
  date: string;
  picks: { meal: MealType; libId: string; servings: number; macros: Macros }[];
  total: Macros;
}

/**
 * Picks breakfast / lunch / dinner / snack library recipes per day so the day total is close to the
 * targets (protein never far under, calories not over), avoiding repeating the same lunch/dinner.
 */
export function generatePlan(dates: string[], targetsFor: (d: string) => Macros, library: ComputedRecipe[], avoidIds: Set<string> = new Set()): GeneratedDay[] {
  const ok = library.filter((c) => c.ok && !avoidIds.has(c.lib.id));
  const by = (meal: MealType) => ok.filter((c) => c.lib.meals.includes(meal));
  const used = new Map<string, number>();
  const days: GeneratedDay[] = [];
  const mults = [0.75, 1, 1.25, 1.5, 1.75, 2];
  const snackMults = [1, 1.5];
  for (const date of dates) {
    const T = targetsFor(date);
    let best: { cost: number; picks: GeneratedDay['picks']; total: Macros } | null = null;
    const B = by('breakfast'), L = by('lunch'), D = by('dinner'), N = by('snacks');
    // Candidates: least-used first, mixing protein-dense and more filling options so days can reach the target.
    const pickOrder = (list: ComputedRecipe[]) => {
      const byUse = (a: ComputedRecipe, b: ComputedRecipe) => (used.get(a.lib.id) ?? 0) - (used.get(b.lib.id) ?? 0);
      const dense = [...list].sort((a, b) => byUse(a, b) || b.perServing.protein / Math.max(b.perServing.kcal, 1) - a.perServing.protein / Math.max(a.perServing.kcal, 1)).slice(0, 6);
      const filling = [...list].filter((c) => !dense.includes(c)).sort((a, b) => byUse(a, b) || b.perServing.kcal - a.perServing.kcal).slice(0, 3);
      return [...dense, ...filling];
    };
    for (const b of pickOrder(B)) for (const l of pickOrder(L)) for (const d of pickOrder(D)) {
      if (l.lib.id === d.lib.id) continue;
      for (const n of pickOrder(N)) for (const ml of mults) for (const md of mults) for (const mn of snackMults) {
        const parts = [b.perServing, scaleMacros(l.perServing, ml), scaleMacros(d.perServing, md), scaleMacros(n.perServing, mn)];
        const t = sumMacros(parts);
        const kcalOver = Math.max(0, t.kcal - T.kcal);
        const kcalUnder = Math.max(0, T.kcal - t.kcal);
        const pUnder = Math.max(0, T.protein - t.protein);
        const cost = (kcalOver / T.kcal) * 3 + (kcalUnder / T.kcal) * 1.2 + (pUnder / T.protein) * 3 + Math.abs(t.carbs - T.carbs) / T.carbs * 0.8 + Math.abs(t.fat - T.fat) / T.fat * 0.8
          + ((used.get(l.lib.id) ?? 0) + (used.get(d.lib.id) ?? 0)) * 0.08 + ((used.get(b.lib.id) ?? 0) + (used.get(n.lib.id) ?? 0)) * 0.03;
        if (!best || cost < best.cost) {
          best = {
            cost, total: roundMacros(t),
            picks: [
              { meal: 'breakfast', libId: b.lib.id, servings: 1, macros: roundMacros(b.perServing) },
              { meal: 'lunch', libId: l.lib.id, servings: ml, macros: roundMacros(scaleMacros(l.perServing, ml)) },
              { meal: 'dinner', libId: d.lib.id, servings: md, macros: roundMacros(scaleMacros(d.perServing, md)) },
              { meal: 'snacks', libId: n.lib.id, servings: mn, macros: roundMacros(scaleMacros(n.perServing, mn)) }
            ]
          };
        }
      }
    }
    if (!best) continue;
    for (const p of best.picks) used.set(p.libId, (used.get(p.libId) ?? 0) + 1);
    days.push({ date, picks: best.picks, total: best.total });
  }
  return days;
}

/** Writes generated days into the planner (creates editable user recipes as needed). */
export async function applyGeneratedPlan(days: GeneratedDay[]) {
  for (const d of days) {
    const items: PlanItem[] = [];
    for (const p of d.picks) {
      const r = await materializeLibraryRecipe(p.libId);
      items.push({ id: uid(), meal: p.meal, recipeId: r.id, name: r.name, quantity: p.servings, unit: 'serving' });
    }
    await setPlannedDay(d.date, items);
  }
}

/* ------------------------------------------------------------------ shopping list */

export interface ShoppingItem {
  key: string;
  name: string;
  state: Food['state'];
  grams: number;
  category: string;
}

export async function shoppingList(dates: string[]): Promise<ShoppingItem[]> {
  const planned = await db.plannedDays.where('date').anyOf(dates).toArray();
  const foods = new Map((await db.foods.toArray()).map((f) => [f.id, f]));
  const acc = new Map<string, ShoppingItem>();
  const add = (f: Food | undefined, name: string, grams: number) => {
    const key = f?.id ?? name;
    const cur = acc.get(key) ?? { key, name: f ? f.nameAr || f.nameEn : name, state: f?.state ?? 'other', grams: 0, category: f?.category ?? '' };
    cur.grams += grams;
    acc.set(key, cur);
  };
  for (const p of planned) for (const it of p.items) {
    if (it.recipeId) {
      const r = await db.recipes.get(it.recipeId);
      if (!r) continue;
      const factor = it.quantity / r.servings;
      for (const ing of r.ingredients) add(foods.get(ing.foodId), ing.name, ing.grams * factor);
    } else if (it.foodId) {
      const f = foods.get(it.foodId);
      if (!f) continue;
      try { add(f, it.name, macrosFor(basisFromFood(f), it.quantity, it.unit, it.servingId).grams); } catch { /* skip */ }
    }
  }
  return [...acc.values()].map((x) => ({ ...x, grams: Math.round(x.grams) })).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function recipeMeta(): Promise<{ favorites: Set<string>; ratings: Record<string, number> }> {
  return { favorites: new Set(await kvGet<string[]>('recipeFavorites', [])), ratings: await kvGet<Record<string, number>>('recipeRatings', {}) };
}

/* ------------------------------------------------------------------ "What can I cook today?" */

/** Ingredients that don't decide whether you can cook a dish (kept in every kitchen). */
const STAPLES = new Set(['زيت زيتون', 'زيت طهي عام', 'زبدة']);

/** Practical swaps between foods of the user's database (same role in a recipe). */
export const SUBSTITUTES: Record<string, string[]> = {
  'صدر دجاج': ['فخذ دجاج بدون جلد', 'ديك رومي (توركي) مفروم'],
  'فخذ دجاج بدون جلد': ['صدر دجاج'],
  'أرز أبيض': ['أرز بسمتي نيء/جاف', 'برغل نيء/جاف', 'كينوا نيئة/جافة'],
  'أرز بسمتي نيء/جاف': ['أرز أبيض', 'برغل نيء/جاف'],
  'معكرونة نيئة/جافة': ['أرز أبيض', 'برغل نيء/جاف'],
  'زبادي يوناني قليل الدسم': ['زبادي يوناني خالي الدسم', 'جبن قريش قليل الدسم'],
  'زبادي يوناني خالي الدسم': ['زبادي يوناني قليل الدسم', 'جبن قريش قليل الدسم'],
  'توست بر (خبز أسمر)': ['خبز عربي أسمر', 'تورتيلا قمح'],
  'خبز عربي أسمر': ['توست بر (خبز أسمر)', 'تورتيلا قمح'],
  'تورتيلا قمح': ['خبز عربي أسمر'],
  'سمك بلطي/تلابيا': ['سمك قاروس (سي باس) نيء'],
  'سمك قاروس (سي باس) نيء': ['سمك بلطي/تلابيا'],
  'لحم بقري قليل الدهن 90/10': ['ديك رومي (توركي) مفروم'],
  'ديك رومي (توركي) مفروم': ['لحم بقري قليل الدهن 90/10', 'صدر دجاج'],
  'بطاطس': ['بطاطا حلوة نيئة'],
  'بطاطا حلوة نيئة': ['بطاطس'],
  'جبن موزاريلا قليلة الدسم': ['جبن شيدر كامل الدسم'],
  'فراولة': ['مانجو', 'موز'],
  'بروكلي': ['قرنبيط', 'فاصوليا خضراء'],
  'كوسا': ['باذنجان'],
  'فاصوليا حمراء مطبوخة': ['فاصوليا سوداء مطبوخة', 'حمص مطبوخ'],
  'حمص مطبوخ': ['فاصوليا حمراء مطبوخة']
};

export interface CookMatch {
  c: ComputedRecipe;
  have: string[];
  missing: { name: string; swap?: string }[];
  matchPct: number;
  /** servings that fit the remaining calories (0.5–2), null when nothing remains */
  servings: number | null;
  macros: Macros;
}

export function allLibraryIngredients(lib: ComputedRecipe[]): string[] {
  const set = new Set<string>();
  for (const c of lib) for (const [n] of c.lib.ingredients) if (!STAPLES.has(n)) set.add(n);
  return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
}

export function whatCanICook(lib: ComputedRecipe[], pantry: string[], remaining: Macros | null, f: { meal?: MealType | ''; method?: string; maxMinutes?: number | '' } = {}): CookMatch[] {
  const have = new Set(pantry);
  const out: CookMatch[] = [];
  for (const c of lib) {
    if (!c.ok) continue;
    if (f.meal && !c.lib.meals.includes(f.meal)) continue;
    if (f.method && !(c.lib.methods as string[]).includes(f.method)) continue;
    if (f.maxMinutes && c.totalTime > Number(f.maxMinutes)) continue;
    const main = c.lib.ingredients.map((i) => i[0]).filter((n) => !STAPLES.has(n));
    const got: string[] = [];
    const missing: { name: string; swap?: string }[] = [];
    for (const n of main) {
      if (have.has(n)) { got.push(n); continue; }
      const swap = (SUBSTITUTES[n] ?? []).find((s) => have.has(s));
      if (swap) got.push(n);
      missing.push({ name: n, swap });
    }
    const covered = main.filter((n) => have.has(n) || (SUBSTITUTES[n] ?? []).some((s) => have.has(s))).length;
    const matchPct = main.length ? Math.round((covered / main.length) * 100) : 0;
    if (matchPct < 50) continue;
    let servings: number | null = 1;
    if (remaining) {
      if (remaining.kcal < 60) servings = null;
      else {
        const fit = [2, 1.5, 1.25, 1, 0.75, 0.5].find((m) => c.perServing.kcal * m <= remaining.kcal * 1.05 + 20);
        servings = fit ?? 0.5;
      }
    }
    out.push({ c, have: got, missing: missing.filter((m) => !have.has(m.name)), matchPct, servings, macros: roundMacros(scaleMacros(c.perServing, servings ?? 1)) });
  }
  return out.sort((a, b) => b.matchPct - a.matchPct || b.macros.protein - a.macros.protein);
}

/** Swaps one meal of a generated day for the closest-calorie alternative not already used that week. */
export function replacePick(days: GeneratedDay[], date: string, meal: MealType, lib: ComputedRecipe[]): GeneratedDay[] {
  const used = new Set(days.flatMap((d) => d.picks.map((p) => p.libId)));
  return days.map((d) => {
    if (d.date !== date) return d;
    const cur = d.picks.find((p) => p.meal === meal)!;
    const target = cur.macros.kcal;
    const options = lib.filter((c) => c.ok && c.lib.meals.includes(meal) && !used.has(c.lib.id) && c.lib.id !== cur.libId)
      .map((c) => {
        const m = [0.75, 1, 1.25, 1.5, 1.75, 2].reduce((best, x) => (Math.abs(c.perServing.kcal * x - target) < Math.abs(c.perServing.kcal * best - target) ? x : best), 1);
        return { c, m, err: Math.abs(c.perServing.kcal * m - target) - c.perServing.protein * m * 2 };
      })
      .sort((a, b) => a.err - b.err);
    const alt = options[0];
    if (!alt) return d;
    const picks = d.picks.map((p) => (p.meal === meal ? { meal, libId: alt.c.lib.id, servings: alt.m, macros: roundMacros(scaleMacros(alt.c.perServing, alt.m)) } : p));
    return { ...d, picks, total: roundMacros(sumMacros(picks.map((p) => p.macros))) };
  });
}
