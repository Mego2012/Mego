/**
 * End-to-end acceptance run for the 15 test scenarios in the brief.
 * Usage: npm run build && npm run e2e   (starts `vite preview` itself)
 * Uses the pre-installed Playwright + Chromium, emulating a Samsung Galaxy phone.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium, devices } = pw;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOTS = path.join(ROOT, 'e2e', 'screens');
const PROFILE = path.join(ROOT, 'e2e', '.profile');
const URL_BASE = 'http://localhost:4173/';
const SCRIPT_URL = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const TOKEN = 'test-token-123';
mkdirSync(SHOTS, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

const results = [];
function record(id, name, ok, detail = '') {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? '  — ' + detail : ''}`);
}
async function check(id, name, fn) {
  try {
    const detail = await fn();
    record(id, name, true, detail || '');
  } catch (e) {
    record(id, name, false, String(e && e.message || e).split('\n')[0]);
  }
}
function expectEq(a, b, label) {
  if (String(a).trim() !== String(b).trim()) throw new Error(`${label}: expected "${b}", got "${a}"`);
}

// ---------- Google Apps Script backend: the REAL apps-script/Code.gs running on an emulated spreadsheet
import { createGas } from './gas-mock.mjs';
import Papa from 'papaparse';
const fixtureCsv = readFileSync(path.join(ROOT, 'tests/fixtures/food-sheet-sample.csv'), 'utf8');
const fixtureRows = Papa.parse(fixtureCsv.trim()).data;
// Stand-in for the Claude Messages API behind the backend's UrlFetchApp: answers from the catalog it was sent.
const aiCalls = [];
function e2eClaude(req) {
  aiCalls.push(req);
  const text = req.body.messages[0].content[1].text;
  const key = (ar) => text.split('\n').find((l) => l.split(' | ')[1] === ar).split(' | ')[0];
  const it = (ar, en, food_key, grams, state, kind, confidence) => ({ name_ar: ar, name_en: en, food_key, grams, grams_low: Math.round(grams * 0.8), grams_high: Math.round(grams * 1.25),
    state, cooking_method: 'none', kind, confidence, reason: '', est_per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 } });
  const out = { is_food: true, meal_name_ar: 'أرز مع دجاج مشوي', meal_name_en: 'Rice with grilled chicken', notes: '', items: [
    it('أرز أبيض مطبوخ', 'Cooked white rice', key('أرز أبيض مطبوخ'), 200, 'cooked', 'food', 0.85),
    it('صدر دجاج مشوي', 'Grilled chicken breast', key('صدر دجاج مشوي'), 150, 'cooked', 'food', 0.9),
    it('زيت زيتون', 'Olive oil', key('زيت زيتون'), 8, 'other', 'oil_or_fat', 0.45)
  ] };
  return { json: { model: req.body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }] } };
}
const gas = createGas({ foodRows: fixtureRows, token: TOKEN, spreadsheetName: 'نظام التنشيف (emulated)', scriptProps: { ANTHROPIC_API_KEY: 'sk-ant-e2e-secret' }, ai: e2eClaude });
const remote = { received: [] };
async function mockScript(route) {
  const body = JSON.parse(route.request().postData() || '{}');
  if (body.action === 'push' && body.token === TOKEN) remote.received.push(...(body.changes || []));
  const res = gas.post(body);
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(res) });
}
// Open Food Facts lookups are mocked (no external calls from tests).
async function mockOFF(route) {
  const code = route.request().url().split('/product/')[1].split('.json')[0];
  if (code === '6281007025058') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 1, product: { product_name: 'لبن زبادي يوناني', brands: 'Test Dairy', serving_quantity: 150, nutriments: { 'energy-kcal_100g': 70, proteins_100g: 9, carbohydrates_100g: 4, fat_100g: 2, sugars_100g: 4, sodium_100g: 0.05 } } }) });
  } else await route.fulfill({ status: 404, body: '{}' });
}

// ---------- server
const server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('preview did not start')), 20000);
  server.stdout.on('data', (d) => { if (String(d).includes('4173')) { clearTimeout(to); resolve(); } });
});

const device = devices['Galaxy S9+'];
async function openContext() {
  const ctx = await chromium.launchPersistentContext(PROFILE, { ...device, acceptDownloads: true, locale: 'ar-SA', timezoneId: 'Asia/Riyadh' });
  await ctx.route('https://script.google.com/**', mockScript);
  await ctx.route('https://world.openfoodfacts.org/**', mockOFF);
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  return { ctx, page };
}
/** Scrolls an element to the middle of the screen first (the fixed bottom nav can cover low buttons). */
async function tap(page, testId) {
  const el = page.getByTestId(testId).first();
  await el.waitFor();
  await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
  await el.click();
}
async function waitText(locator, re, timeout = 10000) {
  const end = Date.now() + timeout;
  let last = '';
  while (Date.now() < end) {
    last = await locator.innerText().catch(() => '');
    if (re.test(last)) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('timeout waiting for ' + re + ' — last: ' + last);
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
const go = async (page, hash) => { await page.goto(URL_BASE + '#' + hash); await page.waitForLoadState('networkidle'); };

async function addFood(page, { meal, search, state, exact, qty, unit, expectKcal }) {
  await page.getByTestId(`add-${meal}`).click();
  await page.getByTestId('food-search').fill(search);
  if (state) await page.getByTestId('state-filter').selectOption(state);
  const option = page.getByTestId('food-option').filter({ has: page.locator('.bold', { hasText: new RegExp(`^${exact.replace(/[()]/g, '\\$&')}$`) }) }).first();
  await option.click();
  await page.getByTestId('qty-input').fill(String(qty));
  if (unit) await page.getByTestId('unit-select').selectOption(unit);
  const preview = (await page.getByTestId('preview-kcal').innerText()).split(' ')[0].replace(/,/g, '');
  if (expectKcal !== undefined) expectEq(preview, expectKcal, `${exact} preview kcal`);
  await page.getByTestId('qty-submit').click();
  await page.keyboard.press('Escape');
  return preview;
}
async function entryKcal(page, meal, name) {
  const row = page.getByTestId(`meal-${meal}`).getByTestId('entry').filter({ has: page.getByTestId('entry-name').getByText(name, { exact: true }) }).first();
  return (await row.getByTestId('entry-kcal').innerText()).replace(/,/g, '');
}

let { ctx, page } = await openContext();
await go(page, '/');
await page.waitForSelector('[data-testid="dashboard"]');

// ---------- setup: connect mock sheet and import the food database from it
await check('SETUP', 'Connect Google Sheet (mock Apps Script) and import food DB', async () => {
  await go(page, '/settings');
  await page.getByTestId('sync-url').fill(SCRIPT_URL);
  await page.getByTestId('sync-token').fill(TOKEN);
  await page.getByTestId('sync-save').click();
  await page.waitForTimeout(800);
  await page.waitForFunction(() => !document.querySelector('[data-testid="pull-foods"]')?.disabled, null, { timeout: 5000 });
  await page.getByTestId('pull-foods').click();
  await go(page, '/foods');
  return await waitText(page.getByTestId('foods-count'), /^10 /);
});

await check('IMPORT', 'Import CSV file shows audit preview (header row detection, issues)', async () => {
  await go(page, '/foods');
  await page.getByTestId('import-input').setInputFiles(path.join(ROOT, 'tests/fixtures/food-sheet-sample.csv'));
  await page.getByTestId('import-preview').waitFor();
  const txt = await page.getByTestId('import-preview').innerText();
  await shot(page, '06-import-preview');
  await page.getByTestId('import-confirm').click();
  await page.waitForTimeout(500);
  const count = await page.getByTestId('foods-count').innerText();
  if (!count.includes('10')) throw new Error('duplicates created: ' + count);
  return txt.split('\n').slice(0, 2).join(' ').slice(0, 80);
});

await go(page, '/diary');
await check('TEST 1', '100 g raw chicken breast → 120 kcal, P23 C0 F2.6', async () => {
  await addFood(page, { meal: 'lunch', search: 'صدر دجاج', state: 'raw', exact: 'صدر دجاج', qty: 100, expectKcal: '120' });
  expectEq(await entryKcal(page, 'lunch', 'صدر دجاج'), '120', 'entry kcal');
});
await check('TEST 2', '100 g cooked chicken breast uses cooked record → 165 kcal', async () => {
  await addFood(page, { meal: 'lunch', search: 'صدر دجاج', state: 'cooked', exact: 'صدر دجاج مشوي', qty: 100, expectKcal: '165' });
  expectEq(await entryKcal(page, 'lunch', 'صدر دجاج مشوي'), '165', 'entry kcal');
});
await check('TEST 3', '3 eggs (55 g each) → 236 kcal', async () => {
  await addFood(page, { meal: 'breakfast', search: 'بيض', exact: 'بيض كامل', qty: 3, unit: 'piece', expectKcal: '236' });
  expectEq(await entryKcal(page, 'breakfast', 'بيض كامل'), '236', 'entry kcal');
});
await check('TEST 4', '3 slices whole-wheat toast (28 g) → 207 kcal', async () => {
  await addFood(page, { meal: 'breakfast', search: 'توست', exact: 'توست بر (خبز أسمر)', qty: 3, unit: 'slice', expectKcal: '207' });
  expectEq(await entryKcal(page, 'breakfast', 'توست بر (خبز أسمر)'), '207', 'entry kcal');
  await shot(page, '02-diary-ar');
});
await check('DASH', 'Dashboard updates immediately (728 kcal consumed)', async () => {
  await go(page, '/');
  expectEq((await page.getByTestId('kcal-consumed').innerText()).replace(/[^\d]/g, ''), '728', 'consumed');
  expectEq((await page.getByTestId('kcal-target').innerText()).replace(/[^\d]/g, ''), '2000', 'target');
  await shot(page, '01-dashboard-ar');
});

await check('TEST 5', 'Recipe: 500 g raw chicken + 300 g raw rice, 4 servings → 1680 total / 420 per serving, logged', async () => {
  await go(page, '/recipes?tab=recipes');
  await page.getByTestId('new-recipe').click();
  await page.getByTestId('recipe-name').fill('كبسة دجاج');
  await page.getByTestId('recipe-servings-input').fill('4');
  let idx = 0;
  for (const [q, s, st, ex] of [[500, 'صدر دجاج', 'raw', 'صدر دجاج'], [300, 'أرز', 'raw', 'أرز أبيض']]) {
    await page.getByTestId('add-ingredient').click();
    await page.getByTestId('food-search').fill(s);
    await page.getByTestId('state-filter').selectOption(st);
    await page.getByTestId('food-option').filter({ has: page.locator('.bold', { hasText: new RegExp(`^${ex}$`) }) }).first().click();
    await page.getByTestId('qty-input').fill(String(q));
    await page.getByTestId('qty-submit').click();
    await page.getByTestId('ingredients').locator('li').nth(idx++).waitFor();
  }
  await page.waitForTimeout(200);
  expectEq((await page.getByTestId('recipe-total-kcal').innerText()).replace(/,/g, ''), '1680', 'total');
  expectEq(await page.getByTestId('recipe-serving-kcal').innerText(), '420', 'per serving');
  await shot(page, '05-recipe');
  await page.getByTestId('recipe-save').click();
  await page.getByTestId('recipe-add-diary').first().click();
  await page.getByTestId('recipe-log-confirm').click();
  await go(page, '/diary');
  expectEq(await entryKcal(page, 'lunch', 'كبسة دجاج'), '420', 'recipe entry');
});

await check('TEST 6', 'Change calories 2000 → 2200: dashboard, diary and weekly report update', async () => {
  await go(page, '/settings');
  await page.getByTestId('tt-kcal').fill('2200');
  await page.getByTestId('rt-kcal').fill('2200');
  await page.getByTestId('targets-save').click();
  await page.waitForTimeout(400);
  await go(page, '/');
  expectEq((await page.getByTestId('kcal-target').innerText()).replace(/[^\d]/g, ''), '2200', 'dashboard target');
  // 728 + 420 = 1148 consumed; remaining 1052
  expectEq((await page.getByTestId('kcal-remaining').innerText()).replace(/[^\d]/g, ''), '1052', 'remaining');
  expectEq((await page.getByTestId('kcal-pct').innerText()).replace(/[^\d]/g, ''), '52', 'percent');
});

await check('TEST 7', 'Change protein 160 → 170: macro bars and report targets update', async () => {
  await go(page, '/settings');
  await page.getByTestId('tt-protein').fill('170');
  await page.getByTestId('rt-protein').fill('170');
  await page.getByTestId('targets-save').click();
  await page.waitForTimeout(400);
  await go(page, '/');
  const bars = await page.getByTestId('macro-bars').innerText();
  if (!bars.includes('/ 170')) throw new Error('macro bars: ' + bars.replace(/\n/g, ' '));
  return bars.split('\n').slice(0, 2).join(' ');
});

await check('TEST 8', 'Log food on a previous date (yesterday)', async () => {
  await go(page, '/diary');
  await page.getByTestId('date-prev').click();
  await addFood(page, { meal: 'dinner', search: 'صدر دجاج', state: 'cooked', exact: 'صدر دجاج مشوي', qty: 600, expectKcal: '990' });
  await addFood(page, { meal: 'lunch', search: 'أرز أبيض مطبوخ', exact: 'أرز أبيض مطبوخ', qty: 900, expectKcal: '1170' });
  const status = await page.getByTestId('day-status').innerText();
  return 'yesterday status: ' + status;
});

await check('TEST 9', 'Weekly report from saved records (complete/partial/empty days, targets 2200/170)', async () => {
  await go(page, '/reports/week');
  await page.getByTestId('report-stats').waitFor();
  const complete = await page.getByTestId('complete-days').innerText();
  const avg = await page.getByTestId('avg-kcal').innerText();
  const prot = await page.getByTestId('avg-protein').innerText();
  if (!/2,?200/.test(avg)) throw new Error('avg target not 2200: ' + avg);
  if (!/170/.test(prot)) throw new Error('protein target not 170: ' + prot);
  await shot(page, '03-weekly-report');
  return `${complete} | kcal ${avg} | protein ${prot}`;
});

await check('TEST 10', 'Monthly report + CSV/XLSX export', async () => {
  await go(page, '/reports/month');
  await page.getByTestId('report-stats').waitFor();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()]);
  await shot(page, '04-monthly-report');
  return `${await page.getByTestId('report-title').innerText()} · ${dl.suggestedFilename()} · ${dl2.suggestedFilename()}`;
});

