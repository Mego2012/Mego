/**
 * Flexible calorie budget: daily target, weekly budget and monthly budget computed from the SAME logged meals.
 *
 * - The budget of a period = the sum of each day's own calorie target (targetsFor: per-day override, carb cycling,
 *   training/rest day). With a fixed 2,110 kcal that is 7 × 2,110 = 14,770 a week and 2,110 × (calendar days) a
 *   month (28, 29, 30 or 31). A custom weekly / monthly number can be set instead.
 * - Consumed = the sum of the diary entries of the days of the period (each entry belongs to exactly one date, so
 *   weekly and monthly totals use the same entries and nothing is counted twice).
 * - Days without any logged meal are NOT zero-calorie days: a past day with nothing logged is reported as
 *   "not logged" and its target is left out of the budget that is tracked (otherwise the unknown intake would look
 *   like a large saving).
 * - Going above the daily target is never a failure: the difference simply comes off the remaining weekly/monthly
 *   budget. Targets are never changed. An optional suggested daily allowance for the remaining days is shown, but it
 *   never goes below a safe floor (resting rate / 1,500 men / 1,200 women) nor more than the flexibility limit
 *   below the normal target — when that is not enough to finish on budget, the app says so neutrally and suggests
 *   simply continuing with the normal target. When under budget the suggestion is the normal target (spare budget is
 *   shown, never pushed to be eaten).
 * - Protein is a DAILY target: it is reported per day and never carried over between days.
 * - Exercise calories are not added to budgets (budgets stay fixed; the cardio setting only affects the daily dial).
 * - Target history: when the targets change, the previous targets are kept in kv 'targetHistory' so earlier periods
 *   keep the targets that applied then (history is recorded from the first change after this feature).
 */
import { addDays, monthDates, startOfWeek, today, weekDates } from './dates';
import { dayFloor, type DietStrategy } from './dietStrategy';
import { dayStatus, type DataBundle, type DayStatus } from './reports';
import { targetsFor } from './targets';
import type { DayLog, DiaryEntry, Macros, Settings } from './types';

/* ------------------------------------------------------------------ settings */

export interface BudgetSettings {
  /** Soft guideline: how many kcal above the daily target still counts as "within flexibility". null = off. */
  flexKcal: number | null;
  weekMethod: 'auto' | 'custom';
  weekCustom?: number | null;
  monthMethod: 'auto' | 'custom';
  monthCustom?: number | null;
  /** Show the optional suggested daily allowance for the remaining days. */
  suggestions: boolean;
}
export const DEFAULT_BUDGET: BudgetSettings = { flexKcal: 300, weekMethod: 'auto', weekCustom: null, monthMethod: 'auto', monthCustom: null, suggestions: true };
export function budgetSettings(s: Pick<Settings, 'budget'>): BudgetSettings {
  return { ...DEFAULT_BUDGET, ...(s.budget ?? {}) };
}

/* ------------------------------------------------------------------ target history */

export const TARGET_HISTORY_KEY = 'targetHistory';
/** Targets in force from `from` (inclusive) until the next entry. */
export interface TargetHistoryEntry { from: string; targets: Settings['targets']; dietStrategy?: DietStrategy | null; trainingWeekdays?: number[] }

/**
 * The history after a change of targets made today: the first change also records the targets that applied
 * before it (from the beginning), and several changes on the same day keep only the last one.
 */
export function withTargetChange(history: TargetHistoryEntry[], before: Settings, after: Settings, on = today()): TargetHistoryEntry[] {
  const snap = (s: Settings, from: string): TargetHistoryEntry => ({ from, targets: structuredClone(s.targets), dietStrategy: s.dietStrategy ? structuredClone(s.dietStrategy) : null, trainingWeekdays: [...s.trainingWeekdays] });
  const list = history.length ? [...history] : [snap(before, '0000-01-01')];
  const last = list[list.length - 1];
  if (last.from === on) list[list.length - 1] = snap(after, on);
  else list.push(snap(after, on));
  return list;
}

export function targetsChanged(a: Settings, b: Settings): boolean {
  return JSON.stringify(a.targets) !== JSON.stringify(b.targets) || JSON.stringify(a.dietStrategy ?? null) !== JSON.stringify(b.dietStrategy ?? null)
    || JSON.stringify(a.trainingWeekdays) !== JSON.stringify(b.trainingWeekdays);
}

