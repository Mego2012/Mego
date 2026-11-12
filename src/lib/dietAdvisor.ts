/**
 * Diet Advisor — recommends a diet strategy and reviews progress from the user's OWN tracked data.
 *
 * This is transparent, rule-based logic that runs on the device (no external AI service, no cost). Every reason is
 * marked with its basis:
 *   - 'data'      → inferred from the user's records (food log, weigh-ins, waist, workouts, check-ins, recovery);
 *   - 'guideline' → established nutrition guidance (e.g. protein 1.6–2.2 g/kg for active people, fat loss of about
 *                   0.5–1 % of body weight per week to preserve muscle, carbohydrate availability for hard training).
 * Nothing is ever applied automatically; the UI asks the user to confirm each change.
 *
 * Calorie target: when there is enough data (≥ 14 complete logged days in 4 weeks and ≥ 6 weigh-ins) maintenance is
 * estimated from the user's own balance — average intake minus the weight trend × 7,700 kcal/kg — and only accepted
 * within ±25 % of the formula (Mifflin-St Jeor × activity); otherwise the formula is used. The goal adjustment of the
 * nutrition engine (goals.ts) is applied on top. A saved target within ±5 % is kept as it is (stability).
 */
import { datesBack, totalsFor, type CardioSession } from './cardio';
import { addDays, today } from './dates';
import { computeMacros, cycleTargets, dayFloor, defaultSchedule, lowCarbDefault, strategyTargets, type CycleLevel, type DietMode, type DietStrategy } from './dietStrategy';
import { fitnessOf } from './energy';
import { bmrOf, GOAL_RULES, tdeeOf } from './goals';
import type { CheckIn } from './goalAdvisor';
import { buildPeriod, rollingWeightAverage, type DataBundle } from './reports';
import { currentPeriod, periodResult, TRIAL_FULL_DAYS, TRIAL_MIN_DAYS, type PeriodResult, type StrategyPeriod } from './dietHistory';
import { exerciseHistory, exerciseTrend } from './trainingCoach';
import type { Macros } from './types';
import { isCompleted, type Program, type RecoveryLog, type WorkoutSession } from './workouts';

export type Basis = 'data' | 'guideline';
export interface Reason { key: string; params?: Record<string, string | number>; basis: Basis }
export interface StrategyOption {
  mode: DietMode;
  score: number;
  targets: Macros;
  cycle?: { schedule: CycleLevel[]; levels: Record<CycleLevel, Macros> };
  why: Reason[];
  pros: string[];
  cons: string[];
  strategy: DietStrategy;
}
export type AdjustAction = { kind: 'kcal'; delta: number } | { kind: 'mode'; mode: DietMode } | { kind: 'maintain' };
export interface Adjustment { id: string; key: string; params?: Record<string, string | number>; level: 'info' | 'good' | 'warn'; basis: Basis; action?: AdjustAction }
export interface Signals {
  weight: number; heightCm: number; age: number; sex: string; bmi: number; whtr: number | null; waist: number | null;
  goal: string; goalGroup: 'loss' | 'gain' | 'maintain'; activity: string;
  trainingPerWeek: number; plannedTraining: number; cardioMinWeek: number;
  completeDays: number; weighIns: number; adherencePct: number | null;
  intake: Macros | null; carbShare: number | null; proteinPerKg: number | null;
  /** Trend from 7-day weight averages (weekly points); weeks = number of consecutive weeks with ≥ 2 weigh-ins. */
  ratePerWeek: number | null; ratePctPerWeek: number | null; trendWeeks: number;
  hunger: number | null; recovery: number | null; strength: CheckIn['strength'] | null; energy: number | null; sleepH: number | null;
  liftsUp: number; liftsDown: number;
  /** Waist change over the last 28 days (first vs last measurement), cm. */
  waistChange: number | null;
  /** 'current' = the user's own protein target was kept (within 1.6–2.4 g/kg); 'goal' = set from goal and training. */
  proteinBasis: 'current' | 'goal';
  formulaTdee: number; dataTdee: number | null; tdee: number; tdeeBasis: Basis;
  kcal: number; protein: number; currentKcal: number; kcalFloor: number;
  /** kept = current target kept; adjusted = current ± a step from your results; formula = from maintenance × goal. */
  kcalBasis: 'kept' | 'adjusted' | 'formula'; formulaKcal: number;
  /** Days since the last strategy or calorie change (null = none recorded) and whether its 14-day evaluation is running. */
  sinceChange: number | null; hold: boolean;
}
export interface Trial { mode: DietMode; start: string; day: number; evalDate: string; done: boolean; verdict: 'effective' | 'notEffective' | 'inconclusive' | 'muscleRisk' | null }
export interface AdvisorResult {
  signals: Signals; confidence: 'low' | 'medium' | 'high'; recommended: StrategyOption; alternatives: StrategyOption[]; options: StrategyOption[]; adjustments: Adjustment[];
  trial: Trial | null; results: { current: PeriodResult | null; previous: PeriodResult | null };
}
export interface AdvisorInput { data: DataBundle; workouts: WorkoutSession[]; program?: Program; cardio: CardioSession[]; recovery: RecoveryLog[]; checkins: CheckIn[]; history?: StrategyPeriod[]; date?: string }

