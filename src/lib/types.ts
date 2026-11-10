export type Lang = 'ar' | 'en';
export type ThemeMode = 'system' | 'light' | 'dark';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

/** raw = weighed raw/dry; cooked = weighed after cooking; other = prepared/processed/powder/not applicable */
export type FoodState = 'raw' | 'cooked' | 'other';
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'cup' | 'piece' | 'slice' | 'tbsp' | 'tsp' | 'serving';
export const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'cup', 'piece', 'slice', 'tbsp', 'tsp', 'serving'];
export type DayType = 'training' | 'rest';

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Optional nutrients — undefined means "unknown" (never treated as zero). */
  fiber?: number;
  sugar?: number;
  /** mg */
  sodium?: number;
  /** Saturated fat, g */
  satFat?: number;
}

export const OPTIONAL_NUTRIENTS = ['fiber', 'sugar', 'sodium', 'satFat'] as const;
export type OptionalNutrient = (typeof OPTIONAL_NUTRIENTS)[number];

export interface CustomServing {
  id: string;
  name: string;
  grams: number;
}

export interface Food {
  id: string;
  nameAr: string;
  nameEn: string;
  category: string;
  /** Nutritional basis: per 100 g (or per 100 ml treated via gramsPerMl). */
  per100: Macros;
  state: FoodState;
  /** Original state label as written in the sheet (e.g. "مطبوخ/مصنّع"). */
  stateLabel: string;
  prep: string;
  notes: string;
  /** Weight in grams of one piece / slice / standard serving (sheet column "وزن الحبة/الحصة"). */
  pieceGrams?: number;
  /** Density for ml-based logging. When absent, 1 ml = 1 g is assumed and shown to the user. */
  gramsPerMl?: number;
  servings: CustomServing[];
  favorite: boolean;
  source: 'sheet' | 'custom' | 'openfoodfacts' | 'usda';
  /** Where the values come from (e.g. "USDA FDC 171477 (SR Legacy)"); shown to the user. */
  sourceRef?: string;
  barcode?: string;
  brand?: string;
  /** Key of the record in the Google Sheet (original name + row) used for sync. */
  sheetKey?: string;
  sheetRow?: number;
  /** True when the record has no usable nutrition values (e.g. 0/0/0/0 placeholders). */
  incomplete: boolean;
  archived: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  useCount: number;
}

export interface FoodChange {
  id?: number;
  foodId: string;
  foodName: string;
  at: number;
  action: 'create' | 'update' | 'archive' | 'restore' | 'import' | 'sheet-update';
  before?: Partial<Food>;
  after?: Partial<Food>;
  origin: 'app' | 'sheet' | 'file';
}