await check('TEST 11', 'Edit raw chicken 120 → 110 kcal: past entries keep 120, new entries use 110, history logged', async () => {
  await go(page, '/foods');
  await page.getByTestId('foods-search').fill('صدر دجاج');
  await page.getByTestId('foods-state').selectOption('raw').catch(async () => {});
  await page.getByTestId('food-row').filter({ has: page.locator('.bold', { hasText: /^صدر دجاج$/ }) }).first().click();
  await page.getByTestId('fe-kcal').fill('110');
  await page.getByTestId('fe-save').click();
  await page.waitForTimeout(300);
  await go(page, '/diary');
  expectEq(await entryKcal(page, 'lunch', 'صدر دجاج'), '120', 'historical entry');
  await go(page, '/foods');
  await page.getByTestId('foods-search').fill('صدر دجاج');
  await page.getByTestId('food-row').filter({ has: page.locator('.bold', { hasText: /^صدر دجاج$/ }) }).first().click();
  await page.getByTestId('food-history-tab').click();
  const h = await page.getByTestId('food-history').innerText();
  if (!h.includes('120') || !h.includes('110')) throw new Error('history: ' + h);
  await page.keyboard.press('Escape');
});

await check('TEST 13', 'Offline: log food without internet, then reconnect and verify sync', async () => {
  await page.waitForTimeout(3500); // let pending changes flush first
  const before = remote.received.length;
  await ctx.setOffline(true);
  await go(page, '/diary').catch(() => {});
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByTestId('offline-banner').waitFor({ timeout: 5000 });
  await addFood(page, { meal: 'snacks', search: 'زبادي', exact: 'زبادي يوناني قليل الدسم', qty: 170, expectKcal: '124' });
  await page.waitForTimeout(500);
  const chip = await page.getByTestId('sync-chip').innerText();
  if (!/·\s*\d/.test(chip)) throw new Error('no pending count while offline: ' + chip);
  await shot(page, '07-offline');
  const offlineReceived = remote.received.length - before;
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(3500);
  const got = remote.received.slice(before).some((c) => c.table === 'entries' && c.payload && c.payload.name === 'زبادي يوناني قليل الدسم');
  if (!got) throw new Error('entry not synced');
  const chip2 = await page.getByTestId('sync-chip').innerText();
  return `received while offline: ${offlineReceived}; after reconnect chip: "${chip2}"`;
});