const LOSS = new Set(['fat_loss', 'fat_loss_preserve', 'recomp']);
const GAIN = new Set(['lean_bulk', 'bulk', 'performance']);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number) => Math.round(x * 10) / 10;

export const PROS: Record<DietMode, string[]> = {
  flexible: ['da_p_flexible1', 'da_p_flexible2'], low_carb: ['da_p_low1', 'da_p_low2'], keto: ['da_p_keto1', 'da_p_keto2'],
  carb_cycling: ['da_p_cycle1', 'da_p_cycle2'], high_protein: ['da_p_hp1', 'da_p_hp2'], custom: ['da_p_custom1']
};
export const CONS: Record<DietMode, string[]> = {
  flexible: ['da_c_flexible1'], low_carb: ['da_c_low1', 'da_c_low2'], keto: ['da_c_keto1', 'da_c_keto2', 'da_c_keto3'],
  carb_cycling: ['da_c_cycle1', 'da_c_cycle2'], high_protein: ['da_c_hp1'], custom: ['da_c_custom1']
};

/** Carb-cycling week from the workout program: leg/back days high, other training days moderate, rest days rest. */
export function scheduleFromProgram(program: Program | undefined, trainingWeekdays: number[], weekStartsOn: number): CycleLevel[] {
  const days = program?.days.filter((d) => d.weekday >= 0) ?? [];
  if (!days.length) return defaultSchedule(trainingWeekdays, weekStartsOn);
  const s: CycleLevel[] = Array(7).fill('rest');
  for (const d of days) {
    if (d.rest) { s[d.weekday] = 'rest'; continue; }
    const big = d.muscles.some((m) => ['quads', 'hamstrings', 'glutes', 'back'].includes(m));
    s[d.weekday] = big ? 'high' : 'moderate';
  }
  for (let wd = 0; wd < 7; wd++) if (!days.some((d) => d.weekday === wd) && trainingWeekdays.includes(wd)) s[wd] = 'moderate';
  return s;
}

/**
 * Weight trend from 7-day averages, never from single weigh-ins: up to 4 consecutive weeks ending today, each week
 * needing ≥ 2 weigh-ins; the rate is the least-squares slope through the weekly averages (kg per week).
 */
