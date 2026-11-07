#!/usr/bin/env node
/**
 * MEGO Nutrition Hub — automated setup from your laptop (free: Apps Script + Google Sheets + Gemini free tier).
 *
 *   node scripts/laptop-setup.mjs            full setup / update (safe to run again)
 *   node scripts/laptop-setup.mjs --test     only the live integration tests against the existing backend
 *   node scripts/laptop-setup.mjs --photo meal.jpg   use your own photo for the real AI test
 *   node scripts/laptop-setup.mjs --ai-key-from-clipboard   read the Gemini key you copied (never typed into a chat)
 *   --auto   no keyboard prompts (also automatic when not run in a terminal): waits for Google screens by polling
 *   --verify  re-run the live account verification (scripts/live-verify.mjs) against the deployed site
 *   --cloud [admin-email]   ALSO set up the public multi-user platform on Firebase's free Spark plan:
 *            project, web app, Firestore (security rules deployed), email sign-in, admin account, public config
 *
 * What it does (you only click Google's own "Allow" screens):
 *  1. signs in Google's official Apps Script CLI (clasp) — browser "Allow"
 *  2. creates (or updates) a private Apps Script project in YOUR Drive and uploads apps-script/Code.gs + appsscript.json
 *  3. deploys it as a web app (Execute as: me · Access: anyone, protected by a secret token)
 *  4. after you allow the script's permissions once, runs installMego() remotely through a one-time secret:
 *     Excel → native Google Sheet (original untouched), verification of all foods, migration
 *  5. live tests: Hub identity, 160 foods, write + read back + soft-delete of a MEGO-TEST record
 *  6. optional free Gemini key (never billing) → stored in Script Properties → REAL photo analysis test
 *  7. prints a QR code / link that connects the app on your phone in one tap
 *
 * Private state (script ID, URL, token) is kept in ~/.mego-backend/ (outside the repository, file mode 600).
 * No key or token is ever written into the repository.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = process.env.MEGO_BACKEND_DIR || path.join(homedir(), '.mego-backend');
const STATE = path.join(WORK, 'state.json');
const CLASP = ['-y', '@google/clasp@3.4.1'];
const APP_URL = 'https://mego2012.github.io/Mego/';
const HUB_SOURCE_ID = '1mxqBI9_oiXCVpta2aRCDutYh9as_2NuI';
const args = process.argv.slice(2);
const onlyTest = args.includes('--test');
const photoArg = args.includes('--photo') ? args[args.indexOf('--photo') + 1] : '';
/** For automated testing of this script against an emulated backend (skips clasp/Google). */
const FAKE_BACKEND = process.env.MEGO_FAKE_BACKEND || '';

/**
 * npx / npm launcher. On Windows, Node 18.20+/20.12+ refuses to spawn npx.cmd/npm.cmd without a shell (EINVAL), so the
 * npm CLI shipped with this Node is started directly with node.exe (no shell, so paths with spaces are safe).
 */
const NODE_DIR = path.dirname(process.execPath);
function tool(name, toolArgs) {
  if (process.platform !== 'win32') return [name, toolArgs];
  const cli = path.join(NODE_DIR, 'node_modules', 'npm', 'bin', `${name}-cli.js`);
  if (existsSync(cli)) return [process.execPath, [cli, ...toolArgs]];
  return [name + '.cmd', toolArgs, true]; // fallback: through the shell
}
function run(name, toolArgs, opts = {}) {
  const [cmd, a, shell] = tool(name, toolArgs);
  return spawnSync(cmd, shell ? a.map((x) => (/[\s&|<>^"]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x)) : a, { ...opts, ...(shell ? { shell: true } : {}) });
}

const log = (...a) => console.log(...a);
const ok = (m) => log('  ✅ ' + m);
const bad = (m) => log('  ❌ ' + m);
const step = (m) => log('\n▶ ' + m);
const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass, detail }); (pass ? ok : bad)(name + (detail ? ' — ' + detail : '')); };

mkdirSync(WORK, { recursive: true, mode: 0o700 });
const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {});
const saveState = (s) => { writeFileSync(STATE, JSON.stringify(s, null, 2)); chmodSync(STATE, 0o600); };
let state = loadState();

