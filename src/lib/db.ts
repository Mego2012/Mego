import Dexie, { type Table } from 'dexie';
import type {
  BodyEntry, DayLog, DayPlan, DiaryEntry, FastSession, Food, FoodChange, LocalBackup, MealTemplate, OutboxItem, PlannedDay,
  ProgressPhoto, Recipe, Settings
} from './types';

export interface KV {
  key: string;
  value: unknown;
  updatedAt: number;
}

export class NutritionDB extends Dexie {
  foods!: Table<Food, string>;
  foodChanges!: Table<FoodChange, number>;
  entries!: Table<DiaryEntry, string>;
  recipes!: Table<Recipe, string>;
  templates!: Table<MealTemplate, string>;
  plans!: Table<DayPlan, string>;
  plannedDays!: Table<PlannedDay, string>;
  body!: Table<BodyEntry, string>;
  days!: Table<DayLog, string>;
  settings!: Table<Settings, string>;
  outbox!: Table<OutboxItem, number>;
  kv!: Table<KV, string>;
  fasts!: Table<FastSession, string>;
  photos!: Table<ProgressPhoto, string>;
  backups!: Table<LocalBackup, number>;

  constructor(name = 'mego-nutrition') {
    super(name);
    this.version(1).stores({
      foods: 'id, nameAr, nameEn, category, state, favorite, source, sheetKey, archived, lastUsedAt, updatedAt',
      foodChanges: '++id, foodId, at',
      entries: 'id, date, [date+meal], foodId, recipeId, updatedAt',
      recipes: 'id, name, updatedAt',
      templates: 'id, name, updatedAt',
      plans: 'id, name, dayType, updatedAt',
      plannedDays: 'date, planId, updatedAt',
      body: 'id, &date, updatedAt',
      days: 'date, updatedAt',
      settings: 'id',
      outbox: '++id, table, at'
    });
    // v2 — additive only (new tables). Existing records are not transformed.
    this.version(2).stores({
      kv: 'key, updatedAt',
      fasts: 'id, start, updatedAt',
      photos: 'id, date',
      backups: '++id, at, reason'
    });
  }
}

export let db = new NutritionDB();

/** Used by tests to get an isolated database. */
export function useDatabase(name: string) {
  db = new NutritionDB(name);
  return db;
}

/** Tables mirrored to Google Sheets (APP_* tabs) and their primary keys. */
export const SYNC_TABLES = {
  foods: 'id',
  entries: 'id',
  recipes: 'id',
  templates: 'id',
  plans: 'id',
  plannedDays: 'date',
  body: 'id',
  days: 'date',
  settings: 'id',
  foodChanges: 'id',
  kv: 'key',
  fasts: 'id'
} as const;

export const DB_SCHEMA_VERSION = 2;

/**
 * Before Dexie upgrades an existing database, copy every store of the old version into a separate
 * backup database ("mego-nutrition-premigration"). Runs only when an upgrade is about to happen.
 */
export async function preMigrationBackup(name = 'mego-nutrition'): Promise<'none' | 'backed-up' | 'skipped'> {
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) return 'skipped';
  const list = await indexedDB.databases();
  const info = list.find((d) => d.name === name);
  if (!info || !info.version) return 'none';
  // Dexie stores version * 10 in native IndexedDB.
  if (info.version / 10 >= DB_SCHEMA_VERSION) return 'none';
  const raw: IDBDatabase = await new Promise((res, rej) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tables: Record<string, unknown[]> = {};
  for (const store of Array.from(raw.objectStoreNames)) {
    tables[store] = await new Promise((res, rej) => {
      const req = raw.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  raw.close();
  const json = JSON.stringify({ format: 'mego-nutrition-backup', version: 1, createdAt: new Date().toISOString(), fromSchema: info.version / 10, tables });
  const bk: IDBDatabase = await new Promise((res, rej) => {
    const r = indexedDB.open(name + '-premigration', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('backups', { autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  await new Promise<void>((res, rej) => {
    const tx = bk.transaction('backups', 'readwrite');
    tx.objectStore('backups').add({ at: Date.now(), fromSchema: info.version! / 10, json });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  bk.close();
  return 'backed-up';
}
export type SyncTable = keyof typeof SYNC_TABLES;

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}
