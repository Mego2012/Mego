import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  acsmRunMet, acsmWalkMet, buildSession, cardioReport, cardioTrends, cleanInput, cyclingSpeedMet, dailyMinutes, deleteCardio, estimateMet,
  getRoutine, listCardio, saveCardio, saveRoutine, totalsFor, validateCardio, weightOn, DEFAULT_ROUTINE, type CardioInput, type CardioSession
} from '../src/lib/cardio';
import { addDays, today } from '../src/lib/dates';
import { db, useDatabase } from '../src/lib/db';
import { autoReplenishPct, energyFor, MAX_DAILY_ADD } from '../src/lib/energy';
import { adviseGoals, applyAdvice, type CheckIn } from '../src/lib/goalAdvisor';
import { APP_RELEASE, preUpdateBackup } from '../src/lib/localBackup';
import { computeLibraryRecipe, indexFoods, LIBRARY, approveRecipeMatches, materializeLibraryRecipe } from '../src/lib/recipeEngine';
import { RECIPE_REF } from '../src/lib/recipeRefMap';
import { refById, setRefData, type RefDb } from '../src/lib/refFoods';
import { addFoodEntry, createFood, getSettings, saveBodyEntry, saveSettings, updateDayLog } from '../src/lib/repo';
import { summarizeDay } from '../src/lib/reports';
import type { Settings } from '../src/lib/types';

const REF = JSON.parse(readFileSync(new URL('../public/fooddb/usda.json', import.meta.url), 'utf8')) as RefDb;
setRefData(REF);

let k = 0;
beforeEach(() => { useDatabase('cg-' + ++k); try { localStorage.clear(); } catch { /* node */ } });

const base = (o: Partial<CardioInput> = {}): CardioInput => ({ activity: 'treadmill_walk', date: today(), time: '07:00', durationMin: 10, speedKmh: 3.5, inclinePct: 13, intensity: 'moderate', ...o });
const settingsWith = async (patch: (s: Settings) => void) => saveSettings(patch);

