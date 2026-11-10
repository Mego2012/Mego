/**
 * Cardio tracking — activity catalogue, energy-expenditure ESTIMATE, storage and statistics.
 *
 * Storage: each session is one record in the existing, already-synced key/value table (`kv`, key `cardio:<id>`).
 * No new table and no schema change: existing user data is never migrated or rewritten, and the live Firestore
 * rules and the Apps Script backend already accept `kv` records (owner-only, per account).
 *
 * Estimation (documented in docs/CARDIO-METHODOLOGY.md):
 *   kcal (gross) = MET × body weight (kg) × duration (h)       — 1 MET ≈ 1 kcal/kg/h (≈ 3.5 ml O2/kg/min)
 *   kcal (net)   = (MET − 1) × body weight (kg) × duration (h)  — excludes the resting energy the body uses anyway
 *   MET source, in this order:
 *     1. Walking / running with a speed: ACSM metabolic equations (speed and treadmill grade).
 *     2. Cycling (outdoor) with a speed: Compendium of Physical Activities speed bands.
 *     3. Otherwise: Compendium values for the activity at the chosen intensity.
 * Results are estimates (typically ±20–30 % for an individual) and are always labelled as such.
 */
import { db } from './db';
import { kvDelete, kvSet, uid } from './repo';
import type { BodyEntry, Settings } from './types';
import { addDays, today } from './dates';

export type CardioActivity =
  | 'walking' | 'treadmill_walk' | 'running' | 'cycling' | 'stationary_bike'
  | 'elliptical' | 'stair_climber' | 'swimming' | 'rowing' | 'other';
export type Intensity = 'light' | 'moderate' | 'vigorous';
export type CardioField = 'distance' | 'speed' | 'incline';
export type EstimateMethod = 'acsm_walk' | 'acsm_run' | 'compendium_speed' | 'compendium_intensity' | 'manual';

export interface CardioSession {
  id: string;
  activity: CardioActivity;
  /** Name for "other" activities. */
  customName?: string;
  /** Local date YYYY-MM-DD and time HH:MM when the session started. */
  date: string;
  time: string;
  durationMin: number;
  /** km for walking/running/cycling; metres are entered for swimming/rowing and stored here in km. */
  distanceKm?: number;
  speedKmh?: number;
  inclinePct?: number;
  intensity: Intensity;
  notes?: string;
  /** Calories burned typed in by the user (optional). When present it replaces the estimate. */
  manualKcal?: number;
  /** Values used for the estimate, stored so history and reports stay stable. */
  weightKg: number;
  met: number;
  method: EstimateMethod;
  kcal: number;
  netKcal: number;
  createdAt: number;
  updatedAt: number;
}

export interface ActivityDef {
  id: CardioActivity;
  /** Fields shown for this activity (duration, intensity, date, time and notes are always shown). */
  fields: CardioField[];
  /** Distance entry unit shown to the user. */
  distanceUnit?: 'km' | 'm';
  /** Compendium-based MET at light / moderate / vigorous effort. */
  met: Record<Intensity, number>;
  /** Plausible speed range (km/h) for validation. */
  speed?: [number, number];
}

/**
 * MET values: Compendium of Physical Activities (Ainsworth et al. 2011; Herrmann et al. 2024 adult update).
 * Where the Compendium has no separate light/vigorous entry the neighbouring value is used — see the methodology.
 */
export const ACTIVITIES: ActivityDef[] = [
  { id: 'walking', fields: ['distance', 'speed'], distanceUnit: 'km', met: { light: 2.8, moderate: 3.5, vigorous: 5.0 }, speed: [1, 9] },
  { id: 'treadmill_walk', fields: ['speed', 'incline', 'distance'], distanceUnit: 'km', met: { light: 2.8, moderate: 3.5, vigorous: 5.0 }, speed: [1, 25] },
  { id: 'running', fields: ['distance', 'speed'], distanceUnit: 'km', met: { light: 8.3, moderate: 9.8, vigorous: 11.8 }, speed: [4, 30] },
  { id: 'cycling', fields: ['distance', 'speed'], distanceUnit: 'km', met: { light: 4.0, moderate: 6.8, vigorous: 10.0 }, speed: [3, 70] },
  { id: 'stationary_bike', fields: [], met: { light: 3.5, moderate: 6.8, vigorous: 8.8 } },
  { id: 'elliptical', fields: [], met: { light: 4.0, moderate: 5.0, vigorous: 6.8 } },
  { id: 'stair_climber', fields: [], met: { light: 6.8, moderate: 9.0, vigorous: 11.0 } },
  { id: 'swimming', fields: ['distance'], distanceUnit: 'm', met: { light: 5.8, moderate: 7.0, vigorous: 9.8 } },
  { id: 'rowing', fields: ['distance'], distanceUnit: 'm', met: { light: 4.8, moderate: 7.0, vigorous: 8.5 } },
  { id: 'other', fields: [], met: { light: 3.0, moderate: 5.0, vigorous: 8.0 } }
];

