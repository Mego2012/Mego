/**
 * Mego Nutrition — Google Apps Script backend.
 *
 * Bind this script to your nutrition spreadsheet (Extensions → Apps Script), paste this file,
 * run `setup()` once, then Deploy → New deployment → Web app
 *   Execute as: Me    Who has access: Anyone
 * Copy the /exec URL and the token printed by setup() into the app (Settings → Google Sheets sync).
 *
 * Safety rules implemented here:
 *  - The original food tab is READ-ONLY unless the app enables "write food edits to sheet".
 *  - Before the first write to the food tab each day, the tab is copied to BACKUP_Foods_<date>.
 *  - setup() makes a full copy of the spreadsheet in Drive before anything else.
 *  - Every write to the food tab is recorded in APP_FoodSheetLog (before/after).
 *  - App data lives only in tabs prefixed APP_ (one JSON record per row).
 *  - Every request is validated (table whitelist, key/payload size, record shape).
 *  - Conflict detection: an upsert older than the stored record is rejected and reported back,
 *    so a device that was offline can never overwrite newer data.
 *  - Deletes are soft: the removed row is moved to APP_trash first.
 *  - APP_meta holds the schema version and a data version that increases on every write.
 */

var FOOD_SHEET_NAMES = ['قاعدة بيانات الأطعمة', 'Foods', 'Food Database'];
var APP_TABLES = ['foods', 'entries', 'recipes', 'templates', 'plans', 'plannedDays', 'body', 'days', 'settings', 'foodChanges', 'kv', 'fasts'];
var SCRIPT_VERSION = 2;
var MAX_CHANGES = 500;          // per request
var MAX_PAYLOAD_CHARS = 45000;  // Sheets cell limit is 50,000
var MAX_KEY_CHARS = 200;

function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!props.getProperty('BACKUP_DONE')) {
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
    DriveApp.getFileById(ss.getId()).makeCopy('FULL BACKUP before Mego app sync — ' + stamp);
    props.setProperty('BACKUP_DONE', stamp);
  }
  var token = props.getProperty('APP_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('APP_TOKEN', token);
  }
  Logger.log('APP TOKEN (paste into the app): ' + token);
  Logger.log('Full backup created: ' + props.getProperty('BACKUP_DONE'));
  return token;
}

/** Run manually if the token ever leaks. The app must then be updated with the new token. */
function rotateToken() {
  PropertiesService.getScriptProperties().deleteProperty('APP_TOKEN');
  return setup();
}

function doGet() {
  return json_({ ok: true, app: 'mego-nutrition', version: 1 });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
    if (!token || req.token !== token) return json_({ ok: false, error: 'unauthorized' });
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      switch (req.action) {
        case 'ping': return json_(ping_());
        case 'meta': return json_({ ok: true, meta: readMeta_() });
        case 'foods': return json_(readFoods_());
        case 'push': return json_(push_(req.changes || [], req.clientSchema));
        case 'pull': return json_(pull_());
        case 'saveFoods': return json_(saveFoods_(req.foods || []));
        case 'backup': return json_(backup_(req.snapshot));
        default: return json_({ ok: false, error: 'unknown action' });
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function foodSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 0; i < FOOD_SHEET_NAMES.length; i++) {
    var sh = ss.getSheetByName(FOOD_SHEET_NAMES[i]);
    if (sh) return sh;
  }
  return null;
}

function ping_() {
  var sh = foodSheet_();
  return { ok: true, spreadsheet: SpreadsheetApp.getActiveSpreadsheet().getName(), foodSheet: sh ? sh.getName() : null, scriptVersion: SCRIPT_VERSION, meta: readMeta_() };
}

function metaSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('APP_meta');
  if (!sh) {
    sh = ss.insertSheet('APP_meta');
    sh.getRange(1, 1, 3, 2).setValues([['key', 'value'], ['schemaVersion', 2], ['dataVersion', 0]]);
  }
  return sh;
}

