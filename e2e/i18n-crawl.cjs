// Localization audit: every route and the main sheets, Arabic and English, phone and desktop, with a realistic month
// of data (demo build). On English screens any Arabic text is reported; on Arabic screens any Latin word that is not
// an allowed technical name is reported. Also checks the page direction and horizontal overflow.
// Usage: VITE_DEMO=1 npx vite build --outDir dist-demo && node e2e/i18n-crawl.cjs [--strict]
const pw = require('playwright'); const { spawn } = require('child_process');
const ROUTES = ['/', '/diary', '/foods', '/recipes?tab=library', '/recipes?tab=suggest', '/recipes?tab=cook', '/recipes?tab=recipes', '/recipes?tab=meals', '/planner', '/progress',
  '/reports/week', '/reports/month', '/habits', '/goals', '/cardio', '/workouts?tab=today', '/workouts?tab=program', '/workouts?tab=library', '/workouts?tab=progress',
  '/workouts?tab=coach', '/exercise/squat', '/exercise/bench-press', '/coach', '/coach?tab=advisor', '/coach?tab=week', '/coach?tab=month', '/coach?tab=foods', '/coach?tab=learn', '/settings', '/privacy', '/terms'];
// technical names that stay in Latin letters in Arabic (brands, standards, abbreviations)
const ALLOW = /^(MEGO|Mego|USDA|FoodData|Central|SR|Legacy|FNDDS|Open|Food|Facts|BMR|TDEE|MET|METs|RIR|RPE|e1RM|1RM|BMI|ACSM|ISSN|AI|Gemini|Google|Drive|Firebase|Apps|Script|Excel|CSV|JSON|PDF|PWA|Android|iOS|iPhone|Safari|Chrome|English|kcal|DHA|EPA|ALA|PDCAAS|DIAAS|WHO|EFSA|NIH|Mifflin|St|Jeor|Katch|McArdle|Atwater|GitHub|Pages|OK|ID|URL|QR|GPS|HIIT|LISS|AMRAP|EMOM|IU|µg|mg|RAE|Spark|Play|Store|App|Wi|Fi|http|https|www|com|org|io|github|mego2012|NFS|NS|FDC|Cloud|Firestore|HTTPS|IIFYM|Studio|Create|API|key|Hub|Nutrition|Database|License|gs|appsscript|installMego|script|macros|exec|flash|gemini|Sara|Wikimedia|Commons|Sheet|GitHub|IP|Fonts)$/;
// user data and identifiers are not translated: the demo user's name, Drive IDs, URLs and file names
(async () => {
  const strict = process.argv.includes('--strict');
  const srv = spawn('node_modules/.bin/vite', ['preview', '--outDir', 'dist-demo', '--port', '4199', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const B = 'http://localhost:4199/';
  const b = await pw.chromium.launch(); let pages = 0; const found = new Map(); const layout = [];
  for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 820 }]) {
    const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(B); await p.waitForTimeout(1500);
    if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1200); }
    console.log('seed:', await p.evaluate(() => window.__megoSeedDemo()));
    for (const lang of ['ar', 'en']) {
      await p.evaluate(async (l) => { const r = indexedDB.open('mego-nutrition'); await new Promise((res) => { r.onsuccess = () => { const tx = r.result.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; s.lang = l; st.put(s); }; tx.oncomplete = res; }; }); }, lang);
      const scan = async (where) => {
        pages++;
        const info = await p.evaluate(() => {
          const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (w.nextNode()) { const n = w.currentNode; const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; if (!el || el.closest('script,style,textarea,option[value=""]+option[disabled],[aria-hidden="true"],[data-i18n-skip]')) continue; const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue; out.push(t); }
          for (const el of document.querySelectorAll('input[placeholder],textarea[placeholder]')) out.push(el.getAttribute('placeholder'));
          for (const el of document.querySelectorAll('[aria-label]')) out.push(el.getAttribute('aria-label'));
          return { texts: out, dir: document.documentElement.dir, ov: document.documentElement.scrollWidth - window.innerWidth };
        });
        if ((lang === 'ar') !== (info.dir === 'rtl')) layout.push(`[${lang} ${vp.width}] ${where}: dir=${info.dir}`);
        if (info.ov > 2) layout.push(`[${lang} ${vp.width}] ${where}: overflow ${info.ov}px`);
        for (const t of info.texts) {
          let bad = null;
          if (lang === 'en' && /[؀-ۿ]/.test(t) && t !== 'العربية' && t !== 'ع' && !/^العربية — /.test(t)) bad = t; // the language switch names the other language on purpose
          if (lang === 'ar') { const words = ((/^English — /.test(t) || t === 'EN' ? '' : t).replace(/https?:\/\/\S+|[\w-]{20,}|\S+\.(json|gs|com)\b|gemini-[\w.-]+/g, '').match(/[A-Za-z][A-Za-z'’-]{2,}/g) || []).filter((x) => !ALLOW.test(x)); if (words.length) bad = t; }
          if (bad) { const k = `${lang}|${bad.slice(0, 120)}`; if (!found.has(k)) found.set(k, new Set()); found.get(k).add(where); }
        }
      };
      for (const r of ROUTES) { await p.goto(B + '#' + r); if (r === ROUTES[0]) await p.reload(); await p.waitForTimeout(1100); await scan(r); }
      // sheets and generated content
      const tryDo = async (name, fn) => { try { await fn(); await p.waitForTimeout(700); await scan(name); } catch (e) { layout.push(`[${lang} ${vp.width}] ${name}: could not open (${e.message.split('\n')[0]})`); } for (let i = 0; i < 3; i++) await p.keyboard.press('Escape'); await p.waitForTimeout(200); };
      await tryDo('recipe detail', async () => { await p.goto(B + '#/recipes?tab=library'); await p.waitForTimeout(1500); await p.getByTestId('library-search').fill(lang === 'ar' ? 'دجاج بالزبادي' : 'Yogurt, garlic & lemon'); await p.getByTestId('library-card').first().click(); await p.getByTestId('view-instructions').click(); await p.getByTestId('swap-btn').first().click(); });
      await tryDo('cooking mode', async () => { await p.goto(B + '#/recipes?tab=library'); await p.waitForTimeout(1500); await p.getByTestId('library-card').first().click(); await p.getByTestId('start-cooking').click(); await p.getByTestId('cook-next').click(); });
      await tryDo('cooking mode ready list', async () => { await p.goto(B + '#/recipes?tab=library'); await p.waitForTimeout(1500); await p.getByTestId('library-search').fill('kofta'); await p.getByTestId('library-card').first().click(); await p.getByTestId('start-cooking').click(); });
      await tryDo('library filters', async () => { await p.goto(B + '#/recipes?tab=library'); await p.waitForTimeout(1500); await p.getByTestId('lib-filters-toggle').click(); });
      await tryDo('add food search', async () => { await p.goto(B + '#/diary'); await p.waitForTimeout(800); await p.getByTestId('add-lunch').click(); await p.getByTestId('food-search').fill(lang === 'ar' ? 'دجاج' : 'chicken'); await p.waitForTimeout(1200); });
      await tryDo('diary entry', async () => { await p.goto(B + '#/diary'); await p.waitForTimeout(800); await p.locator('[data-testid="entry"]').first().click(); });
      await tryDo('food detail', async () => { await p.goto(B + '#/foods'); await p.waitForTimeout(800); await p.locator('[data-testid="food-row"]').first().click(); });
      await tryDo('shopping list', async () => { await p.goto(B + '#/planner'); await p.waitForTimeout(900); await p.getByTestId('open-shopping').click(); });
      await tryDo('plan generator', async () => { await p.goto(B + '#/planner'); await p.waitForTimeout(900); await p.getByTestId('generate-plan').click(); await p.waitForTimeout(3000); });
      await tryDo('cardio form', async () => { await p.goto(B + '#/cardio'); await p.waitForTimeout(900); await p.getByTestId('cardio-add').click(); });
      await tryDo('workout start', async () => { await p.goto(B + '#/workouts?tab=today'); await p.waitForTimeout(900); if (await p.getByTestId('start-workout').count()) await p.getByTestId('start-workout').click(); });
    }
    // header language switch: whole app flips, survives a reload, records unchanged
    const recs = () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const q = r.result.transaction('entries').objectStore('entries').getAll(); q.onsuccess = () => res(JSON.stringify(q.result)); }; }));
    const before = await recs(); await p.goto(B + '#/diary'); await p.waitForTimeout(800);
    const d0 = await p.evaluate(() => document.documentElement.dir); await p.getByTestId('lang-switch').click(); await p.waitForTimeout(600);
    const d1 = await p.evaluate(() => document.documentElement.dir); await p.reload(); await p.waitForTimeout(1200);
    const d2 = await p.evaluate(() => document.documentElement.dir); const txt = await p.evaluate(() => document.body.innerText);
    const okSwitch = d0 !== d1 && d1 === d2 && (d1 === 'rtl' ? /اليوميات|الفطور/.test(txt) : /Breakfast/.test(txt)) && (await recs()) === before;
    if (!okSwitch) layout.push(`[${vp.width}] language switch failed: ${d0}→${d1}→${d2}`); else console.log(`language switch ${vp.width}px: ${d0}→${d1}, kept after reload, entries unchanged`);
    if (errs.length) layout.push(`[${vp.width}] page errors: ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  const rows = [...found].map(([k, w]) => `${k.split('|')[0].toUpperCase()}  ${k.split('|').slice(1).join('|')}   @ ${[...w].slice(0, 3).join(', ')}`).sort();
  rows.forEach((r) => console.log(r));
  layout.forEach((l) => console.log('LAYOUT ' + l));
  console.log(`${pages} screens scanned · ${rows.length} wrong-language texts · ${layout.length} layout/direction notes`);
  await b.close(); srv.kill(); process.exit(strict && (rows.length || layout.length) ? 1 : 0);
})();
