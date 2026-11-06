/**
 * Upgrade test: v1 build → v2 build on the same origin, same browser profile.
 * Usage: node e2e/migration-test.mjs <dir>  where <dir>/dist-v1 is a build of commit 2523513 and <dir>/dist-v2 the current build.
 * Requires the global `http-server`. Verifies data survives and a pre-migration snapshot is created.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { rmSync, symlinkSync, existsSync } from 'node:fs';
const require = createRequire('/home/user/Mego/');
const { chromium, devices } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
const SERVE = S + '/serve';
const serveDir = (dir) => { rmSync(SERVE, { force: true, recursive: true }); symlinkSync(dir, SERVE); };
serveDir(S + '/dist-v1');
const srv = spawn('http-server', [SERVE, '-p', '4180', '-c-1', '-s'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1500));
const profile = S + '/mig-profile';
rmSync(profile, { recursive: true, force: true });
let ctx = await chromium.launchPersistentContext(profile, { ...devices['Galaxy S9+'] });
let page = ctx.pages()[0];
await page.goto('http://localhost:4180/#/foods');
await page.getByTestId('import-input').setInputFiles('/home/user/Mego/tests/fixtures/food-sheet-sample.csv');
await page.getByTestId('import-confirm').click();
await page.waitForTimeout(800);
await page.goto('http://localhost:4180/#/diary');
await page.getByTestId('add-lunch').click();
await page.getByTestId('food-search').fill('صدر دجاج');
await page.getByTestId('state-filter').selectOption('raw');
await page.getByTestId('food-option').first().click();
await page.getByTestId('qty-input').fill('200');
await page.getByTestId('qty-submit').click();
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const v1 = await page.evaluate(async () => { const dbs = await indexedDB.databases(); return dbs; });
const v1kcal = await page.getByTestId('entry-kcal').first().innerText();
await ctx.close();
// "Update" the app: same origin now serves v2.
serveDir(S + '/dist-v2');
ctx = await chromium.launchPersistentContext(profile, { ...devices['Galaxy S9+'] });
page = ctx.pages()[0];
await page.goto('http://localhost:4180/#/diary');
await page.waitForTimeout(1500);
await page.reload(); // service worker picks up the new build
await page.waitForSelector('[data-testid="diary"]');
await page.waitForTimeout(1500);
const v2kcal = await page.getByTestId('entry-kcal').first().innerText().catch(() => 'MISSING');
const isV2 = await page.getByTestId('diary-water').count();
const after = await page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  const bk = await new Promise((res) => { const r = indexedDB.open('mego-nutrition-premigration'); r.onsuccess = () => res(r.result); });
  const rows = bk.objectStoreNames.contains('backups') ? await new Promise((res) => { const q = bk.transaction('backups').objectStore('backups').getAll(); q.onsuccess = () => res(q.result); }) : [];
  return { dbs, backups: rows.map((r) => ({ fromSchema: r.fromSchema, entries: JSON.parse(r.json).tables.entries.length, foods: JSON.parse(r.json).tables.foods.length })) };
});
console.log(JSON.stringify({ v1Databases: v1, v1kcal, v2kcal, v2Ui: isV2 > 0, after }, null, 1));
await ctx.close(); srv.kill();
