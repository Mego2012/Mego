import { db } from './db';
import { restoreBackup, snapshot } from './backup';
import type { LocalBackup } from './types';

const KEEP = 10;

/** Saves a full snapshot inside the device database (kept: last 10). */
export async function saveLocalBackup(reason: LocalBackup['reason'], release?: string): Promise<LocalBackup> {
  const json = JSON.stringify(await snapshot());
  const rec: LocalBackup = { at: Date.now(), reason, size: json.length, json, ...(release ? { release } : {}) };
  rec.id = await db.backups.add(rec);
  // Rotation never removes the 3 most recent pre-update backups (taken before a new app release first runs).
  const all = await db.backups.orderBy('at').toArray();
  const protectedIds = new Set(all.filter((b) => b.reason === 'pre-update').slice(-3).map((b) => b.id));
  const rotating = all.filter((b) => !protectedIds.has(b.id));
  if (rotating.length > KEEP) await db.backups.bulkDelete(rotating.slice(0, rotating.length - KEEP).map((b) => b.id!));
  return rec;
}

/** App release identifier — changing it triggers one pre-update backup per device database. */
export const APP_RELEASE = '1.2-cardio';

/**
 * Before a new release writes anything, save a full snapshot of this device database (once per release and
 * database). Read-only on existing data: it only adds one backup record.
 */
export async function preUpdateBackup(release = APP_RELEASE): Promise<boolean> {
  const done = await db.backups.where('reason').equals('pre-update').filter((b) => b.release === release).count();
  if (done) return false;
  const hasData = (await db.entries.count()) + (await db.body.count()) + (await db.days.count()) + (await db.foods.count()) > 0;
  if (!hasData) return false;
  await saveLocalBackup('pre-update', release);
  return true;
}

/** Once per calendar day, on app start. */
export async function autoDailyBackup(): Promise<boolean> {
  const last = await db.backups.where('reason').equals('auto-daily').last();
  const day = new Date().toDateString();
  if (last && new Date(last.at).toDateString() === day) return false;
  const hasData = (await db.entries.count()) + (await db.foods.count()) + (await db.body.count()) > 0;
  if (!hasData) return false;
  await saveLocalBackup('auto-daily');
  return true;
}

export async function restoreLocalBackup(id: number) {
  const b = await db.backups.get(id);
  if (!b) throw new Error('Backup not found');
  await saveLocalBackup('pre-restore');
  return restoreBackup(b.json);
}

/** Pre-migration snapshots taken by preMigrationBackup() (separate database). */
export async function listPreMigrationBackups(): Promise<{ at: number; fromSchema: number; json: string }[]> {
  if (typeof indexedDB === 'undefined') return [];
  const list = (await indexedDB.databases?.()) ?? [];
  if (!list.some((d) => d.name === 'mego-nutrition-premigration')) return [];
  const bk: IDBDatabase = await new Promise((res, rej) => {
    const r = indexedDB.open('mego-nutrition-premigration');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  if (!bk.objectStoreNames.contains('backups')) { bk.close(); return []; }
  const rows = await new Promise<{ at: number; fromSchema: number; json: string }[]>((res, rej) => {
    const q = bk.transaction('backups', 'readonly').objectStore('backups').getAll();
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  bk.close();
  return rows;
}
