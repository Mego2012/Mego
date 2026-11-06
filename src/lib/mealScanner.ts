/**
 * AI Meal Scanner — photo → identified foods → YOUR database values → reviewed → logged.
 *
 * Responsibilities are split on purpose:
 *  - The AI (Google Gemini API FREE tier, called by your private Apps Script backend — the key never reaches the phone) only
 *    identifies foods, estimates grams/state/method and picks the matching row of YOUR food database.
 *  - All nutrition numbers are computed here with the same engine as manual logging (macrosFor + the food's
 *    per-100 g basis). Values for foods that are not in the database are clearly marked as AI estimates and can
 *    only be logged after you explicitly approve adding them as a new (unverified) food.
 *  - Nothing is saved until you press confirm.
 */
import { db } from './db';
import { basisFromFood, macrosFor, preciseMacros, roundMacros, scaleMacros, sumMacros, validateMacros } from './nutrition';
import { addFoodEntry, compressImage, createFood, deleteEntries, displayName, getSettings, uid } from './repo';
import { normalizeText } from './search';
import { callScript } from './sync';
import type { DiaryEntry, Food, FoodState, Macros, MealType } from './types';

export type CookingMethod =
  | 'none' | 'grilled' | 'fried' | 'deep_fried' | 'air_fried' | 'boiled' | 'steamed' | 'baked' | 'roasted' | 'sauteed' | 'stewed' | 'unknown';
export const COOKING_METHODS: CookingMethod[] = ['none', 'grilled', 'fried', 'deep_fried', 'air_fried', 'boiled', 'steamed', 'baked', 'roasted', 'sauteed', 'stewed', 'unknown'];
export type ItemKind = 'food' | 'oil_or_fat' | 'sauce_or_dressing' | 'drink';

/** Shape returned by the backend (validated by a JSON schema on the API side, re-validated here). */
export interface AiItem {
  name_ar: string;
  name_en: string;
  food_key: string;
  grams: number;
  grams_low: number;
  grams_high: number;
  state: FoodState;
  cooking_method: CookingMethod;
  kind: ItemKind;
  confidence: number;
  reason: string;
  est_per100: { kcal: number; protein: number; carbs: number; fat: number };
}
export interface AiResult {
  is_food: boolean;
  meal_name_ar: string;
  meal_name_en: string;
  notes: string;
  items: AiItem[];
}

export type ItemFlag = 'lowConfidence' | 'notInDb' | 'stateMismatch' | 'hiddenFat' | 'badKey';

/** One editable line in the review sheet. */
export interface ScanItem {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Matched database food (undefined → not in the database). */
  foodId?: string;
  grams: number;
  gramsLow: number;
  gramsHigh: number;
  state: FoodState;
  method: CookingMethod;
  kind: ItemKind;
  /** 0..1 */
  confidence: number;
  reason: string;
  /** AI per-100 g estimate — used ONLY for items not in the database, always labelled as an estimate. */
  estPer100?: Macros;
  flags: ItemFlag[];
  /** User ticked "I checked this item" (required for uncertain items). */
  confirmed: boolean;
  /** User approved adding this unmatched item to the database as a new, unverified food. */
  addAsNew: boolean;
  origin: 'ai' | 'user';
}

export const LOW_CONFIDENCE = 0.6;
export const MAX_GRAMS = 3000;

/* ------------------------------------------------------------------ catalog sent to the AI */

export interface CatalogLine { k: string; ar: string; en: string; s: FoodState; c: string }
export interface Catalog { lines: CatalogLine[]; keyToId: Map<string, string> }

/** Short keys (f1, f2…) keep the request small; only names/state/category are sent — no personal data. */
export function buildCatalog(foods: Food[]): Catalog {
  const keyToId = new Map<string, string>();
  const lines: CatalogLine[] = [];
  foods
    .filter((f) => !f.archived && !f.incomplete)
    .forEach((f, i) => {
      const k = 'f' + (i + 1);
      keyToId.set(k, f.id);
      lines.push({ k, ar: f.nameAr, en: f.nameEn, s: f.state, c: f.category });
    });
  return { lines, keyToId };
}

/* ------------------------------------------------------------------ image */

/**
 * Downscales and re-encodes the photo as JPEG on the phone. Re-encoding through a canvas drops ALL metadata
 * (EXIF: GPS location, device, time), so only pixels are sent.
 */
