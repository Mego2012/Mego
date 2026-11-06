import Papa from 'papaparse';
import { db } from './db';
import { isEnergySuspicious, isIncompleteMacros } from './nutrition';
import { createFood, updateFood } from './repo';
import type { Food, FoodState, Macros } from './types';

export const FOOD_SHEET_NAMES = ['قاعدة بيانات الأطعمة', 'Foods', 'Food Database'];

export interface ParsedFood {
  row: number; // 1-based row in the source sheet
  sheetKey: string;
  nameAr: string;
  nameEn: string;
  category: string;
  per100: Macros;
  pieceGrams?: number;
  state: FoodState;
  stateLabel: string;
  prep: string;
  notes: string;
  issues: string[];
  /** A required value cell was blank/unreadable: the food is imported but blocked from logging. */
  missingValues: boolean;
}

type Col = 'name' | 'nameEn' | 'category' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'sodium' | 'piece' | 'state' | 'prep' | 'notes';

const MATCHERS: [Col, RegExp][] = [
  ['nameEn', /(english|الإنجليزي|الانجليزي|name[_ ]?en)/i],
  ['name', /^(الاسم|اسم الطعام|الطعام|name|food)/i],
  ['category', /(الفئة|التصنيف|category)/i],
  ['kcal', /(سعرات|kcal|calorie|energy)/i],
  ['protein', /(بروتين|protein)/i],
  ['carbs', /(كارب|كربوهيدرات|carb)/i],
  ['fiber', /(ألياف|الياف|fiber|fibre)/i],
  ['sugar', /(سكر|sugar)/i],
  ['sodium', /(صوديوم|sodium)/i],
  ['fat', /(دهون|fat)/i],
  ['piece', /(وزن الحبة|الحصة|serving|piece|portion)/i],
  ['state', /(الحالة|state|status|raw\/cooked)/i],
  ['prep', /(طريقة التحضير|التحضير|prep|method)/i],
  ['notes', /(ملاحظات|notes?|source)/i]
];

export function detectHeader(rows: string[][]): { index: number; map: Partial<Record<Col, number>> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const map: Partial<Record<Col, number>> = {};
    rows[i].forEach((cell, c) => {
      const v = String(cell ?? '').trim();
      if (!v) return;
      for (const [col, re] of MATCHERS) {
        if (map[col] === undefined && re.test(v)) {
          map[col] = c;
          break;
        }
      }
    });
    if (map.name !== undefined && map.kcal !== undefined && map.protein !== undefined) return { index: i, map };
  }
  return null;
}

export function normalizeState(label: string): FoodState {
  const s = label.trim().toLowerCase();
  if (!s || s === '—' || s === '-') return 'other';
  if (/(نيء|نيئ|ني$|خام|raw|جاف|dry|uncooked)/i.test(s)) return 'raw';
  if (/(مصنّع|مصنع|محضّر|محضر|مسحوق|processed|prepared|powder)/i.test(s)) return 'other';
  if (/(مطبوخ|مطهي|مقلي|مشوي|مسلوق|cooked|boiled|grilled|fried|baked)/i.test(s)) return 'cooked';
  return 'other';
}

/** Parses a numeric cell. Returns {value, decimalComma} — "2,6" is read as 2.6 (and reported), "1,234" as 1234. */
export function parseNum(v: unknown): { value: number; decimalComma: boolean } {
  if (v === null || v === undefined) return { value: NaN, decimalComma: false };
  if (typeof v === 'number') return { value: v, decimalComma: false };
  let s = String(v).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('٫', '.').trim();
  if (!s || s === '—' || s === '-') return { value: NaN, decimalComma: false };
  let decimalComma = false;
  if (/^-?\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
    decimalComma = true;
  } else s = s.replace(/,/g, '');
  return { value: Number(s), decimalComma };
}

export function parseFoodRows(rows: string[][]): { foods: ParsedFood[]; headerRow: number; errors: string[] } {
  const header = detectHeader(rows);
  if (!header) return { foods: [], headerRow: -1, errors: ['headerNotFound'] };
  const { index, map } = header;
  const foods: ParsedFood[] = [];
  const seen = new Map<string, number>();
  for (let i = index + 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (c: Col) => (map[c] !== undefined ? String(r[map[c]!] ?? '').trim() : '');
    const name = get('name');
    if (!name) continue;
    const issues: string[] = [];
    let missingValues = false;
    const per100: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const) {
      const p = parseNum(get(k));
      if (p.decimalComma && !issues.includes('decimalComma')) issues.push('decimalComma');
      if (!Number.isFinite(p.value) || p.value < 0) {
        missingValues = true;
        if (!issues.includes('missingValues')) issues.push('missingValues');
      } else per100[k] = p.value;
    }
    for (const k of ['fiber', 'sugar', 'sodium'] as const) {
      if (map[k] === undefined) continue;
      const p = parseNum(get(k));
      if (Number.isFinite(p.value) && p.value >= 0) per100[k] = p.value;
    }
    if (!missingValues && isIncompleteMacros(per100)) issues.push('zeroValues');
    else if (!missingValues) {
      if (isEnergySuspicious(per100, get('category'))) issues.push('energyMismatch');
      if (per100.protein + per100.carbs + per100.fat > 100.5) issues.push('over100g');
    }
    const piece = parseNum(get('piece')).value;
    const stateLabel = get('state');
    const notes = get('notes');
    if (/⚠|غير محقق|تقريبي|تقديري|للمراجعة/.test(notes)) issues.push('flaggedInNotes');
    const base = name.replace(/\s+/g, ' ');
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    if (count > 1) issues.push('duplicateName');
    foods.push({
      row: i + 1,
      sheetKey: count > 1 ? `${base}#${count}` : base,
      nameAr: name,
      nameEn: get('nameEn'),
      category: get('category'),
      per100,
      pieceGrams: Number.isFinite(piece) && piece > 0 ? piece : undefined,
      state: normalizeState(stateLabel),
      stateLabel,
      prep: get('prep'),
      notes,
      issues,
      missingValues
    });
  }
  // mark the first occurrence of duplicate names too
  for (const f of foods) if ((seen.get(f.nameAr.replace(/\s+/g, ' ')) ?? 0) > 1 && !f.issues.includes('duplicateName')) f.issues.push('duplicateName');
  return { foods, headerRow: index + 1, errors: [] };
}

