/**
 * AI Meal Scanner — runs the REAL apps-script/Code.gs (gas-mock) with a scripted stand-in for the Gemini API
 * (free tier, generateContent), and the real app logic (catalog → request → validation → DB matching → nutrition → logging).
 * The stand-in reads the food catalog the backend actually sent and answers like the model would.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, useDatabase } from '../src/lib/db';
import { today } from '../src/lib/dates';
import { basisFromFood, macrosFor } from '../src/lib/nutrition';
import { addFoodEntry, saveSettings } from '../src/lib/repo';
import { summarizeDay } from '../src/lib/reports';
import { importParsedFoods, parseCSV, parseFoodRows } from '../src/lib/sheetImport';
import {
  blockers, buildCatalog, itemNutrition, logScannedMeal, mealTotals, needsConfirmation, nextQuotaReset, requestAnalysis, ScanError, suggestFoods, toScanItems,
  validateAiResult, type AiItem, type ScanItem
} from '../src/lib/mealScanner';
import { createGas, type AiRequest } from '../e2e/gas-mock.mjs';
import type { Food } from '../src/lib/types';
import { getSettings } from '../src/lib/repo';

const CSV = readFileSync(new URL('./fixtures/foods-synthetic.csv', import.meta.url), 'utf8');
const TOKEN = 'scan-token';
const KEY = 'AIzaTestKeyNeverInTheApp_0123456789abcd';
const IMG = Buffer.from('fake-jpeg-bytes').toString('base64');
let n = 0;

/** Finds the catalog key the backend sent for an Arabic food name (the model sees exactly these lines). */
function keyFor(req: AiRequest, nameAr: string): string {
  const text: string = req.body.contents[0].parts[1].text;
  const line = text.split('\n').find((l) => l.split(' | ')[1] === nameAr);
  if (!line) throw new Error('not in catalog: ' + nameAr);
  return line.split(' | ')[0];
}
const item = (p: Partial<AiItem> & { name_ar: string }): AiItem => ({
  name_en: p.name_ar, food_key: '', grams: 100, grams_low: 80, grams_high: 120, state: 'cooked', cooking_method: 'none', kind: 'food',
  confidence: 0.85, reason: '', est_per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, ...p
});

