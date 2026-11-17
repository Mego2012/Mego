/**
 * Dietary fiber as a first-class nutrient.
 *  - Stored like the other nutrients: grams per 100 g in Food.per100.fiber, scaled to the eaten quantity in each entry.
 *  - undefined = unknown (never zero). 0 = the source reports zero fiber (e.g. USDA for meat or oil).
 *  - The daily target is a setting (Settings.fiberTarget, default 25 g/day — WHO 2023: adults ≥ 25 g/day).
 *  - Fiber is not part of the calorie budget and is not a fourth macronutrient.
 */
import { db } from './db';
import { round } from './nutrition';
import type { DaySummary } from './reports';
import type { Food, Settings } from './types';

export const DEFAULT_FIBER_TARGET = 25;
export const FIBER_TARGET_MIN = 5;
export const FIBER_TARGET_MAX = 100;

export function fiberTargetOf(s: Pick<Settings, 'fiberTarget'>): number {
  const v = s.fiberTarget;
  return typeof v === 'number' && v >= FIBER_TARGET_MIN && v <= FIBER_TARGET_MAX ? v : DEFAULT_FIBER_TARGET;
}

export function validFiberTarget(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= FIBER_TARGET_MIN && v <= FIBER_TARGET_MAX;
}

export interface FiberProgress {
  target: number;
  /** Sum of the fiber of the entries that have fiber data (0 when nothing is logged). */
  consumed: number;
  remaining: number;
  pct: number;
  entries: number;
  /** Entries with fiber data. */
  known: number;
  /** true when every logged entry has fiber data (consumed is the full intake). */
  complete: boolean;
  /** Entries logged but none has fiber data: intake unknown. */
  unknown: boolean;
}

/** Fiber progress for a day: target, consumed, remaining, % of target — honest about entries without fiber data. */
export function fiberProgress(day: Pick<DaySummary, 'totals' | 'coverage' | 'entryCount'>, target: number): FiberProgress {
  const known = day.coverage.fiber ?? 0;
  const consumed = round(typeof day.totals.fiber === 'number' ? day.totals.fiber : 0, 1);
  return {
    target, consumed, remaining: round(Math.max(0, target - consumed), 1), pct: target > 0 ? Math.round((consumed / target) * 100) : 0,
    entries: day.entryCount, known, complete: known === day.entryCount, unknown: day.entryCount > 0 && known === 0
  };
}

export interface FiberPart { name: string; grams: number; fiber?: number }
export interface RecipeFiber {
  /** Total fiber of the recipe (undefined when any ingredient's fiber is unknown). */
  total?: number;
  perServing?: number;
  /** Per 100 g of the prepared recipe — uses the cooked weight when given, otherwise the sum of ingredient weights. */
  per100?: number;
  /** Lower bound from the ingredients that do have data. */
  knownSum: number;
  unknown: string[];
  parts: FiberPart[];
}

/** Fiber of a recipe from its ingredients: Σ ingredient fiber (each already scaled to its grams), ÷ servings, per 100 g. */
export function recipeFiber(parts: FiberPart[], servings: number, cookedGrams?: number): RecipeFiber {
  const unknown = parts.filter((p) => typeof p.fiber !== 'number' && p.grams > 0).map((p) => p.name);
  const knownSum = round(parts.reduce((a, p) => a + (p.fiber ?? 0), 0), 2);
  const weight = cookedGrams && cookedGrams > 0 ? cookedGrams : parts.reduce((a, p) => a + p.grams, 0);
  if (unknown.length) return { knownSum, unknown, parts };
  return {
    total: knownSum, perServing: servings > 0 ? round(knownSum / servings, 2) : undefined, per100: weight > 0 ? round((knownSum / weight) * 100, 2) : undefined,
    knownSum, unknown, parts
  };
}

/** "USDA FDC 171477 (SR Legacy)" → "S171477"; FNDDS → "N…". */
export function refIdFromSource(src?: string): string | null {
  const m = src?.match(/^USDA FDC (\d+) \((.+)\)$/);
  if (!m) return null;
  return (/FNDDS|Survey/i.test(m[2]) ? 'N' : 'S') + m[1];
}

export interface FiberMigration { at: number; checked: number; filled: number; alreadyKnown: number; stillUnknown: number; skipped?: number; foods: string[] }
export const FIBER_MIGRATION_KEY = 'migration:fiber-v1';
/** Device-local record of the migration for one database (not synced, not in backups). */
export function fiberMigrationRecord(dbName: string): FiberMigration | null {
  try { const v = localStorage.getItem(`mego:${dbName}:${FIBER_MIGRATION_KEY}`); return v ? (JSON.parse(v) as FiberMigration) : null; } catch { return null; }
}
export function saveFiberMigrationRecord(dbName: string, r: FiberMigration) {
  try { localStorage.setItem(`mego:${dbName}:${FIBER_MIGRATION_KEY}`, JSON.stringify(r)); } catch { /* private mode: runs again next start (fill-only, idempotent) */ }
}

/**
 * Adds fiber to existing foods ONLY where it is missing and a verified value exists:
 *  - foods taken from USDA (source 'usda' with a USDA FDC reference): the USDA row's fiber;
 *  - ready meals made from the recipe library: the recipe's fiber, only when every ingredient has fiber data.
 * Never overwrites a value, never writes 0 for unknown, never touches diary entries (history keeps its snapshot).
 * A full local backup is taken first; each change is recorded in the food change log and synced.
 */
export async function fillMissingFiber(opts: {
  refFiber: (refId: string) => number | undefined;
  recipeFiber?: (sourceRef: string) => { per100?: number; perServing?: number } | undefined;
  backup?: () => Promise<unknown>;
  /** repo.updateFood (version + change log + sync, exactly like a manual edit) */
  update: (id: string, changes: Partial<Food>) => Promise<unknown>;
}): Promise<FiberMigration> {
  const foods = await db.foods.toArray();
  const plan: { f: Food; fiber: number }[] = [];
  let alreadyKnown = 0;
  for (const f of foods) {
    if (typeof f.per100.fiber === 'number') { alreadyKnown++; continue; }
    let v: number | undefined;
    if (f.source === 'usda') { const id = refIdFromSource(f.sourceRef); if (id) v = opts.refFiber(id); }
    else if (f.sourceRef && opts.recipeFiber) v = opts.recipeFiber(f.sourceRef)?.per100;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) plan.push({ f, fiber: round(v, 2) });
  }
  if (plan.length && opts.backup) await opts.backup();
  const now = Date.now();
  const done: string[] = [];
  let skipped = 0;
  // one food that fails validation (e.g. source fiber above its carbs) is skipped, never blocks the others
  for (const { f, fiber } of plan) {
    try { await opts.update(f.id, { per100: { ...f.per100, fiber } }); done.push(f.id); } catch { skipped++; }
  }
  return { at: now, checked: foods.length, filled: done.length, alreadyKnown, stillUnknown: foods.length - alreadyKnown - done.length, skipped, foods: done };
}

/** Fiber coverage of the user's food list (for the Goals fiber card). */
export function fiberCoverage(foods: Food[]): { total: number; known: number; zero: number; unknown: number } {
  const live = foods.filter((f) => !f.archived && !f.incomplete);
  const known = live.filter((f) => typeof f.per100.fiber === 'number');
  return { total: live.length, known: known.length, zero: known.filter((f) => f.per100.fiber === 0).length, unknown: live.length - known.length };
}
