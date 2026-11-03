import Papa from 'papaparse';
import { downloadBlob } from './backup';
import type { PeriodReport } from './reports';
import type { DiaryEntry, Food } from './types';

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return '﻿' + Papa.unparse(rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : c))));
}

export function reportRows(r: PeriodReport, labels: Record<string, string>) {
  const rows: (string | number | null)[][] = [
    [labels.date, labels.status, labels.dayType, labels.kcal, labels.protein, labels.carbs, labels.fat, labels.targetKcal, labels.targetProtein, labels.calorieInRange, labels.proteinHit]
  ];
  for (const d of r.days)
    rows.push([
      d.date, labels['status_' + d.status], labels[d.dayType],
      d.status === 'empty' ? null : d.totals.kcal, d.status === 'empty' ? null : d.totals.protein,
      d.status === 'empty' ? null : d.totals.carbs, d.status === 'empty' ? null : d.totals.fat,
      d.target.kcal, d.target.protein,
      d.status === 'complete' ? (d.calorieInRange ? 1 : 0) : null, d.status === 'complete' ? (d.proteinHit ? 1 : 0) : null
    ]);
  rows.push([]);
  rows.push([labels.summary]);
  rows.push([labels.completeDays, r.completeDays], [labels.partialDays, r.partialDays], [labels.emptyDays, r.emptyDays]);
  if (r.averages) rows.push([labels.avgKcal, r.averages.kcal], [labels.avgProtein, r.averages.protein], [labels.avgCarbs, r.averages.carbs], [labels.avgFat, r.averages.fat]);
  rows.push([labels.calorieConsistency, r.calorieConsistencyPct], [labels.proteinConsistency, r.proteinConsistencyPct], [labels.goalCompletion, r.goalCompletionPct]);
  rows.push([labels.weightStart, r.weight.start], [labels.weightEnd, r.weight.end], [labels.weightAvg, r.weight.average], [labels.waistChange, r.weight.waistChange]);
  return rows;
}

export function exportReportCSV(r: PeriodReport, labels: Record<string, string>) {
  downloadBlob(`nutrition-${r.kind}-${r.dates[0]}.csv`, new Blob([toCSV(reportRows(r, labels))], { type: 'text/csv;charset=utf-8' }));
}

export async function exportReportXLSX(r: PeriodReport, labels: Record<string, string>, entries: DiaryEntry[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reportRows(r, labels)), 'Summary');
  const set = new Set(r.dates);
  const diary = entries.filter((e) => set.has(e.date)).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(diaryRows(diary, labels)), 'Diary');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob(`nutrition-${r.kind}-${r.dates[0]}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export function diaryRows(entries: DiaryEntry[], labels: Record<string, string>) {
  const rows: (string | number)[][] = [[labels.date, labels.meal, labels.food, labels.state, labels.quantity, labels.unit, labels.grams, labels.kcal, labels.protein, labels.carbs, labels.fat]];
  for (const e of entries) rows.push([e.date, labels[e.meal], e.name, labels['state_' + e.state], e.quantity, labels['unit_' + e.unit], e.grams, e.macros.kcal, e.macros.protein, e.macros.carbs, e.macros.fat]);
  return rows;
}

export function exportDiaryCSV(entries: DiaryEntry[], labels: Record<string, string>) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  downloadBlob(`food-diary-all.csv`, new Blob([toCSV(diaryRows(sorted, labels))], { type: 'text/csv;charset=utf-8' }));
}

/** Exports foods in the same column layout as the Google Sheet food tab (re-importable). */
export function foodRows(foods: Food[]) {
  const rows: (string | number)[][] = [['الاسم', 'الفئة', 'سعرات/100غ', 'بروتين/100غ (غ)', 'كارب/100غ (غ)', 'دهون/100غ (غ)', 'وزن الحبة/الحصة (غ)', 'الحالة', 'طريقة التحضير', 'ملاحظات', 'English name']];
  for (const f of foods) rows.push([f.nameAr, f.category, f.per100.kcal, f.per100.protein, f.per100.carbs, f.per100.fat, f.pieceGrams ?? '', f.stateLabel || f.state, f.prep, f.notes, f.nameEn]);
  return rows;
}

export function exportFoodsCSV(foods: Food[]) {
  downloadBlob('food-database.csv', new Blob([toCSV(foodRows(foods))], { type: 'text/csv;charset=utf-8' }));
}

export async function exportFoodsXLSX(foods: Food[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(foodRows(foods)), 'Foods');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob('food-database.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
