/**
 * One-time micronutrient migration (background, once per device database), same rules as the fiber migration:
 * fills ONLY missing vitamin / mineral values of existing foods from verified sources — USDA foods from their USDA
 * row, library ready meals from the recipe (a nutrient only when every ingredient has it). Values already present
 * (e.g. typed from a label) are never overwritten; unknown is never written as 0; diary history is never changed
 * (entries keep the nutrients they were logged with). A local backup is taken first when anything will change.
 */
import { db } from './db';
import { refIdFromSource } from './fiber';
import { saveLocalBackup } from './localBackup';
import { MICRO_KEYS, type Micros } from './micros';
import { updateFood } from './repo';
import type { Food } from './types';

export const MICRO_MIGRATION_KEY = 'migration:micros-v1';
export interface MicroMigration { at: number; checked: number; updated: number; valuesAdded: number; skipped: number; foods: string[] }

const recordKey = (dbName: string) => `mego:${dbName}:${MICRO_MIGRATION_KEY}`;
export function microMigrationRecord(dbName: string): MicroMigration | null {
  try { const v = localStorage.getItem(recordKey(dbName)); return v ? (JSON.parse(v) as MicroMigration) : null; } catch { return null; }
}

/** Pure planning step (tested): which foods get which missing values. */
export function planMicroFill(foods: Food[], refMicros: (id: string) => Micros | undefined, recipeMicros: (ref: string) => Micros | undefined): { food: Food; add: Micros }[] {
  const out: { food: Food; add: Micros }[] = [];
  for (const f of foods) {
    if (f.archived) continue;
    let src: Micros | undefined;
    if (f.source === 'usda') { const id = refIdFromSource(f.sourceRef); if (id) src = refMicros(id); }
    else if (f.sourceRef) src = recipeMicros(f.sourceRef);
    if (!src) continue;
    const add: Micros = {};
    for (const k of MICRO_KEYS) if (typeof src[k] === 'number' && typeof f.per100.micro?.[k] !== 'number') add[k] = src[k];
    if (Object.keys(add).length) out.push({ food: f, add });
  }
  return out;
}

export async function runMicroMigration(): Promise<MicroMigration | null> {
  if (microMigrationRecord(db.name)) return null;
  if (!(await db.foods.count())) return null;
  const { loadRefFoods, loadMicros, refById } = await import('./refFoods');
  await loadRefFoods();
  await loadMicros();
  const { planLibraryFoods, recipeFoodRef } = await import('./libraryFoods');
  const foods = await db.foods.toArray();
  const lib = planLibraryFoods(foods, refById);
  const meals = new Map(lib.recipes.map((r) => [recipeFoodRef(r.libId), r.per100.micro]));
  const plan = planMicroFill(foods, (id) => refById(id)?.per100.micro, (ref) => meals.get(ref));
  if (plan.length) await saveLocalBackup('pre-import');
  const done: string[] = [];
  let values = 0, skipped = 0;
  for (const { food, add } of plan) {
    try { await updateFood(food.id, { per100: { ...food.per100, micro: { ...(food.per100.micro ?? {}), ...add } } }); done.push(food.id); values += Object.keys(add).length; } catch { skipped++; }
  }
  const result: MicroMigration = { at: Date.now(), checked: foods.length, updated: done.length, valuesAdded: values, skipped, foods: done };
  try { localStorage.setItem(recordKey(db.name), JSON.stringify(result)); } catch { /* runs again next start (fill-only) */ }
  return result;
}
