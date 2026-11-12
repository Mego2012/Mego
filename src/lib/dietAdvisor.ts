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
import { computeMacros, cycleTargets, defaultSchedule, strategyTargets, type CycleLevel, type DietMode, type DietStrategy } from './dietStrategy';
import { fitnessOf } from './energy';
import { bmrOf, GOAL_RULES, tdeeOf } from './goals';
import type { CheckIn } from './goalAdvisor';
import { buildPeriod, progressEstimate, type DataBundle } from './reports';
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
  ratePerWeek: number | null; ratePctPerWeek: number | null;
  hunger: number | null; recovery: number | null; strength: CheckIn['strength'] | null; energy: number | null; sleepH: number | null;
  liftsUp: number; liftsDown: number;
  formulaTdee: number; dataTdee: number | null; tdee: number; tdeeBasis: Basis;
  kcal: number; protein: number; currentKcal: number;
}
export interface AdvisorResult { signals: Signals; confidence: 'low' | 'medium' | 'high'; recommended: StrategyOption; alternatives: StrategyOption[]; options: StrategyOption[]; adjustments: Adjustment[] }
export interface AdvisorInput { data: DataBundle; workouts: WorkoutSession[]; program?: Program; cardio: CardioSession[]; recovery: RecoveryLog[]; checkins: CheckIn[]; date?: string }

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

