/**
 * Vitamins, minerals and fat / carbohydrate details ("micros"), per 100 g like every other nutrient.
 * Stored in Macros.micro (Food.per100.micro, DiaryEntry.macros.micro). A key that is absent = unknown (never 0).
 * Reference data: public/fooddb/micros.json (built from USDA FoodData Central by scripts/build-food-micros.mjs).
 */
export const MICRO_KEYS = [
  'water', 'starch', 'addedSugar', 'sugarAlcohol',
  'transFat', 'mufa', 'pufa', 'omega3', 'omega6', 'cholesterol',
  'potassium', 'calcium', 'magnesium', 'iron', 'zinc', 'phosphorus', 'selenium', 'copper', 'manganese', 'iodine',
  'vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'b1', 'b2', 'b3', 'b5', 'b6', 'b7', 'folate', 'b12'
] as const;
export type MicroKey = (typeof MICRO_KEYS)[number];
export type Micros = Partial<Record<MicroKey, number>>;

export const MICRO_UNIT: Record<MicroKey, 'g' | 'mg' | 'µg'> = {
  water: 'g', starch: 'g', addedSugar: 'g', sugarAlcohol: 'g', transFat: 'g', mufa: 'g', pufa: 'g', omega3: 'g', omega6: 'g', cholesterol: 'mg',
  potassium: 'mg', calcium: 'mg', magnesium: 'mg', iron: 'mg', zinc: 'mg', phosphorus: 'mg', selenium: 'µg', copper: 'mg', manganese: 'mg', iodine: 'µg',
  vitA: 'µg', vitC: 'mg', vitD: 'µg', vitE: 'mg', vitK: 'µg', b1: 'mg', b2: 'mg', b3: 'mg', b5: 'mg', b6: 'mg', b7: 'µg', folate: 'µg', b12: 'µg'
};

export const MICRO_GROUPS: { key: string; items: MicroKey[] }[] = [
  { key: 'carbDetails', items: ['starch', 'addedSugar', 'sugarAlcohol'] },
  { key: 'fatDetails', items: ['transFat', 'mufa', 'pufa', 'omega3', 'omega6', 'cholesterol'] },
  { key: 'minerals', items: ['potassium', 'calcium', 'magnesium', 'iron', 'zinc', 'phosphorus', 'selenium', 'copper', 'manganese', 'iodine'] },
  { key: 'vitamins', items: ['vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'b1', 'b2', 'b3', 'b5', 'b6', 'b7', 'folate', 'b12'] }
];

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function scaleMicros(m: Micros | undefined, factor: number): Micros | undefined {
  if (!m) return undefined;
  const out: Micros = {};
  for (const k of MICRO_KEYS) if (typeof m[k] === 'number') out[k] = m[k]! * factor;
  return out;
}

/** Lenient sum (day totals): a key is present when present in a or b — coverage is tracked separately. */
export function addMicros(a?: Micros, b?: Micros): Micros | undefined {
  if (!a && !b) return undefined;
  const out: Micros = {};
  for (const k of MICRO_KEYS) if (typeof a?.[k] === 'number' || typeof b?.[k] === 'number') out[k] = (a?.[k] ?? 0) + (b?.[k] ?? 0);
  return out;
}

/** Strict sum (recipes): a key is known only when every part has it. */
export function sumMicrosStrict(list: (Micros | undefined)[]): Micros | undefined {
  if (!list.length || list.some((m) => !m)) return undefined;
  const out: Micros = {};
  for (const k of MICRO_KEYS) if (list.every((m) => typeof m![k] === 'number')) out[k] = list.reduce((a, m) => a + m![k]!, 0);
  return Object.keys(out).length ? out : undefined;
}

export function roundMicros(m: Micros | undefined, digits = 3): Micros | undefined {
  if (!m) return undefined;
  const f = 10 ** digits;
  const out: Micros = {};
  for (const k of MICRO_KEYS) if (typeof m[k] === 'number') out[k] = Math.round(m[k]! * f) / f;
  return out;
}

/** Micros from a micros.json row (columns in meta order). null → absent (unknown). */
export function microsFromRow(columns: string[], row: (number | null)[] | undefined): Micros | undefined {
  if (!row) return undefined;
  const out: Micros = {};
  columns.forEach((c, i) => { const v = row[i]; if (v !== null && v !== undefined && (MICRO_KEYS as readonly string[]).includes(c)) out[c as MicroKey] = r3(v); });
  return Object.keys(out).length ? out : undefined;
}

/** How many of the given nutrient sets carry each key. */
export function microCoverage(list: (Micros | undefined)[]): Record<MicroKey, number> {
  return Object.fromEntries(MICRO_KEYS.map((k) => [k, list.filter((m) => typeof m?.[k] === 'number').length])) as Record<MicroKey, number>;
}

/* ------------------------------------------------------------------ daily micronutrient status */
import type { Reference } from './dri';
export interface MicroRow {
  key: MicroKey; unit: 'g' | 'mg' | 'µg';
  consumed: number; known: number; entries: number; complete: boolean;
  target?: number; custom: boolean; kind: Reference['kind']; pct?: number; remaining?: number;
  ul?: number; ulScope?: Reference['ulScope'];
  /** food intake alone is above an upper limit that applies to total intake */
  aboveUl: boolean;
}

/**
 * One day's micronutrients against the reference intakes. Entries without data for a nutrient are not counted as 0:
 * `known` / `entries` tells how complete the number is, and the % uses only what is known.
 */
export function microStatus(
  totals: Micros | undefined, coverage: Record<MicroKey, number>, entries: number,
  ref: (k: MicroKey) => Reference, custom: Partial<Record<MicroKey, number>> = {}
): MicroRow[] {
  return MICRO_KEYS.map((key) => {
    const r = ref(key);
    const consumed = Math.round((totals?.[key] ?? 0) * 1000) / 1000;
    const c = custom[key];
    const target = typeof c === 'number' && c > 0 ? c : r.target;
    const known = coverage[key] ?? 0;
    return {
      key, unit: MICRO_UNIT[key], consumed, known, entries, complete: entries > 0 && known === entries,
      target, custom: typeof c === 'number' && c > 0, kind: r.kind,
      pct: target && known ? Math.round((consumed / target) * 100) : undefined,
      remaining: target !== undefined && r.kind !== 'limit' ? Math.max(0, Math.round((target - consumed) * 1000) / 1000) : undefined,
      ul: r.ul, ulScope: r.ulScope, aboveUl: r.ul !== undefined && r.ulScope === 'total' && consumed > r.ul
    };
  });
}
