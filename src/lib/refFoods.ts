/**
 * Shared reference food database (USDA FoodData Central, public domain), served as a static file with the app
 * (public/fooddb/usda.json, built by scripts/build-food-db.mjs) and cached offline by the service worker.
 * Reference foods are read-only. When a user logs one, it is copied ONCE into their own food list
 * (source "usda", with the FDC ID as sourceRef) so diary snapshots, recipes, sync and reports work unchanged.
 */
import { db } from './db';
import { expandQuery, NameIndex, stem } from './foodSearch';
import { normalizeText } from './normalize';
import { createFood } from './repo';
import type { Food, FoodState, Macros } from './types';

/** [id, name, categoryIndex, kcal, protein, carbs, fat, fiber, sugar, satFat, sodiumMg, portions, energyFlag] */
export type RefRow = [string, string, number, number, number, number, number, number | null, number | null, number | null, number | null, [string, number][], number];
export interface RefMeta {
  format: string; version: number; builtAt: string; basis: string; categories: string[];
  sources: { id: string; name: string; release: string; url: string; license: string }[];
  stats: Record<string, number>;
}
export interface RefDb { meta: RefMeta; rows: RefRow[] }

let data: RefDb | null = null;
let index: NameIndex | null = null;
let loading: Promise<RefDb> | null = null;

export function setRefData(d: RefDb) {
  data = d;
  byId = null;
  index = new NameIndex(d.rows.map((r) => r[1]));
}

/** Loads the reference database once (from the service-worker cache when offline). Fails softly. */
export function loadRefFoods(): Promise<RefDb> {
  if (data) return Promise.resolve(data);
  if (!loading) {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    loading = fetch(base + 'fooddb/usda.json')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() as Promise<RefDb>; })
      .then((d) => { if (d?.meta?.format !== 'mego-fooddb') throw new Error('bad food database'); setRefData(d); return d; })
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
}
export const refLoaded = () => !!data;

let byId: Map<string, RefRow> | null = null;
/** One reference food by its id (e.g. "S171077"); undefined until the database is loaded or if unknown. */
export function refById(id: string): RefFood | undefined {
  if (!data) return undefined;
  if (!byId) byId = new Map(data.rows.map((r) => [r[0], r]));
  const r = byId.get(id);
  return r ? toRefFood(r) : undefined;
}

export interface RefFood {
  id: string; name: string; category: string; per100: Macros; portions: { label: string; grams: number }[];
  state: FoodState; source: string; energyFlag: boolean;
}

const COOKED = /\b(cooked|roasted|boiled|grilled|broiled|fried|baked|braised|stewed|steamed|poached|microwaved|scrambled|toasted|sauteed|simmered|pan-browned|pan-fried|smoked|canned)\b/i;
export function inferState(name: string): FoodState {
  if (/\braw\b|\bdry\b|\bunprepared\b|\buncooked\b/i.test(name)) return 'raw';
  if (COOKED.test(name)) return 'cooked';
  return 'other';
}

export function toRefFood(r: RefRow, meta: RefMeta = data!.meta): RefFood {
  const per100: Macros = { kcal: r[3], protein: r[4], carbs: r[5], fat: r[6] };
  if (r[7] !== null) per100.fiber = r[7];
  if (r[8] !== null) per100.sugar = r[8];
  if (r[9] !== null) per100.satFat = r[9];
  if (r[10] !== null) per100.sodium = r[10];
  const src = meta.sources.find((s) => s.id === r[0][0]);
  return {
    id: r[0], name: r[1], category: meta.categories[r[2]] ?? '', per100, portions: r[11].map(([label, grams]) => ({ label, grams })),
    state: inferState(r[1]), source: `USDA FDC ${r[0].slice(1)} (${src?.name.split('— ')[1] ?? 'USDA'})`, energyFlag: r[12] === 1
  };
}

export interface RefFilter { minProtein?: number; maxKcal?: number; maxCarbs?: number; maxFat?: number; category?: string; state?: FoodState | '' }