function readMeta_() {
  var vals = metaSheet_().getDataRange().getValues();
  var m = {};
  for (var i = 1; i < vals.length; i++) m[vals[i][0]] = vals[i][1];
  return m;
}

function bumpDataVersion_(clientSchema) {
  var sh = metaSheet_();
  var vals = sh.getDataRange().getValues();
  var v = 0;
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === 'dataVersion') { v = Number(vals[i][1]) + 1; sh.getRange(i + 1, 2).setValue(v); }
    if (vals[i][0] === 'schemaVersion' && clientSchema && Number(clientSchema) > Number(vals[i][1])) sh.getRange(i + 1, 2).setValue(Number(clientSchema));
  }
  return v;
}

function validChange_(c) {
  if (!c || APP_TABLES.indexOf(c.table) < 0) return false;
  if (typeof c.key !== 'string' || !c.key || c.key.length > MAX_KEY_CHARS) return false;
  if (c.op !== 'upsert' && c.op !== 'delete') return false;
  if (c.op === 'upsert') {
    if (!c.payload || typeof c.payload !== 'object' || Array.isArray(c.payload)) return false;
    if (JSON.stringify(c.payload).length > MAX_PAYLOAD_CHARS) return false;
  }
  return true;
}

function readFoods_() {
  var sh = foodSheet_();
  if (!sh) return { ok: false, error: 'food sheet not found' };
  var values = sh.getDataRange().getValues();
  return { ok: true, sheet: sh.getName(), rows: values };
}

function appSheet_(table) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = 'APP_' + table;
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 3).setValues([['key', 'updatedAt', 'json']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function keyIndex_(sh) {
  var last = sh.getLastRow();
  var map = {};
  if (last < 2) return map;
  var keys = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) map[String(keys[i][0])] = i + 2;
  return map;
}

function push_(changes, clientSchema) {
  if (!Array.isArray(changes)) return { ok: false, error: 'invalid changes' };
  if (changes.length > MAX_CHANGES) return { ok: false, error: 'too many changes in one request' };
  var invalid = changes.filter(function (c) { return !validChange_(c); }).length;
  if (invalid) return { ok: false, error: invalid + ' invalid change(s) rejected' };
  var byTable = {};
  changes.forEach(function (c) { (byTable[c.table] = byTable[c.table] || []).push(c); });
  var applied = 0;
  var conflicts = [];
  var trash = appSheet_('trash');
  Object.keys(byTable).forEach(function (table) {
    var sh = appSheet_(table);
    var idx = keyIndex_(sh);
    var deletes = [];
    var appends = [];
    byTable[table].forEach(function (c) {
      var row = idx[String(c.key)];
      if (c.op === 'delete') {
        if (row) {
          var old = sh.getRange(row, 1, 1, 3).getValues()[0];
          trash.appendRow([table + ':' + c.key, Date.now(), old[2]]);
          deletes.push(row);
        }
        return;
      }
      var p = c.payload;
      var incoming = Number(p.updatedAt || p.at || c.at || 0);
      if (row) {
        var stored = Number(sh.getRange(row, 2).getValue() || 0);
        if (stored > incoming) { conflicts.push({ table: table, key: c.key }); return; }
      }
      var values = [String(c.key), incoming, JSON.stringify(p)];
      if (row) sh.getRange(row, 1, 1, 3).setValues([values]);
      else appends.push(values);
      applied++;
    });
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, 3).setValues(appends);
    deletes.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); applied++; });
  });
  var dataVersion = applied ? bumpDataVersion_(clientSchema) : Number(readMeta_().dataVersion || 0);
  return { ok: true, applied: applied, conflicts: conflicts, dataVersion: dataVersion };
}

function pull_() {
  var tables = {};
  APP_TABLES.forEach(function (t) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('APP_' + t);
    if (!sh || sh.getLastRow() < 2) { tables[t] = []; return; }
    var vals = sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues();
    tables[t] = vals.map(function (v) { try { return JSON.parse(v[0]); } catch (e) { return null; } }).filter(Boolean);
  });
  return { ok: true, tables: tables, meta: readMeta_() };
}