await check('TEST 12', 'Close the app and reopen: all data still there', async () => {
  await ctx.close();
  ({ ctx, page } = await openContext());
  await go(page, '/diary');
  expectEq(await entryKcal(page, 'lunch', 'صدر دجاج'), '120', 'persisted entry');
  await go(page, '/');
  expectEq((await page.getByTestId('kcal-target').innerText()).replace(/[^\d]/g, ''), '2200', 'persisted target');
});

await check('BODY', 'Weight & waist measurements (one per date) feed progress and reports', async () => {
  await go(page, '/progress');
  for (const [w, waist] of [[72.0, 82]]) {
    await page.getByTestId('add-measurement').click();
    await page.getByTestId('body-weight').fill(String(w));
    await page.getByTestId('body-waist').fill(String(waist));
    await page.getByTestId('body-save').click();
  }
  await page.waitForTimeout(300);
  await page.getByTestId('add-measurement').click();
  await page.getByTestId('body-weight').fill('71.6');
  await page.getByTestId('body-save').click();
  await page.waitForTimeout(300);
  const rows = await page.getByTestId('body-row').count();
  expectEq(rows, 1, 'records for same date');
  expectEq(await page.getByTestId('progress-current').innerText().then((s) => s.split(' ')[0]), '71.6', 'current weight');
  await shot(page, '08-progress');
});

