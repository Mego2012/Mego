/**
 * LIVE meal-scanner test against the REAL backend (Apps Script + Gemini) and the real Firebase project.
 * Registers ONE throw-away account (random @example.com, printed first), sends one licensed dish photo to the
 * deployed backend exactly like the app does (action analyzeMeal + Firebase ID token), checks the answer, and then
 * DELETES the account through the app (always, in finally). Also checks that the backend refuses a missing or
 * forged token. Logs contain no tokens.
 *
 *   node e2e/live-scanner-test.mjs        (BASE_URL defaults to https://mego2012.github.io/Mego/)
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = process.env.BASE_URL || 'https://mego2012.github.io/Mego/';
const cfg = await (await fetch(BASE + 'firebase-config.json')).json();
const rnd = Math.random().toString(36).slice(2, 8);
const EMAIL = `mego-audit-s-${rnd}@example.com`, PW = 'Audit-' + rnd + '-Pw9!';
console.log('throw-away account for this run: ' + EMAIL);
let total = 0, failed = 0;
const check = async (name, fn) => {
  total++;
  try { const d = await fn(); console.log(`PASS  ${name}${d ? ' — ' + d : ''}`); }
  catch (e) { failed++; console.log(`FAIL  ${name} — ${String(e.message || e).slice(0, 300)}`); }
};
const post = async (body) => {
  const r = await fetch(cfg.aiBackendUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
  return r.json();
};
const jpeg = execFileSync('ffmpeg', ['-v', 'error', '-i', new URL('../public/dish-img/lib-beef-shawarma.webp', import.meta.url).pathname, '-vf', 'scale=640:-1', '-f', 'mjpeg', '-'], { maxBuffer: 1 << 24 }).toString('base64');
const foods = [
  { k: 'f1', ar: 'لحم بقري مطبوخ', en: 'Beef, cooked', s: 'cooked', c: 'meat' },
  { k: 'f2', ar: 'خبز عربي', en: 'Pita bread', s: '', c: 'grains' },
  { k: 'f3', ar: 'طحينة', en: 'Tahini', s: '', c: 'fats' },
  { k: 'f4', ar: 'طماطم', en: 'Tomato', s: 'raw', c: 'vegetables' },
];

const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
const page = await ctx.newPage(); page.setDefaultTimeout(30000);
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const token = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('firebaseLocalStorageDb'); r.onsuccess = () => { const q = r.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll(); q.onsuccess = () => { const u = q.result[0]?.value; res(u ? { t: u.stsTokenManager?.accessToken, uid: u.uid } : null); }; }; }));
let registered = false;
try {
  await check('backend reachable (GET)', async () => { const j = await (await fetch(cfg.aiBackendUrl, { redirect: 'follow' })).json(); if (!j.ok) throw new Error(JSON.stringify(j)); return 'version ' + j.version; });
  await check('backend refuses a scan without a sign-in token', async () => { const j = await post({ action: 'analyzeMeal', image: 'x', mediaType: 'image/jpeg', foods: [] }); if (j.ok) throw new Error('accepted'); return j.error; });
  await check('backend refuses a forged sign-in token', async () => { const j = await post({ action: 'analyzeMeal', idToken: 'forged.token.value', image: 'x', mediaType: 'image/jpeg', foods: [] }); if (j.ok) throw new Error('accepted'); return j.error; });
  await check('REGISTER throw-away account (live Firebase)', async () => {
    await page.goto(BASE); await page.getByTestId('welcome').waitFor();
    if ((await page.locator('html').getAttribute('lang')) !== 'en') { await page.getByTestId('wel-lang').click(); await page.waitForTimeout(400); }
    await page.getByTestId('wel-register').click();
    await page.getByTestId('reg-name').fill('Audit Scanner'); await page.getByTestId('reg-email').fill(EMAIL); await page.getByTestId('reg-password').fill(PW);
    await page.getByTestId('reg-country').selectOption('SA'); await page.getByTestId('reg-age18').check(); await page.getByTestId('reg-terms').check();
    await page.getByTestId('reg-next1').click(); await page.getByTestId('reg-weight').fill('80'); await page.getByTestId('reg-next2').click();
    registered = true; // from here on the account may exist: always try to delete it
    await page.getByTestId('reg-submit').click();
    await page.getByTestId('dashboard').waitFor({ timeout: 30000 });
    return 'signed in';
  });
  await check('MEAL SCANNER: real photo → Gemini → structured result', async () => {
    const tk = await token(); if (!tk?.t) throw new Error('no session');
    const t0 = Date.now();
    const j = await post({ action: 'analyzeMeal', idToken: tk.t, image: jpeg, mediaType: 'image/jpeg', foods, lang: 'en', note: '' });
    if (!j.ok) throw new Error('backend: ' + (j.error || JSON.stringify(j).slice(0, 200)) + (j.google ? ' · ' + JSON.stringify(j.google).slice(0, 160) : ''));
    const items = j.result?.items ?? j.result?.foods ?? [];
    if (!Array.isArray(items) || !items.length) throw new Error('no items: ' + JSON.stringify(j.result).slice(0, 200));
    return `${items.length} item(s) in ${((Date.now() - t0) / 1000).toFixed(1)} s: ` + items.map((i) => `${i.name ?? i.en ?? i.k ?? '?'}${i.grams ? ' ' + i.grams + ' g' : ''}`).join(', ').slice(0, 160);
  });
} finally {
  if (registered) {
    await check('DELETE throw-away account through the app; sign-in refused afterwards', async () => {
      await page.goto(BASE + '#/settings'); await page.getByTestId('account-card').waitFor(); await page.getByTestId('acc-delete').click();
      await page.getByTestId('delete-password').fill(PW); await page.getByTestId('delete-confirm-btn').click();
      await page.getByTestId('welcome').waitFor({ timeout: 40000 });
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Referer: BASE }, body: JSON.stringify({ email: EMAIL, password: PW, returnSecureToken: true }) });
      if (r.status === 200) throw new Error('sign-in still works');
      return 'account deleted (sign-in → HTTP ' + r.status + ')';
    });
  }
  await check('no page errors during the run', async () => { if (errs.length) throw new Error(errs.join(' | ').slice(0, 300)); });
  await b.close();
  console.log(`\n${total - failed}/${total} live scanner checks passed`);
  process.exit(failed ? 1 : 0);
}