export const activityDef = (a: CardioActivity): ActivityDef => ACTIVITIES.find((x) => x.id === a) ?? ACTIVITIES[ACTIVITIES.length - 1];

/** ACSM walking equation: VO2 (ml/kg/min) = 0.1·S + 1.8·S·G + 3.5, S in m/min, G as a fraction. */
export function acsmWalkMet(speedKmh: number, gradePct = 0): number {
  const s = (speedKmh * 1000) / 60;
  return (0.1 * s + 1.8 * s * (gradePct / 100) + 3.5) / 3.5;
}

/** ACSM running equation: VO2 (ml/kg/min) = 0.2·S + 0.9·S·G + 3.5. */
export function acsmRunMet(speedKmh: number, gradePct = 0): number {
  const s = (speedKmh * 1000) / 60;
  return (0.2 * s + 0.9 * s * (gradePct / 100) + 3.5) / 3.5;
}

/** Compendium bicycling (outdoor) by average speed. */
export function cyclingSpeedMet(speedKmh: number): number {
  if (speedKmh < 16) return 4.0;
  if (speedKmh < 19) return 6.8;
  if (speedKmh < 22.5) return 8.0;
  if (speedKmh < 25.7) return 10.0;
  if (speedKmh < 30.6) return 12.0;
  return 15.8;
}

export interface CardioInput {
  activity: CardioActivity;
  customName?: string;
  date: string;
  time: string;
  durationMin: number;
  distanceKm?: number;
  speedKmh?: number;
  inclinePct?: number;
  intensity: Intensity;
  notes?: string;
  manualKcal?: number;
}

/** Speed used for the estimate: entered speed, else distance ÷ duration (only for activities with a speed field). */
export function effectiveSpeed(i: Pick<CardioInput, 'activity' | 'durationMin' | 'distanceKm' | 'speedKmh'>): number | undefined {
  const def = activityDef(i.activity);
  if (!def.fields.includes('speed')) return undefined;
  if (i.speedKmh && i.speedKmh > 0) return i.speedKmh;
  if (i.distanceKm && i.distanceKm > 0 && i.durationMin > 0) return i.distanceKm / (i.durationMin / 60);
  return undefined;
}

export function estimateMet(i: CardioInput): { met: number; method: EstimateMethod } {
  const def = activityDef(i.activity);
  const speed = effectiveSpeed(i);
  const grade = i.activity === 'treadmill_walk' ? Math.max(0, i.inclinePct ?? 0) : 0;
  // Treadmill: ACSM walking equation below 7 km/h, running equation from 7 km/h (ACSM: walking ≤ 6 km/h, running ≥ 8 km/h).
  if (speed && i.activity === 'treadmill_walk' && speed >= 7) return { met: acsmRunMet(speed, grade), method: 'acsm_run' };
  if (speed && (i.activity === 'walking' || i.activity === 'treadmill_walk')) return { met: acsmWalkMet(speed, grade), method: 'acsm_walk' };
  if (speed && i.activity === 'running') return { met: acsmRunMet(speed), method: 'acsm_run' };
  if (speed && i.activity === 'cycling') return { met: cyclingSpeedMet(speed), method: 'compendium_speed' };
  return { met: def.met[i.intensity], method: 'compendium_intensity' };
}

export function estimateCalories(met: number, weightKg: number, durationMin: number): { kcal: number; netKcal: number } {
  const h = durationMin / 60;
  return { kcal: Math.round(met * weightKg * h), netKcal: Math.round(Math.max(0, met - 1) * weightKg * h) };
}

/** Body weight used for a session: the latest weigh-in on or before that date, else the profile weight. */
export function weightOn(date: string, body: BodyEntry[], settings: Pick<Settings, 'profile'>): number {
  const w = body.filter((b) => b.weight && b.date <= date).sort((a, b) => a.date.localeCompare(b.date)).pop()?.weight;
  return w ?? settings.profile.currentWeight;
}