/** Snapshot of the basis used when the entry was logged. Never re-read from the food database. */
export interface EntryBasis {
  per100?: Macros;
  perServing?: Macros; // recipes: per recipe serving
  pieceGrams?: number;
  gramsPerMl?: number;
  servings?: CustomServing[];
}

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD (local)
  meal: MealType;
  foodId?: string;
  recipeId?: string;
  name: string;
  state: FoodState;
  quantity: number;
  unit: Unit;
  servingId?: string;
  grams: number;
  basis: EntryBasis;
  macros: Macros;
  order: number;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface RecipeIngredient {
  foodId: string;
  name: string;
  state: FoodState;
  quantity: number;
  unit: Unit;
  servingId?: string;
  grams: number;
  macros: Macros;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  totals: Macros;
  perServing: Macros;
  totalGrams: number;
  notes: string;
  favorite: boolean;
  /** Set when created from the built-in library. */
  libraryId?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/** Item that references a food or recipe and a quantity; values are resolved at log time. */
export interface PlanItem {
  id: string;
  meal: MealType;
  foodId?: string;
  recipeId?: string;
  name: string;
  quantity: number;
  unit: Unit;
  servingId?: string;
}

/** Saved meal (template) - log a usual meal in seconds. */
export interface MealTemplate {
  id: string;
  name: string;
  items: PlanItem[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/** Reusable whole-day meal plan (e.g. "Training day plan"). */
export interface DayPlan {
  id: string;
  name: string;
  dayType: DayType | 'any';
  items: PlanItem[];
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/** Plan applied to a specific calendar date. */
export interface PlannedDay {
  date: string;
  planId?: string;
  items: PlanItem[];
  updatedAt: number;
}

export interface BodyEntry {
  id: string;
  date: string;
  weight?: number;
  waist?: number;
  chest?: number;
  hips?: number;
  arm?: number;
  thigh?: number;
  neck?: number;
  bodyFat?: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface DayLog {
  date: string;
  /** Manual completeness override. */
  status?: 'complete' | 'partial';
  dayType?: DayType;
  targetsOverride?: Macros;
  notes?: string;
  /** Water drunk on this day, ml. */
  waterMl?: number;
  /** Habit id -> done. */
  habits?: Record<string, boolean>;
  updatedAt: number;
}

export interface Habit {
  id: string;
  name: string;
  active: boolean;
}

export interface Reminder {
  id: string;
  kind: 'water' | 'meal' | 'weigh' | 'custom';
  label: string;
  /** HH:MM local time */
  time: string;
  enabled: boolean;
}

export interface FastSession {
  id: string;
  start: number;
  end?: number;
  targetHours: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface ProgressPhoto {
  id: string;
  date: string;
  blob: Blob;
  note: string;
  createdAt: number;
}

export interface LocalBackup {
  id?: number;
  at: number;
  reason: 'auto-daily' | 'manual' | 'pre-migration' | 'pre-restore' | 'pre-import' | 'pre-pull' | 'pre-update';
  size: number;
  json: string;
  /** App release a 'pre-update' backup was taken for. */
  release?: string;
}

export type GoalType = 'fat_loss' | 'fat_loss_preserve' | 'recomp' | 'lean_bulk' | 'bulk' | 'maintain' | 'healthy' | 'performance' | 'custom';
export const GOAL_TYPES: GoalType[] = ['fat_loss', 'fat_loss_preserve', 'recomp', 'lean_bulk', 'bulk', 'maintain', 'healthy', 'performance', 'custom'];

export interface Profile {
  /** Optional first name used in the greeting. */
  name?: string;
  sex: 'male' | 'female';
  age: number;
  heightCm: number;
  startWeight: number;
  currentWeight: number;
  targetWeight: number;
  weeklyChangeKg: number;
  /** Free-text description (used for the custom goal). */
  goal: string;
  goalType: GoalType;
  trainingDaysPerWeek: number;
  startWaist?: number;
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
}

export interface SyncConfig {
  url: string;
  token: string;
  autoSync: boolean;
  writeFoodsToSheet: boolean;
  lastPushAt?: number;
  lastPullAt?: number;
  lastFoodsPullAt?: number;
  lastError?: string;
  /** Server data version last seen (conflict detection). */
  serverVersion?: number;
  /** ID of the native Google Sheet converted from the Hub, pinned at first connection. */
  hubNativeId?: string;
}

export interface Settings {
  id: 'main';
  profile: Profile;
  targets: { training: Macros; rest: Macros };
  /** Weekdays (0=Sunday..6=Saturday) that are training days. */
  trainingWeekdays: number[];
  tolerance: { caloriePct: number; proteinPct: number };
  autoCompletePastDays: boolean;
  weekStartsOn: number; // 0..6
  lang: Lang;
  theme: ThemeMode;
  sync: SyncConfig;
  /** Fully-logged threshold: a past day counts as complete when calories reach this % of target. */
  completeThresholdPct: number;
  waterTargetMl: number;
  habits: Habit[];
  reminders: Reminder[];
  fastingTargetHours: number;
  /** Food preferences used by the Nutrition Coach and Food Intelligence (never by the nutrition engine). */
  diet?: 'any' | 'vegetarian' | 'vegan';
  foodExclusions?: string[];
  /** Include progress photos in Google Drive backups (off by default — photos stay on the device). */
  backupPhotos: boolean;
  /** Cardio → calorie target: 'smart' (only justified extra cardio, see energy.ts) or 'off'. Saved targets never change. */
  cardioCalorieMode?: 'smart' | 'off';
  /** Share of justified extra cardio energy added back (0–100 %). Empty = automatic by goal. */
  cardioReplenishPct?: number | null;
  /** Fitness goals (Goals screen). */
  fitness?: FitnessGoals;
  updatedAt: number;
}

export interface FitnessGoals {
  resistanceDaysPerWeek: number;
  cardioSessionsPerWeek: number;
  cardioMinPerSession: number;
  /** Weekly hard-set target per muscle group (training goals). */
  setsPerMuscle?: number;
  experience?: 'beginner' | 'intermediate' | 'advanced';
  /** Available equipment for the program generator and exercise alternatives. */
  equipment?: string[];
  pullupsPerWeek?: number;
  dipsPerWeek?: number;
}

export interface OutboxItem {
  id?: number;
  table: string;
  key: string;
  op: 'upsert' | 'delete';
  payload?: unknown;
  at: number;
}
