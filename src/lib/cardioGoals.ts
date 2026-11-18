/**
 * Cardio goals: per-user targets (stored in the user's synced settings record), progress for a day / calendar week,
 * a weekly schedule of preferred days, and weekly / monthly history.
 *
 * Rules
 *  - Goals are starting suggestions chosen by the user, not medical recommendations.
 *  - Progress is always computed from the saved sessions (never stored), so editing or deleting a session
 *    automatically corrects every number; a session is counted once (by its id).
 *  - Weeks follow the user's "week starts on" setting, like the calorie budget.
 *  - An unplanned day without cardio is a rest day, never a missed session.
 *  - Cardio never changes the food budget or any nutrition target (see energy.ts).
 */
import { addDays, addMonths, monthDates, monthKey, startOfWeek, today, weekDates, weekday } from './dates';
import type { CardioActivity, CardioSession } from './cardio';
import type { Settings } from './types';

export type PreferredCardio = 'treadmill_walk' | 'incline_walk' | 'running' | 'cycling' | 'walking' | 'other';
export const PREFERRED: PreferredCardio[] = ['treadmill_walk', 'incline_walk', 'running', 'cycling', 'walking', 'other'];

export interface CardioGoals {
  /** Target minutes for a single day (planned days when days are chosen, otherwise every day). */
  dailyMin: number;
  weeklyMin: number;
  weeklySessions: number;
  /** Optional weekly distance target in km (null / undefined = not tracked as a goal). */
  weeklyKm?: number | null;
  preferred: PreferredCardio;
  /** Preferred cardio weekdays, 0 = Sunday … 6 = Saturday. Empty = no fixed days. */
  days: number[];
  updatedAt?: number;
}

/** Suggested starting values (editable; not medical advice). */
export const SUGGESTED_GOALS: CardioGoals = { dailyMin: 20, weeklyMin: 120, weeklySessions: 6, weeklyKm: null, preferred: 'treadmill_walk', days: [] };

export const GOAL_LIMITS = { dailyMin: [0, 300], weeklyMin: [0, 2100], weeklySessions: [0, 21], weeklyKm: [0, 500] } as const;

/**
 * The user's goals: the saved goals, or — for someone who already set the older "sessions × minutes per session"
 * fitness goal — those numbers (so an existing goal is never silently replaced), otherwise the suggested values.
 */
export function cardioGoalsOf(s: Pick<Settings, 'cardioGoals' | 'fitness'>): CardioGoals {
  const saved = s.cardioGoals;
  if (saved && typeof saved === 'object') return sanitizeGoals(saved);
  const f = s.fitness;
  if (f && (f.cardioSessionsPerWeek !== undefined || f.cardioMinPerSession !== undefined)) {
    const sessions = clampInt(f.cardioSessionsPerWeek ?? SUGGESTED_GOALS.weeklySessions, 0, 21);
    const per = clampInt(f.cardioMinPerSession ?? 10, 0, 300);
    return { ...SUGGESTED_GOALS, dailyMin: per, weeklySessions: sessions, weeklyMin: sessions * per };
  }
  return { ...SUGGESTED_GOALS };
}

/** True when the goals shown are the suggested starting values (nothing saved yet). */
export const goalsAreSuggested = (s: Pick<Settings, 'cardioGoals' | 'fitness'>) =>
  !s.cardioGoals && !(s.fitness && (s.fitness.cardioSessionsPerWeek !== undefined || s.fitness.cardioMinPerSession !== undefined));

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

