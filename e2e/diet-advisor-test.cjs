// Diet advisor end to end (guest, Arabic, phone size): seeded 3 weeks of logs + weigh-ins + high-hunger check-ins →
// Coach → Diet advisor shows a recommendation with reasons, 2 alternatives, a comparison and a hunger review item;
// accepting applies the strategy only after confirmation, and the food log stays identical.
// Usage: npx vite build && node e2e/diet-advisor-test.cjs
const pw = require('playwright'); const { spawn } = require('child_process');
const SHOT = process.env.SHOT || '';
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4197', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 860 }, locale: 'ar' }); p.setDefaultTimeout(20000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const B = 'http://localhost:4197/'; let failed = 0; const total = 7;
  const check = (n, ok, d = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  await p.goto(B); await p.waitForTimeout(1500);
  if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1500); }
  await p.evaluate(async () => {
    const day = (i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10); };
    const db = await new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => res(r.result); });
    const tx = db.transaction(['entries', 'body', 'kv'], 'readwrite');
    for (let i = 1; i <= 21; i++) tx.objectStore('entries').put({ id: 'seed' + i, date: day(i), meal: 'lunch', name: 'Seed meal', state: 'cooked', quantity: 1, unit: 'serving', grams: 500, basis: {}, macros: { kcal: 1950, protein: 100, carbs: 250, fat: 55 }, order: 0, createdAt: 1, updatedAt: 1 });
    for (let i = 0; i < 28; i++) tx.objectStore('body').put({ id: 'w' + i, date: day(i), weight: 72 - (27 - i) * 0.03, notes: '', createdAt: 1, updatedAt: 1 });
    for (const i of [10, 3]) tx.objectStore('kv').put({ key: 'checkin:' + day(i), value: { week: day(i), strength: 'same', hunger: 5, recovery: 3, resistanceSessions: 6, updatedAt: 1 }, updatedAt: 1 });
    await new Promise((res) => { tx.oncomplete = res; });
  });
  const read = (st) => p.evaluate((s) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); }; }), st);
  const logBefore = JSON.stringify(await read('entries'));
  await p.goto(B + '#/coach?tab=advisor'); await p.reload(); await p.getByTestId('diet-advisor').waitFor();
  check('disclaimer: rule-based, from your data, not medical advice', (await p.getByTestId('adv-disclaimer').count()) === 1);
  const mode = await p.getByTestId('adv-recommended').getAttribute('data-mode');
  check('recommendation shown with reasons marked by basis', !!mode && (await p.locator('[data-testid=adv-recommended] .da-basis').count()) > 0, 'recommended: ' + mode);
  check('two alternatives and a 6-row comparison', (await p.locator('[data-testid^=adv-alt-]').count()) === 2 && (await p.locator('[data-testid=adv-compare] tbody tr').count()) === 6);
  check('progress review flags the high hunger from the check-ins', (await p.getByTestId('adv-adj-hunger').count()) === 1);
  if (SHOT) { await p.getByTestId('adv-recommended').scrollIntoViewIfNeeded(); await p.screenshot({ path: SHOT + 'adv-rec.png' }); }
  const s0 = (await read('settings'))[0];
  await p.getByTestId('adv-accept-' + mode).click(); await p.getByTestId('confirm-yes').click(); await p.waitForTimeout(800);
  const s1 = (await read('settings'))[0];
  check('accepting applies the strategy (only after confirming)', s1.dietStrategy?.mode === mode && !s0.dietStrategy, JSON.stringify(s1.targets.training));
  check('food log identical', JSON.stringify(await read('entries')) === logBefore);
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`${total - failed}/${total} diet advisor checks passed`);
  await b.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
