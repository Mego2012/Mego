/**
 * Read-only data integrity check, run on the user's own device (where the real records live).
 * Compares current record counts with the newest pre-update backup and lists foods whose values look like
 * "per serving" instead of "per 100 g" (e.g. a protein powder at 120 kcal/100 g). Never changes anything.
 */
import { db } from './db';
import { LIBRARY } from './recipeEngine';
import type { Food } from './types';

const POWDER = /(واي|whey|بروتين\s*(?:\(?سكوب|مسحوق)|protein\s*powder|isolate|كازين|casein)/i;
/** A protein powder is ≈ 350–420 kcal per 100 g; < 250 kcal/100 g almost certainly means per-scoop values. */
export function suspectPerServing(f: Pick<Food, 'nameAr' | 'nameEn' | 'category' | 'per100'>): boolean {
  return POWDER.test(`${f.nameAr} ${f.nameEn} ${f.category}`) && f.per100.kcal > 0 && f.per100.kcal < 250;
}

export interface DataCheck {
  counts: Record<'entries' | 'loggedDays' | 'body' | 'weights' | 'waists' | 'days' | 'foods' | 'recipes' | 'backups', number>;
  firstEntry: string | null;
  lastEntry: string | null;
  targets: { training: number; rest: number } | null;
  preUpdate: { at: number; release?: string; entries: number; body: number; days: number; foods: number; recipes: number } | null;
  /** true when every table has at least as many records as in the pre-update backup. */
  intact: boolean | null;
  suspectFoods: { id: string; name: string; kcal: number; protein: number; diaryEntries: number; myRecipes: string[]; libraryRecipes: string[] }[];
}

export async function runDataCheck(): Promise<DataCheck> {
  const entries = await db.entries.toArray();
  const body = await db.body.toArray();
  const foods = await db.foods.toArray();
  const recipes = (await db.recipes.toArray()).filter((r) => !r.deleted);
  const settings = await db.settings.get('main');
  const dates = [...new Set(entries.map((e) => e.date))].sort();
  const backups = await db.backups.orderBy('at').toArray();
  const pre = backups.filter((b) => b.reason === 'pre-update').pop();
  let preUpdate: DataCheck['preUpdate'] = null;
  if (pre) {
    try {
      const t = JSON.parse(pre.json).tables as Record<string, unknown[]>;
      preUpdate = { at: pre.at, release: pre.release, entries: t.entries?.length ?? 0, body: t.body?.length ?? 0, days: t.days?.length ?? 0, foods: t.foods?.length ?? 0, recipes: t.recipes?.length ?? 0 };
    } catch { /* unreadable backup → reported as missing */ }
  }
  const counts = {
    entries: entries.length, loggedDays: dates.length, body: body.length, weights: body.filter((b) => b.weight).length, waists: body.filter((b) => b.waist).length,
    days: await db.days.count(), foods: foods.length, recipes: recipes.length, backups: backups.length
  };
  const intact = preUpdate ? counts.entries >= preUpdate.entries && counts.body >= preUpdate.body && counts.days >= preUpdate.days && counts.foods >= preUpdate.foods : null;
  const suspectFoods = foods.filter((f) => !f.archived && suspectPerServing(f)).map((f) => ({
    id: f.id, name: f.nameAr || f.nameEn, kcal: f.per100.kcal, protein: f.per100.protein,
    diaryEntries: entries.filter((e) => e.foodId === f.id).length,
    myRecipes: recipes.filter((r) => r.ingredients.some((i) => i.foodId === f.id)).map((r) => r.name),
    libraryRecipes: LIBRARY.filter((l) => l.ingredients.some((i) => i[0] === f.nameAr)).map((l) => l.nameAr)
  }));
  return {
    counts, firstEntry: dates[0] ?? null, lastEntry: dates[dates.length - 1] ?? null,
    targets: settings ? { training: settings.targets.training.kcal, rest: settings.targets.rest.kcal } : null,
    preUpdate, intact, suspectFoods
  };
}
