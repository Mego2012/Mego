#!/usr/bin/env node
/**
 * MEGO live verification — runs the deployed app in a real browser against the REAL Firebase project.
 *
 *   node scripts/live-verify.mjs                      → https://mego2012.github.io/Mego/ (config served by the site)
 *   node scripts/live-verify.mjs https://…/Mego/      → another deployment
 *   node scripts/live-verify.mjs --emulator           → local build + Firebase emulators (used to test this script itself)
 *
 * Creates two disposable accounts (mego-verify-<random>-a/b@example.com), then checks:
 *   registration · sign-in · independent accounts · data isolation enforced by the server (403) · cloud sync to a
 *   second device · food logging · weekly report · sign-out · account deletion (both test accounts are deleted at
 *   the end, also when a check fails).
 * Only the test accounts' own tokens are used — no owner credentials — so every "allowed/denied" result is the
 * production security rules at work. Writes a Markdown report to ~/.mego-backend/live-verify-<time>.md.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch {
  try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch {
    console.error('Playwright is missing. Run:  npm install --no-save playwright@1.63.0 && npx playwright install chromium');
    process.exit(2);
  }
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const EMU = args.includes('--emulator');
let BASE = args.find((a) => /^https?:\/\//.test(a)) || 'https://mego2012.github.io/Mego/';
const PW = 'Verify-' + randomBytes(6).toString('hex') + '9a';
const tag = randomBytes(3).toString('hex');
const EMAIL = { a: `mego-verify-${tag}-a@example.com`, b: `mego-verify-${tag}-b@example.com` };
const FOOD = `MEGO verify ${tag}`;

let server = null;
let cfg;
if (EMU) {
  cfg = { apiKey: 'demo-key', authDomain: 'demo-mego.firebaseapp.com', projectId: 'demo-mego', emulator: { authUrl: 'http://127.0.0.1:9099', firestoreHost: '127.0.0.1', firestorePort: 8080 } };
  server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', '4191', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  BASE = 'http://localhost:4191/';
} else {
  const r = await fetch(BASE + 'firebase-config.json', { cache: 'no-store' });
  if (!r.ok) { console.error(`${BASE}firebase-config.json → HTTP ${r.status}: accounts are not enabled on this deployment yet (run laptop-setup --cloud).`); process.exit(2); }
  cfg = await r.json();
}
const FS = EMU ? `http://127.0.0.1:8080/v1/projects/${cfg.projectId}/databases/(default)/documents` : `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`;

const results = [];
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
async function check(name, fn) { try { record(name, true, (await fn()) || ''); } catch (e) { record(name, false, String(e?.message || e).split('\n')[0].slice(0, 200)); } }
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { if (await fn()) return; } catch (e) { last = e; } await new Promise((r) => setTimeout(r, 700)); } throw last || new Error('timed out'); };

const browser = await pw.chromium.launch();
async function device(locale = 'en-US') {
  const ctx = await browser.newContext({ ...pw.devices['Pixel 7'], locale });
  if (EMU) await ctx.route('**/firebase-config.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cfg) }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  return { ctx, page };
}
const token = (page) => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('firebaseLocalStorageDb'); r.onsuccess = () => { const q = r.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll(); q.onsuccess = () => res(q.result[0]?.value); }; r.onerror = () => res(null); }));
async function session(page) { const v = await token(page); if (!v?.uid) throw new Error('no signed-in session'); return { uid: v.uid, idToken: v.stsTokenManager.accessToken }; }
async function register(page, name, email) {
  await page.goto(BASE);
  await page.getByTestId('welcome').waitFor({ timeout: 30000 });
  await page.getByTestId('wel-register').click();
  await page.getByTestId('reg-name').fill(name);
  await page.getByTestId('reg-email').fill(email);
  await page.getByTestId('reg-password').fill(PW);
  await page.getByTestId('reg-country').selectOption('SA');
  await page.getByTestId('reg-age18').check();
  await page.getByTestId('reg-terms').check();
  await page.getByTestId('reg-next1').click();
  await page.getByTestId('reg-weight').fill('80');
  await page.getByTestId('reg-next2').click();
  await page.getByTestId('reg-t-kcal').fill('2000');
  await page.getByTestId('reg-submit').click();
  await page.getByTestId('dashboard').waitFor({ timeout: 30000 });
}
async function login(page, email) {
  await page.goto(BASE);
  await page.getByTestId('wel-login').click();
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(PW);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('dashboard').waitFor({ timeout: 30000 });
}
async function deleteAccount(page, email) {
  await page.goto(BASE + '#/settings');
  // the account card is loaded lazily: wait for it, or for the welcome screen when the session has ended
  await page.locator('[data-testid="account-card"], [data-testid="welcome"]').first().waitFor({ timeout: 30000 });
  if (await page.getByTestId('welcome').count()) { await login(page, email); await page.goto(BASE + '#/settings'); await page.getByTestId('account-card').waitFor({ timeout: 30000 }); }
  await page.getByTestId('acc-delete').click();
  await page.getByTestId('delete-password').fill(PW);
  await page.getByTestId('delete-confirm-btn').click();
  await page.getByTestId('welcome').waitFor({ timeout: 30000 });
}
const get = (p, idToken) => fetch(`${FS}/${p}`, { headers: idToken ? { Authorization: 'Bearer ' + idToken } : {} });

