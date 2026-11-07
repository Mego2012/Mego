/**
 * Multi-user acceptance test in real browsers (Playwright) against the official Firebase Auth + Firestore emulators.
 * Run: npm run build && npm run e2e:multi   (firebase emulators:exec starts the emulators)
 * Several isolated browser contexts = several devices used at the same time.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createGas } from './gas-mock.mjs';

const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium, devices } = pw;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = 'http://localhost:4188/';
const PROJECT = 'demo-mego';
const CONFIG = { apiKey: 'demo-key', authDomain: 'demo-mego.firebaseapp.com', projectId: PROJECT, aiBackendUrl: 'https://script.google.com/macros/s/PUBLIC-AI/exec',
  emulator: { authUrl: 'http://127.0.0.1:9099', firestoreHost: '127.0.0.1', firestorePort: 8080 } };
const PW = 'Str0ngPass1';

const results = [];
const record = (id, ok, detail = '') => { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`); };
async function check(id, fn) { try { record(id, true, (await fn()) || ''); } catch (e) { record(id, false, String(e?.message || e).split('\n')[0]); } }
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 300)); } throw new Error('timeout'); };
const owner = { Authorization: 'Bearer owner' };
const fsDoc = (p) => `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${p}`;

// public AI backend = the real Code.gs; Google token check decodes the emulator's (unsigned) ID token
const b64json = (s) => JSON.parse(Buffer.from(s.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
const gas = createGas({ token: 'unused', scriptProps: { GEMINI_API_KEY: 'AIzaMultiUserTestKey_00000000000000000', FIREBASE_API_KEY: 'demo-key', FIREBASE_PROJECT_ID: PROJECT, AI_USER_DAILY_LIMIT: '1' },
  ai: (req) => {
    if (req.url.startsWith('https://identitytoolkit.googleapis.com/')) { try { return { json: { users: [{ localId: b64json(req.body.idToken).user_id }] } }; } catch { return { code: 400, json: {} }; } }
    if (req.url.startsWith('https://firestore.googleapis.com/')) return { json: { fields: { status: { stringValue: 'active' }, country: { stringValue: 'SA' } } } };
    const text = req.body.contents[0].parts[1].text;
    const key = text.split('\n').find((l) => /chicken/i.test(l) && l.includes(' | '))?.split(' | ')[0] ?? '';
    const out = { is_food: true, meal_name_ar: 'دجاج', meal_name_en: 'Chicken', notes: '', items: [{ name_ar: 'صدر دجاج مشوي', name_en: 'Grilled chicken breast', food_key: key, grams: 150, grams_low: 120, grams_high: 180, state: 'cooked', cooking_method: 'grilled', kind: 'food', confidence: 0.9, reason: '', est_per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 } }] };
    return { json: { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }] } };
  } });

const server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', '4188', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const browser = await chromium.launch();
/** SHOTS=1: also capture the account screens (light + dark) into docs/screenshots for the visual audit. */
const SHOT_DIR = path.join(ROOT, 'docs', 'screenshots');
async function shot(page, name) {
  if (!process.env.SHOTS) return;
  const lang = await page.evaluate(() => document.documentElement.lang || 'ar');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}-${lang.slice(0, 2)}-${scheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}
async function deviceCtx(locale = 'ar-SA') {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale, timezoneId: 'Asia/Riyadh' });
  await ctx.route('**/firebase-config.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CONFIG) }));
  await ctx.route('https://script.google.com/**', async (r) => { const body = JSON.parse(r.request().postData() || '{}'); await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(gas.post(body)) }); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  return { ctx, page };
}
async function register(page, name, email, country = 'SA') {
  await page.goto(BASE);
  await page.getByTestId('welcome').waitFor();
  if (name !== 'Carol') await shot(page, 'welcome');
  await page.getByTestId('wel-register').click();
  await page.getByTestId('reg-name').fill(name);
  await page.getByTestId('reg-email').fill(email);
  await page.getByTestId('reg-password').fill(PW);
  await page.getByTestId('reg-country').selectOption(country);
  await page.getByTestId('reg-age18').check();
  await page.getByTestId('reg-terms').check();
  await page.getByTestId('reg-next1').click();
  if (name !== 'Carol') await shot(page, 'register');
  await page.getByTestId('reg-weight').fill(name === 'Alice' ? '62' : '90');
  await page.getByTestId('reg-next2').click();
  await page.getByTestId('reg-t-kcal').fill(name === 'Alice' ? '1700' : '2600');
  await page.getByTestId('reg-submit').click();
  await page.getByTestId('dashboard').waitFor({ timeout: 20000 });
}
async function login(page, email, password = PW) {
  await page.goto(BASE);
  await page.getByTestId('wel-login').click();
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('dashboard').waitFor({ timeout: 20000 });
}
async function logCustomFood(page, name, grams) {
  await page.goto(BASE + '#/diary');
  await page.getByTestId('add-lunch').click();
  await page.getByTestId('food-search').fill(name);
  await page.getByTestId('create-from-search').click();
  for (const [id, v] of [['fe-kcal', '165'], ['fe-protein', '31'], ['fe-carbs', '0'], ['fe-fat', '3.6']]) await page.getByTestId(id).fill(v);
  await page.getByTestId('fe-save').click();
  await page.getByTestId('qty-input').fill(String(grams));
  await page.getByTestId('qty-submit').click();
  await page.keyboard.press('Escape');
}
const diaryText = async (page) => { await page.goto(BASE + '#/diary'); await page.getByTestId('diary').waitFor(); return page.getByTestId('diary').innerText(); };

