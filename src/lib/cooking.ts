/**
 * Cooking Guide helpers: step timers, servings scaling and ingredient substitutions.
 * Pure functions — nothing here reads or writes the database. Nutrition is always recomputed by
 * computeLibraryRecipe from the substituted / scaled ingredient list (no stored numbers are edited).
 */
import type { LibraryRecipe } from './recipeLibraryData';
import { RECIPE_REF } from './recipeRefMap';

/* ------------------------------------------------------------------ timers */

export interface StepTimer { seconds: number; label: string }

const UNIT_EN: [RegExp, number][] = [[/^(h|hr|hrs|hour|hours)$/i, 3600], [/^(min|mins|minute|minutes)$/i, 60], [/^(s|sec|secs|second|seconds)$/i, 1]];
/**
 * Durations written in a step ("simmer 10 min", "5–6 min", "1 h", "30 s"). For a range the timer uses the shorter
 * time — check, and add more if needed. Storage times ("keeps 4 days") and anything over 12 h get no timer.
 */
export function stepTimers(textEn: string): StepTimer[] {
  const out: StepTimer[] = [];
  const re = /(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|h|minutes?|mins?|min|seconds?|secs?|s)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(textEn))) {
    const unit = UNIT_EN.find(([r]) => r.test(m![3]));
    if (!unit) continue;
    const before = textEn.slice(Math.max(0, m.index - 14), m.index).toLowerCase();
    if (/(keeps|up to|no more than|than|within)\s*$/.test(before)) continue;
    const seconds = Math.round(Number(m[1]) * unit[1]);
    if (seconds < 20 || seconds > 12 * 3600) continue;
    out.push({ seconds, label: m[0] });
  }
  return out;
}

/** "°C" temperatures mentioned in the steps (for the chips when a recipe has no explicit tempC). */
export function stepTemps(textEn: string): number[] {
  return [...textEn.matchAll(/(\d{2,3})\s*°\s*C/g)].map((x) => Number(x[1]));
}

export const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

/* ------------------------------------------------------------------ substitutions */

/**
 * Like-for-like alternatives: [alternative food name, weight factor, why AR, why EN]. Weights stay in the same state
 * (raw ↔ raw, dry ↔ dry). The factor keeps the dish equivalent (e.g. 1 egg 55 g ≈ 2 whites 66 g → ×1.2;
 * butter 81 % fat vs oil 100 % → ×1.2 for the same fat). Every alternative must resolve to a real food record
 * (the user's own or a USDA row) — tests/cooking-guide.test.ts checks this, nothing is estimated.
 */
