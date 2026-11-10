/**
 * `laptop-setup.mjs --hub-complete-foods` against the REAL apps-script/Code.gs (emulated Google): the Hub's
 * Food_Database gets the missing recipe ingredients and the ready meals, empty English names are filled,
 * and every existing row/value stays exactly as it was. Run twice: the second run adds nothing.
 * Usage: node e2e/hub-complete-test.mjs
 */
import { spawnSync } from 'node:child_process';
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
const gas = createGas({ foodRows: rows, token: 'tok', mode: 'native' });
gas.migrateHub();
const fdb = gas.sheet('Food_Database');
const before = JSON.parse(JSON.stringify(fdb.data));
const server = createServer((req, res) => { let b = ''; req.setEncoding('utf8'); req.on('data', (c) => (b += c)); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(gas.post(JSON.parse(b || '{}')))); }); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/exec`;
const dir = mkdtempSync(path.join(tmpdir(), 'mego-hub-'));
writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ url, token: 'tok' }));
const runOnce = () => new Promise((resolve) => {
  import('node:child_process').then(({ spawn }) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'scripts/laptop-setup.mjs'), '--hub-complete-foods'], { env: { ...process.env, MEGO_FAKE_BACKEND: url, MEGO_BACKEND_DIR: dir }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; process.stdout.write(d); }); c.on('close', (code) => resolve({ code, out }));
  });
});
const a = await runOnce();
const afterFirst = fdb.data.length;
const b = await runOnce();
server.close();
const hdr = fdb.data[0]; const col = (n) => hdr.indexOf(n);
const lib = JSON.parse(readFileSync(path.join(ROOT, 'public/fooddb/library-recipes.json'), 'utf8'));
const meals = fdb.data.filter((r) => String(r[0]).startsWith('LIB-') && !String(r[0]).startsWith('LIB-ING-'));
let unchanged = true;
for (let i = 0; i < before.length; i++) for (let c = 0; c < before[i].length; c++) if (c !== col('name_en') && JSON.stringify(fdb.data[i][c]) !== JSON.stringify(before[i][c])) unchanged = false;
const enKept = before.every((r, i) => !String(r[col('name_en')] || '').trim() || fdb.data[i][col('name_en')] === r[col('name_en')]);
const kebab = meals.find((r) => r[col('name_ar')] === lib.recipes[0].nameAr);
const checks = [
  ['both runs exit 0', a.code === 0 && b.code === 0],
  ['ready meals added (all recipes whose ingredients have values)', meals.length >= lib.recipes.length - 1],
  ['every existing cell unchanged except empty English names', unchanged],
  ['existing English names never replaced', enKept],
  ['English names now present for all original foods', fdb.data.slice(1, before.length).every((r) => String(r[col('name_en')] || '').trim())],
  ['meal rows have positive values and a serving weight', meals.every((r) => r[col('kcal_100g')] > 0 && r[col('piece_g')] > 0)],
  ['second run adds nothing', fdb.data.length === afterFirst && /to add: 0 ingredients, 0 ready meals/.test(b.out)],
  ['daily Drive backup taken before writing', gas.drive.copies.length >= 2],
  ['first meal is the recipe library first recipe', !!kebab]
];
console.log('\n--- hub complete test');
for (const [n, p] of checks) console.log(`${p ? 'PASS' : 'FAIL'}  ${n}`);
const failed = checks.filter((c) => !c[1]).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
