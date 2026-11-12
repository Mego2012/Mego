/**
 * Cooking Guide — exact seasoning amounts.
 *
 * Every seasoning, sauce and marinade item of the recipe library is a real ingredient with an exact weight and is
 * counted in the nutrition like any other ingredient (USDA FoodData Central rows via recipeRefMap.ts, or the user's
 * own food with the same Arabic name). Nothing is counted as "0" by assumption: salt and water really are 0 kcal.
 *
 * The first 101 library recipes named their seasonings as groups ("spices (salt, pepper, cumin, paprika)") with a
 * rough calorie guess. GROUPS turns each group into exact per-serving weights; `seasoningsFromGroups` multiplies by
 * the recipe's servings. Items without a USDA equivalent (sumac, dried lime) are never estimated: they stay listed
 * as "not counted" with the reason.
 */

export type Ing = [name: string, grams: number, noteAr?: string, noteEn?: string];

/** Household measure per item: grams in 1 teaspoon (USDA portion data where available) or per piece. */
interface Measure { en: string; tsp?: number; piece?: [grams: number, ar: string, en: string]; liquid?: boolean }

export const SEASONING_INFO: Record<string, Measure> = {
  'ملح': { en: 'Salt', tsp: 6 },
  'فلفل أسود مطحون': { en: 'Ground black pepper', tsp: 2.3 },
  'كمون مطحون': { en: 'Ground cumin', tsp: 2.1 },
  'بابريكا': { en: 'Paprika', tsp: 2.3 },
  'شطة مطحونة (فلفل أحمر حار)': { en: 'Cayenne / chili powder', tsp: 1.8 },
  'كركم مطحون': { en: 'Ground turmeric', tsp: 3 },
  'قرفة مطحونة': { en: 'Ground cinnamon', tsp: 2.6 },
  'زنجبيل مطحون': { en: 'Ground ginger', tsp: 1.8 },
  'كاري بودرة': { en: 'Curry powder', tsp: 2 },
  'هيل مطحون': { en: 'Ground cardamom', tsp: 2 },
  'قرنفل مطحون': { en: 'Ground cloves', tsp: 2.1 },
  'بهار حلو مطحون': { en: 'Ground allspice', tsp: 1.9 },
  'كزبرة ناشفة مطحونة': { en: 'Ground coriander', tsp: 1.8 },
  'جوزة الطيب مطحونة': { en: 'Ground nutmeg', tsp: 2.2 },
  'بودرة ثوم': { en: 'Garlic powder', tsp: 3.1 },
  'بودرة بصل': { en: 'Onion powder', tsp: 2.4 },
  'زعتر مجفف': { en: 'Dried thyme', tsp: 1 },
  'أوريجانو مجفف': { en: 'Dried oregano', tsp: 1 },
  'روزماري مجفف': { en: 'Dried rosemary', tsp: 1.2 },
  'ريحان مجفف': { en: 'Dried basil', tsp: 0.7 },
  'نعناع مجفف': { en: 'Dried mint', tsp: 0.5 },
  'ثوم': { en: 'Garlic', piece: [3, 'فص', 'clove'] },
  'زنجبيل طازج': { en: 'Fresh ginger', tsp: 2 },
  'عصير ليمون': { en: 'Lemon juice', tsp: 5, liquid: true },
  'عصير ليم (لايم)': { en: 'Lime juice', tsp: 5, liquid: true },
  'بقدونس طازج': { en: 'Fresh parsley', tsp: 1.3 },
  'كزبرة خضراء طازجة': { en: 'Fresh coriander', tsp: 1 },
  'نعناع طازج': { en: 'Fresh mint', tsp: 1.9 },
  'شبت طازج': { en: 'Fresh dill', tsp: 0.9 },
  'ريحان طازج': { en: 'Fresh basil', tsp: 0.9 },
  'صويا صوص قليل الصوديوم': { en: 'Low-sodium soy sauce', tsp: 5.3, liquid: true },
  'صلصة حارة (سريراتشا)': { en: 'Sriracha hot sauce', tsp: 5.3, liquid: true },
  'خل أبيض': { en: 'White vinegar', tsp: 5, liquid: true },
  'خل أحمر': { en: 'Red wine vinegar', tsp: 5, liquid: true },
  'خل بلسمي': { en: 'Balsamic vinegar', tsp: 5.3, liquid: true },
  'خردل': { en: 'Prepared mustard', tsp: 5 },
  'عسل': { en: 'Honey', tsp: 7 },
  'فانيليا سائلة': { en: 'Vanilla extract', tsp: 4.2, liquid: true },
  'كاكاو خام بودرة': { en: 'Unsweetened cocoa powder', tsp: 1.8 },
  'مخلل خيار': { en: 'Dill pickles', piece: [7, 'شريحة', 'slice'] },
  'معجون طماطم': { en: 'Tomato paste', tsp: 5.5 },
  'زيت زيتون': { en: 'Olive oil', tsp: 4.5, liquid: true },
  'زيت أفوكادو': { en: 'Avocado oil', tsp: 4.5, liquid: true },
  'زبدة': { en: 'Butter', tsp: 4.7 },
  'زبدة غير مملحة': { en: 'Unsalted butter', tsp: 4.7 },
  'نشا ذرة': { en: 'Cornstarch', tsp: 2.7 },
  'طحينة': { en: 'Tahini', tsp: 5 },
  'جبن بارميزان مبشور': { en: 'Grated parmesan', tsp: 1.7 }
};