export const SWAPS: Record<string, [string, number, string, string][]> = {
  'صدر دجاج': [['فخذ دجاج بدون جلد', 1, 'أكثر عصارة، دهون أعلى', 'juicier, more fat'], ['ديك رومي (توركي) مفروم', 1, 'للكفتة والصلصات', 'for mince dishes'], ['سمك بلطي/تلابيا', 1, 'قلّل وقت الطهي إلى النصف', 'halve the cooking time']],
  'فخذ دجاج بدون جلد': [['صدر دجاج', 1, 'أقل دهوناً — قلّل وقت الطهي دقيقتين', 'leaner — cook 2 min less']],
  'لحم بقري قليل الدهن 90/10': [['ديك رومي (توركي) مفروم', 1, 'أقل دهوناً', 'leaner']],
  'ديك رومي (توركي) مفروم': [['لحم بقري قليل الدهن 90/10', 1, 'نكهة أقوى', 'richer flavour']],
  'سمك بلطي/تلابيا': [['سمك قاروس (سي باس) نيء', 1, 'نفس الوقت', 'same timing'], ['سمك سلمون', 1, 'دهون أوميغا-3 أعلى', 'more omega-3 fat']],
  'أرز أبيض': [['أرز بسمتي نيء/جاف', 1, '', ''], ['برغل نيء/جاف', 1, 'ألياف أكثر', 'more fibre'], ['كينوا نيئة/جافة', 1, 'بروتين أعلى قليلاً', 'a little more protein']],
  'أرز بسمتي نيء/جاف': [['أرز أبيض', 1, '', ''], ['برغل نيء/جاف', 1, 'ألياف أكثر — 12 دقيقة طهي', 'more fibre — 12 min cooking'], ['كينوا نيئة/جافة', 1, '15 دقيقة طهي', '15 min cooking'], ['كسكس نيء/جاف', 1, 'يُنقع 5 دقائق بالمرق الساخن', 'soak 5 min in hot broth']],
  'معكرونة نيئة/جافة': [['معكرونة قمح كامل نيئة/جافة', 1, 'ألياف أكثر', 'more fibre']],
  'معكرونة قمح كامل نيئة/جافة': [['معكرونة نيئة/جافة', 1, '', '']],
  'بطاطس': [['بطاطا حلوة نيئة', 1, 'تحمر أسرع — راقبها', 'browns faster — watch it']],
  'بطاطا حلوة نيئة': [['بطاطس', 1, '', '']],
  'زيت زيتون': [['زيت أفوكادو', 1, 'يتحمل حرارة أعلى', 'higher smoke point'], ['زيت كانولا', 1, '', ''], ['زبدة', 1.2, 'نفس كمية الدهون تقريباً', 'about the same fat']],
  'زبدة': [['زيت زيتون', 0.8, 'نفس الدهون تقريباً', 'about the same fat']],
  'زبادي يوناني خالي الدسم': [['زبادي يوناني قليل الدسم', 1, 'أكثر كريمية', 'creamier'], ['زبادي عادي قليل الدسم', 1, 'أخف قواماً', 'thinner']],
  'زبادي يوناني قليل الدسم': [['زبادي يوناني خالي الدسم', 1, 'سعرات أقل', 'fewer kcal'], ['زبادي عادي قليل الدسم', 1, 'أخف قواماً', 'thinner']],
  'بيض كامل': [['بياض بيض', 1.2, 'بيضة ≈ بياضتان', '1 egg ≈ 2 whites']],
  'بياض بيض': [['بيض كامل', 0.83, 'بياضتان ≈ بيضة', '2 whites ≈ 1 egg']],
  'جبن موزاريلا قليلة الدسم': [['جبن شيدر كامل الدسم', 1, 'نكهة أقوى ودهون أعلى', 'stronger, more fat']],
  'جبن شيدر كامل الدسم': [['جبن موزاريلا قليلة الدسم', 1, 'أخف', 'lighter']],
  'جبن كريمي قليل الدسم': [['زبادي يوناني قليل الدسم', 1, 'أضفه بعيداً عن النار', 'stir in off the heat']],
  'مايونيز لايت': [['زبادي يوناني خالي الدسم', 1, 'سعرات أقل بكثير', 'far fewer kcal']],
  'عصير ليمون': [['عصير ليم (لايم)', 1, '', '']],
  'عصير ليم (لايم)': [['عصير ليمون', 1, '', '']],
  'بقدونس طازج': [['كزبرة خضراء طازجة', 1, '', ''], ['شبت طازج', 1, 'للسمك', 'for fish']],
  'كزبرة خضراء طازجة': [['بقدونس طازج', 1, '', '']],
  'توست بر (خبز أسمر)': [['خبز عربي أسمر', 1, '', ''], ['تورتيلا قمح', 1, '', '']],
  'خبز عربي أسمر': [['توست بر (خبز أسمر)', 1, '', ''], ['تورتيلا قمح', 1, '', '']],
  'تورتيلا قمح': [['خبز عربي أسمر', 1, '', '']],
  'بروكلي': [['قرنبيط', 1, '', '']],
  'قرنبيط': [['بروكلي', 1, '', '']],
  'كوسا': [['باذنجان', 1, '', '']],
  'بازلاء مجمدة': [['خضار مشكلة بالذرة (مجمدة)', 1, '', '']],
  'طماطم مهروسة معلبة': [['طماطم', 1.2, 'طماطم طازجة مبشورة — اطهها 5 دقائق أطول', 'grated fresh — simmer 5 min longer']],
  'مرق دجاج قليل الصوديوم': [],
  'حليب قليل الدسم': []
};

/** Alternatives for one ingredient that can actually be computed (own food or a USDA reference). */
export function swapsFor(name: string, hasOwnFood: (n: string) => boolean = () => false) {
  return (SWAPS[name] ?? []).filter(([alt]) => hasOwnFood(alt) || !!RECIPE_REF[alt]);
}

/** Choices made in the recipe view: ingredient index → alternative name. */
export type SwapChoice = Record<number, string>;

const r1 = (g: number) => (g >= 20 ? Math.round(g) : Math.round(g * 10) / 10);

/**
 * A variant of a library recipe: chosen substitutions applied (weight × factor) and every amount scaled to
 * `servings`. Index numbering covers ingredients first, then seasonings. Nutrition per serving stays the same when
 * only the servings change; it is recomputed from the new foods when something is substituted.
 */
export function variantOf(lib: LibraryRecipe, swaps: SwapChoice = {}, servings = lib.servings): LibraryRecipe {
  const k = servings / lib.servings;
  const nIng = lib.ingredients.length;
  const swapped = (i: number, [name, grams, nAr, nEn]: [string, number, string?, string?]): [string, number, string?, string?] => {
    const alt = swaps[i];
    const f = alt ? SWAPS[name]?.find((s) => s[0] === alt)?.[1] ?? 1 : 1;
    return [alt ?? name, r1(grams * f * k), alt ? undefined : nAr, alt ? undefined : nEn];
  };
  const marinade = lib.marinade?.map((n) => {
    const i = [...lib.ingredients, ...(lib.seasonings ?? [])].findIndex((x) => x[0] === n);
    return i >= 0 && swaps[i] ? swaps[i] : n;
  });
  return {
    ...lib,
    servings,
    ingredients: lib.ingredients.map((x, i) => swapped(i, x)),
    seasonings: (lib.seasonings ?? []).map((x, i) => swapped(nIng + i, x)),
    ...(marinade ? { marinade } : {}),
    ...(lib.waterMl ? { waterMl: Math.round(lib.waterMl * k) } : {})
  };
}

/** Stable id for a saved variant (so "save to my recipes" of the same variant is not duplicated). */
export function variantId(lib: LibraryRecipe, swaps: SwapChoice): string {
  const keys = Object.keys(swaps).map(Number).sort((a, b) => a - b);
  return keys.length ? `${lib.id}~${keys.map((k) => `${k}=${swaps[k]}`).join('|')}` : lib.id;
}
