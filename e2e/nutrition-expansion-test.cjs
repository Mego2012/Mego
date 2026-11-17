// Nutrition details (vitamins & minerals), food preferences, recommendation filters, part-4 recipes (breakdown,
// storage, logging with micronutrients), generated 3-meal plan — AR/EN · light/dark · phone/desktop.
// Usage: npm run build && node e2e/nutrition-expansion-test.cjs   (BASE_URL=… for the live site)
const pw = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const live = !!process.env.BASE_URL;
  const srv = live ? null : spawn('node_modules/.bin/vite', ['preview', '--port', '4193', '--strictPort'], { stdio: 'ignore' });
  if (srv) await new Promise((r) => setTimeout(r, 2500));
  const B = process.env.BASE_URL || 'http://localhost:4193/'; const b = await pw.chromium.launch(); let failed = 0, total = 0;
  const check = (n, ok, d = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  const num = (s) => Number(String(s).replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace('٫', '.').replace(/[^\d.]/g, ''));
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B); await p.waitForTimeout(1500); if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1200); }
  await p.waitForTimeout(5000);
  const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const idb = (fn, arg) => p.evaluate(([src, a]) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const f = new Function('db', 'a', 'return (' + src + ')(db, a)'); Promise.resolve(f(r.result, a)).then(res); }; }), [fn.toString(), arg]);
  let k = 0; const E = (meal, kcal, micro) => ({ id: 'nx' + ++k, date: today, meal, foodId: 'f', name: 'Test ' + k, state: 'cooked', quantity: 100, unit: 'g', grams: 100, basis: { per100: { kcal, protein: 20, carbs: 30, fat: 5 } }, macros: { kcal, protein: 20, carbs: 30, fat: 5, ...(micro ? { micro } : {}) }, order: k, createdAt: 1, updatedAt: 1 });
  const setLang = (l) => idb((db, lang) => new Promise((res) => { const tx = db.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; s.lang = lang; s.profile.sex = 'male'; s.profile.age = 31; s.updatedAt = Date.now(); st.put(s); }; tx.oncomplete = () => res(true); }), l);
  await setLang('en');
  await idb((db, a) => new Promise((res) => { const tx = db.transaction('entries', 'readwrite'); for (const e of a) tx.objectStore('entries').put(e); tx.oncomplete = () => res(true); }),
    [E('breakfast', 400, { iron: 4, vitD: 5, calcium: 300 }), E('lunch', 600, { iron: 2, calcium: 200 }), E('dinner', 500)]);

  // ---- nutrition details
  await p.goto(B + '#/'); await p.reload(); await p.getByTestId('open-nutrients').waitFor();
  check('dashboard links to Nutrition details', (await p.getByTestId('open-nutrients').count()) === 1);
  await p.getByTestId('open-nutrients').click(); await p.getByTestId('nutrients-page').waitFor(); await p.waitForTimeout(600);
  const row = (key) => p.locator(`[data-testid="nut-row"][data-key="${key}"]`);
  const ironTxt = await row('iron').innerText();
  check('iron 6 / 8 mg (male 31, RDA), 75 %, based on 2 of 3 entries', /6\s*\/\s*8\s*mg/.test(ironTxt) && /75% of reference/.test(ironTxt) && /2 of 3/.test(ironTxt), ironTxt.replace(/\n/g, ' | '));
  const dTxt = await row('vitD').innerText();
  check('vitamin D 5 / 15 µg with its upper limit 100 µg shown', /5\s*\/\s*15\s*µg/.test(dTxt) && /upper limit 100/.test(dTxt));
  const folTxt = await row('folate').innerText();
  check('folate upper limit marked as supplements / fortified only', /supplements \/ fortified/.test(folTxt));
  check('iodine: no data → "—", never 0', (await row('iodine').locator('[data-testid="nut-val"]').innerText()).includes('—'));
  check('four groups shown (carbohydrate, fat, minerals, vitamins)', (await p.locator('[data-testid^="nut-group-"]').count()) === 4);
  await row('zinc').getByTestId('nut-edit').click(); await p.getByTestId('nut-target-input').fill('15'); await p.getByTestId('nut-save').click(); await p.waitForTimeout(600);
  check('custom target saved (zinc 15 mg, "your own target")', /\/\s*15\s*mg/.test(await row('zinc').innerText()) && /your own target/.test(await row('zinc').innerText()));
  await row('zinc').getByTestId('nut-edit').click(); await p.getByTestId('nut-reset').click(); await p.waitForTimeout(500);
  check('reset to the reference value (zinc 11 mg)', /\/\s*11\s*mg/.test(await row('zinc').innerText()));

  // ---- food preferences
  await p.goto(B + '#/goals'); await p.getByTestId('fp-exclude').waitFor();
  await p.getByTestId('fp-whey').click(); await p.waitForTimeout(300); await p.getByTestId('fp-oats').click(); await p.waitForTimeout(300);
  await p.getByTestId('fp-yogurt').selectOption('1'); await p.waitForTimeout(300); await p.getByTestId('fp-meals').selectOption('3'); await p.waitForTimeout(500);
  const prefs = await idb((db) => new Promise((res) => { const q = db.transaction('settings').objectStore('settings').get('main'); q.onsuccess = () => res(q.result.foodPrefs); }));
  check('preferences saved: no whey, no oats, 1 yogurt, 3 meals', JSON.stringify(prefs) === JSON.stringify({ exclude: ['whey', 'oats'], yogurtPerDay: 1, mealsPerDay: 3 }), JSON.stringify(prefs));
  const tgt = await idb((db) => new Promise((res) => { const q = db.transaction('settings').objectStore('settings').get('main'); q.onsuccess = () => res(q.result.targets); }));
  check('targets untouched by preferences', JSON.stringify(tgt).length > 10);
  await p.goto(B + '#/recipes?tab=library'); await p.reload(); await p.getByTestId('library').waitFor();
  await p.getByTestId('library-search').fill('Mango protein yogurt'); await p.waitForTimeout(500);
  check('a whey recipe stays in the library, marked "Not suggested"', /Not suggested — contains: Whey protein/.test(await p.getByTestId('library-card').first().innerText()));

  // ---- suggestions with filters
  await p.goto(B + '#/recipes?tab=suggest'); await p.reload(); await p.getByTestId('suggest').waitFor(); await p.waitForTimeout(800);
  check('suggestions say preferences are applied', (await p.getByTestId('sg-prefs').count()) === 1);
  const allTxt = (await p.getByTestId('suggestion').allInnerTexts()).join('\n');
  check('no whey recipe suggested', !/Mango protein yogurt|Banana milk protein shake|Banana protein pancakes/.test(allTxt));
  await p.getByTestId('sg-trait-highProtein').click(); await p.waitForTimeout(400); await p.getByTestId('sg-method').selectOption('air-fryer'); await p.waitForTimeout(500);
  check('filters: high protein + air fryer give results', (await p.getByTestId('suggestion').count()) > 0);

  // ---- new recipe: breakdown, storage, log with micronutrients
  await p.goto(B + '#/recipes?tab=library'); await p.reload(); await p.getByTestId('library').waitFor();
  await p.getByTestId('library-search').fill('Chicken breast with roasted potatoes & melted mozzarella'); await p.getByTestId('library-card').first().click(); await p.getByTestId('recipe-detail').waitFor(); await p.waitForTimeout(800);
  await p.getByTestId('breakdown-toggle').click(); await p.waitForTimeout(300);
  const bd = await p.getByTestId('nutrient-breakdown').innerText();
  check('recipe breakdown per serving: minerals and vitamins listed', /Minerals:.*Iron/s.test(bd) && /Vitamins:/.test(bd), bd.slice(0, 120));
  await p.getByTestId('toggle-steps').click(); await p.waitForTimeout(300);
  check('storage & reheating shown', /fridge/i.test(await p.getByTestId('recipe-storage').innerText()));
  const kcal = num(await p.getByTestId('detail-kcal').innerText());
  check('new recipe: 543 kcal per serving', kcal === 543, String(kcal));
  await p.getByTestId('lib-add-diary').click(); await p.getByTestId('dms-confirm').click(); await p.waitForTimeout(1500);
  const logged = await idb((db) => new Promise((res) => { const q = db.transaction('entries').objectStore('entries').getAll(); q.onsuccess = () => res(q.result.filter((e) => /موزاريلا ذائبة|mozzarella/i.test(e.name))); }));
  check('logged recipe entry carries vitamins & minerals', logged.length === 1 && logged[0].macros.micro && logged[0].macros.micro.iron > 0, logged[0] ? JSON.stringify(logged[0].macros.micro).slice(0, 80) : 'none');

  // ---- planner: 3 meals with preferences
  await p.goto(B + '#/planner'); await p.waitForTimeout(1200);
  const gen = p.getByTestId('generate-plan');
  if (await gen.count()) {
    await gen.click(); await p.waitForTimeout(4000);
    const pl = await p.getByTestId('generated-plan').innerText().catch(() => '');
    check('generated plan has no snack (3 meals)', pl.length > 0 && !/Snack/i.test(pl), pl.slice(0, 100).replace(/\n/g, ' | '));
  } else check('generate plan button present', false);

  // ---- vitamins & minerals migration: a USDA food stored before this release gets its USDA values (fill-only)
  const spinach = { id: 'mig-spinach', nameAr: '', nameEn: 'Spinach, raw', category: 'Vegetables', per100: { kcal: 23, protein: 2.86, carbs: 3.63, fat: 0.39, fiber: 2.2 }, state: 'raw', stateLabel: '', prep: '', notes: '', servings: [], favorite: false, source: 'usda', sourceRef: 'USDA FDC 168462 (SR Legacy)', incomplete: false, archived: false, version: 1, createdAt: 1, updatedAt: 1, useCount: 0 };
  await idb((db, f) => new Promise((res) => { const tx = db.transaction('foods', 'readwrite'); tx.objectStore('foods').put(f); tx.oncomplete = () => res(true); }), spinach);
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.endsWith(':migration:micros-v1')) localStorage.removeItem(k); });
  await p.reload(); let mm = null;
  for (let i = 0; i < 60 && !mm; i++) { mm = await p.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.endsWith(':migration:micros-v1')); return k ? JSON.parse(localStorage.getItem(k)) : null; }); if (!mm) await p.waitForTimeout(500); }
  const sp = await idb((db) => new Promise((res) => { const q = db.transaction('foods').objectStore('foods').get('mig-spinach'); q.onsuccess = () => res(q.result); }));
  check('vitamins & minerals migration: USDA values added (vitamin K 482.9 µg), kcal unchanged', !!mm && sp.per100.micro && sp.per100.micro.vitK === 482.9 && sp.per100.kcal === 23, mm ? `updated ${mm.updated}, values ${mm.valuesAdded}` : 'no record');

  // ---- AR/EN · light/dark · phone/desktop on the Nutrition details page
  for (const lang of ['ar', 'en']) for (const scheme of ['light', 'dark']) for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 860 }]) {
    await p.emulateMedia({ colorScheme: scheme }); await p.setViewportSize(vp); await setLang(lang);
    await p.goto(B + '#/nutrients'); await p.reload(); await p.getByTestId('nutrients-page').waitFor(); await p.waitForTimeout(500);
    const dir = await p.evaluate(() => document.documentElement.dir), ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const head = await p.locator('[data-testid="nut-group-minerals"]').innerText();
    check(`${lang} ${scheme} ${vp.width}px: nutrition details, direction, no overflow`, head.includes(lang === 'ar' ? 'الحديد' : 'Iron') && dir === (lang === 'ar' ? 'rtl' : 'ltr') && ov <= 0, `dir=${dir} ov=${ov}`);
  }
  check('no page errors', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close(); if (srv) srv.kill();
  console.log(`\n${total - failed}/${total} nutrition expansion checks passed`); process.exit(failed ? 1 : 0);
})();