/** Exact per-serving weights for each seasoning group used by the original library (keyed by the group's English label). */
type Line = [name: string, gramsPerServing: number];
export const GROUPS: Record<string, { lines: Line[]; notCounted?: [string, string][] }> = {
  'garlic': { lines: [['ثوم', 3]] },
  'lemon juice': { lines: [['عصير ليمون', 10]] },
  'spices (salt, pepper, cumin, paprika)': { lines: [['ملح', 1], ['فلفل أسود مطحون', 0.3], ['كمون مطحون', 0.5], ['بابريكا', 0.8]] },
  'herbs (parsley/coriander/mint)': { lines: [['بقدونس طازج', 5]] },
  'herbs': { lines: [['بقدونس طازج', 5]] },
  'low-sodium soy sauce': { lines: [['صويا صوص قليل الصوديوم', 8]] },
  'hot sauce': { lines: [['صلصة حارة (سريراتشا)', 3]] },
  'vinegar': { lines: [['خل أبيض', 5]] },
  'mustard': { lines: [['خردل', 5]] },
  'stock/water': { lines: [] },
  'water/stock': { lines: [] },
  'cinnamon': { lines: [['قرفة مطحونة', 0.5]] },
  'cinnamon / vanilla': { lines: [['قرفة مطحونة', 0.5], ['فانيليا سائلة', 1]] },
  'pickles': { lines: [['مخلل خيار', 14]] },
  'mustard & pickles': { lines: [['خردل', 5], ['مخلل خيار', 14]] },
  'curry powder, turmeric, ginger': { lines: [['كاري بودرة', 1.5], ['كركم مطحون', 0.5], ['زنجبيل مطحون', 0.5]] },
  'cocoa powder (optional)': { lines: [['كاكاو خام بودرة', 3]] },
  'kabsa spices, cardamom, dried lime': {
    lines: [['هيل مطحون', 0.4], ['قرفة مطحونة', 0.3], ['قرنفل مطحون', 0.1], ['فلفل أسود مطحون', 0.3], ['كمون مطحون', 0.3], ['ملح', 1]],
    notCounted: [['لومي (ليمون أسود) — يُزال قبل التقديم', 'dried lime — removed before serving']]
  },
  'kabsa spices, cardamom, cinnamon, dried lime': {
    lines: [['هيل مطحون', 0.4], ['قرفة مطحونة', 0.3], ['قرنفل مطحون', 0.1], ['فلفل أسود مطحون', 0.3], ['كمون مطحون', 0.3], ['ملح', 1]],
    notCounted: [['لومي (ليمون أسود) — يُزال قبل التقديم', 'dried lime — removed before serving']]
  },
  'shawarma spices': { lines: [['كمون مطحون', 0.5], ['بابريكا', 0.5], ['كركم مطحون', 0.3], ['قرفة مطحونة', 0.2], ['بودرة ثوم', 0.5], ['فلفل أسود مطحون', 0.3], ['ملح', 1]] },
  'cumin, cinnamon, fish spices': { lines: [['كمون مطحون', 0.5], ['قرفة مطحونة', 0.2], ['كزبرة ناشفة مطحونة', 0.3], ['بابريكا', 0.3], ['ملح', 1]] },
  'chili': { lines: [['شطة مطحونة (فلفل أحمر حار)', 0.2]] },
  'ginger': { lines: [['زنجبيل طازج', 2]] },
  'paprika & chili': { lines: [['بابريكا', 0.8], ['شطة مطحونة (فلفل أحمر حار)', 0.2]] },
  'cumin': { lines: [['كمون مطحون', 0.5]] },
  'cumin, coriander, chili': { lines: [['كمون مطحون', 0.5], ['كزبرة ناشفة مطحونة', 0.3], ['شطة مطحونة (فلفل أحمر حار)', 0.2]] },
  'cumin & turmeric': { lines: [['كمون مطحون', 0.5], ['كركم مطحون', 0.3]] },
  'cumin & chili': { lines: [['كمون مطحون', 0.5], ['شطة مطحونة (فلفل أحمر حار)', 0.2]] },
  'cumin & paprika': { lines: [['كمون مطحون', 0.5], ['بابريكا', 0.8]] },
  'chili flakes & basil': { lines: [['شطة مطحونة (فلفل أحمر حار)', 0.2], ['ريحان طازج', 2]] },
  'ginger, garam masala, turmeric, chili': {
    lines: [['زنجبيل طازج', 2], ['كمون مطحون', 0.4], ['كزبرة ناشفة مطحونة', 0.3], ['هيل مطحون', 0.1], ['قرفة مطحونة', 0.1], ['قرنفل مطحون', 0.05], ['كركم مطحون', 0.3], ['شطة مطحونة (فلفل أحمر حار)', 0.2]]
  },
  'fajita spices (cumin, smoked paprika, oregano)': { lines: [['كمون مطحون', 0.5], ['بابريكا', 1], ['أوريجانو مجفف', 0.3], ['بودرة ثوم', 0.3], ['ملح', 1]] },
  'paprika & cumin': { lines: [['بابريكا', 0.8], ['كمون مطحون', 0.5]] },
  'smoked paprika & cumin': { lines: [['بابريكا', 0.8], ['كمون مطحون', 0.5]] },
  'paprika, cumin, salt': { lines: [['بابريكا', 0.8], ['كمون مطحون', 0.5], ['ملح', 1]] },
  'paprika & garlic powder': { lines: [['بابريكا', 0.8], ['بودرة ثوم', 0.5]] },
  'oregano & basil': { lines: [['أوريجانو مجفف', 0.3], ['ريحان مجفف', 0.3]] },
  'oregano': { lines: [['أوريجانو مجفف', 0.3]] },
  'spring onion': { lines: [['بصل أخضر', 6]] },
  'basil & oregano': { lines: [['ريحان مجفف', 0.3], ['أوريجانو مجفف', 0.3]] },
  'rosemary & thyme': { lines: [['روزماري مجفف', 0.3], ['زعتر مجفف', 0.3]] },
  'mixed spices': { lines: [['بهار حلو مطحون', 0.4], ['قرفة مطحونة', 0.2], ['فلفل أسود مطحون', 0.3], ['ملح', 1]] },
  'mixed spice & sumac': {
    lines: [['بهار حلو مطحون', 0.4], ['قرفة مطحونة', 0.2], ['فلفل أسود مطحون', 0.3], ['ملح', 1]],
    notCounted: [['سماق (نحو 0.5 غ للحصة) — لا يوجد له سجل في قاعدة USDA', 'sumac (about 0.5 g per serving) — no USDA record']]
  }
};

