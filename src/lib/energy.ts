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
import { tdeeOf } from './goals';
import { type CardioSession } from './cardio';
import type { FitnessGoals, GoalType, Settings } from './types';
import { isCompleted, sessionMinutes, type WorkoutSession } from './workouts';

/** Compendium: resistance training, moderate effort ≈ 3.5 MET (net 2.5). */
export const RESISTANCE_MET = 3.5;

export const MAX_DAILY_ADD = 400;
export const LOSS_GOALS = new Set(['fat_loss', 'fat_loss_preserve', 'recomp']);

export function defaultFitness(s: Pick<Settings, 'profile'>): FitnessGoals {
  // Owner routine: 10 min treadmill after every workout → one cardio session per training day.
  const days = s.profile.trainingDaysPerWeek ?? 6;
  return { resistanceDaysPerWeek: days, cardioSessionsPerWeek: days, cardioMinPerSession: 10, setsPerMuscle: 14, experience: 'intermediate', pullupsPerWeek: 2, dipsPerWeek: 2 };
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
  /** Resistance sessions today beyond the planned weekly number (counted as extra). */
  extraWorkouts: number;
  /** Net kcal of those extra resistance sessions. */
  workoutExtraNet: number;
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

export function energyFor(date: string, baseKcal: number, consumed: number, sessions: CardioSession[], settings: Settings, workouts: WorkoutSession[] = []): EnergyBreakdown {
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
  // Resistance training: the planned weekly sessions are inside the TDEE (activity level). Only sessions beyond
  // that number in the last 7 days count, as net energy of a moderate session (3.5 MET) for their duration.
  const weight = settings.profile.currentWeight;
  const done = workouts.filter((w) => isCompleted(w) && w.date >= from && w.date <= date).sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt);
  const plannedRes = sedentary ? 0 : fit.resistanceDaysPerWeek;
  const extraToday = done.slice(plannedRes).filter((w) => w.date === date);
  const workoutExtraNet = Math.round(extraToday.reduce((a, w) => a + (RESISTANCE_MET - 1) * weight * (sessionMinutes(w) / 60), 0));
  extraNet += workoutExtraNet;
  let allowed = 0;
  if (mode === 'off') reasons.push({ key: 'en_off' });
  else if (!today.length && !extraToday.length) {
    reasons.push({ key: 'en_noCardio' });
    if (done.some((w) => w.date === date)) reasons.push({ key: 'en_workoutPlanned', params: { n: plannedRes } });
  } else {
    if (done.some((w) => w.date === date)) reasons.push(extraToday.length ? { key: 'en_workoutExtra', params: { n: plannedRes, kcal: workoutExtraNet } } : { key: 'en_workoutPlanned', params: { n: plannedRes } });
    reasons.push({ key: sedentary ? 'en_sedentary' : 'en_planned', params: { min: plannedWeeklyMin, level: settings.profile.activityLevel ?? 'moderate' } });
    if (today.length) reasons.push({ key: 'en_net', params: { gross: Math.round(cardioKcal), net: Math.round(cardioNetKcal) } });
    if (extraNet <= 0) reasons.push({ key: 'en_withinPlan', params: { week: weekMinutes, plan: plannedWeeklyMin } });
    else {
      allowed = Math.min(MAX_DAILY_ADD, Math.round((extraNet * replenishPct) / 100 / 10) * 10);
      reasons.push({ key: 'en_extra', params: { extra: Math.round(extraNet), pct: replenishPct, allowed } });
      if (allowed === MAX_DAILY_ADD) reasons.push({ key: 'en_cap', params: { cap: MAX_DAILY_ADD } });
      // Fat-loss goals: the adjusted target keeps ≥ 10 % deficit vs. the day's expenditure (TDEE + the extra exercise),
      // so exercise can never move the day to maintenance or surplus.
      if (LOSS_GOALS.has(settings.profile.goalType)) {
        const ceiling = Math.floor((0.9 * (tdeeOf(settings.profile) + extraNet)) / 10) * 10;
        if (baseKcal + allowed > ceiling) {
          allowed = Math.max(0, ceiling - baseKcal);
          reasons.push({ key: 'en_lossCeiling', params: { ceiling, allowed } });
        }
      }
    }
  }
  const adjusted = baseKcal + allowed;
  return {
    mode, base: baseKcal, cardioKcal, cardioNetKcal, extraWorkouts: extraToday.length, workoutExtraNet, plannedWeeklyMin, weekMinutes, extraNetKcal: Math.round(extraNet), replenishPct,
    allowed, adjusted, consumed, remaining: adjusted - consumed, reasons
  };
}