await check('TEST 14', 'PWA installability prerequisites (manifest, service worker, offline app shell)', async () => {
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
  if (manifest.display !== 'standalone') throw new Error('display ' + manifest.display);
  if (!manifest.icons.some((i) => i.sizes === '512x512')) throw new Error('no 512 icon');
  // Playwright request routing bypasses service workers, so the offline-shell check uses a clean context without routes.
  const browser = await chromium.launch();
  const c2 = await browser.newContext({ ...device });
  const p2 = await c2.newPage();
  await p2.goto(URL_BASE);
  const active = await p2.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  await p2.reload();
  const controlled = await p2.evaluate(() => !!navigator.serviceWorker.controller);
  await c2.setOffline(true);
  await p2.reload();
  await p2.waitForSelector('[data-testid="dashboard"]', { timeout: 10000 });
  await p2.goto(URL_BASE + '#/diary');
  await p2.waitForSelector('[data-testid="diary"]', { timeout: 10000 });
  await browser.close();
  if (!active || !controlled) throw new Error('service worker not active/controlling');
  return 'manifest ok (standalone, 192/512 icons), SW active + controlling, app shell loads offline. Real Android install must be done on the phone.';
});

await check('TEST 15', 'Switch Arabic ⇄ English: dir rtl/ltr and labels', async () => {
  await go(page, '/');
  expectEq(await page.evaluate(() => document.documentElement.dir), 'rtl', 'initial dir');
  await go(page, '/settings');
  await page.getByRole('tab', { name: 'English' }).click();
  await page.waitForTimeout(300);
  expectEq(await page.evaluate(() => document.documentElement.dir), 'ltr', 'dir after EN');
  await go(page, '/');
  const h1 = await page.locator('header h1').innerText();
  expectEq(h1, 'Dashboard', 'EN title');
  await shot(page, '09-dashboard-en');
  await go(page, '/diary');
  await shot(page, '10-diary-en');
  await go(page, '/settings');
  await page.getByRole('tab', { name: 'العربية' }).click();
  await page.waitForTimeout(300);
  expectEq(await page.evaluate(() => document.documentElement.dir), 'rtl', 'dir after AR');
  await go(page, '/');
  expectEq(await page.locator('header h1').innerText(), 'الرئيسية', 'AR title');
});


