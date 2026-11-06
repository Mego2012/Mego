import { OPTIONAL_NUTRIENTS, type CustomServing, type EntryBasis, type Food, type Macros, type Unit } from './types';

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const TBSP_ML = 15;
export const TSP_ML = 5;
export const CUP_ML = 240;

export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function withOptional(out: Macros, src: Macros, fn: (v: number) => number): Macros {
  for (const k of OPTIONAL_NUTRIENTS) if (typeof src[k] === 'number') out[k] = fn(src[k]!);
  return out;
}

/** Display rounding: whole kcal, 0.1 g macros. */
export function roundMacros(m: Macros): Macros {
  return withOptional({ kcal: round(m.kcal, 0), protein: round(m.protein, 1), carbs: round(m.carbs, 1), fat: round(m.fat, 1) }, m, (v) => round(v, 1));
}

/**
 * Storage precision (0.01). Entries keep near-exact values so that sums of many small entries do not
 * drift; rounding to whole kcal happens only when displaying.
 */
export function preciseMacros(m: Macros): Macros {
  return withOptional({ kcal: round(m.kcal, 2), protein: round(m.protein, 2), carbs: round(m.carbs, 2), fat: round(m.fat, 2) }, m, (v) => round(v, 2));
}

/** Adds two nutrient sets. Optional nutrients stay "unknown" unless present in a or b. */
export function addMacros(a: Macros, b: Macros): Macros {
  const out: Macros = { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
  for (const k of OPTIONAL_NUTRIENTS) if (typeof a[k] === 'number' || typeof b[k] === 'number') out[k] = (a[k] ?? 0) + (b[k] ?? 0);
  return out;
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return withOptional({ kcal: m.kcal * factor, protein: m.protein * factor, carbs: m.carbs * factor, fat: m.fat * factor }, m, (v) => v * factor);
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
  const units: Unit[] = ['g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp'];
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
    case 'l':
      return quantity * 1000 * density;
    case 'cup':
      return quantity * CUP_ML * density;
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
    return { grams: 0, macros: preciseMacros(scaleMacros(basis.perServing, quantity)) };
  }
  if (!basis.per100) throw new UnitError('needsRecipe', 'Missing nutrition basis');
  const grams = toGrams(basis, quantity, unit, servingId);
  return { grams: round(grams, 1), macros: preciseMacros(scaleMacros(basis.per100, grams / 100)) };
}

/** Grams that one unit represents for this basis (for showing "1 cup = 240 g" style labels). */
export function gramsPerUnit(basis: EntryBasis, unit: Unit, servingId?: string): number | null {
  try {
    return round(toGrams(basis, 1, unit, servingId), 1);
  } catch {
    return null;
  }
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
/**
 * Explains a calories-vs-macros difference instead of assuming an error.
 * Returns null when consistent (within 5% or 8 kcal).
 */
export function explainEnergy(m: Macros, category = ''): { calc: number; diff: number; pct: number; reason: 'fiber' | 'nuts' | 'animal' | 'review' } | null {
  if (m.kcal <= 0) return null;
  const calc = 4 * m.protein + 4 * m.carbs + 9 * m.fat;
  const diff = m.kcal - calc;
  const pct = diff / m.kcal;
  if (Math.abs(pct) < 0.05 || Math.abs(diff) < 8) return null;
  const veg = /(خضار|فاكهة|veg|fruit)/i.test(category) || (m.carbs > m.protein && m.fat < 2 && m.kcal < 120);
  let reason: 'fiber' | 'nuts' | 'animal' | 'review' = 'review';
  if (diff < 0 && veg && pct > -0.35) reason = 'fiber';
  else if (diff < 0 && m.fat > 25 && pct > -0.12) reason = 'nuts';
  else if (diff > 0 && m.carbs < 2 && pct < 0.1) reason = 'animal';
  return { calc: round(calc, 1), diff: round(diff, 1), pct: round(pct * 100, 1), reason };
}

/** True when a discrepancy is large AND not explained by fiber / food-specific Atwater factors. */
export function isEnergySuspicious(m: Macros, category = ''): boolean {
  const e = explainEnergy(m, category);
  return !!e && e.reason === 'review' && Math.abs(e.pct) >= 10 && Math.abs(e.diff) >= 10;
}

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
  for (const k of ['kcal', 'protein', 'carbs', 'fat', ...OPTIONAL_NUTRIENTS] as const) {
    const v = m[k];
    if (v === undefined && OPTIONAL_NUTRIENTS.includes(k as never)) continue;
    if (v === undefined || !Number.isFinite(v)) errs.push(`${k}:nan`);
    else if (v < 0) errs.push(`${k}:negative`);
  }
  if (m.protein + m.carbs + m.fat > 100.5) errs.push('macros:over100g');
  if (m.fiber !== undefined && m.fiber > m.carbs + 0.5 && m.carbs > 0) errs.push('fiber:overCarbs');
  if (m.sugar !== undefined && m.sugar > m.carbs + 0.5) errs.push('sugar:overCarbs');
  if (m.kcal > 900.5) errs.push('kcal:over900');
  return errs;
}
