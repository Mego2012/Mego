/**
 * Bilingual food names: fills an EMPTY Arabic or English name from the hand-translated dictionary
 * public/fooddb/food-names.json. A name the user already has is never changed. A local backup is saved first.
 */
import { db } from './db';
import { saveLocalBackup } from './localBackup';
import { normalizeText } from './search';
import { updateFood } from './repo';
import type { Food } from './types';

export type NameDict = Record<string, string>;
let dict: NameDict | null = null;

export function setFoodNames(d: NameDict) { dict = d; }
export async function loadFoodNames(): Promise<NameDict> {
  if (dict) return dict;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const r = await fetch(base + 'fooddb/food-names.json');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  dict = ((await r.json()) as { names: NameDict }).names;
  return dict;
}

export interface NameFix { id: string; field: 'nameEn' | 'nameAr'; value: string; current: string }
export interface NamesPlan { fixes: NameFix[]; noEnglish: Food[]; noArabic: Food[]; complete: number }

/** Pure: which empty names can be filled from the dictionary, and which foods still miss a language. */
export function planNames(foods: Food[], d: NameDict): NamesPlan {
  const ar = new Map<string, string>(), en = new Map<string, string>();
  for (const [a, e] of Object.entries(d)) { ar.set(normalizeText(a), e); en.set(normalizeText(e), a); }
  const fixes: NameFix[] = [], noEnglish: Food[] = [], noArabic: Food[] = [];
  let complete = 0;
  for (const f of foods) {
    if (f.archived) continue;
    const hasAr = !!f.nameAr?.trim(), hasEn = !!f.nameEn?.trim();
    if (hasAr && hasEn) { complete++; continue; }
    if (hasAr && !hasEn) {
      const v = ar.get(normalizeText(f.nameAr));
      if (v) fixes.push({ id: f.id, field: 'nameEn', value: v, current: f.nameAr }); else noEnglish.push(f);
    } else if (hasEn && !hasAr) {
      const v = en.get(normalizeText(f.nameEn));
      if (v) fixes.push({ id: f.id, field: 'nameAr', value: v, current: f.nameEn }); else noArabic.push(f);
    }
  }
  return { fixes, noEnglish, noArabic, complete };
}

export async function previewNames(): Promise<NamesPlan> {
  return planNames(await db.foods.toArray(), await loadFoodNames());
}

/** Fills only empty names (re-checked right before each write). Returns the number of foods updated. */
export async function fillMissingNames(): Promise<number> {
  const plan = await previewNames();
  if (!plan.fixes.length) return 0;
  await saveLocalBackup('pre-import');
  let n = 0;
  for (const fx of plan.fixes) {
    const cur = await db.foods.get(fx.id);
    if (!cur || (cur[fx.field] ?? '').trim()) continue; // filled meanwhile: never overwrite
    try { await updateFood(fx.id, { [fx.field]: fx.value }); n++; }
    catch (e) { if (!String((e as Error).message).startsWith('DUPLICATE:')) throw e; } // another food already has this name: leave it
  }
  return n;
}