export function parseCSV(text: string): string[][] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: false });
  return res.data as string[][];
}

export async function parseWorkbook(buf: ArrayBuffer): Promise<{ sheet: string; rows: string[][] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const names = [...FOOD_SHEET_NAMES.filter((n) => wb.SheetNames.includes(n)), ...wb.SheetNames];
  for (const n of names) {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n], { header: 1, raw: true, defval: '' }) as string[][];
    if (detectHeader(rows)) return { sheet: n, rows };
  }
  throw new Error('headerNotFound');
}

export interface AuditSummary {
  total: number;
  raw: number;
  cooked: number;
  other: number;
  zeroValues: number;
  missingValues: number;
  decimalComma: number;
  energyMismatch: number;
  duplicates: number;
  flagged: number;
  missingPieceWeight: number;
  stateLabels: Record<string, number>;
  categories: Record<string, number>;
}

export function auditFoods(foods: ParsedFood[]): AuditSummary {
  const count = (pred: (f: ParsedFood) => boolean) => foods.filter(pred).length;
  const tally = (key: (f: ParsedFood) => string) =>
    foods.reduce<Record<string, number>>((acc, f) => {
      const k = key(f) || '(empty)';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  return {
    total: foods.length,
    raw: count((f) => f.state === 'raw'),
    cooked: count((f) => f.state === 'cooked'),
    other: count((f) => f.state === 'other'),
    zeroValues: count((f) => f.issues.includes('zeroValues')),
    missingValues: count((f) => f.missingValues),
    decimalComma: count((f) => f.issues.includes('decimalComma')),
    energyMismatch: count((f) => f.issues.includes('energyMismatch')),
    duplicates: count((f) => f.issues.includes('duplicateName')),
    flagged: count((f) => f.issues.includes('flaggedInNotes')),
    missingPieceWeight: count((f) => !f.pieceGrams),
    stateLabels: tally((f) => f.stateLabel),
    categories: tally((f) => f.category)
  };
}

export interface ImportResult {
  added: number;
  updated: number;
  unchanged: number;
  kept: number; // app foods not present in the sheet — never deleted
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Merges sheet rows into the app database. Never deletes. Changes to existing records are logged
 * in the change history; diary entries keep their own snapshots so history is unaffected.
 */
export async function importParsedFoods(foods: ParsedFood[], origin: 'sheet' | 'file' = 'sheet'): Promise<ImportResult> {
  const existing = await db.foods.toArray();
  const byKey = new Map(existing.filter((f) => f.sheetKey).map((f) => [f.sheetKey!, f]));
  const res: ImportResult = { added: 0, updated: 0, unchanged: 0, kept: 0 };
  const seenKeys = new Set<string>();
  for (const p of foods) {
    seenKeys.add(p.sheetKey);
    const cur = byKey.get(p.sheetKey);
    const fields: Partial<Food> = {
      nameAr: p.nameAr, category: p.category, per100: p.per100, state: p.state, stateLabel: p.stateLabel,
      prep: p.prep, notes: p.notes, pieceGrams: p.pieceGrams, sheetRow: p.row
    };
    if (p.nameEn) fields.nameEn = p.nameEn;
    if (!cur) {
      await createFood(
        {
          nameAr: p.nameAr, nameEn: p.nameEn, category: p.category, per100: p.per100, state: p.state, stateLabel: p.stateLabel,
          prep: p.prep, notes: p.notes, pieceGrams: p.pieceGrams, source: 'sheet', sheetKey: p.sheetKey, sheetRow: p.row
        },
        { allowDuplicate: true }
      );
      if (p.missingValues) {
        const created = await db.foods.where('sheetKey').equals(p.sheetKey).first();
        if (created) await db.foods.update(created.id, { incomplete: true });
      }
      res.added++;
      continue;
    }
    const changed = (Object.keys(fields) as (keyof Food)[]).some((k) => k !== 'sheetRow' && !same(cur[k], fields[k]));
    if (changed) {
      await updateFood(cur.id, fields, origin);
      if (p.missingValues) await db.foods.update(cur.id, { incomplete: true });
      res.updated++;
    } else {
      if (cur.sheetRow !== p.row) await db.foods.update(cur.id, { sheetRow: p.row });
      res.unchanged++;
    }
  }
  res.kept = existing.filter((f) => !f.sheetKey || !seenKeys.has(f.sheetKey)).length;
  return res;
}
