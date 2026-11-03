/**
 * End-to-end acceptance run for the 15 test scenarios in the brief.
 * Usage: npm run build && npm run e2e   (starts `vite preview` itself)
 * Uses the pre-installed Playwright + Chromium, emulating a Samsung Galaxy phone.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
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

// ---------- mock Google Apps Script backend
const fixtureCsv = readFileSync(path.join(ROOT, 'tests/fixtures/food-sheet-sample.csv'), 'utf8');
const fixtureRows = fixtureCsv.trim().split('\n').map((l) => l.split(','));
const remote = { tables: {}, pushes: 0, received: [] };
async function mockScript(route) {
  const req = route.request();
  const body = JSON.parse(req.postData() || '{}');
  let res;
  if (body.token !== TOKEN) res = { ok: false, error: 'unauthorized' };
  else if (body.action === 'ping') res = { ok: true, spreadsheet: 'نظام التنشيف (mock)', foodSheet: 'قاعدة بيانات الأطعمة' };
  else if (body.action === 'foods') res = { ok: true, sheet: 'قاعدة بيانات الأطعمة', rows: fixtureRows };
  else if (body.action === 'push') {
    remote.pushes++;
    for (const c of body.changes) {
      remote.received.push(c);
      const t = (remote.tables[c.table] ||= {});
      if (c.op === 'delete') delete t[c.key]; else t[c.key] = c.payload;
    }
    res = { ok: true, applied: body.changes.length };
  } else if (body.action === 'pull') res = { ok: true, tables: Object.fromEntries(Object.entries(remote.tables).map(([k, v]) => [k, Object.values(v)])) };
  else res = { ok: true };
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(res) });
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
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  return { ctx, page };
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
  await page.getByTestId('pull-foods').click();
  await page.waitForTimeout(1500);
  await go(page, '/foods');
  const count = await page.getByTestId('foods-count').innerText();
  if (!count.includes('10')) throw new Error('food count ' + count);
  return count;
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
  await go(page, '/recipes');
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
