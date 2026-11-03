import type { CustomServing, EntryBasis, Food, Macros, Unit } from './types';

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const TBSP_ML = 15;
export const TSP_ML = 5;

export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function roundMacros(m: Macros): Macros {
  return { kcal: round(m.kcal, 0), protein: round(m.protein, 1), carbs: round(m.carbs, 1), fat: round(m.fat, 1) };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return { kcal: m.kcal * factor, protein: m.protein * factor, carbs: m.carbs * factor, fat: m.fat * factor };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(addMacros, { ...ZERO });
}

export class UnitError extends Error {
  constructor(public code: 'needsPieceWeight' | 'needsServing' | 'invalidQuantity' | 'needsRecipe', message: string) {
    super(message);
  }
}

/** Units that can be used for a given basis. */
export function availableUnits(basis: EntryBasis): Unit[] {
  if (basis.perServing && !basis.per100) return ['serving'];
  const units: Unit[] = ['g', 'kg', 'ml', 'tbsp', 'tsp'];
  if (basis.pieceGrams && basis.pieceGrams > 0) units.push('piece', 'slice');
  if (basis.servings && basis.servings.length) units.push('serving');
  return units;
}

/**
 * Converts a quantity in a unit to grams using ONLY the values stored on the basis.
 * Never converts between raw and cooked weights.
 */
export function toGrams(basis: EntryBasis, quantity: number, unit: Unit, servingId?: string): number {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new UnitError('invalidQuantity', 'Quantity must be greater than zero');
  const density = basis.gramsPerMl && basis.gramsPerMl > 0 ? basis.gramsPerMl : 1;
  switch (unit) {
    case 'g':
      return quantity;
    case 'kg':
      return quantity * 1000;
    case 'ml':
      return quantity * density;
    case 'tbsp':
      return quantity * TBSP_ML * density;
    case 'tsp':
      return quantity * TSP_ML * density;
    case 'piece':
    case 'slice':
      if (!basis.pieceGrams || basis.pieceGrams <= 0)
        throw new UnitError('needsPieceWeight', 'This food has no piece/slice weight defined');
      return quantity * basis.pieceGrams;
    case 'serving': {
      const s: CustomServing | undefined = basis.servings?.find((x) => x.id === servingId) ?? basis.servings?.[0];
      if (!s) throw new UnitError('needsServing', 'No serving size defined for this food');
      return quantity * s.grams;
    }
  }
}

/** Calculates macros for a logged quantity from a snapshot basis. */
export function macrosFor(basis: EntryBasis, quantity: number, unit: Unit, servingId?: string): { grams: number; macros: Macros } {
  if (basis.perServing && !basis.per100) {
    if (!Number.isFinite(quantity) || quantity <= 0) throw new UnitError('invalidQuantity', 'Quantity must be greater than zero');
    return { grams: 0, macros: roundMacros(scaleMacros(basis.perServing, quantity)) };
  }
  if (!basis.per100) throw new UnitError('needsRecipe', 'Missing nutrition basis');
  const grams = toGrams(basis, quantity, unit, servingId);
  return { grams: round(grams, 1), macros: roundMacros(scaleMacros(basis.per100, grams / 100)) };
}

export function basisFromFood(food: Food): EntryBasis {
  return {
    per100: { ...food.per100 },
    pieceGrams: food.pieceGrams,
    gramsPerMl: food.gramsPerMl,
    servings: food.servings.map((s) => ({ ...s }))
  };
}

/** Atwater energy check: kcal ≈ 4P + 4C + 9F. Returns the relative deviation. */
export function atwaterDeviation(m: Macros): number {
  const calc = 4 * m.protein + 4 * m.carbs + 9 * m.fat;
  if (m.kcal <= 0 && calc <= 0) return 0;
  if (m.kcal <= 0) return 1;
  return (m.kcal - calc) / m.kcal;
}

export function isIncompleteMacros(m: Macros): boolean {
  return !(m.kcal > 0 || m.protein > 0 || m.carbs > 0 || m.fat > 0);
}

export function validateMacros(m: Macros): string[] {
  const errs: string[] = [];
  for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    const v = m[k];
    if (!Number.isFinite(v)) errs.push(`${k}:nan`);
    else if (v < 0) errs.push(`${k}:negative`);
  }
  if (m.protein + m.carbs + m.fat > 100.5) errs.push('macros:over100g');
  if (m.kcal > 900.5) errs.push('kcal:over900');
  return errs;
}
