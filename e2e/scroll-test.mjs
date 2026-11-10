/**
 * Mobile scrolling regression test using raw touch events (CDP Input.dispatchTouchEvent: touchStart →
 * touchMove… → touchEnd), which Chrome turns into compositor scrolling exactly like a finger swipe — not
 * window.scrollTo(). (Input.synthesizeScrollGesture does not scroll in headless Chrome, so it is not used.)
 * A control page proves the method works before the app is tested.
 * Runs on Samsung-sized viewports, Arabic RTL and English LTR, and after opening/closing nested modals.
 * Usage: npm run build && node e2e/scroll-test.mjs [baseUrl]
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = pw;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const EXTERNAL = process.argv[2];
const BASE = EXTERNAL || 'http://localhost:4190/';

const VIEWPORTS = [
  { name: 'Galaxy S23 (360×780)', width: 360, height: 780, dpr: 3 },
  { name: 'Galaxy A54 (412×915)', width: 412, height: 915, dpr: 2.625 },
  { name: 'Galaxy S9+ (320×658)', width: 320, height: 658, dpr: 4.5 }
];
const PAGES = process.env.PAGES ? process.env.PAGES.split(',') : ['/', '/diary', '/recipes', '/recipes?tab=suggest', '/recipes?tab=cook', '/recipes?tab=recipes', '/foods', '/planner', '/progress', '/habits', '/reports/week', '/reports/month', '/settings'];

let server;
if (!EXTERNAL) {
  server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', '4190', '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('4190') && r()));
}
const results = [];
const rec = (ok, name, detail = '') => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

async function fingerSwipe(cdp, vp) {
  const x = Math.round(vp.width / 2);
  const y0 = Math.round(vp.height * 0.72);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - Math.round((vp.height * 0.5 * i) / 12) }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function swipeToBottom(page, cdp) {
  // Up to 40 real swipes (finger moving up) until the page stops moving.
  // Stops after two swipes in a row that do not move the page (one can land between momentum frames).
  let last = -1, still = 0;
  for (let i = 0; i < 40; i++) {
    const vp = page.viewportSize();
    const before = process.env.PROBE ? await page.evaluate(() => { const e = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.72); return e ? e.tagName + '.' + e.className : ''; }) : '';
    await fingerSwipe(cdp, vp);
    if (process.env.PROBE) console.log('  swipe from', before.slice(0, 50));
    await page.waitForTimeout(160);
    const y = await page.evaluate(() => window.scrollY);
    if (process.env.PROBE && last >= 0 && y - last < 60) {
      const info = await page.evaluate(() => { const e = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.72); const chain = []; for (let x = e; x && chain.length < 6; x = x.parentElement) chain.push(x.tagName.toLowerCase() + '.' + String(x.className).split(' ').join('.')); return { chain, sel: String(getSelection()), active: document.activeElement?.tagName, sh: document.scrollingElement.scrollHeight }; });
      console.log('  PROBE stuck at', y, JSON.stringify(info));
    }
    if (y === last) { if (++still >= 2) break; } else still = 0;
    last = y;
  }
  return page.evaluate(() => {
    const se = document.scrollingElement;
    const max = se.scrollHeight - window.innerHeight;
    // what is visually at the very bottom, above the bottom nav?
    const nav = document.querySelector('.bottom-nav');
    const navTop = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : window.innerHeight;
    const cards = [...document.querySelectorAll('main .card, main .stat, main .btn')].filter((e) => e.offsetParent);
    const lastEl = cards[cards.length - 1];
    const lastBottom = lastEl ? lastEl.getBoundingClientRect().bottom : 0;
    const under = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.72);
    return { under: under ? under.tagName.toLowerCase() + '.' + String(under.className).split(' ')[0] : '', scrollY: window.scrollY, max, scrollable: max > 5, atBottom: window.scrollY >= max - 2, lastVisibleAboveNav: lastBottom <= navTop + 1, bodyOverflow: getComputedStyle(document.body).overflow, inlineLock: document.body.classList.contains('scroll-locked') ? 'hidden' : document.body.style.overflow, hscroll: se.scrollWidth > se.clientWidth };
  });
}

async function seed(page) {
  // Fill the app with enough data that pages are long.
  await page.goto(BASE + '#/foods');
  await page.getByTestId('import-input').setInputFiles(path.join(ROOT, 'tests/fixtures/food-sheet-sample.csv'));
  await page.getByTestId('import-confirm').click();
  await page.waitForTimeout(1200);
  await page.goto(BASE + '#/diary');
  for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks']) {
    const add = page.getByTestId(`add-${meal}`);
    await add.evaluate((n) => n.scrollIntoView({ block: 'center' }));
    await add.click();
    for (const name of ['صدر دجاج', 'بيض كامل']) {
      await page.getByTestId('food-search').fill(name);
      await page.getByTestId('food-option').first().click();
      await page.getByTestId('qty-submit').click();
      await page.waitForTimeout(150);
    }
    await page.keyboard.press('Escape');
  }
}

const browser = await chromium.launch(EXTERNAL && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
{ // control: the swipe method must scroll a plain long page, otherwise the test itself is broken
  const c = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await c.route('**/firebase-config.json', (r) => r.fulfill({ status: 404, body: '' })); // guest mode under test (accounts are enabled in production)
  const p = await c.newPage();
  const cdp = await c.newCDPSession(p);
  await p.setContent('<body style="margin:0"><div style="height:4000px"></div></body>');
  await fingerSwipe(cdp, { width: 360, height: 780 });
  await p.waitForTimeout(200);
  const y = await p.evaluate(() => window.scrollY);
  rec(y > 100, 'control: finger swipe scrolls a plain page', `scrollY ${y}`);
  await c.close();
  if (y <= 100) { console.log('Swipe simulation does not work here — aborting.'); process.exit(2); }
}
for (const vp of VIEWPORTS) {
  for (const lang of ['ar', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true, locale: lang === 'ar' ? 'ar-SA' : 'en-US', userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
  await ctx.route('**/firebase-config.json', (r) => r.fulfill({ status: 404, body: '' })); // guest mode under test (accounts are enabled in production)
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await seed(page);
    if (lang === 'en') {
      await page.goto(BASE + '#/settings');
      await page.getByRole('tab', { name: 'English' }).click();
      await page.waitForTimeout(300);
    }
    for (const p of PAGES) {
      await page.goto(BASE + '#' + p);
      await page.waitForLoadState('networkidle');
      if (process.env.FIXCSS) await page.addStyleTag({ content: process.env.FIXCSS });
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0));
      const r = await swipeToBottom(page, cdp);
      const ok = (!r.scrollable || r.atBottom) && r.lastVisibleAboveNav && !r.hscroll && r.inlineLock !== 'hidden';
      rec(ok, `${vp.name} ${lang} ${p}`, ok ? `scrolled ${r.scrollY}/${r.max}` : JSON.stringify(r));
    }
    // Modal flows that previously could leave the page locked.
    const flows = {
      'delete entry via nested confirm': async () => {
        await page.goto(BASE + '#/diary');
        const e = page.getByTestId('entry').first();
        await e.evaluate((n) => n.scrollIntoView({ block: 'center' }));
        await e.click();
        await page.getByTestId('entry-delete').click();
        await page.getByTestId('confirm-yes').click();
      },
      'escape closes nested sheets': async () => {
        await page.goto(BASE + '#/recipes?tab=recipes');
        await page.getByTestId('new-recipe').click();
        await page.getByTestId('add-ingredient').click();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await page.keyboard.press('Escape');
      },
      'android back button closes a sheet': async () => {
        await page.goto(BASE + '#/diary');
        const add = page.getByTestId('add-dinner');
        await add.evaluate((n) => n.scrollIntoView({ block: 'center' }));
        await add.click();
        await page.goBack();
      },
      'more menu navigation': async () => {
        await page.goto(BASE + '#/');
        await page.getByTestId('nav-more').click();
        await page.locator('.drawer-grid a').nth(2).click();
      }
    };
    for (const [name, run] of Object.entries(flows)) {
      try {
        await run();
        await page.waitForTimeout(400);
        await page.goto(BASE + '#/diary');
        await page.waitForTimeout(400);
        await page.evaluate(() => window.scrollTo(0, 0));
        const r = await swipeToBottom(page, cdp);
        const ok = r.inlineLock !== 'hidden' && (!r.scrollable || r.atBottom);
        rec(ok, `${vp.name} ${lang} after "${name}"`, ok ? `scrolled ${r.scrollY}/${r.max}` : JSON.stringify(r));
      } catch (e) {
        rec(false, `${vp.name} ${lang} after "${name}"`, String(e.message).split('\n')[0]);
      }
    }
    await ctx.close();
  }
}
await browser.close();
server?.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} scroll checks passed`);
process.exit(failed.length ? 1 : 0);
