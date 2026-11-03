import { addDays, addMonths, monthDates, startOfWeek, today, weekDates } from './dates';
import { round, roundMacros, sumMacros } from './nutrition';
import { dayTypeFor, targetsFor } from './targets';
import type { BodyEntry, DayLog, DayType, DiaryEntry, Macros, MealType, Settings } from './types';

export type DayStatus = 'complete' | 'partial' | 'empty';

export interface DaySummary {
  date: string;
  status: DayStatus;
  dayType: DayType;
  totals: Macros;
  target: Macros;
  entryCount: number;
  mealsLogged: number;
  byMeal: Record<MealType, Macros>;
  calorieInRange: boolean;
  proteinHit: boolean;
  overCalories: boolean;
  /** 0..100: share of the four macro goals that are within tolerance. */
  score: number;
}

export interface DataBundle {
  entries: DiaryEntry[];
  days: DayLog[];
  body: BodyEntry[];
  settings: Settings;
}

const z = (): Macros => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 });

/**
 * Status rules (a day with no entries is NEVER counted as a zero-calorie day):
 *  - empty: no entries.
 *  - partial: has entries and either was marked partial, or is today/future and not marked complete,
 *             or auto-complete of past days is disabled and it wasn't marked complete.
 *  - complete: marked complete, or a past day with entries when auto-complete is on.
 */
export function dayStatus(date: string, entryCount: number, log: DayLog | undefined, settings: Settings, now = today()): DayStatus {
  if (entryCount === 0) return 'empty';
  if (log?.status) return log.status;
  if (settings.autoCompletePastDays && date < now) return 'complete';
  return 'partial';
}

export function summarizeDay(date: string, entries: DiaryEntry[], log: DayLog | undefined, settings: Settings, now = today()): DaySummary {
  const list = entries.filter((e) => e.date === date && !e.deleted);
  const byMeal: Record<MealType, Macros> = { breakfast: z(), lunch: z(), dinner: z(), snacks: z() };
  for (const e of list) byMeal[e.meal] = sumMacros([byMeal[e.meal], e.macros]);
  for (const k of Object.keys(byMeal) as MealType[]) byMeal[k] = roundMacros(byMeal[k]);
  const totals = roundMacros(sumMacros(list.map((e) => e.macros)));
  const target = targetsFor(date, settings, log);
  const tol = settings.tolerance;
  const calorieInRange = list.length > 0 && Math.abs(totals.kcal - target.kcal) <= (target.kcal * tol.caloriePct) / 100;
  const proteinHit = list.length > 0 && totals.protein >= target.protein * (1 - tol.proteinPct / 100);
  const overCalories = list.length > 0 && totals.kcal > target.kcal * (1 + tol.caloriePct / 100);
  const within = (v: number, t: number) => t <= 0 || Math.abs(v - t) <= t * 0.1;
  const score = list.length
    ? Math.round(([calorieInRange, proteinHit, within(totals.carbs, target.carbs), within(totals.fat, target.fat)].filter(Boolean).length / 4) * 100)
    : 0;
  return {
    date, status: dayStatus(date, list.length, log, settings, now), dayType: dayTypeFor(date, settings, log), totals, target,
    entryCount: list.length, mealsLogged: (Object.keys(byMeal) as MealType[]).filter((m) => list.some((e) => e.meal === m)).length,
    byMeal, calorieInRange, proteinHit, overCalories, score
  };
}

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export interface WeightStats {
  start: number | null;
  end: number | null;
  average: number | null;
  count: number;
  points: { date: string; weight: number }[];
  waistStart: number | null;
  waistEnd: number | null;
  waistChange: number | null;
}

export function weightStats(body: BodyEntry[], dates: string[]): WeightStats {
  const set = new Set(dates);
  const inRange = body.filter((b) => set.has(b.date) && !b.deleted).sort((a, b) => a.date.localeCompare(b.date));
  const w = inRange.filter((b) => typeof b.weight === 'number') as (BodyEntry & { weight: number })[];
  const waist = inRange.filter((b) => typeof b.waist === 'number') as (BodyEntry & { waist: number })[];
  const average = avg(w.map((b) => b.weight));
  return {
    start: w.length ? w[0].weight : null,
    end: w.length ? w[w.length - 1].weight : null,
    average: average === null ? null : round(average, 2),
    count: w.length,
    points: w.map((b) => ({ date: b.date, weight: b.weight })),
    waistStart: waist.length ? waist[0].waist : null,
    waistEnd: waist.length ? waist[waist.length - 1].waist : null,
    waistChange: waist.length >= 2 ? round(waist[waist.length - 1].waist - waist[0].waist, 1) : null
  };
}

export interface PeriodReport {
  kind: 'week' | 'month';
  label: string;
  dates: string[];
  days: DaySummary[];
  completeDays: number;
  partialDays: number;
  emptyDays: number;
  /** Days used for averages: complete days (partial days are excluded so they don't drag averages down). */
  basisDays: number;
  averages: Macros | null;
  averageTarget: Macros | null;
  caloriesInRangeDays: number;
  proteinHitDays: number;
  overCalorieDays: number;
  calorieConsistencyPct: number | null;
  proteinConsistencyPct: number | null;
  goalCompletionPct: number | null;
  weight: WeightStats;
  bestDays: DaySummary[];
}