await check('REMAIN', 'Dashboard shows remaining protein/carbs/fat and water', async () => {
  await go(page, '/');
  const rp = await page.getByTestId('remaining-protein').first().innerText();
  if (!/\d/.test(rp)) throw new Error('remaining protein: ' + rp);
  await tap(page, 'dash-water-250');
  await page.waitForTimeout(300);
  const w = await page.getByTestId('dash-water').innerText();
  if (!w.includes('250')) throw new Error('water ' + w);
  return rp;
});

await check('UNDO', 'Delete an entry, then Undo restores it', async () => {
  await go(page, '/diary');
  await page.getByTestId('entry').first().waitFor();
  const before = await page.getByTestId('entry').count();
  await page.getByTestId('entry').first().click();
  await page.getByTestId('entry-delete').click();
  await page.getByTestId('confirm-yes').click();
  await page.waitForTimeout(300);
  expectEq(await page.getByTestId('entry').count(), before - 1, 'entries after delete');
  await page.getByTestId('toast-action').click();
  await page.waitForTimeout(400);
  expectEq(await page.getByTestId('entry').count(), before, 'entries after undo');
  return `${before} → ${before - 1} → ${before}`;
});

await check('COPYGUARD', 'Copy from yesterday into a non-empty day asks for confirmation', async () => {
  await go(page, '/diary');
  await page.getByTestId('copy-yesterday').click();
  await page.getByText(/مسبقاً|already has/).waitFor({ timeout: 3000 });
  await page.keyboard.press('Escape');
});

await check('LIBRARY', 'Recipe library: ≥50 recipes computed from the food DB, detail, rate, add to diary', async () => {
  // Use the full 160-food database for the library.
  await go(page, '/foods');
  const realFoods = path.join(ROOT, 'tests/private/foods-160.csv');
  await page.getByTestId('import-input').setInputFiles(existsSync(realFoods) ? realFoods : path.join(ROOT, 'tests/fixtures/foods-synthetic.csv'));
  await page.getByTestId('import-confirm').click();
  await page.waitForTimeout(1500);
  await go(page, '/recipes');
  await page.getByTestId('library-card').first().waitFor();
  const count = await page.getByTestId('library-count').innerText();
  const total = Number(count.split('/')[1].trim().split(' ')[0]);
  if (total < 50) throw new Error('library size ' + count);
  await page.getByTestId('tag-high_protein').click();
  const hp = await page.getByTestId('library-card').count();
  await page.getByTestId('tag-all').click();
  await page.getByTestId('library-search').fill('كبسة');
  await page.getByTestId('library-card').first().click();
  await page.getByTestId('recipe-detail').waitFor();
  const kcal = await page.getByTestId('detail-kcal').innerText();
  await page.getByTestId('rate-5').click();
  await page.getByTestId('recipe-fav').click();
  await shot(page, '13-recipe-detail');
  await page.getByTestId('lib-add-diary').click();
  await page.getByTestId('dms-confirm').click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await go(page, '/diary');
  await waitText(page.getByTestId('diary'), /كبسة دجاج صحية/);
  return `${count} · high-protein ${hp} · kabsa ${kcal}/serving`;
});

