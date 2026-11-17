/**
 * Food preferences used by recommendations and the meal planner (never by the nutrition maths):
 *  - excluded ingredients (e.g. whey, oats): recipes containing them are not suggested or planned;
 *  - a daily limit for yogurt containers (one container = 170 g), counting what is already logged today.
 * Recipes are never deleted or changed — they are only left out of suggestions and plans; the library can still show
 * them (marked) so nothing disappears silently.
 */
import type { DiaryEntry } from './types';

export const EXCLUDE_OPTIONS = ['whey', 'oats', 'fish', 'shellfish', 'beef', 'liver', 'nuts', 'eggs', 'dairy', 'gluten'] as const;
export type ExcludeId = (typeof EXCLUDE_OPTIONS)[number];

/** Arabic ingredient names of the library (and English for the user's own foods). */
const PATTERNS: Record<ExcludeId, RegExp> = {
  whey: /واي|whey/i,
  oats: /شوفان|\boats?\b|oatmeal/i,
  fish: /سمك|تونة|سلمون|بلطي|تلابيا|ماكريل|قاروس|\bfish\b|tuna|salmon|tilapia|mackerel/i,
  shellfish: /روبيان|جمبري|shrimp|prawn/i,
  beef: /لحم بقري|كبد بقري|\bbeef\b/i,
  liver: /كبد|liver/i,
  nuts: /لوز|جوز|فول سوداني|كاجو|فستق|almond|walnut|peanut|cashew|pistachio/i,
  eggs: /بيض|\beggs?\b/i,
  dairy: /حليب|زبادي|جبن|لبنة|زبدة(?! فول)|\bmilk\b|yog(h)?urt|cheese|butter(?!.*peanut)/i,
  gluten: /خبز|توست|معكرونة|برغل|كسكس|تورتيلا|قمح|bread|pasta|bulgur|couscous|tortilla|wheat/i
};

export const YOGURT = /زبادي|yog(h)?urt/i;
export const YOGURT_CONTAINER_G = 170;

export interface FoodPrefs {
  exclude: ExcludeId[];
  /** maximum yogurt containers per day; undefined = no limit */
  yogurtPerDay?: number;
  /** meals per day for generated plans: 3 (breakfast, lunch, dinner) or 4 (+ a snack, default) */
  mealsPerDay?: 3 | 4;
}
export const NO_PREFS: FoodPrefs = { exclude: [] };

export function excludedBy(ingredients: string[], prefs: FoodPrefs): ExcludeId[] {
  return prefs.exclude.filter((id) => ingredients.some((name) => PATTERNS[id].test(name)));
}

/** Grams of yogurt already logged on the given day's entries. */
export function yogurtLoggedG(entries: DiaryEntry[]): number {
  return entries.filter((e) => YOGURT.test(e.name)).reduce((a, e) => a + (e.grams ?? 0), 0);
}

/** Yogurt grams still allowed today (Infinity when there is no limit). */
export function yogurtLeftG(prefs: FoodPrefs, todayEntries: DiaryEntry[]): number {
  if (prefs.yogurtPerDay === undefined) return Infinity;
  return Math.max(0, prefs.yogurtPerDay * YOGURT_CONTAINER_G - yogurtLoggedG(todayEntries));
}

/** Yogurt grams in ONE serving of a library recipe (ingredients + seasonings ÷ servings). */
export function yogurtPerServingG(items: [string, number, ...unknown[]][], servings: number): number {
  return items.filter(([n]) => YOGURT.test(n)).reduce((a, [, g]) => a + g, 0) / Math.max(servings, 1);
}
