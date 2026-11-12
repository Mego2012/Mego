// Backup & recovery, end to end with the app's own buttons (guest, local build, test data only):
// 1) Settings → Download backup; 2) a brand-new empty browser → Restore from file → every record identical;
// 3) restoring an OLDER backup over newer data keeps the newer targets, entries and weights, and deletes nothing.
// Usage: npx vite build && node e2e/backup-restore-test.cjs
const pw = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4194', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const B = 'http://localhost:4194/'; const b = await pw.chromium.launch(); let failed = 0, total = 0;
  const check = (n, ok, d = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mego-bk-'));
  const open = async () => { const ctx = await b.newContext({ acceptDownloads: true, locale: 'en' }); const p = await ctx.newPage(); await p.goto(B); await p.waitForTimeout(1500); if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1200); } return { ctx, p }; };
  const idb = (p, fn, arg) => p.evaluate(([src, a]) => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const f = new Function('db', 'a', 'return (' + src + ')(db, a)'); Promise.resolve(f(r.result, a)).then(res); }; }), [fn.toString(), arg]);
  const dump = (p) => idb(p, (db) => new Promise((res) => { const out = {}; const names = ['entries', 'body', 'foods', 'kv', 'days']; const tx = db.transaction([...names, 'settings']); for (const n of names) { const q = tx.objectStore(n).getAll(); q.onsuccess = () => { out[n] = q.result; }; } const s = tx.objectStore('settings').get('main'); s.onsuccess = () => { out.targets = s.result.targets; }; tx.oncomplete = () => res(out); }));
  const put = (p, store, rows) => idb(p, (db, a) => new Promise((res) => { const tx = db.transaction(a[0], 'readwrite'); for (const r of a[1]) tx.objectStore(a[0]).put(r); tx.oncomplete = res; }), [store, rows]);
  const setTargets = (p, kcal, protein) => idb(p, (db, a) => new Promise((res) => { const tx = db.transaction('settings', 'readwrite'); const st = tx.objectStore('settings'); const q = st.get('main'); q.onsuccess = () => { const s = q.result; const T = { kcal: a[0], protein: a[1], carbs: 235, fat: 59 }; s.targets = { training: { ...T }, rest: { ...T } }; s.updatedAt = Date.now(); st.put(s); }; tx.oncomplete = res; }), [kcal, protein]);
  const download = async (p, name) => { await p.goto(B + '#/settings'); await p.waitForTimeout(1200); const [dl] = await Promise.all([p.waitForEvent('download'), p.getByTestId('download-backup').click()]); const f = path.join(tmp, name); await dl.saveAs(f); return f; };
  const restore = async (p, f) => { await p.goto(B + '#/settings'); await p.waitForTimeout(1200); await p.getByTestId('restore-input').setInputFiles(f); await p.waitForTimeout(2500); };
  const now = Date.now();
  const entry = (id, kcal, t) => ({ id, date: '2026-11-10', meal: 'lunch', foodId: 'f1', name: 'Test chicken', state: 'cooked', quantity: 100, unit: 'g', grams: 100, basis: { kind: 'per100g' }, macros: { kcal, protein: 30, carbs: 0, fat: 4 }, order: 1, createdAt: t, updatedAt: t });

  // A: device with data (targets 2,110 / 160), download a backup
  const A = await open();
  await setTargets(A.p, 2110, 160);
  await put(A.p, 'entries', [entry('e1', 165, now - 5000), entry('e2', 200, now - 5000)]);
  await put(A.p, 'body', [{ id: 'b1', date: '2026-11-10', weight: 84.4, waist: 93, notes: '', createdAt: now - 5000, updatedAt: now - 5000 }]);
  await put(A.p, 'kv', [{ key: 'workout:w1', value: { id: 'w1', date: '2026-11-10', name: 'Legs', muscles: ['quads'], startedAt: 1, bodyWeightKg: 84, exercises: [] }, updatedAt: now - 5000 }]);
  const fileNow = await download(A.p, 'backup-now.json');
  const before = await dump(A.p);
  const json = JSON.parse(fs.readFileSync(fileNow, 'utf8'));
  check('backup file has every data table', ['foods', 'entries', 'recipes', 'templates', 'plans', 'plannedDays', 'body', 'days', 'settings', 'foodChanges', 'kv', 'fasts'].every((t) => Array.isArray(json.tables[t])), Object.keys(json.tables).join(','));
  check('backup file contains no sync token', !JSON.stringify(json.tables.settings).includes('"token":"') || json.tables.settings.every((s) => !s.sync));

  // B: brand-new empty browser (lost phone) → restore the file
  const Bx = await open();
  check('new browser starts empty', (await dump(Bx.p)).entries.length === 0);
  await restore(Bx.p, fileNow);
  const after = await dump(Bx.p);
  const same = (k) => JSON.stringify([...after[k]].sort((x, y) => String(x.id ?? x.key).localeCompare(String(y.id ?? y.key)))) === JSON.stringify([...before[k]].sort((x, y) => String(x.id ?? x.key).localeCompare(String(y.id ?? y.key))));
  check('restore brings back diary entries identical', same('entries'), `${after.entries.length} entries`);
  check('restore brings back weights, foods and workouts identical', same('body') && same('foods') && same('kv'));
  check('restore brings back targets 2,110 / 160', after.targets.training.kcal === 2110 && after.targets.training.protein === 160);

  // C: newer changes on device A, then restore the OLDER backup over them
  await new Promise((r) => setTimeout(r, 50));
  await setTargets(A.p, 2110, 165);
  await put(A.p, 'entries', [entry('e1', 250, Date.now()), entry('e3', 300, Date.now())]);
  await put(A.p, 'body', [{ id: 'b1', date: '2026-11-10', weight: 84.1, waist: 92.5, notes: '', createdAt: now - 5000, updatedAt: Date.now() }]);
  await restore(A.p, fileNow);
  const c = await dump(A.p);
  check('older backup does not overwrite newer targets', c.targets.training.protein === 165, JSON.stringify(c.targets.training));
  check('older backup does not overwrite a newer diary entry or weight', c.entries.find((e) => e.id === 'e1').macros.kcal === 250 && c.body.find((x) => x.id === 'b1').weight === 84.1);
  check('restore deletes nothing (entry added after the backup is kept)', !!c.entries.find((e) => e.id === 'e3') && c.entries.length === 3);
  const bks = await idb(A.p, (db) => new Promise((res) => { const q = db.transaction('backups').objectStore('backups').getAll(); q.onsuccess = () => res(q.result.map((x) => x.reason)); }));
  check('a protective local backup was taken before each restore', bks.includes('pre-restore'), bks.join(','));
  console.log(`${total - failed}/${total} backup & recovery checks passed`);
  await b.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(failed ? 1 : 0);
})();