export function buildPeriod(kind: 'week' | 'month', label: string, dates: string[], data: DataBundle, now = today()): PeriodReport {
  const logs = new Map(data.days.map((d) => [d.date, d]));
  const byDate = new Map<string, DiaryEntry[]>();
  for (const e of data.entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  const days = dates.map((d) => summarizeDay(d, byDate.get(d) ?? [], logs.get(d), data.settings, now));
  const complete = days.filter((d) => d.status === 'complete');
  const n = complete.length;
  const averages = n ? roundMacros({
    kcal: avg(complete.map((d) => d.totals.kcal))!, protein: avg(complete.map((d) => d.totals.protein))!,
    carbs: avg(complete.map((d) => d.totals.carbs))!, fat: avg(complete.map((d) => d.totals.fat))!
  }) : null;
  const averageTarget = n ? roundMacros({
    kcal: avg(complete.map((d) => d.target.kcal))!, protein: avg(complete.map((d) => d.target.protein))!,
    carbs: avg(complete.map((d) => d.target.carbs))!, fat: avg(complete.map((d) => d.target.fat))!
  }) : null;
  const calIn = complete.filter((d) => d.calorieInRange).length;
  const protHit = complete.filter((d) => d.proteinHit).length;
  const both = complete.filter((d) => d.calorieInRange && d.proteinHit).length;
  return {
    kind, label, dates, days,
    completeDays: n,
    partialDays: days.filter((d) => d.status === 'partial').length,
    emptyDays: days.filter((d) => d.status === 'empty').length,
    basisDays: n,
    averages, averageTarget,
    caloriesInRangeDays: calIn,
    proteinHitDays: protHit,
    overCalorieDays: complete.filter((d) => d.overCalories).length,
    calorieConsistencyPct: n ? Math.round((calIn / n) * 100) : null,
    proteinConsistencyPct: n ? Math.round((protHit / n) * 100) : null,
    goalCompletionPct: n ? Math.round((both / n) * 100) : null,
    weight: weightStats(data.body, dates),
    bestDays: [...complete].sort((a, b) => b.score - a.score || Math.abs(a.totals.kcal - a.target.kcal) - Math.abs(b.totals.kcal - b.target.kcal)).slice(0, 3)
  };
}

export function weekReport(anyDateInWeek: string, data: DataBundle, now = today()): PeriodReport {
  const start = startOfWeek(anyDateInWeek, data.settings.weekStartsOn);
  const dates = weekDates(start);
  return buildPeriod('week', `${dates[0]} → ${dates[6]}`, dates, data, now);
}

export function monthReport(month: string, data: DataBundle, now = today()): PeriodReport {
  return buildPeriod('month', month, monthDates(month), data, now);
}

export interface Comparison {
  current: PeriodReport;
  previous: PeriodReport;
  delta: {
    kcal: number | null; protein: number | null; carbs: number | null; fat: number | null;
    calorieConsistency: number | null; proteinConsistency: number | null; weightAvg: number | null;
  };
}

function diff(a: number | null | undefined, b: number | null | undefined, digits = 1): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return round(a - b, digits);
}

export function compare(current: PeriodReport, previous: PeriodReport): Comparison {
  return {
    current, previous,
    delta: {
      kcal: diff(current.averages?.kcal, previous.averages?.kcal, 0),
      protein: diff(current.averages?.protein, previous.averages?.protein),
      carbs: diff(current.averages?.carbs, previous.averages?.carbs),
      fat: diff(current.averages?.fat, previous.averages?.fat),
      calorieConsistency: diff(current.calorieConsistencyPct, previous.calorieConsistencyPct, 0),
      proteinConsistency: diff(current.proteinConsistencyPct, previous.proteinConsistencyPct, 0),
      weightAvg: diff(current.weight.average, previous.weight.average, 2)
    }
  };
}

export function weekComparison(anyDate: string, data: DataBundle, now = today()): Comparison {
  const cur = weekReport(anyDate, data, now);
  const prev = weekReport(addDays(cur.dates[0], -7), data, now);
  return compare(cur, prev);
}

export function monthComparison(month: string, data: DataBundle, now = today()): Comparison {
  return compare(monthReport(month, data, now), monthReport(addMonths(month, -1), data, now));
}

/** Rolling average of weights for the N days ending at `date` (inclusive). */
export function rollingWeightAverage(body: BodyEntry[], date: string, days = 7): number | null {
  const from = addDays(date, -(days - 1));
  const w = body.filter((b) => b.date >= from && b.date <= date && typeof b.weight === 'number').map((b) => b.weight!);
  const a = avg(w);
  return a === null ? null : round(a, 2);
}

export type TrendDirection = 'down' | 'up' | 'stable' | 'insufficient';

/**
 * Weight trend from weekly averages (never from a single weigh-in).
 * Requires at least 2 weigh-ins in each of the two compared 7-day windows.
 */
export function weightTrend(body: BodyEntry[], date: string, threshold = 0.2): { direction: TrendDirection; change: number | null; current: number | null; previous: number | null } {
  const cur = body.filter((b) => b.date > addDays(date, -7) && b.date <= date && b.weight);
  const prev = body.filter((b) => b.date > addDays(date, -14) && b.date <= addDays(date, -7) && b.weight);
  if (cur.length < 2 || prev.length < 2) return { direction: 'insufficient', change: null, current: avg(cur.map((b) => b.weight!)), previous: avg(prev.map((b) => b.weight!)) };
  const c = avg(cur.map((b) => b.weight!))!;
  const p = avg(prev.map((b) => b.weight!))!;
  const change = round(c - p, 2);
  return { direction: Math.abs(change) < threshold ? 'stable' : change < 0 ? 'down' : 'up', change, current: round(c, 2), previous: round(p, 2) };
}
