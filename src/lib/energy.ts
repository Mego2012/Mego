/**
 * Smart cardio → calorie target. Transparent, configurable, never applied to saved targets.
 *
 * Why not "eat back every cardio calorie":
 *  1. Double counting — the base target comes from a TDEE that already includes an activity multiplier. For any
 *     activity level above "sedentary", the user's PLANNED weekly cardio (Goals) is treated as already included.
 *  2. Resting energy — during exercise the body would have burned ~1 MET anyway, so only NET energy
 *     ((MET − 1) × kg × h) is additional expenditure.
 *  3. Estimate error — MET/device estimates are typically ±20–30 % and tend to over-estimate, so only part of the
 *     justified extra is added back: 50 % for fat-loss/recomposition goals (keeps the intended deficit and
 *     protects muscle with adequate protein), 75 % for maintenance, 100 % for muscle-gain/performance goals.
 *  4. Safety cap — at most 400 kcal/day is added.
 * Result: base target + allowed extra = adjusted target. Logging the planned routine never raises the target.
 */
import { addDays } from './dates';
import { type CardioSession } from './cardio';
import type { FitnessGoals, GoalType, Settings } from './types';

export const MAX_DAILY_ADD = 400;

export function defaultFitness(s: Pick<Settings, 'profile'>): FitnessGoals {
  return { resistanceDaysPerWeek: s.profile.trainingDaysPerWeek ?? 3, cardioSessionsPerWeek: 3, cardioMinPerSession: 10 };
}
export const fitnessOf = (s: Settings): FitnessGoals => ({ ...defaultFitness(s), ...(s.fitness ?? {}) });

export function autoReplenishPct(goal: GoalType): number {
  if (goal === 'fat_loss' || goal === 'fat_loss_preserve' || goal === 'recomp' || goal === 'custom') return 50;
  if (goal === 'maintain' || goal === 'healthy') return 75;
  return 100; // lean_bulk, bulk, performance
}

export interface EnergyBreakdown {
  mode: 'smart' | 'off';
  base: number;
  /** Gross estimated cardio calories today (what the sessions show). */
  cardioKcal: number;
  /** Net (above resting) cardio calories today. */
  cardioNetKcal: number;
  /** Weekly planned cardio minutes treated as already inside the base target. */
  plannedWeeklyMin: number;
  /** Minutes in the last 7 days (today included) up to and including today. */
  weekMinutes: number;
  /** Net kcal today that exceed the planned volume. */
  extraNetKcal: number;
  replenishPct: number;
  allowed: number;
  adjusted: number;
  consumed: number;
  remaining: number;
  reasons: { key: string; params?: Record<string, string | number> }[];
}

export function energyFor(date: string, baseKcal: number, consumed: number, sessions: CardioSession[], settings: Settings): EnergyBreakdown {
  const mode = settings.cardioCalorieMode ?? 'smart';
  const fit = fitnessOf(settings);
  const today = sessions.filter((s) => s.date === date);
  const cardioKcal = today.reduce((a, s) => a + s.kcal, 0);
  const cardioNetKcal = today.reduce((a, s) => a + s.netKcal, 0);
  const sedentary = (settings.profile.activityLevel ?? 'moderate') === 'sedentary';
  const plannedWeeklyMin = sedentary ? 0 : fit.cardioSessionsPerWeek * fit.cardioMinPerSession;
  const replenishPct = settings.cardioReplenishPct ?? autoReplenishPct(settings.profile.goalType);
  const reasons: EnergyBreakdown['reasons'] = [];

  // Minutes of the 6 days before today count against the planned weekly volume first, chronologically.
  const from = addDays(date, -6);
  const before = sessions.filter((s) => s.date >= from && s.date < date).reduce((a, s) => a + s.durationMin, 0);
  let coverLeft = Math.max(0, plannedWeeklyMin - before);
  let extraNet = 0;
  for (const s of [...today].sort((a, b) => a.time.localeCompare(b.time))) {
    const covered = Math.min(coverLeft, s.durationMin);
    coverLeft -= covered;
    const extraMin = s.durationMin - covered;
    if (extraMin > 0) extraNet += s.netKcal * (extraMin / s.durationMin);
  }
  const weekMinutes = before + today.reduce((a, s) => a + s.durationMin, 0);
  let allowed = 0;
  if (mode === 'off') reasons.push({ key: 'en_off' });
  else if (!today.length) reasons.push({ key: 'en_noCardio' });
  else {
    reasons.push({ key: sedentary ? 'en_sedentary' : 'en_planned', params: { min: plannedWeeklyMin, level: settings.profile.activityLevel ?? 'moderate' } });
    reasons.push({ key: 'en_net', params: { gross: Math.round(cardioKcal), net: Math.round(cardioNetKcal) } });
    if (extraNet <= 0) reasons.push({ key: 'en_withinPlan', params: { week: weekMinutes, plan: plannedWeeklyMin } });
    else {
      allowed = Math.min(MAX_DAILY_ADD, Math.round((extraNet * replenishPct) / 100 / 10) * 10);
      reasons.push({ key: 'en_extra', params: { extra: Math.round(extraNet), pct: replenishPct, allowed } });
      if (allowed === MAX_DAILY_ADD) reasons.push({ key: 'en_cap', params: { cap: MAX_DAILY_ADD } });
    }
  }
  const adjusted = baseKcal + allowed;
  return {
    mode, base: baseKcal, cardioKcal, cardioNetKcal, plannedWeeklyMin, weekMinutes, extraNetKcal: Math.round(extraNet), replenishPct,
    allowed, adjusted, consumed, remaining: adjusted - consumed, reasons
  };
}
