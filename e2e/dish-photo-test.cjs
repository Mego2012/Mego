// Dish photos, end to end (guest, local build): licensed example photos load, alt text and the "example photo" note are
// localized (AR + EN), credits list every photo, recipes without a photo keep the ingredient mosaic, a broken/missing
// photo falls back to the mosaic, no overflow, no page errors. Usage: npx vite build && node e2e/dish-photo-test.cjs
const pw = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs');
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4193', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const B = process.env.BASE_URL || 'http://localhost:4193/'; const b = await pw.chromium.launch(); let failed = 0, total = 0;
  const check = (n, ok, d = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  const manifest = JSON.parse(fs.readFileSync('public/dish-img/manifest.json', 'utf8')); const n = Object.keys(manifest).length;
  const open = async (vp, lang, block) => {
    // page.route cannot see requests answered by the service worker, so failure scenarios run without it
    const ctx = await b.newContext({ viewport: vp, ...(block ? { serviceWorkers: 'block' } : {}) }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    if (block) await p.route(block, (r) => r.fulfill({ status: 404, body: '' }));
    await p.goto(B); await p.waitForTimeout(1200); if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1000); }
    await p.evaluate((l) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const tx = r.result.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; s.lang = l; s.updatedAt = Date.now(); st.put(s); }; tx.oncomplete = res; }; }), lang);
    await p.goto(B + '#/recipes?tab=library'); await p.reload(); await p.getByTestId('library').waitFor();
    await p.waitForFunction(() => document.querySelectorAll('[data-testid="library-card"]').length > 50); await p.waitForTimeout(1500);
    return { ctx, p, errs };
  };
  for (const [lang, vp] of [['ar', { width: 390, height: 844 }], ['en', { width: 1280, height: 900 }]]) {
    const { ctx, p, errs } = await open(vp, lang);
    await p.getByTestId('library-search').fill(lang === 'ar' ? 'شكشوكة' : 'shakshuka'); await p.waitForTimeout(600);
    const card = p.getByTestId('library-card').first(); const img = card.locator('[data-testid="dish-photo"] img');
    await img.waitFor(); await p.waitForFunction(() => { const i = document.querySelector('[data-testid="dish-photo"] img'); return i && i.complete && i.naturalWidth > 0; });
    const alt = await img.getAttribute('alt');
    check(`${lang}: shakshuka card shows its dish photo (loaded, ${await img.evaluate((i) => i.naturalWidth)} px)`, true);
    check(`${lang}: alt text is localized and names the dish`, lang === 'ar' ? /^صورة توضيحية لطبق .*شكشوكة/.test(alt) : /^Example photo of .*shakshuka/i.test(alt), alt);
    await card.click(); await p.getByTestId('recipe-detail').waitFor(); await p.waitForTimeout(500);
    const note = await p.getByTestId('dish-photo-note').innerText();
    check(`${lang}: recipe detail says it is an example photo, credits author + licence`, (lang === 'ar' ? /صورة توضيحية لهذا النوع/.test(note) : /Example photo of this kind of dish, not of this exact recipe/.test(note)) && /CC/.test(note), note.slice(0, 90));
    check(`${lang}: credit links to the Wikimedia Commons source page`, /^https:\/\/commons\.wikimedia\.org\//.test(await p.getByTestId('dish-photo-note').locator('a').getAttribute('href')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await p.getByTestId('library-search').fill(''); await p.waitForTimeout(800);
    const counts = await p.evaluate(() => ({ cards: document.querySelectorAll('[data-testid="library-card"]').length, dish: document.querySelectorAll('[data-testid="library-card"] [data-testid="dish-photo"]').length, mosaic: document.querySelectorAll('[data-testid="library-card"] .food-thumb.mosaic').length }));
    check(`${lang}: ${n} recipes use a dish photo, all others keep the ingredient mosaic`, counts.dish === n && counts.dish + counts.mosaic === counts.cards, JSON.stringify(counts));
    // every shipped photo actually loads (scroll through the list)
    for (let y = 0; y < 60; y++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(60); }
    await p.waitForTimeout(1500);
    const broken = await p.evaluate(() => [...document.querySelectorAll('[data-testid="dish-photo"] img')].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.src));
    check(`${lang}: no broken dish photo`, broken.length === 0, broken.slice(0, 3).join(' '));
    check(`${lang}: no horizontal overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await p.goto(B + '#/settings'); await p.getByTestId('photo-credits-toggle').click(); await p.getByTestId('dish-credits').waitFor();
    check(`${lang}: Settings → Photo credits lists all ${n} dish photos`, (await p.getByTestId('dish-credits').locator('li').count()) === n);
    const links = await p.evaluate(() => [...document.querySelectorAll('[data-testid="about-legal"] a')].map((a) => { const r = a.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, h: r.height }; }));
    const apart = links.length === 2 && (links[0].t !== links[1].t || Math.max(links[0].l, links[1].l) - Math.min(links[0].r, links[1].r) >= 12);
    check(`${lang}: About → privacy and terms links are separate, finger-sized targets`, apart && links.every((x) => x.h >= 44), JSON.stringify(links.map((x) => Math.round(x.h))));
    check(`${lang}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  // offline: once seen, dish photos come from the device
  { const { ctx, p } = await open({ width: 390, height: 844 }, 'en');
    await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
    await p.getByTestId('library-search').fill('shakshuka'); await p.waitForTimeout(2000);
    await ctx.setOffline(true); await p.reload(); await p.getByTestId('library').waitFor(); await p.getByTestId('library-search').fill('shakshuka'); await p.waitForTimeout(2000);
    const ok = await p.evaluate(() => { const i = document.querySelector('[data-testid="library-card"] [data-testid="dish-photo"] img'); return !!(i && i.complete && i.naturalWidth > 0); });
    check('offline: a dish photo seen before still loads without network', ok);
    await ctx.close(); }
  // fallback: dish photo files unavailable → mosaic, no broken image
  { const { ctx, p } = await open({ width: 390, height: 844 }, 'en', '**/dish-img/*.webp');
    await p.getByTestId('library-search').fill('shakshuka'); await p.waitForTimeout(1500);
    const c = p.getByTestId('library-card').first();
    check('fallback: a photo that fails to load is replaced by the ingredient mosaic', (await c.locator('.food-thumb.mosaic').count()) === 1 && (await c.locator('[data-testid="dish-photo"]').count()) === 0);
    await ctx.close(); }
  { const { ctx, p } = await open({ width: 390, height: 844 }, 'en', '**/dish-img/manifest.json');
    const d = await p.evaluate(() => document.querySelectorAll('[data-testid="dish-photo"]').length);
    check('fallback: without the photo list every recipe shows its mosaic', d === 0);
    await ctx.close(); }
  console.log(`\n${total - failed}/${total} checks passed`); await b.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
