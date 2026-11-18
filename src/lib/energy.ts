/**
 * Exercise and the food budget.
 *
 * Rule (cardio-goals release): exercise NEVER changes the food budget. Cardio and extra training are tracked for
 * fitness and fat-loss progress; their estimated calories are shown for information only. The day's calorie target
 * is always the saved nutrition target. A legacy `cardioCalorieMode: 'smart'` stored by an older version is ignored.
 */
import { type CardioSession } from './cardio';
import type { FitnessGoals, Settings } from './types';
import { isCompleted, sessionMinutes, type WorkoutSession } from './workouts';

/** Compendium: resistance training, moderate effort ≈ 3.5 MET (net 2.5). */
export const RESISTANCE_MET = 3.5;

export function defaultFitness(s: Pick<Settings, 'profile'>): FitnessGoals {
  // Owner routine: 10 min treadmill after every workout → one cardio session per training day.
  const days = s.profile.trainingDaysPerWeek ?? 6;
  return { resistanceDaysPerWeek: days, cardioSessionsPerWeek: days, cardioMinPerSession: 10, setsPerMuscle: 14, experience: 'intermediate', pullupsPerWeek: 2, dipsPerWeek: 2 };
}
export const fitnessOf = (s: Settings): FitnessGoals => ({ ...defaultFitness(s), ...(s.fitness ?? {}) });

export interface EnergyBreakdown {
  /** The day's calorie target (the saved nutrition target — never raised by exercise). */
  base: number;
  /** Gross estimated cardio calories today (information only). */
  cardioKcal: number;
  /** Net (above resting) cardio calories today (information only). */
  cardioNetKcal: number;
  /** Estimated net calories of today's completed resistance sessions (information only). */
  workoutNetKcal: number;
  /** Always 0: exercise calories are not added to the food budget. */
  allowed: 0;
  /** Always equal to base. */
  adjusted: number;
  consumed: number;
  remaining: number;
  reasons: { key: string; params?: Record<string, string | number> }[];
}

export function energyFor(date: string, baseKcal: number, consumed: number, sessions: CardioSession[], settings: Settings, workouts: WorkoutSession[] = []): EnergyBreakdown {
  const today = sessions.filter((s) => s.date === date);
  const cardioKcal = today.reduce((a, s) => a + s.kcal, 0);
  const cardioNetKcal = today.reduce((a, s) => a + s.netKcal, 0);
  const weight = settings.profile.currentWeight;
  const workoutNetKcal = Math.round(workouts.filter((w) => isCompleted(w) && w.date === date)
    .reduce((a, w) => a + (RESISTANCE_MET - 1) * weight * (sessionMinutes(w) / 60), 0));
  return {
    base: baseKcal, cardioKcal, cardioNetKcal, workoutNetKcal, allowed: 0, adjusted: baseKcal, consumed, remaining: baseKcal - consumed,
    reasons: [{ key: 'en_notAdded' }, ...(today.length ? [{ key: 'en_net', params: { gross: Math.round(cardioKcal), net: Math.round(cardioNetKcal) } }] : [])]
  };
}
