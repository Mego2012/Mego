/**
 * Diet strategies: how the daily calorie target is split into protein, carbohydrate and fat (and, for carb cycling,
 * how calories vary by day). Pure functions — nothing here reads or writes the database.
 *
 * Energy: 4 kcal/g protein, 4 kcal/g carbohydrate, 9 kcal/g fat. Grams are whole numbers, so the macro calories match
 * the calorie target within rounding (at most ±5 kcal: one gram of the balancing macronutrient).
 *
 * Which macronutrient balances the remaining calories:
 *  - flexible, high_protein   → carbohydrates (protein and fat are chosen)
 *  - low_carb, keto           → fat (protein and carbohydrates are chosen)
 *  - carb_cycling             → per day: fat is a fixed share of that day's calories, carbohydrates balance
 *  - custom                   → nothing: the calorie target is the sum of the three macros chosen by the user
 */
import { weekday } from './dates';
import type { DayLog, Macros, Settings } from './types';

export type DietMode = 'flexible' | 'low_carb' | 'keto' | 'carb_cycling' | 'high_protein' | 'custom';
export type CycleLevel = 'high' | 'moderate' | 'low' | 'rest';
export const DIET_MODES: DietMode[] = ['flexible', 'low_carb', 'keto', 'carb_cycling', 'high_protein', 'custom'];
export const CYCLE_LEVELS: CycleLevel[] = ['high', 'moderate', 'low', 'rest'];

export interface DietStrategy {
  mode: DietMode;
  /** Daily calorie target (carb cycling: the weekly average). */
  kcal: number;
  protein: number;
  /** Chosen carbohydrate grams (low_carb, keto, custom); for other modes the computed value. */
  carbs: number;
  /** Chosen fat grams (flexible, high_protein, custom); for other modes the computed value. */
  fat: number;
  /** Carb cycling: level for each weekday (index 0 = Sunday … 6 = Saturday) and optional hand-set targets per level. */
  cycle?: { schedule: CycleLevel[]; overrides?: Partial<Record<CycleLevel, Macros>> };
  appliedAt: number;
  /** Targets saved before this strategy was applied (for "undo"). */
  previousTargets?: Settings['targets'];
}

export interface DietResult { macros: Macros; warnings: string[] }

const kcalOf = (p: number, c: number, f: number) => 4 * p + 4 * c + 9 * f;
const clampInt = (x: number, lo = 0) => Math.max(lo, Math.round(Number.isFinite(x) ? x : 0));

/**
 * Low carb without excessive fat: carbohydrates are set so fat ends up near 40 % of calories, kept within the usual
 * low-carb range of 50–150 g a day.
 */
export function lowCarbDefault(kcal: number, protein: number): number {
  return Math.min(150, Math.max(50, Math.round((kcal * 0.6 - 4 * protein) / 4 / 5) * 5));
}

/** Starting values for a mode at a calorie target (the user can change every value afterwards). */
export function modeDefaults(mode: DietMode, kcal: number, weightKg: number, current?: Macros): { protein: number; carbs: number; fat: number } {
  const kg = weightKg > 0 ? weightKg : 70;
  switch (mode) {
    case 'low_carb': { const p = clampInt(kg * 2.0); return { protein: p, carbs: lowCarbDefault(kcal, p), fat: 0 }; }
    case 'keto': return { protein: clampInt(kg * 1.8), carbs: 25, fat: 0 };
    case 'high_protein': return { protein: clampInt(Math.max(kg * 2.5, (kcal * 0.3) / 4)), carbs: 0, fat: clampInt((kcal * 0.25) / 9) };
    case 'custom': return current ? { protein: current.protein, carbs: current.carbs, fat: current.fat } : { protein: clampInt(kg * 2), carbs: clampInt((kcal * 0.45) / 4), fat: clampInt((kcal * 0.25) / 9) };
    case 'carb_cycling': return { protein: clampInt(kg * 2.0), carbs: 0, fat: 0 };
    default: return { protein: clampInt(kg * 2.0), carbs: 0, fat: clampInt((kcal * 0.25) / 9) };
  }
}

/** Daily targets for a single-target mode (all modes except carb cycling, whose days come from cycleTargets). */
/** Minimum daily protein for people who train, across ALL strategies (ISSN position stand: 1.6–2.2 g/kg). */
export const PROTEIN_MIN_G_PER_KG = 1.6;
/** Minimum fat for health (≈ 0.6 g/kg; fat also stays ≥ 20 % of calories in the automatic splits). */
export const FAT_MIN_G_PER_KG = 0.6;

