/**
 * Session handling. Each signed-in account uses its own local database on this device ("mego-u-<uid>"), so two
 * people sharing a phone never see each other's data. Guest mode keeps the original database ("mego-nutrition").
 * Switching account reloads the app, which re-selects the database before anything renders.
 */
import { db, useDatabase } from './db';
import { cloudReady, currentUser, getProfile, initCloud, isAdmin, loadCloudConfig, onUser, touchProfile, type Profile } from './firebase';

const ACTIVE = 'mego.activeUid';
const GUEST = 'mego.guest';
const IMPORT = 'mego.importGuestFor';
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } } };

export interface AccountState { mode: 'guest' | 'account' | 'welcome'; cloud: boolean; uid?: string; profile?: Profile | null; admin?: boolean; suspended?: boolean }
let state: AccountState = { mode: 'guest', cloud: false };
const listeners = new Set<(s: AccountState) => void>();
export const accountState = () => state;
export function subscribeAccount(fn: (s: AccountState) => void) { listeners.add(fn); fn(state); return () => { listeners.delete(fn); }; }
function set(s: Partial<AccountState>) { state = { ...state, ...s }; listeners.forEach((f) => f(state)); }

export const userDbName = (uid: string) => 'mego-u-' + uid;

/** Called before the app renders: decides the mode and selects the right local database. */
export async function bootAccount(): Promise<AccountState> {
  const cfg = await loadCloudConfig();
  if (!cfg) { set({ mode: 'guest', cloud: false }); return state; }
  initCloud(cfg);
  const uid = ls.get(ACTIVE);
  if (uid) {
    useDatabase(userDbName(uid));
    await db.open();
    if (ls.get(IMPORT) === uid) { await copyGuestData(); ls.del(IMPORT); }
    await applyPendingSetup(uid);
    set({ mode: 'account', cloud: true, uid });
    return state;
  }
  set({ mode: ls.get(GUEST) ? 'guest' : 'welcome', cloud: true });
  return state;
}

/** After boot in account mode: confirm the Firebase session, load profile/admin, keep lastActive fresh. */
export function watchSession(onReady: (uid: string) => void) {
  if (!cloudReady() || state.mode !== 'account') return;
  let started = false;
  onUser(async (u) => {
    if (!u || u.uid !== state.uid) { // signed out elsewhere or session expired
      if (state.mode === 'account') { ls.del(ACTIVE); location.reload(); }
      return;
    }
    const [profile, admin] = await Promise.all([getProfile(u.uid).catch(() => null), isAdmin(u.uid)]);
    set({ profile, admin, suspended: profile?.status === 'suspended' });
    touchProfile(u.uid);
    if (!started && profile?.status !== 'suspended') { started = true; onReady(u.uid); }
  });
}

/** Switch to a signed-in account (optionally copying this device's guest data into it once). */
export function enterAccount(uid: string, importGuest: boolean) {
  ls.set(ACTIVE, uid);
  ls.del(GUEST);
  if (importGuest) ls.set(IMPORT, uid);
  location.reload();
}
export function chooseGuest() { ls.set(GUEST, '1'); location.reload(); }
export function leaveAccount() { ls.del(ACTIVE); location.reload(); }
export const signedInUid = () => currentUser()?.uid ?? state.uid;

/** Does this device have guest data worth importing into a new account? */
export async function guestDataSummary(): Promise<{ entries: number; foods: number; body: number }> {
  const { NutritionDB } = await import('./db');
  const g = new NutritionDB('mego-nutrition');
  try {
    await g.open();
    return { entries: await g.entries.count(), foods: await g.foods.count(), body: await g.body.count() };
  } catch { return { entries: 0, foods: 0, body: 0 }; } finally { g.close(); }
}

/** Copies the guest database into the account database (guest data is left untouched) and queues it for upload. */
async function copyGuestData() {
  const { NutritionDB, SYNC_TABLES } = await import('./db');
  const g = new NutritionDB('mego-nutrition');
  await g.open();
  try {
    for (const table of Object.keys(SYNC_TABLES)) {
      const rows = (await g.table(table).toArray()) as Record<string, unknown>[];
      if (!rows.length) continue;
      if (table === 'settings') { const cur = await db.settings.get('main'); await db.table(table).bulkPut(rows.map((r) => ({ ...r, sync: cur?.sync ?? r.sync }))); }
      else await db.table(table).bulkPut(rows);
      const key = SYNC_TABLES[table as keyof typeof SYNC_TABLES];
      await db.outbox.bulkAdd(rows.map((r) => ({ table: table as never, key: String(r[key]), op: 'upsert' as const, payload: r, at: Date.now() })));
    }
    for (const t of ['photos'] as const) { const rows = await g.table(t).toArray(); if (rows.length) await db.table(t).bulkPut(rows); }
  } finally { g.close(); }
}

/** Applies the registration answers (profile + targets) to the new account's own settings, once. */
async function applyPendingSetup(uid: string) {
  const key = 'mego.pendingSetup.' + uid;
  const raw = ls.get(key);
  if (!raw) return;
  try {
    const { profile, targets } = JSON.parse(raw);
    const { saveSettings } = await import('./repo');
    await saveSettings((s) => {
      s.profile = { ...s.profile, ...profile };
      if (targets) { s.targets.training = { ...targets }; s.targets.rest = { ...targets }; }
    });
  } catch { /* keep defaults */ }
  ls.del(key);
}