describe('cardio: calorie estimate', () => {
  it('owner routine — treadmill 10 min, 3.5 km/h, 13 % — uses the ACSM walking equation', () => {
    // S = 58.33 m/min; VO2 = 0.1·S + 1.8·S·0.13 + 3.5 = 22.98 ml/kg/min → 6.57 MET
    expect(acsmWalkMet(3.5, 13)).toBeCloseTo(6.566, 2);
    const s = buildSession(base(), 72);
    expect(s.method).toBe('acsm_walk');
    expect(s.met).toBe(6.6);
    expect(s.kcal).toBe(79); // 6.566 × 72 × 1/6
    expect(s.netKcal).toBe(67); // (6.566 − 1) × 72 / 6
  });
  it('running and fast treadmill use the ACSM running equation', () => {
    expect(acsmRunMet(10)).toBeCloseTo((0.2 * 166.667 + 3.5) / 3.5, 3);
    expect(estimateMet(base({ activity: 'running', speedKmh: 10, inclinePct: undefined })).method).toBe('acsm_run');
    expect(estimateMet(base({ speedKmh: 9 })).method).toBe('acsm_run');
  });
  it('speed is derived from distance ÷ time when not entered', () => {
    const m = estimateMet(base({ activity: 'walking', speedKmh: undefined, distanceKm: 1, durationMin: 12, inclinePct: undefined }));
    expect(m.met).toBeCloseTo(acsmWalkMet(5), 5);
  });
  it('cycling by speed band, other activities by Compendium intensity', () => {
    expect(cyclingSpeedMet(20)).toBe(8.0);
    expect(estimateMet(base({ activity: 'cycling', speedKmh: 20, inclinePct: undefined })).met).toBe(8.0);
    expect(estimateMet(base({ activity: 'elliptical', speedKmh: undefined, inclinePct: undefined, intensity: 'moderate' }))).toEqual({ met: 5.0, method: 'compendium_intensity' });
    expect(estimateMet(base({ activity: 'stationary_bike', speedKmh: undefined, inclinePct: undefined, intensity: 'vigorous' })).met).toBe(8.8);
  });
  it('manually entered calories replace the estimate', () => {
    const s = buildSession(base({ manualKcal: 120 }), 72);
    expect(s).toMatchObject({ method: 'manual', kcal: 120, netKcal: 108 }); // 120 − 72 × 1/6
  });
  it('kcal scale with weight and time (MET × kg × h)', () => {
    const a = buildSession(base({ activity: 'elliptical', speedKmh: undefined, inclinePct: undefined, durationMin: 60 }), 80);
    expect(a.kcal).toBe(400);
    expect(a.netKcal).toBe(320);
  });
  it('validation and relevant fields only', () => {
    expect(validateCardio(base({ durationMin: 0 }))).toContain('duration');
    expect(validateCardio(base({ speedKmh: 40 }))).toContain('speed');
    expect(validateCardio(base({ inclinePct: 50 }))).toContain('incline');
    expect(validateCardio(base({ activity: 'other', customName: ' ' }))).toContain('name');
    expect(validateCardio(base({ activity: 'walking', speedKmh: undefined, inclinePct: undefined, distanceKm: 20, durationMin: 10 }))).toContain('distance');
    const c = cleanInput(base({ activity: 'elliptical' }));
    expect(c.speedKmh).toBeUndefined();
    expect(c.inclinePct).toBeUndefined();
    expect(() => buildSession(base({ durationMin: -5 }), 72)).toThrow(/Invalid/);
  });
  it('weight used = latest weigh-in on or before the session date, else profile weight', async () => {
    const s = await getSettings();
    await saveBodyEntry(addDays(today(), -3), { weight: 75 });
    await saveBodyEntry(addDays(today(), 2), { weight: 70 });
    expect(weightOn(today(), await db.body.toArray(), s)).toBe(75);
    expect(weightOn(addDays(today(), -10), await db.body.toArray(), s)).toBe(s.profile.currentWeight);
  });
});

describe('cardio: logging, editing, deleting (own records only)', () => {
  it('saves, edits (same id, createdAt kept, kcal recalculated) and deletes only that session', async () => {
    const a = await saveCardio(base(), 72);
    const b = await saveCardio(base({ activity: 'running', speedKmh: 10, inclinePct: undefined, time: '18:00' }), 72);
    expect((await listCardio()).map((x) => x.id)).toEqual([b.id, a.id]);
    const e = await saveCardio(base({ durationMin: 20 }), 72, a.id);
    expect(e.id).toBe(a.id);
    expect(e.createdAt).toBe(a.createdAt);
    expect(e.kcal).toBe(158);
    await deleteCardio(a.id);
    expect((await listCardio()).map((x) => x.id)).toEqual([b.id]);
    const ops = (await db.outbox.toArray()).filter((o) => o.table === 'kv').map((o) => `${o.op}:${o.key.slice(0, 7)}`);
    expect(ops).toEqual(['upsert:cardio:', 'upsert:cardio:', 'upsert:cardio:', 'delete:cardio:']);
  });
  it('editing an unknown session fails instead of creating a new one', async () => {
    await expect(saveCardio(base(), 72, 'nope')).rejects.toThrow(/not found/);
  });
  it('routine: defaults to the owner routine, editable', async () => {
    expect(await getRoutine()).toEqual(DEFAULT_ROUTINE);
    expect(DEFAULT_ROUTINE).toMatchObject({ activity: 'treadmill_walk', durationMin: 10, speedKmh: 3.5, inclinePct: 13 });
    await saveRoutine({ ...DEFAULT_ROUTINE, durationMin: 15, inclinePct: 12 });
    expect(await getRoutine()).toMatchObject({ durationMin: 15, inclinePct: 12 });
    expect(await listCardio()).toEqual([]); // the routine is not a session
  });
  it('data of one account never appears in another (separate databases)', async () => {
    useDatabase('cg-user-A');
    await saveCardio(base(), 72);
    useDatabase('cg-user-B');
    expect(await listCardio()).toEqual([]);
    useDatabase('cg-user-A');
    expect(await listCardio()).toHaveLength(1);
  });
});

