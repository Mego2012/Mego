// Flexible calorie budget, end to end (guest, local build, test data): daily/weekly/monthly numbers from logged meals,
// unlogged day not counted as zero, optional suggestion, settings, a target change through Goals keeps past weeks,
// Arabic + English, phone + desktop, records unchanged. Usage: npx vite build && node e2e/budget-test.cjs
const pw = require('playwright'); const { spawn } = require('child_process');
const iso = (d) => d.toISOString().slice(0, 10);
const add = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4191', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const B = process.env.BASE_URL || 'http://localhost:4191/'; const b = await pw.chromium.launch(); let failed = 0, total = 0;
  const check = (n, ok, d = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B); await p.waitForTimeout(1500); if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1200); }
  const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const wd = new Date(today + 'T12:00:00Z').getUTCDay();
  const weekStart = add(today, -((wd - 6 + 7) % 7)); // weeks start on Saturday in this test
  const daysSoFar = Array.from({ length: (wd - 6 + 7) % 7 }, (_, i) => add(weekStart, i));
  const idb = (fn, arg) => p.evaluate(([src, a]) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const f = new Function('db', 'a', 'return (' + src + ')(db, a)'); Promise.resolve(f(r.result, a)).then(res); }; }), [fn.toString(), arg]);
  let k = 0; const E = (date, kcal, protein = 160) => ({ id: 'bt' + ++k, date, meal: 'lunch', foodId: 'f', name: 'Test', state: 'cooked', quantity: 100, unit: 'g', grams: 100, basis: { kind: 'per100g' }, macros: { kcal, protein, carbs: 200, fat: 60 }, order: 1, createdAt: 1, updatedAt: 1 });
  // this week: first past day 2400, second past day NOT logged (if it exists), others 2200; today 1000. Older days of the month: 2110.
  const plan = daysSoFar.map((d, i) => (i === 1 ? null : E(d, i === 0 ? 2400 : 2200)));
  const entries = [...plan.filter(Boolean), E(today, 1000, 70)];
  const month = today.slice(0, 7); const monthDays = []; for (let d = month + '-01'; d < weekStart && d.startsWith(month); d = add(d, 1)) monthDays.push(d);
  for (const d of monthDays) entries.push(E(d, 2110));
  await idb((db, a) => new Promise((res) => { const tx = db.transaction(['settings', 'entries'], 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; const T = { kcal: 2110, protein: 160, carbs: 235, fat: 59 }; s.targets = { training: { ...T }, rest: { ...T } }; s.weekStartsOn = 6; s.lang = 'en'; s.cardioCalorieMode = 'off'; s.updatedAt = Date.now(); st.put(s); }; for (const e of a) tx.objectStore('entries').put(e); tx.oncomplete = res; }), entries);
  const snapshot = async () => JSON.stringify(await idb((db) => new Promise((res) => { const q = db.transaction('entries').objectStore('entries').getAll(); q.onsuccess = () => res(q.result); })));
  const before = await snapshot();
  const num = (s) => Number(String(s).replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace(/[^\d.−-]/g, '').replace('−', '-'));
  await p.goto(B + '#/'); await p.reload(); await p.getByTestId('budget-card').waitFor(); await p.waitForTimeout(800);
  // daily
  check('daily: consumed today 1,000 and remaining 1,110', num(await p.getByTestId('bu-day-consumed').innerText()) === 1000 && num(await p.getByTestId('bu-day-remaining').innerText()) === 1110);
  // weekly
  await p.getByTestId('budget-card').getByRole('tab').nth(1).click(); await p.waitForTimeout(400);
  const logged = entries.filter((e) => e.date >= weekStart && e.date <= today);
  const consumed = logged.reduce((a, e) => a + e.macros.kcal, 0);
  const unlogged = daysSoFar.length >= 2 ? 1 : 0;
  const tracked = 14770 - unlogged * 2110;
  check('weekly budget = 7 × 2,110 = 14,770', num(await p.getByTestId('bu-w-budget').innerText()) === 14770);
  check('weekly consumed = sum of this week’s logged meals', num(await p.getByTestId('bu-w-consumed').innerText()) === consumed, `${consumed}`);
  check('weekly remaining = budget of tracked days − consumed', num(await p.getByTestId('bu-w-remaining').innerText()) === tracked - consumed, `${tracked - consumed}`);
  check('seven day rows; an unlogged past day is shown as not logged (not zero)', (await p.getByTestId('bu-day-row').count()) === 7 && (unlogged === 0 || (await p.getByTestId('bu-w-unlogged').count()) === 1));
  check('optional suggestion shown, worded as optional', (await p.getByTestId('bu-w-suggestion').count()) === 1 && /suggestion only/i.test(await p.getByTestId('bu-w-suggestion').innerText()));
  if (daysSoFar.length) check('a day above target shows +290 (2,400 vs 2,110)', /\+290/.test(await p.getByTestId('bu-w-days').innerText()));
  // monthly
  await p.getByTestId('budget-card').getByRole('tab').nth(2).click(); await p.waitForTimeout(400);
  const dim = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  check('monthly budget = 2,110 × days in this month', num(await p.getByTestId('bu-m-budget').innerText()) === 2110 * dim, `${dim} days`);
  const mConsumed = entries.filter((e) => e.date.startsWith(month)).reduce((a, e) => a + e.macros.kcal, 0);
  check('monthly consumed = the same meals as the weeks (nothing counted twice)', num(await p.getByTestId('bu-m-consumed').innerText()) === mConsumed, `${mConsumed}`);
  check('monthly week-by-week breakdown present', (await p.getByTestId('bu-week-row').count()) >= 4);
  // settings
  await p.goto(B + '#/goals'); await p.getByTestId('budget-settings').waitFor();
  await p.getByTestId('bu-suggestions').click(); await p.waitForFunction(() => !document.querySelector('[data-testid="bu-suggestions"]').checked);
  await p.goto(B + '#/'); await p.getByTestId('budget-card').getByRole('tab').nth(1).click(); await p.waitForTimeout(300);
  check('suggestions can be switched off', (await p.getByTestId('bu-w-suggestion').count()) === 0);
  // target change through Goals: today's budget changes, last week keeps 14,770
  await p.goto(B + '#/goals'); const kc = p.getByTestId('goal-kcal'); await kc.click(); await kc.fill(''); await kc.pressSequentially('2000', { delay: 40 }); await p.getByTestId('goal-protein').click(); await p.waitForTimeout(500);
  const hist = await idb((db) => new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get('targetHistory'); q.onsuccess = () => res(q.result?.value ?? []); }));
  check('target change recorded in the target history (old 2,110 kept)', hist.length === 2 && hist[0].targets.training.kcal === 2110 && hist[1].targets.training.kcal === 2000 && hist[1].from === today);
  await p.goto(B + '#/reports/week?date=' + add(weekStart, -3)); await p.getByTestId('report-budget').waitFor();
  check('last week’s report keeps its 14,770 budget after the change', /14,770/.test(await p.getByTestId('report-budget').innerText()));
  await p.goto(B + '#/'); await p.getByTestId('budget-card').waitFor(); await p.waitForTimeout(500);
  check('today uses the new target (2,000)', num(await p.getByTestId('bu-day-remaining').innerText()) === 1000);
  check('meal records unchanged by all of this', (await snapshot()) === before);
  // languages and layouts
  for (const [lang, vp] of [['ar', { width: 390, height: 844 }], ['en', { width: 1366, height: 820 }], ['ar', { width: 1366, height: 820 }]]) {
    await idb((db, l) => new Promise((res) => { const tx = db.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; s.lang = l; st.put(s); }; tx.oncomplete = res; }), lang);
    await p.setViewportSize(vp);
    for (const tab of [0, 1, 2]) {
      await p.goto(B + '#/'); await p.reload(); await p.getByTestId('budget-card').waitFor(); await p.getByTestId('budget-card').getByRole('tab').nth(tab).click(); await p.waitForTimeout(300);
      const info = await p.evaluate(() => ({ dir: document.documentElement.dir, ov: document.documentElement.scrollWidth - window.innerWidth, txt: document.querySelector('[data-testid="budget-card"]').innerText }));
      const wrongLang = lang === 'en' ? /[؀-ۿ]/.test(info.txt) : /\b[a-z]{4,}\b/i.test(info.txt.replace(/kcal/g, ''));
      check(`${lang} ${vp.width}px tab ${tab}: direction, no overflow, one language`, (info.dir === 'rtl') === (lang === 'ar') && info.ov <= 2 && !wrongLang, `dir=${info.dir} ov=${info.ov}`);
    }
  }
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`${total - failed}/${total} calorie budget checks passed`);
  await b.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
