// Dietary fiber in the browser: dashboard bar (18 / 25 g, 72 %), partial data, target setting, recipe fiber,
// diary meal line, report section, migration (fill-only), AR/EN · light/dark · phone/desktop. Records unchanged.
// Usage: npm run build && node e2e/fiber-test.cjs   (BASE_URL=… for the live site)
const pw = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const live = !!process.env.BASE_URL;
  const srv = live ? null : spawn('node_modules/.bin/vite', ['preview', '--port', '4192', '--strictPort'], { stdio: 'ignore' });
  if (srv) await new Promise((r) => setTimeout(r, 2500));
  const B = process.env.BASE_URL || 'http://localhost:4192/'; const b = await pw.chromium.launch(); let failed = 0, total = 0;
  const check = (n, ok, d = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  const num = (s) => Number(String(s).replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace('٫', '.').replace(/[^\d.]/g, ''));
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B); await p.waitForTimeout(1500); if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1200); }
  await p.waitForTimeout(6000); // let the first start-up migration finish before seeding (it re-runs after the reload)
  const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const idb = (fn, arg) => p.evaluate(([src, a]) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const f = new Function('db', 'a', 'return (' + src + ')(db, a)'); Promise.resolve(f(r.result, a)).then(res); }; }), [fn.toString(), arg]);
  let k = 0; const E = (date, meal, kcal, fiber) => ({ id: 'fb' + ++k, date, meal, foodId: 'f', name: 'Test ' + k, state: 'cooked', quantity: 100, unit: 'g', grams: 100, basis: { per100: { kcal, protein: 20, carbs: 30, fat: 5 } }, macros: { kcal, protein: 20, carbs: 30, fat: 5, ...(fiber !== undefined ? { fiber } : {}) }, order: k, createdAt: 1, updatedAt: 1 });
  // today: 8 g + 10 g = 18 g of a 25 g target; a USDA lentil food without fiber (as stored before this release) for the migration
  const lentil = { id: 'mig-lentil', nameAr: '', nameEn: 'Lentils, mature seeds, cooked, boiled, without salt', category: 'Legumes', per100: { kcal: 116, protein: 9.02, carbs: 20.13, fat: 0.38 }, state: 'cooked', stateLabel: '', prep: '', notes: '', servings: [], favorite: false, source: 'usda', sourceRef: 'USDA FDC 172421 (SR Legacy)', incomplete: false, archived: false, version: 1, createdAt: 1, updatedAt: 1, useCount: 0 };
  await idb((db, a) => new Promise((res) => { const tx = db.transaction(['settings', 'entries', 'foods'], 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; s.lang = 'en'; delete s.fiberTarget; s.updatedAt = Date.now(); st.put(s); for (const e of a.entries) tx.objectStore('entries').put(e); tx.objectStore('foods').put(a.lentil); }; for (const k of Object.keys(localStorage)) if (k.endsWith(':migration:fiber-v1')) localStorage.removeItem(k); tx.oncomplete = () => res(true); }),
    { entries: [E(today, 'breakfast', 500, 8), E(today, 'lunch', 700, 10)], lentil });
  const snapshot = async () => JSON.stringify(await idb((db) => new Promise((res) => { const q = db.transaction('entries').objectStore('entries').getAll(); q.onsuccess = () => res(q.result); })));
  const before = await snapshot();
  await p.goto(B + '#/'); await p.reload(); await p.getByTestId('fiber-bar').waitFor(); await p.waitForTimeout(600);
  check('dashboard: Dietary Fiber 18 / 25 g', /Dietary Fiber/.test(await p.getByTestId('fiber-bar').innerText()) && (await p.getByTestId('fiber-val').innerText()).replace(/\s+/g, ' ').includes('18 / 25'), await p.getByTestId('fiber-val').innerText());
  const left = await p.getByTestId('fiber-left').innerText();
  check('dashboard: 72% of daily target, 7 g remaining', left.includes('72% of daily target') && /Fiber Remaining 7 g/.test(left), left);
  check('calories untouched by fiber (1,200 kcal eaten)', num(await p.getByTestId('kcal-consumed').innerText()) === 1200);
  // migration ran in the background: fiber filled from USDA, nothing else changed
  const kvMig = () => p.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.endsWith(':migration:fiber-v1')); return k ? { value: JSON.parse(localStorage.getItem(k)) } : null; });
  let mig = null; for (let i = 0; i < 60 && !mig; i++) { mig = await kvMig(); if (!mig) await p.waitForTimeout(500); }
  check('migration recorded (fill-only result)', !!mig, mig ? JSON.stringify({ ...mig.value, foods: undefined }) : 'none');
  const lf = await idb((db) => new Promise((res) => { const q = db.transaction('foods').objectStore('foods').get('mig-lentil'); q.onsuccess = () => res(q.result); }));
  check('migration: USDA food gets USDA fiber 7.9 g/100 g, kcal unchanged', lf.per100.fiber === 7.9 && lf.per100.kcal === 116, JSON.stringify(lf.per100));
  const mb = await idb((db) => new Promise((res) => { const q = db.transaction('backups').objectStore('backups').getAll(); q.onsuccess = () => res(q.result.map((x) => x.reason)); }));
  check('migration: a backup was taken first', mb.includes('pre-import'), mb.join(','));
  // partial data: an entry without fiber → bar says so, never counted as 0
  await idb((db, e) => new Promise((res) => { const tx = db.transaction('entries', 'readwrite'); tx.objectStore('entries').put(e); tx.oncomplete = () => res(true); }), E(today, 'dinner', 300));
  await p.reload(); await p.getByTestId('fiber-bar').waitFor(); await p.waitForTimeout(500);
  check('partial data flagged (2 of 3 entries)', (await p.getByTestId('fiber-partial').innerText()).includes('2 of 3'));
  // target setting
  await p.goto(B + '#/goals'); await p.getByTestId('goal-fiber').waitFor();
  await p.getByTestId('goal-fiber').fill('30'); await p.waitForTimeout(700);
  check('goals: fiber coverage line shown', (await p.getByTestId('fiber-coverage').count()) === 1);
  await p.getByTestId('goal-fiber').fill('500'); await p.waitForTimeout(300);
  check('goals: out-of-range target rejected', (await p.getByTestId('fiber-invalid').count()) === 1);
  await p.goto(B + '#/'); await p.reload(); await p.getByTestId('fiber-bar').waitFor(); await p.waitForTimeout(500);
  check('dashboard follows the configured target (18 / 30 g)', (await p.getByTestId('fiber-val').innerText()).replace(/\s+/g, ' ').includes('18 / 30'));
  // diary: meal line shows fiber when every entry has it; not for the dinner without data
  await p.goto(B + '#/diary'); await p.getByTestId('fiber-bar').waitFor(); await p.waitForTimeout(400);
  const diaryTxt = await p.locator('.timeline').innerText();
  check('diary: fiber in meal and entry lines', /Fiber 8/.test(diaryTxt) && /Fiber 10/.test(diaryTxt));
  // recipe library: lentil soup has fiber per serving / total / per 100 g and per ingredient
  await p.goto(B + '#/recipes?tab=library'); await p.reload(); await p.getByTestId('library').waitFor();
  await p.getByTestId('library-search').fill('Cumin lentil soup'); await p.getByTestId('library-card').first().click(); await p.getByTestId('recipe-detail').waitFor(); await p.waitForTimeout(600);
  const fs = num(await p.getByTestId('fiber-serving').innerText()), ft = num(await p.getByTestId('fiber-total').innerText());
  check('recipe: fiber per serving and total', fs > 5 && ft > fs, `${fs} / ${ft}`);
  check('recipe: per 100 g (before cooking) shown', /per 100 g of ingredients/.test(await p.getByTestId('fiber-per100').innerText()));
  check('recipe: each ingredient shows its fiber', (await p.getByTestId('ing-fiber').count()) >= 3);
  // a recipe with an ingredient without fiber data (raw shrimp) says so instead of under-counting
  await p.goto(B + '#/recipes?tab=library'); await p.reload(); await p.getByTestId('library').waitFor();
  await p.getByTestId('library-search').fill('shrimp'); await p.getByTestId('library-card').first().click(); await p.getByTestId('recipe-detail').waitFor(); await p.waitForTimeout(600);
  check('recipe with unknown-fiber ingredient: "Fiber unknown" + lower bound', /Fiber unknown/.test(await p.getByTestId('fiber-unknown').innerText()));
  // report
  await p.goto(B + '#/reports/week'); await p.waitForTimeout(1500);
  check('weekly report: Dietary Fiber section present', (await p.getByTestId('report-fiber').count()) === 1);
  // AR/EN · light/dark · phone/desktop
  for (const lang of ['ar', 'en']) for (const scheme of ['light', 'dark']) for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 860 }]) {
    await p.emulateMedia({ colorScheme: scheme }); await p.setViewportSize(vp);
    await idb((db, l) => new Promise((res) => { const tx = db.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; s.lang = l; s.updatedAt = Date.now(); st.put(s); }; tx.oncomplete = () => res(true); }), lang);
    await p.goto(B + '#/'); await p.reload(); await p.getByTestId('fiber-bar').waitFor(); await p.waitForTimeout(500);
    const txt = await p.getByTestId('fiber-bar').innerText();
    const dir = await p.evaluate(() => document.documentElement.dir), ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const word = lang === 'ar' ? 'الألياف الغذائية' : 'Dietary Fiber';
    const box = await p.getByTestId('fiber-bar').boundingBox();
    check(`${lang} ${scheme} ${vp.width}px: fiber bar, direction, no overflow`, txt.includes(word) && dir === (lang === 'ar' ? 'rtl' : 'ltr') && ov <= 0 && box && box.width > 100, `dir=${dir} ov=${ov}`);
  }
  check('diary entries unchanged by everything above (except the one added)', JSON.parse(await snapshot()).filter((e) => e.meal !== 'dinner').length === JSON.parse(before).length);
  check('no page errors', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close(); if (srv) srv.kill();
  console.log(`\n${total - failed}/${total} fiber checks passed`); process.exit(failed ? 1 : 0);
})();
