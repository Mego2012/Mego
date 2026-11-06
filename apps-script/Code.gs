/**
 * MEGO Nutrition Hub — Google Apps Script backend (v3).
 *
 * ONE SOURCE OF TRUTH: this script only ever opens the spreadsheet whose ID is HUB_ID below.
 * It is a standalone script (script.google.com → New project), so it does not depend on which
 * spreadsheet it is attached to, and it never falls back to another file.
 *
 * Modes
 *  - native : HUB_ID is a native Google Sheet → full two-way sync into structured tabs.
 *  - xlsx   : HUB_ID is an Excel file stored in Drive (Office mode) → READ-ONLY. Food data is read through a
 *             temporary converted copy that is deleted immediately; nothing is ever written to the .xlsx.
 *             Run convertHubToGoogleSheets() (after you approve it) to enable full sync.
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
 */

var HUB_ID = '1mxqBI9_oiXCVpta2aRCDutYh9as_2NuI';
var HUB_NAME = 'MEGO Nutrition Hub';
var SCRIPT_VERSION = 4;
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
  Logger.log('Hub: ' + HUB_ID + ' (' + hubMode_() + ')');
  Logger.log('APP TOKEN (paste into the app, keep private): ' + token);
  return token;
}

function rotateToken() {
  PropertiesService.getScriptProperties().deleteProperty('APP_TOKEN');
  return setup();
}

function hubFile_() { return DriveApp.getFileById(HUB_ID); }

function hubMode_() {
  var mt = hubFile_().getMimeType();
  return mt === 'application/vnd.google-apps.spreadsheet' ? 'native' : 'xlsx';
}

function hub_() {
  if (hubMode_() !== 'native') throw new Error('HUB_IS_XLSX: the Hub is an Excel file; run convertHubToGoogleSheets() to enable writing');
  return SpreadsheetApp.openById(HUB_ID);
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
 * ONLY with your approval: makes a native Google Sheets version of the Excel Hub (Google gives it a new ID —
 * an .xlsx file cannot become native in place). The original .xlsx is kept completely untouched as the backup.
 * (On a phone it is simpler to convert in the Google Sheets app: ⋮ → Save as Google Sheets.)
 * After running it, put the new ID in HUB_ID and redeploy.
 */
function convertHubToGoogleSheets() {
  if (hubMode_() === 'native') return 'Already native';
  var blob = hubFile_().getBlob();
  var file = Drive.Files.create({ name: HUB_NAME, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [hubFile_().getParents().next().getId()] }, blob);
  // The original .xlsx is left completely untouched (not renamed, not edited) as the backup.
  Logger.log('NEW NATIVE HUB ID: ' + file.id + ' — set HUB_ID to this value and redeploy.');
  return file.id;
}

/* ============================================================== web app */

function doGet() {
  return json_({ ok: true, app: 'mego-nutrition', version: SCRIPT_VERSION });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
    if (!token || typeof req.token !== 'string' || req.token !== token) return json_({ ok: false, error: 'unauthorized' });
    // AI meal analysis never touches the spreadsheet, so it runs outside the lock (it can take ~10-40 s).
    if (req.action === 'analyzeMeal') return json_(analyzeMeal_(req));
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
  return { ok: true, spreadsheet: f.getName(), spreadsheetId: HUB_ID, mode: mode, writable: mode === 'native', scriptVersion: SCRIPT_VERSION,
    aiScanner: !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY'),
    foodSheet: mode === 'native' ? (SpreadsheetApp.openById(HUB_ID).getSheetByName('Food_Database') ? 'Food_Database' : ORIGINAL_FOOD_TAB) : ORIGINAL_FOOD_TAB,
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
    var ss = SpreadsheetApp.openById(HUB_ID);
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
  var ss = SpreadsheetApp.openById(HUB_ID);
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

/* ============================================================== AI meal scanner */
/*
 * The app sends: a downscaled JPEG (EXIF-free, re-encoded on the phone), the list of foods in YOUR database
 * (short key, names, state, category — no diary, weight or profile data) and an optional note you typed.
 * The Claude API key lives ONLY in Script Properties (ANTHROPIC_API_KEY) — never in the app or on GitHub.
 * The model only identifies foods, estimates grams and picks the matching database row; the app computes all
 * nutrition values from your database. Nothing is saved here: the result is returned to the phone for review.
 * Optional Script Properties: AI_MODEL (default claude-opus-5-5), AI_EFFORT (default medium), AI_DAILY_LIMIT (default 40).
 */
var AI_ENDPOINT = 'https://api.anthropic.com/v1/messages';
var AI_DEFAULT_MODEL = 'claude-opus-5-5';
var AI_MAX_IMAGE_CHARS = 2800000; // ≈ 2 MB JPEG as base64
var AI_MAX_FOODS = 800;

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

function analyzeMeal_(req) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ANTHROPIC_API_KEY');
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

  // Simple daily cap to protect your API budget.
  var limit = Number(props.getProperty('AI_DAILY_LIMIT')) || 40;
  var day = new Date().toISOString().slice(0, 10);
  var used = props.getProperty('AI_USED_' + day);
  if (Number(used) >= limit) return { ok: false, error: 'AI_DAILY_LIMIT' };

  var userText = 'User language: ' + lang + '.\n' + (note ? 'User note about this meal: ' + note + '\n' : '') +
    '\nUser food database (' + lines.length + ' rows):\n' + lines.join('\n') + '\n\nAnalyse the meal in the photo.';
  var body = {
    model: props.getProperty('AI_MODEL') || AI_DEFAULT_MODEL,
    max_tokens: 16000,
    system: AI_SYSTEM,
    output_config: { effort: props.getProperty('AI_EFFORT') || 'medium', format: { type: 'json_schema', schema: AI_SCHEMA } },
    fallbacks: 'default',
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: img } },
      { type: 'text', text: userText }
    ] }]
  };
  var res;
  try {
    res = UrlFetchApp.fetch(AI_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (e) {
    return { ok: false, error: 'AI_NETWORK', detail: String((e && e.message) || e).slice(0, 200) };
  }
  props.setProperty('AI_USED_' + day, String((Number(used) || 0) + 1));
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code !== 200) {
    var msg = '';
    try { msg = (JSON.parse(text).error || {}).message || ''; } catch (e) { /* not JSON */ }
    var kind = code === 401 || code === 403 ? 'AI_KEY_INVALID' : code === 429 || code === 529 ? 'AI_BUSY' : 'AI_HTTP_' + code;
    return { ok: false, error: kind, detail: String(msg).slice(0, 200) };
  }
  var out = JSON.parse(text);
  if (out.stop_reason === 'refusal') return { ok: false, error: 'AI_REFUSED' };
  if (out.stop_reason === 'max_tokens') return { ok: false, error: 'AI_TRUNCATED' };
  var t = (out.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  var result;
  try { result = JSON.parse(t); } catch (e) { return { ok: false, error: 'AI_BAD_OUTPUT' }; }
  return { ok: true, model: out.model, result: result };
}