export function computeMacros(mode: DietMode, kcalIn: number, input: { protein: number; carbs: number; fat: number }, weightKg?: number): DietResult {
  const warnings: string[] = [];
  const kcal = clampInt(kcalIn);
  let protein = clampInt(input.protein), carbs = clampInt(input.carbs), fat = clampInt(input.fat);
  const bodyChecks = (m: Macros) => {
    if (weightKg && weightKg > 0 && m.protein < weightKg * PROTEIN_MIN_G_PER_KG) warnings.push('diet_w_proteinMin');
    if (weightKg && weightKg > 0 && m.fat < weightKg * FAT_MIN_G_PER_KG) warnings.push('diet_w_fatMin');
    if (m.kcal < 1200) warnings.push('diet_w_veryLow');
    const fatShare = (9 * m.fat) / Math.max(m.kcal, 1);
    if ((mode === 'keto' && fatShare > 0.75) || (mode !== 'keto' && mode !== 'custom' && fatShare > 0.45)) warnings.push('diet_w_fatHigh');
  };
  if (mode === 'custom') {
    const m = { kcal: kcalOf(protein, carbs, fat), protein, carbs, fat };
    bodyChecks(m);
    return { macros: m, warnings };
  }
  if (mode === 'low_carb' || mode === 'keto') {
    if (mode === 'keto' && carbs > 50) warnings.push('diet_w_ketoCarbs');
    if (mode === 'low_carb' && (carbs < 50 || carbs > 150)) warnings.push('diet_w_lowCarbRange');
    const rest = kcal - 4 * protein - 4 * carbs;
    fat = Math.round(rest / 9);
    if (fat < 20) { warnings.push('diet_w_tooLow'); fat = Math.max(0, fat); }
  } else {
    // flexible, high_protein, carb_cycling (moderate day)
    const rest = kcal - 4 * protein - 9 * fat;
    carbs = Math.round(rest / 4);
    if (carbs < 0) { warnings.push('diet_w_tooLow'); carbs = 0; }
  }
  if (mode === 'high_protein' && (protein * 4) / Math.max(kcal, 1) < 0.25) warnings.push('diet_w_proteinLow');
  if (protein / Math.max(kcal, 1) * 4 > 0.45) warnings.push('diet_w_proteinVeryHigh');
  bodyChecks({ kcal, protein, carbs, fat });
  return { macros: { kcal, protein, carbs, fat }, warnings };
}

/** No carb-cycling day below the resting rate (Mifflin-St Jeor) or 1,500 kcal for men / 1,200 kcal for women. */
export function dayFloor(p: Settings['profile']): number {
  const bmr = 10 * p.currentWeight + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  return Math.max(Math.round(bmr), p.sex === 'male' ? 1500 : 1200);
}

/** Carb cycling: relative calories and fat share for each kind of day. */
export const CYCLE_RULES: Record<CycleLevel, { kcal: number; fatShare: number }> = {
  high: { kcal: 1.15, fatShare: 0.2 },
  moderate: { kcal: 1.0, fatShare: 0.25 },
  low: { kcal: 0.85, fatShare: 0.35 },
  rest: { kcal: 0.8, fatShare: 0.35 }
};

/** Default carb-cycling week from the training days: training days moderate (the first two high), other days rest. */
export function defaultSchedule(trainingWeekdays: number[], weekStartsOn = 6): CycleLevel[] {
  const order = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);
  const s: CycleLevel[] = Array(7).fill('rest');
  let highs = 0;
  for (const wd of order) if (trainingWeekdays.includes(wd)) { s[wd] = highs < 2 ? 'high' : 'moderate'; highs++; }
  return s;
}

/** Lowest calories any single carb-cycling day may get, as a share of the base target (keeps low/rest days sensible). */
export const CYCLE_MIN_SHARE = 0.7;

export interface CycleWeek {
  levels: Record<CycleLevel, Macros>;
  /** Sum of the 7 days of the schedule. */
  weeklyKcal: number;
  /** 7 × the base daily target. */
  weeklyTarget: number;
  /** true when the week matches the weekly target within 1 % (rounding). */
  aligned: boolean;
}

/**
 * Carb cycling for a schedule. Protein stays the same every day; fat is a share of each day's calories; carbohydrates
 * balance. Calories per level follow CYCLE_RULES and are scaled so the WEEK equals 7 × the base target.
 * Hand-set levels keep their values; the automatic levels absorb the difference so the week still matches
 * (never below CYCLE_MIN_SHARE of the base — if hand-set levels make that impossible, `aligned` is false).
 */
