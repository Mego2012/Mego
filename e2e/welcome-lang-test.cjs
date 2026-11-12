// Welcome screen: language can be chosen before an account exists (persists after reload, direction flips).
// Usage: npx vite build && node e2e/welcome-lang-test.cjs
const pw = require('playwright'); const { spawn } = require('child_process');
(async () => {
  const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4193', '--strictPort'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 2500));
  const b = await pw.chromium.launch(); const p = await b.newPage(); let failed = 0, total = 0;
  const check = (n, ok, d = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
  await p.goto('http://localhost:4193/'); await p.getByTestId('welcome').waitFor();
  const d0 = await p.evaluate(() => document.documentElement.dir);
  await p.getByTestId('wel-lang').click(); await p.waitForTimeout(600);
  const d1 = await p.evaluate(() => document.documentElement.dir); const txt = await p.getByTestId('welcome').innerText();
  check('welcome switches language and direction', d0 === 'rtl' && d1 === 'ltr' && /Create account/i.test(txt), `${d0}→${d1}`);
  await p.reload(); await p.getByTestId('welcome').waitFor(); await p.waitForTimeout(500);
  check('choice persists after reload', (await p.evaluate(() => document.documentElement.dir)) === 'ltr');
  await p.getByTestId('wel-register').click(); await p.waitForTimeout(400);
  check('registration form in the chosen language', /Email/i.test(await p.locator('body').innerText()));
  console.log(`${total - failed}/${total} welcome language checks passed`);
  await b.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
