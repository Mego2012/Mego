import { round } from './nutrition';
import type { GoalType, Macros, Profile } from './types';

export const ACTIVITY_FACTORS: Record<NonNullable<Profile['activityLevel']>, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9
};

/**
 * Evidence-based starting points (not prescriptions):
 *  - energy: Mifflin-St Jeor BMR × activity factor (TDEE), then a goal adjustment;
 *  - protein: 1.6–2.2 g/kg is the range supported for preserving/gaining muscle (higher in a deficit);
 *  - fat: ≥ 0.8 g/kg and ~25% of energy;
 *  - carbohydrates: the remainder.
 * Fat-loss deficits are moderate (≈15–20%) to keep loss around 0.5–1% of body weight per week.
 */
export const GOAL_RULES: Record<Exclude<GoalType, 'custom'>, { adjust: number; proteinPerKg: number }> = {
  fat_loss: { adjust: -0.2, proteinPerKg: 1.8 },
  fat_loss_preserve: { adjust: -0.18, proteinPerKg: 2.2 },
  recomp: { adjust: -0.07, proteinPerKg: 2.2 },
  lean_bulk: { adjust: 0.07, proteinPerKg: 1.8 },
  bulk: { adjust: 0.15, proteinPerKg: 1.6 },
  maintain: { adjust: 0, proteinPerKg: 1.6 },
  healthy: { adjust: 0, proteinPerKg: 1.4 },
  performance: { adjust: 0.05, proteinPerKg: 1.8 }
};

export function bmrOf(p: Profile): number {
  const base = 10 * p.currentWeight + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(p.sex === 'male' ? base + 5 : base - 161);
}

export function tdeeOf(p: Profile): number {
  return Math.round(bmrOf(p) * ACTIVITY_FACTORS[p.activityLevel ?? 'moderate']);
}

export interface Recommendation {
  goal: GoalType;
  bmr: number;
  tdee: number;
  targets: Macros | null;
  /** Expected weekly weight change (kg) at these calories, ~7700 kcal per kg — a rough estimate only. */
  expectedWeeklyKg: number | null;
}

export function recommend(p: Profile, goal: GoalType = p.goalType): Recommendation {
  const bmr = bmrOf(p);
  const tdee = tdeeOf(p);
  if (goal === 'custom') return { goal, bmr, tdee, targets: null, expectedWeeklyKg: null };
  const rule = GOAL_RULES[goal];
  // Never recommend eating below BMR.
  const kcal = Math.max(bmr, Math.round((tdee * (1 + rule.adjust)) / 10) * 10);
  const protein = Math.round(p.currentWeight * rule.proteinPerKg);
  const fat = Math.round(Math.max(p.currentWeight * 0.8, (kcal * 0.25) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { goal, bmr, tdee, targets: { kcal, protein, carbs, fat }, expectedWeeklyKg: round(((kcal - tdee) * 7) / 7700, 2) };
}

/** True when the user's current targets differ from what the goal would recommend. */
export function differsFromRecommendation(current: Macros, rec: Recommendation): boolean {
  if (!rec.targets) return false;
  return (['kcal', 'protein', 'carbs', 'fat'] as const).some((k) => Math.abs(current[k] - rec.targets![k]) > (k === 'kcal' ? 10 : 2));
}
