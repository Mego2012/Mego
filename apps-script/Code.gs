/**
 * MEGO Nutrition Hub — Google Apps Script backend (v5). Free to run: Google Apps Script + Google Sheets + (optional)
 * the Gemini API free tier. No paid service is used and no billing account is needed.
 *
 * ONE SOURCE OF TRUTH: the Hub is the file SOURCE_ID below («MEGO Nutrition Hub», originally an Excel .xlsx).
 *  - installMego() converts it ONCE into a native Google Sheet in the same folder (Google gives the native file a
 *    new ID; an .xlsx cannot become native in place). The native ID is stored in Script Properties (HUB_NATIVE_ID)
 *    and from then on that native sheet is the Hub. The original .xlsx is never modified, renamed or deleted —
 *    it stays as the backup.
 *  - The script never opens any other spreadsheet and never falls back to another file.
 * It is a standalone script (script.google.com → New project).
 *
 * Modes
 *  - native : the Hub is a native Google Sheet → full two-way sync into structured tabs.
 *  - xlsx   : not converted yet → READ-ONLY (foods are read through a temporary converted copy that is deleted).
 *
 * Data ownership
 *  - Food_Database            : owned by the SHEET (you manage values there); the app pulls it.
 *                               Custom foods created in the app are added as new rows (source=custom).
 *                               The original tab «قاعدة بيانات الأطعمة» is never modified.
 *  - Food_Log, Weight_Log, Body_Measurements, Water_Log, Habits_Log, Meal_Plans, Shopping_List,
 *    Recipes, Recipe_Ingredients : owned by the APP (pushed from your phone).
 *  - Settings_App             : two-way, newest updated_at wins.
 *  Every write is timestamp-checked: an older record never overwrites a newer one (conflict reported).
 *  Deletes are soft: the row is copied to Deleted_Records first.
 *
 * Security
 *  - Web app deployment: Execute as "Me", access "Anyone" (Google login cookies cannot be sent from a PWA),
 *    protected by a 256-bit secret token that exists only in Script Properties and on your phone — never in
 *    the app's public code. Every request is validated; unknown tables/fields are rejected.
 *  - The Gemini key (optional) is stored only in Script Properties (GEMINI_API_KEY).
 */

/** The original Hub file (Excel). Kept untouched as the backup after conversion. */
var SOURCE_ID = '1mxqBI9_oiXCVpta2aRCDutYh9as_2NuI';
var HUB_NAME = 'MEGO Nutrition Hub';
var SCRIPT_VERSION = 7;
/**
 * One-time automated install (scripts/laptop-setup.mjs). Empty in the public repository = disabled.
 * The laptop setup writes the SHA-256 of a random secret here only in YOUR private copy of the script; the
 * secret itself never leaves your laptop. It works once and then disables itself (BOOTSTRAP_DONE).
 */
var BOOTSTRAP_HASH = '';
var SCHEMA_VERSION = 3;
var ORIGINAL_FOOD_TAB = 'قاعدة بيانات الأطعمة';
var MAX_CHANGES = 500;
var MAX_PAYLOAD_CHARS = 45000;
var MAX_KEY_CHARS = 200;

