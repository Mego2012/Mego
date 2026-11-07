/**
 * Captures settled screenshots of every major screen in Arabic/English × light/dark.
 * Usage: VITE_DEMO=1 npx vite build && KEEP_PROFILE=1 npm run e2e && node scripts/screenshots.mjs [--full] [--only=name,name] [profileDir]
 * Uses a browser profile that already has data (default: the e2e profile kept by KEEP_PROFILE=1).
 * --full captures the whole scrollable page (used for the visual audit); default is the phone viewport.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const FULL = args.includes('--full');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const LANGS = (args.find((a) => a.startsWith('--lang=')) || '--lang=ar,en').slice(7).split(',');
const SCHEMES = (args.find((a) => a.startsWith('--scheme=')) || '--scheme=light,dark').slice(9).split(',');
const profile = args.find((a) => !a.startsWith('--')) || path.join(ROOT, 'e2e/.profile');
const OUT = path.join(ROOT, FULL ? 'docs/screenshots/full' : 'docs/screenshots');
mkdirSync(OUT, { recursive: true });
const PORT = 4181;
const server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const ctx = await pw.chromium.launchPersistentContext(profile, { ...pw.devices['Pixel 7'], deviceScaleFactor: FULL ? 1 : 2 });
await ctx.route('**/firebase-config.json', (r) => r.fulfill({ status: 404, body: '' })); // guest-mode screens
const page = ctx.pages()[0] || await ctx.newPage();
page.setDefaultTimeout(4000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const setLang = async (lang) => page.evaluate((l) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const tx = r.result.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const g = st.get('main'); g.onsuccess = () => { st.put({ ...g.result, lang: l, theme: 'system' }); }; tx.oncomplete = () => res(); }; }), lang);

/** [name, hash, optional action run after the page settles] */
const SCREENS = [
  ['home', '/'],
  ['diary', '/diary'],
  ['add-food', '/diary', async () => { await page.getByTestId('add-breakfast').click(); await page.waitForTimeout(500); await page.getByTestId('food-search').fill('chicken'); }],
  ['foods', '/foods'],
  ['food-editor', '/foods', async () => { await page.getByTestId('food-row').first().click(); }],
  ['coach', '/coach?tab=today'],
  ['coach-week', '/coach?tab=week'],
  ['coach-month', '/coach?tab=month'],
  ['rankings', '/coach?tab=foods'],
  ['rank-carbs', '/coach?tab=foods', async () => { await page.getByTestId('rank-carb').click(); }],
  ['rank-fats', '/coach?tab=foods', async () => { await page.getByTestId('rank-fat').click(); }],
  ['food-detail', '/coach?tab=foods', async () => { await page.getByTestId('rank-row').first().click(); }],
  ['compare', '/coach?tab=foods', async () => { const boxes = page.locator('[data-testid=rank-row] input[type=checkbox]'); await boxes.nth(0).check(); await boxes.nth(1).check(); await page.getByTestId('compare-table').scrollIntoViewIfNeeded(); }],
  ['learn', '/coach?tab=learn'],
  ['article', '/coach?tab=learn', async () => { await page.locator('.learn-card').first().click(); }],
  ['recipes', '/recipes?tab=library'],
  ['recipe', '/recipes?tab=library', async () => { await page.getByTestId('library-card').first().click(); }],
  ['cook', '/recipes?tab=cook'],
  ['planner', '/planner'],
  ['habits', '/habits'],
  ['progress', '/progress'],
  ['week', '/reports/week'],
  ['month', '/reports/month'],
  ['settings', '/settings'],
  ['privacy', '/privacy']
];

await page.goto(`http://localhost:${PORT}/#/`); await page.waitForTimeout(2000);
/* Fill the throwaway profile copy with a realistic month (USDA values) — needs a build made with VITE_DEMO=1. */
const seeded = await page.evaluate(() => (window.__megoSeedDemo ? window.__megoSeedDemo() : 'no-demo-build'));
console.log('demo data:', seeded);
for (const lang of LANGS) {
  await setLang(lang); await page.reload(); await page.waitForTimeout(800);
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [name, hash, action] of SCREENS) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      await page.goto(`http://localhost:${PORT}/#${hash}`);
      await page.waitForTimeout(1400);
      try {
        if (action) { await action(); await page.waitForTimeout(1200); }
      } catch (e) { console.log('action failed', name, String(e).split('\n')[0]); }
      await page.screenshot({ path: path.join(OUT, `${name}-${lang}-${scheme}.png`), fullPage: FULL });
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
}
await ctx.close();
server.kill();
if (errors.length) console.log('page errors:', [...new Set(errors)].join('\n'));
console.log('saved to', OUT);