/** Searches the reference database (Arabic or English query). Returns [] until loaded. */
export function searchRefFoods(q: string, f: RefFilter = {}, limit = 40): RefFood[] {
  if (!data || !index || !q.trim()) return [];
  const groups = expandQuery(q);
  // Rank: match quality first, then generic foods before brands/restaurants (unless the query names one),
  // then simpler (shorter) names — "Chicken breast, roasted" before "KFC, Fried Chicken, EXTRA CRISPY, Breast…".
  const wantsBrand = /[A-Z]{3,}|mcdonald|kfc|burger king|domino|pizza hut|subway|wendy|taco bell|restaurant|fast food|ماكدونالد|كنتاكي|مطعم|دومينوز/i.test(q);
  const alts = groups.flatMap((g) => g.alts).filter((a) => !/[\u0600-\u06FF]/.test(a)).flatMap((a) => a.split(' ')).map(stem);
  const GENERIC = new Set(['fish', 'nuts', 'seeds', 'beverages', 'cereals', 'cereals ready to eat', 'oil', 'spices', 'crustaceans', 'mollusks', 'game meat', 'snacks', 'candies', 'cookies', 'soup', 'sauce', 'cheese', 'yogurt', 'milk', 'beef', 'pork', 'lamb']);
  const PROCESSED = ['dried', 'dehydrated', 'powder', 'dry mix', 'mix', 'salad', 'nugget', 'stuffed', 'sandwich', 'custard', 'pudding', 'split', 'cake', 'pie', 'casserole', 'soup', 'baby'];
  const BASIC = /^(Poultry|Beef|Pork|Lamb|Finfish|Dairy and Egg|Fruits|Vegetables|Cereal Grains|Legume|Nut and Seed|Fats and Oils|Breakfast Cereals|Spices|Beverages|Sweets|Baked Products|Snacks)/;
  const ranked = index.search(groups, 800).map(({ i, score }) => {
    const r = data!.rows[i];
    const cat = data!.meta.categories[r[2]] ?? '';
    const branded = /\b[A-Z][A-Z'&]{2,}\b/.test(r[1]) || /Fast Foods|Restaurant Foods|Branded/.test(cat) || /\((McDonalds|Burger King|KFC|Wendy|Taco Bell|Subway)/i.test(r[1]);
    // the main food is the first comma-separated part of a USDA name ("Egg, whole, raw" → "egg")
    const segs = r[1].split(',');
    const first = normalizeText(segs[0]);
    // USDA files many foods under a class word first: "Fish, tuna, …", "Nuts, almonds", "Beverages, coffee…"
    const head = (GENERIC.has(first) && segs[1] ? `${first} ${normalizeText(segs[1])}` : first).split(' ').map(stem);
    const headHit = head.some((h) => alts.some((a) => h === a || (a.length >= 3 && h.startsWith(a))));
    const bonus = (headHit ? 3 : 0) + (headHit && head.length <= 2 ? 1 : 0) + (BASIC.test(cat) ? 1.5 : 0);
    const lower = r[1].toLowerCase();
    const processed = PROCESSED.filter((w) => lower.includes(w) && !alts.some((a) => w.startsWith(a))).length;
    const plain = /\b(whole|plain|fresh|raw|cooked|boiled|roasted|grilled|baked|light|white)\b/.test(lower) ? 0.6 : 0;
    const penalty = (branded && !wantsBrand ? 4 : 0) + r[1].length / 80 + processed * 1.2 - plain;
    return { i, rank: score + bonus - penalty };
  }).sort((a, b) => b.rank - a.rank);
  const out: RefFood[] = [];
  for (const { i } of ranked) {
    const rf = toRefFood(data.rows[i]);
    if (f.state && rf.state !== f.state) continue;
    if (f.category && rf.category !== f.category) continue;
    if (f.minProtein !== undefined && rf.per100.protein < f.minProtein) continue;
    if (f.maxKcal !== undefined && rf.per100.kcal > f.maxKcal) continue;
    if (f.maxCarbs !== undefined && rf.per100.carbs > f.maxCarbs) continue;
    if (f.maxFat !== undefined && rf.per100.fat > f.maxFat) continue;
    out.push(rf);
    if (out.length >= limit) break;
  }
  return out;
}

/** Copies a reference food into the user's own food list once (reused on later picks). Values are not changed. */
export async function materializeRefFood(rf: RefFood): Promise<Food> {
  const existing = (await db.foods.toArray()).find((f) => f.source === 'usda' && f.sourceRef === rf.source && !f.archived);
  if (existing) return existing;
  return createFood({
    nameAr: '', nameEn: rf.name, category: rf.category, per100: { ...rf.per100 }, state: rf.state, stateLabel: rf.state === 'raw' ? 'نيء' : rf.state === 'cooked' ? 'مطبوخ' : 'محضّر',
    prep: '', notes: `${rf.source}${rf.energyFlag ? ' · ⚠ calories vs macros differ in the source data' : ''}`, source: 'usda', sourceRef: rf.source,
    servings: rf.portions.map((p, k) => ({ id: 'p' + k, name: p.label, grams: p.grams }))
  }, { allowDuplicate: true });
}