const AUTO = args.includes('--auto') || !process.stdin.isTTY;
const keyFromClipboard = args.includes('--ai-key-from-clipboard');
const rl = AUTO ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Interactive: waits for Enter. Automatic: shows the request and waits 10 s before the caller retries. */
async function pause(msg) {
  if (AUTO) { log(`\n👉 WAITING FOR YOU: ${msg}\n   (checking again every 10 seconds)`); await sleep(10000); return; }
  await rl.question(`\n👉 ${msg}\n   Press Enter when done… `);
}
function readClipboard() {
  const p = platform();
  const r = p === 'darwin' ? spawnSync('pbpaste', { encoding: 'utf8' })
    : p === 'win32' ? spawnSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard'], { encoding: 'utf8' })
      : spawnSync('sh', ['-c', 'xclip -o -selection clipboard 2>/dev/null || xsel -b 2>/dev/null || wl-paste 2>/dev/null'], { encoding: 'utf8' });
  return String(r.stdout || '').trim();
}

function openUrl(url) {
  const p = platform();
  try {
    if (p === 'darwin') spawnSync('open', [url]);
    else if (p === 'win32') spawnSync('cmd', ['/c', 'start', '', url.replace(/&/g, '^&')]);
    else spawnSync('xdg-open', [url], { stdio: 'ignore' });
  } catch { /* the URL is printed anyway */ }
  log('   🌐 ' + url);
}

function clasp(cmd, { json = false, allowFail = false } = {}) {
  const r = run('npx', [...CLASP, ...cmd, ...(json ? ['--json'] : [])], { cwd: WORK, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0 && !allowFail) throw Object.assign(new Error(out.trim() || 'clasp failed'), { out });
  return { status: r.status, out, json: json ? safeJson(r.stdout) : null };
}
function safeJson(t) { try { return JSON.parse(t); } catch { const m = /\{[\s\S]*\}/.exec(t || ''); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } }

/** POST like the app does (text/plain avoids CORS preflight); follows Apps Script's redirect. */
async function call(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok: false, error: 'NOT_JSON', status: res.status, html: text.slice(0, 300) }; }
}

/* ------------------------------------------------------------------ 1-4: backend */

