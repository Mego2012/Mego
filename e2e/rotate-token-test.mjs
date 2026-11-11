/**
 * `laptop-setup.mjs --rotate-token` against the REAL apps-script/Code.gs (emulated Google): the backend accepts only
 * the new token afterwards, the laptop keeps it privately, and it never appears in the script's output.
 * Usage: node e2e/rotate-token-test.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Papa from 'papaparse';
import { createGas } from './gas-mock.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const real = path.join(ROOT, 'tests/private/foods-160.csv');
const csv = readFileSync(existsSync(real) ? real : path.join(ROOT, 'tests/fixtures/foods-synthetic.csv'), 'utf8');
const rows = Papa.parse(csv.trim()).data.filter((r) => r.length > 1);
const OLD = 'old-token-for-test';
const gas = createGas({ foodRows: rows, token: OLD, mode: 'native' });
gas.migrateHub();
const server = createServer((req, res) => { let b = ''; req.setEncoding('utf8'); req.on('data', (c) => (b += c)); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(gas.post(JSON.parse(b || '{}')))); }); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/exec`;
const dir = mkdtempSync(path.join(tmpdir(), 'mego-rot-'));
writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ url, token: OLD }));
const run = () => new Promise((resolve) => {
  const c = spawn(process.execPath, [path.join(ROOT, 'scripts/laptop-setup.mjs'), '--rotate-token'], { env: { ...process.env, MEGO_FAKE_BACKEND: url, MEGO_BACKEND_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; process.stdout.write(d); }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => resolve({ code, out }));
});
const a = await run();
const st1 = JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8'));
const b = await run(); // a second rotation works from the new token
const st2 = JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8'));
server.close();
const checks = [
  ['first rotation exits 0', a.code === 0],
  ['new token: 64 hex characters, different from the old one', /^[0-9a-f]{64}$/.test(st1.token) && st1.token !== OLD],
  ['no pending token left behind', !st1.pendingToken && !st2.pendingToken],
  ['the token never appears in the output', !a.out.includes(st1.token) && !b.out.includes(st2.token) && !b.out.includes(st1.token)],
  ['second rotation exits 0 and changes the token again', b.code === 0 && st2.token !== st1.token],
  ['backend: old and first tokens refused, latest accepted', gas.post({ action: 'ping', token: OLD }).ok === false && gas.post({ action: 'ping', token: st1.token }).ok === false && gas.post({ action: 'ping', token: st2.token }).ok === true],
  ['Hub data untouched', gas.sheet('Food_Database').getLastRow() === 161]
];
console.log('\n--- rotate token test');
for (const [n, p] of checks) console.log(`${p ? 'PASS' : 'FAIL'}  ${n}`);
const failed = checks.filter((c) => !c[1]).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
