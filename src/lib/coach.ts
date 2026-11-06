/**
 * Nutrition Coach — every message is computed from the user's own logged data (their diary, targets, goal and food
 * preferences). Nothing is shown when the data is insufficient; "general guidance" messages are labelled as such
 * and carry their source. Suggestions never change targets or diary entries.
 */
import { addDays } from './dates';
import { excludedTags, tagsOf, type DietTag } from './intelCatalog';
import { goalClass, rankFoods, type IntelFood } from './foodIntel';
import { compare, monthReport, progressEstimate, summarizeDay, weekReport, type DataBundle, type DaySummary, type PeriodReport } from './reports';
import type { Macros } from './types';

export type CoachLevel = 'good' | 'warn' | 'info';
/** "data": computed from the user's logs. "guidance": general evidence-based guidance (with a source key). */
export interface CoachMessage { id: string; level: CoachLevel; key: string; params: Record<string, string | number>; basis: 'data' | 'guidance'; sourceKey?: string; foods?: FoodSuggestion[] }
export interface FoodSuggestion { food: IntelFood; grams: number; macros: Macros; reasonKey: string }

/** WHO (2023) guideline: adults ≥ 25 g naturally occurring dietary fibre per day. */
export const FIBER_TARGET_G = 25;
const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;

export function allowedFoods(foods: IntelFood[], diet: 'any' | 'vegetarian' | 'vegan' = 'any', exclusions: string[] = []): IntelFood[] {
  const ex = excludedTags(diet, exclusions as DietTag[]);
  return foods.filter((f) => !tagsOf(f.item.id).some((t) => ex.has(t)));
}

function contribution(f: IntelFood, grams: number): Macros {
  const k = grams / 100;
  return { kcal: r0(f.kcal * k), protein: r1(f.protein * k), carbs: r1(f.carbs * k), fat: r1(f.fat * k), ...(f.fiber !== undefined ? { fiber: r1(f.fiber * k) } : {}) };
}
const roundG = (g: number) => Math.max(5, Math.round(g / 5) * 5);

/** Foods that cover a protein gap within the remaining calories, best first. */
/** A single meal portion targets at most this much protein; larger gaps are spread over meals (said in the message). */
export const MEAL_PROTEIN_G = 45;
export function proteinOptions(gapTotal: number, kcalLeft: number, foods: IntelFood[], goal: ReturnType<typeof goalClass>, maxFat?: number, n = 5): FoodSuggestion[] {
  const out: FoodSuggestion[] = [];
  const gap = Math.min(gapTotal, MEAL_PROTEIN_G);
  for (const r of rankFoods(foods, 'protein', goal)) {
    const f = r.food;
    if (f.protein < 5) continue;
    if (maxFat !== undefined && f.fat > maxFat) continue;
    const grams = roundG((gap / f.protein) * 100);
    if (grams > 450) continue; // not a realistic portion
    const m = contribution(f, grams);
    if (kcalLeft > 0 && m.kcal > kcalLeft * 1.05) continue;
    out.push({ food: f, grams, macros: m, reasonKey: maxFat !== undefined ? 'why_leanProtein' : 'why_proteinGap' });
    if (out.length >= n) break;
  }
  return out;
}

export interface Combo { items: FoodSuggestion[]; total: Macros; deviation: number }
/**
 * Combinations of one protein, one carbohydrate and one fat food that best complete the remaining macros.
 * Grams are solved sequentially (carbs → protein → fat), rounded to 5 g, and the exact contribution is shown.
 */