export async function prepareImage(file: Blob, max = 1024): Promise<{ base64: string; bytes: number; blob: Blob }> {
  if (!file.type.startsWith('image/')) throw new Error('AI_BAD_IMAGE');
  let blob = await compressImage(file, max);
  if (blob === file) throw new Error('AI_BAD_IMAGE'); // could not decode/re-encode → never send the original file
  if (blob.size > 1_500_000) blob = await compressImage(file, 768);
  const base64 = await blobToBase64(blob);
  return { base64, bytes: blob.size, blob };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('AI_BAD_IMAGE'));
    r.readAsDataURL(blob);
  });
}

/* ------------------------------------------------------------------ request */

export class ScanError extends Error {
  constructor(public code: string, public params: Record<string, string | number> = {}) { super(code); }
}

/** Next reset of Google's free daily quota: midnight in America/Los_Angeles, as a Date. */
export function nextQuotaReset(now = new Date()): Date {
  const parts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map((p) => [p.type, p.value]));
  const offsetMin = (d: Date) => { const p = parts(d); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000; };
  const p = parts(now);
  const guess = Date.UTC(+p.year, +p.month - 1, +p.day + 1, 0, 0, 0);
  let t = guess - offsetMin(new Date(guess)) * 60000;
  t = guess - offsetMin(new Date(t)) * 60000; // re-evaluate offset at the target (DST changes)
  return new Date(t);
}