/** Settings with the targets that were in force on `date` (current settings when there is no history yet). */
export function settingsOn(date: string, settings: Settings, history: TargetHistoryEntry[] = []): Settings {
  let h: TargetHistoryEntry | undefined;
  for (const e of history) if (e.from <= date) h = e;
  if (!h) return settings;
  return { ...settings, targets: h.targets, dietStrategy: h.dietStrategy ?? undefined, trainingWeekdays: h.trainingWeekdays ?? settings.trainingWeekdays };
}

export function targetOn(date: string, settings: Settings, log: DayLog | undefined, history: TargetHistoryEntry[] = []): Macros {
  return targetsFor(date, settingsOn(date, settings, history), log);
}

/* ------------------------------------------------------------------ budget */

export interface BudgetDay {
  date: string;
  target: Macros;
  /** null = nothing logged on this day (not the same as eating 0 kcal). */
  consumed: Macros | null;
  status: DayStatus;
  past: boolean;
  isToday: boolean;
  future: boolean;
  /** consumed − target kcal (null when not logged). Positive = above the daily target. */
  diff: number | null;
  aboveTarget: boolean;
  /** above target + flexibility limit (only when a limit is set). */
  aboveFlex: boolean;
  proteinHit: boolean;
}

export interface Suggestion {
  /** suggested average per remaining day (today included) */
  perDay: number;
  /** what would be needed to end exactly on budget */
  exact: number;
  days: number;
  /** 'floor' = full compensation would go below the safe limit; 'room' = under budget (suggestion = normal target); null = fine */
  note: 'floor' | 'room' | null;
  normalTarget: number;
}

export interface WeekPart { start: string; dates: string[]; target: number; consumed: number; loggedDays: number }