export function weeklyTrend(body: DataBundle['body'], date: string): { weeks: number; ratePerWeek: number | null; current: number | null } {
  const pts: number[] = [];
  for (let k = 0; k < 4; k++) {
    const end = addDays(date, -7 * k);
    const n = body.filter((b) => b.weight && !b.deleted && b.date > addDays(end, -7) && b.date <= end).length;
    if (n < 2) break;
    pts.push(rollingWeightAverage(body.filter((b) => !b.deleted), end)!);
  }
  const current = pts[0] ?? rollingWeightAverage(body.filter((b) => !b.deleted), date);
  if (pts.length < 2) return { weeks: pts.length, ratePerWeek: null, current };
  const xs = pts.map((_, i) => -i), mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = pts.reduce((a, b) => a + b, 0) / pts.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (pts[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return { weeks: pts.length, ratePerWeek: Math.round(slope * 100) / 100, current };
}

/** Safety floor for any recommended daily target: the resting rate and an absolute minimum (1,500 men / 1,200 women). */
export function calorieFloor(p: DataBundle['settings']['profile'], weight: number): number {
  return Math.max(bmrOf({ ...p, currentWeight: weight }), p.sex === 'male' ? 1500 : 1200);
}

export function readSignals(inp: AdvisorInput): Signals {
  const date = inp.date ?? today();
  const s = inp.data.settings, p = s.profile;
  const tr = weeklyTrend(inp.data.body, date);
  const weighIns = inp.data.body.filter((b) => b.weight && !b.deleted && b.date > addDays(date, -28) && b.date <= date).length;
  const weight = tr.current ?? p.currentWeight;
  const period = buildPeriod('month', '', datesBack(28, date), inp.data, date);
  const recent = buildPeriod('week', '', datesBack(14, date), inp.data, date);
  const intake = period.averages;
  const waists = inp.data.body.filter((b) => b.waist && !b.deleted && b.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const waist = waists.length ? waists[waists.length - 1].waist! : null;
  const done = inp.workouts.filter((w) => isCompleted(w) && w.date > addDays(date, -28) && w.date <= date);
  const fit = fitnessOf(s);
  const cardio = totalsFor(inp.cardio, datesBack(28, date));
  const checks = [...inp.checkins].filter((c) => c.week <= date && c.week > addDays(date, -28)).sort((a, b) => a.week.localeCompare(b.week));
  const lastTwo = checks.slice(-2);
  const rec = inp.recovery.filter((r) => r.date > addDays(date, -14) && r.date <= date);
  // performance: trend of every exercise logged in the last 8 weeks
  const ids = [...new Set(inp.workouts.filter((w) => w.date > addDays(date, -56)).flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
  let liftsUp = 0, liftsDown = 0;
  for (const id of ids) { const tr = exerciseTrend(exerciseHistory(id, inp.workouts.filter((w) => w.date <= date))).trend; if (tr === 'improving') liftsUp++; if (tr === 'declining') liftsDown++; }
  const prof = { ...p, currentWeight: weight };
  const formulaTdee = tdeeOf(prof);
  let dataTdee: number | null = null;
  // maintenance from the user's own balance: ≥ 14 complete days and a trend over ≥ 3 weekly averages (2+ weeks)
  if (period.completeDays >= 14 && tr.weeks >= 3 && tr.ratePerWeek !== null && intake) {
    const t = Math.round((intake.kcal - (tr.ratePerWeek * 7700) / 7) / 10) * 10;
    if (Math.abs(t - formulaTdee) / formulaTdee <= 0.25) dataTdee = t;
  }
  const tdee = dataTdee ?? formulaTdee;
  const goalGroup = LOSS.has(p.goalType) ? 'loss' : GAIN.has(p.goalType) ? 'gain' : 'maintain';
  const rule = p.goalType === 'custom' ? { adjust: 0 } : GOAL_RULES[p.goalType];
  // safety: never below the floor; a fat-loss deficit stays between 10 % and 25 % of maintenance
  const kcalFloor = calorieFloor(p, weight);
  const lo = goalGroup === 'loss' ? Math.max(kcalFloor, Math.ceil((tdee * 0.75) / 10) * 10) : kcalFloor;
  const hi = goalGroup === 'loss' ? Math.floor((tdee * 0.9) / 10) * 10 : Infinity;
  // the minimum always wins over the fat-loss ceiling (small, sedentary people: no deficit below the floor)
  const clamp = (x: number) => Math.max(lo, Math.min(hi, x));
  const formulaKcal = clamp(Math.round((tdee * (1 + rule.adjust)) / 10) * 10);
  const currentKcal = s.targets.training.kcal;
  // Calories start from the user's CURRENT target and move only in small, evidence-based steps:
  //  - with ≥ 3 weekly averages and ≥ 70 % adherence over ≥ 14 logged days, the result decides: on track → keep;
  //    loss stalled (≥ 4 weeks) → −150; losing > 1 %/week → +150; gain stalled → +150; gaining > 0.5 %/week → −100;
  //    maintenance drifting > 0.25 kg/week (≥ 4 weeks) → ±100;
  //  - without that data, a current target within ±15 % of the formula target (and inside the safety limits) is kept;
  //    otherwise the formula target is proposed.
  const adherent28 = period.completeDays >= 14 && period.caloriesInRangeDays / period.completeDays >= 0.7;
  // evaluation window: within 14 days of the last strategy or calorie change, only the safety step (+) is allowed
  const lastChange = (() => { const h = inp.history ?? []; const open = h.length && !h[h.length - 1].end ? h[h.length - 1].start : null; return open ?? (s.dietStrategy?.appliedAt ? new Date(s.dietStrategy.appliedAt).toISOString().slice(0, 10) : null); })();
  const sinceChange = lastChange ? Math.round((new Date(date + 'T12:00').getTime() - new Date(lastChange + 'T12:00').getTime()) / 86400000) + 1 : null;
  const hold = sinceChange !== null && sinceChange < 14;
  let kcal: number;
  let kcalBasis: 'kept' | 'adjusted' | 'formula';
  if (adherent28 && tr.weeks >= 3 && tr.ratePerWeek !== null) {
    const r = tr.ratePerWeek, pct = (r / weight) * 100;
    let d = 0;
    if (goalGroup === 'loss') d = pct < -1 ? 150 : r > -0.1 && tr.weeks >= 4 ? -150 : 0;
    else if (goalGroup === 'gain') d = r < 0.05 && tr.weeks >= 4 ? 150 : pct > 0.5 ? -100 : 0;
    else if (Math.abs(r) > 0.25 && tr.weeks >= 4) d = r < 0 ? 100 : -100;
    if (hold && d < 0) d = 0;
    // during the 14-day evaluation window the current target stays (only the safety floor / a safety increase applies)
    kcal = hold && d === 0 ? Math.max(lo, currentKcal) : clamp(currentKcal + d);
    kcalBasis = d === 0 && kcal === currentKcal ? 'kept' : 'adjusted';
  } else if (Math.abs(formulaKcal - currentKcal) / Math.max(currentKcal, 1) <= 0.15 && currentKcal === clamp(currentKcal)) {
    kcal = currentKcal; kcalBasis = 'kept';
  } else { kcal = formulaKcal; kcalBasis = 'formula'; }
  const bmi = weight / ((p.heightCm / 100) ** 2);
  // protein: a personal target already within 1.6–2.4 g/kg is kept; otherwise from goal and training load
  // (fat loss while preserving muscle / recomposition or ≥ 3 sessions a week → 2.2 g/kg; other fat loss 2.0;
  //  maintenance 1.8 with ≥ 4 sessions, else 1.6; gain 1.8). Very high BMI (≥ 30): grams from the goal weight.
  const proteinBase = bmi >= 30 ? p.targetWeight || weight : weight;
  const sessions = Math.max(done.length / 4, fit.resistanceDaysPerWeek);
  const goalPerKg = goalGroup === 'loss' ? (p.goalType === 'fat_loss_preserve' || p.goalType === 'recomp' || sessions >= 3 ? 2.2 : 2.0)
    : goalGroup === 'gain' ? 1.8 : sessions >= 4 ? 1.8 : 1.6;
  const curPerKg = s.targets.training.protein / proteinBase;
  // fat loss while preserving muscle / recomposition: an own target is kept from 1.8 g/kg (else 2.2 is proposed)
  const keepOwn = curPerKg >= (goalPerKg >= 2.2 ? 1.8 : 1.6) && curPerKg <= 2.4;
  const protein = keepOwn ? s.targets.training.protein : Math.round(proteinBase * goalPerKg);
  const w28 = waists.filter((b) => b.date > addDays(date, -28));
  const waistChange = w28.length >= 2 ? r1(w28[w28.length - 1].waist! - w28[0].waist!) : null;
  return {
    weight: r1(weight), heightCm: p.heightCm, age: p.age, sex: p.sex, bmi: r1(bmi), waist, whtr: waist ? Math.round((waist / p.heightCm) * 100) / 100 : null,
    goal: p.goalType, goalGroup, activity: p.activityLevel ?? 'moderate',
    trainingPerWeek: r1(done.length / 4), plannedTraining: fit.resistanceDaysPerWeek, cardioMinWeek: Math.round(cardio.minutes / 4),
    completeDays: period.completeDays, weighIns,
    adherencePct: recent.completeDays ? Math.round((recent.caloriesInRangeDays / recent.completeDays) * 100) : null,
    intake, carbShare: intake && intake.kcal ? Math.round(((intake.carbs * 4) / intake.kcal) * 100) : null,
    proteinPerKg: intake ? r1(intake.protein / weight) : null,
    ratePerWeek: tr.ratePerWeek, ratePctPerWeek: tr.ratePerWeek !== null ? Math.round((tr.ratePerWeek / weight) * 10000) / 100 : null, trendWeeks: tr.weeks,
    hunger: avg(lastTwo.map((c) => c.hunger)), recovery: avg(lastTwo.map((c) => c.recovery)), strength: checks.length ? checks[checks.length - 1].strength : null,
    energy: avg(rec.map((r) => r.energy).filter((x): x is number => x != null)), sleepH: avg(rec.map((r) => r.sleepH).filter((x): x is number => x != null)),
    liftsUp, liftsDown, waistChange, proteinBasis: keepOwn ? 'current' : 'goal', formulaTdee, dataTdee, tdee, tdeeBasis: dataTdee ? 'data' : 'guideline', kcal, protein, currentKcal, kcalFloor, kcalBasis, formulaKcal, sinceChange, hold
  };
}

function option(mode: DietMode, sg: Signals, inp: AdvisorInput): StrategyOption {
  const s = inp.data.settings;
  const why: Reason[] = [];
  let score = 0;
  const training = Math.max(sg.trainingPerWeek, sg.plannedTraining);
  const adherent = sg.adherencePct !== null && sg.adherencePct >= 70 && sg.completeDays >= 8;
  const lowAdherence = sg.adherencePct !== null && sg.adherencePct < 60 && sg.completeDays >= 5;
  const perfDown = sg.strength === 'down' || sg.liftsDown >= 2 && sg.liftsDown > sg.liftsUp;
  const hungry = sg.hunger !== null && sg.hunger >= 4;
  const habitLowCarb = sg.carbShare !== null && sg.carbShare < 30 && sg.completeDays >= 8;
  const add = (pts: number, key: string, basis: Basis, params?: Reason['params']) => { score += pts; why.push({ key, basis, params }); };
  const kg = sg.weight;
  let targets: Macros;
  let cycle: StrategyOption['cycle'];
  switch (mode) {
    case 'flexible': {
      score = 60;
      add(0, 'da_w_flexBase', 'guideline');
      if (adherent) add(10, 'da_w_adherent', 'data', { pct: sg.adherencePct! });
      if (lowAdherence) add(8, 'da_w_simpleHelps', 'data', { pct: sg.adherencePct! });
      targets = computeMacros('flexible', sg.kcal, { protein: sg.protein, carbs: 0, fat: Math.round(Math.max(kg * 0.8, (sg.kcal * 0.25) / 9)) }).macros;
      break;
    }
    case 'high_protein': {
      score = 50;
      if (sg.goalGroup === 'loss') add(15, 'da_w_hpLoss', 'guideline');
      if (hungry) add(10, 'da_w_hpHunger', 'data', { h: r1(sg.hunger!) });
      if (sg.proteinPerKg !== null && sg.proteinPerKg < 1.6) add(8, 'da_w_proteinLow', 'data', { gkg: sg.proteinPerKg });
      if (sg.whtr !== null && sg.whtr >= 0.5 && sg.goalGroup === 'loss') add(4, 'da_w_whtr', 'data', { r: sg.whtr });
      const hp = Math.round(Math.min(kg * 2.4, (sg.kcal * 0.35) / 4));
      targets = computeMacros('high_protein', sg.kcal, { protein: Math.max(hp, sg.protein), carbs: 0, fat: Math.round(Math.max(kg * 0.8, (sg.kcal * 0.25) / 9)) }).macros;
      break;
    }
    case 'carb_cycling': {
      score = 40;
      if (training >= 4) add(15, 'da_w_cycleTraining', 'data', { n: training });
      else add(-10, 'da_w_cycleFewSessions', 'data', { n: training });
      if (sg.goalGroup !== 'loss' || s.profile.goalType === 'recomp') add(8, 'da_w_cyclePerf', 'guideline');
      if (perfDown) add(10, 'da_w_perfDown', 'data', { up: sg.liftsUp, down: sg.liftsDown });
      if (lowAdherence || sg.completeDays < 8) add(-15, 'da_w_complex', 'data', { n: sg.completeDays });
      const schedule = scheduleFromProgram(inp.program, s.trainingWeekdays, s.weekStartsOn);
      const levels = cycleTargets(sg.kcal, sg.protein, schedule, {}, dayFloor(s.profile));
      cycle = { schedule, levels };
      targets = strategyTargets({ mode, kcal: sg.kcal, protein: sg.protein, carbs: 0, fat: 0, appliedAt: 0 });
      break;
    }
    case 'low_carb': {
      score = 35;
      if (habitLowCarb && adherent) add(15, 'da_w_habitLowCarb', 'data', { pct: sg.carbShare! });
      if (training >= 5) add(-10, 'da_w_carbsForTraining', 'guideline', { n: training });
      if (perfDown) add(-8, 'da_w_perfDownCarbs', 'data');
      targets = computeMacros('low_carb', sg.kcal, { protein: sg.protein, carbs: lowCarbDefault(sg.kcal, sg.protein), fat: 0 }).macros;
      break;
    }
    case 'keto': {
      score = 20;
      add(0, 'da_w_ketoRestrictive', 'guideline');
      if (sg.intake && sg.intake.carbs <= 60 && adherent) add(20, 'da_w_habitKeto', 'data', { g: Math.round(sg.intake.carbs) });
      if (training >= 4) add(-15, 'da_w_ketoTraining', 'guideline', { n: training });
      if (perfDown) add(-10, 'da_w_perfDownCarbs', 'data');
      targets = computeMacros('keto', sg.kcal, { protein: sg.protein, carbs: 25, fat: 0 }).macros;
      break;
    }
    default: { // custom = keep the user's own targets
      score = 30;
      const onTrack = adherent && sg.ratePerWeek !== null && (sg.goalGroup !== 'loss' || (sg.ratePerWeek < -0.1 && (sg.ratePctPerWeek ?? 0) >= -1));
      if (onTrack) add(25, 'da_w_keepWorking', 'data', { rate: sg.ratePerWeek! });
      targets = { ...s.targets.training };
    }
  }
  const strategy: DietStrategy = { mode, kcal: targets.kcal, protein: targets.protein, carbs: targets.carbs, fat: targets.fat, appliedAt: 0, ...(cycle ? { cycle: { schedule: cycle.schedule } } : {}) };
  return { mode, score, targets, cycle, why, pros: PROS[mode], cons: CONS[mode], strategy };
}

/** Did a period move the weight in the right direction at a safe pace? (null = not enough weight data) */
export function onTrack(r: PeriodResult, goalGroup: Signals['goalGroup'], weight: number): boolean | null {
  if (r.ratePerWeek === null) return null;
  const pct = (r.ratePerWeek / weight) * 100;
  if (goalGroup === 'loss') return r.ratePerWeek <= -0.1 && pct >= -1;
  if (goalGroup === 'gain') return r.ratePerWeek >= 0.05 && pct <= 0.5;
  return Math.abs(r.ratePerWeek) <= 0.25;
}

export function adviseDiet(inp: AdvisorInput): AdvisorResult {
  const date = inp.date ?? today();
  const sg = readSignals(inp);
  const s = inp.data.settings, p = s.profile;
  const current = s.dietStrategy?.mode;

  // ---- strategy history, results and trial ----
  const history = inp.history ?? [];
  const cur = currentPeriod(history, s.dietStrategy);
  const closed = history.filter((h) => h.end && h.mode !== 'none');
  const curResult = cur && cur.mode !== 'none' ? periodResult(cur, inp.data, inp.workouts, inp.checkins, date) : null;
  const prevPeriod = closed.length ? closed[closed.length - 1] : null;
  const prevResult = prevPeriod ? periodResult(prevPeriod, inp.data, inp.workouts, inp.checkins, date) : null;
  let trial: Trial | null = null;
  if (cur && cur.mode !== 'none' && curResult) {
    const day = curResult.days;
    const done = day >= TRIAL_MIN_DAYS;
    let verdict: Trial['verdict'] = null;
    if (done) {
      const ok = onTrack(curResult, sg.goalGroup, sg.weight);
      const muscleRisk = sg.goalGroup === 'loss' && (curResult.strength.down > curResult.strength.up || (curResult.recovery !== null && curResult.recovery <= 2) || (curResult.proteinPct !== null && curResult.proteinPct < 50));
      verdict = curResult.adherencePct === null || curResult.adherencePct < 70 || ok === null ? 'inconclusive' : ok ? (muscleRisk ? 'muscleRisk' : 'effective') : 'notEffective';
    }
    trial = { mode: cur.mode as DietMode, start: cur.start, day, evalDate: addDays(cur.start, TRIAL_MIN_DAYS - 1), done, verdict };
  }
  const inTrial = !!trial && !trial.done;
  const hold = inTrial || sg.hold;

  // ---- options, personalised with the user's own history ----
  const past: Partial<Record<DietMode, PeriodResult[]>> = {};
  for (const h of closed) { const r = periodResult(h, inp.data, inp.workouts, inp.checkins, date); if (r.days >= TRIAL_MIN_DAYS) (past[h.mode as DietMode] ??= []).push(r); }
  const options = (['flexible', 'high_protein', 'carb_cycling', 'low_carb', 'keto', 'custom'] as DietMode[]).map((m) => {
    const o = option(m, sg, inp);
    for (const r of past[m] ?? []) {
      const ok = onTrack(r, sg.goalGroup, sg.weight);
      if (r.adherencePct !== null && r.adherencePct >= 75 && ok) { o.score += 10; o.why.push({ key: 'da_w_workedBefore', params: { days: r.days, rate: r.ratePerWeek ?? 0 }, basis: 'data' }); }
      else if (r.adherencePct !== null && r.adherencePct < 60) { o.score -= 10; o.why.push({ key: 'da_w_hardBefore', params: { pct: r.adherencePct }, basis: 'data' }); }
    }
    if (m === current && trial) {
      if (inTrial) { o.score += 15; o.why.push({ key: 'da_w_inTrial', params: { day: trial.day, min: TRIAL_MIN_DAYS }, basis: 'guideline' }); }
      else if (trial.verdict === 'effective') { o.score += 15; o.why.push({ key: 'da_w_currentWorks', params: { days: trial.day }, basis: 'data' }); }
      else if (trial.verdict === 'notEffective') { o.score -= 10; o.why.push({ key: 'da_w_currentNotWorking', params: { days: trial.day }, basis: 'data' }); }
    }
    return o;
  }).sort((a, b) => b.score - a.score);
  // Stability: what the user follows now (the active strategy, or the strategy their saved targets correspond to)
  const tg = s.targets.training;
  const currentMode: DietMode = current ?? (tg.carbs <= 50 ? 'keto' : (tg.carbs * 4) / Math.max(tg.kcal, 1) < 0.3 ? 'low_carb' : 'flexible');
  const currentOpt = options.find((o) => o.mode === currentMode)!;
  // meaningful, data-backed reasons to change strategy (a higher fit score alone is not enough)
  const perfDownNow = sg.strength === 'down' || (sg.liftsDown >= 2 && sg.liftsDown > sg.liftsUp);
  const lowCarbNow = (sg.carbShare !== null && sg.carbShare < 35) || currentMode === 'keto' || currentMode === 'low_carb';
  const switchReasons: Reason[] = [];
  if (sg.hunger !== null && sg.hunger >= 4) switchReasons.push({ key: 'da_w_reasonHunger', params: { h: r1(sg.hunger) }, basis: 'data' });
  if (perfDownNow && lowCarbNow) switchReasons.push({ key: 'da_w_reasonPerf', basis: 'data' });
  if (sg.adherencePct !== null && sg.adherencePct < 60 && sg.completeDays >= 7) switchReasons.push({ key: 'da_w_reasonAdherence', params: { pct: sg.adherencePct }, basis: 'data' });
  if (trial?.done && (trial.verdict === 'notEffective' || trial.verdict === 'muscleRisk')) switchReasons.push({ key: 'da_w_reasonTrial', params: { days: trial.day }, basis: 'data' });
  const best = options[0];
  const change = best.mode !== currentMode && !hold && switchReasons.length > 0 && best.score > currentOpt.score;
  const recommended = change ? best : currentOpt;
  if (change) best.why.unshift(...switchReasons);
  else if (best.mode !== currentMode) currentOpt.why.unshift({ key: inTrial ? 'da_w_stableTrial' : 'da_w_stable', params: { other: best.mode }, basis: 'data' });
  const alternatives = options.filter((o) => o !== recommended).slice(0, 2);
  const confidence: AdvisorResult['confidence'] = sg.completeDays >= 14 && sg.trendWeeks >= 3 && sg.hunger !== null ? 'high' : sg.completeDays >= 7 && sg.trendWeeks >= 2 ? 'medium' : 'low';

  // ---- progress review (continuous adaptation) ----
  // Calorie changes need a trend from ≥ 3 weekly averages (2+ weeks); LOWERING calories needs ≥ 4 (3+ weeks).
  // During a strategy trial (first 14 days) only safety suggestions (losing too fast) are made.
  const a: Adjustment[] = [];
  const adherent = sg.adherencePct !== null && sg.adherencePct >= 70 && sg.completeDays >= 14;
  const floor = Math.max(sg.kcalFloor, Math.ceil((sg.tdee * 0.75) / 10) * 10);
  if (sg.completeDays < 8) a.push({ id: 'log', key: 'da_r_logMore', params: { n: sg.completeDays }, level: 'info', basis: 'data' });
  if (sg.trendWeeks < 3) a.push({ id: 'weigh', key: 'da_r_trendWait', params: { weeks: sg.trendWeeks, n: sg.weighIns }, level: 'info', basis: 'guideline' });
  if (sg.hunger === null) a.push({ id: 'checkin', key: 'da_r_checkIn', level: 'info', basis: 'data' });
  if (sg.hold && !(trial && !trial.done)) a.push({ id: 'window', key: 'da_r_window', params: { day: sg.sinceChange ?? 0 }, level: 'info', basis: 'guideline' });
  if (trial && !trial.done) a.push({ id: 'trial', key: 'da_r_trial', params: { day: trial.day, min: TRIAL_MIN_DAYS, full: TRIAL_FULL_DAYS, date: trial.evalDate }, level: 'info', basis: 'guideline' });
  if (trial && trial.done) a.push({ id: 'trialEval', key: trial.verdict === 'effective' ? 'da_r_trial_effective' : trial.verdict === 'notEffective' ? 'da_r_trial_notEffective' : trial.verdict === 'muscleRisk' ? 'da_r_trial_muscleRisk' : 'da_r_trial_inconclusive', params: { days: trial.day, rate: curResult?.ratePerWeek ?? '—', pct: curResult?.adherencePct ?? '—' }, level: trial.verdict === 'effective' ? 'good' : trial.verdict === 'notEffective' || trial.verdict === 'muscleRisk' ? 'warn' : 'info', basis: 'data',
    action: trial.verdict === 'notEffective' && recommended.mode !== current ? { kind: 'mode', mode: recommended.mode } : undefined });
  const reached = p.targetWeight > 0 && sg.trendWeeks >= 2 && ((sg.goalGroup === 'loss' && sg.weight <= p.targetWeight + 0.3) || (sg.goalGroup === 'gain' && sg.weight >= p.targetWeight - 0.3));
  if (reached) a.push({ id: 'reached', key: 'da_r_reached', params: { w: sg.weight, target: p.targetWeight }, level: 'good', basis: 'data', action: { kind: 'maintain' } });
  const rate = sg.ratePerWeek, pct = sg.ratePctPerWeek ?? 0;
  if (!reached && rate !== null && sg.trendWeeks >= 3) {
    if (sg.goalGroup === 'loss') {
      if (pct < -1) a.push({ id: 'fast', key: 'da_r_tooFast', params: { rate, pct }, level: 'warn', basis: 'guideline', action: { kind: 'kcal', delta: 150 } });
      else if (!hold && adherent && rate > -0.1 && sg.trendWeeks >= 4) {
        a.push(sg.currentKcal - 150 >= floor
          ? { id: 'stall', key: 'da_r_stall', params: { rate, days: sg.completeDays, weeks: sg.trendWeeks, to: sg.kcal < sg.currentKcal ? sg.kcal : sg.currentKcal - 150 }, level: 'warn', basis: 'data', action: { kind: 'kcal', delta: sg.kcal < sg.currentKcal ? sg.kcal - sg.currentKcal : -150 } }
          : { id: 'stallFloor', key: 'da_r_stallFloor', params: { bmr: floor }, level: 'warn', basis: 'guideline' });
      } else if (rate <= -0.1) a.push({ id: 'onTrack', key: 'da_r_onTrack', params: { rate }, level: 'good', basis: 'data' });
    } else if (sg.goalGroup === 'gain' && !hold) {
      if (adherent && rate < 0.05 && sg.trendWeeks >= 4) a.push({ id: 'gainStall', key: 'da_r_gainStall', params: { rate }, level: 'warn', basis: 'data', action: { kind: 'kcal', delta: 150 } });
      else if (pct > 0.5) a.push({ id: 'gainFast', key: 'da_r_gainFast', params: { rate, pct }, level: 'warn', basis: 'guideline', action: { kind: 'kcal', delta: -100 } });
    } else if (sg.goalGroup === 'maintain' && !hold && adherent && Math.abs(rate) > 0.25 && sg.trendWeeks >= 4) {
      a.push({ id: 'drift', key: rate < 0 ? 'da_r_driftDown' : 'da_r_driftUp', params: { rate }, level: 'warn', basis: 'data', action: { kind: 'kcal', delta: rate < 0 ? 100 : -100 } });
    }
  }
  // muscle preservation: weight loss alone is not success — look at strength, protein, recovery and waist as well
  if (sg.goalGroup === 'loss' && rate !== null && sg.trendWeeks >= 3) {
    const losing = rate <= -0.1;
    const strengthOk = !(sg.strength === 'down' || (sg.liftsDown >= 2 && sg.liftsDown > sg.liftsUp));
    const proteinOk = sg.proteinPerKg === null || sg.proteinPerKg >= 1.6;
    const recoveryOk = !((sg.recovery !== null && sg.recovery <= 2) || (sg.energy !== null && sg.energy <= 2));
    const waistDown = sg.waistChange !== null && sg.waistChange <= -1;
    a.push({ id: 'quality', key: 'da_r_quality', params: {
      w: losing ? '✓' : '—', s: strengthOk ? '✓' : '✗', p: proteinOk ? '✓' : '✗', r: recoveryOk ? '✓' : '✗', waist: sg.waistChange === null ? '—' : (sg.waistChange > 0 ? '+' : '') + sg.waistChange + ' cm'
    }, level: losing && strengthOk && proteinOk && recoveryOk ? 'good' : 'info', basis: 'data' });
    if (losing && (!strengthOk || !proteinOk || !recoveryOk)) a.push({ id: 'muscleRisk', key: 'da_r_muscleRisk', level: 'warn', basis: 'data',
      action: !hold && proteinOk && sg.currentKcal + 100 <= sg.tdee * 0.9 ? { kind: 'kcal', delta: 100 } : undefined });
    if (!losing && waistDown && strengthOk) {
      // weight stable, waist down, strength kept: likely recomposition — do not cut calories
      a.push({ id: 'recomp', key: 'da_r_recomp', params: { waist: sg.waistChange! }, level: 'good', basis: 'data' });
      const stall = a.findIndex((x) => x.id === 'stall');
      if (stall >= 0) a.splice(stall, 1);
    }
  }
  const perfDown = sg.strength === 'down' || (sg.liftsDown >= 2 && sg.liftsDown > sg.liftsUp);
  if (perfDown) {
    const lowCarbNow = (sg.carbShare !== null && sg.carbShare < 35) || current === 'keto' || current === 'low_carb';
    a.push({ id: 'perf', key: lowCarbNow ? 'da_r_perfCarbs' : 'da_r_perf', params: { down: sg.liftsDown, carbs: sg.carbShare ?? '—' }, level: 'warn', basis: 'data',
      action: hold ? undefined : lowCarbNow ? { kind: 'mode', mode: Math.max(sg.trainingPerWeek, sg.plannedTraining) >= 4 ? 'carb_cycling' : 'flexible' } : sg.goalGroup === 'loss' && sg.currentKcal + 100 <= sg.tdee * 0.9 ? { kind: 'kcal', delta: 100 } : undefined });
  }
  if (sg.hunger !== null && sg.hunger >= 4) a.push({ id: 'hunger', key: 'da_r_hunger', params: { h: r1(sg.hunger) }, level: 'warn', basis: 'data',
    action: hold ? undefined : current !== 'high_protein' ? { kind: 'mode', mode: 'high_protein' } : sg.goalGroup === 'loss' && sg.currentKcal + 100 <= sg.tdee * 0.9 ? { kind: 'kcal', delta: 100 } : undefined });
  // protein consistency, whatever the strategy (keto and low carb included)
  const protPct = curResult?.proteinPct ?? null;
  const tProt = s.targets.training.protein;
  if (tProt < sg.weight * 1.6) a.push({ id: 'proteinTarget', key: 'da_r_proteinTarget', params: { gkg: r1(tProt / sg.weight), grams: Math.round(sg.weight * 1.6) }, level: 'warn', basis: 'guideline' });
  else if (sg.completeDays >= 7 && sg.intake && sg.intake.protein < tProt * 0.9) a.push({ id: 'proteinShort', key: 'da_r_proteinShort', params: { avg: Math.round(sg.intake.protein), target: tProt, pct: protPct ?? '—' }, level: 'warn', basis: 'data' });
  if ((sg.energy !== null && sg.energy <= 2) || (sg.sleepH !== null && sg.sleepH < 6) || (sg.recovery !== null && sg.recovery <= 2)) a.push({ id: 'recovery', key: 'da_r_recovery', params: { sleep: sg.sleepH !== null ? r1(sg.sleepH) : '—' }, level: 'info', basis: 'data' });
  if (!hold && sg.adherencePct !== null && sg.adherencePct < 60 && sg.completeDays >= 7 && (current === 'keto' || current === 'carb_cycling' || current === 'low_carb')) a.push({ id: 'simplify', key: 'da_r_simplify', params: { pct: sg.adherencePct }, level: 'warn', basis: 'data', action: { kind: 'mode', mode: 'flexible' } });
  // safety net: never offer a calorie change that would go below the floor or above the fat-loss ceiling
  for (const x of a) if (x.action?.kind === 'kcal') {
    const next = sg.currentKcal + x.action.delta;
    if (next < floor || (sg.goalGroup === 'loss' && x.action.delta > 0 && next > Math.floor(sg.tdee * 0.9))) delete x.action;
  }
  return { signals: sg, confidence, recommended, alternatives, options, adjustments: a, trial, results: { current: curResult, previous: prevResult } };
}