export async function requestAnalysis(base64: string, catalog: Catalog, opts: { lang: 'ar' | 'en'; note?: string; timeoutMs?: number }): Promise<AiResult> {
  const s = await getSettings();
  // Signed-in public accounts use their own sign-in token with the public AI backend; owner/guest devices use the private backend.
  const { accountState } = await import('./account');
  const acc = accountState();
  let call: () => Promise<{ result: unknown }>;
  const body = { image: base64, mediaType: 'image/jpeg', foods: catalog.lines, lang: opts.lang, note: (opts.note ?? '').slice(0, 300) };
  if (acc.mode === 'account') {
    const { cloudConfig, currentUser } = await import('./firebase');
    const url = cloudConfig()?.aiBackendUrl;
    const user = currentUser();
    if (!url || !user) throw new ScanError('AI_NO_BACKEND');
    const idToken = await user.getIdToken();
    call = async () => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, action: 'analyzeMeal', idToken }), redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.ok) throw Object.assign(new Error(json.error || 'Script error'), { data: json });
      return json;
    };
  } else {
    if (!s.sync.url || !s.sync.token) throw new ScanError('AI_NO_BACKEND');
    call = () => callScript<{ result: unknown }>(s.sync, 'analyzeMeal', body);
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ScanError('AI_OFFLINE');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new ScanError('AI_TIMEOUT')), opts.timeoutMs ?? 120_000); });
  try {
    const res = await Promise.race([
      call(),
      timeout
    ]);
    return validateAiResult(res.result);
  } catch (e) {
    if (e instanceof ScanError) throw e;
    const msg = (e as Error).message || '';
    const data = (e as { data?: { retryAfter?: number } }).data;
    if (msg === 'AI_QUOTA_DAY') throw new ScanError(msg, { time: nextQuotaReset().toLocaleTimeString(opts.lang === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' }) });
    if (msg === 'AI_QUOTA_MINUTE') throw new ScanError(msg, { s: Math.max(1, Math.round(data?.retryAfter ?? 60)) });
    if (msg === 'AI_USER_LIMIT') throw new ScanError(msg, { n: (data as { limit?: number } | undefined)?.limit ?? 10 });
    if (/^AI_/.test(msg)) throw new ScanError(msg.split(':')[0]);
    if (msg === 'unauthorized') throw new ScanError('AI_UNAUTHORIZED');
    if (msg === 'unknown action') throw new ScanError('AI_OLD_BACKEND');
    throw new ScanError('AI_NETWORK');
  } finally {
    clearTimeout(timer);
  }
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '');

/** Defensive validation: anything malformed is dropped or clamped, never trusted blindly. */
export function validateAiResult(raw: unknown): AiResult {
  if (!raw || typeof raw !== 'object') throw new ScanError('AI_BAD_OUTPUT');
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    is_food: r.is_food !== false,
    meal_name_ar: str(r.meal_name_ar),
    meal_name_en: str(r.meal_name_en),
    notes: str(r.notes),
    items: items.slice(0, 30).filter((x) => x && typeof x === 'object').map((x) => {
      const i = x as Record<string, unknown>;
      const est = (i.est_per100 ?? {}) as Record<string, unknown>;
      const state = (['raw', 'cooked', 'other'] as const).includes(i.state as FoodState) ? (i.state as FoodState) : 'other';
      const method = COOKING_METHODS.includes(i.cooking_method as CookingMethod) ? (i.cooking_method as CookingMethod) : 'unknown';
      const kind = (['food', 'oil_or_fat', 'sauce_or_dressing', 'drink'] as const).includes(i.kind as ItemKind) ? (i.kind as ItemKind) : 'food';
      const grams = clampGrams(num(i.grams));
      return {
        name_ar: str(i.name_ar), name_en: str(i.name_en), food_key: str(i.food_key),
        grams, grams_low: clampGrams(num(i.grams_low, grams)), grams_high: clampGrams(num(i.grams_high, grams)),
        state, cooking_method: method, kind, confidence: Math.max(0, Math.min(1, num(i.confidence))), reason: str(i.reason),
        est_per100: { kcal: num(est.kcal), protein: num(est.protein), carbs: num(est.carbs), fat: num(est.fat) }
      };
    }).filter((i) => (i.name_ar || i.name_en) && i.grams > 0)
  };
}

function clampGrams(g: number) {
  return Math.max(0, Math.min(MAX_GRAMS, Math.round(g)));
}

/* ------------------------------------------------------------------ AI result → editable items */

export function toScanItems(result: AiResult, catalog: Catalog, foods: Food[]): ScanItem[] {
  const byId = new Map(foods.map((f) => [f.id, f]));
  return result.items.map((a) => {
    const flags: ItemFlag[] = [];
    let foodId = a.food_key ? catalog.keyToId.get(a.food_key) : undefined;
    if (a.food_key && !foodId) flags.push('badKey');
    const f = foodId ? byId.get(foodId) : undefined;
    // Never accept a raw ↔ cooked match: weights differ, the app never converts automatically.
    if (f && f.state !== 'other' && a.state !== 'other' && f.state !== a.state) {
      flags.push('stateMismatch');
      foodId = undefined;
    }
    const est = { kcal: a.est_per100.kcal, protein: a.est_per100.protein, carbs: a.est_per100.carbs, fat: a.est_per100.fat };
    const estOk = !foodId && validateMacros(est).length === 0 && est.kcal > 0;
    if (!foodId) flags.push('notInDb');
    if (a.confidence < LOW_CONFIDENCE) flags.push('lowConfidence');
    if (a.kind === 'oil_or_fat' || a.kind === 'sauce_or_dressing') flags.push('hiddenFat');
    return {
      id: uid(), nameAr: a.name_ar || a.name_en, nameEn: a.name_en || a.name_ar, foodId,
      grams: a.grams, gramsLow: Math.min(a.grams_low, a.grams), gramsHigh: Math.max(a.grams_high, a.grams),
      state: a.state, method: a.cooking_method, kind: a.kind, confidence: a.confidence, reason: a.reason,
      estPer100: estOk ? est : undefined, flags, confirmed: false, addAsNew: false, origin: 'ai'
    };
  });
}

/** An item must be explicitly checked by the user when the AI was unsure or it is not a database food. */
export function needsConfirmation(i: ScanItem): boolean {
  return i.origin === 'ai' && (i.confidence < LOW_CONFIDENCE || !i.foodId || i.flags.includes('hiddenFat'));
}

/** Suggests database foods with the same name for an unmatched item (shown as a choice, never auto-applied). */
export function suggestFoods(i: ScanItem, foods: Food[], limit = 3): Food[] {
  const q = normalizeText(`${i.nameAr} ${i.nameEn}`).split(' ').filter((t) => t.length > 2);
  if (!q.length) return [];
  return foods
    .filter((f) => !f.archived && !f.incomplete)
    .map((f) => {
      const hay = normalizeText(`${f.nameAr} ${f.nameEn}`);
      const hits = q.filter((t) => hay.includes(t)).length;
      return { f, score: hits + (f.state === i.state ? 0.5 : 0) };
    })
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}

/* ------------------------------------------------------------------ nutrition (same engine as manual logging) */

export interface ItemNutrition { macros: Macros; estimated: boolean; available: boolean }

export function itemNutrition(i: ScanItem, foodsById: Map<string, Food>): ItemNutrition {
  if (i.grams <= 0) return { macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, estimated: false, available: false };
  const f = i.foodId ? foodsById.get(i.foodId) : undefined;
  if (f) return { macros: macrosFor(basisFromFood(f), i.grams, 'g').macros, estimated: false, available: true };
  if (i.estPer100) return { macros: preciseMacros(scaleMacros(i.estPer100, i.grams / 100)), estimated: true, available: true };
  return { macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, estimated: true, available: false };
}

export function mealTotals(items: ScanItem[], foodsById: Map<string, Food>) {
  const n = items.map((i) => itemNutrition(i, foodsById));
  return {
    total: roundMacros(sumMacros(n.map((x) => x.macros))),
    hasEstimates: n.some((x) => x.estimated && x.available),
    missing: n.filter((x) => !x.available).length
  };
}

/* ------------------------------------------------------------------ readiness + logging */

export type BlockReason = 'empty' | 'unconfirmed' | 'unmatched' | 'grams';

/** Why the meal cannot be saved yet (empty list = ready). */
export function blockers(items: ScanItem[]): { reason: BlockReason; itemId?: string }[] {
  const out: { reason: BlockReason; itemId?: string }[] = [];
  if (!items.length) out.push({ reason: 'empty' });
  for (const i of items) {
    if (!(i.grams > 0) || i.grams > MAX_GRAMS) out.push({ reason: 'grams', itemId: i.id });
    if (!i.foodId && !(i.addAsNew && i.estPer100)) out.push({ reason: 'unmatched', itemId: i.id });
    if (needsConfirmation(i) && !i.confirmed) out.push({ reason: 'unconfirmed', itemId: i.id });
  }
  return out;
}

const METHOD_AR: Record<CookingMethod, string> = {
  none: '—', grilled: 'مشوي', fried: 'مقلي', deep_fried: 'مقلي غمر', air_fried: 'قلاية هوائية', boiled: 'مسلوق', steamed: 'مطهو بالبخار',
  baked: 'مخبوز', roasted: 'محمّص', sauteed: 'مقلّب/سوتيه', stewed: 'مطهو/يخنة', unknown: 'غير معروف'
};
const STATE_LABEL: Record<FoodState, string> = { raw: 'نيء', cooked: 'مطبوخ', other: 'محضّر' };

/**
 * Saves the reviewed meal into the diary. Only runs after the user's confirmation (the UI calls it from the
 * confirm button). Same food logged twice is merged into one entry. Unmatched items are only added as new
 * foods when the user ticked "add as new food"; those foods are marked as unverified AI estimates.
 */
export async function logScannedMeal(date: string, meal: MealType, items: ScanItem[]): Promise<{ entries: DiaryEntry[]; createdFoods: Food[] }> {
  const b = blockers(items);
  if (b.length) throw new ScanError('AI_NOT_READY:' + b[0].reason);
  const createdFoods: Food[] = [];
  const grouped = new Map<string, number>();
  const order: string[] = [];
  for (const i of items) {
    let foodId = i.foodId;
    if (!foodId) {
      const f = await createFood({
        nameAr: i.nameAr, nameEn: i.nameEn, category: 'تقدير من صورة', per100: { ...i.estPer100! }, state: i.state,
        stateLabel: STATE_LABEL[i.state], prep: METHOD_AR[i.method],
        notes: '⚠ تقدير ذكاء اصطناعي من صورة — غير محقق، يُرجى المراجعة / AI photo estimate — unverified, please review'
      }, { allowDuplicate: true });
      createdFoods.push(f);
      foodId = f.id;
    }
    if (!grouped.has(foodId)) order.push(foodId);
    grouped.set(foodId, (grouped.get(foodId) ?? 0) + i.grams);
  }
  const entries: DiaryEntry[] = [];
  try {
    for (const id of order) {
      const f = await db.foods.get(id);
      if (!f) throw new Error('missing food');
      entries.push(await addFoodEntry(date, meal, f, grouped.get(id)!, 'g'));
    }
  } catch (e) {
    // all-or-nothing: remove what was added in this save
    await deleteEntries(entries.map((x) => x.id));
    throw e;
  }
  return { entries, createdFoods };
}

export function itemLabel(i: ScanItem, lang: 'ar' | 'en', foodsById: Map<string, Food>) {
  const f = i.foodId ? foodsById.get(i.foodId) : undefined;
  return f ? displayName(f, lang) : lang === 'ar' ? i.nameAr : i.nameEn;
}