/** Water used for cooking is listed but has no calories (USDA "Water, tap" = 0). */
export const WATER_GROUPS = new Set(['stock/water', 'water/stock']);

const r1 = (g: number) => (g >= 10 ? Math.round(g) : Math.round(g * 10) / 10);

/** Converts the old seasoning groups of a recipe into exact ingredient lines for the whole recipe. */
export function seasoningsFromGroups(groups: [string, string, number][], servings: number): { seasonings: Ing[]; notCounted: [string, string][]; water: boolean; unknown: string[] } {
  const total = new Map<string, number>();
  const notCounted: [string, string][] = [];
  const unknown: string[] = [];
  let water = false;
  for (const [, en] of groups) {
    const g = GROUPS[en];
    if (!g) { unknown.push(en); continue; }
    if (WATER_GROUPS.has(en)) water = true;
    for (const [name, per] of g.lines) total.set(name, (total.get(name) ?? 0) + per * servings);
    for (const nc of g.notCounted ?? []) if (!notCounted.some((x) => x[1] === nc[1])) notCounted.push(nc);
  }
  return { seasonings: [...total].map(([name, g]) => [name, r1(g)] as Ing), notCounted, water, unknown };
}

const FRACTIONS: [number, string][] = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
/** Nearest kitchen fraction: 0.83 → "¾", 1.4 → "1 ⅓", 2.95 → "3". */
function frac(x: number): string {
  let whole = Math.floor(x);
  const rest = x - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(rest - f[0]) < Math.abs(rest - best[0])) best = f;
  if (best[0] === 1) { whole += 1; best = FRACTIONS[0]; }
  if (whole > 0) return best[1] ? `${whole} ${best[1]}` : String(whole);
  return best[1];
}

/**
 * Household measure for a weight, e.g. 4.5 g olive oil → "1 tsp", 15 g lemon juice → "1 tbsp", 12 g garlic → "4 cloves".
 * Returns '' when the item has no known measure (the gram weight is always shown anyway).
 */
export function householdMeasure(name: string, grams: number, lang: 'ar' | 'en'): string {
  const m = SEASONING_INFO[name];
  if (!m || grams <= 0) return '';
  if (m.piece) {
    const n = grams / m.piece[0];
    const f = frac(n) || '¼';
    return `${f} ${lang === 'ar' ? m.piece[1] : m.piece[2] + (n > 1.1 ? 's' : '')}`;
  }
  if (!m.tsp) return '';
  const tsp = grams / m.tsp;
  if (tsp < 0.1) return lang === 'ar' ? 'رشة' : 'a pinch';
  if (tsp >= 3 && Math.abs(tsp / 3 - Math.round(tsp / 3 * 4) / 4) < 0.1) {
    const f = frac(tsp / 3);
    return `${f} ${lang === 'ar' ? 'ملعقة كبيرة' : 'tbsp'}`;
  }
  const f = frac(tsp);
  if (!f) return lang === 'ar' ? 'رشة' : 'a pinch';
  return `${f} ${lang === 'ar' ? 'ملعقة صغيرة' : 'tsp'}`;
}
