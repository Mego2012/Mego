import Dexie, { type Table } from 'dexie';
import type {
  BodyEntry, DayLog, DayPlan, DiaryEntry, Food, FoodChange, MealTemplate, OutboxItem, PlannedDay, Recipe, Settings
} from './types';

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
  foodChanges: 'id'
} as const;
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