/** Validation — returns keys of invalid fields (empty = valid). */
export function validateCardio(i: CardioInput): string[] {
  const errs: string[] = [];
  const def = activityDef(i.activity);
  if (!ACTIVITIES.some((a) => a.id === i.activity)) errs.push('activity');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) errs.push('date');
  if (!/^\d{2}:\d{2}$/.test(i.time)) errs.push('time');
  if (!(i.durationMin >= 1 && i.durationMin <= 600)) errs.push('duration');
  if (!['light', 'moderate', 'vigorous'].includes(i.intensity)) errs.push('intensity');
  if (i.activity === 'other' && !i.customName?.trim()) errs.push('name');
  if (i.distanceKm !== undefined && !(i.distanceKm > 0 && i.distanceKm <= 300)) errs.push('distance');
  if (i.speedKmh !== undefined && def.speed && !(i.speedKmh >= def.speed[0] && i.speedKmh <= def.speed[1])) errs.push('speed');
  if (i.inclinePct !== undefined && !(i.inclinePct >= 0 && i.inclinePct <= 40)) errs.push('incline');
  if (i.manualKcal !== undefined && !(i.manualKcal >= 0 && i.manualKcal <= 5000)) errs.push('kcal');
  const derived = effectiveSpeed({ ...i, speedKmh: undefined });
  if (!i.speedKmh && derived !== undefined && def.speed && !(derived >= def.speed[0] && derived <= def.speed[1])) errs.push('distance');
  return errs;
}

/** Keeps only the fields that belong to the activity (a switched activity never carries stale values). */
export function cleanInput(i: CardioInput): CardioInput {
  const def = activityDef(i.activity);
  return {
    activity: i.activity, date: i.date, time: i.time, durationMin: i.durationMin, intensity: i.intensity,
    customName: i.activity === 'other' ? i.customName?.trim() : undefined,
    distanceKm: def.fields.includes('distance') ? i.distanceKm : undefined,
    speedKmh: def.fields.includes('speed') ? i.speedKmh : undefined,
    inclinePct: def.fields.includes('incline') ? i.inclinePct : undefined,
    notes: i.notes?.trim() || undefined,
    manualKcal: i.manualKcal
  };
}

export function buildSession(input: CardioInput, weightKg: number, prev?: CardioSession): CardioSession {
  const i = cleanInput(input);
  const errs = validateCardio(i);
  if (errs.length) throw new Error('Invalid cardio session: ' + errs.join(', '));
  if (!(weightKg >= 20 && weightKg <= 400)) throw new Error('Invalid cardio session: weight');
  const est = estimateMet(i);
  const met = est.met;
  let method: EstimateMethod = est.method;
  let { kcal, netKcal } = estimateCalories(met, weightKg, i.durationMin);
  if (i.manualKcal !== undefined) {
    method = 'manual';
    kcal = Math.round(i.manualKcal);
    netKcal = Math.max(0, Math.round(i.manualKcal - weightKg * (i.durationMin / 60))); // minus ~1 MET resting
  }
  const now = Date.now();
  const rec: CardioSession = { ...i, id: prev?.id ?? uid(), weightKg, met: Math.round(met * 10) / 10, method, kcal, netKcal, createdAt: prev?.createdAt ?? now, updatedAt: now };
  // drop undefined keys so the stored JSON stays small
  return JSON.parse(JSON.stringify(rec));
}

/* ------------------------------------------------------------------ storage (kv table, synced) */

export const CARDIO_PREFIX = 'cardio:';

