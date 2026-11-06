/**
 * Runs scripts/laptop-setup.mjs end-to-end against the REAL apps-script/Code.gs served over HTTP by the emulator
 * (Excel Hub → bootstrap install → live checks → AI key + photo analysis → QR link). Google itself is emulated, so
 * this proves the script's logic; the real run happens on your laptop.
 * Usage: node e2e/laptop-setup-test.mjs
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Papa from 'papaparse';
import { createGas } from './gas-mock.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const real = path.join(ROOT, 'tests/private/foods-160.csv');
const csv = readFileSync(existsSync(real) ? real : path.join(ROOT, 'tests/fixtures/foods-synthetic.csv'), 'utf8');
const rows = Papa.parse(csv.trim()).data.filter((r) => r.length > 1);
const secret = randomBytes(32).toString('hex');
const KEY = 'AIzaLaptopTestKey_0123456789abcdefghi';
const aiCalls = [];
const gas = createGas({
  foodRows: rows, token: '', mode: 'xlsx', bootstrapHash: createHash('sha256').update(secret).digest('hex'), scriptProps: { GEMINI_API_KEY: KEY },
  ai: (req) => {
    aiCalls.push(req);
    const text = req.body.contents[0].parts[1].text;
    const key = (ar) => (text.split('\n').find((l) => l.split(' | ')[1] === ar) || '').split(' | ')[0];
    const out = { is_food: true, meal_name_ar: 'أرز ودجاج', meal_name_en: 'Rice & chicken', notes: '', items: [
      { name_ar: 'أرز أبيض مطبوخ', name_en: 'Cooked rice', food_key: key('أرز أبيض مطبوخ'), grams: 200, grams_low: 160, grams_high: 250, state: 'cooked', cooking_method: 'boiled', kind: 'food', confidence: 0.8, reason: '', est_per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 } }
    ] };
    return { json: { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }] } };
  }
});
gas.props.delete('APP_TOKEN');
const sourceBefore = JSON.stringify(gas.source.sheets.map((s) => [s.name, s.data]));

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const out = gas.post(JSON.parse(body || '{}'));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/exec`;
const dir = mkdtempSync(path.join(tmpdir(), 'mego-backend-'));
const photo = path.join(ROOT, 'e2e', 'screens', '30-scan-review.png');

const child = spawn(process.execPath, [path.join(ROOT, 'scripts/laptop-setup.mjs'), '--photo', existsSync(photo) ? photo : path.join(ROOT, 'public/icon-512.png')], {
  env: { ...process.env, MEGO_FAKE_BACKEND: url, MEGO_FAKE_SECRET: secret, MEGO_BACKEND_DIR: dir }, stdio: ['ignore', 'pipe', 'inherit']
});
let out = '';
child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
const code = await new Promise((r) => child.on('close', r));
server.close();

const checks = [
  ['script exit code 0', code === 0],
  ['bootstrap converted + switched to the native Hub', /^native-/.test(gas.props.get('HUB_NATIVE_ID') || '')],
  ['original Excel untouched', JSON.stringify(gas.source.sheets.map((s) => [s.name, s.data])) === sourceBefore && !gas.state.renamedSource],
  ['all live checks passed', /All live checks passed/.test(out)],
  ['160 foods reported', /160 foods, 0 unreadable/.test(out)],
  ['AI photo analysis ran through the backend (Gemini endpoint only)', aiCalls.length === 1 && aiCalls[0].url.includes('gemini-3.8-flash:generateContent')],
  ['MEGO-TEST record cleaned up', !gas.post({ action: 'pull', token: gas.props.get('APP_TOKEN') }).tables.entries.some((e) => String(e.id).startsWith('MEGO-TEST'))],
  ['state file private (600) and outside the repo', (statSync(path.join(dir, 'state.json')).mode & 0o777) === 0o600 && !dir.startsWith(ROOT)],
  ['connect link printed', out.includes('#/settings?connect=MEGO1%7C')],
  ['bootstrap cannot run twice', gas.post({ action: 'bootstrap', secret }).error === 'unauthorized']
];
console.log('\n--- laptop-setup test');
for (const [n, p] of checks) console.log(`${p ? 'PASS' : 'FAIL'}  ${n}`);
const failed = checks.filter((c) => !c[1]).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
