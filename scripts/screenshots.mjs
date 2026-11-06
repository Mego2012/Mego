/**
 * Captures settled screenshots of key screens (after animations) in Arabic/English × light/dark.
 * Usage: npm run build && node scripts/screenshots.mjs [profileDir]   → docs/screenshots/
 * Uses a browser profile that already has data (default: the e2e profile left by `npm run e2e`).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'docs/screenshots');
mkdirSync(OUT, { recursive: true });
const server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', '4181', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const ctx = await pw.chromium.launchPersistentContext(process.argv[2] || path.join(ROOT, 'e2e/.profile'), { ...pw.devices['Pixel 7'], deviceScaleFactor: 2 });
const page = ctx.pages()[0] || await ctx.newPage();
const setLang = async (lang) => page.evaluate((l) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const tx = r.result.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const g = st.get('main'); g.onsuccess = () => { st.put({ ...g.result, lang: l, theme: 'system' }); }; tx.oncomplete = () => res(); }; }), lang);
await page.goto('http://localhost:4181/#/');
for (const lang of ['ar', 'en']) {
  await setLang(lang); await page.reload(); await page.waitForTimeout(800);
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [name, hash] of [['home', '/'], ['diary', '/diary'], ['coach', '/coach?tab=today'], ['rankings', '/coach?tab=foods'], ['progress', '/progress'], ['week', '/reports/week']]) {
      await page.goto('http://localhost:4181/#' + hash);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, `${name}-${lang}-${scheme}.png`) });
    }
  }
}
await ctx.close();
server.kill();
console.log('saved to', OUT);
