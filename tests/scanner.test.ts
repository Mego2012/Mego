/**
 * AI Meal Scanner — runs the REAL apps-script/Code.gs (gas-mock) with a scripted stand-in for the Claude Messages
 * API, and the real app logic (catalog → request → validation → DB matching → nutrition → logging).
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
  blockers, buildCatalog, itemNutrition, logScannedMeal, mealTotals, needsConfirmation, requestAnalysis, ScanError, suggestFoods, toScanItems,
  validateAiResult, type AiItem, type ScanItem
} from '../src/lib/mealScanner';
import { createGas, type AiRequest } from '../e2e/gas-mock.mjs';
import type { Food } from '../src/lib/types';
import { getSettings } from '../src/lib/repo';

const CSV = readFileSync(new URL('./fixtures/foods-synthetic.csv', import.meta.url), 'utf8');
const TOKEN = 'scan-token';
const KEY = 'sk-ant-test-key-never-in-app';
const IMG = Buffer.from('fake-jpeg-bytes').toString('base64');
let n = 0;

/** Finds the catalog key the backend sent for an Arabic food name (the model sees exactly these lines). */
function keyFor(req: AiRequest, nameAr: string): string {
  const text: string = req.body.messages[0].content[1].text;
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

function claude(scenarioOf: (req: AiRequest) => string, opts: { code?: number; stop?: string } = {}) {
  return (req: AiRequest) => {
    if (opts.code && opts.code !== 200) return { code: opts.code, json: { type: 'error', error: { type: 'x', message: 'emulated error' } } };
    if (opts.stop === 'refusal') return { json: { model: req.body.model, stop_reason: 'refusal', content: [] } };
    const out = SCENARIOS[scenarioOf(req)](req);
    return { json: { id: 'msg_test', model: req.body.model, stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(out) }] } };
  };
}
const scenarioFromNote = (req: AiRequest) => /SCENARIO:([\w-]+)/.exec(req.body.messages[0].content[1].text)![1];

let gas: ReturnType<typeof createGas>;
let foods: Food[];
const realFetch = globalThis.fetch;

async function setup(gasOpts: Parameters<typeof createGas>[0] = {}) {
  useDatabase('scan-' + ++n);
  await importParsedFoods(parseFoodRows(parseCSV(CSV)).foods);
  foods = await db.foods.toArray();
  gas = createGas({ token: TOKEN, scriptProps: { ANTHROPIC_API_KEY: KEY }, ai: claude(scenarioFromNote), ...gasOpts });
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

  it('backend request: model, headers, image first, schema, no personal data, key never returned', async () => {
    await scan('rice-chicken');
    const req = gas.aiRequests[0];
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers['x-api-key']).toBe(KEY);
    expect(req.headers['anthropic-version']).toBeTruthy();
    expect(req.body.model).toBe('claude-opus-5-5');
    expect(req.body.thinking).toBeUndefined();
    expect(req.body.output_config.format.type).toBe('json_schema');
    const content = req.body.messages[0].content;
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMG } });
    expect(content[1].type).toBe('text');
    const s = await getSettings();
    const sent = JSON.stringify(req.body);
    // nothing personal: no weight/targets/profile/diary values, no token
    expect(sent).not.toContain(TOKEN);
    expect(sent).not.toContain(String(s.profile.currentWeight) + ' kg');
    const userText: string = content[1].text;
    expect(userText).not.toMatch(/weight|waist|profile|target|\bkg\b|وزن|خصر/i);
    expect(Object.keys(req.body).sort()).toEqual(['fallbacks', 'max_tokens', 'messages', 'model', 'output_config', 'system']);
    // the app response never contains the API key
    const res = gas.post({ action: 'analyzeMeal', token: TOKEN, image: IMG, foods: buildCatalog(foods).lines, note: 'SCENARIO:salad' });
    expect(JSON.stringify(res)).not.toContain(KEY);
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
    gas = createGas({ token: TOKEN, ai: claude(scenarioFromNote) }); // no API key
    expect(await err()).toBe('AI_NOT_CONFIGURED');
    gas = createGas({ token: TOKEN, scriptProps: { ANTHROPIC_API_KEY: KEY }, ai: claude(scenarioFromNote, { code: 401 }) });
    expect(await err()).toBe('AI_KEY_INVALID');
    gas = createGas({ token: TOKEN, scriptProps: { ANTHROPIC_API_KEY: KEY }, ai: claude(scenarioFromNote, { code: 529 }) });
    expect(await err()).toBe('AI_BUSY');
    gas = createGas({ token: TOKEN, scriptProps: { ANTHROPIC_API_KEY: KEY } }); // UrlFetchApp throws
    expect(await err()).toBe('AI_NETWORK');
    gas = createGas({ token: TOKEN, scriptProps: { ANTHROPIC_API_KEY: KEY }, ai: claude(scenarioFromNote, { stop: 'refusal' }) });
    expect(await err()).toBe('AI_REFUSED');
    gas = createGas({ token: TOKEN, scriptProps: { ANTHROPIC_API_KEY: KEY, AI_DAILY_LIMIT: '1' }, ai: claude(scenarioFromNote) });
    expect(await err()).toBe('none');
    expect(await err()).toBe('AI_DAILY_LIMIT');
    gas = createGas({ token: 'other', scriptProps: { ANTHROPIC_API_KEY: KEY }, ai: claude(scenarioFromNote) });
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
