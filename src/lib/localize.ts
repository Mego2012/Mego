/**
 * Display-time localization of NAMES that are stored as data (food, recipe, exercise, habit, plan item names).
 * Records are never rewritten: a stored name is translated only when it is shown, from dictionaries —
 * the hand-translated food-name list, the recipe library (nameAr/nameEn), the exercise library, the user's own
 * foods (when they have both names), default habits/reminders and, for USDA reference descriptions that exist
 * only in English, a reviewed glossary of food terms (usdaGlossary.ts). Text that is not in any dictionary — a
 * name the user typed — is shown exactly as the user wrote it.
 */
import foodNames from '../../public/fooddb/food-names.json';
import { SEASONING_INFO } from './seasonings';

export type Lang = 'ar' | 'en';
const AR = /[؀-ۿ]/;
const ar2en = new Map<string, string>();
const en2ar = new Map<string, string>();
const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Adds known Arabic ↔ English name pairs (later pairs do not overwrite earlier, more specific ones). */
export function registerNames(pairs: Iterable<[ar: string | undefined, en: string | undefined]>) {
  for (const [a, e] of pairs) {
    if (!a || !e || !a.trim() || !e.trim()) continue;
    if (!ar2en.has(key(a))) ar2en.set(key(a), e.trim());
    if (!en2ar.has(key(e))) en2ar.set(key(e), a.trim());
  }
  version++;
}
let version = 0;
export const namesVersion = () => version;

registerNames(Object.entries((foodNames as { names: Record<string, string> }).names));
registerNames(Object.entries(SEASONING_INFO).map(([a, m]) => [a, m.en] as [string, string]));
registerNames([
  // default habits and reminders (src/lib/defaults.ts) and default names created by the app
  ['اشرب ماء', 'Drink water'], ['بروتين في كل وجبة', 'Protein at every meal'], ['خضار مرتين يومياً', 'Vegetables twice a day'],
  ['سجّل العشاء', 'Log dinner'], ['سجّل الغداء', 'Log lunch'], ['سجّل الفطور', 'Log breakfast'], ['سجّل وزنك', 'Log your weight'],
  ['وزن الصباح', 'Morning weigh-in'], ['برنامجي', 'My split'], ['منتجات', 'Products'], ['وجبات (مكتبة الوصفات)', 'Meals (recipe library)']
]);

// suffixes the app itself adds to names
const SUFFIXES: [string, string][] = [[' (معدّلة)', ' (modified)'], [' (نسخة)', ' (copy)']];

let usdaAr: ((en: string) => string | null) | null = null;
/** Installs the USDA glossary translator (loaded lazily with the reference database). */
export function setUsdaTranslator(fn: (en: string) => string | null) { usdaAr = fn; version++; }

/** A stored name in the display language (unchanged when it is already in that language or unknown). */
export function localName(text: string | undefined | null, lang: Lang): string {
  if (!text) return text ?? '';
  const isAr = AR.test(text);
  if (lang === 'en' ? !isAr : isAr) return text;
  for (const [sa, se] of SUFFIXES) {
    const [from, to] = lang === 'en' ? [sa, se] : [se, sa];
    if (text.endsWith(from)) return localName(text.slice(0, -from.length), lang) + to;
  }
  const hit = (lang === 'en' ? ar2en : en2ar).get(key(text));
  if (hit) return hit;
  if (lang === 'ar' && usdaAr) return usdaAr(text) ?? text;
  return text;
}

/** List separator for the language (Arabic comma vs. comma). */
export const listSep = (lang: Lang) => (lang === 'ar' ? '، ' : ', ');
export const joinList = (items: string[], lang: Lang) => items.join(listSep(lang));

/** USDA FoodData Central categories and the app's own Arabic categories. */
const CATEGORIES: [string, string][] = [
  ['منتجات المخابز', 'Baked Products'], ['وجبات خفيفة', 'Snacks'], ['حلويات', 'Sweets'], ['الخضروات ومنتجاتها', 'Vegetables and Vegetable Products'],
  ['أطعمة السكان الأصليين (أمريكا/ألاسكا)', 'American Indian/Alaska Native Foods'], ['أطعمة المطاعم', 'Restaurant Foods'], ['المشروبات', 'Beverages'],
  ['الدهون والزيوت', 'Fats and Oils'], ['النقانق واللحوم المصنعة', 'Sausages and Luncheon Meats'], ['الألبان والبيض', 'Dairy and Egg Products'],
  ['منتجات الدواجن', 'Poultry Products'], ['منتجات لحم الخنزير', 'Pork Products'], ['حبوب الإفطار', 'Breakfast Cereals'],
  ['البقوليات ومنتجاتها', 'Legumes and Legume Products'], ['الأسماك والمأكولات البحرية', 'Finfish and Shellfish Products'],
  ['الفواكه والعصائر', 'Fruits and Fruit Juices'], ['الحبوب والمعكرونة', 'Cereal Grains and Pasta'], ['المكسرات والبذور', 'Nut and Seed Products'],
  ['منتجات اللحم البقري', 'Beef Products'], ['وجبات وأطباق رئيسية وجانبية', 'Meals, Entrees, and Side Dishes'], ['الوجبات السريعة', 'Fast Foods'],
  ['البهارات والأعشاب', 'Spices and Herbs'], ['الشوربات والصلصات والمرق', 'Soups, Sauces, and Gravies'], ['لحم الضأن والعجل والصيد', 'Lamb, Veal, and Game Products'],
  ['بروتين', 'Protein'], ['كارب', 'Carbs'], ['فاكهة', 'Fruit'], ['بروتينات', 'Proteins'], ['نشويات', 'Carbohydrates'], ['دهون', 'Fats'], ['فواكه', 'Fruits'], ['خضروات', 'Vegetables'], ['خضار', 'Vegetables'],
  ['ألبان', 'Dairy'], ['مشروبات', 'Drinks'], ['مكملات', 'Supplements'], ['بقوليات', 'Legumes'], ['مكسرات وبذور', 'Nuts and seeds'], ['وجبات', 'Meals'],
  ['صلصات', 'Sauces'], ['أخرى', 'Other'], ['منتجات', 'Products'], ['وجبات (مكتبة الوصفات)', 'Meals (recipe library)'], ['وجبات جاهزة', 'Ready meals']
];
const cat2en = new Map(CATEGORIES.map(([a, e]) => [a, e]));
const cat2ar = new Map(CATEGORIES.map(([a, e]) => [key(e), a]));
export function localCategory(cat: string | undefined, lang: Lang): string {
  if (!cat) return '';
  if (lang === 'en') return AR.test(cat) ? cat2en.get(cat.trim()) ?? localName(cat, 'en') : cat;
  return AR.test(cat) ? cat : cat2ar.get(key(cat)) ?? localName(cat, 'ar');
}