/** Structured tables: [tab name, primary key, readable columns (filled from the record), owner]. Last 2 columns are always updated_at, json. */
var TABLES = {
  foods:        ['Food_Database', 'food_id', ['food_id', 'name_ar', 'name_en', 'category', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g', 'fiber_100g', 'sugar_100g', 'sodium_mg_100g', 'piece_g', 'state', 'state_label', 'prep', 'source', 'verification', 'barcode', 'notes', 'active'], 'sheet'],
  entries:      ['Food_Log', 'record_id', ['record_id', 'date', 'meal', 'food_id', 'recipe_id', 'name', 'state', 'quantity', 'unit', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'fiber'], 'app'],
  body:         ['Body_Measurements', 'record_id', ['record_id', 'date', 'weight', 'waist', 'chest', 'hips', 'arm', 'thigh', 'neck', 'body_fat', 'notes'], 'app'],
  days:         ['Daily_Log', 'date', ['date', 'water_ml', 'status', 'day_type', 'habits_done', 'notes'], 'app'],
  recipes:      ['Recipes', 'recipe_id', ['recipe_id', 'name', 'servings', 'kcal_serving', 'protein_serving', 'carbs_serving', 'fat_serving', 'total_grams', 'library_id', 'notes'], 'app'],
  templates:    ['Saved_Meals', 'template_id', ['template_id', 'name', 'items'], 'app'],
  plans:        ['Meal_Plan_Templates', 'plan_id', ['plan_id', 'name', 'day_type', 'items'], 'app'],
  plannedDays:  ['Meal_Plans', 'date', ['date', 'plan_id', 'items'], 'app'],
  fasts:        ['Fasting_Log', 'record_id', ['record_id', 'start', 'end', 'target_hours'], 'app'],
  kv:           ['App_KeyValue', 'key', ['key'], 'app'],
  settings:     ['Settings_App', 'key', ['key', 'goal', 'kcal', 'protein', 'carbs', 'fat', 'water_ml', 'weight', 'target_weight', 'language'], 'both'],
  foodChanges:  ['Food_Change_Log', 'change_id', ['change_id', 'food_id', 'food_name', 'action', 'origin'], 'app']
};
var DERIVED_TABS = { Recipe_Ingredients: ['recipe_id', 'food_id', 'name', 'quantity', 'unit', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
  Weight_Log: ['date', 'weight', 'notes'], Water_Log: ['date', 'water_ml'], Habits_Log: ['date', 'habit_id', 'done'],
  Shopping_List: ['week', 'item_key', 'checked'], Food_Aliases: ['food_id', 'alias', 'lang'],
  Sync_Metadata: ['key', 'value'], Deleted_Records: ['table', 'key', 'deleted_at', 'json', 'recovered'],
  Backup_Log: ['at', 'kind', 'file', 'status', 'details'] };

/* ============================================================== setup / migration */

/** One-time: creates the token. Safe to run again (keeps the existing token). */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('APP_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('APP_TOKEN', token);
  }
  Logger.log('Hub: ' + hubId_() + ' (' + hubMode_() + ')');
  Logger.log('APP TOKEN (paste into the app, keep private): ' + token);
  return token;
}

function rotateToken() {
  PropertiesService.getScriptProperties().deleteProperty('APP_TOKEN');
  return setup();
}

/** The current Hub: the native converted sheet once installMego() ran, otherwise the original file. */
function hubId_() { return PropertiesService.getScriptProperties().getProperty('HUB_NATIVE_ID') || SOURCE_ID; }
function hubFile_() { return DriveApp.getFileById(hubId_()); }

function hubMode_() {
  var mt = hubFile_().getMimeType();
  return mt === 'application/vnd.google-apps.spreadsheet' ? 'native' : 'xlsx';
}

function hub_() {
  if (hubMode_() !== 'native') throw new Error('HUB_IS_XLSX: the Hub is an Excel file; run convertHubToGoogleSheets() to enable writing');
  return SpreadsheetApp.openById(hubId_());
}

/** Full Drive copy of the Hub before any structural change. */
function backupHub_(reason) {
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  var copy = hubFile_().makeCopy('BACKUP ' + HUB_NAME + ' — ' + reason + ' — ' + stamp);
  logBackup_('drive-copy', copy.getName(), 'ok', reason);
  return copy.getName();
}

function logBackup_(kind, file, status, details) {
  try {
    if (hubMode_() !== 'native') return;
    tab_('Backup_Log', DERIVED_TABS.Backup_Log).appendRow([new Date().toISOString(), kind, file, status, details || '']);
  } catch (e) { /* the log must never break a backup */ }
}

/**
 * Upgrades the native Hub: renames it, backs it up, adds the structured tabs and the dashboard, and copies
 * the original food tab into Food_Database with stable IDs. The original tab is left exactly as it is.
 * Writes a Migration_Report tab. Re-running is safe (existing IDs are kept, nothing is duplicated).
 */
function migrateHub() {
  var ss = hub_();
  var report = [['step', 'result']];
  report.push(['backup', backupHub_('before migrateHub')]);
  if (ss.getName() !== HUB_NAME) { ss.rename(HUB_NAME); report.push(['rename', HUB_NAME]); }
  report.push(['tabs before', ss.getSheets().map(function (s) { return s.getName(); }).join(' | ')]);
  Object.keys(TABLES).forEach(function (t) { structured_(t); });
  Object.keys(DERIVED_TABS).forEach(function (n) { tab_(n, DERIVED_TABS[n]); });
  var r = seedFoodDatabase_();
  report.push(['original food rows', r.original]);
  report.push(['Food_Database rows added', r.added]);
  report.push(['Food_Database rows already present', r.kept]);
  report.push(['estimated / unverified rows (flagged, not changed)', r.flagged]);
  report.push(['zero-value placeholders (flagged, not changed)', r.zero]);
  setMeta_('schemaVersion', SCHEMA_VERSION);
  setMeta_('hubName', HUB_NAME);
  setMeta_('migratedAt', new Date().toISOString());
  buildDashboard_();
  var rep = tab_('Migration_Report', ['step', 'result']);
  rep.clearContents();
  rep.getRange(1, 1, report.length, 2).setValues(report);
  report.push(['rollback', 'Open the BACKUP copy in Drive (File → Make a copy) or delete the new tabs; the original tabs were not modified.']);
  rep.getRange(1, 1, report.length, 2).setValues(report);
  return report;
}

/**
 * ONE-TIME INSTALL — run this once from the editor (Run ▶ installMego). It is safe to run again.
 *  1. creates the secret app token (kept in Script Properties)
 *  2. converts the Excel Hub (SOURCE_ID) into a native Google Sheet in the same folder; the .xlsx is not touched
 *  3. verifies the converted file (food tab present, food rows counted, numeric values readable)
 *  4. runs migrateHub() on the native sheet (Drive backup copy first, structured tabs, Food_Database with IDs)
 *  5. prints the connection code to paste into the app (after you deployed the web app)
 */
function installMego() {
  var props = PropertiesService.getScriptProperties();
  var token = setup();
  var out = [];
  var conv = ensureNativeHub_();
  out.push('Original (kept untouched): ' + SOURCE_ID);
  out.push('Native Hub: ' + conv.id + (conv.created ? ' (created now)' : ' (already existed)'));
  var v = verifyNativeHub_(conv.id);
  out.push('Verification: ' + JSON.stringify(v));
  if (!v.ok) throw new Error('VERIFY_FAILED: ' + JSON.stringify(v) + ' — the Hub was NOT switched; the original file is unchanged.');
  props.setProperty('HUB_VERIFIED', JSON.stringify(v));
  props.setProperty('HUB_NATIVE_ID', conv.id); // switch only after a successful verification
  props.deleteProperty('HUB_PENDING_ID');
  var rep = migrateHub();
  out.push('Migration: ' + rep.map(function (r) { return r[0] + '=' + r[1]; }).join(' | '));
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { /* not deployed yet */ }
  out.push(url ? 'CONNECTION CODE (paste into MEGO → Settings): MEGO1|' + url + '|' + token
    : 'Web app not deployed yet: Deploy → New deployment → Web app, then run installMego again to get the connection code.');
  out.forEach(function (l) { Logger.log(l); });
  return out;
}

/** Runs installMego() once for the automated laptop setup, authenticated by the one-time bootstrap secret. */
function bootstrap_(req) {
  var props = PropertiesService.getScriptProperties();
  if (!BOOTSTRAP_HASH || props.getProperty('BOOTSTRAP_DONE')) return { ok: false, error: 'unauthorized' };
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(req.secret || ''), Utilities.Charset.UTF_8);
  var hex = digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  if (hex !== BOOTSTRAP_HASH) return { ok: false, error: 'unauthorized' };
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var out = installMego();
    props.setProperty('BOOTSTRAP_DONE', new Date().toISOString());
    return { ok: true, token: props.getProperty('APP_TOKEN'), nativeId: props.getProperty('HUB_NATIVE_ID'), sourceId: SOURCE_ID,
      verified: JSON.parse(props.getProperty('HUB_VERIFIED') || 'null'), log: out };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    lock.releaseLock();
  }
}

/** Touches every service once so Google shows the permission screen (used if the web app asks for authorization). */
function authorize() {
  DriveApp.getFileById(SOURCE_ID).getName();
  PropertiesService.getScriptProperties().getKeys();
  try { UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true }); } catch (e) { /* only the permission matters */ }
  return 'authorized';
}

/** Converts the Excel Hub once (the new file is "pending" until verified). Never modifies the .xlsx. */
function ensureNativeHub_() {
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty('HUB_NATIVE_ID') || props.getProperty('HUB_PENDING_ID');
  if (existing) {
    try { if (!DriveApp.getFileById(existing).isTrashed()) return { id: existing, created: false }; } catch (e) { /* missing → convert again */ }
  }
  var src = DriveApp.getFileById(SOURCE_ID);
  if (src.getMimeType() === 'application/vnd.google-apps.spreadsheet') return { id: SOURCE_ID, created: false };
  var parent = src.getParents().hasNext() ? src.getParents().next().getId() : null;
  var meta = { name: HUB_NAME, mimeType: 'application/vnd.google-apps.spreadsheet',
    description: 'MEGO Nutrition Hub — native Google Sheets version converted from the Excel file ' + SOURCE_ID + ' on ' + new Date().toISOString() + '. The Excel file is kept unchanged as the backup.' };
  if (parent) meta.parents = [parent];
  var file = Drive.Files.create(meta, src.getBlob());
  props.setProperty('HUB_PENDING_ID', file.id);
  props.setProperty('HUB_CONVERTED_AT', new Date().toISOString());
  return { id: file.id, created: true };
}

/** Checks the native Hub: food tab present, food rows with a name, numeric values readable. */
function verifyNativeHub_(id) {
  var ss = SpreadsheetApp.openById(id);
  var res = { ok: false, tabs: ss.getSheets().map(function (s) { return s.getName(); }), foods: 0, numericProblems: 0 };
  var orig = ss.getSheetByName(ORIGINAL_FOOD_TAB);
  if (!orig) { res.error = 'food tab not found'; return res; }
  var vals = orig.getDataRange().getValues();
  var h = headerMap_(vals);
  if (!h) { res.error = 'food header not found'; return res; }
  for (var r = h.row + 1; r < vals.length; r++) {
    if (!String(vals[r][h.map.name] || '').trim()) continue;
    res.foods++;
    ['kcal', 'protein', 'carbs', 'fat'].forEach(function (k) {
      var v = vals[r][h.map[k]];
      if (v !== '' && isNaN(Number(String(v).replace(',', '.')))) res.numericProblems++;
    });
  }
  res.ok = res.foods > 0;
  return res;
}

