/**
 * "Complete my food database" from the recipe library:
 *  1. every ingredient used by the 101 library recipes becomes a food in the user's own list (USDA FoodData Central
 *     reference values, the same hand-checked matches the recipe pages use) — unless a food of that name exists;
 *  2. every library recipe whose ingredients are all known becomes a ready food with a "serving" portion, so it can be
 *     logged in one tap. Values per 100 g are relative to the raw ingredient weight; logging by serving is exact.
 * Adds only — existing foods are never changed. Ingredients without a verified reference (e.g. labneh) are never
 * estimated: they are reported as missing, and recipes that need them are skipped.
 */
import { db } from './db';
import { saveLocalBackup } from './localBackup';
import { preciseMacros, scaleMacros } from './nutrition';
import { allIngredients, zeroRef, approveRecipeMatches, computeLibraryRecipe, findFood, indexFoods, LIBRARY, type RefResolver } from './recipeEngine';
import { RECIPE_REF } from './recipeRefMap';
import { loadRefFoods, refById } from './refFoods';
import { createFood, updateFood } from './repo';
import type { Food, Macros } from './types';
import { loadFoodNames } from './foodNames';

export const RECIPE_FOOD_CATEGORY = 'وجبات (مكتبة الوصفات)';
export const recipeFoodRef = (libId: string) => `MEGO recipe library: ${libId}`;

export interface IngredientPlan { name: string; status: 'exists' | 'add' | 'missing'; refId?: string; refName?: string; per100?: Macros }
export interface RecipeFoodPlan {
  libId: string; nameAr: string; nameEn: string; status: 'exists' | 'add' | 'incomplete';
  missing: string[]; servingGrams: number; perServing: Macros; per100: Macros; uncountedKcal: number;
}
export interface LibraryFoodsPlan { ingredients: IngredientPlan[]; recipes: RecipeFoodPlan[] }

/** Pure: what would be added for this list of foods (no database access). */
export function planLibraryFoods(foods: Food[], ref: RefResolver): LibraryFoodsPlan {
  const index = indexFoods(foods);
  const names = [...new Set(LIBRARY.flatMap((l) => allIngredients(l).map((i) => i[0])))];
  const virtual: Food[] = [...foods.filter((f) => !f.archived)];
  const ingredients: IngredientPlan[] = names.map((name): IngredientPlan | null => {
    const own = findFood(index, name);
    if (own && !own.incomplete) return { name, status: 'exists' };
    const id = RECIPE_REF[name];
    const rf = id ? ref(id) : undefined;
    if (!rf) return { name, status: 'missing' };
    if (zeroRef(rf)) return null; // salt: 0 kcal, counted in recipes from the reference, nothing to store
    virtual.push({ id: 'virtual:' + name, nameAr: name, nameEn: rf.name, category: rf.category, per100: rf.per100, state: rf.state, stateLabel: '', prep: '', notes: '', servings: [], favorite: false, source: 'usda', incomplete: false, archived: false, version: 1, createdAt: 0, updatedAt: 0, useCount: 0 });
    return { name, status: 'add', refId: rf.id, refName: rf.name, per100: rf.per100 };
  }).filter((x): x is IngredientPlan => x !== null);
  const vIndex = indexFoods(virtual);
  const recipes: RecipeFoodPlan[] = LIBRARY.map((lib) => {
    const c = computeLibraryRecipe(lib, vIndex, ref);
    const total = allIngredients(lib).reduce((a, i) => a + i[1], 0);
    const per100 = preciseMacros(scaleMacros(c.totals, total > 0 ? 100 / total : 0));
    const exists = foods.some((f) => !f.archived && (f.sourceRef === recipeFoodRef(lib.id) || f.nameAr === lib.nameAr));
    return {
      libId: lib.id, nameAr: lib.nameAr, nameEn: lib.nameEn, status: !c.ok ? 'incomplete' : exists ? 'exists' : 'add',
      missing: c.missing, servingGrams: c.gramsPerServing, perServing: c.perServing, per100, uncountedKcal: c.uncountedKcal
    };
  });
  return { ingredients, recipes };
}

/** Loads the reference data and returns the plan for the current account (read-only preview). */
export async function previewLibraryFoods(): Promise<LibraryFoodsPlan> {
  await loadRefFoods();
  return planLibraryFoods(await db.foods.toArray(), refById);
}

/** Applies the plan: a local backup first, then new foods only. Returns what was added. */
export async function completeFoodDatabase(): Promise<{ ingredientsAdded: number; recipesAdded: number; missing: string[]; skippedRecipes: string[] }> {
  await loadRefFoods();
  const startedAt = Date.now();
  const before = planLibraryFoods(await db.foods.toArray(), refById);
  const toAdd = before.ingredients.filter((i) => i.status === 'add').map((i) => i.name);
  const recipesToAdd = before.recipes.filter((r) => r.status === 'add');
  if (toAdd.length || recipesToAdd.length) await saveLocalBackup('pre-import');
  const ingredientsAdded = toAdd.length ? await approveRecipeMatches(toAdd) : 0;
  // the new ingredient foods carry the long USDA description in English; use the short dictionary name when known
  if (ingredientsAdded) {
    const d = await loadFoodNames().catch(() => ({} as Record<string, string>));
    for (const f of await db.foods.toArray()) {
      if (f.source === 'usda' && /approved recipe match/.test(f.notes) && d[f.nameAr] && f.nameEn !== d[f.nameAr] && f.createdAt >= startedAt) await updateFood(f.id, { nameEn: d[f.nameAr] }).catch(() => undefined);
    }
  }
  // recompute with the foods that now exist, so recipe values use exactly the records the user has
  const plan = planLibraryFoods(await db.foods.toArray(), refById);
  let recipesAdded = 0;
  for (const r of plan.recipes) {
    if (r.status !== 'add') continue;
    await createFood({
      nameAr: r.nameAr, nameEn: r.nameEn, category: RECIPE_FOOD_CATEGORY, per100: r.per100, state: 'cooked', stateLabel: 'وجبة',
      prep: '', pieceGrams: r.servingGrams, source: 'custom', sourceRef: recipeFoodRef(r.libId),
      notes: `محسوبة من مكونات الوصفة (قيم USDA أو أطعمتك). الحصة = ${r.servingGrams} غ من المكونات قبل الطهي؛ سجّلها بالحصة.` +
        (r.uncountedKcal ? ` البهارات والتوابل (~${r.uncountedKcal} سعرة/حصة) غير محسوبة.` : ' البهارات والزيوت والصلصات محسوبة بأوزانها الدقيقة.'),
      servings: [{ id: 'serving', name: 'حصة (وصفة)', grams: r.servingGrams }]
    }, { allowDuplicate: true });
    recipesAdded++;
  }
  return {
    ingredientsAdded, recipesAdded,
    missing: plan.ingredients.filter((i) => i.status === 'missing').map((i) => i.name),
    skippedRecipes: plan.recipes.filter((r) => r.status === 'incomplete').map((r) => r.nameAr)
  };
}