type Scenario = (req: AiRequest) => { is_food: boolean; meal_name_ar: string; meal_name_en: string; notes: string; items: AiItem[] };
const SCENARIOS: Record<string, Scenario> = {
  'rice-chicken': (r) => ({ is_food: true, meal_name_ar: 'أرز ودجاج', meal_name_en: 'Rice & chicken', notes: '', items: [
    item({ name_ar: 'أرز أبيض مطبوخ', food_key: keyFor(r, 'أرز أبيض مطبوخ'), grams: 200, grams_low: 160, grams_high: 250, cooking_method: 'boiled', confidence: 0.82 }),
    item({ name_ar: 'صدر دجاج مشوي', food_key: keyFor(r, 'صدر دجاج مشوي'), grams: 150, cooking_method: 'grilled', confidence: 0.9 }),
    item({ name_ar: 'زيت زيتون', food_key: keyFor(r, 'زيت زيتون'), grams: 8, grams_low: 3, grams_high: 15, state: 'other', kind: 'oil_or_fat', confidence: 0.45 })
  ] }),
  // The model wrongly matches boiled eggs to the RAW egg row → the app must refuse the match.
  eggs: (r) => ({ is_food: true, meal_name_ar: 'بيض مسلوق', meal_name_en: 'Boiled eggs', notes: '', items: [
    item({ name_ar: 'بيض مسلوق', name_en: 'Boiled eggs', food_key: keyFor(r, 'بيض كامل'), grams: 150, cooking_method: 'boiled', confidence: 0.8, est_per100: { kcal: 155, protein: 12.6, carbs: 1.1, fat: 10.6 } })
  ] }),
  sandwich: (r) => ({ is_food: true, meal_name_ar: 'ساندويتش', meal_name_en: 'Sandwich', notes: 'الحشوة مخفية جزئيًا', items: [
    item({ name_ar: 'توست بر (خبز أسمر)', food_key: keyFor(r, 'توست بر (خبز أسمر)'), grams: 56, state: 'other', confidence: 0.8 }),
    item({ name_ar: 'جبن شيدر كامل الدسم', food_key: keyFor(r, 'جبن شيدر كامل الدسم'), grams: 20, state: 'other', confidence: 0.5 }),
    item({ name_ar: 'صدر ديك رومي مدخن', name_en: 'Smoked turkey slices', grams: 40, state: 'other', confidence: 0.55, est_per100: { kcal: 104, protein: 17, carbs: 4, fat: 2 } })
  ] }),
  salad: (r) => ({ is_food: true, meal_name_ar: 'سلطة', meal_name_en: 'Salad', notes: '', items: [
    item({ name_ar: 'خس', food_key: keyFor(r, 'خس'), grams: 80, state: 'raw', confidence: 0.85 }),
    item({ name_ar: 'طماطم', food_key: keyFor(r, 'طماطم'), grams: 100, state: 'raw', confidence: 0.85 }),
    item({ name_ar: 'خيار', food_key: keyFor(r, 'خيار'), grams: 90, state: 'raw', confidence: 0.85 }),
    item({ name_ar: 'زيت زيتون', food_key: keyFor(r, 'زيت زيتون'), grams: 10, state: 'other', kind: 'sauce_or_dressing', confidence: 0.4 })
  ] }),
  restaurant: () => ({ is_food: true, meal_name_ar: 'برجر مطعم مع بطاطس', meal_name_en: 'Restaurant burger & fries', notes: '', items: [
    item({ name_ar: 'برجر لحم مطعم', name_en: 'Restaurant beef burger', grams: 250, grams_low: 200, grams_high: 320, confidence: 0.5, est_per100: { kcal: 250, protein: 13, carbs: 20, fat: 13 } }),
    item({ name_ar: 'بطاطس مقلية', name_en: 'French fries', grams: 120, cooking_method: 'deep_fried', confidence: 0.6, est_per100: { kcal: 312, protein: 3.4, carbs: 41, fat: 15 } })
  ] }),
  homemade: (r) => ({ is_food: true, meal_name_ar: 'كبسة دجاج منزلية', meal_name_en: 'Homemade chicken kabsa', notes: '', items: [
    item({ name_ar: 'أرز أبيض مطبوخ', food_key: keyFor(r, 'أرز أبيض مطبوخ'), grams: 250, confidence: 0.7 }),
    item({ name_ar: 'صدر دجاج مشوي', food_key: keyFor(r, 'صدر دجاج مشوي'), grams: 120, confidence: 0.65 }),
    item({ name_ar: 'زيت زيتون', food_key: keyFor(r, 'زيت زيتون'), grams: 12, state: 'other', kind: 'oil_or_fat', confidence: 0.4 })
  ] }),
  mixed: (r) => ({ is_food: true, meal_name_ar: 'زبادي وخبز', meal_name_en: 'Yogurt & bread', notes: '', items: [
    item({ name_ar: 'زبادي يوناني قليل الدسم', food_key: keyFor(r, 'زبادي يوناني قليل الدسم'), grams: 170, state: 'other', confidence: 0.9 }),
    item({ name_ar: 'خبز بيتا أبيض', food_key: keyFor(r, 'خبز بيتا أبيض'), grams: 60, confidence: 0.75 }),
    item({ name_ar: 'خبز بيتا أبيض', food_key: keyFor(r, 'خبز بيتا أبيض'), grams: 30, confidence: 0.75 })
  ] }),
  notfood: () => ({ is_food: false, meal_name_ar: '', meal_name_en: '', notes: 'لا يظهر طعام', items: [] })
};

/** Stand-in for the Gemini API (generateContent + model metadata), including its error formats. */
function gemini(scenarioOf: (req: AiRequest) => string, opts: { code?: number; finish?: string; error?: unknown } = {}) {
  return (req: AiRequest) => {
    if (req.method === 'get') return req.headers['x-goog-api-key'] === KEY ? { json: { name: 'models/gemini-3.8-flash' } } : { code: 400, json: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } } };
    if (opts.code && opts.code !== 200) return { code: opts.code, json: opts.error ?? { error: { code: opts.code, message: 'emulated error', status: 'X' } } };
    if (opts.finish) return { json: { candidates: [{ content: { parts: [] }, finishReason: opts.finish }] } };
    const out = SCENARIOS[scenarioOf(req)](req);
    return { json: { candidates: [{ content: { role: 'model', parts: [{ text: 'thinking…', thought: true }, { text: JSON.stringify(out) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 1 } } };
  };
}
const scenarioFromNote = (req: AiRequest) => /SCENARIO:([\w-]+)/.exec(req.body.contents[0].parts[1].text)![1];
const QUOTA_DAY = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
const QUOTA_MIN = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '17s' }] } };