/** Kept for compatibility: same as the conversion step of installMego(). */
function convertHubToGoogleSheets() { return ensureNativeHub_().id; } // verification + switch happen in installMego()

/* ============================================================== web app */

function doGet() {
  return json_({ ok: true, app: 'mego-nutrition', version: SCRIPT_VERSION });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
    if (req.action === 'bootstrap') return json_(bootstrap_(req));
    // Public accounts (Firebase): the user's own sign-in token instead of the owner's app token.
    if (req.idToken && (req.action === 'analyzeMeal' || req.action === 'aiStats' || req.action === 'aiDiag')) return json_(publicAi_(req));
    if (!token || typeof req.token !== 'string' || req.token !== token) return json_({ ok: false, error: 'unauthorized' });
    // AI meal analysis never touches the spreadsheet, so it runs outside the lock (it can take ~10-40 s).
    if (req.action === 'analyzeMeal') return json_(analyzeMeal_(req));
    if (req.action === 'aiDiag') return json_(aiDiag_());
    if (req.action === 'setAiKey') return json_(setAiKey_(req));
    if (req.action === 'setCloudConfig') return json_(setCloudConfig_(req));
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      switch (req.action) {
        case 'ping': return json_(ping_());
        case 'foods': return json_(readFoods_());
        case 'push': return json_(push_(req.changes || [], req.clientSchema));
        case 'pull': return json_(pull_(req.since));
        case 'saveFoods': return json_(saveFoods_(req.foods || []));
        case 'backup': return json_(backup_(req.snapshot));
        case 'meta': return json_({ ok: true, meta: readMeta_() });
        default: return json_({ ok: false, error: 'unknown action' });
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function ping_() {
  var f = hubFile_();
  var mode = hubMode_();
  var props = PropertiesService.getScriptProperties();
  return { ok: true, spreadsheet: f.getName(), spreadsheetId: hubId_(), sourceId: SOURCE_ID, verified: props.getProperty('HUB_VERIFIED') ? JSON.parse(props.getProperty('HUB_VERIFIED')) : null, mode: mode, writable: mode === 'native', scriptVersion: SCRIPT_VERSION,
    aiScanner: !!props.getProperty('GEMINI_API_KEY'), aiModel: aiModel_(),
    foodSheet: mode === 'native' ? (SpreadsheetApp.openById(hubId_()).getSheetByName('Food_Database') ? 'Food_Database' : ORIGINAL_FOOD_TAB) : ORIGINAL_FOOD_TAB,
    meta: mode === 'native' ? readMeta_() : {} };
}

/* ============================================================== helpers */

function tab_(name, header) {
  var ss = hub_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function structured_(table) {
  var def = TABLES[table];
  return tab_(def[0], def[2].concat(['updated_at', 'json']));
}

function headerOf_(sh) {
  return sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
}

function keyIndex_(sh) {
  var last = sh.getLastRow();
  var map = {};
  if (last < 2) return map;
  var keys = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) map[String(keys[i][0])] = i + 2;
  return map;
}

function readMeta_() {
  if (hubMode_() !== 'native') return {};
  var vals = tab_('Sync_Metadata', DERIVED_TABS.Sync_Metadata).getDataRange().getValues();
  var m = {};
  for (var i = 1; i < vals.length; i++) m[vals[i][0]] = vals[i][1];
  return m;
}

function setMeta_(key, value) {
  var sh = tab_('Sync_Metadata', DERIVED_TABS.Sync_Metadata);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) if (vals[i][0] === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  sh.appendRow([key, value]);
}

function verification_(notes) {
  notes = String(notes || '');
  if (/⚠|غير محقق|للمراجعة/.test(notes)) return 'unverified';
  if (/تقديري|تقريبي|estimate/i.test(notes)) return 'estimated';
  if (/USDA|FoodData/i.test(notes)) return 'verified-usda';
  return 'user';
}

/** Readable columns for a record (the json column keeps the full record for lossless round trips). */
function flatten_(table, key, p) {
  var m = p.macros || {};
  var per = p.per100 || {};
  switch (table) {
    case 'foods': return [p.foodId || key, p.nameAr || '', p.nameEn || '', p.category || '', per.kcal, per.protein, per.carbs, per.fat, per.fiber === undefined ? '' : per.fiber, per.sugar === undefined ? '' : per.sugar, per.sodium === undefined ? '' : per.sodium, p.pieceGrams || '', p.state || '', p.stateLabel || '', p.prep || '', p.source || '', verification_(p.notes), p.barcode || '', p.notes || '', p.archived ? 'no' : 'yes'];
    case 'entries': return [key, p.date, p.meal, p.foodId || '', p.recipeId || '', p.name, p.state, p.quantity, p.unit, p.grams, m.kcal, m.protein, m.carbs, m.fat, m.fiber === undefined ? '' : m.fiber];
    case 'body': return [key, p.date, n_(p.weight), n_(p.waist), n_(p.chest), n_(p.hips), n_(p.arm), n_(p.thigh), n_(p.neck), n_(p.bodyFat), p.notes || ''];
    case 'days': return [key, n_(p.waterMl), p.status || '', p.dayType || '', p.habits ? Object.keys(p.habits).filter(function (h) { return p.habits[h]; }).length : '', p.notes || ''];
    case 'recipes': return [key, p.name, p.servings, (p.perServing || {}).kcal, (p.perServing || {}).protein, (p.perServing || {}).carbs, (p.perServing || {}).fat, p.totalGrams, p.libraryId || '', p.notes || ''];
    case 'templates': return [key, p.name, (p.items || []).map(function (i) { return i.name + ' ×' + i.quantity; }).join(' | ')];
    case 'plans': return [key, p.name, p.dayType, (p.items || []).map(function (i) { return i.meal + ': ' + i.name + ' ×' + i.quantity; }).join(' | ')];
    case 'plannedDays': return [key, p.planId || '', (p.items || []).map(function (i) { return i.meal + ': ' + i.name + ' ×' + i.quantity; }).join(' | ')];
    case 'fasts': return [key, p.start ? new Date(p.start).toISOString() : '', p.end ? new Date(p.end).toISOString() : '', p.targetHours];
    case 'kv': return [key];
    case 'settings': var t = (p.targets || {}).training || {}; var pr = p.profile || {};
      return [key, pr.goalType || '', t.kcal, t.protein, t.carbs, t.fat, p.waterTargetMl, pr.currentWeight, pr.targetWeight, p.lang];
    case 'foodChanges': return [key, p.foodId, p.foodName, p.action, p.origin];
  }
  return [key];
}

function n_(v) { return v === undefined || v === null ? '' : v; }

/* ============================================================== food database */

/** Reads foods. Native: Food_Database (stable IDs) if present, else the original tab. xlsx: original tab via a temporary converted copy. */
function readFoods_() {
  if (hubMode_() === 'native') {
    var ss = SpreadsheetApp.openById(hubId_());
    var fdb = ss.getSheetByName('Food_Database');
    if (fdb && fdb.getLastRow() > 1) {
      var vals = fdb.getDataRange().getValues();
      return { ok: true, sheet: 'Food_Database', structured: true, rows: vals.map(function (r) { return r.slice(0, TABLES.foods[2].length); }) };
    }
    var orig = ss.getSheetByName(ORIGINAL_FOOD_TAB);
    if (!orig) return { ok: false, error: 'food sheet not found' };
    return { ok: true, sheet: ORIGINAL_FOOD_TAB, structured: false, rows: orig.getDataRange().getValues() };
  }
  // xlsx: convert a temporary copy, read, delete the copy. The .xlsx itself is never written.
  var tmp = Drive.Files.create({ name: 'TMP read ' + HUB_NAME, mimeType: 'application/vnd.google-apps.spreadsheet' }, hubFile_().getBlob());
  try {
    var sh = SpreadsheetApp.openById(tmp.id).getSheetByName(ORIGINAL_FOOD_TAB);
    if (!sh) return { ok: false, error: 'food sheet not found' };
    return { ok: true, sheet: ORIGINAL_FOOD_TAB, structured: false, readOnly: true, rows: sh.getDataRange().getValues() };
  } finally {
    DriveApp.getFileById(tmp.id).setTrashed(true);
  }
}

/** Copies the original food tab into Food_Database with stable IDs (F0001…). Never changes values. */
function seedFoodDatabase_() {
  var ss = hub_();
  var orig = ss.getSheetByName(ORIGINAL_FOOD_TAB);
  var fdb = structured_('foods');
  var res = { original: 0, added: 0, kept: 0, flagged: 0, zero: 0 };
  if (!orig) return res;
  var vals = orig.getDataRange().getValues();
  var h = headerMap_(vals);
  if (!h) return res;
  var byName = {};
  var existing = fdb.getLastRow() > 1 ? fdb.getRange(2, 1, fdb.getLastRow() - 1, 2).getValues() : [];
  existing.forEach(function (r) { byName[String(r[1])] = r[0]; });
  var next = existing.length + 1;
  var rows = [];
  var aliases = [];
  for (var r = h.row + 1; r < vals.length; r++) {
    var name = String(vals[r][h.map.name] || '').trim();
    if (!name) continue;
    res.original++;
    var notes = h.map.notes !== undefined ? vals[r][h.map.notes] : '';
    if (/⚠|تقديري|تقريبي|غير محقق/.test(String(notes))) res.flagged++;
    var nums = ['kcal', 'protein', 'carbs', 'fat'].map(function (k) { return Number(vals[r][h.map[k]]) || 0; });
    if (nums.every(function (x) { return x === 0; })) res.zero++;
    if (byName[name]) { res.kept++; continue; }
    var id = 'F' + ('000' + next++).slice(-4);
    byName[name] = id;
    var stateLabel = h.map.state !== undefined ? String(vals[r][h.map.state]) : '';
    var state = /نيء|ني$|جاف|raw/i.test(stateLabel) ? 'raw' : /مصنّع|محضّر|مسحوق|—|^$/.test(stateLabel) ? 'other' : 'cooked';
    var record = { foodId: id, legacyKey: name, sheetRow: r + 1, nameAr: name, nameEn: '', category: vals[r][h.map.category] || '',
      per100: { kcal: nums[0], protein: nums[1], carbs: nums[2], fat: nums[3] }, pieceGrams: Number(vals[r][h.map.piece]) || undefined,
      state: state, stateLabel: stateLabel, prep: h.map.prep !== undefined ? vals[r][h.map.prep] : '', notes: notes, source: 'sheet' };
    rows.push(flatten_('foods', id, record).concat([Date.now(), JSON.stringify(record)]));
    aliases.push([id, name.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim(), 'ar']);
    res.added++;
  }
  if (rows.length) fdb.getRange(fdb.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  if (aliases.length) { var al = tab_('Food_Aliases', DERIVED_TABS.Food_Aliases); al.getRange(al.getLastRow() + 1, 1, aliases.length, 3).setValues(aliases); }
  return res;
}

var HEADER_RES = {
  name: /^(الاسم|اسم الطعام|الطعام|name|food)/i, category: /(الفئة|التصنيف|category)/i, kcal: /(سعرات|kcal|calorie|energy)/i,
  protein: /(بروتين|protein)/i, carbs: /(كارب|كربوهيدرات|carb)/i, fat: /(دهون|fat)/i, piece: /(وزن الحبة|الحصة|serving|piece|portion)/i,
  state: /(الحالة|state|status)/i, prep: /(طريقة التحضير|التحضير|prep|method)/i, notes: /(ملاحظات|notes?|source)/i
};

function headerMap_(values) {
  for (var r = 0; r < Math.min(values.length, 15); r++) {
    var map = {};
    for (var c = 0; c < values[r].length; c++) {
      var v = String(values[r][c] || '').trim();
      if (!v) continue;
      for (var k in HEADER_RES) if (map[k] === undefined && HEADER_RES[k].test(v)) { map[k] = c; break; }
    }
    if (map.name !== undefined && map.kcal !== undefined) return { row: r, map: map };
  }
  return null;
}

/** App edits to foods (only when write-back is enabled in the app): update Food_Database rows, never the original tab. */
function saveFoods_(foods) {
  hub_();
  if (!Array.isArray(foods) || foods.length > 200) return { ok: false, error: 'invalid foods' };
  for (var i = 0; i < foods.length; i++) {
    var f = foods[i];
    if (!f || typeof f.name !== 'string' || !f.name.trim()) return { ok: false, error: 'food without name' };
    var nums = ['kcal', 'protein', 'carbs', 'fat'];
    for (var j = 0; j < nums.length; j++) if (typeof f[nums[j]] !== 'number' || f[nums[j]] < 0 || f[nums[j]] > 1000) return { ok: false, error: 'invalid value for ' + f.name };
  }
  backupOncePerDay_();
  var changes = foods.map(function (f) {
    return { table: 'foods', key: f.foodId || f.sheetKey || f.name, op: 'upsert', at: f.updatedAt || Date.now(), payload: f.record || {
      foodId: f.foodId || f.sheetKey, nameAr: f.name, category: f.category, per100: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat },
      pieceGrams: f.piece || undefined, stateLabel: f.state, prep: f.prep, notes: f.notes, updatedAt: f.updatedAt || Date.now() } };
  });
  var r = push_(changes, SCHEMA_VERSION);
  return { ok: true, updated: r.applied, conflicts: r.conflicts };
}

function backupOncePerDay_() {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAST_HUB_BACKUP') === today) return;
  backupHub_('daily before first food write-back');
  props.setProperty('LAST_HUB_BACKUP', today);
}

/* ============================================================== sync */

function validChange_(c) {
  if (!c || !TABLES[c.table]) return false;
  if (typeof c.key !== 'string' || !c.key || c.key.length > MAX_KEY_CHARS) return false;
  if (c.op !== 'upsert' && c.op !== 'delete') return false;
  if (c.op === 'upsert') {
    if (!c.payload || typeof c.payload !== 'object' || Array.isArray(c.payload)) return false;
    if (JSON.stringify(c.payload).length > MAX_PAYLOAD_CHARS) return false;
    if (c.table === 'entries' && (typeof c.payload.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.payload.date) || typeof (c.payload.macros || {}).kcal !== 'number')) return false;
    if (c.table === 'body' && c.payload.weight !== undefined && (typeof c.payload.weight !== 'number' || c.payload.weight < 20 || c.payload.weight > 400)) return false;
  }
  return true;
}

/** Applies app changes. Older-than-stored upserts are rejected and reported as conflicts. */
function push_(changes, clientSchema) {
  hub_();
  if (!Array.isArray(changes)) return { ok: false, error: 'invalid changes' };
  if (changes.length > MAX_CHANGES) return { ok: false, error: 'too many changes in one request' };
  var invalid = changes.filter(function (c) { return !validChange_(c); }).length;
  if (invalid) return { ok: false, error: invalid + ' invalid change(s) rejected' };
  var byTable = {};
  changes.forEach(function (c) { (byTable[c.table] = byTable[c.table] || []).push(c); });
  var applied = 0;
  var conflicts = [];
  var trash = tab_('Deleted_Records', DERIVED_TABS.Deleted_Records);
  Object.keys(byTable).forEach(function (table) {
    var sh = structured_(table);
    var width = TABLES[table][2].length + 2;
    var idx = keyIndex_(sh);
    var deletes = [];
    var appends = [];
    byTable[table].forEach(function (c) {
      var row = idx[String(c.key)];
      if (c.op === 'delete') {
        if (row) {
          trash.appendRow([table, c.key, new Date().toISOString(), sh.getRange(row, width).getValue(), 'no']);
          deletes.push(row);
        }
        return;
      }
      var p = c.payload;
      var incoming = Number(p.updatedAt || p.at || c.at || 0);
      if (row) {
        var stored = Number(sh.getRange(row, width - 1).getValue() || 0);
        if (stored > incoming) { conflicts.push({ table: table, key: c.key }); return; }
      }
      var values = flatten_(table, String(c.key), p).concat([incoming, JSON.stringify(p)]);
      if (row) sh.getRange(row, 1, 1, width).setValues([values]);
      else { appends.push(values); idx[String(c.key)] = -1; }
      applied++;
    });
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, width).setValues(appends);
    deletes.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); applied++; });
  });
  if (byTable.body || byTable.days) refreshDerived_();
  if (byTable.recipes) refreshRecipeIngredients_();
  if (byTable.kv) refreshShopping_();
  var version = Number(readMeta_().dataVersion || 0);
  if (applied) {
    version++;
    setMeta_('dataVersion', version);
    setMeta_('lastWriteAt', new Date().toISOString());
    if (clientSchema) setMeta_('appSchemaVersion', clientSchema);
  }
  setMeta_('lastSyncAt', new Date().toISOString());
  setMeta_('lastConflicts', conflicts.length);
  return { ok: true, applied: applied, conflicts: conflicts, dataVersion: version };
}

