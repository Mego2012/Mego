/**
 * Cloud sync for signed-in users (Firestore, free Spark plan).
 *  - Push: the same local outbox the app already fills; each record goes to users/{uid}/{table}/{key} as
 *    { data: JSON string, updatedAt, deleted? }. The server rules refuse older copies, so a refused update is a
 *    conflict where the server already holds a newer version — it arrives through the live listener.
 *  - Pull: live listeners per table (only records newer than the last one seen) — other devices update instantly.
 *  - Shared foods: the verified database in /foods is copied into the local food list as source "sheet".
 * Records of one user are only ever written under that user's id (enforced by the server).
 */
import { collection, doc, onSnapshot, query, setDoc, where, type Unsubscribe } from 'firebase/firestore';
import { db, SYNC_TABLES, type SyncTable } from './db';
import { cloud, currentUser, reportError } from './firebase';
import { coalesce, setStatus } from './sync';
import { importParsedFoods, type ParsedFood } from './sheetImport';
import { defaultSettings } from './defaults';
import type { Food, OutboxItem, Settings } from './types';

let uid = '';
let unsubs: Unsubscribe[] = [];
let pushing = false;
let timer: ReturnType<typeof setTimeout> | undefined;

// "cloud2": markers of the first version are ignored once, so every device re-downloads its account in full one time
// (a device whose records were lost while the old markers survived gets them back; newer local copies are kept).
const MARK = 'mego.cloud2.';
const lastKey = (t: string) => `${MARK}${uid}.${t}`;
const getLast = (t: string) => { try { return Number(localStorage.getItem(lastKey(t))) || 0; } catch { return 0; } };
const setLast = (t: string, v: number) => { try { if (v > getLast(t)) localStorage.setItem(lastKey(t), String(v)); } catch { /* ignore */ } };

/** Personal foods sync; shared verified foods (source "sheet") come from /foods instead. */
function shouldPush(it: OutboxItem): boolean {
  if (it.table === 'foods' && it.op === 'upsert') return (it.payload as Food | undefined)?.source !== 'sheet';
  return it.table in SYNC_TABLES;
}

function serialise(it: OutboxItem): { data: string; updatedAt: number; deleted?: boolean } {
  if (it.op === 'delete') return { data: '{}', updatedAt: Math.round(it.at), deleted: true };
  let p = it.payload as Record<string, unknown>;
  if (it.table === 'settings') { const { sync: _s, ...rest } = p as unknown as Settings; p = rest as unknown as Record<string, unknown>; }
  const updatedAt = Math.round(Number(p.updatedAt ?? p.at ?? it.at) || it.at);
  return { data: JSON.stringify(p), updatedAt };
}

export async function pushCloud(): Promise<{ pushed: number; conflicts: number }> {
  const me = uid || currentUser()?.uid || '';
  if (!me || pushing) return { pushed: 0, conflicts: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus({ state: 'offline' }); return { pushed: 0, conflicts: 0 }; }
  pushing = true;
  let pushed = 0, conflicts = 0;
  try {
    const items = await db.outbox.toArray();
    setStatus({ pending: items.length, state: items.length ? 'syncing' : 'idle' });
    const { fs } = cloud();
    for (const it of coalesce(items)) {
      if (shouldPush(it)) {
        try {
          await setDoc(doc(fs, 'users', me, it.table, String(it.key)), serialise(it));
          pushed++;
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === 'permission-denied') conflicts++; // server already has a newer copy (or account suspended)
          else throw e;
        }
      }
      // remove every queued change of this record (coalesced)
      const same = items.filter((x) => x.table === it.table && x.key === it.key).map((x) => x.id!);
      await db.outbox.bulkDelete(same);
    }
    const left = await db.outbox.count();
    setStatus({ state: 'idle', pending: left, lastPushAt: Date.now(), error: undefined, conflicts });
  } catch (e) {
    setStatus({ state: 'error', error: (e as Error).message });
    reportError('sync', (e as Error).message);
  } finally {
    pushing = false;
  }
  return { pushed, conflicts };
}

/** True when a settings record is exactly the app's defaults (ignoring id, timestamps and the device-local sync config). */
export function isPristineDefault(s: Settings | undefined): boolean {
  if (!s) return false;
  const strip = (x: Settings) => { const { updatedAt: _u, sync: _s, id: _i, ...rest } = x as Settings & { updatedAt?: number }; return JSON.stringify(rest); };
  return strip(s) === strip(defaultSettings());
}

