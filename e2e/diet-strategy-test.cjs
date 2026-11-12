// Diet strategy, end to end in the built app (guest, Arabic, phone size): keto → carb cycling (edited schedule) → undo.
// A food log entry is created first and must be identical after every switch. Usage: npx vite build && node e2e/diet-strategy-test.cjs
const pw = require('playwright'); const { spawn } = require('child_process');
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4196', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 860 }, locale: 'ar' }); p.setDefaultTimeout(20000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const B = 'http://localhost:4196/'; let failed = 0;
  const check = (n, ok, d = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  await p.goto(B); await p.waitForTimeout(1500);
  if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1500); }
  const read = (store, key) => p.evaluate(([st, k]) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const o = r.result.transaction(st).objectStore(st); const q = k ? o.get(k) : o.getAll(); q.onsuccess = () => res(q.result); }; }), [store, key]);
  await p.goto(B + '#/diary'); await p.getByTestId('add-lunch').click(); await p.getByTestId('food-search').fill('DS test food'); await p.getByTestId('create-from-search').click();
  for (const [id, v] of [['fe-kcal', '200'], ['fe-protein', '20'], ['fe-carbs', '10'], ['fe-fat', '8']]) await p.getByTestId(id).fill(v);
  await p.getByTestId('fe-save').click(); await p.getByTestId('qty-input').fill('100'); await p.getByTestId('qty-submit').click(); await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  const logBefore = JSON.stringify(await read('entries')); const t0 = (await read('settings', 'main')).targets;
  const open = async () => { await p.goto(B + '#/settings'); await p.getByTestId('diet-strategy').waitFor(); };
  const apply = async () => { await p.getByTestId('ds-apply').click(); await p.getByTestId('confirm-yes').click(); await p.waitForTimeout(800); };
  await open(); await p.getByTestId('ds-mode-keto').click(); await apply();
  let s = await read('settings', 'main'); const k = s.targets.training;
  check('keto: carbs 25 g, same calories, fat balances', s.dietStrategy?.mode === 'keto' && k.carbs === 25 && k.kcal === t0.training.kcal, JSON.stringify(k));
  check('macros add up (±5 kcal)', Math.abs(4 * k.protein + 4 * k.carbs + 9 * k.fat - k.kcal) <= 5);
  await p.goto(B + '#/'); await p.getByTestId('dashboard').waitFor();
  check('home shows the strategy', (await p.getByTestId('strategy-chip').count()) === 1);
  await open(); await p.getByTestId('ds-mode-carb_cycling').click(); await p.getByTestId('ds-cycle').waitFor(); await p.getByTestId('ds-day-1').selectOption('low'); await apply();
  s = await read('settings', 'main');
  check('carb cycling with the edited schedule', s.dietStrategy?.mode === 'carb_cycling' && s.dietStrategy.cycle.schedule[1] === 'low');
  const ring = async (date) => { await p.goto(B + '#/diary?date=' + date); await p.getByTestId('diary').waitFor(); await p.waitForTimeout(400); return await p.getByTestId('diary-target').innerText(); };
  const sat = await ring('2026-11-14'), mon = await ring('2026-11-16'), fri = await ring('2026-11-13');
  check('each weekday has its own target', sat !== mon && mon !== fri, `Sat ${sat} · Mon ${mon} · Fri ${fri}`);
  await open(); await p.getByTestId('ds-undo').click(); await p.getByTestId('confirm-yes').click(); await p.waitForTimeout(800);
  s = await read('settings', 'main');
  check('undo restores the earlier targets', !s.dietStrategy && JSON.stringify(s.targets) === JSON.stringify(t0));
  check('food log identical after all switches', JSON.stringify(await read('entries')) === logBefore);
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`${8 - failed}/8 diet strategy checks passed`);
  await b.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