/** Rebuilds the simple readable logs (Weight_Log, Water_Log, Habits_Log) from the app-owned tables. */
function refreshDerived_() {
  var body = structured_('body').getDataRange().getValues().slice(1);
  var w = body.filter(function (r) { return r[2] !== ''; }).map(function (r) { return [r[1], r[2], r[10]]; }).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
  writeTable_('Weight_Log', DERIVED_TABS.Weight_Log, w);
  var days = structured_('days').getDataRange().getValues().slice(1);
  var width = TABLES.days[2].length + 2;
  writeTable_('Water_Log', DERIVED_TABS.Water_Log, days.filter(function (r) { return r[1] !== ''; }).map(function (r) { return [r[0], r[1]]; }));
  var habits = [];
  days.forEach(function (r) {
    try { var rec = JSON.parse(r[width - 1]); Object.keys(rec.habits || {}).forEach(function (h) { habits.push([rec.date, h, rec.habits[h] ? 'yes' : 'no']); }); } catch (e) { /* skip */ }
  });
  writeTable_('Habits_Log', DERIVED_TABS.Habits_Log, habits);
}

function jsonRows_(table) {
  var sh = structured_(table);
  var width = TABLES[table][2].length + 2;
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, width, sh.getLastRow() - 1, 1).getValues().map(function (v) { try { return JSON.parse(v[0]); } catch (e) { return null; } }).filter(Boolean);
}