async function ensureLogin() {
  step('Google sign-in for Apps Script (official clasp CLI)');
  const who = clasp(['show-authorized-user'], { json: true, allowFail: true });
  if (who.status === 0 && who.json?.loggedIn !== false && /@/.test(who.out)) return ok('already signed in: ' + (who.json?.email || who.out.trim()));
  log('   A browser window opens: choose ahmedmego967@gmail.com and click "Allow".');
  const r = run('npx', [...CLASP, 'login'], { cwd: WORK, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('clasp login failed' + (r.error ? ': ' + r.error.message : ''));
}

async function ensureProject() {
  step('Apps Script project in your Drive');
  if (state.scriptId) { writeFileSync(path.join(WORK, '.clasp.json'), JSON.stringify({ scriptId: state.scriptId, rootDir: '.' })); return ok('existing project ' + state.scriptId); }
  for (let i = 0; ; i++) {
    if (i > 90) throw new Error('Apps Script API still disabled');
    const r = clasp(['create-script', '--type', 'standalone', '--title', 'MEGO Nutrition Hub Backend', '--rootDir', '.'], { allowFail: true });
    if (r.status === 0) break;
    if (/Apps Script API|usersettings|not been used|has not enabled/i.test(r.out)) {
      if (i === 0) openUrl('https://script.google.com/home/usersettings');
      await pause('Google requires one switch: turn ON "Google Apps Script API" on the page that just opened.');
      continue;
    }
    if (/already exists/i.test(r.out)) break;
    throw new Error(r.out);
  }
  const cfg = JSON.parse(readFileSync(path.join(WORK, '.clasp.json'), 'utf8'));
  state.scriptId = cfg.scriptId;
  saveState(state);
  ok('created https://script.google.com/d/' + state.scriptId + '/edit');
}

function pushCode(secretHash) {
  step('Upload backend code (Code.gs + appsscript.json)');
  let code = readFileSync(path.join(ROOT, 'apps-script/Code.gs'), 'utf8');
  if (secretHash) code = code.replace("var BOOTSTRAP_HASH = '';", `var BOOTSTRAP_HASH = '${secretHash}';`);
  writeFileSync(path.join(WORK, 'Code.js'), code);
  writeFileSync(path.join(WORK, 'appsscript.json'), readFileSync(path.join(ROOT, 'apps-script/appsscript.json'), 'utf8'));
  writeFileSync(path.join(WORK, '.claspignore'), '**/**\n!Code.js\n!appsscript.json\n');
  clasp(['push', '--force']);
  ok('uploaded');
}

function deploy() {
  step('Deploy as web app');
  const r = clasp(['create-deployment', '--description', 'MEGO Nutrition Hub ' + new Date().toISOString().slice(0, 16), ...(state.deploymentId ? ['--deploymentId', state.deploymentId] : [])], { json: true });
  const id = r.json?.deploymentId || /AKfy[\w-]+/.exec(r.out)?.[0];
  if (!id) throw new Error('no deployment id in: ' + r.out);
  state.deploymentId = id;
  state.url = `https://script.google.com/macros/s/${id}/exec`;
  saveState(state);
  ok(state.url);
}

async function bootstrap(secret) {
  step('One-time install on Google (convert Excel → Google Sheet, verify, migrate)');
  for (let attempt = 0; ; attempt++) {
    const r = await call(state.url, { action: 'bootstrap', secret });
    if (r.ok) {
      state.token = r.token;
      state.nativeId = r.nativeId;
      saveState(state);
      ok(`native Hub ${r.nativeId} · verified ${JSON.stringify(r.verified)}`);
      (r.log || []).filter((l) => !/CONNECTION CODE|not deployed yet/.test(l)).forEach((l) => log('     ' + l));
      return;
    }
    if (r.error === 'unauthorized') throw new Error('the backend refused the one-time install (already installed earlier?). If so, the token is in ' + STATE);
    if (r.error === 'NOT_JSON' || /authori[sz]ation|permission/i.test(String(r.error))) {
      if (attempt === 0) openUrl(`https://script.google.com/d/${state.scriptId}/edit`);
      if (attempt > (AUTO ? 90 : 4)) throw new Error('backend still not authorized: ' + (r.html || r.error));
      await pause('Google needs your permission once: in the Apps Script editor that opened, choose the function "authorize" at the top, click ▶ Run,\n   then "Review permissions" → your account → "Advanced" → "Go to MEGO Nutrition Hub Backend" → "Allow".');
      continue;
    }
    throw new Error('install failed: ' + r.error);
  }
}

/* ------------------------------------------------------------------ 5: live tests */

async function liveTests() {
  step('Live integration tests (real Google account, real Hub)');
  const T = { url: state.url, token: state.token };
  const ping = await call(T.url, { action: 'ping', token: T.token });
  record('backend answers with your token', ping.ok === true, ping.error || '');
  record('Hub identity: source is the original Excel file', ping.sourceId === HUB_SOURCE_ID, ping.sourceId);
  record('Hub is a native Google Sheet and writable', ping.mode === 'native' && ping.writable === true, `${ping.spreadsheet} · ${ping.spreadsheetId}`);
  record('installMego verification', ping.verified?.ok === true, JSON.stringify(ping.verified));
  const bad1 = await call(T.url, { action: 'ping', token: 'wrong' });
  record('wrong token is refused', bad1.error === 'unauthorized');
  const foods = await call(T.url, { action: 'foods', token: T.token });
  const header = foods.rows?.[0] || [];
  const rows = (foods.rows || []).slice(1).filter((r) => String(r[header.indexOf('name_ar')] || '').trim());
  const num = (r, c) => Number(r[header.indexOf(c)]);
  const unreadable = rows.filter((r) => ['kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g'].some((c) => !Number.isFinite(num(r, c)))).length;
  record('Food_Database has every food with readable values', foods.structured === true && rows.length === ping.verified?.foods && unreadable === 0, `${rows.length} foods, ${unreadable} unreadable`);
  state.foodCount = rows.length;
  // two-way sync proof with a clearly marked test record
  const id = 'MEGO-TEST-' + Date.now();
  const now = Date.now();
  const entry = { id, date: new Date().toISOString().slice(0, 10), meal: 'snacks', name: 'MEGO-TEST (automatic check)', state: 'other', quantity: 1, unit: 'g', grams: 1, macros: { kcal: 1, protein: 0, carbs: 0, fat: 0 }, basis: { per100: { kcal: 100, protein: 0, carbs: 0, fat: 0 } }, order: 999, createdAt: now, updatedAt: now };
  const push = await call(T.url, { action: 'push', token: T.token, clientSchema: 2, changes: [{ table: 'entries', key: id, op: 'upsert', payload: entry, at: now }] });
  record('write: phone → Hub (test record)', push.ok && push.applied === 1, JSON.stringify(push.conflicts || []));
  const pulled = await call(T.url, { action: 'pull', token: T.token });
  record('read: Hub → phone (test record comes back)', !!pulled.tables?.entries?.find((e) => e.id === id));
  const older = await call(T.url, { action: 'push', token: T.token, changes: [{ table: 'entries', key: id, op: 'upsert', payload: { ...entry, name: 'OLDER', updatedAt: now - 1000 }, at: now - 1000 }] });
  record('an older copy never overwrites a newer one', (older.conflicts || []).length === 1);
  const del = await call(T.url, { action: 'push', token: T.token, changes: [{ table: 'entries', key: id, op: 'delete', at: now + 1 }] });
  const after = await call(T.url, { action: 'pull', token: T.token });
  record('test record soft-deleted (kept in Deleted_Records)', del.ok && !after.tables?.entries?.find((e) => e.id === id));
  saveState(state);
  return { ping, rows, header };
}

/* ------------------------------------------------------------------ 6: free Gemini */

async function gemini(foodsInfo) {
  step('Free AI meal scanner (Gemini API free tier — never billing)');
  const ping = await call(state.url, { action: 'ping', token: state.token });
  if (!ping.aiScanner) {
    let key = '';
    if (keyFromClipboard) key = readClipboard();
    else {
      openUrl('https://aistudio.google.com/apikey');
      log('   On that page click "Create API key" (accept Google\'s terms if asked). Do NOT click "Set up billing". Copy the key.');
      if (AUTO) { log('   Then run: node scripts/laptop-setup.mjs --test --ai-key-from-clipboard'); return; }
      key = (await rl.question('   Paste the key here (or press Enter to skip the AI scanner for now): ')).trim();
    }
    if (!/^AIza[\w-]{30,}$/.test(key)) { log(keyFromClipboard ? '   the clipboard does not contain a Gemini key (starts with AIza) — copy it and run again' : '   skipped'); return; }
    const r = await call(state.url, { action: 'setAiKey', token: state.token, key });
    record('Gemini key accepted by Google and stored only in Script Properties', r.ok === true, r.error || r.aiModel);
    if (!r.ok) return;
  } else ok('free Gemini key already configured (' + ping.aiModel + ')');
  // real photo
  let img;
  if (photoArg) img = readFileSync(photoArg);
  else {
    const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=5&gsrsearch=' +
      encodeURIComponent('chicken rice plate filetype:bitmap') + '&prop=imageinfo&iiprop=url|mime&iiurlwidth=1024';
    const q = await (await fetch(api, { headers: { 'User-Agent': 'mego-nutrition-setup/1.0' } })).json();
    const page = Object.values(q.query?.pages || {}).find((p) => p.imageinfo?.[0]?.mime === 'image/jpeg');
    if (!page) { bad('could not download a sample meal photo — run again with --photo your-meal.jpg'); return; }
    log('   sample photo (public, Wikimedia Commons): ' + page.imageinfo[0].descriptionurl);
    img = Buffer.from(await (await fetch(page.imageinfo[0].thumburl, { headers: { 'User-Agent': 'mego-nutrition-setup/1.0' } })).arrayBuffer());
  }
  const { header, rows } = foodsInfo;
  const col = (c) => header.indexOf(c);
  const catalog = rows.map((r, i) => ({ k: 'f' + (i + 1), ar: r[col('name_ar')], en: r[col('name_en')], s: r[col('state')], c: r[col('category')] }));
  const t0 = Date.now();
  const r = await call(state.url, { action: 'analyzeMeal', token: state.token, image: img.toString('base64'), mediaType: img[0] === 0x89 ? 'image/png' : 'image/jpeg', foods: catalog, lang: 'ar', note: '' });
  if (!r.ok) {
    record('Gemini photo analysis (live call)', false, r.error + (r.retryAfter ? ` (wait ${r.retryAfter}s)` : ''));
    return;
  }
  const items = r.result?.items || [];
  record('Gemini photo analysis (live call)', items.length > 0 || r.result?.is_food === false, `${r.model} · ${items.length} item(s) · ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const it of items) {
    const m = catalog.find((c) => c.k === it.food_key);
    log(`     • ${it.name_ar} / ${it.name_en}: ~${it.grams} g (${it.grams_low}–${it.grams_high}) · ${it.state} · ${it.cooking_method} · conf ${it.confidence} → ${m ? 'DB: ' + m.ar : 'not in DB (estimate)'}`);
  }
}

/* ------------------------------------------------------------------ 7: connect the app */

function connectApp() {
  step('Connect the app');
  const code = `MEGO1|${state.url}|${state.token}`;
  const link = `${APP_URL}#/settings?connect=${encodeURIComponent(code)}`;
  log('   Scan this QR code with your Samsung camera (it opens MEGO and connects it — your phone data is compared, kept and uploaded):');
  const qr = run('npx', ['-y', 'qrcode-terminal@0.12.0', link, '--small'], { stdio: ['ignore', 'inherit', 'ignore'] });
  if (qr.status !== 0) log('   (QR code unavailable — open the link below on your phone instead, e.g. send it to yourself privately)');
  log('   🔗 ' + link);
  log('   Keep this link private (it contains your token). Re-print it any time with: node scripts/laptop-setup.mjs --test');
}

/* ------------------------------------------------------------------ public platform: Firebase Spark (free) */

const FB = ['--no-install', 'firebase'];
function firebase(cmdArgs, { json = false, allowFail = false } = {}) {
  const r = run('npx', [...FB, ...cmdArgs, ...(json ? ['--json'] : []), '--non-interactive'], { cwd: ROOT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0 && !allowFail) throw new Error('firebase ' + cmdArgs.join(' ') + ': ' + out.slice(-600));
  return { status: r.status, out, json: json ? safeJson(r.stdout) : null };
}
async function googleToken() {
  const require = (await import('node:module')).createRequire(import.meta.url);
  const auth = require(path.join(ROOT, 'node_modules/firebase-tools/lib/auth.js'));
  const acct = auth.getGlobalDefaultAccount();
  if (!acct?.tokens?.refresh_token) throw new Error('firebase CLI not signed in');
  const t = await auth.getAccessToken(acct.tokens.refresh_token, []);
  return t.access_token;
}
async function gapi(url, method, body, project) {
  const res = await fetch(url, { method, headers: { Authorization: 'Bearer ' + (await googleToken()), 'Content-Type': 'application/json', ...(project ? { 'x-goog-user-project': project } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let j = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { ok: res.ok, status: res.status, json: j, text };
}

async function setupCloud(adminEmail) {
  step('Public platform on Firebase (free Spark plan — no billing account)');
  if (!existsSync(path.join(ROOT, 'node_modules/firebase-tools'))) run('npm', ['ci'], { cwd: ROOT, stdio: 'inherit' });
  if (!/@/.test(firebase(['login:list'], { allowFail: true }).out)) {
    log('   A browser window opens: choose your Google account and click "Allow".');
    run('npx', [...FB, 'login'], { cwd: ROOT, stdio: 'inherit' });
  }
  if (!state.fbProject) {
    const id = 'mego-' + randomBytes(3).toString('hex');
    firebase(['projects:create', id, '--display-name', 'MEGO Nutrition']);
    state.fbProject = id; saveState(state);
    ok('project ' + id);
  } else ok('project ' + state.fbProject);
  const P = state.fbProject;
  if (!state.fbAppId) {
    const r = firebase(['apps:create', 'WEB', 'MEGO Web', '--project', P], { json: true });
    state.fbAppId = r.json?.result?.appId; saveState(state);
  }
  const cfg = firebase(['apps:sdkconfig', 'WEB', state.fbAppId, '--project', P], { json: true }).json?.result?.sdkConfig;
  if (!cfg?.apiKey) throw new Error('could not read the web app config');
  ok('web app ' + state.fbAppId);
  // Firestore database (location is permanent: Dammam, then Doha, then Europe)
  if (!state.fbDb) {
    for (const loc of ['me-central2', 'me-central1', 'eur3']) {
      const r = firebase(['firestore:databases:create', '(default)', '--location', loc, '--project', P], { allowFail: true });
      if (r.status === 0 || /already exists/i.test(r.out)) { state.fbDb = loc; saveState(state); break; }
    }
    if (!state.fbDb) throw new Error('could not create the Firestore database');
  }
  ok('Firestore (' + state.fbDb + ')');
  firebase(['deploy', '--only', 'firestore:rules,firestore:indexes', '--project', P]);
  ok('security rules deployed');
  // Email/password sign-in + the app's domain
  const enable = await gapi(`https://identitytoolkit.googleapis.com/admin/v2/projects/${P}/config?updateMask=signIn.email,authorizedDomains`, 'PATCH',
    { signIn: { email: { enabled: true, passwordRequired: true } }, authorizedDomains: ['localhost', `${P}.firebaseapp.com`, `${P}.web.app`, 'mego2012.github.io'] }, P);
  if (!enable.ok) {
    openUrl(`https://console.firebase.google.com/project/${P}/authentication/providers`);
    for (;;) {
      await pause('Firebase needs one click: Authentication → Get started → "Email/Password" → Enable → Save.');
      const c = await gapi(`https://identitytoolkit.googleapis.com/admin/v2/projects/${P}/config`, 'GET', null, P);
      if (c.json?.signIn?.email?.enabled) break;
    }
  }
  ok('email sign-in enabled');
  // public config for the app (identifiers only — access is enforced by the rules)
  const pub = { apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId, aiBackendUrl: state.url };
  writeFileSync(path.join(ROOT, 'public/firebase-config.json'), JSON.stringify(pub, null, 2) + '\n');
  ok('public/firebase-config.json written');
  if (state.url && state.token) {
    const r = await call(state.url, { action: 'setCloudConfig', token: state.token, apiKey: cfg.apiKey, projectId: cfg.projectId, userLimit: 10, globalLimit: 200 });
    record('AI backend knows the Firebase project (per-user limit 10/day, global 200/day)', r.ok === true, r.error || '');
  }
  // admin account (must already be registered in the app)
  if (adminEmail) {
    const look = await gapi(`https://identitytoolkit.googleapis.com/v1/projects/${P}/accounts:lookup`, 'POST', { email: [adminEmail] }, P);
    const uid = look.json?.users?.[0]?.localId;
    if (!uid) log(`   ${adminEmail} has no account yet: register in the app, then run again with --cloud ${adminEmail}`);
    else {
      const w = await gapi(`https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents/admins/${uid}`, 'PATCH', { fields: { since: { integerValue: String(Date.now()) } } }, P);
      record('administrator role for ' + adminEmail, w.ok, w.ok ? '' : w.text.slice(0, 120));
    }
  }
  // publish the config with the app (GitHub Pages)
  const g = spawnSync('git', ['add', 'public/firebase-config.json'], { cwd: ROOT, encoding: 'utf8' });
  const c = spawnSync('git', ['commit', '-m', 'Enable public accounts (Firebase config: public identifiers only)'], { cwd: ROOT, encoding: 'utf8' });
  const p = spawnSync('git', ['push'], { cwd: ROOT, encoding: 'utf8' });
  if (g.status === 0 && p.status === 0) ok('config pushed — GitHub Pages redeploys in ~2 minutes');
  else log('   Could not push automatically (' + ((c.stderr || '') + (p.stderr || '')).trim().slice(0, 120) + '). Commit public/firebase-config.json and push it.');
}

/** After --cloud: wait until the live site serves the new config, then run the real-account verification. */
async function liveVerify() {
  step('Live verification of accounts, isolation, sync, logging and reports (real Firebase, disposable test accounts)');
  const want = state.fbProject;
  for (let i = 0; i < 60; i++) {
    const r = await fetch(APP_URL + 'firebase-config.json', { cache: 'no-store' }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (j?.projectId === want) break;
    if (i === 0) log('   waiting for GitHub Pages to publish the new config (usually 1–3 minutes)…');
    if (i === 59) { record('live site serves the Firebase config', false, 'not published yet — run again later with --verify'); return; }
    await new Promise((res) => setTimeout(res, 10000));
  }
  let ok = spawnSync('node', ['-e', "require('playwright')"], { cwd: ROOT }).status === 0;
  if (!ok) {
    log('   installing the test browser (Playwright, free, local only)…');
    run('npm', ['install', '--no-save', 'playwright@1.63.0'], { cwd: ROOT, stdio: 'inherit' });
    run('npx', ['playwright', 'install', 'chromium'], { cwd: ROOT, stdio: 'inherit' });
  }
  const v = spawnSync('node', [path.join(ROOT, 'scripts/live-verify.mjs'), APP_URL], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, MEGO_BACKEND_DIR: WORK } });
  record('live verification with real accounts (see live-verify report)', v.status === 0, v.status === 0 ? '' : 'one or more live checks failed');
}

/* ------------------------------------------------------------------ main */

try {
  log('MEGO Nutrition Hub — laptop setup (free, no billing)');
  if (FAKE_BACKEND) {
    state.url = FAKE_BACKEND;
    if (!state.token) await bootstrap(process.env.MEGO_FAKE_SECRET);
  } else if (!onlyTest) {
    await ensureLogin();
    await ensureProject();
    const needsInstall = !state.token;
    const secret = needsInstall ? randomBytes(32).toString('hex') : '';
    pushCode(needsInstall ? createHash('sha256').update(secret).digest('hex') : '');
    deploy();
    if (needsInstall) await bootstrap(secret);
  }
  if (!state.url || !state.token) throw new Error('no backend yet — run without --test first');
  const info = await liveTests();
  await gemini(info);
  if (args.includes('--cloud') && !FAKE_BACKEND) await setupCloud(args[args.indexOf('--cloud') + 1]?.includes('@') ? args[args.indexOf('--cloud') + 1] : '');
  if ((args.includes('--cloud') || args.includes('--verify')) && !FAKE_BACKEND && state.fbProject) await liveVerify();
  connectApp();
  const failed = results.filter((r) => !r.pass);
  const report = [`# MEGO live check ${new Date().toISOString()}`, '', `Backend: ${state.url.replace(/\/s\/.{8}/, '/s/…')}`, `Hub: ${state.nativeId || ''}`, '',
    ...results.map((r) => `- ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)].join('\n');
  const file = path.join(WORK, `report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`);
  writeFileSync(file, report);
  log(`\n${failed.length ? '⚠️ ' + failed.length + ' check(s) failed' : '🎉 All live checks passed'} — report: ${file}`);
  process.exitCode = failed.length ? 1 : 0;
} catch (e) {
  bad(String(e.message || e));
  process.exitCode = 1;
} finally {
  rl?.close();
}