export async function listCardio(): Promise<CardioSession[]> {
  const rows = await db.kv.where('key').startsWith(CARDIO_PREFIX).toArray();
  return rows.map((r) => r.value as CardioSession).filter((s) => s && s.id && s.date)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

export async function saveCardio(input: CardioInput, weightKg: number, id?: string): Promise<CardioSession> {
  const prev = id ? ((await db.kv.get(CARDIO_PREFIX + id))?.value as CardioSession | undefined) : undefined;
  if (id && !prev) throw new Error('Cardio session not found');
  const rec = buildSession(input, weightKg, prev);
  await kvSet(CARDIO_PREFIX + rec.id, rec);
  return rec;
}

/** Deletes one cardio session (only that kv record — nothing else is touched). */
export async function deleteCardio(id: string) {
  await kvDelete(CARDIO_PREFIX + id);
}

/* ------------------------------------------------------------------ saved routine */

export const ROUTINE_KEY = 'cardioRoutine';
export type CardioRoutine = Pick<CardioInput, 'activity' | 'durationMin' | 'speedKmh' | 'inclinePct' | 'distanceKm' | 'intensity' | 'customName'>;
/** The owner's routine as given: treadmill, 10 min, 3.5 km/h, 13 % incline. Editable in the app. */
export const DEFAULT_ROUTINE: CardioRoutine = { activity: 'treadmill_walk', durationMin: 10, speedKmh: 3.5, inclinePct: 13, intensity: 'moderate' };

export async function getRoutine(): Promise<CardioRoutine> {
  const r = (await db.kv.get(ROUTINE_KEY))?.value as CardioRoutine | undefined;
  return r && r.activity ? r : DEFAULT_ROUTINE;
}

export async function saveRoutine(r: CardioRoutine): Promise<CardioRoutine> {
  const clean = cleanInput({ ...r, date: today(), time: '00:00' });
  const errs = validateCardio(clean);
  if (errs.length) throw new Error('Invalid routine: ' + errs.join(', '));
  const { date: _d, time: _t, notes: _n, manualKcal: _m, ...rest } = clean;
  const rec = JSON.parse(JSON.stringify(rest)) as CardioRoutine;
  await kvSet(ROUTINE_KEY, rec);
  return rec;
}

/* ------------------------------------------------------------------ statistics */

export interface CardioTotals { minutes: number; kcal: number; netKcal: number; sessions: number; activeDays: number; distanceKm: number }

export function totalsFor(sessions: CardioSession[], dates: string[]): CardioTotals {
  const set = new Set(dates);
  const s = sessions.filter((x) => set.has(x.date));
  return {
    minutes: s.reduce((a, x) => a + x.durationMin, 0),
    kcal: s.reduce((a, x) => a + x.kcal, 0),
    netKcal: s.reduce((a, x) => a + x.netKcal, 0),
    sessions: s.length,
    activeDays: new Set(s.map((x) => x.date)).size,
    distanceKm: Math.round(s.reduce((a, x) => a + (x.distanceKm ?? 0), 0) * 100) / 100
  };
}

export const datesBack = (n: number, end = today()) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));

export function dailyMinutes(sessions: CardioSession[], dates: string[]): { date: string; minutes: number; kcal: number }[] {
  return dates.map((date) => {
    const s = sessions.filter((x) => x.date === date);
    return { date, minutes: s.reduce((a, x) => a + x.durationMin, 0), kcal: s.reduce((a, x) => a + x.kcal, 0) };
  });
}

/** Trend: this period vs the previous one of the same length, plus the most frequent activity. */
export function cardioTrends(sessions: CardioSession[], days = 7, end = today()) {
  const cur = totalsFor(sessions, datesBack(days, end));
  const prev = totalsFor(sessions, datesBack(days, addDays(end, -days)));
  const recent = sessions.filter((x) => x.date > addDays(end, -30) && x.date <= end);
  const count = new Map<string, number>();
  for (const s of recent) count.set(s.activity, (count.get(s.activity) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as CardioActivity | undefined;
  return {
    current: cur, previous: prev,
    minutesDelta: cur.minutes - prev.minutes,
    avgSessionMin: recent.length ? Math.round(recent.reduce((a, x) => a + x.durationMin, 0) / recent.length) : null,
    topActivity: top ?? null
  };
}

/** WHO guideline: 150–300 min/week of moderate activity (or 75–150 vigorous). Used only as an informational marker. */
export const WHO_WEEKLY_MIN = 150;


/** Cardio section of a weekly/monthly report: totals for the period, the previous period and goal progress. */
export function cardioReport(sessions: CardioSession[], dates: string[], prevDates: string[], weeklyGoalMin: number) {
  const cur = totalsFor(sessions, dates);
  const prev = totalsFor(sessions, prevDates);
  const goal = Math.round((weeklyGoalMin * dates.length) / 7);
  return {
    ...cur,
    avgSessionMin: cur.sessions ? Math.round(cur.minutes / cur.sessions) : null,
    prevMinutes: prev.minutes,
    minutesDelta: cur.minutes - prev.minutes,
    goalMin: goal,
    goalPct: goal > 0 ? Math.min(100, Math.round((cur.minutes / goal) * 100)) : null
  };
}