async function applyRemote(table: SyncTable, key: string, rec: { data: string; updatedAt: number; deleted?: boolean }) {
  const t = db.table(table);
  const local = (await t.get(table === 'foodChanges' ? Number(key) : key)) as { updatedAt?: number; at?: number } | undefined;
  const lUpd = local?.updatedAt ?? local?.at ?? -1;
  // untouched default settings (created on this device, never saved by the user) never outrank the account's settings
  const pristine = table === 'settings' && isPristineDefault(local as unknown as Settings | undefined);
  if (local && !pristine && lUpd > rec.updatedAt) return; // local is newer — it will be pushed
  if (rec.deleted) { if (local) await t.delete(table === 'foodChanges' ? Number(key) : key); return; }
  let value: Record<string, unknown>;
  try { value = JSON.parse(rec.data); } catch { return; }
  if (table === 'body') {
    // one measurement per date on this device (unique index): when the same date exists under another id (entered
    // again after a data loss), the newer one is shown here; the other stays untouched in the cloud
    const other = await db.body.where('date').equals(String(value.date)).first();
    if (other && other.id !== key) {
      if ((other.updatedAt ?? 0) >= rec.updatedAt) return;
      await db.body.delete(other.id);
    }
  }
  if (table === 'settings') {
    const cur = await db.settings.get('main');
    await db.settings.put({ ...(value as unknown as Settings), id: 'main', sync: cur?.sync ?? (value as unknown as Settings).sync });
    return;
  }
  await t.put(value);
}

/**
 * Where the live listener starts for a table. The "last seen" marker lives in localStorage while the records live in
 * IndexedDB; if the records are gone (browser storage partly cleared, a new local database for the same account) but
 * the marker survived, starting from the marker would never download the older records again. So an empty local
 * table always starts from 0 (full download). Nothing local is overwritten: applyRemote keeps newer local copies.
 */
async function startFrom(table: SyncTable): Promise<number> {
  const last = getLast(table);
  if (!last || table === 'settings') return 0; // settings is one document: always re-read it
  try { if ((await db.table(table).count()) === 0) return 0; } catch { /* fall back to the marker */ }
  return last;
}

/** Forgets every "last seen" marker of this account so the next start downloads everything again (non-destructive). */
export function resetCloudMarkers(userId: string) {
  for (const t of Object.keys(SYNC_TABLES)) { try { localStorage.removeItem(`${MARK}${userId}.${t}`); } catch { /* ignore */ } }
}

async function listen() {
  const { fs } = cloud();
  const me = uid;
  for (const table of Object.keys(SYNC_TABLES) as SyncTable[]) {
    const from = await startFrom(table);
    if (uid !== me) return; // stopped meanwhile
    const q = query(collection(fs, 'users', uid, table), where('updatedAt', '>', from));
    unsubs.push(onSnapshot(q, async (snap) => {
      for (const ch of snap.docChanges()) {
        if (ch.type === 'removed') continue;
        const rec = ch.doc.data() as { data: string; updatedAt: number; deleted?: boolean };
        // one record that cannot be applied must never stop the rest of the download
        try { await applyRemote(table, ch.doc.id, rec); } catch (e) { reportError('sync-apply', `${table}/${ch.doc.id}: ${(e as Error).message}`); }
        setLast(table, rec.updatedAt);
      }
    }, (e) => { setStatus({ state: 'error', error: e.message }); }));
  }
  // shared verified foods
  unsubs.push(onSnapshot(collection(fs, 'foods'), async (snap) => {
    const parsed = snap.docs.map((d) => ({ ...(d.data() as ParsedFood), sheetKey: d.id, issues: [], missingValues: false }) as ParsedFood);
    if (parsed.length) await importParsedFoods(parsed, 'sheet');
  }, () => { /* offline: local copy keeps working */ }));
}

/** Starts sync for a signed-in user (called once at boot after the user's local database is selected). */
export function startCloudSync(userId: string, onLocalChange: (fn: () => void) => void) {
  stopCloudSync();
  uid = userId;
  void listen();
  const schedule = (ms = 1500) => { clearTimeout(timer); timer = setTimeout(() => { pushCloud(); }, ms); };
  onLocalChange(() => schedule());
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => schedule(300));
    window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  }
  schedule(500);
}

export function stopCloudSync() {
  unsubs.forEach((u) => u());
  unsubs = [];
  clearTimeout(timer);
  uid = '';
}

/** Publishes verified foods to the shared database (admin only — refused by the server for everyone else). */
export async function publishSharedFoods(foods: Food[]): Promise<number> {
  const { fs } = cloud();
  let n = 0;
  for (const f of foods) {
    const id = f.sheetKey && /^F\d+$/.test(f.sheetKey) ? f.sheetKey : f.id;
    const pf: Omit<ParsedFood, 'issues' | 'missingValues'> = {
      row: f.sheetRow ?? 0, sheetKey: id, nameAr: f.nameAr, nameEn: f.nameEn, category: f.category, per100: f.per100, pieceGrams: f.pieceGrams ?? undefined,
      state: f.state, stateLabel: f.stateLabel, prep: f.prep, notes: f.notes
    };
    await setDoc(doc(fs, 'foods', id), JSON.parse(JSON.stringify(pf)));
    n++;
  }
  return n;
}
