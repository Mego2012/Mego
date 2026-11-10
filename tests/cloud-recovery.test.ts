import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { isPristineDefault } from '../src/lib/cloudSync';
import { defaultSettings } from '../src/lib/defaults';
import { getSettings, saveSettings } from '../src/lib/repo';

describe('recovering an account after the local database was lost', () => {
  it('untouched defaults are recognised and never outrank the account settings from the cloud', async () => {
    expect(isPristineDefault({ ...defaultSettings(), updatedAt: Date.now() + 1e9 })).toBe(true);
    const s = await getSettings();
    expect(s.updatedAt).toBe(0); // a fresh default carries no "newer" timestamp
    expect(isPristineDefault(s)).toBe(true);
  });
  it('settings the user changed are never treated as defaults', async () => {
    const s = await saveSettings((x) => { x.targets.training.kcal = 2110; });
    expect(isPristineDefault(s)).toBe(false);
    expect(s.updatedAt).toBeGreaterThan(0);
  });
});

describe('after recovery: duplicates are reported, never removed', () => {
  it('lists diary items and own foods that appear twice', async () => {
    const { db } = await import('../src/lib/db');
    const { runDataCheck } = await import('../src/lib/dataCheck');
    const base = { meal: 'lunch', state: 'cooked', quantity: 200, unit: 'g', grams: 200, basis: 'cooked', macros: { kcal: 330, protein: 62, carbs: 0, fat: 7 }, order: 0, createdAt: 1, updatedAt: 1 };
    await db.entries.bulkPut([
      { ...base, id: 'old-1', date: '2026-11-01', name: 'صدر دجاج' },
      { ...base, id: 'new-1', date: '2026-11-01', name: 'صدر دجاج' },
      { ...base, id: 'x', date: '2026-11-02', name: 'صدر دجاج' }
    ] as never);
    const food = { nameEn: '', category: 'protein', state: 'cooked', per100: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, source: 'custom', favorite: false, archived: false, updatedAt: 1 };
    await db.foods.bulkPut([{ ...food, id: 'f1', nameAr: 'واي بروتين' }, { ...food, id: 'f2', nameAr: 'واي بروتين' }] as never);
    const before = await db.entries.count();
    const r = await runDataCheck();
    expect(r.duplicateEntries).toEqual([{ date: '2026-11-01', meal: 'lunch', name: 'صدر دجاج', grams: 200, copies: 2 }]);
    expect(r.duplicateFoods).toEqual([{ name: 'واي بروتين', copies: 2 }]);
    expect(await db.entries.count()).toBe(before); // read-only
  });
});