let gas: ReturnType<typeof createGas>;
let foods: Food[];
const realFetch = globalThis.fetch;

async function setup(gasOpts: Parameters<typeof createGas>[0] = {}) {
  useDatabase('scan-' + ++n);
  await importParsedFoods(parseFoodRows(parseCSV(CSV)).foods);
  foods = await db.foods.toArray();
  gas = createGas({ token: TOKEN, scriptProps: { GEMINI_API_KEY: KEY }, ai: gemini(scenarioFromNote), ...gasOpts });
  globalThis.fetch = (async (_url: string, init: RequestInit) => new Response(JSON.stringify(gas.post(JSON.parse(String(init.body)))), { status: 200 })) as typeof fetch;
  await saveSettings((s) => { s.sync.url = 'https://script.google.com/macros/s/X/exec'; s.sync.token = TOKEN; });
}

async function scan(scenario: string) {
  const catalog = buildCatalog(foods);
  const result = await requestAnalysis(IMG, catalog, { lang: 'ar', note: 'SCENARIO:' + scenario });
  return { result, catalog, items: toScanItems(result, catalog, foods) };
}
const byId = () => new Map(foods.map((f) => [f.id, f]));
const confirmAll = (items: ScanItem[]) => items.map((i) => ({ ...i, confirmed: true }));
const fd = (name: string) => foods.find((f) => f.nameAr === name)!;

