import { db } from './db';
import type { Food, Macros } from './types';

export interface ExternalProduct {
  barcode: string;
  name: string;
  brand: string;
  per100: Macros;
  servingGrams?: number;
  complete: boolean;
}

/** Validates EAN-8 / EAN-13 / UPC-A check digits (manual entry protection). */
export function validBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export async function findLocalByBarcode(code: string): Promise<Food | undefined> {
  return (await db.foods.toArray()).find((f) => f.barcode === code && !f.archived);
}

/** Open Food Facts public API (no key needed). Values are community data and are labelled as external. */
export async function lookupBarcode(code: string, fetcher: typeof fetch = fetch): Promise<ExternalProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_ar,product_name_en,brands,nutriments,serving_quantity`;
  const res = await fetcher(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error('HTTP ' + res.status);
  }
  const j = (await res.json()) as { status?: number; product?: Record<string, unknown> };
  if (!j.product || j.status === 0) return null;
  const p = j.product as { product_name?: string; product_name_ar?: string; product_name_en?: string; brands?: string; serving_quantity?: number; nutriments?: Record<string, number> };
  const nm = p.nutriments ?? {};
  const num = (k: string) => (typeof nm[k] === 'number' && Number.isFinite(nm[k]) ? nm[k] : undefined);
  const kcal = num('energy-kcal_100g') ?? (num('energy_100g') !== undefined ? num('energy_100g')! / 4.184 : undefined);
  const per100: Macros = {
    kcal: Math.round((kcal ?? 0) * 10) / 10, protein: num('proteins_100g') ?? 0, carbs: num('carbohydrates_100g') ?? 0, fat: num('fat_100g') ?? 0
  };
  const fiber = num('fiber_100g');
  const sugar = num('sugars_100g');
  const sodium = num('sodium_100g');
  if (fiber !== undefined) per100.fiber = fiber;
  if (sugar !== undefined) per100.sugar = sugar;
  if (sodium !== undefined) per100.sodium = Math.round(sodium * 1000);
  return {
    barcode: code,
    name: p.product_name_ar || p.product_name || p.product_name_en || code,
    brand: p.brands ?? '',
    per100,
    servingGrams: typeof p.serving_quantity === 'number' ? p.serving_quantity : undefined,
    complete: kcal !== undefined && num('proteins_100g') !== undefined && num('carbohydrates_100g') !== undefined && num('fat_100g') !== undefined
  };
}

/** Camera scanning via the BarcodeDetector API (Chrome on Android supports it). */
export function cameraScanSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
}