describe('cardio: daily, weekly, monthly statistics', () => {
  const mk = (date: string, min: number, kcal = 50): CardioSession => ({ ...buildSession(base({ date, durationMin: min }), 72), kcal, netKcal: kcal - 10 });
  it('totals, daily minutes, trends and the report section', () => {
    const t0 = today();
    const s = [mk(t0, 10), mk(t0, 20), mk(addDays(t0, -1), 15), mk(addDays(t0, -8), 30), mk(addDays(t0, -40), 60)];
    expect(totalsFor(s, [t0])).toMatchObject({ minutes: 30, sessions: 2, activeDays: 1, kcal: 100 });
    const week = Array.from({ length: 7 }, (_, i) => addDays(t0, i - 6));
    expect(totalsFor(s, week)).toMatchObject({ minutes: 45, sessions: 3, activeDays: 2 });
    expect(dailyMinutes(s, week).map((x) => x.minutes)).toEqual([0, 0, 0, 0, 0, 15, 30]);
    const tr = cardioTrends(s, 7, t0);
    expect(tr.minutesDelta).toBe(45 - 30);
    expect(tr.avgSessionMin).toBe(19); // (10+20+15+30)/4 within 30 days
    const prev = Array.from({ length: 7 }, (_, i) => addDays(t0, i - 13));
    expect(cardioReport(s, week, prev, 30)).toMatchObject({ minutes: 45, sessions: 3, avgSessionMin: 15, minutesDelta: 15, goalMin: 30, goalPct: 100 });
  });
});

describe('smart cardio → calorie target (no double counting)', () => {
  const sess = (date: string, min: number, net: number, time = '08:00'): CardioSession => ({ ...buildSession(base({ date, durationMin: min, time }), 72), netKcal: net, kcal: net + 12 });
  it('no cardio → target unchanged', async () => {
    const e = energyFor(today(), 2000, 1500, [], await getSettings());
    expect(e).toMatchObject({ allowed: 0, adjusted: 2000, remaining: 500 });
  });
  it('planned routine is already inside the target → nothing added, however often it is logged within the plan', async () => {
    const s = await getSettings(); // activity "active", default goal 3 × 10 min per week
    const d = today();
    const e = energyFor(d, 2000, 0, [sess(addDays(d, -2), 10, 67), sess(d, 10, 67)], s);
    expect(e.plannedWeeklyMin).toBe(30);
    expect(e.allowed).toBe(0);
    expect(e.adjusted).toBe(2000);
    expect(e.reasons.map((r) => r.key)).toContain('en_withinPlan');
  });
  it('only cardio beyond the plan counts, as NET energy × goal share (50 % for fat loss)', async () => {
    const s = await getSettings();
    const d = today();
    // 30 planned min already used by earlier sessions this week; today's 40-min session is all extra
    const prev = [sess(addDays(d, -3), 15, 100), sess(addDays(d, -1), 15, 100)];
    const e = energyFor(d, 2000, 1200, [...prev, sess(d, 40, 300)], s);
    expect(autoReplenishPct(s.profile.goalType)).toBe(50);
    expect(e.extraNetKcal).toBe(300);
    expect(e.allowed).toBe(150);
    expect(e.adjusted).toBe(2150);
    expect(e.remaining).toBe(950);
  });
  it('partly covered session: only the uncovered minutes count', async () => {
    const s = await getSettings();
    const d = today();
    const e = energyFor(d, 2000, 0, [sess(addDays(d, -1), 20, 100), sess(d, 20, 200)], s); // 10 of 20 min covered
    expect(e.extraNetKcal).toBe(100);
    expect(e.allowed).toBe(50);
  });
  it('sedentary level: no exercise included, so all net cardio is extra; cap and off mode respected', async () => {
    const s = await settingsWith((x) => { x.profile.activityLevel = 'sedentary'; x.cardioReplenishPct = 100; });
    const d = today();
    expect(energyFor(d, 2000, 0, [sess(d, 30, 200)], s).allowed).toBe(200);
    expect(energyFor(d, 2000, 0, [sess(d, 120, 900)], s).allowed).toBe(MAX_DAILY_ADD);
    const off = await settingsWith((x) => { x.cardioCalorieMode = 'off'; });
    expect(energyFor(d, 2000, 0, [sess(d, 120, 900)], off)).toMatchObject({ allowed: 0, adjusted: 2000 });
  });
  it('never changes saved targets or nutrition calculations', async () => {
    const before = await getSettings();
    await saveCardio(base({ durationMin: 90 }), 72);
    const after = await getSettings();
    expect(after.targets).toEqual(before.targets);
    const day = summarizeDay(today(), await db.entries.toArray(), await db.days.get(today()), after);
    expect(day.target.kcal).toBe(before.targets[day.dayType].kcal);
  });
});