describe('AI meal scanner', () => {
  beforeEach(async () => { await setup(); });
  afterAll(() => { globalThis.fetch = realFetch; });

  it('backend request: free Gemini model only, key in header, image first, JSON schema, no personal data, key never returned', async () => {
    await scan('rice-chicken');
    expect(gas.aiRequests).toHaveLength(1); // one call, no retries, no fallback
    const req = gas.aiRequests[0];
    expect(req.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(req.url).not.toContain(KEY); // key travels in a header, not in the URL
    expect(req.headers['x-goog-api-key']).toBe(KEY);
    expect(Object.keys(req.headers)).toEqual(['x-goog-api-key']);
    expect(req.body.generationConfig.responseMimeType).toBe('application/json');
    expect(req.body.generationConfig.responseJsonSchema.required).toContain('items');
    const parts = req.body.contents[0].parts;
    expect(parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: IMG } });
    const sent = JSON.stringify(req.body);
    expect(sent).not.toContain(TOKEN);
    expect(sent).not.toMatch(/fallback|anthropic|claude/i);
    const userText: string = parts[1].text;
    expect(userText).not.toMatch(/weight|waist|profile|target|\bkg\b|وزن|خصر/i);
    expect(Object.keys(req.body).sort()).toEqual(['contents', 'generationConfig', 'systemInstruction']);
    const res = gas.post({ action: 'analyzeMeal', token: TOKEN, image: IMG, foods: buildCatalog(foods).lines, note: 'SCENARIO:salad' });
    expect(JSON.stringify(res)).not.toContain(KEY);
    expect(JSON.stringify(gas.post({ action: 'ping', token: TOKEN }))).not.toContain(KEY);
  });

  it('a paid or unknown model can never be selected (AI_MODEL is limited to free-tier Flash models)', async () => {
    gas = createGas({ token: TOKEN, scriptProps: { GEMINI_API_KEY: KEY, AI_MODEL: 'gemini-4-argon' }, ai: gemini(scenarioFromNote) });
    await scan('salad');
    expect(gas.aiRequests[0].url).toContain('/models/gemini-3.8-flash:generateContent');
    gas = createGas({ token: TOKEN, scriptProps: { GEMINI_API_KEY: KEY, AI_MODEL: 'gemini-3.6-flash' }, ai: gemini(scenarioFromNote) });
    await scan('salad');
    expect(gas.aiRequests[0].url).toContain('/models/gemini-3.6-flash:generateContent');
    expect(gas.post({ action: 'ping', token: TOKEN }).aiModel).toBe('gemini-3.6-flash');
  });

  it('setAiKey: key checked with Google first, stored only in Script Properties, removable', () => {
    gas = createGas({ token: TOKEN, ai: gemini(scenarioFromNote) });
    expect(gas.post({ action: 'setAiKey', token: 'wrong', key: KEY }).error).toBe('unauthorized');
    expect(gas.post({ action: 'setAiKey', token: TOKEN, key: 'AIzaWrongKey_000000000000000000' }).error).toBe('AI_KEY_INVALID');
    expect(gas.props.has('GEMINI_API_KEY')).toBe(false);
    expect(gas.post({ action: 'setAiKey', token: TOKEN, key: 'bad key!' }).error).toBe('AI_KEY_INVALID');
    const r = gas.post({ action: 'setAiKey', token: TOKEN, key: KEY });
    expect(r).toMatchObject({ ok: true, aiScanner: true, aiModel: 'gemini-3.8-flash' });
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(gas.props.get('GEMINI_API_KEY')).toBe(KEY);
    expect(gas.aiRequests[gas.aiRequests.length - 1].method).toBe('get'); // metadata check, not a generation
    expect(gas.post({ action: 'ping', token: TOKEN }).aiScanner).toBe(true);
    gas.post({ action: 'setAiKey', token: TOKEN, remove: true });
    expect(gas.props.has('GEMINI_API_KEY')).toBe(false);
    // Google's newer key format (AQ.…) is not rejected locally: it is sent to Google for the real check
    const before = gas.aiRequests.length;
    gas.post({ action: 'setAiKey', token: TOKEN, key: 'AQ.Ab8TestOnlyNotARealKey_0123456789abcdefXYZ' });
    expect(gas.aiRequests.length).toBe(before + 1);
  });

  it('free quota: daily → clear message with reset time; per-minute → wait seconds; never retried elsewhere', async () => {
    const code = async () => { try { await scan('salad'); return null; } catch (e) { return e as ScanError; } };
    gas = createGas({ token: TOKEN, scriptProps: { GEMINI_API_KEY: KEY }, ai: gemini(scenarioFromNote, { code: 429, error: QUOTA_DAY }) });
    const d = (await code())!;
    expect(d.code).toBe('AI_QUOTA_DAY');
    expect(String(d.params.time)).toMatch(/\d/);
    expect(gas.aiRequests).toHaveLength(1);
    gas = createGas({ token: TOKEN, scriptProps: { GEMINI_API_KEY: KEY }, ai: gemini(scenarioFromNote, { code: 429, error: QUOTA_MIN }) });
    const m = (await code())!;
    expect(m.code).toBe('AI_QUOTA_MINUTE');
    expect(m.params.s).toBe(17);
    expect(gas.aiRequests).toHaveLength(1);
  });

  it('quota reset time = next midnight Pacific (DST aware)', () => {
    expect(nextQuotaReset(new Date('2026-11-06T16:00:00Z')).toISOString()).toBe('2026-11-07T08:00:00.000Z');
    expect(nextQuotaReset(new Date('2026-07-06T16:00:00Z')).toISOString()).toBe('2026-07-07T07:00:00.000Z');
    expect(nextQuotaReset(new Date('2026-11-07T07:59:00Z')).toISOString()).toBe('2026-11-07T08:00:00.000Z');
  });

  it('rice & chicken: DB matches, nutrition = engine values, oil needs confirmation, nothing saved before confirm', async () => {
    const { items } = await scan('rice-chicken');
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.foodId)).toBe(true);
    const rice = items[0];
    expect(itemNutrition(rice, byId()).macros).toEqual(macrosFor(basisFromFood(fd('أرز أبيض مطبوخ')), 200, 'g').macros);
    expect(needsConfirmation(items[2])).toBe(true); // oil, low confidence
    expect(blockers(items).map((b) => b.reason)).toContain('unconfirmed');
    expect(await db.entries.count()).toBe(0); // never auto-saved
    await expect(logScannedMeal(today(), 'lunch', items)).rejects.toThrow(/AI_NOT_READY/);
    const { entries } = await logScannedMeal(today(), 'lunch', confirmAll(items));
    expect(entries).toHaveLength(3);
    // identical to logging the same grams manually
    useDatabase('scan-manual-' + n);
    await importParsedFoods(parseFoodRows(parseCSV(CSV)).foods);
    const manual = await addFoodEntry(today(), 'lunch', (await db.foods.where('nameAr').equals('أرز أبيض مطبوخ').first())!, 200, 'g');
    expect(entries[0].macros).toEqual(manual.macros);
    expect(entries[0].basis.per100).toEqual(manual.basis.per100);
  });

  it('eggs: a raw DB row is never accepted for cooked eggs (no auto conversion)', async () => {
    const { items } = await scan('eggs');
    expect(items[0].foodId).toBeUndefined();
    expect(items[0].flags).toContain('stateMismatch');
    expect(itemNutrition(items[0], byId()).estimated).toBe(true);
    expect(blockers(items).map((b) => b.reason)).toContain('unmatched');
  });

  it('sandwich: unmatched filling is an estimate; logging it requires explicit "add as new food"', async () => {
    const { items } = await scan('sandwich');
    const turkey = items[2];
    expect(turkey.foodId).toBeUndefined();
    expect(turkey.estPer100).toEqual({ kcal: 104, protein: 17, carbs: 4, fat: 2 });
    const before = await db.foods.count();
    const approved = confirmAll(items).map((i) => (i.id === turkey.id ? { ...i, addAsNew: true } : i));
    const r = await logScannedMeal(today(), 'dinner', approved);
    expect(r.createdFoods).toHaveLength(1);
    expect(r.createdFoods[0].notes).toMatch(/غير محقق|unverified/);
    expect(r.createdFoods[0].source).toBe('custom');
    expect(await db.foods.count()).toBe(before + 1);
    expect(r.entries.find((e) => e.foodId === r.createdFoods[0].id)!.macros.kcal).toBeCloseTo(41.6, 1);
  });

  it('salad: dressing flagged as hidden fat; totals add up', async () => {
    const { items } = await scan('salad');
    expect(items[3].flags).toContain('hiddenFat');
    const t = mealTotals(items, byId());
    const sum = items.reduce((a, i) => a + itemNutrition(i, byId()).macros.kcal, 0);
    expect(t.total.kcal).toBeCloseTo(Math.round(sum), 0);
    expect(t.hasEstimates).toBe(false);
  });

  it('restaurant meal: all estimates, low confidence, user can instead pick DB foods', async () => {
    const { items } = await scan('restaurant');
    expect(items.every((i) => !i.foodId && i.estPer100)).toBe(true);
    expect(mealTotals(items, byId()).hasEstimates).toBe(true);
    expect(suggestFoods({ ...items[1], nameAr: 'بطاطس', nameEn: 'potato' }, foods).length).toBeGreaterThanOrEqual(0);
    // user replaces the burger with a DB food and removes the fries
    const chicken = fd('صدر دجاج مشوي');
    const edited = [{ ...items[0], foodId: chicken.id, grams: 180, confirmed: true }];
    const { entries } = await logScannedMeal(today(), 'dinner', edited);
    expect(entries[0].macros).toEqual(macrosFor(basisFromFood(chicken), 180, 'g').macros);
  });

  it('homemade recipe: editing grams recalculates instantly; dashboard/remaining update after save', async () => {
    const { items } = await scan('homemade');
    const before = mealTotals(items, byId()).total.kcal;
    const edited = confirmAll(items).map((i, k) => (k === 0 ? { ...i, grams: 150 } : i));
    const after = mealTotals(edited, byId()).total.kcal;
    expect(after).toBeLessThan(before);
    await logScannedMeal(today(), 'lunch', edited);
    const s = await getSettings();
    const day = summarizeDay(today(), await db.entries.toArray(), undefined, s);
    expect(day.totals.kcal).toBe(after);
    expect(day.remaining.kcal).toBe(day.target.kcal - after);
  });

  it('mixed meal: same food twice is merged into one entry', async () => {
    const { items } = await scan('mixed');
    const { entries } = await logScannedMeal(today(), 'breakfast', confirmAll(items));
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.name.includes('بيتا'))!.grams).toBe(90);
  });

  it('not food → no items, cannot save', async () => {
    const { result, items } = await scan('notfood');
    expect(result.is_food).toBe(false);
    expect(blockers(items)[0].reason).toBe('empty');
  });

  it('errors are reported clearly and never crash', async () => {
    const err = async () => { try { await scan('salad'); return 'none'; } catch (e) { return (e as ScanError).code; } };
    const k = { GEMINI_API_KEY: KEY };
    gas = createGas({ token: TOKEN, ai: gemini(scenarioFromNote) }); // no key
    expect(await err()).toBe('AI_NOT_CONFIGURED');
    gas = createGas({ token: TOKEN, scriptProps: k, ai: gemini(scenarioFromNote, { code: 400, error: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } } }) });
    expect(await err()).toBe('AI_KEY_INVALID');
    gas = createGas({ token: TOKEN, scriptProps: k, ai: gemini(scenarioFromNote, { code: 400, error: { error: { code: 400, message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' } } }) });
    expect(await err()).toBe('AI_REGION');
    gas = createGas({ token: TOKEN, scriptProps: k, ai: gemini(scenarioFromNote, { code: 503 }) });
    expect(await err()).toBe('AI_BUSY');
    gas = createGas({ token: TOKEN, scriptProps: k, ai: gemini(scenarioFromNote, { code: 404 }) });
    expect(await err()).toBe('AI_MODEL_UNAVAILABLE');
    gas = createGas({ token: TOKEN, scriptProps: k }); // UrlFetchApp throws
    expect(await err()).toBe('AI_NETWORK');
    gas = createGas({ token: TOKEN, scriptProps: k, ai: gemini(scenarioFromNote, { finish: 'SAFETY' }) });
    expect(await err()).toBe('AI_REFUSED');
    gas = createGas({ token: TOKEN, scriptProps: k, ai: gemini(scenarioFromNote, { finish: 'MAX_TOKENS' }) });
    expect(await err()).toBe('AI_TRUNCATED');
    gas = createGas({ token: TOKEN, scriptProps: { ...k, AI_DAILY_LIMIT: '1' }, ai: gemini(scenarioFromNote) });
    expect(await err()).toBe('none');
    expect(await err()).toBe('AI_DAILY_LIMIT');
    gas = createGas({ token: 'other', scriptProps: k, ai: gemini(scenarioFromNote) });
    expect(await err()).toBe('AI_UNAUTHORIZED');
    expect(gas.post({ action: 'analyzeMeal', token: 'other', image: 'not base64!!' }).error).toBe('AI_BAD_IMAGE');
    globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    expect(await err()).toBe('AI_NETWORK');
    await saveSettings((s) => { s.sync.url = ''; });
    expect(await err()).toBe('AI_NO_BACKEND');
  });

  it('malformed AI output is validated (clamped grams, unknown enums, bad keys)', () => {
    const v = validateAiResult({ is_food: true, items: [
      { name_ar: 'x', grams: 99999, state: 'weird', cooking_method: 'laser', kind: 'z', confidence: 7, food_key: 'f99999' },
      { name_ar: '', name_en: '', grams: 10 },
      { name_ar: 'y', grams: -5 }
    ] });
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ grams: 3000, state: 'other', cooking_method: 'unknown', kind: 'food', confidence: 1 });
    const items = toScanItems(v, buildCatalog(foods), foods);
    expect(items[0].flags).toContain('badKey');
    expect(() => validateAiResult('nope')).toThrow();
  });
});

