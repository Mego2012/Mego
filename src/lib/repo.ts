import { db, type SyncTable } from './db';
import { defaultSettings } from './defaults';
import { basisFromFood, isIncompleteMacros, macrosFor, preciseMacros, roundMacros, scaleMacros, sumMacros, validateMacros } from './nutrition';
import type {
  BodyEntry, DayLog, DayPlan, DayType, DiaryEntry, Food, FoodChange, Macros, MealTemplate, MealType, PlanItem,
  PlannedDay, Recipe, RecipeIngredient, Settings, Unit
} from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

type Listener = () => void;
const changeListeners = new Set<Listener>();
export function onLocalChange(fn: Listener) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

async function enqueue(table: SyncTable, key: string, op: 'upsert' | 'delete', payload?: unknown) {
  await db.outbox.add({ table, key, op, payload, at: Date.now() });
  changeListeners.forEach((fn) => fn());
}

/* ------------------------------------------------------------------ settings */

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('main');
  if (s) return mergeSettings(s);
  // updatedAt 0: an untouched default never outranks the account's own settings arriving from the cloud
  const d = { ...defaultSettings(), updatedAt: 0 };
  await db.settings.put(d);
  return d;
}

function mergeSettings(s: Settings): Settings {
  const d = defaultSettings();
  return { ...d, ...s, profile: { ...d.profile, ...s.profile }, targets: { ...d.targets, ...s.targets }, tolerance: { ...d.tolerance, ...s.tolerance }, sync: { ...d.sync, ...s.sync } };
}

export async function saveSettings(update: (s: Settings) => Settings | void): Promise<Settings> {
  const current = await getSettings();
  const copy = structuredClone(current);
  const next = (update(copy) as Settings | undefined) ?? copy;
  for (const k of ['training', 'rest'] as const) {
    const errs = validateTargets(next.targets[k]);
    if (errs.length) throw new Error('Invalid targets: ' + errs.join(', '));
  }
  next.updatedAt = Date.now();
  await db.settings.put(next);
  // Sync config (token) is device-local and is never uploaded.
  await enqueue('settings', 'main', 'upsert', { ...next, sync: undefined });
  return next;
}

export function validateTargets(m: Macros): string[] {
  const errs: string[] = [];
  if (!(m.kcal > 0)) errs.push('kcal');
  for (const k of ['protein', 'carbs', 'fat'] as const) if (!(m[k] >= 0)) errs.push(k);
  return errs;
}

/* ------------------------------------------------------------------ foods */

export type FoodInput = Omit<Food, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'useCount' | 'incomplete' | 'archived' | 'favorite' | 'servings' | 'source'> &
  Partial<Pick<Food, 'favorite' | 'servings' | 'source'>>;