describe('goal recommendations (suggestions only)', () => {
  const bundleFor = async () => ({ entries: await db.entries.toArray(), days: await db.days.toArray(), body: await db.body.orderBy('date').toArray(), settings: await getSettings() });
  async function logDays(n: number, kcal: number, protein: number) {
    const f = await createFood({ nameAr: 'طعام اختبار', nameEn: 'test food', category: 'x', per100: { kcal: 100, protein: protein / 20, carbs: 10, fat: 2 }, state: 'cooked', stateLabel: '', prep: '', notes: '' });
    for (let i = 1; i <= n; i++) await addFoodEntry(addDays(today(), -i), 'lunch', f, kcal, 'g');
  }
  it('asks for more data instead of guessing', async () => {
    const a = adviseGoals(await bundleFor(), [], [], today());
    expect(a.map((x) => x.id)).toEqual(expect.arrayContaining(['data', 'logging', 'checkin']));
    expect(a.find((x) => x.action?.kind === 'kcal')).toBeUndefined();
  });
  it('stalled fat loss with good adherence → suggests −150 kcal (not applied)', async () => {
    const s = await settingsWith((x) => { x.profile.weeklyChangeKg = -0.4; x.targets.training = { kcal: 2000, protein: 160, carbs: 200, fat: 62 }; x.targets.rest = { ...x.targets.training }; });
    await logDays(14, 2000, 160);
    for (let i = 0; i < 21; i += 2) await saveBodyEntry(addDays(today(), -i), { weight: 72 + (i % 4 === 0 ? 0.1 : -0.1) });
    const a = adviseGoals(await bundleFor(), [], [], today());
    const stall = a.find((x) => x.id === 'stall');
    expect(stall?.action).toEqual({ kind: 'kcal', delta: -150 });
    expect((await getSettings()).targets).toEqual(s.targets); // nothing changed automatically
  });
  it('losing too fast (or struggling) → suggests +150 kcal', async () => {
    await logDays(14, 2000, 160);
    for (let i = 0; i <= 21; i++) await saveBodyEntry(addDays(today(), -i), { weight: 70 + i * 0.15 }); // ≈ −1.05 kg/week
    const ci: CheckIn = { week: today(), strength: 'down', hunger: 5, recovery: 2, resistanceSessions: 3, updatedAt: 1 };
    const a = adviseGoals(await bundleFor(), [], [ci], today());
    expect(a.find((x) => x.id === 'tooFast')?.action).toEqual({ kind: 'kcal', delta: 150 });
  });
  it('low protein target → suggestion keeps calories (carbohydrates absorb the change)', () => {
    const t = { training: { kcal: 2000, protein: 100, carbs: 250, fat: 62 }, rest: { kcal: 1900, protein: 100, carbs: 225, fat: 62 } };
    const n = applyAdvice(t, { kind: 'protein', grams: 144 });
    expect(n.training).toEqual({ kcal: 2000, protein: 144, carbs: 206, fat: 62 });
    expect(applyAdvice(t, { kind: 'kcal', delta: -150 }).rest).toEqual({ kcal: 1750, protein: 100, carbs: 188, fat: 62 });
  });
});