export interface Budget {
  kind: 'week' | 'month';
  dates: string[];
  days: BudgetDay[];
  /** budget for the whole period (auto: sum of daily targets; or the custom number) */
  budget: number;
  /** budget of the days that count: all days except past days with nothing logged */
  trackedBudget: number;
  consumed: number;
  remaining: number;
  /** consumed ÷ tracked budget, % */
  usedPct: number;
  /** consumed ÷ budget of the logged days, % (100 = exactly on target so far) */
  pacePct: number | null;
  averageDaily: number | null;
  loggedDays: number;
  unloggedPastDays: number;
  remainingDays: number;
  daysAbove: number;
  daysBelow: number;
  daysAboveFlex: number;
  exceeded: boolean;
  suggestion: Suggestion | null;
  protein: { average: number | null; target: number; daysHit: number; loggedDays: number };
  weeks: WeekPart[];
  method: 'auto' | 'custom';
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const r0 = (x: number) => Math.round(x);

export function computeBudget(kind: 'week' | 'month', dates: string[], data: DataBundle, history: TargetHistoryEntry[] = [], now = today()): Budget {
  const s = data.settings;
  const bs = budgetSettings(s);
  const logs = new Map(data.days.map((d) => [d.date, d]));
  const byDate = new Map<string, DiaryEntry[]>();
  for (const e of data.entries) if (!e.deleted) { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date)!.push(e); }
  const flex = bs.flexKcal && bs.flexKcal > 0 ? bs.flexKcal : null;
  const tol = s.tolerance?.proteinPct ?? 5;
  const days: BudgetDay[] = dates.map((date) => {
    const list = byDate.get(date) ?? [];
    const target = targetOn(date, s, logs.get(date), history);
    const consumed = list.length ? {
      kcal: r0(sum(list.map((e) => e.macros.kcal))), protein: Math.round(sum(list.map((e) => e.macros.protein)) * 10) / 10,
      carbs: Math.round(sum(list.map((e) => e.macros.carbs)) * 10) / 10, fat: Math.round(sum(list.map((e) => e.macros.fat)) * 10) / 10
    } : null;
    const diff = consumed ? consumed.kcal - target.kcal : null;
    return {
      date, target, consumed, status: dayStatus(date, list.length, logs.get(date), s, now, consumed?.kcal ?? 0, target.kcal),
      past: date < now, isToday: date === now, future: date > now, diff,
      aboveTarget: diff !== null && diff > 0, aboveFlex: diff !== null && flex !== null && diff > flex,
      proteinHit: !!consumed && consumed.protein >= target.protein * (1 - tol / 100)
    };
  });
  const autoBudget = sum(days.map((d) => d.target.kcal));
  const custom = kind === 'week' ? (bs.weekMethod === 'custom' ? bs.weekCustom : null) : (bs.monthMethod === 'custom' ? bs.monthCustom : null);
  const budget = custom && custom > 0 ? r0(custom) : autoBudget;
  const scale = autoBudget > 0 ? budget / autoBudget : 1;
  const unlogged = days.filter((d) => d.past && !d.consumed);
  const trackedBudget = r0(budget - sum(unlogged.map((d) => d.target.kcal)) * scale);
  const logged = days.filter((d) => d.consumed);
  const consumed = r0(sum(logged.map((d) => d.consumed!.kcal)));
  const remaining = trackedBudget - consumed;
  const loggedTarget = sum(logged.map((d) => d.target.kcal)) * scale;
  // remaining days: today (whether or not something is logged yet) and the future days of the period
  const rest = days.filter((d) => d.isToday || d.future);
  let suggestion: Suggestion | null = null;
  if (bs.suggestions && rest.length) {
    const consumedToday = sum(rest.filter((d) => d.isToday && d.consumed).map((d) => d.consumed!.kcal));
    const exact = r0((remaining + consumedToday) / rest.length);
    const normal = r0((sum(rest.map((d) => d.target.kcal)) * scale) / rest.length);
    const band = flex ?? Math.round(normal * 0.15);
    const lower = Math.max(dayFloor(s.profile), normal - band);
    // under budget: the suggestion stays at the normal target — spare budget is shown, never pushed to be eaten
    const perDay = Math.min(normal, Math.max(lower, exact));
    suggestion = { perDay: r0(perDay), exact, days: rest.length, note: exact < lower ? 'floor' : exact > normal + 50 ? 'room' : null, normalTarget: normal };
  }
  const proteinDays = logged;
  const weeks: WeekPart[] = [];
  if (kind === 'month') {
    for (const d of days) {
      const start = startOfWeek(d.date, s.weekStartsOn);
      let w = weeks.find((x) => x.start === start);
      if (!w) { w = { start, dates: [], target: 0, consumed: 0, loggedDays: 0 }; weeks.push(w); }
      w.dates.push(d.date); w.target += d.target.kcal * scale;
      if (d.consumed) { w.consumed += d.consumed.kcal; w.loggedDays++; }
    }
    for (const w of weeks) { w.target = r0(w.target); w.consumed = r0(w.consumed); }
  }
  return {
    kind, dates, days, budget, trackedBudget, consumed, remaining,
    usedPct: trackedBudget > 0 ? Math.round((consumed / trackedBudget) * 100) : 0,
    pacePct: loggedTarget > 0 ? Math.round((consumed / loggedTarget) * 100) : null,
    averageDaily: logged.length ? r0(consumed / logged.length) : null,
    loggedDays: logged.length, unloggedPastDays: unlogged.length, remainingDays: rest.length,
    daysAbove: logged.filter((d) => d.aboveTarget).length, daysBelow: logged.filter((d) => !d.aboveTarget).length,
    daysAboveFlex: logged.filter((d) => d.aboveFlex).length,
    exceeded: remaining < 0, suggestion,
    protein: {
      average: proteinDays.length ? Math.round((sum(proteinDays.map((d) => d.consumed!.protein)) / proteinDays.length) * 10) / 10 : null,
      target: days.length ? Math.round(sum(days.map((d) => d.target.protein)) / days.length) : 0,
      daysHit: proteinDays.filter((d) => d.proteinHit).length, loggedDays: proteinDays.length
    },
    weeks,
    method: custom && custom > 0 ? 'custom' : 'auto'
  };
}

export function weekBudget(anyDate: string, data: DataBundle, history: TargetHistoryEntry[] = [], now = today()): Budget {
  return computeBudget('week', weekDates(startOfWeek(anyDate, data.settings.weekStartsOn)), data, history, now);
}
export function monthBudget(month: string, data: DataBundle, history: TargetHistoryEntry[] = [], now = today()): Budget {
  return computeBudget('month', monthDates(month), data, history, now);
}
/** Number of calendar days in a month (YYYY-MM). */
export const daysInMonth = (month: string) => monthDates(month).length;
export { addDays };