/** Recipe_Ingredients: one row per ingredient of every recipe (readable relation recipe_id → food_id). */
function refreshRecipeIngredients_() {
  var rows = [];
  jsonRows_('recipes').forEach(function (r) {
    (r.ingredients || []).forEach(function (i) {
      var m = i.macros || {};
      rows.push([r.id, i.foodId, i.name, i.quantity, i.unit, i.grams, m.kcal, m.protein, m.carbs, m.fat]);
    });
  });
  writeTable_('Recipe_Ingredients', DERIVED_TABS.Recipe_Ingredients, rows);
}

/** Shopping_List: checked items per week (from the app's shopping-list state). */
function refreshShopping_() {
  var rows = [];
  jsonRows_('kv').forEach(function (k) {
    if (String(k.key).indexOf('shopping:') !== 0 || !Array.isArray(k.value)) return;
    k.value.forEach(function (item) { rows.push([String(k.key).slice(9), item, 'yes']); });
  });
  writeTable_('Shopping_List', DERIVED_TABS.Shopping_List, rows);
}

function writeTable_(name, header, rows) {
  var sh = tab_(name, header);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, header.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
}

/** Returns records (optionally only those changed since a timestamp — incremental pull). */
function pull_(since) {
  var tables = {};
  if (hubMode_() !== 'native') return { ok: true, tables: tables, meta: {}, readOnly: true };
  var ss = SpreadsheetApp.openById(hubId_());
  Object.keys(TABLES).forEach(function (t) {
    var sh = ss.getSheetByName(TABLES[t][0]);
    var width = TABLES[t][2].length + 2;
    if (!sh || sh.getLastRow() < 2) { tables[t] = []; return; }
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
    tables[t] = vals.filter(function (v) { return !since || Number(v[width - 2]) > Number(since); })
      .map(function (v) { try { return JSON.parse(v[width - 1]); } catch (e) { return null; } }).filter(Boolean);
  });
  return { ok: true, tables: tables, meta: readMeta_() };
}

function backup_(snapshot) {
  if (!snapshot || snapshot.format !== 'mego-nutrition-backup') return { ok: false, error: 'invalid backup' };
  var folders = DriveApp.getFoldersByName('MEGO Nutrition Backups');
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('MEGO Nutrition Backups');
  var name = 'mego-backup-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss') + '.json';
  var file = folder.createFile(name, JSON.stringify(snapshot), MimeType.PLAIN_TEXT);
  logBackup_('app-snapshot', name, 'ok', 'tables: ' + Object.keys(snapshot.tables || {}).join(','));
  return { ok: true, file: file.getName(), url: file.getUrl() };
}

/* ============================================================== dashboard */