describe('recipe nutrition', () => {
  const ref = (id: string) => refById(id);
  it('every mapped USDA id exists in the reference database', () => {
    for (const [name, id] of Object.entries(RECIPE_REF)) if (id) expect(refById(id), name).toBeTruthy();
  });
  it('with an empty food list every library recipe gets calories and macros from USDA, except labneh (flagged missing)', () => {
    const index = indexFoods([]);
    const all = LIBRARY.map((l) => computeLibraryRecipe(l, index, ref));
    const missing = all.filter((c) => !c.ok);
    expect(missing.every((c) => c.missing.every((m) => RECIPE_REF[m] === null))).toBe(true);
    expect(new Set(missing.flatMap((c) => c.missing))).toEqual(new Set(['لبنة']));
    for (const c of all) {
      expect(c.perServing.kcal).toBeGreaterThan(0);
      expect(Math.abs(c.perServing.kcal * c.lib.servings - c.totals.kcal)).toBeLessThan(0.01 * c.lib.servings + 1e-9); // 2-decimal rounding only // per serving = total ÷ servings
      expect(c.items).toHaveLength(c.lib.ingredients.length);
    }
  });
  it('total = sum of ingredients, no double counting', () => {
    const c = computeLibraryRecipe(LIBRARY[0], indexFoods([]), ref);
    const sum = c.items.reduce((a, i) => a + (i.macros?.kcal ?? 0), 0);
    expect(c.totals.kcal).toBeCloseTo(sum, 1);
    const oil = LIBRARY.find((l) => l.ingredients.some((i) => i[0] === 'زيت زيتون'))!;
    const co = computeLibraryRecipe(oil, indexFoods([]), ref);
    const oilItem = co.items.find((i) => i.name === 'زيت زيتون')!;
    expect(oilItem.macros!.kcal).toBeCloseTo(8.84 * oilItem.grams, 6); // cooking oil is counted
  });
  it('the user\'s own food takes precedence over the USDA match', async () => {
    const f = await createFood({ nameAr: 'صدر دجاج', nameEn: 'chicken breast', category: 'p', per100: { kcal: 200, protein: 30, carbs: 0, fat: 8 }, state: 'raw', stateLabel: 'نيء', prep: '', notes: '' });
    const lib = LIBRARY.find((l) => l.ingredients.some((i) => i[0] === 'صدر دجاج'))!;
    const c = computeLibraryRecipe(lib, indexFoods([f]), ref);
    const it = c.items.find((i) => i.name === 'صدر دجاج')!;
    expect(it.source).toBe('mine');
    expect(it.macros!.kcal).toBeCloseTo(2 * it.grams, 6);
  });
  it('cooked-and-chilled fried rice uses the cooked rice record', () => {
    const fr = LIBRARY.filter((l) => l.ingredients.some((i) => i[2]?.includes('مطبوخ ومبرد')));
    expect(fr.length).toBeGreaterThan(0);
    for (const l of fr) expect(l.ingredients.find((i) => i[2]?.includes('مطبوخ ومبرد'))![0]).toBe('أرز أبيض مطبوخ');
  });
  it('approval adds USDA matches to the food list once, never changing existing foods', async () => {
    const mine = await createFood({ nameAr: 'خيار', nameEn: 'my cucumber', category: 'v', per100: { kcal: 11, protein: 1, carbs: 2, fat: 0 }, state: 'raw', stateLabel: '', prep: '', notes: 'mine' });
    const added = await approveRecipeMatches(['خيار', 'طماطم', 'لبنة']);
    expect(added).toBe(1); // tomato only: cucumber exists, labneh has no reference
    expect((await db.foods.get(mine.id))!.per100.kcal).toBe(11);
    const tomato = (await db.foods.where('nameAr').equals('طماطم').first())!;
    expect(tomato).toMatchObject({ source: 'usda', per100: expect.objectContaining({ kcal: 18 }) });
    expect(await approveRecipeMatches(['طماطم'])).toBe(0);
  });
  it('a recipe saved with approval logs real values per serving', async () => {
    const lib = LIBRARY.find((l) => l.ingredients.every((i) => RECIPE_REF[i[0]]))!;
    const r = await materializeLibraryRecipe(lib.id, { approveMatches: true });
    const c = computeLibraryRecipe(lib, indexFoods([]), ref);
    expect(r.totals.kcal).toBeCloseTo(c.totals.kcal, 0);
  });
});