export function readSignals(inp: AdvisorInput): Signals {
  const date = inp.date ?? today();
  const s = inp.data.settings, p = s.profile;
  const est = progressEstimate(inp.data.body, p.targetWeight, date);
  const weight = est.currentAvg ?? p.currentWeight;
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
  if (period.completeDays >= 14 && est.weighIns >= 6 && est.ratePerWeek !== null && intake) {
    const t = Math.round((intake.kcal - (est.ratePerWeek * 7700) / 7) / 10) * 10;
    if (Math.abs(t - formulaTdee) / formulaTdee <= 0.25) dataTdee = t;
  }
  const tdee = dataTdee ?? formulaTdee;
  const goalGroup = LOSS.has(p.goalType) ? 'loss' : GAIN.has(p.goalType) ? 'gain' : 'maintain';
  const rule = p.goalType === 'custom' ? { adjust: 0 } : GOAL_RULES[p.goalType];
  let kcal = Math.max(bmrOf(prof), Math.round((tdee * (1 + rule.adjust)) / 10) * 10);
  if (goalGroup === 'loss') kcal = Math.min(kcal, Math.floor((tdee * 0.9) / 10) * 10);
  const currentKcal = s.targets.training.kcal;
  if (Math.abs(kcal - currentKcal) / Math.max(currentKcal, 1) <= 0.05) kcal = currentKcal; // keep a target that already fits
  const bmi = weight / ((p.heightCm / 100) ** 2);
  const proteinBase = bmi >= 30 ? p.targetWeight || weight : weight; // very high BMI: protein from goal weight
  const protein = Math.round(proteinBase * (goalGroup === 'loss' ? 2.0 : goalGroup === 'gain' ? 1.8 : 1.6));
  return {
    weight: r1(weight), heightCm: p.heightCm, age: p.age, sex: p.sex, bmi: r1(bmi), waist, whtr: waist ? Math.round((waist / p.heightCm) * 100) / 100 : null,
    goal: p.goalType, goalGroup, activity: p.activityLevel ?? 'moderate',
    trainingPerWeek: r1(done.length / 4), plannedTraining: fit.resistanceDaysPerWeek, cardioMinWeek: Math.round(cardio.minutes / 4),
    completeDays: period.completeDays, weighIns: est.weighIns,
    adherencePct: recent.completeDays ? Math.round((recent.caloriesInRangeDays / recent.completeDays) * 100) : null,
    intake, carbShare: intake && intake.kcal ? Math.round(((intake.carbs * 4) / intake.kcal) * 100) : null,
    proteinPerKg: intake ? r1(intake.protein / weight) : null,
    ratePerWeek: est.ratePerWeek, ratePctPerWeek: est.ratePctPerWeek,
    hunger: avg(lastTwo.map((c) => c.hunger)), recovery: avg(lastTwo.map((c) => c.recovery)), strength: checks.length ? checks[checks.length - 1].strength : null,
    energy: avg(rec.map((r) => r.energy).filter((x): x is number => x != null)), sleepH: avg(rec.map((r) => r.sleepH).filter((x): x is number => x != null)),
    liftsUp, liftsDown, formulaTdee, dataTdee, tdee, tdeeBasis: dataTdee ? 'data' : 'guideline', kcal, protein, currentKcal
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
      const levels = cycleTargets(sg.kcal, sg.protein, schedule);
      cycle = { schedule, levels };
      targets = strategyTargets({ mode, kcal: sg.kcal, protein: sg.protein, carbs: 0, fat: 0, appliedAt: 0 });
      break;
    }
    case 'low_carb': {
      score = 35;
      if (habitLowCarb && adherent) add(15, 'da_w_habitLowCarb', 'data', { pct: sg.carbShare! });
      if (training >= 5) add(-10, 'da_w_carbsForTraining', 'guideline', { n: training });
      if (perfDown) add(-8, 'da_w_perfDownCarbs', 'data');
      targets = computeMacros('low_carb', sg.kcal, { protein: sg.protein, carbs: 100, fat: 0 }).macros;
      break;
    }
    case 'keto': {
      score = 20;
      add(0, 'da_w_ketoRestrictive', 'guideline');
      if (sg.intake && sg.intake.carbs <= 60 && adherent) add(20, 'da_w_habitKeto', 'data', { g: Math.round(sg.intake.carbs) });
      if (training >= 4) add(-15, 'da_w_ketoTraining', 'guideline', { n: training });
      if (perfDown) add(-10, 'da_w_perfDownCarbs', 'data');
      targets = computeMacros('keto', sg.kcal, { protein: Math.round(kg * 1.8), carbs: 25, fat: 0 }).macros;
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

export function adviseDiet(inp: AdvisorInput): AdvisorResult {
  const date = inp.date ?? today();
  const sg = readSignals(inp);
  const options = (['flexible', 'high_protein', 'carb_cycling', 'low_carb', 'keto', 'custom'] as DietMode[]).map((m) => option(m, sg, inp)).sort((a, b) => b.score - a.score);
  const recommended = options[0];
  const alternatives = options.slice(1, 3);
  const confidence: AdvisorResult['confidence'] = sg.completeDays >= 14 && sg.weighIns >= 8 && sg.hunger !== null ? 'high' : sg.completeDays >= 7 && sg.weighIns >= 4 ? 'medium' : 'low';

  // ---- progress review (continuous adaptation) ----
  const a: Adjustment[] = [];
  const p = inp.data.settings.profile;
  const current = inp.data.settings.dietStrategy?.mode;
  const adherent = sg.adherencePct !== null && sg.adherencePct >= 70 && sg.completeDays >= 14;
  if (sg.completeDays < 8) a.push({ id: 'log', key: 'da_r_logMore', params: { n: sg.completeDays }, level: 'info', basis: 'data' });
  if (sg.weighIns < 6) a.push({ id: 'weigh', key: 'da_r_weighMore', params: { n: sg.weighIns }, level: 'info', basis: 'data' });
  if (sg.hunger === null) a.push({ id: 'checkin', key: 'da_r_checkIn', level: 'info', basis: 'data' });
  const reached = p.targetWeight > 0 && ((sg.goalGroup === 'loss' && sg.weight <= p.targetWeight + 0.3) || (sg.goalGroup === 'gain' && sg.weight >= p.targetWeight - 0.3));
  if (reached && sg.weighIns >= 4) a.push({ id: 'reached', key: 'da_r_reached', params: { w: sg.weight, target: p.targetWeight }, level: 'good', basis: 'data', action: { kind: 'maintain' } });
  if (!reached && sg.goalGroup === 'loss' && sg.ratePerWeek !== null && sg.weighIns >= 6) {
    if ((sg.ratePctPerWeek ?? 0) < -1) a.push({ id: 'fast', key: 'da_r_tooFast', params: { rate: sg.ratePerWeek, pct: sg.ratePctPerWeek ?? 0 }, level: 'warn', basis: 'guideline', action: { kind: 'kcal', delta: 150 } });
    else if (adherent && sg.ratePerWeek > -0.1) {
      const floor = bmrOf({ ...p, currentWeight: sg.weight });
      a.push(sg.currentKcal - 150 >= floor
        ? { id: 'stall', key: 'da_r_stall', params: { rate: sg.ratePerWeek, days: sg.completeDays }, level: 'warn', basis: 'data', action: { kind: 'kcal', delta: -150 } }
        : { id: 'stallFloor', key: 'da_r_stallFloor', params: { bmr: floor }, level: 'warn', basis: 'guideline' });
    } else if (sg.ratePerWeek < -0.1) a.push({ id: 'onTrack', key: 'da_r_onTrack', params: { rate: sg.ratePerWeek }, level: 'good', basis: 'data' });
  }
  if (sg.goalGroup === 'gain' && sg.ratePerWeek !== null && adherent && sg.ratePerWeek < 0.05) a.push({ id: 'gainStall', key: 'da_r_gainStall', params: { rate: sg.ratePerWeek }, level: 'warn', basis: 'data', action: { kind: 'kcal', delta: 150 } });
  const perfDown = sg.strength === 'down' || (sg.liftsDown >= 2 && sg.liftsDown > sg.liftsUp);
  if (perfDown) {
    const lowCarbNow = (sg.carbShare !== null && sg.carbShare < 35) || current === 'keto' || current === 'low_carb';
    a.push({ id: 'perf', key: lowCarbNow ? 'da_r_perfCarbs' : 'da_r_perf', params: { down: sg.liftsDown, carbs: sg.carbShare ?? '—' }, level: 'warn', basis: 'data',
      action: lowCarbNow ? { kind: 'mode', mode: Math.max(sg.trainingPerWeek, sg.plannedTraining) >= 4 ? 'carb_cycling' : 'flexible' } : sg.goalGroup === 'loss' ? { kind: 'kcal', delta: 100 } : undefined });
  }
  if (sg.hunger !== null && sg.hunger >= 4) a.push({ id: 'hunger', key: 'da_r_hunger', params: { h: r1(sg.hunger) }, level: 'warn', basis: 'data', action: current !== 'high_protein' ? { kind: 'mode', mode: 'high_protein' } : sg.goalGroup === 'loss' ? { kind: 'kcal', delta: 100 } : undefined });
  if ((sg.energy !== null && sg.energy <= 2) || (sg.sleepH !== null && sg.sleepH < 6) || (sg.recovery !== null && sg.recovery <= 2)) a.push({ id: 'recovery', key: 'da_r_recovery', params: { sleep: sg.sleepH !== null ? r1(sg.sleepH) : '—' }, level: 'info', basis: 'data' });
  if (sg.adherencePct !== null && sg.adherencePct < 60 && sg.completeDays >= 7 && (current === 'keto' || current === 'carb_cycling' || current === 'low_carb')) a.push({ id: 'simplify', key: 'da_r_simplify', params: { pct: sg.adherencePct }, level: 'warn', basis: 'data', action: { kind: 'mode', mode: 'flexible' } });
  void date;
  return { signals: sg, confidence, recommended, alternatives, options, adjustments: a };
}