/** «MEGO Nutrition Hub» dashboard tab: formulas over the structured tabs (no merged cells in data tabs). */
function buildDashboard_() {
  var ss = hub_();
  var sh = ss.getSheetByName('Hub_Dashboard') || ss.insertSheet('Hub_Dashboard', 0);
  sh.clear();
  var rows = [
    ['MEGO Nutrition Hub', ''],
    ['', ''],
    ['اليوم / Today', '=TODAY()'],
    ['سعرات اليوم / Calories today', '=SUMIFS(Food_Log!K:K,Food_Log!B:B,TEXT(TODAY(),"yyyy-mm-dd"))'],
    ['بروتين اليوم / Protein today (g)', '=SUMIFS(Food_Log!L:L,Food_Log!B:B,TEXT(TODAY(),"yyyy-mm-dd"))'],
    ['كارب اليوم / Carbs today (g)', '=SUMIFS(Food_Log!M:M,Food_Log!B:B,TEXT(TODAY(),"yyyy-mm-dd"))'],
    ['دهون اليوم / Fat today (g)', '=SUMIFS(Food_Log!N:N,Food_Log!B:B,TEXT(TODAY(),"yyyy-mm-dd"))'],
    ['هدف السعرات / Calorie target', '=IFERROR(INDEX(Settings_App!C:C,MATCH("main",Settings_App!A:A,0)),"")'],
    ['هدف البروتين / Protein target', '=IFERROR(INDEX(Settings_App!D:D,MATCH("main",Settings_App!A:A,0)),"")'],
    ['ماء اليوم / Water today (ml)', '=IFERROR(VLOOKUP(TEXT(TODAY(),"yyyy-mm-dd"),Water_Log!A:B,2,FALSE),0)'],
    ['آخر وزن / Latest weight (kg)', '=IFERROR(INDEX(SORT(FILTER(Weight_Log!A2:B,Weight_Log!B2:B<>""),1,FALSE),1,2),"")'],
    ['متوسط وزن 7 أيام / 7-day avg weight', '=IFERROR(AVERAGEIFS(Weight_Log!B:B,Weight_Log!A:A,">="&TEXT(TODAY()-6,"yyyy-mm-dd")),"")'],
    ['عدد الأطعمة / Foods in database', '=COUNTA(Food_Database!A2:A)'],
    ['سجلات اليوميات / Diary records', '=COUNTA(Food_Log!A2:A)'],
    ['آخر مزامنة / Last sync', '=IFERROR(VLOOKUP("lastSyncAt",Sync_Metadata!A:B,2,FALSE),"—")'],
    ['إصدار البيانات / Data version', '=IFERROR(VLOOKUP("dataVersion",Sync_Metadata!A:B,2,FALSE),0)'],
    ['تعارضات آخر مزامنة / Conflicts (last sync)', '=IFERROR(VLOOKUP("lastConflicts",Sync_Metadata!A:B,2,FALSE),0)'],
    ['آخر نسخة احتياطية / Last backup', '=IFERROR(INDEX(Backup_Log!A:A,COUNTA(Backup_Log!A:A)),"—")'],
    ['', ''],
    ['السعرات اليومية (14 يوم) / Daily calories (14 days)', ''],
    ['التاريخ / Date', 'السعرات / kcal']
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  var start = rows.length + 1;
  var series = [];
  for (var i = 13; i >= 0; i--) series.push(['=TEXT(TODAY()-' + i + ',"yyyy-mm-dd")', '=SUMIFS(Food_Log!K:K,Food_Log!B:B,A' + (start + 13 - i) + ')']);
  sh.getRange(start, 1, series.length, 2).setValues(series);
  sh.getRange('A1').setFontSize(18).setFontWeight('bold');
  sh.setColumnWidth(1, 320);
  sh.setColumnWidth(2, 160);
  try {
    sh.getCharts().forEach(function (c) { sh.removeChart(c); });
    sh.insertChart(sh.newChart().asColumnChart().addRange(sh.getRange(start, 1, 14, 2)).setPosition(2, 4, 0, 0).setOption('title', 'Daily calories').build());
    var w = ss.getSheetByName('Weight_Log');
    if (w) sh.insertChart(sh.newChart().asLineChart().addRange(w.getRange('A1:B400')).setPosition(22, 4, 0, 0).setOption('title', 'Weight').build());
  } catch (e) { /* charts are optional */ }
}

/* ============================================================== AI meal scanner (Gemini API free tier) */
/*
 * FREE ONLY: calls Google's Gemini API with a key created in Google AI Studio WITHOUT a billing account.
 * A key without billing can only use the free tier — it cannot be charged. There is NO fallback model and NO paid
 * model: only the free-tier Flash models in AI_FREE_MODELS can be used. When the free quota is used up, Google
 * answers 429 and the app shows when it resets; nothing is retried on another service.
 *
 * The app sends: a downscaled JPEG (EXIF/location removed on the phone), the list of YOUR food names (short key,
 * names, state, category — no diary, weight or profile data) and an optional note. Note: on the free tier Google may
 * use requests to improve its products and human reviewers may see them (disconnected from your account), so the
 * request contains only the meal photo and food names. The model only identifies foods, estimates grams and picks
 * the matching database row; the app computes all nutrition values from your database. Nothing is saved here.
 * Script Properties: GEMINI_API_KEY (set from the app), optional AI_MODEL (one of AI_FREE_MODELS), AI_DAILY_LIMIT (default 40).
 */
var AI_FREE_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
var AI_DEFAULT_MODEL = 'gemini-3.8-flash';
var AI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
var AI_MAX_IMAGE_CHARS = 2800000; // ≈ 2 MB JPEG as base64
var AI_MAX_FOODS = 800;

function aiModel_() {
  var m = PropertiesService.getScriptProperties().getProperty('AI_MODEL');
  return AI_FREE_MODELS.indexOf(m) >= 0 ? m : AI_DEFAULT_MODEL;
}

var AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_food', 'meal_name_ar', 'meal_name_en', 'notes', 'items'],
  properties: {
    is_food: { type: 'boolean' },
    meal_name_ar: { type: 'string' },
    meal_name_en: { type: 'string' },
    notes: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name_ar', 'name_en', 'food_key', 'grams', 'grams_low', 'grams_high', 'state', 'cooking_method', 'kind', 'confidence', 'reason', 'est_per100'],
        properties: {
          name_ar: { type: 'string' },
          name_en: { type: 'string' },
          food_key: { type: 'string' },
          grams: { type: 'number' },
          grams_low: { type: 'number' },
          grams_high: { type: 'number' },
          state: { type: 'string', enum: ['raw', 'cooked', 'other'] },
          cooking_method: { type: 'string', enum: ['none', 'grilled', 'fried', 'deep_fried', 'air_fried', 'boiled', 'steamed', 'baked', 'roasted', 'sauteed', 'stewed', 'unknown'] },
          kind: { type: 'string', enum: ['food', 'oil_or_fat', 'sauce_or_dressing', 'drink'] },
          confidence: { type: 'number' },
          reason: { type: 'string' },
          est_per100: {
            type: 'object',
            additionalProperties: false,
            required: ['kcal', 'protein', 'carbs', 'fat'],
            properties: { kcal: { type: 'number' }, protein: { type: 'number' }, carbs: { type: 'number' }, fat: { type: 'number' } }
          }
        }
      }
    }
  }
};

var AI_SYSTEM = [
  'You analyse a photo of a meal for a personal nutrition diary. Identify every visible food and ingredient, including',
  'cooking oil, butter, sauces and dressings that are visible or very likely (for example shiny fried food).',
  'For each item estimate the edible weight in grams AS SHOWN in the photo (cooked weight for cooked food), with a',
  'realistic low-high range. You cannot weigh food: use plate/utensil/hand size cues and be honest about uncertainty.',
  'Decide whether each item is raw, cooked or other (prepared/processed), and the cooking method.',
  '',
  'Matching to the user database (provided as lines "key | Arabic name | English name | state | category"):',
  '- Set food_key to the key of the database row that is the SAME food in the SAME state (cooked rice must match a',
  '  cooked rice row, never a raw/dry rice row). Prefer the row whose preparation matches (grilled vs fried).',
  '- If no row is the same food in the same state, set food_key to "" — never force a wrong match, never convert',
  '  between raw and cooked.',
  '- Only when food_key is "" fill est_per100 with your best typical per-100 g values for the food as shown;',
  '  when food_key is set, put zeros in est_per100 (the app uses the database values).',
  '',
  'confidence is 0..1 for identification and portion together. Use below 0.6 for anything hidden, mixed, or hard to',
  'judge (sauces, oil quantity, fillings of sandwiches, restaurant portions). reason: one short sentence explaining',
  'the match or what is uncertain, written in the user language. Names: name_ar in Arabic, name_en in English.',
  'Split mixed dishes into their main components when they are visibly separable; otherwise one item for the dish.',
  'If the photo does not show food, return is_food=false and no items. Do not include people, places or any other',
  'details from the photo in the output.'
].join('\n');

