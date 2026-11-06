import { db, DB_SCHEMA_VERSION, SYNC_TABLES, type SyncTable } from './db';
import { getSettings, onLocalChange, saveSettings } from './repo';
import { importParsedFoods, parseFoodRows, type ImportResult } from './sheetImport';
import type { Food, OutboxItem, Settings } from './types';

export type SyncState = 'disabled' | 'offline' | 'idle' | 'syncing' | 'error';
export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastPushAt?: number;
  error?: string;
  /** Seconds until the next automatic retry after a failure. */
  retryIn?: number;
  conflicts?: number;
}

let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
/** Exponential backoff: 5 s, 10 s, 20 s … capped at 5 min. */
export function backoffMs(n: number) {
  return Math.min(300_000, 5000 * 2 ** Math.max(0, n - 1));
}

type StatusListener = (s: SyncStatus) => void;
const listeners = new Set<StatusListener>();
let status: SyncStatus = { state: 'disabled', pending: 0 };

export function subscribeSync(fn: StatusListener) {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

function setStatus(s: Partial<SyncStatus>) {
  status = { ...status, ...s };
  listeners.forEach((fn) => fn(status));
}

export async function refreshPending() {
  setStatus({ pending: await db.outbox.count() });
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Calls the user's Google Apps Script web app. text/plain avoids a CORS preflight. */
export async function callScript<T = Record<string, unknown>>(cfg: Settings['sync'], action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!cfg.url) throw new Error('Sync URL not configured');
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, action, token: cfg.token }),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!json.ok) throw new Error(json.error || 'Script error');
  return json;
}

/** Collapses multiple queued changes of the same record into the latest one. */
export function coalesce(items: OutboxItem[]): OutboxItem[] {
  const latest = new Map<string, OutboxItem>();
  for (const it of items) latest.set(`${it.table}|${it.key}`, it);
  return [...latest.values()];
}

let pushing: Promise<void> | null = null;

export async function pushNow(): Promise<void> {
  if (pushing) return pushing;
  pushing = (async () => {
    const s = await getSettings();
    if (!s.sync.url || !s.sync.token) {
      setStatus({ state: 'disabled' });
      return;
    }
    if (!isOnline()) {
      setStatus({ state: 'offline' });
      return;
    }
    setStatus({ state: 'syncing' });
    try {
      for (;;) {
        const batch = await db.outbox.orderBy('id').limit(300).toArray();
        if (!batch.length) break;
        const changes = coalesce(batch).map(({ table, key, op, payload, at }) => ({ table, key, op, payload, at }));
        const res = await callScript<{ applied: number; conflicts?: { table: string; key: string }[]; dataVersion?: number }>(s.sync, 'push', { changes, clientSchema: DB_SCHEMA_VERSION });
        await db.outbox.bulkDelete(batch.map((b) => b.id!));
        if (res.dataVersion) await db.settings.update('main', { 'sync.serverVersion': res.dataVersion } as never);
        if (res.conflicts?.length) {
          // The sheet holds a newer version of these records: bring them back instead of overwriting.
          setStatus({ conflicts: (status.conflicts ?? 0) + res.conflicts.length });
          await pullAll();
        }
        if (s.sync.writeFoodsToSheet) {
          const foods = changes.filter((c) => c.table === 'foods' && c.op === 'upsert').map((c) => c.payload as Food);
          if (foods.length) await callScript(s.sync, 'saveFoods', { foods: foods.map(foodToSheetRow) });
        }
      }
      const now = Date.now();
      await db.settings.update('main', { 'sync.lastPushAt': now, 'sync.lastError': '' } as never);
      failures = 0;
      clearTimeout(retryTimer);
      setStatus({ state: 'idle', lastPushAt: now, error: undefined, retryIn: undefined });
    } catch (e) {
      const msg = (e as Error).message;
      failures++;
      const wait = backoffMs(failures);
      clearTimeout(retryTimer);
      if (msg !== 'unauthorized') retryTimer = setTimeout(() => { pushNow(); }, wait);
      await db.settings.update('main', { 'sync.lastError': msg } as never).catch(() => {});
      setStatus({ state: isOnline() ? 'error' : 'offline', error: msg, retryIn: Math.round(wait / 1000) });
    } finally {
      await refreshPending();
    }
  })();
  try {
    await pushing;
  } finally {
    pushing = null;
  }
}