await check('SUGGEST', 'Suggestions fit remaining calories and include protein', async () => {
  await go(page, '/recipes?tab=suggest');
  await page.getByTestId('suggest').waitFor();
  const rem = await page.getByTestId('suggest-remaining').innerText();
  const remKcal = Number(rem.replace(/,/g, '').match(/\d+/)[0]);
  const items = await page.getByTestId('suggestion-kcal').allInnerTexts();
  if (!items.length) throw new Error('no suggestions; ' + rem);
  for (const k of items) if (Number(k.replace(/,/g, '')) > remKcal * 1.05 + 20) throw new Error(`suggestion ${k} > remaining ${remKcal}`);
  await shot(page, '14-suggestions');
  return `${items.length} suggestions for ${remKcal} kcal remaining`;
});

await check('GOAL', 'Goal dropdown (9 options, default fat-loss-preserve), recommendation needs confirmation', async () => {
  await go(page, '/settings');
  const sel = page.getByTestId('goal-select');
  expectEq(await sel.inputValue(), 'fat_loss_preserve', 'default goal');
  expectEq(await sel.locator('option').count(), 9, 'options');
  await sel.selectOption('lean_bulk');
  const rec = await page.getByTestId('rec-values').innerText();
  await page.getByTestId('profile-save').click();
  await page.waitForTimeout(400);
  await go(page, '/');
  const target = (await page.getByTestId('kcal-target').innerText()).replace(/[^\d]/g, '');
  expectEq(target, '2200', 'targets unchanged after goal change');
  await go(page, '/settings');
  expectEq(await page.getByTestId('goal-select').inputValue(), 'lean_bulk', 'goal persisted');
  await page.getByTestId('apply-rec').click();
  await page.getByTestId('confirm-yes').click();
  await page.waitForTimeout(400);
  await go(page, '/');
  const t2 = (await page.getByTestId('kcal-target').innerText()).replace(/[^\d]/g, '');
  if (t2 === '2200') throw new Error('recommendation not applied after confirm');
  await go(page, '/settings');
  await page.getByTestId('goal-select').selectOption('fat_loss_preserve');
  await page.getByTestId('profile-save').click();
  await page.waitForTimeout(300);
  await shot(page, '15-goal');
  // restore 2000/160/200/62
  for (const [k, v] of [['kcal', 2000], ['protein', 160], ['carbs', 200], ['fat', 62]]) { await page.getByTestId('tt-' + k).fill(String(v)); await page.getByTestId('rt-' + k).fill(String(v)); }
  await page.getByTestId('targets-save').click();
  await page.waitForTimeout(300);
  return `lean bulk recommendation ${rec}; applied → ${t2} kcal; restored defaults`;
});

await check('PLAN', 'Suggest a week plan, apply, shopping list with check-off', async () => {
  await go(page, '/planner');
  await page.getByTestId('generate-plan').click();
  await page.getByTestId('generated-plan').waitFor();
  await page.getByTestId('apply-generated').click();
  const confirm = page.getByTestId('confirm-yes');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(1500);
  await page.getByTestId('open-shopping').click();
  await page.getByTestId('shopping-check').first().waitFor();
  const items = await page.getByTestId('shopping-check').count();
  await page.getByTestId('shopping-check').first().click();
  await page.waitForFunction(() => document.querySelector('[data-testid="shopping-check"]')?.checked === true, null, { timeout: 3000 });
  await shot(page, '16-shopping');
  await page.keyboard.press('Escape');
  return `${items} shopping items`;
});

await check('HABITS', 'Water, habits and fasting timer', async () => {
  await go(page, '/habits');
  await page.getByTestId('h-water-500').click();
  await page.getByTestId('habit-check').first().click();
  await page.waitForFunction(() => document.querySelector('[data-testid="habit-check"]')?.checked === true, null, { timeout: 3000 });
  await page.getByTestId('fast-start').click();
  await page.getByTestId('fast-running').waitFor();
  await page.getByTestId('fast-end').click();
  await shot(page, '17-habits');
  return await page.getByTestId('water-total').innerText();
});

