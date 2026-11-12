// Reproduces a real incident against the Firebase EMULATOR: the browser loses its IndexedDB (records + Firebase
// session) while localStorage survives. The app shows the welcome screen; the user signs in again with the same
// account. Expected: the diary entries, personal foods and the saved calorie target come back from the cloud.
// Usage: firebase emulators:exec --project demo-mego --only firestore,auth "node e2e/storage-loss.mjs"  (after vite build)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = { apiKey: 'demo-key', authDomain: 'demo-mego.firebaseapp.com', projectId: 'demo-mego', emulator: { authUrl: 'http://127.0.0.1:9099', firestoreHost: '127.0.0.1', firestorePort: 8080 } };
const server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', '4192', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const BASE = 'http://localhost:4192/';
const PW = 'Loss-test-9a', email = `loss-${Date.now().toString(36)}@example.com`, FOOD = 'Storage loss food';
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ ...pw.devices['Pixel 7'], locale: 'en-US' });
await ctx.route('**/firebase-config.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cfg) }));
const p = await ctx.newPage(); p.setDefaultTimeout(30000);
const kcalTarget = () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('mego-u-' + localStorage.getItem('mego.activeUid')); r.onsuccess = () => { const q = r.result.transaction('settings').objectStore('settings').get('main'); q.onsuccess = () => res(q.result?.targets?.training?.kcal ?? null); }; }));
const entries = () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('mego-u-' + localStorage.getItem('mego.activeUid')); r.onsuccess = () => { const q = r.result.transaction('entries').objectStore('entries').count(); q.onsuccess = () => res(q.result); }; }));
let failed = false;
try {
  await p.goto(BASE); await p.getByTestId('welcome').waitFor();
  await p.getByTestId('wel-register').click();
  await p.getByTestId('reg-name').fill('Loss test'); await p.getByTestId('reg-email').fill(email); await p.getByTestId('reg-password').fill(PW);
  await p.getByTestId('reg-country').selectOption('SA'); await p.getByTestId('reg-age18').check(); await p.getByTestId('reg-terms').check();
  await p.getByTestId('reg-next1').click(); await p.getByTestId('reg-weight').fill('80'); await p.getByTestId('reg-next2').click();
  await p.getByTestId('reg-t-kcal').fill('2110'); await p.getByTestId('reg-submit').click(); await p.getByTestId('dashboard').waitFor();
  await p.goto(BASE + '#/diary');
  await p.getByTestId('add-lunch').click(); await p.getByTestId('food-search').fill(FOOD); await p.getByTestId('create-from-search').click();
  for (const [id, v] of [['fe-kcal', '165'], ['fe-protein', '31'], ['fe-carbs', '0'], ['fe-fat', '3.6']]) await p.getByTestId(id).fill(v);
  await p.getByTestId('fe-save').click(); await p.getByTestId('qty-input').fill('200'); await p.getByTestId('qty-submit').click(); await p.keyboard.press('Escape');
  await p.waitForTimeout(6000); // let the outbox reach the cloud and the listener advance its markers
  console.log('before loss: entries', await entries(), '· target', await kcalTarget());
  // the SECOND loss of a user who re-entered data after the first one: the cloud holds the old copy and the
  // re-entered copy (other ids), including two weigh-ins for the same date (unique per date on the device)
  const uidNow = await p.evaluate(() => localStorage.getItem('mego.activeUid'));
  const put = (table, id, obj) => fetch(`http://127.0.0.1:8080/v1/projects/demo-mego/databases/(default)/documents/users/${uidNow}/${table}/${id}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(obj) }, updatedAt: { integerValue: String(obj.updatedAt) } } }) }).then((r) => r.status);
  const t0 = Date.now() - 86400000 * 3;
  const w = { date: '2026-11-01', notes: '', createdAt: t0, waist: 82 };
  console.log('cloud seed', await put('body', 'w-old', { ...w, id: 'w-old', weight: 80.4, updatedAt: t0 }), await put('body', 'w-new', { ...w, id: 'w-new', weight: 80.1, updatedAt: t0 + 1000 }),
    await put('entries', 'e-old', { id: 'e-old', date: '2026-11-01', meal: 'dinner', name: 'Old dinner', state: 'cooked', quantity: 100, unit: 'g', grams: 100, basis: 'cooked', macros: { kcal: 200, protein: 20, carbs: 10, fat: 5 }, order: 0, createdAt: t0, updatedAt: t0 }));
  // the incident: IndexedDB (records + Firebase session) is gone, localStorage survives
  await p.evaluate(async () => { for (const d of await indexedDB.databases()) await new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r; }); });
  await p.goto(BASE); await p.reload();
  await p.getByTestId('welcome').waitFor(); console.log('after loss: welcome screen shown');
  await p.getByTestId('wel-login').click(); await p.getByTestId('login-email').fill(email); await p.getByTestId('login-password').fill(PW);
  await p.getByTestId('login-submit').click(); await p.getByTestId('dashboard').waitFor();
  // the download from the cloud can take longer on a busy machine: wait until it is complete (up to 30 s)
  let n = 0, k = 0;
  for (let i = 0; i < 30; i++) { await p.waitForTimeout(1000); n = await entries(); k = await kcalTarget(); if (i >= 7 && n >= 2 && k === 2110) break; }
  const weight = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('mego-u-' + localStorage.getItem('mego.activeUid')); r.onsuccess = () => { const q = r.result.transaction('body').objectStore('body').getAll(); q.onsuccess = () => res(q.result.map((b) => b.date + ':' + b.weight).join(',')); }; }));
  console.log('after sign-in: weigh-ins', weight, '(newer copy of 2026-11-01 expected: 80.1)');
  if (!weight.includes('2026-11-01:80.1') || n < 2) failed = true;
  await p.goto(BASE + '#/diary'); const text = await p.getByTestId('diary').innerText();
  console.log('after sign-in: entries', n, '· target', k, '· food visible in diary', text.includes(FOOD));
  if (!(n >= 2 && k === 2110 && text.includes(FOOD))) { failed = true; console.log('RESULT: data NOT recovered'); } else console.log('RESULT: data recovered');
} catch (e) { failed = true; console.log('ERROR', String(e.message).split('\n')[0]); await p.screenshot({ path: path.join(ROOT, 'e2e', 'storage-loss-fail.png') }); }
await browser.close(); server.kill();
process.exit(failed ? 1 : 0);