function normalizeName(s: string) {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function findDuplicateFood(nameAr: string, nameEn: string, state: Food['state'], excludeId?: string): Promise<Food | undefined> {
  const all = await db.foods.toArray();
  const a = normalizeName(nameAr);
  const e = normalizeName(nameEn);
  return all.find(
    (f) => f.id !== excludeId && !f.archived && f.state === state &&
      ((a && normalizeName(f.nameAr) === a) || (e && normalizeName(f.nameEn) === e))
  );
}

export async function createFood(input: FoodInput, opts: { allowDuplicate?: boolean } = {}): Promise<Food> {
  const errs = validateMacros(input.per100);
  if (errs.length) throw new Error('Invalid nutrition values: ' + errs.join(', '));
  if (!input.nameAr.trim() && !input.nameEn.trim()) throw new Error('Name is required');
  if (!opts.allowDuplicate) {
    const dup = await findDuplicateFood(input.nameAr, input.nameEn, input.state);
    if (dup) throw new Error('DUPLICATE:' + dup.id);
  }
  const now = Date.now();
  const food: Food = {
    ...input,
    id: uid(),
    favorite: input.favorite ?? false,
    servings: input.servings ?? [],
    source: input.source ?? 'custom',
    incomplete: isIncompleteMacros(input.per100),
    archived: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
    useCount: 0
  };
  await db.transaction('rw', db.foods, db.foodChanges, db.outbox, async () => {
    await db.foods.add(food);
    await logFoodChange({ foodId: food.id, foodName: displayName(food), at: now, action: input.source === 'sheet' ? 'import' : 'create', after: food, origin: input.source === 'sheet' ? 'sheet' : 'app' });
    await enqueue('foods', food.id, 'upsert', food);
  });
  return food;
}

async function logFoodChange(c: FoodChange) {
  const id = await db.foodChanges.add(c);
  await enqueue('foodChanges', String(id), 'upsert', { ...c, id });
}

const TRACKED: (keyof Food)[] = ['nameAr', 'nameEn', 'category', 'per100', 'state', 'stateLabel', 'prep', 'notes', 'pieceGrams', 'gramsPerMl', 'servings'];

export async function updateFood(id: string, changes: Partial<Food>, origin: FoodChange['origin'] = 'app'): Promise<Food> {
  const before = await db.foods.get(id);
  if (!before) throw new Error('Food not found');
  if (changes.per100) {
    const errs = validateMacros(changes.per100);
    if (errs.length) throw new Error('Invalid nutrition values: ' + errs.join(', '));
  }
  if (changes.nameAr !== undefined || changes.nameEn !== undefined || changes.state !== undefined) {
    const dup = await findDuplicateFood(changes.nameAr ?? before.nameAr, changes.nameEn ?? before.nameEn, changes.state ?? before.state, id);
    if (dup) throw new Error('DUPLICATE:' + dup.id);
  }
  const now = Date.now();
  const after: Food = { ...before, ...changes, updatedAt: now };
  after.incomplete = isIncompleteMacros(after.per100);
  const diffBefore: Partial<Food> = {};
  const diffAfter: Partial<Food> = {};
  for (const k of TRACKED) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      (diffBefore as Record<string, unknown>)[k] = before[k];
      (diffAfter as Record<string, unknown>)[k] = after[k];
    }
  }
  const meaningful = Object.keys(diffAfter).length > 0;
  if (meaningful) after.version = before.version + 1;
  await db.transaction('rw', db.foods, db.foodChanges, db.outbox, async () => {
    await db.foods.put(after);
    if (meaningful)
      await logFoodChange({ foodId: id, foodName: displayName(after), at: now, action: origin === 'app' ? 'update' : 'sheet-update', before: diffBefore, after: diffAfter, origin });
    await enqueue('foods', id, 'upsert', after);
  });
  return after;
}

export async function archiveFood(id: string) {
  const f = await db.foods.get(id);
  if (!f) return;
  const now = Date.now();
  await db.transaction('rw', db.foods, db.foodChanges, db.outbox, async () => {
    await db.foods.update(id, { archived: true, updatedAt: now });
    await logFoodChange({ foodId: id, foodName: displayName(f), at: now, action: 'archive', origin: 'app' });
    await enqueue('foods', id, 'upsert', { ...f, archived: true, updatedAt: now });
  });
}

export async function restoreFood(id: string) {
  const f = await db.foods.get(id);
  if (!f) return;
  const now = Date.now();
  await db.transaction('rw', db.foods, db.foodChanges, db.outbox, async () => {
    await db.foods.update(id, { archived: false, updatedAt: now });
    await logFoodChange({ foodId: id, foodName: displayName(f), at: now, action: 'restore', origin: 'app' });
    await enqueue('foods', id, 'upsert', { ...f, archived: false, updatedAt: now });
  });
}

export async function toggleFavoriteFood(id: string) {
  const f = await db.foods.get(id);
  if (!f) return;
  const next = { ...f, favorite: !f.favorite, updatedAt: Date.now() };
  await db.foods.put(next);
  await enqueue('foods', id, 'upsert', next);
}

export function displayName(f: Pick<Food, 'nameAr' | 'nameEn'>, lang: 'ar' | 'en' = 'ar'): string {
  if (lang === 'en') return f.nameEn || f.nameAr;
  return f.nameAr || f.nameEn;
}

/* ------------------------------------------------------------------ diary */

const recentAdds = new Map<string, number>();

async function nextOrder(date: string, meal: MealType) {
  const list = await db.entries.where('[date+meal]').equals([date, meal]).toArray();
  return list.reduce((m, e) => Math.max(m, e.order), 0) + 1;
}

