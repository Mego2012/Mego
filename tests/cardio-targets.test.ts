/**
 * Cardio goals (daily / weekly minutes, sessions, distance, preferred activity and days): defaults, editing,
 * progress, session counting, editing / deleting sessions, weekly schedule, reports, separation between accounts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSession, deleteCardio, listCardio, saveCardio, type CardioInput, type CardioSession } from '../src/lib/cardio';
import {
  cardioGoalsOf, compare, dayProgress, goalHints, goalsAreSuggested, monthlyHistory, sanitizeGoals, SUGGESTED_GOALS, validateGoals,
  weeklyHistory, weekProgress, weekSchedule, type CardioGoals
} from '../src/lib/cardioGoals';
import { addDays, today } from '../src/lib/dates';
import { db, useDatabase } from '../src/lib/db';
import { energyFor } from '../src/lib/energy';
import { getSettings, saveSettings } from '../src/lib/repo';
import { summarizeDay } from '../src/lib/reports';

let k = 0;
beforeEach(() => { useDatabase('ct-' + ++k); try { localStorage.clear(); } catch { /* node */ } });

// A fixed calendar week: Saturday 14 → Friday 20 November 2026 (weeks start on Saturday = 6, the app default).
const SAT = '2026-11-14', SUN = '2026-11-15', MON = '2026-11-16', TUE = '2026-11-17', WED = '2026-11-18', THU = '2026-11-19', FRI = '2026-11-20';
const WS = 6;
const input = (o: Partial<CardioInput> = {}): CardioInput => ({ activity: 'treadmill_walk', date: WED, time: '07:00', durationMin: 10, speedKmh: 3.5, inclinePct: 13, intensity: 'moderate', ...o });
let n = 0;
const S = (date: string, durationMin: number, o: Partial<CardioInput> = {}): CardioSession => ({ ...buildSession(input({ date, durationMin, ...o }), 72), id: 's' + ++n });
const G = (o: Partial<CardioGoals> = {}): CardioGoals => ({ ...SUGGESTED_GOALS, ...o });

describe('cardio goals: setup and editing', () => {
  it('suggested starting values are 20 min/day, 120 min/week, 6 sessions/week (no distance, no fixed days)', async () => {
    const s = await getSettings();
    expect(cardioGoalsOf(s)).toEqual({ dailyMin: 20, weeklyMin: 120, weeklySessions: 6, weeklyKm: null, preferred: 'treadmill_walk', days: [] });
    expect(goalsAreSuggested(s)).toBe(true);
  });
  it('an older saved "sessions × minutes" fitness goal is kept, not replaced by the suggestion', async () => {
    const s = await saveSettings((x) => { x.fitness = { resistanceDaysPerWeek: 6, cardioSessionsPerWeek: 6, cardioMinPerSession: 10 }; });
    expect(cardioGoalsOf(s)).toMatchObject({ dailyMin: 10, weeklyMin: 60, weeklySessions: 6 });
    expect(goalsAreSuggested(s)).toBe(false);
  });
  it('create, then edit at any time; the goals are saved with the settings (synced per account)', async () => {
    await saveSettings((x) => { x.cardioGoals = G({ dailyMin: 25, weeklyMin: 150, weeklySessions: 5, weeklyKm: 12, preferred: 'incline_walk', days: [6, 0, 1, 2, 3] }); });
    expect(cardioGoalsOf(await getSettings())).toMatchObject({ dailyMin: 25, weeklyMin: 150, weeklySessions: 5, weeklyKm: 12, preferred: 'incline_walk', days: [0, 1, 2, 3, 6] });
    await saveSettings((x) => { x.cardioGoals = { ...cardioGoalsOf(x), weeklyMin: 180, weeklyKm: null }; });
    expect(cardioGoalsOf(await getSettings())).toMatchObject({ weeklyMin: 180, weeklyKm: null });
    const out = (await db.outbox.toArray()).filter((o) => o.table === 'settings');
    expect((out[out.length - 1].payload as { cardioGoals: CardioGoals }).cardioGoals.weeklyMin).toBe(180);
  });
  it('validation rejects missing, negative, fractional or out-of-range values; distance is optional', () => {
    expect(validateGoals(G())).toEqual([]);
    expect(validateGoals({ ...G(), dailyMin: NaN, weeklyMin: -5, weeklySessions: 2.5 })).toEqual(['dailyMin', 'weeklyMin', 'weeklySessions']);
    expect(validateGoals({ ...G(), dailyMin: 301, weeklyMin: 2101, weeklySessions: 22 })).toEqual(['dailyMin', 'weeklyMin', 'weeklySessions']);
    expect(validateGoals({ ...G(), weeklyKm: 0 })).toEqual(['weeklyKm']);
    expect(validateGoals({ ...G(), weeklyKm: null })).toEqual([]);
    expect(validateGoals({ ...G(), days: [7] })).toEqual(['days']);
    expect(validateGoals({ ...G(), preferred: 'swimming' })).toEqual(['preferred']);
  });
  it('stored values from old, partial or tampered records are made safe', () => {
    expect(sanitizeGoals({ dailyMin: -3, weeklyMin: 1e9, weeklySessions: 'x' as unknown as number, weeklyKm: -1, preferred: 'zzz' as never, days: [3, 3, 9, 1.5, 0] as number[] }))
      .toEqual({ dailyMin: 0, weeklyMin: 2100, weeklySessions: 0, weeklyKm: null, preferred: 'treadmill_walk', days: [0, 3] });
    expect(cardioGoalsOf({ cardioGoals: {} as CardioGoals })).toMatchObject({ dailyMin: 20, weeklyMin: 120, weeklySessions: 6 });
  });
  it('hints (not errors) when the numbers do not add up', () => {
    expect(goalHints(G({ days: [1, 2, 3], weeklySessions: 6 }))).toContain('cg_hintDays');
    expect(goalHints(G({ dailyMin: 10, weeklyMin: 120, days: [] }))).toContain('cg_hintDaily'); // 7 × 10 < 120
    expect(goalHints(G())).toEqual([]);
  });
});

