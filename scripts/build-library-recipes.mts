/**
 * Writes public/fooddb/library-recipes.json: the recipe library's ingredient lists (public) plus, for every
 * ingredient, its hand-checked USDA FoodData Central reference values (public). Used by
 * `node scripts/laptop-setup.mjs --hub-complete-foods`, which computes the ready meals from the Hub's own values.
 * Usage: npx tsx scripts/build-library-recipes.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { LIBRARY } from '../src/lib/recipeEngine';
import { RECIPE_REF } from '../src/lib/recipeRefMap';
import { refById, setRefData } from '../src/lib/refFoods';

setRefData(JSON.parse(readFileSync('public/fooddb/usda.json', 'utf8')));
const names = JSON.parse(readFileSync('public/fooddb/food-names.json', 'utf8')).names as Record<string, string>;
const reference: Record<string, unknown> = {};
for (const n of new Set(LIBRARY.flatMap((l) => l.ingredients.map((i) => i[0])))) {
  const rf = RECIPE_REF[n] ? refById(RECIPE_REF[n]!) : undefined;
  reference[n] = rf ? { nameEn: names[n] ?? rf.name, per100: rf.per100, state: rf.state, source: rf.source } : null;
}
const recipes = LIBRARY.map((l) => ({
  id: l.id, nameAr: l.nameAr, nameEn: l.nameEn, servings: l.servings,
  ingredients: l.ingredients.map((i) => [i[0], i[1]]),
  uncountedKcalPerServing: Math.round(l.uncounted.reduce((s, u) => s + u[2], 0) / l.servings)
}));
writeFileSync('public/fooddb/library-recipes.json', JSON.stringify({ about: 'MEGO recipe library: ingredients (g) and USDA reference values per ingredient (null = no verified reference, never estimated)', recipes, reference }) + '\n');
console.log(`${recipes.length} recipes, ${Object.keys(reference).length} ingredients, ${Object.values(reference).filter((x) => !x).length} without reference`);