describe('public accounts: AI proxy with Firebase sign-in tokens (real Code.gs)', () => {
  /** Emulates Google Identity Toolkit + Firestore REST (with the user's token) + Gemini behind UrlFetchApp. */
  function publicGas(opts: { country?: string; status?: string; admins?: string[]; userLimit?: string } = {}) {
    const accounts: Record<string, string> = { 'tok-alice': 'alice', 'tok-bob': 'bob', 'tok-admin': 'admin' };
    const gem = gemini(scenarioFromNote);
    return createGas({
      token: TOKEN, scriptProps: { GEMINI_API_KEY: KEY, FIREBASE_API_KEY: 'web-key', FIREBASE_PROJECT_ID: 'mego-prod', AI_USER_DAILY_LIMIT: opts.userLimit ?? '2' },
      ai: (req) => {
        if (req.url.startsWith('https://identitytoolkit.googleapis.com/')) {
          const uid = accounts[req.body.idToken];
          return uid ? { json: { users: [{ localId: uid }] } } : { code: 400, json: { error: { message: 'INVALID_ID_TOKEN' } } };
        }
        if (req.url.startsWith('https://firestore.googleapis.com/')) {
          const tokUid = accounts[String(req.headers.Authorization).replace('Bearer ', '')];
          const path = req.url.split('/documents/')[1];
          if (path === `profiles/${tokUid}`) return { json: { fields: { status: { stringValue: opts.status ?? 'active' }, country: { stringValue: opts.country ?? 'SA' } } } };
          if (path === `admins/${tokUid}` && (opts.admins ?? ['admin']).includes(tokUid)) return { json: { fields: {} } };
          return { code: 403, json: { error: { status: 'PERMISSION_DENIED' } } };
        }
        return gem(req);
      }
    });
  }
  const scanBody = (idToken: string) => ({ action: 'analyzeMeal', idToken, image: IMG, foods: buildCatalog(foods).lines, note: 'SCENARIO:salad' });

  it('a signed-in user can scan; the per-user daily limit applies to each user separately', () => {
    const g = publicGas();
    expect(g.post(scanBody('tok-alice')).ok).toBe(true);
    expect(g.post(scanBody('tok-alice')).ok).toBe(true);
    expect(g.post(scanBody('tok-alice'))).toMatchObject({ ok: false, error: 'AI_USER_LIMIT', limit: 2 });
    expect(g.post(scanBody('tok-bob')).ok).toBe(true); // bob has his own allowance
  });
  it('invalid token, suspended account and free-tier-restricted countries are refused before any AI call', () => {
    const g = publicGas();
    expect(g.post(scanBody('forged-token')).error).toBe('unauthorized');
    expect(publicGas({ status: 'suspended' }).post(scanBody('tok-alice')).error).toBe('unauthorized');
    const eu = publicGas({ country: 'DE' });
    expect(eu.post(scanBody('tok-alice')).error).toBe('AI_REGION_RESTRICTED');
    expect(eu.aiRequests.some((r) => r.url.includes('generativelanguage'))).toBe(false);
  });
  it('the global daily cap still applies across all users', () => {
    const p = publicGas({ userLimit: '5' });
    p.props.set('AI_DAILY_LIMIT', '1');
    expect(p.post(scanBody('tok-alice')).ok).toBe(true);
    expect(p.post(scanBody('tok-bob')).error).toBe('AI_DAILY_LIMIT');
  });
  it('usage statistics: admins get counts only; regular users are refused', () => {
    const g = publicGas();
    g.post(scanBody('tok-alice')); g.post(scanBody('tok-bob'));
    expect(g.post({ action: 'aiStats', idToken: 'tok-alice' }).error).toBe('unauthorized');
    const st = g.post({ action: 'aiStats', idToken: 'tok-admin' });
    expect(st.ok).toBe(true);
    const todayRow = st.days[st.days.length - 1];
    expect(todayRow).toMatchObject({ scans: 2, users: 2 });
    expect(JSON.stringify(st)).not.toMatch(/alice|bob|salad|SCENARIO/);
  });
});

describe('owner configuration of the public platform', () => {
  it('setCloudConfig needs the owner token, validates input and bounds the limits', () => {
    const g = createGas({ token: TOKEN });
    expect(g.post({ action: 'setCloudConfig', token: 'wrong', apiKey: 'AIzaSyAAAAAAAAAAAAAAAAAAAAAAA', projectId: 'mego-abc123' }).error).toBe('unauthorized');
    expect(g.post({ action: 'setCloudConfig', token: TOKEN, apiKey: 'bad key', projectId: 'mego' }).ok).toBe(false);
    expect(g.post({ action: 'setCloudConfig', token: TOKEN, apiKey: 'AIzaSyAAAAAAAAAAAAAAAAAAAAAAA', projectId: 'mego-abc123', userLimit: 999, globalLimit: 5 }).ok).toBe(true);
    expect([g.props.get('FIREBASE_PROJECT_ID'), g.props.get('AI_USER_DAILY_LIMIT'), g.props.get('AI_DAILY_LIMIT')]).toEqual(['mego-abc123', '50', '5']);
  });
});