export async function addFoodEntry(date: string, meal: MealType, food: Food, quantity: number, unit: Unit, servingId?: string): Promise<DiaryEntry> {
  if (food.incomplete) throw new Error('INCOMPLETE_FOOD');
  // Guard against accidental double-taps creating duplicate entries.
  const sig = `${date}|${meal}|${food.id}|${quantity}|${unit}|${servingId ?? ''}`;
  const last = recentAdds.get(sig);
  if (last && Date.now() - last < 1500) throw new Error('DUPLICATE_ENTRY');
  recentAdds.set(sig, Date.now());

  const basis = basisFromFood(food);
  const { grams, macros } = macrosFor(basis, quantity, unit, servingId);
  const now = Date.now();
  const entry: DiaryEntry = {
    id: uid(), date, meal, foodId: food.id, name: displayName(food), state: food.state,
    quantity, unit, servingId, grams, basis, macros, order: await nextOrder(date, meal), createdAt: now, updatedAt: now
  };
  await db.transaction('rw', db.entries, db.foods, db.outbox, async () => {
    await db.entries.add(entry);
    await db.foods.update(food.id, { lastUsedAt: now, useCount: (food.useCount ?? 0) + 1 });
    await enqueue('entries', entry.id, 'upsert', entry);
  });
  return entry;
}

export async function addRecipeEntry(date: string, meal: MealType, recipe: Recipe, servings: number): Promise<DiaryEntry> {
  // Use unrounded per-serving values (totals / servings) to avoid double rounding.
  const basis = { perServing: scaleMacros(recipe.totals, 1 / recipe.servings) };
  const { macros } = macrosFor(basis, servings, 'serving');
  const now = Date.now();
  const entry: DiaryEntry = {
    id: uid(), date, meal, recipeId: recipe.id, name: recipe.name, state: 'other', quantity: servings, unit: 'serving',
    grams: recipe.totalGrams > 0 ? Math.round((recipe.totalGrams / recipe.servings) * servings) : 0,
    basis, macros, order: await nextOrder(date, meal), createdAt: now, updatedAt: now
  };
  await db.entries.add(entry);
  await enqueue('entries', entry.id, 'upsert', entry);
  return entry;
}

/** Changes quantity using the entry's own snapshot basis (historical values are preserved). */
export async function updateEntry(id: string, changes: { quantity?: number; unit?: Unit; servingId?: string; meal?: MealType; date?: string }) {
  const e = await db.entries.get(id);
  if (!e) throw new Error('Entry not found');
  const quantity = changes.quantity ?? e.quantity;
  const unit = changes.unit ?? e.unit;
  const servingId = changes.servingId ?? e.servingId;
  const { grams, macros } = macrosFor(e.basis, quantity, unit, servingId);
  const next: DiaryEntry = {
    ...e, quantity, unit, servingId,
    grams: e.basis.perServing ? (e.quantity > 0 ? Math.round((e.grams / e.quantity) * quantity) : e.grams) : grams, macros,
    meal: changes.meal ?? e.meal, date: changes.date ?? e.date, updatedAt: Date.now()
  };
  await db.entries.put(next);
  await enqueue('entries', id, 'upsert', next);
  return next;
}

export async function deleteEntry(id: string) {
  await db.entries.delete(id);
  await enqueue('entries', id, 'delete');
}

/** Copies entries (keeping their original snapshots) to another date/meal. */
export async function copyEntries(entries: DiaryEntry[], toDate: string, toMeal?: MealType) {
  const now = Date.now();
  const created: DiaryEntry[] = [];
  for (const e of entries) {
    const meal = toMeal ?? e.meal;
    const copy: DiaryEntry = { ...structuredClone(e), id: uid(), date: toDate, meal, order: await nextOrder(toDate, meal), createdAt: now, updatedAt: now };
    await db.entries.add(copy);
    await enqueue('entries', copy.id, 'upsert', copy);
    created.push(copy);
  }
  return created;
}

export async function copyMeal(fromDate: string, meal: MealType, toDate: string, toMeal: MealType = meal) {
  const list = await db.entries.where('[date+meal]').equals([fromDate, meal]).sortBy('order');
  return copyEntries(list, toDate, toMeal);
}

export async function copyDay(fromDate: string, toDate: string) {
  const list = await db.entries.where('date').equals(fromDate).sortBy('order');
  return copyEntries(list, toDate);
}

/* ------------------------------------------------------------------ plan items (templates / plans) */

export interface ResolvedItem {
  item: PlanItem;
  ok: boolean;
  error?: string;
  macros: Macros;
  grams: number;
}