describe('existing data is preserved', () => {
  async function seedRealistic() {
    const f = await createFood({ nameAr: 'شوفان', nameEn: 'oats', category: 'c', per100: { kcal: 389, protein: 16.9, carbs: 66, fat: 6.9 }, state: 'raw', stateLabel: '', prep: '', notes: '' });
    for (let i = 0; i < 5; i++) await addFoodEntry(addDays(today(), -i), 'breakfast', f, 80, 'g');
    await saveBodyEntry(addDays(today(), -1), { weight: 72.4, waist: 82 });
    await updateDayLog(today(), { waterMl: 1500 });
  }
  const counts = async () => ({ entries: await db.entries.count(), foods: await db.foods.count(), body: await db.body.count(), days: await db.days.count(), recipes: await db.recipes.count() });
  it('pre-update backup snapshots every record once per release; existing records untouched', async () => {
    await seedRealistic();
    const before = await counts();
    const entriesBefore = await db.entries.toArray();
    expect(await preUpdateBackup(APP_RELEASE)).toBe(true);
    const b = (await db.backups.toArray()).find((x) => x.reason === 'pre-update')!;
    const snap = JSON.parse(b.json);
    expect(snap.tables.entries).toHaveLength(before.entries);
    expect(snap.tables.body).toHaveLength(before.body);
    expect(await preUpdateBackup(APP_RELEASE)).toBe(false); // once per release
    expect(await counts()).toEqual(before);
    expect(await db.entries.toArray()).toEqual(entriesBefore);
  });
  it('pre-update backups survive daily-backup rotation', async () => {
    await seedRealistic();
    await preUpdateBackup('r-test');
    const { saveLocalBackup } = await import('../src/lib/localBackup');
    for (let i = 0; i < 12; i++) await saveLocalBackup('manual');
    expect((await db.backups.toArray()).filter((x) => x.reason === 'pre-update')).toHaveLength(1);
  });
  it('using cardio, goals and recipes adds records but never changes existing ones', async () => {
    await seedRealistic();
    const before = await counts();
    const entries = await db.entries.toArray();
    const body = await db.body.toArray();
    await saveCardio(base(), 72);
    await saveRoutine({ ...DEFAULT_ROUTINE, durationMin: 12 });
    await saveSettings((s) => { s.fitness = { resistanceDaysPerWeek: 5, cardioSessionsPerWeek: 4, cardioMinPerSession: 15 }; s.cardioCalorieMode = 'smart'; });
    await approveRecipeMatches(['طماطم']);
    const after = await counts();
    expect(after).toEqual({ ...before, foods: before.foods + 1 });
    expect(await db.entries.toArray()).toEqual(entries);
    expect(await db.body.toArray()).toEqual(body);
  });
});