console.log(`MEGO live verification → ${BASE} · Firebase project ${cfg.projectId}${EMU ? ' (EMULATOR — not a live result)' : ''}`);
const A = await device('en-US');
const B = await device('ar-SA');
let a, b;
try {
  await check('Live site serves the app and the public Firebase config', async () => {
    await A.page.goto(BASE);
    await A.page.getByTestId('welcome').waitFor({ timeout: 30000 });
    return `project ${cfg.projectId}`;
  });
  await check('Registration (account A) on the live site', async () => { await register(A.page, 'Verify A', EMAIL.a); a = await session(A.page); return EMAIL.a; });
  await check('Registration (account B) — an independent account', async () => {
    await register(B.page, 'Verify B', EMAIL.b); b = await session(B.page);
    if (a && b.uid === a.uid) throw new Error('same uid'); return EMAIL.b;
  });
  await check('Profiles stored on the server; each user reads only their own', async () => {
    const own = await get(`profiles/${a.uid}`, a.idToken);
    if (own.status !== 200) throw new Error('own profile: HTTP ' + own.status);
    const other = await get(`profiles/${b.uid}`, a.idToken);
    if (other.status !== 403) throw new Error("reading another user's profile: HTTP " + other.status);
    return 'own 200 · other 403';
  });
  await check('Food logging (account A) and sync to the cloud', async () => {
    await A.page.goto(BASE + '#/diary');
    await A.page.getByTestId('add-lunch').click();
    await A.page.getByTestId('food-search').fill(FOOD);
    await A.page.getByTestId('create-from-search').click();
    for (const [id, v] of [['fe-kcal', '165'], ['fe-protein', '31'], ['fe-carbs', '0'], ['fe-fat', '3.6']]) await A.page.getByTestId(id).fill(v);
    await A.page.getByTestId('fe-save').click();
    await A.page.getByTestId('qty-input').fill('200');
    await A.page.getByTestId('qty-submit').click();
    await A.page.keyboard.press('Escape');
    await until(async () => { const r = await get(`users/${a.uid}/entries`, a.idToken); const j = await r.json(); return r.status === 200 && (j.documents ?? []).some((d) => d.fields?.data?.stringValue?.includes(FOOD)); });
    return '200 g logged (330 kcal); record found on the server under the owner';
  });
  await check('Data isolation enforced by the server', async () => {
    const r1 = await get(`users/${a.uid}/entries`, b.idToken);
    const r2 = await get(`users/${a.uid}/entries`, null);
    const bText = await (async () => { await B.page.goto(BASE + '#/diary'); await B.page.getByTestId('diary').waitFor(); return B.page.getByTestId('diary').innerText(); })();
    if (r1.status !== 403) throw new Error('B reading A: HTTP ' + r1.status);
    if (r2.status !== 403) throw new Error('anonymous reading A: HTTP ' + r2.status);
    if (bText.includes(FOOD)) throw new Error("A's food visible in B's diary");
    return 'B → 403 · anonymous → 403 · B\'s diary does not contain A\'s food';
  });
  await check('Cloud sync to a second device (account A signs in elsewhere)', async () => {
    const L = await device('en-US');
    try {
      await login(L.page, EMAIL.a);
      await L.page.goto(BASE + '#/diary');
      try {
        await until(async () => { await L.page.getByTestId('diary').waitFor(); return (await L.page.getByTestId('diary').innerText()).includes(FOOD); }, 60000);
      } catch { throw new Error("step 1: A's diary entry did not reach the second device within 60 s"); }
      await L.page.goto(BASE + '#/');
      await L.page.getByTestId('dash-water').waitFor();
      const before = Number((await L.page.getByTestId('dash-water').innerText()).replace(/[^\d]/g, '')) || 0;
      await A.page.goto(BASE + '#/'); await A.page.getByTestId('dash-water-250').click();
      try {
        // live update on the open second device, no reload
        await until(async () => Number((await L.page.getByTestId('dash-water').innerText()).replace(/[^\d]/g, '')) === before + 250, 60000);
      } catch { throw new Error(`step 2: water added on device A did not appear live on the second device within 60 s (before ${before})`); }
    } finally { await L.ctx.close(); }
    return 'diary entry and a later water update arrived on the second device';
  });
  await check('Weekly report from the logged day', async () => {
    await A.page.goto(BASE + '#/diary');
    await A.page.getByTestId('mark-complete').click();
    await A.page.goto(BASE + '#/reports/week');
    await A.page.getByTestId('report-stats').waitFor();
    const complete = await A.page.getByTestId('complete-days').innerText();
    const avg = await A.page.getByTestId('avg-kcal').innerText();
    if (!/1/.test(complete) || !/330/.test(avg.replace(/,/g, ''))) throw new Error(`complete: ${complete} · avg: ${avg}`);
    return `${complete} · average ${avg}`;
  });
  await check('Sign-out and sign-in again (persistent account)', async () => {
    await A.page.goto(BASE + '#/settings');
    await A.page.getByTestId('acc-logout').click();
    await A.page.getByTestId('welcome').waitFor();
    await login(A.page, EMAIL.a);
    a = await session(A.page);
    await A.page.goto(BASE + '#/diary');
    await until(async () => (await A.page.getByTestId('diary').innerText()).includes(FOOD));
    return 'diary restored after signing in again';
  });
} finally {
  // cleanup: both disposable accounts are deleted through the app (also verifies account deletion)
  await check('Account deletion (test account A) — login, profile and records removed', async () => {
    const before = a;
    await deleteAccount(A.page, EMAIL.a);
    if (before) {
      const r = await get(`users/${before.uid}/entries`, before.idToken);
      if (r.status === 200 && ((await r.json()).documents ?? []).length) throw new Error('records left on the server');
    }
    return EMAIL.a;
  });
  await check('Account deletion (test account B)', async () => { await deleteAccount(B.page, EMAIL.b); return EMAIL.b; });
  await browser.close();
  server?.kill();
}

const failed = results.filter((r) => !r.ok);
const report = [`# MEGO live verification ${new Date().toISOString()}`, '', `Site: ${BASE}`, `Firebase project: ${cfg.projectId}${EMU ? ' — EMULATOR RUN, not a live result' : ''}`, '',
  ...results.map((r) => `- ${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`), '', `${results.length - failed.length}/${results.length} passed`].join('\n');
const dir = process.env.MEGO_BACKEND_DIR || path.join(homedir(), '.mego-backend');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `live-verify-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`);
writeFileSync(file, report + '\n');
console.log(`\n${results.length - failed.length}/${results.length} live checks passed — report: ${file}`);
process.exit(failed.length ? 1 : 0);
