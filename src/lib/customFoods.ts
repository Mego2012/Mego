/** Export / import of a user's own foods (custom, label, Open Food Facts, used USDA foods) as JSON. */
import { db } from './db';
import { validateMacros } from './nutrition';
import { createFood, findDuplicateFood } from './repo';
import type { Food } from './types';

export const CUSTOM_FOODS_FORMAT = 'mego-custom-foods';

export async function exportCustomFoods(): Promise<string> {
  const foods = (await db.foods.toArray()).filter((f) => f.source !== 'sheet' && !f.archived);
  const strip = ({ id: _id, useCount: _u, lastUsedAt: _l, createdAt: _c, updatedAt: _up, version: _v, ...rest }: Food) => rest;
  return JSON.stringify({ format: CUSTOM_FOODS_FORMAT, version: 1, exportedAt: new Date().toISOString(), foods: foods.map(strip) }, null, 1);
}

/** Imports foods from an exported file. Invalid rows are rejected, duplicates (same name + state) are skipped. */
export async function importCustomFoods(text: string): Promise<{ added: number; skipped: number; invalid: number }> {
  let data: { format?: string; foods?: Partial<Food>[] };
  try { data = JSON.parse(text); } catch { throw new Error('INVALID_FILE'); }
  if (data.format !== CUSTOM_FOODS_FORMAT || !Array.isArray(data.foods)) throw new Error('INVALID_FILE');
  const res = { added: 0, skipped: 0, invalid: 0 };
  for (const f of data.foods) {
    const per100 = f.per100;
    if (!per100 || validateMacros(per100).length || !(f.nameAr || f.nameEn) || !['raw', 'cooked', 'other'].includes(String(f.state))) { res.invalid++; continue; }
    if (await findDuplicateFood(f.nameAr ?? '', f.nameEn ?? '', f.state!)) { res.skipped++; continue; }
    await createFood({
      nameAr: String(f.nameAr ?? ''), nameEn: String(f.nameEn ?? ''), category: String(f.category ?? ''), per100, state: f.state!, stateLabel: String(f.stateLabel ?? ''),
      prep: String(f.prep ?? ''), notes: String(f.notes ?? ''), pieceGrams: f.pieceGrams, gramsPerMl: f.gramsPerMl,
      servings: Array.isArray(f.servings) ? f.servings.filter((s) => s && s.name && s.grams > 0) : [], favorite: !!f.favorite,
      source: f.source === 'usda' || f.source === 'openfoodfacts' ? f.source : 'custom', sourceRef: f.sourceRef, barcode: f.barcode, brand: f.brand
    }, { allowDuplicate: true });
    res.added++;
  }
  return res;
}
