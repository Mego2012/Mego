import { expandQuery, matchesLocal } from './foodSearch';
import { normalizeText } from './normalize';
import type { Food } from './types';

export { normalizeText } from './normalize';

export interface FoodFilter {
  q?: string;
  category?: string;
  state?: Food['state'] | '';
  maxKcal?: number | '';
  minProtein?: number | '';
  maxCarbs?: number | '';
  maxFat?: number | '';
  favoritesOnly?: boolean;
  includeArchived?: boolean;
}

export function filterFoods(foods: Food[], f: FoodFilter): Food[] {
  const terms = f.q ? normalizeText(f.q).split(' ').filter(Boolean) : [];
  const groups = f.q ? expandQuery(f.q) : [];
  const res = foods.filter((x) => {
    if (!f.includeArchived && x.archived) return false;
    if (f.category && x.category !== f.category) return false;
    if (f.state && x.state !== f.state) return false;
    if (f.favoritesOnly && !x.favorite) return false;
    if (f.maxKcal !== undefined && f.maxKcal !== '' && x.per100.kcal > f.maxKcal) return false;
    if (f.minProtein !== undefined && f.minProtein !== '' && x.per100.protein < f.minProtein) return false;
    if (f.maxCarbs !== undefined && f.maxCarbs !== '' && x.per100.carbs > f.maxCarbs) return false;
    if (f.maxFat !== undefined && f.maxFat !== '' && x.per100.fat > f.maxFat) return false;
    // Arabic ⇄ English word translations and spelling variants (e.g. "chicken breast" finds «صدر دجاج»)
    if (groups.length && !matchesLocal(`${x.nameAr} ${x.nameEn} ${x.category} ${x.prep} ${x.brand ?? ''}`, groups)) return false;
    return true;
  });
  if (terms.length) {
    const q = normalizeText(f.q!);
    const score = (x: Food) => {
      const a = normalizeText(x.nameAr);
      const e = normalizeText(x.nameEn);
      return (a === q || e === q ? 0 : a.startsWith(q) || e.startsWith(q) ? 1 : 2) - (x.favorite ? 0.5 : 0) - Math.min(0.4, (x.useCount ?? 0) / 50);
    };
    res.sort((a, b) => score(a) - score(b));
  }
  return res;
}
