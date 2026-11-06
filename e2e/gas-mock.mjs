/**
 * Minimal in-memory emulation of the Google Apps Script services used by apps-script/Code.gs
 * (SpreadsheetApp, PropertiesService, LockService, ContentService, DriveApp, Utilities…).
 * Lets tests execute the REAL Code.gs doPost() without a Google account.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const CODE = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps-script', 'Code.gs'), 'utf8');

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
}

class Sheet {
  constructor(ss, name, data = []) { this.ss = ss; this.name = name; this.data = data.map((r) => [...r]); }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() { let n = this.data.length; while (n > 0 && (this.data[n - 1] || []).every((x) => x === '' || x === undefined)) n--; return n; }
  getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(row) { this.data[this.getLastRow()] = [...row]; return this; }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  setFrozenRows() {}
  copyTo(ss) { const s = new Sheet(ss, 'Copy of ' + this.name, this.data); ss.sheets.push(s); return s; }
}

export function createGas({ foodRows = [], token = 'test-token', spreadsheetName = 'Nutrition (mock)' } = {}) {
  const ss = { sheets: [], name: spreadsheetName, getName() { return this.name; }, getId() { return 'mock-ss'; },
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; },
    insertSheet(n) { const s = new Sheet(this, n); this.sheets.push(s); return s; } };
  ss.sheets.push(new Sheet(ss, 'قاعدة بيانات الأطعمة', foodRows));
  const props = new Map([['APP_TOKEN', token]]);
  const drive = { copies: [], files: [] };
  const env = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Utilities: { getUuid: () => randomUUID(), formatDate: (d) => d.toISOString().slice(0, 10).replace(/-/g, '') },
    Session: { getScriptTimeZone: () => 'Asia/Riyadh' },
    Logger: { log() {} },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    DriveApp: {
      getFileById: () => ({ makeCopy: (name) => { drive.copies.push(name); return { getName: () => name }; } }),
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: (name) => ({ createFile: (fname, content) => { drive.files.push({ name: fname, size: content.length }); return { getName: () => fname, getUrl: () => 'https://drive.example/' + fname }; } })
    }
  };
  const fn = new Function(...Object.keys(env), CODE + '\nreturn { doPost, doGet, setup, rotateToken };');
  const api = fn(...Object.values(env));
  return {
    ss, drive, props,
    /** Calls doPost with a JSON body; returns the parsed JSON response. */
    post(body) { return JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).text); },
    setup: api.setup,
    sheetNames: () => ss.sheets.map((s) => s.name),
    sheet: (n) => ss.getSheetByName(n)
  };
}
