/**
 * Periodic goal review. Produces SUGGESTIONS only — nothing is changed until the user approves one.
 * Uses trends, never single readings: 7-day weight averages and a 28-day regression (progressEstimate), waist change,
 * 14-day adherence (complete days, calories in range, protein), weekly cardio volume, and the user's weekly
 * check-in (strength, hunger, recovery, resistance sessions done).
 */
import { addDays, today } from './dates';
import { totalsFor, datesBack, type CardioSession } from './cardio';
import { fitnessOf } from './energy';
import { buildPeriod, progressEstimate, type DataBundle } from './reports';
import type { Macros, Settings } from './types';

export interface CheckIn {
  /** Monday-or-configured week start date YYYY-MM-DD. */
  week: string;
  strength: 'down' | 'same' | 'up';
  hunger: number; // 1 (low) – 5 (very high)
  recovery: number; // 1 (poor) – 5 (great)
  resistanceSessions: number;
  updatedAt: number;
}

export type AdviceAction = { kind: 'kcal'; delta: number } | { kind: 'protein'; grams: number } | { kind: 'cardio'; minPerSession: number; sessions: number };

export interface Advice {
  id: string;
  key: string;
  params?: Record<string, string | number>;
  level: 'info' | 'good' | 'warn';
  action?: AdviceAction;
}

const LOSS = new Set(['fat_loss', 'fat_loss_preserve', 'recomp']);
const GAIN = new Set(['lean_bulk', 'bulk']);