export function foodToSheetRow(f: Food) {
  return {
    sheetKey: f.sheetKey ?? '', sheetRow: f.sheetRow ?? 0, name: f.nameAr || f.nameEn, category: f.category,
    kcal: f.per100.kcal, protein: f.per100.protein, carbs: f.per100.carbs, fat: f.per100.fat,
    piece: f.pieceGrams ?? '', state: f.stateLabel || f.state, prep: f.prep, notes: f.notes, archived: f.archived
  };
}

/** Pulls the food database tab from Google Sheets and merges it (never deletes local records). */
export async function pullFoodsFromSheet(): Promise<ImportResult & { sheet: string; rowsRead: number }> {
  const s = await getSettings();
  const res = await callScript<{ rows: string[][]; sheet: string }>(s.sync, 'foods');
  const parsed = parseFoodRows(res.rows);
  if (parsed.errors.length) throw new Error(parsed.errors.join(','));
  const r = await importParsedFoods(parsed.foods, 'sheet');
  await saveSettings((x) => { x.sync.lastFoodsPullAt = Date.now(); });
  return { ...r, sheet: res.sheet, rowsRead: parsed.foods.length };
}

/** Restores/merges every app table from the APP_* tabs (newer updatedAt wins). */
export async function pullAll(): Promise<Record<string, number>> {
  const s = await getSettings();
  const res = await callScript<{ tables: Record<string, unknown[]> }>(s.sync, 'pull');
  const counts: Record<string, number> = {};
  for (const [table, rows] of Object.entries(res.tables)) {
    if (!(table in SYNC_TABLES)) continue;
    const t = db.table(table);
    const keyName = SYNC_TABLES[table as SyncTable];
    let n = 0;
    for (const row of rows as Record<string, unknown>[]) {
      if (table === 'settings') {
        const local = await getSettings();
        if ((row.updatedAt as number) > local.updatedAt) {
          await db.settings.put({ ...(row as unknown as Settings), sync: local.sync });
          n++;
        }
        continue;
      }
      const key = row[keyName] as string | number;
      const local = (await t.get(key)) as { updatedAt?: number; at?: number } | undefined;
      const rUpd = (row.updatedAt as number) ?? (row.at as number) ?? 0;
      const lUpd = local?.updatedAt ?? local?.at ?? -1;
      if (!local || rUpd > lUpd) {
        await t.put(row);
        n++;
      }
    }
    counts[table] = n;
  }
  await saveSettings((x) => { x.sync.lastPullAt = Date.now(); });
  return counts;
}

/** Queues every local record for upload (first-time setup or after a restore). */
export async function queueFullUpload() {
  const now = Date.now();
  for (const table of Object.keys(SYNC_TABLES) as SyncTable[]) {
    const rows = (await db.table(table).toArray()) as Record<string, unknown>[];
    const keyName = SYNC_TABLES[table];
    await db.outbox.bulkAdd(
      rows.map((r) => ({
        table, key: String(r[keyName]), op: 'upsert' as const,
        payload: table === 'settings' ? { ...r, sync: undefined } : r, at: now
      }))
    );
  }
  await refreshPending();
}

export async function testConnection(cfg: Settings['sync']) {
  return callScript<{ spreadsheet: string; foodSheet: string | null }>(cfg, 'ping');
}

let started = false;
export function startAutoSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (ms = 2500) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const s = await getSettings();
      if (s.sync.autoSync) await pushNow();
      else await refreshPending();
    }, ms);
  };
  onLocalChange(() => {
    refreshPending();
    schedule();
  });
  window.addEventListener('online', () => schedule(500));
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(500);
  });
  setInterval(() => schedule(0), 60_000);
  schedule(1000);
}