const A = await deviceCtx();         // Alice's phone
const B = await deviceCtx('en-US');  // Bob's phone (English)
let uids = {};

await check('REGISTER-3', async () => {
  await register(A.page, 'Alice', 'alice@example.com');
  await register(B.page, 'Bob', 'bob@example.com');
  const C = await deviceCtx(); await register(C.page, 'Carol', 'carol@example.com', 'DE'); await C.ctx.close();
  const list = await (await fetch(fsDoc('profiles'), { headers: owner })).json();
  uids = Object.fromEntries(list.documents.map((d) => [d.fields.email.stringValue.split('@')[0], d.name.split('/').pop()]));
  const kcal = (await A.page.getByTestId('kcal-target').innerText()).replace(/[^\d]/g, '');
  if (kcal !== '1700') throw new Error('Alice target from onboarding: ' + kcal);
  return `${list.documents.length} profiles; Alice target ${kcal} kcal`;
});

await check('LOG+ISOLATION', async () => {
  await logCustomFood(A.page, 'Alice chicken', 200);
  await logCustomFood(B.page, 'Bob chicken', 300);
  await until(async () => (await (await fetch(fsDoc(`users/${uids.alice}/entries`), { headers: owner })).json()).documents?.length === 1);
  await until(async () => (await (await fetch(fsDoc(`users/${uids.bob}/entries`), { headers: owner })).json()).documents?.length === 1);
  const a = await diaryText(A.page), b = await diaryText(B.page);
  if (!a.includes('Alice chicken') || a.includes('Bob chicken')) throw new Error('Alice sees: ' + a.slice(0, 120));
  if (!b.includes('Bob chicken') || b.includes('Alice chicken')) throw new Error('Bob sees: ' + b.slice(0, 120));
  // the server refuses Bob's session reading Alice's records (token from Bob's page)
  const bobToken = await B.page.evaluate(() => new Promise((res) => { const r = indexedDB.open('firebaseLocalStorageDb'); r.onsuccess = () => { const q = r.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll(); q.onsuccess = () => res(q.result[0]?.value?.stsTokenManager?.accessToken); }; }));
  const denied = await fetch(fsDoc(`users/${uids.alice}/entries`), { headers: { Authorization: 'Bearer ' + bobToken } });
  if (denied.status !== 403) throw new Error('server returned ' + denied.status + ' for Bob reading Alice');
  return 'each diary shows only its own food; server 403 for cross-account read';
});

await check('SECOND-DEVICE-LIVE', async () => {
  const L = await deviceCtx();
  await login(L.page, 'alice@example.com');
  await until(async () => (await diaryText(L.page)).includes('Alice chicken'));
  // simultaneous: water added on the phone appears on the open laptop
  await A.page.goto(BASE); await A.page.getByTestId('dash-water-250').click();
  await L.page.goto(BASE);
  await until(async () => (await L.page.getByTestId('dash-water').innerText()).replace(/[^\d]/g, '') === '250');
  await L.ctx.close();
  return 'laptop received the diary and live water update';
});

await check('AI-SCAN-ACCOUNT', async () => {
  const shotBuf = await A.page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 300, height: 200 } });
  await A.page.goto(BASE);
  await A.page.getByTestId('scan-camera-input').setInputFiles({ name: 'meal.png', mimeType: 'image/png', buffer: shotBuf });
  await A.page.getByTestId('scan-analyze').click();
  await A.page.getByTestId('scan-review').waitFor({ timeout: 15000 });
  await A.page.keyboard.press('Escape');
  // per-user limit is 1: the second scan of the day is refused with a clear message
  await A.page.getByTestId('scan-camera-input').setInputFiles({ name: 'meal.png', mimeType: 'image/png', buffer: shotBuf });
  await A.page.getByTestId('scan-analyze').click();
  await A.page.getByTestId('scan-error').waitFor();
  const msg = await A.page.getByTestId('scan-error').innerText();
  if (!/1/.test(msg)) throw new Error('limit message: ' + msg);
  return msg.slice(0, 60);
});