export function adviseGoals(data: DataBundle, sessions: CardioSession[], checkins: CheckIn[], date = today()): Advice[] {
  const s = data.settings;
  const p = s.profile;
  const out: Advice[] = [];
  const est = progressEstimate(data.body, p.targetWeight, date);
  const window = buildPeriod('week', '', datesBack(14, date), data, date);
  const complete = window.completeDays;
  const inRangePct = complete ? (window.caloriesInRangeDays / complete) * 100 : 0;
  const proteinPct = complete ? (window.proteinHitDays / complete) * 100 : 0;
  const weight = est.currentAvg ?? p.currentWeight;
  const fit = fitnessOf(s);
  const last = [...checkins].sort((a, b) => a.week.localeCompare(b.week)).pop();
  const recentCheck = last && last.week >= addDays(date, -13) ? last : undefined;

  // waist: compare latest waist in last 14 days with the latest one before that
  const waists = data.body.filter((b) => b.waist && !b.deleted).sort((a, b) => a.date.localeCompare(b.date));
  const recentW = waists.filter((b) => b.date > addDays(date, -14)).pop();
  const olderW = waists.filter((b) => b.date <= addDays(date, -14)).pop();
  const waistChange = recentW && olderW ? Math.round((recentW.waist! - olderW.waist!) * 10) / 10 : null;

  if (est.pace === 'insufficient') {
    out.push({ id: 'data', key: 'adv_needData', params: { n: est.weighIns }, level: 'info' });
  }
  if (complete < 8) {
    out.push({ id: 'logging', key: 'adv_logMore', params: { n: complete }, level: 'info' });
  } else if (inRangePct < 70) {
    out.push({ id: 'adherence', key: 'adv_adherenceFirst', params: { pct: Math.round(inRangePct) }, level: 'warn' });
  }
  const adherent = complete >= 8 && inRangePct >= 70;

  // protein target vs body weight
  const tProt = s.targets.training.protein;
  const minPerKg = LOSS.has(p.goalType) ? 1.8 : 1.6;
  if (tProt / weight < minPerKg) {
    const grams = Math.round(weight * (LOSS.has(p.goalType) ? 2.0 : 1.8));
    out.push({ id: 'protein', key: 'adv_proteinLow', params: { now: Math.round((tProt / weight) * 10) / 10, grams }, level: 'warn', action: { kind: 'protein', grams } });
  } else if (complete >= 5 && proteinPct < 60) {
    out.push({ id: 'proteinAdh', key: 'adv_proteinAdherence', params: { pct: Math.round(proteinPct) }, level: 'warn' });
  }

  // weight trend vs goal (only with enough data and good adherence)
  if (est.pace !== 'insufficient' && est.ratePerWeek !== null) {
    const rate = est.ratePerWeek;
    const target = p.weeklyChangeKg;
    const fast = Math.abs(est.ratePctPerWeek ?? 0) > 1;
    const struggling = recentCheck && ((recentCheck.strength === 'down' && recentCheck.hunger >= 4) || recentCheck.recovery <= 2);
    if (LOSS.has(p.goalType)) {
      if (rate < 0 && (fast || rate < target * 1.5 || struggling)) {
        out.push({ id: 'tooFast', key: struggling ? 'adv_lossStruggling' : 'adv_lossTooFast', params: { rate, target }, level: 'warn', action: { kind: 'kcal', delta: 150 } });
      } else if (adherent && rate > target / 2) {
        if (waistChange !== null && waistChange < -0.5) out.push({ id: 'recomp', key: 'adv_waistDown', params: { waist: waistChange }, level: 'good' });
        else out.push({ id: 'stall', key: 'adv_lossStall', params: { rate, target }, level: 'warn', action: { kind: 'kcal', delta: -150 } });
      } else if (rate <= target / 2) {
        out.push({ id: 'onTrack', key: 'adv_onTrack', params: { rate, target }, level: 'good' });
      }
    } else if (GAIN.has(p.goalType)) {
      if (adherent && rate < Math.max(0.05, target / 2)) out.push({ id: 'gainStall', key: 'adv_gainStall', params: { rate, target }, level: 'warn', action: { kind: 'kcal', delta: 150 } });
      else if (rate > Math.max(0.5, target * 1.5)) out.push({ id: 'gainFast', key: 'adv_gainFast', params: { rate, target }, level: 'warn', action: { kind: 'kcal', delta: -100 } });
      else out.push({ id: 'onTrack', key: 'adv_onTrack', params: { rate, target }, level: 'good' });
    } else if (Math.abs(rate) > 0.25 && adherent) {
      out.push({ id: 'maintainDrift', key: rate < 0 ? 'adv_maintainDown' : 'adv_maintainUp', params: { rate }, level: 'warn', action: { kind: 'kcal', delta: rate < 0 ? 100 : -100 } });
    }
  }

  // cardio volume and recovery
  const week = totalsFor(sessions, datesBack(7, date));
  const goalMin = fit.cardioSessionsPerWeek * fit.cardioMinPerSession;
  if (goalMin > 0 && week.minutes < goalMin) out.push({ id: 'cardioLow', key: 'adv_cardioBelow', params: { done: week.minutes, goal: goalMin }, level: 'info' });
  else if (goalMin > 0) out.push({ id: 'cardioOk', key: 'adv_cardioMet', params: { done: week.minutes, goal: goalMin }, level: 'good' });
  if (recentCheck && recentCheck.recovery <= 2 && week.minutes > goalMin * 1.5 && goalMin > 0) out.push({ id: 'recovery', key: 'adv_recoveryCardio', level: 'warn' });
  if (recentCheck && recentCheck.resistanceSessions < fit.resistanceDaysPerWeek) out.push({ id: 'resistance', key: 'adv_resistanceBelow', params: { done: recentCheck.resistanceSessions, goal: fit.resistanceDaysPerWeek }, level: 'info' });
  if (!recentCheck) out.push({ id: 'checkin', key: 'adv_checkIn', level: 'info' });
  return out;
}

/** Applies one approved suggestion to BOTH day-type targets. Protein/fat stay, carbohydrates absorb kcal changes. */
export function applyAdvice(targets: Settings['targets'], a: AdviceAction): Settings['targets'] {
  const adj = (m: Macros): Macros => {
    if (a.kind === 'kcal') return { ...m, kcal: m.kcal + a.delta, carbs: Math.max(0, Math.round(m.carbs + a.delta / 4)) };
    if (a.kind === 'protein') {
      const d = a.grams - m.protein; // keep calories: carbohydrates absorb the change
      return { ...m, protein: a.grams, carbs: Math.max(0, Math.round(m.carbs - d)) };
    }
    return m;
  };
  return { training: adj(targets.training), rest: adj(targets.rest) };
}

export const CHECKIN_PREFIX = 'checkin:';