/**
 * Maps a Gemini error response to a precise app error. Google's own status/message are returned in `google`
 * (never the key) so the real cause is visible in the app instead of one generic "busy" message.
 *   temporary (retried): AI_OVERLOADED (503 UNAVAILABLE), AI_SERVER_ERROR (500 INTERNAL), AI_TIMEOUT (504 DEADLINE_EXCEEDED)
 *   not retried: AI_QUOTA_MINUTE / AI_QUOTA_DAY (429), AI_KEY_INVALID (401/403), AI_REGION, AI_MODEL_UNAVAILABLE (404),
 *                AI_BAD_IMAGE (400 about the image), AI_CONFIG (other 400 — a request/configuration problem)
 */
function aiError_(code, text) {
  var err = {};
  try { err = JSON.parse(text).error || {}; } catch (e) { /* not JSON */ }
  var msg = String(err.message || '').slice(0, 300);
  var google = { http: code, status: String(err.status || ''), message: msg };
  var r = function (error, extra) { var o = { ok: false, error: error, google: google }; for (var k in extra) o[k] = extra[k]; return o; };
  if (code === 429) {
    if (/PerDay|per day|daily/i.test(text)) return r('AI_QUOTA_DAY');
    var m = /"retryDelay"\s*:\s*"(\d+)/.exec(text);
    return r('AI_QUOTA_MINUTE', { retryAfter: m ? Number(m[1]) : 60 });
  }
  if (/location is not supported|not available in your country/i.test(msg)) return r('AI_REGION');
  if (code === 401 || code === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(text)) return r('AI_KEY_INVALID');
  if (code === 404) return r('AI_MODEL_UNAVAILABLE');
  if (code === 503 || google.status === 'UNAVAILABLE') return r('AI_OVERLOADED');
  if (code === 504 || google.status === 'DEADLINE_EXCEEDED') return r('AI_TIMEOUT');
  if (code >= 500) return r('AI_SERVER_ERROR');
  if (code === 400 && /image|inline_?data|mime|base64/i.test(msg)) return r('AI_BAD_IMAGE');
  if (code === 400) return r('AI_CONFIG');
  return r('AI_HTTP_' + code);
}
var AI_TEMPORARY = ['AI_OVERLOADED', 'AI_SERVER_ERROR', 'AI_TIMEOUT', 'AI_NETWORK'];

/**
 * One generateContent call with retries: temporary errors are retried with exponential backoff (2 s, 4 s) on the
 * same model (except 503 overloaded, which moves on at once); if the model stays failing, the next FREE Flash model in AI_FREE_MODELS is tried (same
 * provider, same free tier — never a paid model). Returns { ok, model, out } or the last mapped error with `tried`.
 */
function geminiGenerate_(key, body, deadlineMs) {
  var first = aiModel_();
  var models = [first].concat(AI_FREE_MODELS.filter(function (m) { return m !== first; }));
  var started = Date.now(), last = null, tried = [];
  for (var i = 0; i < models.length; i++) {
    var model = models[i];
    // thinkingLevel is a Gemini 3 Flash setting; the Lite fallback runs without it
    var b = JSON.parse(JSON.stringify(body));
    if (/lite/.test(model) && b.generationConfig) delete b.generationConfig.thinkingConfig;
    for (var attempt = 0; attempt < 3; attempt++) {
      if (Date.now() - started > deadlineMs) { last = last || { ok: false, error: 'AI_TIMEOUT' }; last.tried = tried; return last; }
      var res;
      try {
        res = UrlFetchApp.fetch(AI_BASE + model + ':generateContent', {
          method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: JSON.stringify(b), muteHttpExceptions: true
        });
      } catch (e) {
        last = { ok: false, error: 'AI_NETWORK', detail: String((e && e.message) || e).slice(0, 200) };
        tried.push(model + ':network');
        Utilities.sleep(2000 * Math.pow(2, attempt));
        continue;
      }
      var code = res.getResponseCode();
      if (code === 200) return { ok: true, model: model, out: JSON.parse(res.getContentText()), tried: tried };
      last = aiError_(code, res.getContentText());
      tried.push(model + ':' + code);
      console.warn('Gemini ' + model + ' → ' + code + ' ' + (last.google ? last.google.status + ' ' + last.google.message : ''));
      if (AI_TEMPORARY.indexOf(last.error) < 0) { last.tried = tried; return last; } // quota, key, config: never retried
      // "overloaded" (503) is per model and lasts minutes (seen live: 3 × 503 in a row, ~20 s each), so waiting on the
      // same model only costs time: go straight to the next free model. Other temporary errors keep the backoff.
      if (last.error === 'AI_OVERLOADED' && i < models.length - 1) break;
      if (attempt < 2) Utilities.sleep(2000 * Math.pow(2, attempt));
    }
  }
  last.tried = tried;
  return last;
}

/** Diagnostic: a tiny text-only request to every free model (no image). Shows Google's exact answer per model. */
function aiDiag_() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'AI_NOT_CONFIGURED' };
  return { ok: true, scriptVersion: SCRIPT_VERSION, configuredModel: aiModel_(), models: AI_FREE_MODELS.map(function (m) {
    var t0 = Date.now(), res;
    try {
      res = UrlFetchApp.fetch(AI_BASE + m + ':generateContent', { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
        payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], generationConfig: { maxOutputTokens: 20 } }), muteHttpExceptions: true });
    } catch (e) { return { model: m, error: 'AI_NETWORK', ms: Date.now() - t0 }; }
    var code = res.getResponseCode();
    var r = code === 200 ? { ok: true } : aiError_(code, res.getContentText());
    return { model: m, http: code, error: r.error || null, google: r.google || null, ms: Date.now() - t0 };
  }) };
}

