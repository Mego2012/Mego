// Diet strategy final audit, end to end in the built app (guest, Arabic, phone size):
// all six strategies applied one after another (targets saved and adding up), carb cycling with the workout-schedule
// button and a hand-set day (week still aligned), strategy history recorded, undo restores the original targets,
// and food log, weight and workout records stay identical throughout. Usage: npx vite build && node e2e/diet-strategy-test.cjs
const pw = require('playwright'); const { spawn } = require('child_process');
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4196', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 860 }, locale: 'ar' }); p.setDefaultTimeout(20000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const B = 'http://localhost:4196/'; let failed = 0, total = 0;
  const check = (n, ok, d = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  await p.goto(B); await p.waitForTimeout(1500);
  if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1500); }
  const read = (store, key) => p.evaluate(([st, k]) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const o = r.result.transaction(st).objectStore(st); const q = k ? o.get(k) : o.getAll(); q.onsuccess = () => res(q.result); }; }), [store, key]);
  // records that must survive: a food entry (through the UI), a weigh-in and a workout
  await p.goto(B + '#/diary'); await p.getByTestId('add-lunch').click(); await p.getByTestId('food-search').fill('DS test food'); await p.getByTestId('create-from-search').click();
  for (const [id, v] of [['fe-kcal', '200'], ['fe-protein', '20'], ['fe-carbs', '10'], ['fe-fat', '8']]) await p.getByTestId(id).fill(v);
  await p.getByTestId('fe-save').click(); await p.getByTestId('qty-input').fill('100'); await p.getByTestId('qty-submit').click(); await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await p.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => res(r.result); }); const tx = db.transaction(['body', 'kv'], 'readwrite');
    tx.objectStore('body').put({ id: 'bw1', date: '2026-11-01', weight: 72.4, waist: 82, notes: '', createdAt: 1, updatedAt: 1 });
    tx.objectStore('kv').put({ key: 'workout:wk1', value: { id: 'wk1', date: '2026-11-01', name: 'Legs', muscles: ['quads'], startedAt: 1, endedAt: 2, bodyWeightKg: 72, exercises: [] }, updatedAt: 1 });
    await new Promise((res) => { tx.oncomplete = res; }); });
  const snap = async () => JSON.stringify([await read('entries'), await read('body'), await read('kv', 'workout:wk1')]);
  const before = await snap(); const t0 = (await read('settings', 'main')).targets;
  const open = async () => { await p.goto(B + '#/settings'); await p.reload(); await p.getByTestId('diet-strategy').waitFor(); };
  const apply = async () => { await p.getByTestId('ds-apply').click(); await p.getByTestId('confirm-yes').click(); await p.waitForTimeout(900); };
  const sums = (m) => 4 * m.protein + 4 * m.carbs + 9 * m.fat;
  for (const mode of ['flexible', 'low_carb', 'keto', 'high_protein', 'custom', 'carb_cycling']) {
    await open(); await p.getByTestId('ds-mode-' + mode).click();
    if (mode === 'low_carb') await p.getByTestId('ds-carbs').fill('80');
    if (mode === 'custom') { await p.getByTestId('ds-protein').fill('150'); await p.getByTestId('ds-carbs').fill('180'); await p.getByTestId('ds-fat').fill('70'); }
    if (mode === 'carb_cycling') {
      await p.getByTestId('ds-from-program').click();
      await p.getByTestId('ds-day-1').selectOption('low');
      await p.getByTestId('ds-ovr-high').click(); // hand-set the high day
      check('carb cycling: week total matches the weekly target with a hand-set day', /✓/.test(await p.getByTestId('ds-week-total').innerText()), await p.getByTestId('ds-week-total').innerText());
    }
    await apply();
    const s = await read('settings', 'main'); const m = s.targets.training;
    const okSum = mode === 'custom' ? m.kcal === sums(m) : Math.abs(sums(m) - m.kcal) <= 5;
    const extra = mode === 'low_carb' ? m.carbs === 80 : mode === 'keto' ? m.carbs <= 50 : mode === 'custom' ? m.protein === 150 && m.carbs === 180 && m.fat === 70 : true;
    check(`${mode}: saved, macros add up, mode-specific values kept`, s.dietStrategy?.mode === mode && okSum && extra && JSON.stringify(s.targets.training) === JSON.stringify(s.targets.rest), JSON.stringify(m));
  }
  const hist = (await read('kv', 'dietHistory'))?.value ?? [];
  check('history: one open period, earlier ones closed (same-day changes replace the open one)', hist.length >= 1 && !hist[hist.length - 1].end && hist[hist.length - 1].mode === 'carb_cycling', JSON.stringify(hist.map((h) => h.mode)));
  await p.goto(B + '#/coach?tab=advisor'); await p.getByTestId('diet-advisor').waitFor();
  check('advisor shows the trial for the current strategy', /تدوير الكربوهيدرات/.test(await p.getByTestId('adv-trial').innerText()));
  await open(); await p.getByTestId('ds-undo').click(); await p.getByTestId('confirm-yes').click(); await p.waitForTimeout(900);
  const s = await read('settings', 'main');
  check('undo restores the original targets and removes the strategy', !s.dietStrategy && JSON.stringify(s.targets) === JSON.stringify(t0));
  check('food log, weight and workout records identical after 6 switches and undo', (await snap()) === before);
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`${total - failed}/${total} diet strategy checks passed`);
  await b.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