export function cycleWeek(baseKcal: number, protein: number, schedule: CycleLevel[], overrides: Partial<Record<CycleLevel, Macros>> = {}, minDayKcal = 0): CycleWeek {
  const weeklyTarget = Math.round(baseKcal) * 7;
  // lowest day: 70 % of the base and never below the given floor (e.g. the resting rate)
  const floor = Math.max(Math.round((baseKcal * CYCLE_MIN_SHARE) / 10) * 10, Math.ceil(minDayKcal / 10) * 10);
  const kcalOf: Partial<Record<CycleLevel, number>> = {};
  // a hand-set day's calories are always exactly what its grams add up to (4 / 4 / 9)
  const own = (m: Macros): Macros => ({ ...m, kcal: 4 * m.protein + 4 * m.carbs + 9 * m.fat });
  for (const l of CYCLE_LEVELS) if (overrides[l]) kcalOf[l] = own(overrides[l]!).kcal;
  // automatic levels share what the hand-set (and floored) days leave; a level that hits the floor is fixed there and
  // the others are re-scaled, so the week still equals 7 × base whenever that is possible
  for (let pass = 0; pass < 4; pass++) {
    const auto = CYCLE_LEVELS.filter((l) => kcalOf[l] === undefined || (!overrides[l] && kcalOf[l] !== floor));
    const fixedSum = schedule.reduce((a, l) => a + (auto.includes(l) ? 0 : kcalOf[l]!), 0);
    const w = schedule.reduce((a, l) => a + (auto.includes(l) ? CYCLE_RULES[l].kcal : 0), 0);
    const scale = w > 0 ? (weeklyTarget - fixedSum) / (baseKcal * w) : 1;
    let changed = false;
    for (const l of auto) {
      const k = Math.round((baseKcal * CYCLE_RULES[l].kcal * scale) / 10) * 10;
      const v = Math.max(floor, k);
      if (kcalOf[l] !== v) { kcalOf[l] = v; changed = true; }
    }
    if (!changed) break;
  }
  const levels = {} as Record<CycleLevel, Macros>;
  for (const l of CYCLE_LEVELS) {
    if (overrides[l]) { levels[l] = own(overrides[l]!); continue; }
    const kcal = kcalOf[l]!;
    const fat = Math.round((kcal * CYCLE_RULES[l].fatShare) / 9);
    const carbs = Math.max(0, Math.round((kcal - 4 * protein - 9 * fat) / 4));
    levels[l] = { kcal, protein, carbs, fat };
  }
  const weeklyKcal = schedule.reduce((a, l) => a + levels[l].kcal, 0);
  return { levels, weeklyKcal, weeklyTarget, aligned: Math.abs(weeklyKcal - weeklyTarget) <= weeklyTarget * 0.01 };
}

/** Targets per level (see cycleWeek). */
export function cycleTargets(baseKcal: number, protein: number, schedule: CycleLevel[], overrides: Partial<Record<CycleLevel, Macros>> = {}, minDayKcal = 0): Record<CycleLevel, Macros> {
  return cycleWeek(baseKcal, protein, schedule, overrides, minDayKcal).levels;
}

/** The targets a strategy saves as the app's regular daily targets (carb cycling: its moderate day). */
export function strategyTargets(s: DietStrategy): Macros {
  if (s.mode === 'carb_cycling') return computeMacros('flexible', s.kcal, { protein: s.protein, carbs: 0, fat: Math.round((s.kcal * CYCLE_RULES.moderate.fatShare) / 9) }).macros;
  return computeMacros(s.mode, s.kcal, s).macros;
}

/**
 * Carb-cycling level and targets for a date, or null when carb cycling is not active.
 * The base comes from the saved daily targets, so later changes there (e.g. a Goals recommendation the user applied)
 * carry over to every day. A day marked "rest" in the diary uses the rest level.
 */
export function cycleDay(date: string, settings: Settings, log?: DayLog): { level: CycleLevel; targets: Macros } | null {
  const s = settings.dietStrategy;
  if (!s || s.mode !== 'carb_cycling' || !s.cycle) return null;
  const level: CycleLevel = log?.dayType === 'rest' ? 'rest' : s.cycle.schedule[weekday(date)] ?? 'moderate';
  const base = settings.targets.training;
  return { level, targets: cycleTargets(base.kcal, base.protein, s.cycle.schedule, s.cycle.overrides, dayFloor(settings.profile))[level] };
}

/**
 * Re-splits new calories / protein (e.g. from a Goals recommendation) so the active strategy keeps its character:
 * keto and low-carb keep their carbohydrate grams and fat balances; flexible and high-protein keep fat and carbohydrates
 * balance. Without a strategy (or custom) the caller's own adjustment is kept.
 */
export function rebalance(s: DietStrategy | undefined, next: Macros): Macros {
  if (!s || s.mode === 'custom') return next;
  if (s.mode === 'carb_cycling') return strategyTargets({ ...s, kcal: next.kcal, protein: next.protein });
  return computeMacros(s.mode, next.kcal, { protein: next.protein, carbs: s.carbs, fat: s.fat }).macros;
}
