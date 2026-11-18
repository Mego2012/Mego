// Prints the library recipes (id, names) as JSON for scripts/dish-photos/licenses_doc.py. Run: npx vite-node scripts/dish-photos/recipes.ts
import { LIBRARY } from '../../src/lib/recipeEngine';
console.log(JSON.stringify(LIBRARY.map((r) => ({ id: r.id, en: r.nameEn, ar: r.nameAr }))));
