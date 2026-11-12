/**
 * Strategy history and results. Each time a diet strategy is applied or removed, the open period is closed and a new
 * one starts (kv key 'dietHistory', synced like other settings data; nothing else is changed). Results of a period are
 * computed from the user's own records over that period: 7-day weight averages, waist, lift trends, check-ins
 * (hunger, recovery, strength) and calorie / protein adherence.
 */
import { addDays, today } from './dates';
import type { DietMode } from './dietStrategy';
import type { CheckIn } from './goalAdvisor';
import { kvSet } from './repo';
import { buildPeriod, rollingWeightAverage, type DataBundle } from './reports';
import { exerciseHistory } from './trainingCoach';
import { db } from './db';
import type { WorkoutSession } from './workouts';

export const DIET_HISTORY_KEY = 'dietHistory';
export interface StrategyPeriod { mode: DietMode | 'none'; start: string; end?: string; kcal: number }

/** Minimum and recommended length of a strategy trial before judging it (days). */
export const TRIAL_MIN_DAYS = 14;
export const TRIAL_FULL_DAYS = 21;

export async function readHistory(): Promise<StrategyPeriod[]> {
  return ((await db.kv.get(DIET_HISTORY_KEY))?.value as StrategyPeriod[] | undefined) ?? [];
}

/** Closes the open period (if any) and starts a new one. Called when a strategy is applied or undone. */
export async function recordStrategyChange(mode: DietMode | 'none', kcal: number, date = today()) {
  const h = await readHistory();
  const open = h.length ? h[h.length - 1] : undefined;
  if (open && !open.end) {
    if (open.start === date) h.pop(); // changed again the same day: replace instead of keeping a 0-day period
    else open.end = addDays(date, -1);
  }
  h.push({ mode, start: date, kcal });
  await kvSet(DIET_HISTORY_KEY, h.slice(-24));
}

/** Current period, also for a strategy applied before history existed (its applied date is used). */
export function currentPeriod(history: StrategyPeriod[], strategy?: { mode: DietMode; appliedAt: number; kcal: number }): StrategyPeriod | null {
  const open = history.length && !history[history.length - 1].end ? history[history.length - 1] : null;
  if (open) return open;
  if (strategy?.appliedAt) return { mode: strategy.mode, start: new Date(strategy.appliedAt).toISOString().slice(0, 10), kcal: strategy.kcal };
  return null;
}

export interface PeriodResult {
  period: StrategyPeriod;
  days: number;
  /** 7-day average weight at the start and at the end of the period, and the change per week between them. */
  weightStart: number | null; weightEnd: number | null; ratePerWeek: number | null;
  waistChange: number | null;
  adherencePct: number | null; proteinPct: number | null; completeDays: number;
  hunger: number | null; recovery: number | null;
  strength: { up: number; down: number };
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function periodResult(p: StrategyPeriod, data: DataBundle, workouts: WorkoutSession[], checkins: CheckIn[], now = today()): PeriodResult {
  const end = p.end ?? now;
  const days = Math.max(1, Math.round((new Date(end + 'T12:00').getTime() - new Date(p.start + 'T12:00').getTime()) / 86400000) + 1);
  const dates = Array.from({ length: Math.min(days, 120) }, (_, i) => addDays(end, -i)).reverse();
  const rep = buildPeriod('month', '', dates, data, now);
  // weight: 7-day averages (first week of the period vs its last week), never single weigh-ins
  const ws = days >= 14 ? rollingWeightAverage(data.body, addDays(p.start, 6)) : null;
  const we = days >= 14 ? rollingWeightAverage(data.body, end) : null;
  const ratePerWeek = ws !== null && we !== null ? Math.round(((we - ws) / ((days - 7) / 7)) * 100) / 100 : null;
  const waists = data.body.filter((b) => b.waist && !b.deleted && b.date >= p.start && b.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const waistChange = waists.length >= 2 ? Math.round((waists[waists.length - 1].waist! - waists[0].waist!) * 10) / 10 : null;
  const ci = checkins.filter((c) => c.week >= p.start && c.week <= end);
  // strength: best estimated 1RM per exercise in the first half vs the second half of the period
  const mid = addDays(p.start, Math.floor(days / 2));
  const ids = [...new Set(workouts.filter((w) => w.date >= p.start && w.date <= end).flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
  let up = 0, down = 0;
  for (const id of ids) {
    const h = exerciseHistory(id, workouts).filter((x) => x.date >= p.start && x.date <= end);
    const a = h.filter((x) => x.date < mid).map((x) => x.bestE1rm), b = h.filter((x) => x.date >= mid).map((x) => x.bestE1rm);
    if (a.length && b.length) { const d = (Math.max(...b) - Math.max(...a)) / Math.max(...a); if (d > 0.02) up++; else if (d < -0.02) down++; }
  }
  return {
    period: p, days, weightStart: ws, weightEnd: we, ratePerWeek, waistChange,
    adherencePct: rep.completeDays ? Math.round((rep.caloriesInRangeDays / rep.completeDays) * 100) : null,
    proteinPct: rep.completeDays ? Math.round((rep.proteinHitDays / rep.completeDays) * 100) : null, completeDays: rep.completeDays,
    hunger: avg(ci.map((c) => c.hunger)), recovery: avg(ci.map((c) => c.recovery)), strength: { up, down }
  };
}