var HEADER_RES = {
  name: /^(الاسم|اسم الطعام|الطعام|name|food)/i,
  category: /(الفئة|التصنيف|category)/i,
  kcal: /(سعرات|kcal|calorie|energy)/i,
  protein: /(بروتين|protein)/i,
  carbs: /(كارب|كربوهيدرات|carb)/i,
  fat: /(دهون|fat)/i,
  piece: /(وزن الحبة|الحصة|serving|piece|portion)/i,
  state: /(الحالة|state|status)/i,
  prep: /(طريقة التحضير|التحضير|prep|method)/i,
  notes: /(ملاحظات|notes?|source)/i
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

function backupFoodTabToday_(sh) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = 'BACKUP_Foods_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  if (!ss.getSheetByName(name)) sh.copyTo(ss).setName(name);
}

function saveFoods_(foods) {
  if (!Array.isArray(foods) || foods.length > 200) return { ok: false, error: 'invalid foods' };
  for (var i = 0; i < foods.length; i++) {
    var f = foods[i];
    if (!f || typeof f.name !== 'string' || !f.name.trim()) return { ok: false, error: 'food without name' };
    var nums = ['kcal', 'protein', 'carbs', 'fat'];
    for (var j = 0; j < nums.length; j++) if (typeof f[nums[j]] !== 'number' || f[nums[j]] < 0 || f[nums[j]] > 1000) return { ok: false, error: 'invalid value for ' + f.name };
  }
  var sh = foodSheet_();
  if (!sh) return { ok: false, error: 'food sheet not found' };
  backupFoodTabToday_(sh);
  var values = sh.getDataRange().getValues();
  var h = headerMap_(values);
  if (!h) return { ok: false, error: 'header not found' };
  var log = appSheet_('FoodSheetLog');
  var updated = 0, appended = 0;
  foods.forEach(function (f) {
    if (f.archived) return; // archiving in the app never deletes rows in the sheet
    var row = 0;
    if (f.sheetRow && values[f.sheetRow - 1] && String(values[f.sheetRow - 1][h.map.name]).trim() === String(f.sheetKey).split('#')[0]) row = f.sheetRow;
    if (!row) {
      for (var r = h.row + 1; r < values.length; r++) if (String(values[r][h.map.name]).trim() === String(f.sheetKey || f.name).split('#')[0]) { row = r + 1; break; }
    }
    var width = values[0].length;
    var target = row ? values[row - 1].slice() : new Array(width).join('.').split('.').map(function () { return ''; });
    var before = row ? JSON.stringify(values[row - 1]) : '';
    ['name', 'category', 'kcal', 'protein', 'carbs', 'fat', 'piece', 'state', 'prep', 'notes'].forEach(function (k) {
      if (h.map[k] !== undefined && f[k] !== undefined) target[h.map[k]] = f[k];
    });
    if (row) { sh.getRange(row, 1, 1, width).setValues([target]); updated++; }
    else { sh.appendRow(target); appended++; values.push(target); }
    log.appendRow([String(f.sheetKey || f.name), Date.now(), JSON.stringify({ action: row ? 'update' : 'append', row: row || sh.getLastRow(), before: before, after: target })]);
  });
  return { ok: true, updated: updated, appended: appended };
}

function backup_(snapshot) {
  if (!snapshot || snapshot.format !== 'mego-nutrition-backup') return { ok: false, error: 'invalid backup' };
  var folders = DriveApp.getFoldersByName('Mego Nutrition Backups');
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('Mego Nutrition Backups');
  var name = 'mego-backup-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss') + '.json';
  var file = folder.createFile(name, JSON.stringify(snapshot), MimeType.PLAIN_TEXT);
  return { ok: true, file: file.getName(), url: file.getUrl() };
}
