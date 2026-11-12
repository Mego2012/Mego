import { db, SYNC_TABLES } from './db';
import { getSettings } from './repo';
import { callScript } from './sync';
import type { Settings } from './types';

export const BACKUP_FORMAT = 'mego-nutrition-backup';

export async function snapshot() {
  const tables: Record<string, unknown[]> = {};
  for (const t of Object.keys(SYNC_TABLES)) tables[t] = await db.table(t).toArray();
  const s = tables.settings as { sync?: unknown }[];
  tables.settings = s.map((x) => ({ ...x, sync: undefined })); // never export the sync token
  return { format: BACKUP_FORMAT, version: 1, createdAt: new Date().toISOString(), tables };
}

export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export async function downloadBackup() {
  const snap = await snapshot();
  const name = `mego-nutrition-backup-${snap.createdAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
  downloadBlob(name, new Blob([JSON.stringify(snap)], { type: 'application/json' }));
  return name;
}

export async function backupToDrive() {
  const s = await getSettings();
  return callScript<{ file: string; url: string }>(s.sync, 'backup', { snapshot: await snapshot() });
}

/** Restores a backup by merging records (newer updatedAt wins, settings included). Never deletes existing data. */
export async function restoreBackup(text: string): Promise<Record<string, number>> {
  let data: { format?: string; tables?: Record<string, Record<string, unknown>[]> };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a valid backup file (unreadable JSON)');
  }
  if (data.format !== BACKUP_FORMAT || !data.tables || typeof data.tables !== 'object') throw new Error('Not a valid backup file');
  for (const [table, rows] of Object.entries(data.tables)) {
    if (!(table in SYNC_TABLES)) continue;
    if (!Array.isArray(rows)) throw new Error(`Backup table ${table} is invalid`);
    const keyName = SYNC_TABLES[table as keyof typeof SYNC_TABLES];
    if (rows.some((r) => !r || typeof r !== 'object' || (r as Record<string, unknown>)[keyName] === undefined)) throw new Error(`Backup table ${table} has records without ${keyName}`);
    if (table === 'entries' && rows.some((r) => typeof (r as { macros?: { kcal?: unknown } }).macros?.kcal !== 'number')) throw new Error('Backup entries are missing nutrition values');
  }
  const counts: Record<string, number> = {};
  const localSettings = await getSettings();
  await db.transaction('rw', Object.keys(SYNC_TABLES).map((t) => db.table(t)), async () => {
    for (const [table, rows] of Object.entries(data.tables!)) {
      if (!(table in SYNC_TABLES)) continue;
      const keyName = SYNC_TABLES[table as keyof typeof SYNC_TABLES];
      let n = 0;
      for (const row of rows) {
        if (table === 'settings') {
          // same rule as every other table: an older backup never replaces newer settings (targets, profile, language)
          const cur = (await db.settings.get((row as { id?: string }).id ?? 'main')) as { updatedAt?: number } | undefined;
          if (!cur || ((row.updatedAt as number) ?? 0) > (cur.updatedAt ?? 0)) {
            await db.settings.put({ ...(row as unknown as Settings), sync: localSettings.sync });
            n++;
          }
          continue;
        }
        const local = (await db.table(table).get(row[keyName] as never)) as { updatedAt?: number } | undefined;
        if (!local || ((row.updatedAt as number) ?? 0) >= (local.updatedAt ?? 0)) {
          await db.table(table).put(row);
          n++;
        }
      }
      counts[table] = n;
    }
  });
  return counts;
}
