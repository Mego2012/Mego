/**
 * In-memory emulation of the Google Apps Script services used by apps-script/Code.gs (v3):
 * SpreadsheetApp.openById, DriveApp, Drive (advanced service), PropertiesService, LockService, ContentService…
 * Lets tests execute the REAL Code.gs without a Google account. `mode` emulates the Hub file being a native
 * Google Sheet or an Excel (.xlsx) file stored in Drive.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const CODE = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps-script', 'Code.gs'), 'utf8');
export const HUB_ID = '1mxqBI9_oiXCVpta2aRCDutYh9as_2NuI';

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.data[this.r - 1 + i] || [];
      out.push(Array.from({ length: this.nc }, (_, j) => (row[this.c - 1 + j] ?? '')));
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(v) {
    for (let i = 0; i < v.length; i++) {
      const ri = this.r - 1 + i;
      this.sheet.data[ri] = this.sheet.data[ri] || [];
      for (let j = 0; j < v[i].length; j++) this.sheet.data[ri][this.c - 1 + j] = v[i][j];
    }
    return this;
  }
  setValue(x) { return this.setValues([[x]]); }
  clearContent() { for (let i = 0; i < this.nr; i++) { const row = this.sheet.data[this.r - 1 + i]; if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; } return this; }
  setFontSize() { return this; }
  setFontWeight() { return this; }
}

class Sheet {
  constructor(ss, name, data = []) { this.ss = ss; this.name = name; this.data = data.map((r) => [...r]); this.charts = []; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() { let n = this.data.length; while (n > 0 && (this.data[n - 1] || []).every((x) => x === '' || x === undefined)) n--; return n; }
  getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)); }
  getRange(r, c, nr = 1, nc = 1) {
    if (typeof r === 'string') {
      const m = r.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
      const colN = (s) => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
      if (!m) return new Range(this, 1, 1, 1, 1);
      const r1 = +m[2], c1 = colN(m[1]);
      return new Range(this, r1, c1, m[4] ? +m[4] - r1 + 1 : 1, m[3] ? colN(m[3]) - c1 + 1 : 1);
    }
    return new Range(this, r, c, nr, nc);
  }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(row) { this.data[this.getLastRow()] = [...row]; return this; }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  setFrozenRows() {}
  setColumnWidth() {}
  clear() { this.data = []; return this; }
  clearContents() { this.data = []; return this; }
  getCharts() { return this.charts; }
  removeChart(c) { this.charts = this.charts.filter((x) => x !== c); }
  insertChart(c) { this.charts.push(c); }
  newChart() { const b = { asColumnChart: () => b, asLineChart: () => b, addRange: () => b, setPosition: () => b, setOption: () => b, build: () => ({}) }; return b; }
  copyTo(ss) { const s = new Sheet(ss, 'Copy of ' + this.name, this.data); ss.sheets.push(s); return s; }
}

/**
 * `ai` emulates the Claude Messages API reached through UrlFetchApp: `ai(request)` receives
 * { url, headers, body } and returns { code, json } (or throws to emulate a network failure).
 * Every request is recorded in `aiRequests` so tests can check what left the backend.
 */
export function createGas({ foodRows = [], token = 'test-token', spreadsheetName = 'نظام التنشيف والتضخيم', mode = 'native', scriptProps = {}, ai } = {}) {
  const ss = { sheets: [], name: spreadsheetName, getName() { return this.name; }, rename(n) { this.name = n; }, getId() { return HUB_ID; },
    getSheets() { return this.sheets; },
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; },
    insertSheet(n, index) { const s = new Sheet(this, n); if (index === 0) this.sheets.unshift(s); else this.sheets.push(s); return s; } };
  ss.sheets.push(new Sheet(ss, 'لوحة التحكم', [['لوحة التحكم القديمة']]));
  ss.sheets.push(new Sheet(ss, 'قاعدة بيانات الأطعمة', foodRows));
  const state = { mode, writesToXlsx: 0, tmpFiles: [], trashed: [] };
  const props = new Map([['APP_TOKEN', token], ...Object.entries(scriptProps)]);
  const aiRequests = [];
  const drive = { copies: [], files: [] };
  const otherSheets = new Map(); // temporary converted copies
  const hubFile = {
    getMimeType: () => (state.mode === 'native' ? 'application/vnd.google-apps.spreadsheet' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    getName: () => ss.name, setName: (n) => { ss.name = n; },
    getBlob: () => ({ kind: 'xlsx-blob' }),
    getParents: () => ({ next: () => ({ getId: () => 'parent' }) }),
    makeCopy: (name) => { drive.copies.push(name); return { getName: () => name }; }
  };
  const env = {
    SpreadsheetApp: {
      openById: (id) => {
        if (id === HUB_ID) { if (state.mode !== 'native') throw new Error('Service Spreadsheets failed: not a Google Sheet'); return ss; }
        if (otherSheets.has(id)) return otherSheets.get(id);
        throw new Error('not found ' + id);
      },
      getActiveSpreadsheet: () => { throw new Error('standalone script: no active spreadsheet'); }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Utilities: { getUuid: () => randomUUID(), formatDate: (d) => d.toISOString().slice(0, 10).replace(/-/g, '') },
    Session: { getScriptTimeZone: () => 'Asia/Riyadh' },
    Logger: { log() {} },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    UrlFetchApp: {
      fetch: (url, opts) => {
        const req = { url, headers: opts.headers, contentType: opts.contentType, method: opts.method, body: JSON.parse(opts.payload) };
        aiRequests.push(req);
        if (!ai) throw new Error('DNS error: no network in the emulator');
        const r = ai(req);
        return { getResponseCode: () => r.code ?? 200, getContentText: () => (typeof r.json === 'string' ? r.json : JSON.stringify(r.json)) };
      }
    },
    DriveApp: {
      getFileById: (id) => {
        if (id === HUB_ID) return hubFile;
        return { setTrashed: () => { state.trashed.push(id); otherSheets.delete(id); } };
      },
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: () => ({ createFile: (fname, content) => { drive.files.push({ name: fname, size: content.length }); return { getName: () => fname, getUrl: () => 'https://drive.example/' + fname }; } })
    },
    Drive: {
      Files: {
        create: (meta) => {
          const id = 'tmp-' + randomUUID();
          // a converted copy of the Excel Hub: same tabs/content as the Hub
          const copy = { ...ss, sheets: ss.sheets.map((s) => new Sheet(null, s.name, s.data)), getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; } };
          otherSheets.set(id, copy);
          state.tmpFiles.push({ id, name: meta.name });
          return { id };
        }
      }
    }
  };
  const fn = new Function(...Object.keys(env), CODE + '\nreturn { doPost, doGet, setup, rotateToken, migrateHub, convertHubToGoogleSheets };');
  const api = fn(...Object.values(env));
  return {
    ss, drive, props, state, aiRequests,
    post(body) { return JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).text); },
    setup: api.setup,
    migrateHub: api.migrateHub,
    convert: api.convertHubToGoogleSheets,
    sheetNames: () => ss.sheets.map((s) => s.name),
    sheet: (n) => ss.getSheetByName(n)
  };
}
