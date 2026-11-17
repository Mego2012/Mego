/**
 * One-time fiber migration (runs in the background after start-up, once per database).
 * Fills Food.per100.fiber ONLY where it is missing and a verified value exists (see fillMissingFiber in fiber.ts):
 * USDA foods from their USDA row, library ready meals from the recipe (only when every ingredient has fiber data).
 * Takes a full local backup first when anything will change. Diary entries are never touched.
 * The "done" marker is device-local (localStorage, per database) so it never travels in backups or sync.
 */
import { fiberMigrationRecord, fillMissingFiber, saveFiberMigrationRecord, type FiberMigration } from './fiber';
import { saveLocalBackup } from './localBackup';
import { db } from './db';
import { updateFood } from './repo';

export async function runFiberMigration(): Promise<FiberMigration | null> {
  if (fiberMigrationRecord(db.name)) return null;
  if (!(await db.foods.count())) return null; // nothing to fill yet; checked again next start
  const { loadRefFoods, refById } = await import('./refFoods');
  await loadRefFoods();
  const { planLibraryFoods, recipeFoodRef } = await import('./libraryFoods');
  const plan = planLibraryFoods(await db.foods.toArray(), refById);
  const meals = new Map(plan.recipes.map((r) => [recipeFoodRef(r.libId), r]));
  const result = await fillMissingFiber({
    refFiber: (id) => refById(id)?.per100.fiber,
    recipeFiber: (ref) => { const r = meals.get(ref); return r ? { per100: r.per100.fiber, perServing: r.perServing.fiber } : undefined; },
    backup: () => saveLocalBackup('pre-import'),
    update: (id, changes) => updateFood(id, changes)
  });
  saveFiberMigrationRecord(db.name, result);
  return result;
}
