// Full-app crawl (guest): every route and tab in Arabic and English, phone and desktop sizes.
// Records page errors, console errors, failed requests, missing translation keys shown on screen, horizontal
// overflow and the load time of the first screen. Usage: npx vite build && node e2e/audit-crawl.cjs
const pw = require('playwright'); const { spawn } = require('child_process');
const ROUTES = ['/', '/diary', '/foods', '/recipes', '/recipes?tab=library', '/planner', '/progress', '/reports/week', '/reports/month', '/habits', '/goals', '/cardio',
  '/workouts', '/workouts?tab=today', '/workouts?tab=program', '/workouts?tab=library', '/workouts?tab=progress', '/workouts?tab=coach', '/exercise/squat',
  '/coach', '/coach?tab=advisor', '/coach?tab=week', '/coach?tab=month', '/coach?tab=foods', '/coach?tab=learn', '/settings', '/privacy', '/terms', '/admin'];
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4198', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const b = await pw.chromium.launch(); let problems = 0, pages = 0;
  for (const [lang, vp] of [['ar', { width: 390, height: 844 }], ['en', { width: 390, height: 844 }], ['ar', { width: 1366, height: 820 }], ['en', { width: 1366, height: 820 }]]) {
    const ctx = await b.newContext({ viewport: vp, locale: lang }); const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
    p.on('requestfailed', (r) => { const u = r.url(); if (!/fonts\.g|google-analytics|firestore|identitytoolkit/.test(u)) errs.push('requestfailed ' + u.slice(0, 120)); });
    const t0 = Date.now(); await p.goto('http://localhost:4198/'); await p.waitForLoadState('networkidle'); const load = Date.now() - t0;
    if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1200); }
    // switch language through the app setting
    await p.goto('http://localhost:4198/#/settings'); await p.waitForTimeout(600);
    await p.evaluate(async (l) => { const r = indexedDB.open('mego-nutrition'); await new Promise((res) => { r.onsuccess = () => { const tx = r.result.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; s.lang = l; st.put(s); }; tx.oncomplete = res; }; }); }, lang);
    for (const r of ROUTES) {
      errs.length = 0;
      await p.goto('http://localhost:4198/#' + r); await p.reload(); await p.waitForTimeout(900); pages++;
      const info = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, text: document.body.innerText, dir: document.documentElement.dir }));
      const rawKeys = (info.text.match(/\b[a-z]{2,}_[a-zA-Z_]{3,}\b/g) || []).filter((k) => !/^(e_|mego_)/.test(k));
      const issues = [...errs];
      if (info.overflow > 2) issues.push('horizontal overflow ' + info.overflow + 'px');
      if (rawKeys.length) issues.push('untranslated keys: ' + [...new Set(rawKeys)].slice(0, 5).join(', '));
      if ((lang === 'ar') !== (info.dir === 'rtl')) issues.push('wrong direction ' + info.dir);
      if (issues.length) { problems++; console.log(`ISSUE [${lang} ${vp.width}] ${r}: ${issues.join(' | ')}`); }
    }
    console.log(`[${lang} ${vp.width}px] first load ${load} ms`);
    await ctx.close();
  }
  console.log(`${pages} page views, ${problems} with issues`);
  await b.close(); srv.kill(); process.exit(0);
})();