/** Makes any stored value safe to use (old, partial or tampered records never break the screen). */
export function sanitizeGoals(g: Partial<CardioGoals>): CardioGoals {
  const km = g.weeklyKm === null || g.weeklyKm === undefined || (g.weeklyKm as unknown) === '' ? null : Number(g.weeklyKm);
  return {
    dailyMin: clampInt(g.dailyMin ?? SUGGESTED_GOALS.dailyMin, 0, 300),
    weeklyMin: clampInt(g.weeklyMin ?? SUGGESTED_GOALS.weeklyMin, 0, 2100),
    weeklySessions: clampInt(g.weeklySessions ?? SUGGESTED_GOALS.weeklySessions, 0, 21),
    weeklyKm: km !== null && Number.isFinite(km) && km > 0 ? Math.min(500, Math.round(km * 10) / 10) : null,
    preferred: PREFERRED.includes(g.preferred as PreferredCardio) ? (g.preferred as PreferredCardio) : 'treadmill_walk',
    days: [...new Set((Array.isArray(g.days) ? g.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b),
    ...(g.updatedAt ? { updatedAt: g.updatedAt } : {})
  };
}

/** Field keys that are out of range (empty = valid). Used before saving; the editor shows them. */
export function validateGoals(g: { dailyMin: unknown; weeklyMin: unknown; weeklySessions: unknown; weeklyKm?: unknown; preferred?: unknown; days?: unknown }): string[] {
  const errs: string[] = [];
  const int = (v: unknown, [lo, hi]: readonly [number, number]) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
  if (!int(g.dailyMin, GOAL_LIMITS.dailyMin)) errs.push('dailyMin');
  if (!int(g.weeklyMin, GOAL_LIMITS.weeklyMin)) errs.push('weeklyMin');
  if (!int(g.weeklySessions, GOAL_LIMITS.weeklySessions)) errs.push('weeklySessions');
  if (g.weeklyKm !== null && g.weeklyKm !== undefined && !(typeof g.weeklyKm === 'number' && g.weeklyKm > 0 && g.weeklyKm <= GOAL_LIMITS.weeklyKm[1])) errs.push('weeklyKm');
  if (g.preferred !== undefined && !PREFERRED.includes(g.preferred as PreferredCardio)) errs.push('preferred');
  if (g.days !== undefined && !(Array.isArray(g.days) && g.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) errs.push('days');
  return errs;
}

/** Hints (not errors) when the numbers do not fit together. */
export function goalHints(g: CardioGoals): string[] {
  const h: string[] = [];
  if (g.days.length && g.days.length < g.weeklySessions) h.push('cg_hintDays');
  const cap = g.days.length ? g.days.length * g.dailyMin : 7 * g.dailyMin;
  if (g.dailyMin > 0 && cap < g.weeklyMin) h.push('cg_hintDaily');
  return h;
}

/** Activity + treadmill settings to pre-fill a new session from the preferred activity. */
export function preferredToActivity(p: PreferredCardio): { activity: CardioActivity; inclineHint: boolean } {
  if (p === 'incline_walk') return { activity: 'treadmill_walk', inclineHint: true };
  return { activity: p, inclineHint: false };
}

/* ------------------------------------------------------------------ progress */

const r1 = (x: number) => Math.round(x * 10) / 10;
const pctOf = (done: number, target: number) => (target > 0 ? r1((done / target) * 100) : null);
/** Sessions counted once each (by id), even if a list accidentally contains the same record twice. */
export const uniqueSessions = (sessions: CardioSession[]) => [...new Map(sessions.map((s) => [s.id, s])).values()];

export interface Progress { target: number; done: number; remaining: number; pct: number | null; over: number }
const progress = (done: number, target: number): Progress => ({ target, done, remaining: Math.max(0, target - done), pct: pctOf(done, target), over: Math.max(0, done - target) });

/** A day's target: the daily goal on planned days (or every day when no days are chosen); 0 on unplanned days. */
export function dayTarget(goals: CardioGoals, date: string): number {
  if (!goals.days.length) return goals.dailyMin;
  return goals.days.includes(weekday(date)) ? goals.dailyMin : 0;
}

export function dayProgress(sessions: CardioSession[], goals: CardioGoals, date: string) {
  const s = uniqueSessions(sessions).filter((x) => x.date === date);
  const minutes = s.reduce((a, x) => a + x.durationMin, 0);
  return { date, planned: !goals.days.length || goals.days.includes(weekday(date)), sessions: s.length, ...progress(minutes, dayTarget(goals, date)) };
}

export interface WeekProgress {
  start: string; end: string; dates: string[];
  minutes: Progress; sessions: Progress;
  distanceKm: number; distance: Progress | null;
  activeDays: number;
}

export function weekProgress(sessions: CardioSession[], goals: CardioGoals, date: string, weekStartsOn: number): WeekProgress {
  const start = startOfWeek(date, weekStartsOn);
  const dates = weekDates(start);
  const set = new Set(dates);
  const s = uniqueSessions(sessions).filter((x) => set.has(x.date));
  const minutes = s.reduce((a, x) => a + x.durationMin, 0);
  const distanceKm = Math.round(s.reduce((a, x) => a + (x.distanceKm ?? 0), 0) * 100) / 100;
  return {
    start, end: dates[6], dates,
    minutes: progress(minutes, goals.weeklyMin),
    sessions: progress(s.length, goals.weeklySessions),
    distanceKm,
    distance: goals.weeklyKm ? progress(distanceKm, goals.weeklyKm) : null,
    activeDays: new Set(s.map((x) => x.date)).size
  };
}

/* ------------------------------------------------------------------ weekly schedule */

export type DayStatus = 'done' | 'missed' | 'today' | 'planned' | 'rest' | 'extra';
export interface ScheduleDay { date: string; weekday: number; planned: boolean; minutes: number; sessions: number; status: DayStatus }

/**
 * Status of each day of the week containing `date`:
 *   done    – a planned day with at least one session
 *   extra   – an unplanned day with a session (counts toward the week, never a problem)
 *   missed  – a planned day in the past without a session
 *   today   – a planned day that is today and has no session yet
 *   planned – a planned day still ahead
 *   rest    – an unplanned day without a session (never "missed")
 * With no preferred days chosen, no day is planned and nothing can be missed.
 */
export function weekSchedule(sessions: CardioSession[], goals: CardioGoals, date: string, weekStartsOn: number, now = today()): { days: ScheduleDay[]; planned: number; completedPlanned: number; missed: number; remainingSessions: number } {
  const dates = weekDates(startOfWeek(date, weekStartsOn));
  const all = uniqueSessions(sessions);
  const days = dates.map((d): ScheduleDay => {
    const s = all.filter((x) => x.date === d);
    const wd = weekday(d);
    const planned = goals.days.includes(wd);
    const minutes = s.reduce((a, x) => a + x.durationMin, 0);
    const status: DayStatus = s.length ? (planned ? 'done' : 'extra') : !planned ? 'rest' : d < now ? 'missed' : d === now ? 'today' : 'planned';
    return { date: d, weekday: wd, planned, minutes, sessions: s.length, status };
  });
  const set = new Set(dates);
  const count = all.filter((x) => set.has(x.date)).length;
  return {
    days,
    planned: days.filter((d) => d.planned).length,
    completedPlanned: days.filter((d) => d.status === 'done').length,
    missed: days.filter((d) => d.status === 'missed').length,
    remainingSessions: Math.max(0, goals.weeklySessions - count)
  };
}

/* ------------------------------------------------------------------ history and reports */

export interface PeriodReport {
  key: string; start: string; end: string;
  minutes: number; sessions: number; distanceKm: number; avgSessionMin: number | null;
  goalMin: number; goalPct: number | null;
}

function period(sessions: CardioSession[], key: string, dates: string[], goalMin: number): PeriodReport {
  const set = new Set(dates);
  const s = sessions.filter((x) => set.has(x.date));
  const minutes = s.reduce((a, x) => a + x.durationMin, 0);
  return {
    key, start: dates[0], end: dates[dates.length - 1],
    minutes, sessions: s.length,
    distanceKm: Math.round(s.reduce((a, x) => a + (x.distanceKm ?? 0), 0) * 100) / 100,
    avgSessionMin: s.length ? r1(minutes / s.length) : null,
    goalMin, goalPct: pctOf(minutes, goalMin)
  };
}

/** The last `n` calendar weeks (oldest first), each with its own goal (weekly minutes). */
export function weeklyHistory(sessions: CardioSession[], goals: CardioGoals, date: string, weekStartsOn: number, n = 8): PeriodReport[] {
  const all = uniqueSessions(sessions);
  const cur = startOfWeek(date, weekStartsOn);
  return Array.from({ length: n }, (_, i) => {
    const start = addDays(cur, -7 * (n - 1 - i));
    return period(all, start, weekDates(start), goals.weeklyMin);
  });
}

/** The last `n` calendar months (oldest first); the month goal is the weekly goal × days in the month ÷ 7. */
export function monthlyHistory(sessions: CardioSession[], goals: CardioGoals, date: string, n = 6): PeriodReport[] {
  const all = uniqueSessions(sessions);
  const out: PeriodReport[] = [];
  let m = monthKey(date);
  for (let i = 0; i < n; i++) {
    const dates = monthDates(m);
    out.unshift(period(all, m, dates, Math.round((goals.weeklyMin * dates.length) / 7)));
    m = addMonths(m, -1);
  }
  return out;
}

/** Change versus the previous period (null when the previous period had nothing to compare with). */
export function compare(cur: PeriodReport, prev: PeriodReport | undefined) {
  if (!prev) return { minutesDelta: null, pctChange: null };
  return { minutesDelta: cur.minutes - prev.minutes, pctChange: prev.minutes > 0 ? r1(((cur.minutes - prev.minutes) / prev.minutes) * 100) : null };
}
