// Cardio goals, end to end (guest, local build): suggested defaults, set and edit goals, preferred days, log from the
// dashboard (preferred activity pre-filled), daily/weekly progress, remaining minutes and sessions, duplicate guard,
// edit and delete with recalculation, weekly schedule (planned / done / rest), reports, calorie target unchanged,
// offline logging, Arabic phone + English desktop (dark), no overflow, no page errors.
// Usage: npx vite build && node e2e/cardio-goals-test.cjs
const pw = require('playwright'); const { spawn } = require('child_process');
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4196', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const B = process.env.BASE_URL || 'http://localhost:4196/'; const b = await pw.chromium.launch(); let failed = 0, total = 0;
  const check = (n, ok, d = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  for (const [lang, vp, theme] of [['ar', { width: 390, height: 844 }, 'light'], ['en', { width: 1366, height: 900 }, 'dark']]) {
    const ctx = await b.newContext({ viewport: vp, colorScheme: theme }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const L = `${lang} ${vp.width}px`;
    await p.goto(B); await p.waitForTimeout(1500); if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1200); }
    await p.evaluate(([l, th]) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const tx = r.result.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; s.lang = l; s.theme = th; s.weekStartsOn = 6; delete s.fitness; delete s.cardioGoals; s.updatedAt = Date.now(); st.put(s); }; tx.oncomplete = res; }; }), [lang, theme]);
    await p.reload(); await p.waitForTimeout(800);
    const attr = async (id, a) => Number(await p.getByTestId(id).first().getAttribute(a));
    const counts = () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const tx = r.result.transaction(['entries', 'kv'], 'readonly'); const a = tx.objectStore('entries').count(); const k = tx.objectStore('kv').getAll(); tx.oncomplete = () => res({ entries: a.result, cardio: k.result.filter((x) => String(x.key).startsWith('cardio:')).length }); }; }));
    const todayWd = await p.evaluate(() => new Date().getDay());
    const kcalTarget = async () => { await p.goto(B + '#/'); await p.getByTestId('kcal-target').waitFor(); return (await p.getByTestId('kcal-target').innerText()).replace(/[^\d٠-٩]/g, ''); };
    const target0 = await kcalTarget();
    const before = await counts();

    // 1. suggested defaults
    await p.goto(B + '#/cardio?tab=goals'); await p.getByTestId('cg-dashboard').waitFor();
    check(`${L}: Cardio opens on the Goals dashboard; direction ${lang === 'ar' ? 'rtl' : 'ltr'}`, (await p.evaluate(() => document.documentElement.dir)) === (lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${L}: suggested starting goals 20 min/day, 120 min/week, 6 sessions, labelled as suggestions`,
      (await attr('cg-day', 'data-target')) === 20 && (await attr('cg-week', 'data-target')) === 120 && (await attr('cg-sessions', 'data-target')) === 6 && (await p.getByTestId('cg-suggested').count()) === 1);

    // 2. set goals: 30 / 150 / 5 sessions / 8 km, incline walking, days = today + next day of the week
    await p.getByTestId('cg-edit').first().click(); await p.getByTestId('cg-editor').waitFor();
    await p.getByTestId('cg-daily').fill('30'); await p.getByTestId('cg-weekly').fill('150'); await p.getByTestId('cg-sessions-in').fill('5'); await p.getByTestId('cg-km').fill('8');
    await p.getByTestId('cg-preferred').selectOption('incline_walk');
    const plan = [todayWd, (todayWd + 1) % 7];
    for (const wd of plan) await p.getByTestId('cg-day-' + wd).click();
    await p.getByTestId('cg-daily').fill('-4');
    check(`${L}: invalid value blocks saving and is explained`, (await p.getByTestId('cg-save').isDisabled()) && (await p.getByTestId('cg-errors').count()) === 1);
    await p.getByTestId('cg-daily').fill('30');
    await p.getByTestId('cg-save').click(); await p.getByTestId('cg-editor').waitFor({ state: 'detached' });
    await p.reload(); await p.getByTestId('cg-dashboard').waitFor();
    check(`${L}: goals saved and kept after reload (30 / 150 / 5 / 8 km)`, (await attr('cg-day', 'data-target')) === 30 && (await attr('cg-week', 'data-target')) === 150 && (await attr('cg-sessions', 'data-target')) === 5 && (await attr('cg-distance', 'data-target')) === 8 && (await p.getByTestId('cg-suggested').count()) === 0);

    // 3. log from the dashboard: preferred activity pre-filled (incline walking → treadmill with incline)
    await p.getByTestId('cg-log').click(); await p.getByTestId('cardio-form').waitFor();
    check(`${L}: the log form opens with the preferred activity (treadmill, incline field shown)`, (await p.getByTestId('cardio-activity').inputValue()) === 'treadmill_walk' && (await p.getByTestId('cardio-incline').count()) === 1);
    await p.getByTestId('cardio-duration').fill('12'); await p.getByTestId('cardio-speed').fill('4'); await p.getByTestId('cardio-incline').fill('10'); await p.getByTestId('cardio-distance').fill('0.8');
    await p.getByTestId('cardio-save').dblclick(); // a double tap must not create two sessions
    await p.getByTestId('cardio-form').waitFor({ state: 'detached' }); await p.waitForTimeout(600);
    const day1 = { done: await attr('cg-day', 'data-done'), rem: await attr('cg-day', 'data-remaining'), pct: await attr('cg-day', 'data-pct') };
    check(`${L}: today 12 of 30 min → 18 remaining, 40 %`, day1.done === 12 && day1.rem === 18 && day1.pct === 40, JSON.stringify(day1));
    check(`${L}: week 12 of 150 min (8 %), 1 of 5 sessions, 0.8 of 8 km; double tap counted once`,
      (await attr('cg-week', 'data-done')) === 12 && (await attr('cg-week', 'data-pct')) === 8 && (await attr('cg-sessions', 'data-done')) === 1 && (await attr('cg-distance', 'data-done')) === 0.8 && (await counts()).cardio === before.cardio + 1);
    check(`${L}: sessions left this week = 4`, (await p.getByTestId('cg-sessions-left').innerText()).replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, (c) => c.charCodeAt(0) - 0x660) === '4');
    const st = async (date) => p.locator(`[data-testid="cg-schedule-day"][data-date="${date}"]`).getAttribute('data-status');
    const todayIso = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    const sched = await p.$$eval('[data-testid="cg-schedule-day"]', (els) => els.map((e) => ({ date: e.dataset.date, s: e.dataset.status })));
    const others = sched.filter((x) => x.date !== todayIso);
    check(`${L}: schedule — today done; unplanned days are rest (never missed); 7 days`, sched.length === 7 && (await st(todayIso)) === 'done' && others.every((x) => ['rest', 'planned'].includes(x.s)), sched.map((x) => x.s).join(','));

    // 4. a second session, then edit and delete in Log & history → everything recalculates
    await p.getByTestId('cg-log').click(); await p.getByTestId('cardio-form').waitFor();
    await p.getByTestId('cardio-activity').selectOption('running'); await p.getByTestId('cardio-duration').fill('20'); await p.getByTestId('cardio-distance').fill('3');
    await p.getByTestId('cardio-save').click(); await p.getByTestId('cardio-form').waitFor({ state: 'detached' }); await p.waitForTimeout(500);
    check(`${L}: second session → today 32 min (goal met, 0 remaining), 2 sessions, 3.8 km`, (await attr('cg-day', 'data-done')) === 32 && (await attr('cg-day', 'data-remaining')) === 0 && (await attr('cg-sessions', 'data-done')) === 2 && (await attr('cg-distance', 'data-done')) === 3.8);
    await p.getByTestId('cardio-tab-log').click(); await p.getByTestId('cardio-history').waitFor();
    const runRow = p.locator('[data-testid="cardio-row"][data-activity="running"][data-min="20"]');
    await runRow.getByTestId('cardio-open').click(); await p.getByTestId('cardio-duration').fill('25');
    await p.getByTestId('cardio-save').click(); await p.getByTestId('cardio-form').waitFor({ state: 'detached' });
    await p.getByTestId('cardio-tab-goals').click(); await p.getByTestId('cg-dashboard').waitFor();
    check(`${L}: editing 20 → 25 min updates today (37) and the week (37) at once`, (await attr('cg-day', 'data-done')) === 37 && (await attr('cg-week', 'data-done')) === 37);
    await p.getByTestId('cardio-tab-log').click();
    await p.locator('[data-testid="cardio-row"][data-activity="running"][data-min="25"]').getByTestId('cardio-delete').click(); await p.getByTestId('confirm-yes').click(); await p.waitForTimeout(500);
    await p.getByTestId('cardio-tab-goals').click(); await p.getByTestId('cg-dashboard').waitFor();
    check(`${L}: deleting it brings everything back (12 min, 1 session, 0.8 km)`, (await attr('cg-day', 'data-done')) === 12 && (await attr('cg-sessions', 'data-done')) === 1 && (await attr('cg-distance', 'data-done')) === 0.8);

    // 5. reports
    await p.getByTestId('cardio-tab-reports').click(); await p.getByTestId('cg-reports').waitFor();
    const num = async (id) => Number((await p.getByTestId(id).innerText()).replace(/[٠-٩]/g, (c) => c.charCodeAt(0) - 0x660).replace(/[^\d.]/g, ''));
    check(`${L}: weekly report — 12 min, 1 session, avg 12, 0.8 km, 8 % of goal, 8 weeks listed`, (await num('cgr-minutes')) === 12 && (await num('cgr-sessions')) === 1 && (await num('cgr-avg')) === 12 && (await num('cgr-km')) === 0.8 && (await num('cgr-goal')) === 8 && (await p.getByTestId('cg-report-row').count()) === 8);
    await p.getByTestId('cg-reports').getByRole('tab').nth(1).click(); await p.waitForTimeout(300);
    check(`${L}: monthly report — 6 months listed, this month includes the session`, (await p.getByTestId('cg-report-row').count()) === 6 && (await num('cgr-minutes')) >= 12);

    // 6. calorie target and data unchanged; Diary shows exercise as information only
    check(`${L}: calorie target on Home unchanged by goals and cardio`, (await kcalTarget()) === target0, target0);
    check(`${L}: Home shows the compact Cardio today card (12 of 30 min)`, (await attr('home-cardio-day', 'data-done')) === 12 && (await attr('home-cardio-day', 'data-target')) === 30);
    await p.goto(B + '#/diary'); await p.getByTestId('energy-card').waitFor();
    check(`${L}: Diary: exercise calories shown for information, not added to the food budget`, (await p.getByTestId('en-not-added').count()) === 1 && (await p.getByTestId('en-allowed').count()) === 0);
    check(`${L}: food diary records untouched`, (await counts()).entries === before.entries);

    // 7. Goals page and Workouts link to the dashboard
    await p.goto(B + '#/goals'); await p.getByTestId('cg-summary').waitFor();
    check(`${L}: Goals page shows the cardio goals card with today and this week`, (await attr('cgs-day', 'data-target')) === 30 && (await attr('cgs-week', 'data-target')) === 150 && (await p.getByTestId('goal-exercise-budget').count()) === 1);
    await p.getByTestId('cg-open').click(); await p.getByTestId('cg-dashboard').waitFor();
    check(`${L}: Goals → "Open cardio goals" opens the dashboard`, /tab=goals/.test(p.url()));

    // 8. offline: log a session without network
    await ctx.setOffline(true);
    await p.reload(); await p.getByTestId('cg-dashboard').waitFor();
    await p.getByTestId('cg-log').click(); await p.getByTestId('cardio-form').waitFor();
    await p.getByTestId('cardio-duration').fill('8'); await p.getByTestId('cardio-save').click(); await p.getByTestId('cardio-form').waitFor({ state: 'detached' }); await p.waitForTimeout(500);
    check(`${L}: offline — the dashboard loads and a new session updates progress (20 min)`, (await attr('cg-day', 'data-done')) === 20);
    await ctx.setOffline(false);

    // 9. layout
    for (const tab of ['goals', 'log', 'reports']) {
      await p.goto(B + '#/cardio?tab=' + tab); await p.waitForTimeout(700);
      check(`${L}: ${tab} — no horizontal overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    }
    await p.goto(B + '#/cardio?tab=goals'); await p.getByTestId('cg-dashboard').waitFor();
    const bars = await p.$$eval('[data-testid="cg-dashboard"] [role="progressbar"]', (els) => els.length >= 4 && els.every((e) => e.getAttribute('aria-label') && e.hasAttribute('aria-valuenow')));
    check(`${L}: progress bars and schedule days are labelled for screen readers`, bars && (await p.$$eval('[data-testid="cg-schedule-day"]', (els) => els.every((e) => (e.getAttribute('aria-label') || '').length > 3))));
    check(`${L}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  console.log(`\n${total - failed}/${total} cardio goals checks passed`); await b.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