describe('cardio goals: daily and weekly progress', () => {
  it('daily: 20 min goal, 10 min done → 10 remaining, 50 %', () => {
    expect(dayProgress([S(WED, 10)], G(), WED)).toMatchObject({ target: 20, done: 10, remaining: 10, pct: 50, sessions: 1, over: 0 });
  });
  it('weekly: 120 min goal, 75 min done → 45 remaining, 62.5 %', () => {
    const w = weekProgress([S(SAT, 30), S(MON, 25), S(WED, 20)], G(), WED, WS);
    expect(w.minutes).toEqual({ target: 120, done: 75, remaining: 45, pct: 62.5, over: 0 });
    expect(w.sessions).toMatchObject({ target: 6, done: 3, remaining: 3, pct: 50 });
    expect([w.start, w.end]).toEqual([SAT, FRI]);
  });
  it('only the calendar week counts (week start from settings); next week starts at zero', () => {
    const all = [S(addDays(SAT, -1), 60), S(SAT, 20), S(FRI, 20), S(addDays(FRI, 1), 40)];
    expect(weekProgress(all, G(), WED, WS).minutes.done).toBe(40);
    expect(weekProgress(all, G(), WED, 0).minutes.done).toBe(60); // Sunday start: week 15–21 Nov → Fri 20 (20) + Sat 21 (40); Sat 14 excluded
    expect(weekProgress(all, G(), addDays(FRI, 1), WS).minutes.done).toBe(40);
  });
  it('exceeding the goal: remaining 0, percentage above 100, surplus shown separately', () => {
    expect(dayProgress([S(WED, 35)], G(), WED)).toMatchObject({ remaining: 0, pct: 175, over: 15 });
  });
  it('a goal of 0 gives no percentage (never a division by zero)', () => {
    expect(dayProgress([S(WED, 10)], G({ dailyMin: 0 }), WED)).toMatchObject({ target: 0, pct: null, remaining: 0 });
  });
  it('distance: totals when given, progress only with a distance goal', () => {
    const s = [S(MON, 30, { activity: 'running', speedKmh: 10, inclinePct: undefined, distanceKm: 5 }), S(WED, 20)];
    expect(weekProgress(s, G(), WED, WS)).toMatchObject({ distanceKm: 5, distance: null });
    expect(weekProgress(s, G({ weeklyKm: 20 }), WED, WS).distance).toMatchObject({ target: 20, done: 5, remaining: 15, pct: 25 });
  });
  it('with preferred days, the daily goal applies on planned days; an unplanned day has no target', () => {
    const g = G({ days: [6, 1, 3] }); // Sat, Mon, Wed
    expect(dayProgress([], g, WED)).toMatchObject({ planned: true, target: 20 });
    expect(dayProgress([], g, TUE)).toMatchObject({ planned: false, target: 0, pct: null });
    expect(dayProgress([S(TUE, 15)], g, TUE)).toMatchObject({ done: 15, over: 15 });
  });
});

