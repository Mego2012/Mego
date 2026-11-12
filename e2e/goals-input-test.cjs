// Goals → daily targets can be cleared and retyped (2110 → 1800), and typing mistakes (21102110) are not saved.
// Usage: npx vite build && node e2e/goals-input-test.cjs
const pw = require('playwright'); const { spawn } = require('child_process');
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4192', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } }); let failed = 0, total = 0;
  const check = (n, ok, d = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:4192/'); await p.waitForTimeout(1500);
  if (await p.getByTestId('wel-guest').count()) { await p.getByTestId('wel-guest').click(); await p.waitForTimeout(1200); }
  const targets = () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('mego-nutrition'); r.onsuccess = () => { const q = r.result.transaction('settings').objectStore('settings').get('main'); q.onsuccess = () => res(q.result.targets.training); }; }));
  await p.goto('http://localhost:4192/#/goals'); await p.waitForTimeout(1200);
  const kcal = p.getByTestId('goal-kcal');
  await kcal.click(); await kcal.fill(''); await kcal.pressSequentially('1800', { delay: 60 }); await p.waitForTimeout(600);
  check('field shows what was typed', (await kcal.inputValue()) === '1800', await kcal.inputValue());
  check('1800 kcal saved', (await targets()).kcal === 1800, JSON.stringify(await targets()));
  await kcal.fill(''); await kcal.pressSequentially('21102110', { delay: 30 }); await p.waitForTimeout(600);
  check('a typing mistake (21102110) is not saved and a warning is shown', (await targets()).kcal < 10000 && (await p.getByTestId('targets-invalid').count()) === 1, String((await targets()).kcal));
  await p.getByTestId('goal-protein').click(); await p.waitForTimeout(400);
  check('leaving the field shows the saved value again', Number(await kcal.inputValue()) === (await targets()).kcal, await kcal.inputValue());
  const pr = p.getByTestId('goal-protein'); await pr.fill(''); await pr.pressSequentially('160', { delay: 60 }); await p.waitForTimeout(500);
  check('protein 160 saved', (await targets()).protein === 160);
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(`${total - failed}/${total} goals input checks passed`);
  await b.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