export function completeMacros(remaining: Macros, foods: IntelFood[], goal: ReturnType<typeof goalClass>, n = 3): Combo[] {
  if (remaining.kcal < 80) return [];
  const P = rankFoods(foods, 'protein', goal).map((r) => r.food).filter((f) => f.protein >= 9 && f.fat < 12).slice(0, 8);
  const C = rankFoods(foods, 'carb', goal).map((r) => r.food).filter((f) => f.carbs >= 15 && f.protein < 10).slice(0, 8);
  const Fa = rankFoods(foods, 'fat', goal).map((r) => r.food).filter((f) => f.fat >= 40).slice(0, 6);
  const combos: Combo[] = [];
  for (const p of P) for (const c of C) for (const fa of [null, ...Fa]) {
    const gc = remaining.carbs > 5 ? roundG((remaining.carbs / c.carbs) * 100) : 0;
    const pFromC = (c.protein * gc) / 100;
    const gp = remaining.protein - pFromC > 3 ? roundG(((remaining.protein - pFromC) / p.protein) * 100) : 0;
    const fatSoFar = (c.fat * gc + p.fat * gp) / 100;
    const gf = fa && remaining.fat - fatSoFar > 3 ? roundG(((remaining.fat - fatSoFar) / fa.fat) * 100) : 0;
    if (gc > 500 || gp > 450 || gf > 60) continue;
    const items: FoodSuggestion[] = [];
    if (gp) items.push({ food: p, grams: gp, macros: contribution(p, gp), reasonKey: 'why_proteinGap' });
    if (gc) items.push({ food: c, grams: gc, macros: contribution(c, gc), reasonKey: 'why_carbs' });
    if (fa && gf) items.push({ food: fa, grams: gf, macros: contribution(fa, gf), reasonKey: 'why_fats' });
    if (!items.length) continue;
    const total = items.reduce((t, i) => ({ kcal: t.kcal + i.macros.kcal, protein: r1(t.protein + i.macros.protein), carbs: r1(t.carbs + i.macros.carbs), fat: r1(t.fat + i.macros.fat) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 } as Macros);
    if (total.kcal > remaining.kcal * 1.1) continue;
    const dev = Math.abs(total.protein - remaining.protein) / Math.max(remaining.protein, 10) + Math.abs(total.carbs - remaining.carbs) / Math.max(remaining.carbs, 10)
      + Math.abs(total.fat - remaining.fat) / Math.max(remaining.fat, 5);
    combos.push({ items, total, deviation: r1(dev) });
  }
  combos.sort((a, b) => a.deviation - b.deviation);
  // keep variety: no two combos with the same protein food
  const out: Combo[] = [];
  for (const c of combos) {
    if (out.some((o) => o.items[0]?.food.item.id === c.items[0]?.food.item.id)) continue;
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

function fiberKnown(day: DaySummary) { return day.entryCount > 0 && day.coverage.fiber === day.entryCount; }

/** Today's coaching (or any date). */
export function dailyCoach(data: DataBundle, date: string, foods: IntelFood[]): CoachMessage[] {
  const s = data.settings;
  const goal = goalClass(s.profile.goalType);
  const allowed = allowedFoods(foods, s.diet ?? 'any', s.foodExclusions ?? []);
  const day = summarizeDay(date, data.entries.filter((e) => e.date === date), data.days.find((d) => d.date === date), s);
  const out: CoachMessage[] = [];
  if (!day.entryCount) {
    out.push({ id: 'nolog', level: 'info', key: 'co_noLogToday', params: { kcal: r0(day.target.kcal), p: r0(day.target.protein) }, basis: 'data' });
    return out;
  }
  const rem = day.remaining;
  if (rem.protein > 10) {
    out.push({ id: 'protein', level: 'warn', key: rem.protein > MEAL_PROTEIN_G ? 'co_proteinShortMeals' : 'co_proteinShort', params: { g: r0(rem.protein), kcal: r0(Math.max(0, rem.kcal)), meal: MEAL_PROTEIN_G }, basis: 'data',
      foods: proteinOptions(rem.protein, Math.max(0, rem.kcal), allowed, goal) });
  } else if (day.totals.protein >= day.target.protein * 0.95) {
    out.push({ id: 'protein-ok', level: 'good', key: 'co_proteinDone', params: { g: r0(day.totals.protein) }, basis: 'data' });
  }
  if (day.target.fat > 0 && day.totals.fat >= day.target.fat * 0.9 && rem.protein > 15) {
    out.push({ id: 'fat', level: 'warn', key: 'co_fatNearLimit', params: { g: r0(day.totals.fat), t: r0(day.target.fat) }, basis: 'data',
      foods: proteinOptions(rem.protein, Math.max(0, rem.kcal), allowed, goal, 3, 4) });
  }
  if (rem.kcal < -50) out.push({ id: 'over', level: 'warn', key: 'co_overCalories', params: { kcal: r0(-rem.kcal) }, basis: 'data' });
  if (fiberKnown(day)) {
    const fib = day.totals.fiber ?? 0;
    if (fib < FIBER_TARGET_G) out.push({ id: 'fiber', level: 'info', key: 'co_fiberToday', params: { g: r1(fib), t: FIBER_TARGET_G }, basis: 'data', sourceKey: 'src_whoCarb' });
  } else if (day.entryCount) {
    out.push({ id: 'fiber-unknown', level: 'info', key: 'co_fiberUnknown', params: { n: day.coverage.fiber, total: day.entryCount }, basis: 'data' });
  }
  return out;
}

export interface WeeklyReview { report: PeriodReport; messages: CoachMessage[]; enough: boolean }
/** Weekly review: consistency, diversity, fibre, repeated problems and improvements vs the previous week. */
export function weeklyCoach(data: DataBundle, date: string): WeeklyReview {
  const report = weekReport(date, data);
  const prev = weekReport(addDays(date, -7), data);
  const msgs: CoachMessage[] = [];
  const enough = report.completeDays >= 3;
  if (!enough) {
    msgs.push({ id: 'w-few', level: 'info', key: 'co_weekNotEnough', params: { n: report.completeDays }, basis: 'data' });
    return { report, messages: msgs, enough };
  }
  const n = report.basisDays;
  msgs.push({ id: 'w-cal', level: (report.calorieConsistencyPct ?? 0) >= 70 ? 'good' : 'warn', key: 'co_weekCalories', params: { pct: report.calorieConsistencyPct ?? 0, n }, basis: 'data' });
  if (report.proteinHitDays < n / 2) msgs.push({ id: 'w-prot', level: 'warn', key: 'co_weekProteinLow', params: { hit: report.proteinHitDays, n }, basis: 'data' });
  else msgs.push({ id: 'w-prot', level: 'good', key: 'co_weekProteinOk', params: { hit: report.proteinHitDays, n }, basis: 'data' });
  if (report.avgFiber !== null) {
    msgs.push({ id: 'w-fib', level: report.avgFiber >= FIBER_TARGET_G ? 'good' : 'warn', key: report.avgFiber >= FIBER_TARGET_G ? 'co_weekFiberOk' : 'co_weekFiberLow', params: { g: r1(report.avgFiber), t: FIBER_TARGET_G }, basis: 'data', sourceKey: 'src_whoCarb' });
  }
  // diversity from the complete days' entries
  const completeDates = new Set(report.days.filter((d) => d.status === 'complete').map((d) => d.date));
  const entries = data.entries.filter((e) => completeDates.has(e.date));
  const distinct = new Set(entries.map((e) => e.foodId ?? e.recipeId ?? e.name)).size;
  const proteinBy = new Map<string, number>();
  for (const e of entries) proteinBy.set(e.name, (proteinBy.get(e.name) ?? 0) + e.macros.protein);
  const totalP = [...proteinBy.values()].reduce((a, b) => a + b, 0);
  const [topName, topP] = [...proteinBy.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  if (totalP > 0 && topP / totalP > 0.45) msgs.push({ id: 'w-rep', level: 'info', key: 'co_weekRepetitive', params: { name: topName, pct: r0((topP / totalP) * 100) }, basis: 'data' });
  msgs.push({ id: 'w-div', level: distinct >= 15 ? 'good' : 'info', key: 'co_weekDiversity', params: { n: distinct }, basis: 'data' });
  if (report.overCalorieDays >= 3) msgs.push({ id: 'w-over', level: 'warn', key: 'co_weekOver', params: { n: report.overCalorieDays }, basis: 'data' });
  if (prev.completeDays >= 3) {
    const c = compare(report, prev);
    if ((report.calorieConsistencyPct ?? 0) > (prev.calorieConsistencyPct ?? 0) + 10) msgs.push({ id: 'w-imp-cal', level: 'good', key: 'co_improvedCalories', params: { from: prev.calorieConsistencyPct ?? 0, to: report.calorieConsistencyPct ?? 0 }, basis: 'data' });
    if (report.proteinHitDays > prev.proteinHitDays) msgs.push({ id: 'w-imp-prot', level: 'good', key: 'co_improvedProtein', params: { from: prev.proteinHitDays, to: report.proteinHitDays }, basis: 'data' });
    void c;
  }
  return { report, messages: msgs, enough };
}

/** Monthly: long-term trend and goal progress. Suggestions only — targets are never changed automatically. */
export function monthlyCoach(data: DataBundle, month: string, today: string): CoachMessage[] {
  const report = monthReport(month, data);
  const s = data.settings;
  const msgs: CoachMessage[] = [];
  if (report.completeDays < 8) return [{ id: 'm-few', level: 'info', key: 'co_monthNotEnough', params: { n: report.completeDays }, basis: 'data' }];
  if (report.averages && report.averageTarget) {
    const diff = r0(report.averages.kcal - report.averageTarget.kcal);
    msgs.push({ id: 'm-cal', level: Math.abs(diff) <= report.averageTarget.kcal * 0.05 ? 'good' : 'info', key: 'co_monthCalories', params: { avg: r0(report.averages.kcal), t: r0(report.averageTarget.kcal), diff }, basis: 'data' });
  }
  const w = report.weight;
  const change = w.start !== null && w.end !== null && w.count >= 2 ? w.end - w.start : null;
  if (change !== null) {
    const goal = goalClass(s.profile.goalType);
    const expected = goal === 'cut' ? 'down' : goal === 'build' ? 'up' : 'stable';
    const dir = change < -0.3 ? 'down' : change > 0.3 ? 'up' : 'stable';
    msgs.push({ id: 'm-w', level: dir === expected ? 'good' : 'warn', key: dir === expected ? 'co_monthWeightOnTrack' : 'co_monthWeightOffTrack', params: { change: r1(change), goal: s.profile.goalType }, basis: 'data' });
    if (dir !== expected && goal !== 'maintain') msgs.push({ id: 'm-adj', level: 'info', key: goal === 'cut' ? 'co_suggestReduce' : 'co_suggestIncrease', params: {}, basis: 'guidance', sourceKey: 'src_helms' });
  }
  const est = progressEstimate(data.body, s.profile.targetWeight, today);
  if (est.ratePerWeek !== null) msgs.push({ id: 'm-rate', level: est.pace === 'fast' ? 'warn' : 'info', key: est.pace === 'fast' ? 'co_monthRateFast' : 'co_monthRate', params: { rate: r1(est.ratePerWeek), pct: r1(est.ratePctPerWeek ?? 0) }, basis: 'data', sourceKey: est.pace === 'fast' ? 'src_helms' : undefined });
  return msgs;
}

/** One daily tip (general guidance with source), rotating deterministically by date. */
export const TIPS = ['tip_proteinSpread', 'tip_vegHalfPlate', 'tip_fiberLegumes', 'tip_hydration', 'tip_weighCooked', 'tip_oilMeasure', 'tip_sleep', 'tip_fruitWhole', 'tip_salt', 'tip_planAhead'];
export function tipOfDay(date: string): string {
  const n = Number(date.replace(/-/g, '')) || 0;
  return TIPS[n % TIPS.length];
}