describe('cardio goals: session counting, editing and deleting', () => {
  it('each session counts once; a duplicated record of the same id is not counted twice', () => {
    const a = S(WED, 10);
    expect(weekProgress([a, a, { ...a }], G(), WED, WS)).toMatchObject({ minutes: { done: 10 }, sessions: { done: 1 } });
  });
  it('double tap: saving the same new session twice within a minute keeps one record', async () => {
    const a = await saveCardio(input(), 72);
    const b = await saveCardio(input(), 72);
    expect(b.id).toBe(a.id);
    expect(await listCardio()).toHaveLength(1);
    // a genuinely different session at the same time is kept
    await saveCardio(input({ durationMin: 15 }), 72);
    expect(await listCardio()).toHaveLength(2);
  });
  it('logging, editing and deleting sessions recalculates every number from the saved records', async () => {
    const g = G();
    const week = async () => weekProgress(await listCardio(), g, WED, WS);
    const a = await saveCardio(input({ date: MON, durationMin: 30 }), 72);
    const b = await saveCardio(input({ date: WED, durationMin: 20, time: '18:00' }), 72);
    expect((await week()).minutes.done).toBe(50);
    expect(dayProgress(await listCardio(), g, WED)).toMatchObject({ done: 20, remaining: 0, pct: 100 });
    await saveCardio(input({ date: WED, durationMin: 12, time: '18:00' }), 72, b.id); // edit duration
    expect((await week()).minutes.done).toBe(42);
    expect((await week()).sessions.done).toBe(2);
    await saveCardio(input({ date: addDays(SAT, -2), durationMin: 30 }), 72, a.id); // move to the previous week
    expect((await week())).toMatchObject({ minutes: { done: 12 }, sessions: { done: 1 } });
    await deleteCardio(b.id);
    expect((await week())).toMatchObject({ minutes: { done: 0, remaining: 120 }, sessions: { done: 0, remaining: 6 } });
    expect(weeklyHistory(await listCardio(), g, WED, WS, 2)[0]).toMatchObject({ minutes: 30, sessions: 1 });
  });
});

describe('cardio goals: weekly schedule', () => {
  const g = G({ days: [6, 1, 3, 5], weeklySessions: 4 }); // Sat, Mon, Wed, Fri
  it('planned / done / missed / today / planned-ahead / rest / extra, seen on Wednesday', () => {
    const r = weekSchedule([S(SAT, 20), S(TUE, 15)], g, WED, WS, WED);
    expect(r.days.map((d) => `${d.date.slice(8)}:${d.status}`)).toEqual(['14:done', '15:rest', '16:missed', '17:extra', '18:today', '19:rest', '20:planned']);
    expect(r).toMatchObject({ planned: 4, completedPlanned: 1, missed: 1, remainingSessions: 2 });
  });
  it('an unplanned rest day is never a missed session', () => {
    const r = weekSchedule([], g, FRI, WS, FRI);
    expect(r.days.filter((d) => !d.planned).every((d) => d.status === 'rest')).toBe(true);
    expect(r.missed).toBe(3); // Sat, Mon, Wed only
  });
  it('without preferred days nothing is planned and nothing can be missed', () => {
    const r = weekSchedule([S(SUN, 10)], G(), FRI, WS, FRI);
    expect(r).toMatchObject({ planned: 0, missed: 0, remainingSessions: 5 });
    expect(r.days.find((d) => d.date === SUN)?.status).toBe('extra');
  });
  it('remaining sessions never go below zero', () => {
    const many = [SAT, SUN, MON, TUE, WED, THU, FRI].map((d) => S(d, 10));
    expect(weekSchedule(many, g, FRI, WS, FRI).remainingSessions).toBe(0);
  });
});