export async function resolveItem(item: PlanItem): Promise<ResolvedItem> {
  try {
    if (item.recipeId) {
      const r = await db.recipes.get(item.recipeId);
      if (!r || r.deleted) return { item, ok: false, error: 'missing', macros: zero(), grams: 0 };
      return { item, ok: true, macros: roundMacros(scaleMacros(r.perServing, item.quantity)), grams: 0 };
    }
    const f = item.foodId ? await db.foods.get(item.foodId) : undefined;
    if (!f) return { item, ok: false, error: 'missing', macros: zero(), grams: 0 };
    if (f.incomplete) return { item, ok: false, error: 'incomplete', macros: zero(), grams: 0 };
    const r = macrosFor(basisFromFood(f), item.quantity, item.unit, item.servingId);
    return { item, ok: true, macros: r.macros, grams: r.grams };
  } catch (e) {
    return { item, ok: false, error: (e as Error).message, macros: zero(), grams: 0 };
  }
}

function zero(): Macros {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

export async function totalsForItems(items: PlanItem[]): Promise<{ total: Macros; byMeal: Record<MealType, Macros>; resolved: ResolvedItem[] }> {
  const resolved = await Promise.all(items.map(resolveItem));
  const byMeal: Record<MealType, Macros> = { breakfast: zero(), lunch: zero(), dinner: zero(), snacks: zero() };
  for (const r of resolved) byMeal[r.item.meal] = roundMacros(sumMacros([byMeal[r.item.meal], r.macros]));
  return { total: roundMacros(sumMacros(resolved.map((r) => r.macros))), byMeal, resolved };
}

/** Logs plan/template items into the diary using CURRENT food values (snapshotted at log time). */
export async function logItems(date: string, items: PlanItem[], mealOverride?: MealType) {
  const logged: DiaryEntry[] = [];
  const skipped: PlanItem[] = [];
  for (const it of items) {
    const meal = mealOverride ?? it.meal;
    try {
      if (it.recipeId) {
        const r = await db.recipes.get(it.recipeId);
        if (!r || r.deleted) throw new Error('missing');
        logged.push(await addRecipeEntry(date, meal, r, it.quantity));
      } else {
        const f = it.foodId ? await db.foods.get(it.foodId) : undefined;
        if (!f) throw new Error('missing');
        recentAdds.clear();
        logged.push(await addFoodEntry(date, meal, f, it.quantity, it.unit, it.servingId));
      }
    } catch {
      skipped.push(it);
    }
  }
  return { logged, skipped };
}

export function entryToPlanItem(e: DiaryEntry): PlanItem {
  return { id: uid(), meal: e.meal, foodId: e.foodId, recipeId: e.recipeId, name: e.name, quantity: e.quantity, unit: e.unit, servingId: e.servingId };
}

export async function saveTemplate(t: Omit<MealTemplate, 'createdAt' | 'updatedAt' | 'id'> & { id?: string }) {
  const now = Date.now();
  const existing = t.id ? await db.templates.get(t.id) : undefined;
  const rec: MealTemplate = { ...t, id: t.id ?? uid(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.templates.put(rec);
  await enqueue('templates', rec.id, 'upsert', rec);
  return rec;
}

export async function deleteTemplate(id: string) {
  await db.templates.delete(id);
  await enqueue('templates', id, 'delete');
}

export async function savePlan(p: Omit<DayPlan, 'createdAt' | 'updatedAt' | 'id'> & { id?: string }) {
  const now = Date.now();
  const existing = p.id ? await db.plans.get(p.id) : undefined;
  const rec: DayPlan = { ...p, id: p.id ?? uid(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.plans.put(rec);
  await enqueue('plans', rec.id, 'upsert', rec);
  return rec;
}

export async function deletePlan(id: string) {
  await db.plans.delete(id);
  await enqueue('plans', id, 'delete');
}

export async function setPlannedDay(date: string, items: PlanItem[], planId?: string) {
  const rec: PlannedDay = { date, items, planId, updatedAt: Date.now() };
  if (!items.length) {
    await db.plannedDays.delete(date);
    await enqueue('plannedDays', date, 'delete');
    return;
  }
  await db.plannedDays.put(rec);
  await enqueue('plannedDays', date, 'upsert', rec);
}

export async function applyPlanToDates(planId: string, dates: string[]) {
  const p = await db.plans.get(planId);
  if (!p) throw new Error('Plan not found');
  for (const d of dates) await setPlannedDay(d, p.items.map((i) => ({ ...i, id: uid() })), planId);
}

export async function copyPlannedDay(from: string, to: string) {
  const p = await db.plannedDays.get(from);
  await setPlannedDay(to, (p?.items ?? []).map((i) => ({ ...i, id: uid() })), p?.planId);
}

/* ------------------------------------------------------------------ recipes */

export async function buildIngredient(foodId: string, quantity: number, unit: Unit, servingId?: string): Promise<RecipeIngredient> {
  const f = await db.foods.get(foodId);
  if (!f) throw new Error('Food not found');
  if (f.incomplete) throw new Error('INCOMPLETE_FOOD');
  const { grams, macros } = macrosFor(basisFromFood(f), quantity, unit, servingId);
  return { foodId, name: displayName(f), state: f.state, quantity, unit, servingId, grams, macros };
}

export function computeRecipe(ingredients: RecipeIngredient[], servings: number) {
  if (!(servings > 0)) throw new Error('Servings must be > 0');
  const totals = preciseMacros(sumMacros(ingredients.map((i) => i.macros)));
  const perServing = preciseMacros(scaleMacros(totals, 1 / servings));
  const totalGrams = Math.round(ingredients.reduce((s, i) => s + i.grams, 0));
  return { totals, perServing, totalGrams };
}

export async function saveRecipe(r: { id?: string; name: string; servings: number; ingredients: RecipeIngredient[]; notes?: string; favorite?: boolean }) {
  if (!r.name.trim()) throw new Error('Name is required');
  if (!r.ingredients.length) throw new Error('Add at least one ingredient');
  const now = Date.now();
  const existing = r.id ? await db.recipes.get(r.id) : undefined;
  const calc = computeRecipe(r.ingredients, r.servings);
  const rec: Recipe = {
    id: r.id ?? uid(), name: r.name.trim(), servings: r.servings, ingredients: r.ingredients, ...calc, notes: r.notes ?? '',
    favorite: r.favorite ?? existing?.favorite ?? false, createdAt: existing?.createdAt ?? now, updatedAt: now
  };
  await db.recipes.put(rec);
  await enqueue('recipes', rec.id, 'upsert', rec);
  return rec;
}

export async function deleteRecipe(id: string) {
  await db.recipes.delete(id);
  await enqueue('recipes', id, 'delete');
}

/* ------------------------------------------------------------------ body */

export type BodyInput = Partial<Omit<BodyEntry, 'id' | 'createdAt' | 'updatedAt' | 'date'>>;

export function validateBody(v: BodyInput): string[] {
  const errs: string[] = [];
  if (v.weight !== undefined && !(v.weight > 20 && v.weight < 400)) errs.push('weight');
  for (const k of ['waist', 'chest', 'hips', 'arm', 'thigh', 'neck'] as const) {
    const x = v[k];
    if (x !== undefined && !(x > 5 && x < 300)) errs.push(k);
  }
  if (v.bodyFat !== undefined && !(v.bodyFat > 1 && v.bodyFat < 70)) errs.push('bodyFat');
  return errs;
}

/** One measurement record per date (duplicate prevention). Saving the same date updates it. */
export async function saveBodyEntry(date: string, values: BodyInput): Promise<BodyEntry> {
  const errs = validateBody(values);
  if (errs.length) throw new Error('Invalid: ' + errs.join(', '));
  const now = Date.now();
  const existing = await db.body.where('date').equals(date).first();
  const rec: BodyEntry = { notes: '', ...existing, ...values, id: existing?.id ?? uid(), date, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.body.put(rec);
  await enqueue('body', rec.id, 'upsert', rec);
  // Keep profile.currentWeight in sync with the latest weigh-in.
  if (rec.weight) {
    const latest = (await db.body.orderBy('date').reverse().toArray()).find((b) => b.weight);
    if (latest && latest.date === date) await saveSettings((s) => { s.profile.currentWeight = rec.weight!; });
  }
  return rec;
}

export async function deleteBodyEntry(id: string) {
  await db.body.delete(id);
  await enqueue('body', id, 'delete');
}

/* ------------------------------------------------------------------ day logs */

export async function updateDayLog(date: string, change: Partial<Omit<DayLog, 'date' | 'updatedAt'>>) {
  const existing = await db.days.get(date);
  const rec: DayLog = { ...existing, ...change, date, updatedAt: Date.now() };
  for (const k of Object.keys(rec) as (keyof DayLog)[]) if (rec[k] === undefined) delete rec[k];
  await db.days.put(rec);
  await enqueue('days', date, 'upsert', rec);
  return rec;
}

export async function setDayType(date: string, dayType: DayType | undefined) {
  return updateDayLog(date, { dayType });
}

/* ------------------------------------------------------------------ undo helpers */

/** Removes entries (used to undo an add / copy / log action). */
export async function deleteEntries(ids: string[]) {
  for (const id of ids) await deleteEntry(id);
}

/** Puts entries back exactly as they were (used to undo a delete or an edit). */
export async function restoreEntries(entries: DiaryEntry[]) {
  for (const e of entries) {
    const rec = { ...e, updatedAt: Date.now() };
    await db.entries.put(rec);
    await enqueue('entries', e.id, 'upsert', rec);
  }
}

/* ------------------------------------------------------------------ water & habits */

export async function addWater(date: string, ml: number) {
  const cur = (await db.days.get(date))?.waterMl ?? 0;
  const next = Math.max(0, Math.round(cur + ml));
  if (next > 15000) throw new Error('Water above 15 L — check the amount');
  return updateDayLog(date, { waterMl: next });
}

export async function setWater(date: string, ml: number) {
  if (!(ml >= 0 && ml <= 15000)) throw new Error('Invalid water amount');
  return updateDayLog(date, { waterMl: Math.round(ml) });
}

export async function toggleHabit(date: string, habitId: string) {
  const cur = (await db.days.get(date))?.habits ?? {};
  return updateDayLog(date, { habits: { ...cur, [habitId]: !cur[habitId] } });
}

/* ------------------------------------------------------------------ fasting */

export async function startFast(targetHours: number, start = Date.now()) {
  const open = (await db.fasts.toArray()).find((f) => !f.end && !f.deleted);
  if (open) throw new Error('A fast is already running');
  const rec = { id: uid(), start, targetHours, updatedAt: Date.now() };
  await db.fasts.put(rec);
  await enqueue('fasts', rec.id, 'upsert', rec);
  return rec;
}

export async function endFast(id: string, end = Date.now()) {
  const f = await db.fasts.get(id);
  if (!f) return;
  const rec = { ...f, end: Math.max(end, f.start), updatedAt: Date.now() };
  await db.fasts.put(rec);
  await enqueue('fasts', id, 'upsert', rec);
  return rec;
}

export async function deleteFast(id: string) {
  await db.fasts.delete(id);
  await enqueue('fasts', id, 'delete');
}

/* ------------------------------------------------------------------ key/value (ratings, favorites, shopping checks) */

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const r = await db.kv.get(key);
  return (r?.value as T) ?? fallback;
}

export async function kvSet(key: string, value: unknown) {
  const rec = { key, value, updatedAt: Date.now() };
  await db.kv.put(rec);
  await enqueue('kv', key, 'upsert', rec);
}

/** Removes one key/value record (used for single cardio sessions; never for bulk deletes). */
export async function kvDelete(key: string) {
  await db.kv.delete(key);
  await enqueue('kv', key, 'delete');
}

/* ------------------------------------------------------------------ progress photos (local only) */

export async function addPhoto(date: string, blob: Blob, note = '') {
  const rec = { id: uid(), date, blob, note, createdAt: Date.now() };
  await db.photos.put(rec);
  return rec;
}

export async function deletePhoto(id: string) {
  await db.photos.delete(id);
}

/** Downscale a camera image to max 1280px JPEG to keep storage small. */
export async function compressImage(file: Blob, max = 1280): Promise<Blob> {
  if (typeof createImageBitmap === 'undefined') return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', 0.82));
}

/* ------------------------------------------------------------------ duplicate recipe */

export async function duplicateRecipe(id: string, suffix = ' (2)') {
  const r = await db.recipes.get(id);
  if (!r) throw new Error('Recipe not found');
  return saveRecipe({ name: r.name + suffix, servings: r.servings, ingredients: structuredClone(r.ingredients), notes: r.notes });
}
