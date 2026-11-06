import { db } from './db';
import { restoreBackup, snapshot } from './backup';
import type { LocalBackup } from './types';

const KEEP = 10;

/** Saves a full snapshot inside the device database (kept: last 10). */
export async function saveLocalBackup(reason: LocalBackup['reason']): Promise<LocalBackup> {
  const json = JSON.stringify(await snapshot());
  const rec: LocalBackup = { at: Date.now(), reason, size: json.length, json };
  rec.id = await db.backups.add(rec);
  const all = await db.backups.orderBy('at').toArray();
  if (all.length > KEEP) await db.backups.bulkDelete(all.slice(0, all.length - KEEP).map((b) => b.id!));
  return rec;
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