await check('PASSWORD-RESET', async () => {
  const R = await deviceCtx();
  await R.page.goto(BASE);
  await R.page.getByTestId('wel-login').click();
  await R.page.getByTestId('forgot').click();
  await R.page.getByTestId('reset-email').fill('bob@example.com');
  await R.page.getByTestId('reset-submit').click();
  await R.page.getByTestId('reset-sent').waitFor();
  const codes = await (await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`)).json();
  const code = codes.oobCodes.find((c) => c.email === 'bob@example.com' && c.requestType === 'PASSWORD_RESET');
  if (!code) throw new Error('no reset email');
  // complete the reset with the emailed code, then sign in with the new password
  const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oobCode: code.oobCode, newPassword: 'N3wPassword9' }) });
  if (!r.ok) throw new Error('reset failed');
  await login(R.page, 'bob@example.com', 'N3wPassword9');
  await R.ctx.close();
  return 'reset email sent, new password works';
});

await check('FOOD-SUBMISSION', async () => {
  // Bob proposes his personal food; it is not public until an admin approves it
  await B.page.goto(BASE + '#/foods');
  await B.page.getByTestId('foods-search').fill('Bob chicken');
  await B.page.getByTestId('food-row').first().click();
  await B.page.getByTestId('fe-submit-shared').click();
  await until(async () => (await (await fetch(fsDoc('foodSubmissions'), { headers: owner })).json()).documents?.length === 1);
  const shared = await (await fetch(fsDoc('foods'), { headers: owner })).json();
  if (shared.documents?.length) throw new Error('published before review');
  return 'submitted, waiting for review';
});

await check('ADMIN', async () => {
  await fetch(fsDoc(`admins/${uids.carol}`), { method: 'PATCH', headers: { ...owner, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { since: { integerValue: '1' } } }) });
  const AD = await deviceCtx();
  await login(AD.page, 'carol@example.com');
  await AD.page.goto(BASE + '#/admin');
  await AD.page.getByTestId('admin-stats').waitFor();
  await until(async () => /3/.test(await AD.page.getByTestId('admin-stats').innerText()));
  const stats = await AD.page.getByTestId('admin-stats').innerText();
  await AD.page.waitForTimeout(800);
  await shot(AD.page, 'admin');
  await AD.page.getByTestId('sub-approve').first().click();
  await until(async () => (await (await fetch(fsDoc('foods'), { headers: owner })).json()).documents?.length === 1);
  const page = await AD.page.locator('main').innerText();
  if (page.includes('Alice chicken') || page.includes('Bob chicken')) throw new Error('private data visible to admin');
  // suspend Bob → Bob's app shows the suspended screen; reactivate
  const row = AD.page.getByTestId('admin-users').locator('li').filter({ hasText: 'bob@example.com' });
  await row.getByTestId('admin-toggle').click();
  await until(async () => /موقوف|Suspended/.test(await row.innerText()));
  // Bob's old session ended when his password was reset; signing in again leads to the suspended screen
  await B.page.goto(BASE);
  await B.page.getByTestId('wel-login').click();
  await B.page.getByTestId('login-email').fill('bob@example.com');
  await B.page.getByTestId('login-password').fill('N3wPassword9');
  await B.page.getByTestId('login-submit').click();
  await B.page.getByTestId('suspended').waitFor({ timeout: 20000 });
  await row.getByTestId('admin-toggle').click();
  await until(async () => /نشط|Active/.test(await row.innerText()));
  await AD.ctx.close();
  return stats.replace(/\n/g, ' ').slice(0, 80);
});

await check('LOGOUT+DELETE', async () => {
  await A.page.goto(BASE + '#/settings');
  await A.page.getByTestId('account-card').waitFor();
  await shot(A.page, 'account');
  await A.page.getByTestId('acc-logout').click();
  await A.page.getByTestId('welcome').waitFor();
  await login(A.page, 'alice@example.com');
  await A.page.goto(BASE + '#/settings');
  await A.page.getByTestId('acc-delete').click();
  await A.page.getByTestId('delete-password').fill(PW);
  await A.page.getByTestId('delete-confirm-btn').click();
  await A.page.getByTestId('welcome').waitFor({ timeout: 20000 });
  const prof = await fetch(fsDoc(`profiles/${uids.alice}`), { headers: owner });
  const ent = await (await fetch(fsDoc(`users/${uids.alice}/entries`), { headers: owner })).json();
  if (prof.status !== 404 || ent.documents?.length) throw new Error('data left after deletion');
  const bobStill = await (await fetch(fsDoc(`users/${uids.bob}/entries`), { headers: owner })).json();
  if (bobStill.documents?.length !== 1) throw new Error("Bob's data affected");
  return 'account, profile and records removed; other users untouched';
});

await browser.close();
server.kill();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} multi-user checks passed`);
process.exit(failed ? 1 : 0);
