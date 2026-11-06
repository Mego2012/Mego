import { addDays, addMonths, monthDates, startOfWeek, today, weekDates } from './dates';
import { round, roundMacros, sumMacros } from './nutrition';
import { dayTypeFor, targetsFor } from './targets';
import { OPTIONAL_NUTRIENTS, type BodyEntry, type DayLog, type DayType, type DiaryEntry, type Macros, type MealType, type OptionalNutrient, type Settings } from './types';

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
  remaining: Macros;
  waterMl: number;
  /** How many entries carry each optional nutrient (fiber/sugar/sodium are often unknown). */
  coverage: Record<OptionalNutrient, number>;
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
 *  - manual override (complete/partial) always wins.
 *  - complete (automatic): a past day whose calories reach `completeThresholdPct` of the target
 *    (default 60%) — so a day with only a snack logged is not mistaken for a full day.
 *  - otherwise partial (today is partial until marked complete).
 */
export function dayStatus(date: string, entryCount: number, log: DayLog | undefined, settings: Settings, now = today(), kcal = Infinity, targetKcal = 0): DayStatus {
  if (entryCount === 0) return 'empty';
  if (log?.status) return log.status;
  const threshold = (settings.completeThresholdPct ?? 60) / 100;
  if (settings.autoCompletePastDays && date < now && kcal >= targetKcal * threshold) return 'complete';
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
  const within = (v: number, t: number) => t <= 0 || Math.abs(v - t) <= (t * tol.caloriePct) / 100;
  const score = list.length
    ? Math.round(([calorieInRange, proteinHit, within(totals.carbs, target.carbs), within(totals.fat, target.fat)].filter(Boolean).length / 4) * 100)
    : 0;
  const coverage = Object.fromEntries(OPTIONAL_NUTRIENTS.map((k) => [k, list.filter((e) => typeof e.macros[k] === 'number').length])) as Record<OptionalNutrient, number>;
  return {
    date, status: dayStatus(date, list.length, log, settings, now, totals.kcal, target.kcal), dayType: dayTypeFor(date, settings, log), totals, target,
    entryCount: list.length, mealsLogged: (Object.keys(byMeal) as MealType[]).filter((m) => list.some((e) => e.meal === m)).length,
    byMeal, calorieInRange, proteinHit, overCalories, score,
    remaining: {
      kcal: round(target.kcal - totals.kcal, 0), protein: round(target.protein - totals.protein, 1),
      carbs: round(target.carbs - totals.carbs, 1), fat: round(target.fat - totals.fat, 1)
    },
    waterMl: log?.waterMl ?? 0,
    coverage
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
  worstDays: DaySummary[];
  /** Average water over days where water was logged. */
  avgWaterMl: number | null;
  waterDays: number;
  /** % of calories from protein / carbs / fat (from average macros). */
  macroSplit: { protein: number; carbs: number; fat: number } | null;
  /** Average fiber over complete days, only when every entry of those days had fiber data. */
  avgFiber: number | null;
  fiberCoveragePct: number;
  topFoods: { name: string; count: number; kcal: number; protein: number }[];
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
  const ranked = [...complete].sort((a, b) => b.score - a.score || Math.abs(a.totals.kcal - a.target.kcal) - Math.abs(b.totals.kcal - b.target.kcal));
  const waterDays = days.filter((d) => d.waterMl > 0);
  const split = averages && averages.kcal > 0 ? (() => {
    const p = averages.protein * 4, c = averages.carbs * 4, f = averages.fat * 9, tot = p + c + f;
    return tot > 0 ? { protein: Math.round((p / tot) * 100), carbs: Math.round((c / tot) * 100), fat: Math.round((f / tot) * 100) } : null;
  })() : null;
  const completeEntries = complete.flatMap((d) => byDate.get(d.date) ?? []);
  const withFiber = completeEntries.filter((e) => typeof e.macros.fiber === 'number').length;
  const fiberCoveragePct = completeEntries.length ? Math.round((withFiber / completeEntries.length) * 100) : 0;
  const avgFiber = n && fiberCoveragePct === 100 ? round(avg(complete.map((d) => d.totals.fiber ?? 0))!, 1) : null;
  const foodMap = new Map<string, { name: string; count: number; kcal: number; protein: number }>();
  for (const d of dates) for (const e of byDate.get(d) ?? []) {
    const k = e.name;
    const cur = foodMap.get(k) ?? { name: k, count: 0, kcal: 0, protein: 0 };
    cur.count++;
    cur.kcal += e.macros.kcal;
    cur.protein += e.macros.protein;
    foodMap.set(k, cur);
  }
  const topFoods = [...foodMap.values()].sort((a, b) => b.kcal - a.kcal).slice(0, 8).map((f) => ({ ...f, kcal: Math.round(f.kcal), protein: round(f.protein, 1) }));
  return {
    kind, label, dates, days,
    worstDays: ranked.length > 3 ? ranked.slice(-3).reverse() : [],
    avgWaterMl: waterDays.length ? Math.round(avg(waterDays.map((d) => d.waterMl))!) : null,
    waterDays: waterDays.length,
    macroSplit: split,
    avgFiber,
    fiberCoveragePct,
    topFoods,
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
    bestDays: ranked.slice(0, 3)
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

export interface ProgressEstimate {
  /** kg per week from a least-squares line through the last 28 days of weigh-ins. */
  ratePerWeek: number | null;
  ratePctPerWeek: number | null;
  weighIns: number;
  currentAvg: number | null;
  remainingKg: number | null;
  weeksToTarget: number | null;
  etaDate: string | null;
  /** fast = faster than ~1% of body weight per week (muscle-loss risk). */
  pace: 'insufficient' | 'away' | 'stable' | 'healthy' | 'fast';
}

/** Honest projection: requires ≥ 6 weigh-ins over ≥ 14 days; never extrapolates from single readings. */
export function progressEstimate(body: BodyEntry[], targetWeight: number, date = today()): ProgressEstimate {
  const from = addDays(date, -27);
  const pts = body.filter((b) => b.weight && b.date >= from && b.date <= date && !b.deleted).sort((a, b) => a.date.localeCompare(b.date));
  const empty: ProgressEstimate = { ratePerWeek: null, ratePctPerWeek: null, weighIns: pts.length, currentAvg: rollingWeightAverage(body, date), remainingKg: null, weeksToTarget: null, etaDate: null, pace: 'insufficient' };
  if (pts.length < 6) return empty;
  const t0 = new Date(pts[0].date + 'T12:00').getTime();
  const xs = pts.map((p) => (new Date(p.date + 'T12:00').getTime() - t0) / 86400000);
  if (xs[xs.length - 1] < 14) return empty;
  const ys = pts.map((p) => p.weight!);
  const mx = avg(xs)!, my = avg(ys)!;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const ratePerWeek = round(slope * 7, 2);
  const cur = rollingWeightAverage(body, date) ?? ys[ys.length - 1];
  const remainingKg = round(targetWeight - cur, 1);
  const ratePct = round((ratePerWeek / cur) * 100, 2);
  let pace: ProgressEstimate['pace'] = 'stable';
  if (Math.abs(ratePerWeek) < 0.1) pace = 'stable';
  else if (Math.sign(ratePerWeek) !== Math.sign(remainingKg) && Math.abs(remainingKg) > 0.3) pace = 'away';
  else pace = Math.abs(ratePct) > 1 ? 'fast' : 'healthy';
  let weeksToTarget: number | null = null;
  let etaDate: string | null = null;
  if ((pace === 'healthy' || pace === 'fast') && Math.abs(remainingKg) > 0.2) {
    weeksToTarget = Math.ceil(Math.abs(remainingKg / ratePerWeek));
    if (weeksToTarget <= 156) etaDate = addDays(date, weeksToTarget * 7);
    else weeksToTarget = null;
  }
  return { ratePerWeek, ratePctPerWeek: ratePct, weighIns: pts.length, currentAvg: cur, remainingKg, weeksToTarget, etaDate, pace };
}