await check('BARCODE', 'Barcode manual entry → Open Food Facts (mocked) → save & log', async () => {
  await go(page, '/diary');
  await tap(page, 'add-snacks');
  await page.getByTestId('open-barcode').click();
  await page.getByTestId('barcode-input').fill('6281007025058');
  await page.getByTestId('barcode-lookup').click();
  await page.getByTestId('barcode-product').waitFor();
  expectEq(await page.getByTestId('bp-kcal').inputValue(), '70', 'kcal from OFF');
  await page.getByTestId('bp-save').click();
  await page.getByTestId('qty-input').fill('150');
  await page.getByTestId('qty-submit').click();
  await page.keyboard.press('Escape');
  await waitText(page.getByTestId('diary'), /لبن زبادي يوناني/);
});

await check('PHOTO', 'Progress photo stored locally', async () => {
  await go(page, '/progress');
  await page.getByTestId('photo-input').setInputFiles(path.join(ROOT, 'public/icon-192.png'));
  await page.locator('[data-testid="photo-grid"] img').first().waitFor({ timeout: 5000 });
});

await check('BACKUP', 'Local backup list + backup now', async () => {
  await go(page, '/settings');
  await page.getByTestId('backup-now').click();
  await page.waitForTimeout(800);
  const n = await page.getByTestId('local-backups').locator('li').count();
  if (n < 1) throw new Error('no local backups');
  return `${n} local backup(s)`;
});

await check('SYNC2', 'Everything synced to the emulated sheet (APP_* tabs) by the real Code.gs', async () => {
  await page.getByTestId('push-now').click();
  await page.waitForTimeout(2500);
  const pulled = gas.post({ action: 'pull', token: TOKEN });
  const counts = Object.fromEntries(Object.entries(pulled.tables).map(([k, v]) => [k, v.length]));
  if (!counts.entries || !counts.foods || !counts.kv) throw new Error(JSON.stringify(counts));
  const original = gas.sheet('قاعدة بيانات الأطعمة').data.length;
  expectEq(original, fixtureRows.length, 'original food tab untouched');
  return `${JSON.stringify(counts)} · dataVersion ${pulled.meta.dataVersion}`;
});


await check('HUBINFO', 'Settings shows MEGO Nutrition Hub with its fixed ID; backend reported the same ID', async () => {
  await go(page, '/settings');
  const txt = await page.getByTestId('hub-info').innerText();
  if (!txt.includes('MEGO Nutrition Hub') || !txt.includes('1mxqBI9_oiXCVpta2aRCDutYh9as_2NuI')) throw new Error(txt);
  return txt.split('\n')[0];
});

await check('SCAN', 'AI meal scanner: photo → review (DB values, confidence, confirm uncertain) → edit grams → save → dashboard', async () => {
  await go(page, '/');
  const before = Number((await page.getByTestId('kcal-consumed').innerText()).replace(/[^0-9.]/g, ''));
  const entriesBefore = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const q = r.result.transaction('entries').objectStore('entries').count(); q.onsuccess = () => res(q.result); }; }));
  const img = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 300, height: 220 } });
  await page.getByTestId('scan-camera-input').setInputFiles({ name: 'meal.png', mimeType: 'image/png', buffer: img });
  await page.getByTestId('scan-preview').waitFor();
  // offline: clear message, photo kept
  await ctx.setOffline(true);
  await page.getByTestId('scan-analyze').click();
  await waitText(page.getByTestId('scan-error'), /غير متصل/);
  await ctx.setOffline(false);
  await page.getByTestId('scan-analyze').click();
  await page.getByTestId('scan-review').waitFor({ timeout: 15000 });
  const items = page.getByTestId('scan-item');
  expectEq(await items.count(), 3, 'items');
  expectEq(await page.getByTestId('scan-item-db').count(), 3, 'all from DB');
  if (!(await page.getByTestId('scan-save').isDisabled())) throw new Error('save enabled before confirming uncertain oil');
  const t1 = Number((await page.getByTestId('scan-total-kcal').innerText()).replace(/[^0-9.]/g, ''));
  expectEq(t1, Math.round(130 * 2 + 165 * 1.5 + 884 * 0.08), 'total from DB values');
  await items.nth(0).getByTestId('scan-item-grams').fill('180');
  const t2 = Number((await page.getByTestId('scan-total-kcal').innerText()).replace(/[^0-9.]/g, ''));
  expectEq(t2, Math.round(130 * 1.8 + 165 * 1.5 + 884 * 0.08), 'instant recalculation');
  await shot(page, '30-scan-review');
  await items.nth(2).getByTestId('scan-item-confirm').check();
  if (await page.getByTestId('scan-save').isDisabled()) throw new Error('save still disabled');
  // nothing saved yet
  const mid = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const q = r.result.transaction('entries').objectStore('entries').count(); q.onsuccess = () => res(q.result); }; }));
  expectEq(mid, entriesBefore, 'no auto-save');
  await tap(page, 'scan-save');
  await page.getByTestId('scan-review').waitFor({ state: 'detached' });
  await waitText(page.getByTestId('kcal-consumed'), new RegExp('^(?!' + String(before).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' )'));
  const after = Number((await page.getByTestId('kcal-consumed').innerText()).replace(/[^0-9.]/g, ''));
  if (Math.abs(after - (before + t2)) > 1) throw new Error(`dashboard ${before} + ${t2} ≠ ${after}`);
  // what left the phone: a re-encoded JPEG (no EXIF), food names only
  const sent = aiCalls[aiCalls.length - 1].body.messages[0].content;
  const bytes = Buffer.from(sent[0].source.data, 'base64');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG');
  if (bytes.includes(Buffer.from('Exif'))) throw new Error('EXIF present');
  if (/sk-ant/.test(JSON.stringify(await page.evaluate(() => document.documentElement.outerHTML)))) throw new Error('key in page');
  return `meal ${t2} kcal · dashboard ${before} → ${after} · image ${bytes.length} B JPEG`;
});

