import { addDays } from './dates';
import { round } from './nutrition';
import { buildPeriod, rollingWeightAverage, weightTrend, type DataBundle } from './reports';

export type InsightLevel = 'good' | 'warn' | 'info';
export interface Insight {
  key: string; // i18n key under insights.*
  level: InsightLevel;
  params: Record<string, string | number>;
}

const MIN_DAYS = 3;

/**
 * Generates observations strictly from saved data. Every insight states the numbers it is based on.
 * Weight-based advice uses 7-day averages only; single weigh-ins are never interpreted as fat change.
 */
export function generateInsights(data: DataBundle, date: string): Insight[] {
  const out: Insight[] = [];
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(date, -6 + i));
  const prev7 = last7.map((d) => addDays(d, -7));
  const cur = buildPeriod('week', 'last7', last7, data, addDays(date, 1));
  const prev = buildPeriod('week', 'prev7', prev7, data, addDays(date, 1));
  const tol = data.settings.tolerance;

  if (cur.partialDays > 0) out.push({ key: 'partialDays', level: 'info', params: { n: cur.partialDays } });

  if (cur.completeDays < MIN_DAYS || !cur.averages || !cur.averageTarget) {
    out.push({ key: 'notEnoughData', level: 'info', params: { n: cur.completeDays, min: MIN_DAYS } });
  } else {
    const a = cur.averages;
    const t = cur.averageTarget;
    const n = cur.completeDays;
    if (a.protein < t.protein * (1 - tol.proteinPct / 100))
      out.push({ key: 'proteinLow', level: 'warn', params: { avg: a.protein, target: t.protein, gap: round(t.protein - a.protein, 0), n } });
    else out.push({ key: 'proteinOk', level: 'good', params: { avg: a.protein, target: t.protein, n } });

    if (a.kcal > t.kcal * (1 + tol.caloriePct / 100))
      out.push({ key: 'caloriesHigh', level: 'warn', params: { avg: a.kcal, target: t.kcal, n } });
    else if (a.kcal < t.kcal * (1 - tol.caloriePct / 100))
      out.push({ key: 'caloriesLow', level: 'warn', params: { avg: a.kcal, target: t.kcal, n } });
    else out.push({ key: 'caloriesOk', level: 'good', params: { avg: a.kcal, target: t.kcal, n } });

    const complete = cur.days.filter((d) => d.status === 'complete');
    const fatHighDays = complete.filter((d) => d.totals.fat > d.target.fat * 1.1).length;
    if (fatHighDays / n >= 0.6) out.push({ key: 'fatHigh', level: 'warn', params: { days: fatHighDays, n, avg: a.fat, target: t.fat } });
    else if (Math.abs(a.fat - t.fat) <= t.fat * 0.1) out.push({ key: 'fatOk', level: 'good', params: { avg: a.fat, target: t.fat } });

    if (Math.abs(a.carbs - t.carbs) <= t.carbs * 0.1) out.push({ key: 'carbsOk', level: 'good', params: { avg: a.carbs, target: t.carbs } });
    else out.push({ key: a.carbs > t.carbs ? 'carbsHigh' : 'carbsLow', level: 'info', params: { avg: a.carbs, target: t.carbs } });

    if (prev.calorieConsistencyPct !== null && cur.calorieConsistencyPct !== null && prev.completeDays >= MIN_DAYS) {
      const d = cur.calorieConsistencyPct - prev.calorieConsistencyPct;
      if (d >= 10) out.push({ key: 'consistencyUp', level: 'good', params: { cur: cur.calorieConsistencyPct, prev: prev.calorieConsistencyPct } });
      else if (d <= -10) out.push({ key: 'consistencyDown', level: 'warn', params: { cur: cur.calorieConsistencyPct, prev: prev.calorieConsistencyPct } });
    }
  }

  // Weight trend (weekly averages only)
  const trend = weightTrend(data.body, date);
  if (trend.direction === 'insufficient') out.push({ key: 'weightInsufficient', level: 'info', params: {} });
  else {
    out.push({ key: `weight_${trend.direction}`, level: 'info', params: { change: trend.change!, cur: trend.current!, prev: trend.previous! } });
    const goal = data.settings.profile.weeklyChangeKg;
    const prevTrend = weightTrend(data.body, addDays(date, -7));
    const goodAdherence = (cur.calorieConsistencyPct ?? 0) >= 70 && cur.completeDays >= 5;
    if (goal < 0 && trend.direction === 'stable' && prevTrend.direction === 'stable' && goodAdherence)
      out.push({ key: 'plateauSuggestion', level: 'warn', params: {} });
    else if (goal < 0 && trend.direction === 'down' && trend.change! < goal * 2 && trend.change! < -1)
      out.push({ key: 'lossTooFast', level: 'warn', params: { change: trend.change!, goal } });
    else if (goal < 0 && trend.direction === 'up' && goodAdherence)
      out.push({ key: 'gainWhileCutting', level: 'info', params: { change: trend.change! } });
  }

  // Single weigh-in vs 7-day average — explicitly framed as fluctuation
  const latest = [...data.body].filter((b) => b.weight && b.date <= date).sort((x, y) => y.date.localeCompare(x.date))[0];
  const roll = rollingWeightAverage(data.body, date);
  if (latest && roll !== null && Math.abs(latest.weight! - roll) >= 0.8)
    out.push({ key: 'fluctuation', level: 'info', params: { weight: latest.weight!, avg: roll } });

  return out;
}
