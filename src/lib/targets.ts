import { weekday } from './dates';
import type { DayLog, DayType, Macros, Settings } from './types';

export function dayTypeFor(date: string, settings: Settings, log?: DayLog): DayType {
  if (log?.dayType) return log.dayType;
  return settings.trainingWeekdays.includes(weekday(date)) ? 'training' : 'rest';
}

/** Targets for a date: per-date override > day-type targets. Always read from settings (never hardcoded). */
export function targetsFor(date: string, settings: Settings, log?: DayLog): Macros {
  if (log?.targetsOverride) return log.targetsOverride;
  return settings.targets[dayTypeFor(date, settings, log)];
}

export function macroCalories(m: Pick<Macros, 'protein' | 'carbs' | 'fat'>): number {
  return 4 * m.protein + 4 * m.carbs + 9 * m.fat;
}

/** Mifflin-St Jeor BMR — shown for reference only, never applied automatically. */
export function bmr(s: Settings['profile']): number {
  const base = 10 * s.currentWeight + 6.25 * s.heightCm - 5 * s.age;
  return Math.round(s.sex === 'male' ? base + 5 : base - 161);
}