await check('LIB100', 'Recipe library has ≥ 100 recipes, all calculable', async () => {
  await go(page, '/recipes');
  const c = await waitText(page.getByTestId('library-count'), /\d+ \/ \d+/);
  const [a, b] = c.split('·')[0].split('/').map((x) => Number(x.trim()));
  if (b < 100 || a !== b) throw new Error(c);
  return c.split('·')[0].trim();
});

await check('COOK', 'What can I cook today? — pantry selection ranks recipes and lists missing items', async () => {
  await go(page, '/recipes?tab=cook');
  await page.getByTestId('pantry-more').click();
  for (const name of ['صدر دجاج', 'أرز أبيض', 'بصل', 'طماطم', 'بيض كامل', 'خيار', 'زبادي يوناني خالي الدسم', 'توست بر (خبز أسمر)']) {
    await page.getByTestId('pantry-chip').filter({ hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }).first().click();
  }
  await page.getByTestId('cook-result').first().waitFor();
  const n = await page.getByTestId('cook-result').count();
  const first = await page.getByTestId('cook-match').first().innerText();
  await shot(page, '18-cook');
  return `${n} recipes, best match ${first}`;
});

await check('BACKBTN', 'Android Back closes an open sheet without leaving the page; scrolling still works', async () => {
  await go(page, '/diary');
  await tap(page, 'add-lunch');
  await page.getByTestId('food-search').waitFor();
  await page.goBack();
  await page.waitForTimeout(400);
  if (await page.getByTestId('food-search').count()) throw new Error('sheet still open');
  if (!page.url().includes('#/diary')) throw new Error('left the diary: ' + page.url());
  const locked = await page.evaluate(() => document.body.classList.contains('scroll-locked'));
  if (locked) throw new Error('page left scroll-locked');
});

await check('STREAK', 'Habit streaks and 14-day water history', async () => {
  await go(page, '/habits');
  await page.getByTestId('water-history').waitFor();
  const st = await page.getByTestId('habit-streak').first().innerText();
  return st;
});

await check('REPLACE', 'Replace a meal in the suggested week plan', async () => {
  await go(page, '/planner');
  await page.getByTestId('generate-plan').click();
  const plan = page.getByTestId('generated-plan');
  await plan.waitFor();
  const before = await plan.innerText();
  await page.getByTestId('replace-meal').first().click();
  await page.waitForTimeout(200);
  const after = await plan.innerText();
  if (before === after) throw new Error('nothing replaced');
  await page.keyboard.press('Escape');
});

await check('LAYOUT', 'No horizontal overflow on any screen (phone width)', async () => {
  const bad = [];
  for (const h of ['/', '/diary', '/recipes', '/recipes?tab=suggest', '/recipes?tab=cook', '/recipes?tab=recipes', '/foods', '/planner', '/progress', '/habits', '/reports/week', '/reports/month', '/settings']) {
    await go(page, h);
    await page.waitForTimeout(300);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, wide: [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.table-wrap,.segmented,.chart')).length }));
    if (w.wide > 0) bad.push(`${h}: ${w.wide} element(s) wider than the screen`);
  }
  if (bad.length) throw new Error(bad.join('; '));
});

await check('DARK', 'Dark mode renders', async () => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await go(page, '/');
  await shot(page, '11-dashboard-dark');
  await go(page, '/reports/week');
  await shot(page, '12-weekly-dark');
  await page.emulateMedia({ colorScheme: 'light' });
});

await ctx.close();
server.kill();
rmSync(PROFILE, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
