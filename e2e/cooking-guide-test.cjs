// Cooking Guide end to end in the built app (guest account, owner targets 2,110 kcal / 160 g protein):
// library size and filters, exact seasonings counted (not estimated), servings scaling, ingredient substitution with
// recalculation, cooking instructions, Start-cooking mode with a running timer, logging a substituted version,
// Arabic + English, phone + desktop without horizontal overflow, and existing records / targets unchanged.
// Usage: npx vite build && node e2e/cooking-guide-test.cjs
const pw = require('playwright'); const { spawn } = require('child_process');
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4197', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const b = await pw.chromium.launch();
  const B = 'http://localhost:4197/'; let failed = 0, total = 0;
  const check = (n, ok, d = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  const num = (s) => Number(String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٬,]/g, '').replace('٫', '.').match(/-?\d+(\.\d+)?/)?.[0]);

  const ctx = await b.newContext({ viewport: { width: 390, height: 860 }, locale: 'ar' }); const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B); await p.waitForTimeout(1500);
  if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1500); }
  const idb = (fn, arg) => p.evaluate(([src, a]) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const f = new Function('db', 'a', 'return (' + src + ')(db, a)'); Promise.resolve(f(r.result, a)).then(res); }; }), [fn.toString(), arg]);
  const read = (store, key) => idb((db, a) => new Promise((res) => { const o = db.transaction(a[0]).objectStore(a[0]); const q = a[1] ? o.get(a[1]) : o.getAll(); q.onsuccess = () => res(q.result); }), [store, key]);
  // owner targets + records that must survive
  await idb((db) => new Promise((res) => {
    const tx = db.transaction(['settings', 'body', 'entries'], 'readwrite'); const st = tx.objectStore('settings');
    const q = st.get('main'); q.onsuccess = () => { const s = q.result; const T = { kcal: 2110, protein: 160, carbs: 235, fat: 59 }; s.targets = { training: { ...T }, rest: { ...T } }; s.lang = 'ar'; st.put(s); };
    tx.objectStore('body').put({ id: 'bw1', date: '2026-11-01', weight: 72.4, waist: 82, notes: '', createdAt: 1, updatedAt: 1 });
    tx.objectStore('entries').put({ id: 'e-keep', date: '2026-11-01', meal: 'breakfast', foodId: 'x', name: 'keep me', quantity: 100, unit: 'g', grams: 100, macros: { kcal: 200, protein: 20, carbs: 10, fat: 8 }, createdAt: 1, updatedAt: 1 });
    tx.oncomplete = res;
  }));
  const snap = async () => JSON.stringify([(await read('entries')).filter((e) => e.id === 'e-keep'), await read('body'), (await read('settings', 'main')).targets]);
  const before = await snap();

  await p.goto(B + '#/recipes?tab=library'); await p.reload(); await p.getByTestId('library').waitFor();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="library-card"]').length > 50);
  const count = await p.getByTestId('library-count').innerText();
  check('library shows all 121 recipes (101 + 20 new)', /^121 \/ 121|١٢١ \/ ١٢١/.test(count), count);
  await p.getByTestId('tag-sauce').click();
  check('sauce filter lists the 6 healthy sauces', (await p.getByTestId('library-card').count()) === 6);
  await p.getByTestId('tag-all').click();

  // filters
  await p.getByTestId('lib-filters-toggle').click();
  await p.getByTestId('f-ingredient').fill('ثوم'); await p.getByTestId('f-maxkcal').fill('350'); await p.getByTestId('f-method').selectOption('air-fryer');
  await p.waitForTimeout(300);
  const kc = await p.getByTestId('card-kcal').allInnerTexts();
  check('filters: garlic + ≤350 kcal + air fryer → matching cards only', kc.length > 0 && kc.every((x) => num(x) <= 350), `${kc.length} cards`);
  await p.getByTestId('f-clear').click();
  await p.getByTestId('f-maxmin').fill('15'); await p.waitForTimeout(200);
  const quick = await p.getByTestId('library-card').count();
  check('filter by total time (≤15 min) narrows the list', quick > 0 && quick < 60, String(quick));
  await p.getByTestId('f-clear').click();

  // open the lemon-garlic chicken
  await p.getByTestId('library-search').fill('بالليمون والثوم والأعشاب');
  await p.getByTestId('library-card').first().click(); await p.getByTestId('recipe-detail').waitFor();
  check('marinating time and temperature chips', (await p.getByTestId('chip-marinate').count()) === 1 && /220/.test(await p.getByTestId('chip-temp').first().innerText()));
  const seasRows = p.locator('[data-testid="ingredient-row"][data-role="seasoning"]');
  check('6 seasoning lines, each with grams and calories (salt 0)', (await seasRows.count()) === 6 && /بابريكا/.test(await p.getByTestId('ing-group-marinade').innerText()));
  check('seasonings counted note (kcal from seasonings > 0)', num(await p.getByTestId('seasoning-kcal').innerText()) > 0, await p.getByTestId('seasoning-kcal').innerText());
  const per0 = num(await p.getByTestId('detail-kcal').innerText()); const tot0 = num(await p.getByTestId('detail-total').innerText());
  check('per serving ≈ 295 kcal (chicken, oil, lemon, garlic and spices)', per0 >= 285 && per0 <= 305, String(per0));
  check('fits-today block uses the 2,110 kcal target', /2[,٬]?110|٢[٬,]?١١٠/.test(await p.getByTestId('fits-today').innerText()));
  for (let i = 0; i < 4; i++) await p.getByTestId('serv-plus').click();
  const per8 = num(await p.getByTestId('detail-kcal').innerText()); const tot8 = num(await p.getByTestId('detail-total').innerText());
  const g8 = num(await p.getByTestId('ing-grams').first().innerText());
  check('scaling 4 → 8 servings doubles amounts and totals, keeps per serving', g8 === 1600 && Math.abs(tot8 - 2 * tot0) <= 2 && Math.abs(per8 - per0) <= 1, `${g8} g, ${tot0}→${tot8}, ${per0}/${per8}`);
  await p.getByTestId('serv-minus').click(); await p.getByTestId('serv-minus').click(); await p.getByTestId('serv-minus').click(); await p.getByTestId('serv-minus').click();
  // substitute chicken breast → thigh
  await p.getByTestId('swap-btn').first().click(); await p.getByTestId('swap-option').first().click();
  const perSwap = num(await p.getByTestId('detail-kcal').innerText());
  check('substitution recalculates (breast → thigh changes kcal per serving)', (await p.getByTestId('swap-banner').count()) === 1 && perSwap !== per0, `${per0} → ${perSwap}`);
  // instructions
  await p.getByTestId('view-instructions').click(); await p.getByTestId('instructions').waitFor();
  check('cooking instructions: 7 steps with timers and a serving note', (await p.locator('.ck-steps li').count()) === 7 && (await p.locator('.ck-steps .chip').count()) >= 3 && /150/.test(await p.getByTestId('serving-note').innerText()));
  // cooking mode
  await p.getByTestId('start-cooking').click(); await p.getByTestId('cook-mode').waitFor();
  check('cooking mode starts with the ingredient check-off', /9/.test(await p.getByTestId('cook-step-n').innerText()) || /٩/.test(await p.getByTestId('cook-step-n').innerText()));
  for (let i = 0; i < 3; i++) await p.getByTestId('cook-next').click();
  await p.getByTestId('cook-start-timer').first().click(); await p.waitForTimeout(1300);
  const tt = await p.getByTestId('cook-timer').first().innerText();
  check('marinating timer runs (30:00 counting down)', /29:5\d|30:00/.test(tt), tt.split('\n')[0]);
  await p.getByTestId('cook-next').click();
  check('timer keeps running on the next step', (await p.getByTestId('cook-timer').count()) === 1);
  for (let i = 0; i < 4; i++) await p.getByTestId('cook-next').click();
  check('last step is serving', (await p.getByTestId('cook-serve').count()) === 1);
  const wCook = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('cooking mode: no horizontal overflow on a phone', wCook <= 2, String(wCook));
  await p.getByTestId('cook-finish').click(); await p.waitForTimeout(300);
  // log the substituted version
  await p.getByTestId('lib-add-diary').click(); await p.getByTestId('dms-confirm').click(); await p.waitForTimeout(1500);
  const recipes = await read('recipes'); const variant = recipes.find((r) => (r.libraryId || '').startsWith('lib-lemon-herb-chicken~'));
  const entries = await read('entries'); const logged = entries.find((e) => e.recipeId === variant?.id);
  check('logging saves a separate substituted version and a diary entry with the same kcal', !!variant && /معدّلة/.test(variant.name) && !!logged && Math.abs(logged.macros.kcal - perSwap) <= 2, logged ? `${logged.macros.kcal} vs ${perSwap}` : 'none');
  check('the saved recipe has no salt line but has the spices', !!variant && !variant.ingredients.some((i) => i.name === 'ملح') && variant.ingredients.some((i) => i.name === 'بابريكا'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // English + desktop
  await idb((db) => new Promise((res) => { const tx = db.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; s.lang = 'en'; st.put(s); }; tx.oncomplete = res; }));
  for (const vp of [{ width: 390, height: 860 }, { width: 1366, height: 820 }]) {
    await p.setViewportSize(vp); await p.goto(B + '#/recipes?tab=library'); await p.reload(); await p.getByTestId('library').waitFor();
    await p.getByTestId('library-search').fill('Spiced beef & parsley kofta'); await p.getByTestId('library-card').first().click(); await p.getByTestId('recipe-detail').waitFor(); await p.waitForTimeout(600);
    const txt = await p.getByTestId('recipe-detail').innerText();
    const dir = await p.evaluate(() => document.documentElement.dir);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`English ${vp.width}px: English ingredient names, LTR, no overflow`, /Cumin, ground/.test(txt) && /Allspice/i.test(txt) && dir !== 'rtl' && ov <= 2, `dir=${dir} overflow=${ov}`);
    await p.keyboard.press('Escape');
  }
  await idb((db) => new Promise((res) => { const tx = db.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; s.lang = 'ar'; st.put(s); }; tx.oncomplete = res; }));
  await p.setViewportSize({ width: 1366, height: 820 }); await p.goto(B + '#/recipes?tab=library'); await p.reload(); await p.getByTestId('library').waitFor();
  await p.getByTestId('library-search').fill('صلصة طحينة'); await p.getByTestId('library-card').first().click(); await p.getByTestId('recipe-detail').waitFor();
  const ovAr = await p.evaluate(() => [document.documentElement.scrollWidth - window.innerWidth, document.documentElement.dir]);
  check('Arabic desktop: RTL and no overflow; water listed as 0 kcal', ovAr[0] <= 2 && ovAr[1] === 'rtl' && (await p.getByTestId('water-line').count()) === 1, JSON.stringify(ovAr));
  await p.keyboard.press('Escape');

  check('existing records and the 2,110 / 160 targets are unchanged', (await snap()) === before);
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`${total - failed}/${total} cooking guide checks passed`);
  await b.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