/** Stores the Gemini key in Script Properties after checking it with Google (a metadata call, not a generation). */
function setAiKey_(req) {
  var key = String(req.key || '').trim();
  var props = PropertiesService.getScriptProperties();
  if (req.remove === true) { props.deleteProperty('GEMINI_API_KEY'); return { ok: true, aiScanner: false }; }
  // classic keys (AIza…) and Google's newer auth keys (AQ.…); Google itself validates the key just below
  if (!/^[A-Za-z0-9_.\-]{20,200}$/.test(key)) return { ok: false, error: 'AI_KEY_INVALID' };
  var res;
  try {
    res = UrlFetchApp.fetch(AI_BASE + aiModel_(), { method: 'get', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
  } catch (e) {
    return { ok: false, error: 'AI_NETWORK' };
  }
  if (res.getResponseCode() !== 200) return aiError_(res.getResponseCode(), res.getContentText());
  props.setProperty('GEMINI_API_KEY', key);
  return { ok: true, aiScanner: true, aiModel: aiModel_() };
}

function analyzeMeal_(req) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'AI_NOT_CONFIGURED' };
  var img = String(req.image || '');
  var mediaType = req.mediaType === 'image/png' || req.mediaType === 'image/webp' ? req.mediaType : 'image/jpeg';
  if (!img || img.length > AI_MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(img)) return { ok: false, error: 'AI_BAD_IMAGE' };
  var foods = Array.isArray(req.foods) ? req.foods.slice(0, AI_MAX_FOODS) : [];
  var lines = foods.map(function (f) {
    return [f.k, f.ar, f.en, f.s, f.c].map(function (x) { return String(x == null ? '' : x).replace(/[|\n\r]/g, ' ').slice(0, 120); }).join(' | ');
  });
  var lang = req.lang === 'en' ? 'English' : 'Arabic';
  var note = String(req.note || '').replace(/[\r\n]+/g, ' ').slice(0, 300);

  // Own daily cap (in addition to Google's free quota) — keeps usage predictable.
  var limit = Number(props.getProperty('AI_DAILY_LIMIT')) || 40;
  var day = new Date().toISOString().slice(0, 10);
  var used = props.getProperty('AI_USED_' + day);
  if (Number(used) >= limit) return { ok: false, error: 'AI_DAILY_LIMIT' };

  var userText = 'User language: ' + lang + '.\n' + (note ? 'User note about this meal: ' + note + '\n' : '') +
    '\nUser food database (' + lines.length + ' rows):\n' + lines.join('\n') + '\n\nAnalyse the meal in the photo.';
  var body = {
    systemInstruction: { parts: [{ text: AI_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mediaType, data: img } }, { text: userText }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: AI_SCHEMA, maxOutputTokens: 8192, temperature: 0.2,
      thinkingConfig: { thinkingLevel: 'MEDIUM' } }
  };
  var g = geminiGenerate_(key, body, 240000);
  if (!g.ok) { if (req._refund) req._refund(); return g; } // failed requests do not use up the daily allowance
  props.setProperty('AI_USED_' + day, String((Number(used) || 0) + 1));
  var model = g.model;
  var out = g.out;
  if (out.promptFeedback && out.promptFeedback.blockReason) return { ok: false, error: 'AI_REFUSED' };
  var cand = (out.candidates || [])[0];
  if (!cand) return { ok: false, error: 'AI_BAD_OUTPUT' };
  if (cand.finishReason === 'MAX_TOKENS') return { ok: false, error: 'AI_TRUNCATED' };
  if (cand.finishReason && cand.finishReason !== 'STOP') return { ok: false, error: 'AI_REFUSED' };
  var t = ((cand.content || {}).parts || []).filter(function (p) { return typeof p.text === 'string' && !p.thought; }).map(function (p) { return p.text; }).join('');
  var result;
  try { result = JSON.parse(t); } catch (e) { return { ok: false, error: 'AI_BAD_OUTPUT' }; }
  return { ok: true, model: model, result: result, tried: g.tried };
}

/* ============================================================== public accounts (Firebase) — AI proxy */
/*
 * Script Properties: FIREBASE_API_KEY, FIREBASE_PROJECT_ID (public identifiers of the Firebase project),
 * AI_USER_DAILY_LIMIT (default 10 scans per user per day), AI_DAILY_LIMIT (global, default 40).
 * The ID token is verified by Google (Identity Toolkit). The account status and country are read from Firestore
 * WITH THE USER'S OWN TOKEN, so the security rules apply exactly as in the app. Nothing about the meal is stored.
 */
var AI_RESTRICTED = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','CH','GB'];

function verifyFirebaseUser_(idToken) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('FIREBASE_API_KEY');
  if (!key) return { ok: false, error: 'CLOUD_NOT_CONFIGURED' };
  var r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: String(idToken) }), muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) return { ok: false, error: 'unauthorized' };
  var u = (JSON.parse(r.getContentText()).users || [])[0];
  if (!u || u.disabled) return { ok: false, error: 'unauthorized' };
  return { ok: true, uid: u.localId };
}

function firestoreGet_(path, idToken) {
  var project = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID');
  var r = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents/' + path, {
    method: 'get', headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true
  });
  return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
}

function publicAi_(req) {
  var v = verifyFirebaseUser_(req.idToken);
  if (!v.ok) return v;
  if (req.action === 'aiStats') return aiStats_(v.uid, req.idToken);
  if (req.action === 'aiDiag') { var pf = firestoreGet_('profiles/' + v.uid, req.idToken); if (!pf) return { ok: false, error: 'unauthorized' }; return aiDiag_(); }
  var profile = firestoreGet_('profiles/' + v.uid, req.idToken);
  var f = (profile && profile.fields) || {};
  if (!profile || (f.status && f.status.stringValue) !== 'active') return { ok: false, error: 'unauthorized' };
  var country = (f.country && f.country.stringValue) || '';
  if (AI_RESTRICTED.indexOf(country) >= 0) return { ok: false, error: 'AI_REGION_RESTRICTED' };
  var props = PropertiesService.getScriptProperties();
  var day = new Date().toISOString().slice(0, 10);
  var perUser = Number(props.getProperty('AI_USER_DAILY_LIMIT')) || 10;
  var ukey = 'AI_U_' + day + '_' + v.uid;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var used = Number(props.getProperty(ukey)) || 0;
    if (used >= perUser) return { ok: false, error: 'AI_USER_LIMIT', limit: perUser };
    props.setProperty(ukey, String(used + 1));
  } finally { lock.releaseLock(); }
  req._refund = function () { // a failed analysis does not count against the user's daily scans
    var l = LockService.getScriptLock(); l.waitLock(10000);
    try { var n = Number(props.getProperty(ukey)) || 0; if (n > 0) props.setProperty(ukey, String(n - 1)); } finally { l.releaseLock(); }
  };
  return analyzeMeal_(req); // global cap, Gemini call and error mapping are shared with the owner path
}

/** Admin-only usage figures (counts only — no user content). Admin = /admins/{uid} readable with the user's token. */
function aiStats_(uid, idToken) {
  if (!firestoreGet_('admins/' + uid, idToken)) return { ok: false, error: 'unauthorized' };
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    var users = Object.keys(all).filter(function (k) { return k.indexOf('AI_U_' + d + '_') === 0; }).length;
    days.push({ date: d, scans: Number(all['AI_USED_' + d]) || 0, users: users });
  }
  return { ok: true, model: aiModel_(), configured: !!all.GEMINI_API_KEY, globalLimit: Number(all.AI_DAILY_LIMIT) || 40, userLimit: Number(all.AI_USER_DAILY_LIMIT) || 10, days: days };
}

/** Daily clean-up of old per-user counters (optional time trigger). */
function cleanupAiCounters() {
  var props = PropertiesService.getScriptProperties();
  var keep = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
  Object.keys(props.getProperties()).forEach(function (k) {
    var m = /^AI_(?:U_|USED_)(\d{4}-\d{2}-\d{2})/.exec(k);
    if (m && m[1] < keep) props.deleteProperty(k);
  });
}

/** Owner-only (app token): stores the PUBLIC Firebase identifiers and the per-user / global AI limits. */
function setCloudConfig_(req) {
  var props = PropertiesService.getScriptProperties();
  if (!/^[A-Za-z0-9_\-]{20,100}$/.test(String(req.apiKey || '')) || !/^[a-z0-9\-]{4,40}$/.test(String(req.projectId || ''))) return { ok: false, error: 'invalid config' };
  props.setProperty('FIREBASE_API_KEY', String(req.apiKey));
  props.setProperty('FIREBASE_PROJECT_ID', String(req.projectId));
  if (req.userLimit) props.setProperty('AI_USER_DAILY_LIMIT', String(Math.max(1, Math.min(50, Number(req.userLimit) || 10))));
  if (req.globalLimit) props.setProperty('AI_DAILY_LIMIT', String(Math.max(1, Math.min(1500, Number(req.globalLimit) || 200))));
  return { ok: true };
}