describe('cardio goals: history and reports', () => {
  it('weekly history: 8 calendar weeks, minutes, sessions, average, distance, goal %, comparison', () => {
    const s = [S(addDays(SAT, -7), 40), S(addDays(SAT, -5), 20, { activity: 'cycling', speedKmh: 20, inclinePct: undefined, distanceKm: 6 }), S(SAT, 30), S(MON, 30), S(WED, 30)];
    const h = weeklyHistory(s, G(), WED, WS, 8);
    expect(h).toHaveLength(8);
    expect(h[7]).toMatchObject({ start: SAT, minutes: 90, sessions: 3, avgSessionMin: 30, distanceKm: 0, goalMin: 120, goalPct: 75 });
    expect(h[6]).toMatchObject({ minutes: 60, sessions: 2, avgSessionMin: 30, distanceKm: 6, goalPct: 50 });
    expect(h[0]).toMatchObject({ minutes: 0, sessions: 0, avgSessionMin: null, goalPct: 0 });
    expect(compare(h[7], h[6])).toEqual({ minutesDelta: 30, pctChange: 50 });
    expect(compare(h[0], undefined)).toEqual({ minutesDelta: null, pctChange: null });
  });
  it('monthly history: 6 months; month goal = weekly goal × days ÷ 7', () => {
    const m = monthlyHistory([S('2026-10-05', 50), S(WED, 30), S(MON, 20)], G(), WED, 6);
    expect(m.map((x) => x.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(m[5]).toMatchObject({ minutes: 50, sessions: 2, goalMin: Math.round((120 * 30) / 7), avgSessionMin: 25 });
    expect(m[4]).toMatchObject({ minutes: 50, goalMin: Math.round((120 * 31) / 7) });
  });
  it('existing records are read as they are (no migration, no rewrite)', async () => {
    await saveCardio(input({ date: MON, durationMin: 30 }), 72);
    const before = JSON.stringify(await db.kv.toArray());
    weeklyHistory(await listCardio(), G(), WED, WS); monthlyHistory(await listCardio(), G(), WED);
    expect(JSON.stringify(await db.kv.toArray())).toBe(before);
  });
});

describe('cardio goals: accounts, safety and nutrition independence', () => {
  it('goals and sessions of one account never appear in another (separate databases)', async () => {
    useDatabase('ct-user-A');
    await saveSettings((x) => { x.cardioGoals = G({ weeklyMin: 200 }); });
    await saveCardio(input(), 72);
    useDatabase('ct-user-B');
    expect(cardioGoalsOf(await getSettings()).weeklyMin).toBe(120);
    expect(await listCardio()).toEqual([]);
    useDatabase('ct-user-A');
    expect(cardioGoalsOf(await getSettings()).weeklyMin).toBe(200);
    expect(await listCardio()).toHaveLength(1);
  });
  it('setting goals and logging cardio never change calorie targets, the food budget or nutrition', async () => {
    const before = await getSettings();
    await saveSettings((x) => { x.cardioGoals = G({ dailyMin: 60, weeklyMin: 400 }); });
    await saveCardio(input({ date: today(), durationMin: 90 }), 72);
    const after = await getSettings();
    expect(after.targets).toEqual(before.targets);
    const day = summarizeDay(today(), await db.entries.toArray(), await db.days.get(today()), after);
    expect(day.target.kcal).toBe(before.targets[day.dayType].kcal);
    const e = energyFor(today(), day.target.kcal, 0, await listCardio(), after);
    expect(e).toMatchObject({ allowed: 0, adjusted: day.target.kcal });
  });
});
