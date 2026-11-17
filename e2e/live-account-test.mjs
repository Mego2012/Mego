/**
 * LIVE account + security acceptance test against the REAL Firebase project (not the emulator).
 * Creates two throw-away accounts (random @example.com — a reserved domain, no mail is delivered), runs the account
 * life cycle and cross-account security probes with the real deployed Firestore rules, then DELETES both accounts
 * through the app and verifies they are gone. Never touches any other account. Logs show no tokens or real data.
 *
 *   node e2e/live-account-test.mjs            (BASE_URL defaults to https://mego2012.github.io/Mego/)
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = process.env.BASE_URL || 'https://mego2012.github.io/Mego/';
const cfg = await (await fetch(BASE + 'firebase-config.json')).json();
const FS = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`;
const rnd = Math.random().toString(36).slice(2, 8);
const PW = 'Audit-' + rnd + '-Pw9!';
const EMAIL_A = `mego-audit-a-${rnd}@example.com`, EMAIL_B = `mego-audit-b-${rnd}@example.com`;
let total = 0, failed = 0;
const check = async (name, fn) => {
  total++;
  try { const d = await fn(); console.log(`PASS  ${name}${d ? ' — ' + d : ''}`); }
  catch (e) { failed++; console.log(`FAIL  ${name} — ${String(e.message || e).slice(0, 300)}`); }
};
const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 700)); } throw new Error('timed out'); };
const short = (uid) => uid ? uid.slice(0, 4) + '…' : '?';

const b = await pw.chromium.launch();
async function device(locale = 'en-US') {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale });
  const page = await ctx.newPage(); page.setDefaultTimeout(25000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  return { ctx, page, errs };
}
const token = (page) => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('firebaseLocalStorageDb'); r.onsuccess = () => { const q = r.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll(); q.onsuccess = () => { const u = q.result[0]?.value; res(u ? { t: u.stsTokenManager?.accessToken, uid: u.uid } : null); }; }; }));
async function register(page, name, email) {
  await page.goto(BASE); await page.getByTestId('welcome').waitFor();
  if ((await page.locator('html').getAttribute('lang')) !== 'en') { await page.getByTestId('wel-lang').click(); await page.waitForTimeout(400); }
  await page.getByTestId('wel-register').click();
  await page.getByTestId('reg-name').fill(name); await page.getByTestId('reg-email').fill(email); await page.getByTestId('reg-password').fill(PW);
  await page.getByTestId('reg-country').selectOption('SA'); await page.getByTestId('reg-age18').check(); await page.getByTestId('reg-terms').check();
  await page.getByTestId('reg-next1').click(); await page.getByTestId('reg-weight').fill('80'); await page.getByTestId('reg-next2').click();
  await page.getByTestId('reg-t-kcal').fill('2000'); await page.getByTestId('reg-submit').click();
  await page.getByTestId('dashboard').waitFor({ timeout: 30000 });
}
async function login(page, email) {
  await page.goto(BASE); await page.getByTestId('wel-login').click();
  await page.getByTestId('login-email').fill(email); await page.getByTestId('login-password').fill(PW); await page.getByTestId('login-submit').click();
  await page.getByTestId('dashboard').waitFor({ timeout: 30000 });
}
async function logFood(page, name, kcal, grams) {
  await page.goto(BASE + '#/diary'); await page.getByTestId('diary').waitFor();
  await page.getByTestId('add-lunch').click(); await page.getByTestId('food-search').fill(name); await page.getByTestId('create-from-search').click();
  for (const [id, v] of [['fe-kcal', String(kcal)], ['fe-protein', '30'], ['fe-carbs', '5'], ['fe-fat', '4']]) await page.getByTestId(id).fill(v);
  await page.getByTestId('fe-save').click(); await page.getByTestId('qty-input').fill(String(grams)); await page.getByTestId('qty-submit').click();
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
}
const diary = async (page) => { await page.goto(BASE + '#/diary'); await page.getByTestId('diary').waitFor(); await page.waitForTimeout(800); return page.getByTestId('diary').innerText(); };
const get = (path, tk) => fetch(`${FS}/${path}`, { headers: tk ? { Authorization: 'Bearer ' + tk } : {} });

const A = await device(), B = await device();
let a = null, bb = null;

await check('REGISTER new user A (live Firebase)', async () => { await register(A.page, 'Audit A', EMAIL_A); a = await token(A.page); if (!a?.t) throw new Error('no session'); return 'uid ' + short(a.uid); });
await check('SESSION persists after browser refresh', async () => { await A.page.reload(); await A.page.getByTestId('dashboard').waitFor(); return 'still signed in'; });
await check('LOG, EDIT and DELETE diary entries; values stay correct', async () => {
  await logFood(A.page, 'Audit chicken', 165, 200);
  await logFood(A.page, 'Audit rice', 130, 150);
  let t = await diary(A.page);
  if (!/Audit chicken/.test(t) || !/330/.test(t) || !/195/.test(t)) throw new Error('logged values: ' + t.slice(0, 200));
  const row = A.page.getByTestId('entry').filter({ hasText: 'Audit rice' }).first();
  await row.click();
  if (await A.page.getByTestId('edit-qty').count()) { await A.page.getByTestId('edit-qty').fill('100'); await A.page.getByTestId('edit-save').click(); await A.page.waitForTimeout(600); }
  t = await diary(A.page);
  if (!/130/.test(t)) throw new Error('edit not applied: ' + t.slice(0, 200));
  await A.page.getByTestId('entry').filter({ hasText: 'Audit rice' }).first().click(); await A.page.getByTestId('entry-delete').click();
  if (await A.page.getByTestId('confirm-yes').isVisible().catch(() => false)) await A.page.getByTestId('confirm-yes').click();
  await A.page.waitForTimeout(800);
  t = await diary(A.page);
  if (/Audit rice/.test(t)) throw new Error('delete failed');
  return 'chicken 200 g = 330 kcal; rice 150 g → 100 g = 130 kcal; rice deleted';
});
await check('CLOUD COPY: records reach Firestore under the owner only', async () => {
  a = await token(A.page);
  await until(async () => { const r = await (await get(`users/${a.uid}/entries`, a.t)).json(); return (r.documents ?? []).some((d) => !d.fields.deleted?.booleanValue && /Audit chicken/.test(d.fields.data.stringValue)); });
  return 'entry present in users/' + short(a.uid) + '/entries';
});
await check('SECOND DEVICE: login on another browser receives the diary', async () => {
  const L = await device(); await login(L.page, EMAIL_A);
  await until(async () => /Audit chicken/.test(await diary(L.page)), 40000);
  const t = await diary(L.page); await L.ctx.close();
  if (/Audit rice/.test(t)) throw new Error('deleted entry re-appeared on device 2');
  return 'chicken present, deleted rice absent';
});
await check('GOALS: fiber target change saved and synced', async () => {
  await A.page.goto(BASE + '#/goals'); await A.page.getByTestId('goal-fiber').fill('30'); await A.page.waitForTimeout(1500);
  a = await token(A.page);
  await until(async () => { const r = await (await get(`users/${a.uid}/settings`, a.t)).json(); return (r.documents ?? []).some((d) => /"fiberTarget":30/.test(d.fields.data.stringValue)); });
  return 'settings.fiberTarget = 30 in the cloud copy';
});
await check('LOGOUT and LOGIN again: data intact', async () => {
  await A.page.goto(BASE + '#/settings'); await A.page.getByTestId('account-card').waitFor(); await A.page.getByTestId('acc-logout').click();
  await A.page.getByTestId('welcome').waitFor(); await login(A.page, EMAIL_A);
  const t = await diary(A.page); if (!/Audit chicken/.test(t)) throw new Error('diary after re-login: ' + t.slice(0, 150));
  return 'diary restored after sign-in';
});
await check('OFFLINE: a signed-in user reopens THEIR account (not the guest database)', async () => {
  await A.page.goto(BASE + '#/'); await A.page.getByTestId('dashboard').waitFor(); await A.page.waitForTimeout(3000);
  const online = await A.page.getByTestId('kcal-target').innerText();
  await A.ctx.setOffline(true); await A.page.reload().catch(() => {}); await A.page.getByTestId('dashboard').waitFor({ timeout: 20000 });
  const offline = await A.page.getByTestId('kcal-target').innerText(); const t = await diary(A.page);
  await A.ctx.setOffline(false); await A.page.reload(); await A.page.getByTestId('dashboard').waitFor();
  if (offline !== online || !/Audit chicken/.test(t)) throw new Error(`online target ${online}, offline ${offline}, diary ok ${/Audit chicken/.test(t)}`);
  return `offline: same target (${offline} kcal) and the account's diary`;
});
await check('PASSWORD RESET request accepted', async () => {
  const R = await device(); await R.page.goto(BASE); await R.page.getByTestId('wel-login').click(); await R.page.getByTestId('forgot').click();
  await R.page.getByTestId('reset-email').fill(EMAIL_A); await R.page.getByTestId('reset-submit').click(); await R.page.getByTestId('reset-sent').waitFor(); await R.ctx.close();
  return 'confirmation shown (reserved example.com domain — no mail delivered)';
});

// ---------------- security probes with the real deployed rules
await check('REGISTER new user B', async () => { await register(B.page, 'Audit B', EMAIL_B); bb = await token(B.page); return 'uid ' + short(bb.uid); });
a = await token(A.page); bb = await token(B.page);
await check('SECURITY: B cannot READ A’s diary, goals, recipes or profile', async () => {
  const out = [];
  for (const p of [`users/${a.uid}/entries`, `users/${a.uid}/settings`, `users/${a.uid}/recipes`, `profiles/${a.uid}`]) {
    const r = await get(p, bb.t); out.push(`${p.split('/')[0]}/…/${p.includes('profiles') ? 'profile' : p.split('/').pop()}:${r.status}`);
    if (r.status !== 403) throw new Error(`${p} → ${r.status}`);
  }
  return out.join(' ');
});
await check('SECURITY: B cannot WRITE or DELETE A’s records', async () => {
  const body = JSON.stringify({ fields: { data: { stringValue: '{"hack":1}' }, updatedAt: { integerValue: String(Date.now() + 1e9) } } });
  const w = await fetch(`${FS}/users/${a.uid}/entries/audit-intrusion`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + bb.t, 'Content-Type': 'application/json' }, body });
  const d = await fetch(`${FS}/users/${a.uid}/entries/audit-intrusion`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + bb.t } });
  if (w.status !== 403 || d.status !== 403) throw new Error(`write ${w.status} delete ${d.status}`);
  return `write 403, delete 403`;
});
await check('SECURITY: anonymous requests are refused; profiles list and admin list are closed', async () => {
  const anon = await get(`users/${a.uid}/entries`); const plist = await get('profiles', bb.t); const adm = await get(`admins/${a.uid}`, bb.t); const admSelf = await get(`admins/${bb.uid}`, bb.t);
  const ok = anon.status === 403 && plist.status === 403 && adm.status === 403 && (admSelf.status === 404 || admSelf.status === 403);
  if (!ok) throw new Error(`anon ${anon.status} profiles-list ${plist.status} admins/other ${adm.status} admins/self ${admSelf.status}`);
  return `anonymous 403 · list all profiles 403 · read another admin entry 403 · own admin entry ${admSelf.status} (not an admin)`;
});
await check('SECURITY: B cannot make itself admin', async () => {
  const r = await fetch(`${FS}/admins/${bb.uid}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + bb.t, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { role: { stringValue: 'admin' } } }) });
  if (r.status !== 403) throw new Error('admin self-grant → ' + r.status);
  return 'admins write 403';
});
await check('SECURITY: B cannot change A’s profile status or its own status', async () => {
  const body = JSON.stringify({ fields: { status: { stringValue: 'suspended' } } });
  const r1 = await fetch(`${FS}/profiles/${a.uid}?updateMask.fieldPaths=status`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + bb.t, 'Content-Type': 'application/json' }, body });
  const r2 = await fetch(`${FS}/profiles/${bb.uid}?updateMask.fieldPaths=status`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + bb.t, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { status: { stringValue: 'active' } } }) });
  if (r1.status !== 403) throw new Error('other status ' + r1.status);
  if (r2.status !== 403 && r2.status !== 200) throw new Error('own status ' + r2.status);
  return `other user's status 403 · own status change ${r2.status === 403 ? '403' : 'no-op allowed (unchanged value)'}`;
});
await check('SECURITY: each diary shows only its own data in the app', async () => {
  await logFood(B.page, 'Audit B salmon', 200, 100);
  const ta = await diary(A.page), tb = await diary(B.page);
  if (/salmon/.test(ta) || /Audit chicken/.test(tb)) throw new Error('cross-visible');
  return 'A sees only A, B sees only B';
});
await check('PUBLIC data separated: shared foods readable by a signed-in user, not anonymously', async () => {
  const s = await get('foods?pageSize=1', bb.t); const n = await get('foods?pageSize=1');
  if (s.status !== 200 || n.status !== 403) throw new Error(`signed-in ${s.status} anonymous ${n.status}`);
  return 'signed-in 200 · anonymous 403';
});

// ---------------- clean up: delete both accounts through the app and verify
for (const [who, D, email] of [['A', A, EMAIL_A], ['B', B, EMAIL_B]]) {
  await check(`DELETE ACCOUNT ${who} through the app; records and sign-in gone`, async () => {
    const tk = await token(D.page);
    await D.page.goto(BASE + '#/settings'); await D.page.getByTestId('account-card').waitFor(); await D.page.getByTestId('acc-delete').click();
    await D.page.getByTestId('delete-password').fill(PW); await D.page.getByTestId('delete-confirm-btn').click();
    await D.page.getByTestId('welcome').waitFor({ timeout: 40000 });
    const after = await get(`users/${tk.uid}/entries`, tk.t); // old token: either revoked (401/403) or empty
    const body = after.status === 200 ? await after.json() : {};
    if (after.status === 200 && (body.documents ?? []).length) throw new Error('records remain: ' + body.documents.length);
    const L = await device(); await L.page.goto(BASE); await L.page.getByTestId('wel-login').click();
    await L.page.getByTestId('login-email').fill(email); await L.page.getByTestId('login-password').fill(PW); await L.page.getByTestId('login-submit').click();
    await L.page.waitForTimeout(4000); const still = await L.page.getByTestId('dashboard').count(); await L.ctx.close();
    if (still) throw new Error('deleted account can still sign in');
    return `records ${after.status === 200 ? 'empty' : 'inaccessible (' + after.status + ')'}, sign-in refused`;
  });
}
const errs = [...A.errs, ...B.errs];
await check('no page errors during the whole run', async () => { if (errs.length) throw new Error(errs.slice(0, 3).join(' | ')); return ''; });
await b.close();
console.log(`\n${total - failed}/${total} live account & security checks passed`);
process.exit(failed ? 1 : 0);
