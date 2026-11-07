/**
 * Food Intelligence — transparent, goal-dependent food rankings computed from USDA FoodData Central values.
 *
 * Methodology (shown in the app):
 *  - Every score is a weighted average of 0–1 sub-scores computed from per-100 g / per-100 kcal values.
 *    Weights depend on the user's goal (cut / maintain / build). Missing data is excluded (weights renormalised)
 *    and shown as "no data" — never guessed.
 *  - Protein quality = amino-acid score: the lowest ratio of each essential amino acid (mg per g protein) to the
 *    FAO/WHO/UNU (2007) adult reference pattern, capped at 1.0. It is NOT corrected for digestibility
 *    (PDCAAS/DIAAS need digestibility data that USDA does not publish), so the app says so.
 *  - Nutrient density = NRF9.3 index (Fulgoni, Keast & Drewnowski 2009): nine nutrients to encourage minus three
 *    to limit, as % Daily Value per 100 kcal. Total sugar is used instead of added sugar (not available in USDA SR).
 *  - Animal vs plant origin is displayed but never used as a scoring factor.
 */
import { INTEL_CATALOG, type IntelGroup, type IntelItem } from './intelCatalog';
import { loadRefFoods, toRefFood, type RefDb } from './refFoods';
import type { GoalType } from './types';

export type GoalClass = 'cut' | 'maintain' | 'build';
export function goalClass(g: GoalType): GoalClass {
  if (g === 'fat_loss' || g === 'fat_loss_preserve') return 'cut';
  if (g === 'lean_bulk' || g === 'bulk' || g === 'performance') return 'build';
  return 'maintain';
}

/** FAO/WHO/UNU 2007 (WHO TRS 935) adult scoring pattern, mg per g protein. */
export const AA_REFERENCE = { his: 15, ile: 30, leu: 59, lys: 45, saa: 22, aaa: 38, thr: 23, trp: 6, val: 39 } as const;
export type AAKey = keyof typeof AA_REFERENCE;
/** FDA Daily Values (2016 rule) used for %DV in nutrient density. */
export const DV = { protein: 50, fiber: 28, vitA: 900, vitC: 90, vitE: 15, ca: 1300, fe: 18, mg: 420, k: 4700, satFat: 20, sugar: 50, sodium: 2300 } as const;

export interface IntelFood {
  item: IntelItem; name: string; usdaName: string; source: string;
  kcal: number; protein: number; carbs: number; fat: number;
  fiber?: number; sugar?: number; satFat?: number; sodium?: number;
  mufa?: number; pufa?: number; ala?: number; epaDha?: number;
  micros: Partial<Record<'ca' | 'fe' | 'mg' | 'k' | 'zn' | 'vitA' | 'vitE' | 'vitC' | 'b12' | 'folate', number>>;
  /** g per 100 g food, order: His, Ile, Leu, Lys, Met, Cys, Phe, Tyr, Thr, Trp, Val */
  aa?: number[];
}

type Extra = (number | null | number[])[];
export interface ExtraDb { format: string; values: Record<string, Extra> }
let extraData: ExtraDb | null = null;
let extraLoading: Promise<ExtraDb> | null = null;
export function setExtraData(d: ExtraDb) { extraData = d; }
export function loadExtra(): Promise<ExtraDb> {
  if (extraData) return Promise.resolve(extraData);
  if (!extraLoading) {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    extraLoading = fetch(base + 'fooddb/usda-extra.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d: ExtraDb) => { extraData = d; return d; }).catch((e) => { extraLoading = null; throw e; });
  }
  return extraLoading;
}

/** Joins catalog entries with the USDA values (skips any id that is missing — never invents). */
export function buildIntelFoods(ref: RefDb, extra: ExtraDb, lang: 'ar' | 'en' = 'ar'): IntelFood[] {
  const byId = new Map(ref.rows.map((r) => [r[0], r]));
  const out: IntelFood[] = [];
  for (const item of INTEL_CATALOG) {
    const row = byId.get(item.id);
    if (!row) continue;
    const rf = toRefFood(row, ref.meta);
    const x = extra.values[item.id] ?? [];
    const num = (i: number) => (typeof x[i] === 'number' ? (x[i] as number) : undefined);
    const ala = num(2), epa = num(3), dha = num(4), dpa = num(5);
    const micros: IntelFood['micros'] = {};
    (['ca', 'fe', 'mg', 'k', 'zn', 'vitA', 'vitE', 'vitC', 'b12', 'folate'] as const).forEach((k, i) => { const v = num(6 + i); if (v !== undefined) micros[k] = v; });
    out.push({
      item, name: lang === 'ar' ? item.ar : item.en, usdaName: rf.name, source: rf.source,
      kcal: rf.per100.kcal, protein: rf.per100.protein, carbs: rf.per100.carbs, fat: rf.per100.fat,
      fiber: rf.per100.fiber, sugar: rf.per100.sugar, satFat: rf.per100.satFat, sodium: rf.per100.sodium,
      mufa: num(0), pufa: num(1), ala, epaDha: epa === undefined && dha === undefined ? undefined : (epa ?? 0) + (dha ?? 0) + (dpa ?? 0),
      micros, aa: Array.isArray(x[16]) ? (x[16] as number[]) : undefined
    });
  }
  return out;
}

export async function loadIntelFoods(lang: 'ar' | 'en'): Promise<IntelFood[]> {
  const [ref, extra] = await Promise.all([loadRefFoods(), loadExtra()]);
  return buildIntelFoods(ref, extra, lang);
}

/* ------------------------------------------------------------------ metrics */

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const per100kcal = (v: number | undefined, kcal: number) => (v === undefined || kcal <= 0 ? undefined : (v / kcal) * 100);

export interface AminoScore { score: number; limiting: AAKey; ratios: Record<AAKey, number> }
/** Amino-acid score vs the FAO/WHO 2007 adult pattern (no digestibility correction). */
export function aminoAcidScore(f: Pick<IntelFood, 'aa' | 'protein'>): AminoScore | undefined {
  if (!f.aa || !(f.protein > 1)) return undefined;
  const [his, ile, leu, lys, met, cys, phe, tyr, thr, trp, val] = f.aa.map((g) => (g * 1000) / f.protein); // mg per g protein
  const ratios: Record<AAKey, number> = {
    his: his / AA_REFERENCE.his, ile: ile / AA_REFERENCE.ile, leu: leu / AA_REFERENCE.leu, lys: lys / AA_REFERENCE.lys,
    saa: (met + cys) / AA_REFERENCE.saa, aaa: (phe + tyr) / AA_REFERENCE.aaa, thr: thr / AA_REFERENCE.thr, trp: trp / AA_REFERENCE.trp, val: val / AA_REFERENCE.val
  };
  let limiting: AAKey = 'his';
  for (const k of Object.keys(ratios) as AAKey[]) if (ratios[k] < ratios[limiting]) limiting = k;
  return { score: Math.min(1, ratios[limiting]), limiting, ratios };
}

/** NRF9.3 per 100 kcal (Fulgoni et al. 2009); undefined when a required nutrient is not reported. */
export function nrf93(f: IntelFood): number | undefined {
  if (f.kcal <= 0) return undefined;
  const m = f.micros;
  const enc = [f.protein / DV.protein, f.fiber === undefined ? undefined : f.fiber / DV.fiber, m.vitA === undefined ? undefined : m.vitA / DV.vitA,
    m.vitC === undefined ? undefined : m.vitC / DV.vitC, m.vitE === undefined ? undefined : m.vitE / DV.vitE, m.ca === undefined ? undefined : m.ca / DV.ca,
    m.fe === undefined ? undefined : m.fe / DV.fe, m.mg === undefined ? undefined : m.mg / DV.mg, m.k === undefined ? undefined : m.k / DV.k];
  const lim = [f.satFat === undefined ? undefined : f.satFat / DV.satFat, f.sugar === undefined ? undefined : f.sugar / DV.sugar, f.sodium === undefined ? undefined : f.sodium / DV.sodium];
  if ([...enc, ...lim].some((v) => v === undefined)) return undefined;
  const scale = 100 / f.kcal; // per 100 kcal
  const good = (enc as number[]).reduce((acc: number, v) => acc + Math.min(100, v * 100 * scale), 0);
  const bad = (lim as number[]).reduce((acc: number, v) => acc + v * 100 * scale, 0);
  return good - bad;
}

/* ------------------------------------------------------------------ scoring */

export interface SubScore { key: string; value: number | undefined; weight: number }
/**
 * coverage = share of the ranking's indicator weight that has data (1 = every indicator measured). Foods with missing
 * indicators are never given an estimated value: they are ranked AFTER all fully measured foods, in their own group.
 */
export interface Ranked { food: IntelFood; score: number; subs: SubScore[]; rank: number; aas?: AminoScore; nrf?: number; coverage: number }
export type RankingKind = 'protein' | 'carb' | 'fat' | 'fiber' | 'lowCalorie' | 'proteinPerCalorie' | 'nutrientDense' | 'cutting' | 'building';
export const RANKINGS: RankingKind[] = ['protein', 'carb', 'fat', 'fiber', 'lowCalorie', 'proteinPerCalorie', 'nutrientDense', 'cutting', 'building'];

const W: Record<'protein' | 'carb' | 'fat', Record<GoalClass, Record<string, number>>> = {
  protein: {
    cut: { proteinDensity: 0.4, aminoScore: 0.25, proteinAmount: 0.1, lowSatFat: 0.15, fiberDensity: 0.1 },
    maintain: { proteinDensity: 0.25, aminoScore: 0.25, proteinAmount: 0.2, lowSatFat: 0.15, fiberDensity: 0.15 },
    build: { proteinAmount: 0.3, aminoScore: 0.3, proteinDensity: 0.2, lowSatFat: 0.1, fiberDensity: 0.1 }
  },
  carb: {
    cut: { fiberDensity: 0.3, lowEnergyDensity: 0.3, micronutrients: 0.2, wholeFood: 0.15, carbAmount: 0.05 },
    maintain: { fiberDensity: 0.25, micronutrients: 0.25, wholeFood: 0.2, lowEnergyDensity: 0.15, carbAmount: 0.15 },
    build: { carbAmount: 0.3, fiberDensity: 0.2, micronutrients: 0.2, wholeFood: 0.15, lowEnergyDensity: 0.15 }
  },
  fat: {
    cut: { unsaturatedShare: 0.3, omega3: 0.2, lowSatFat: 0.2, lowEnergyDensity: 0.15, fiberDensity: 0.1, micronutrients: 0.05 },
    maintain: { unsaturatedShare: 0.3, omega3: 0.25, lowSatFat: 0.2, micronutrients: 0.1, fiberDensity: 0.1, lowEnergyDensity: 0.05 },
    build: { unsaturatedShare: 0.3, omega3: 0.25, lowSatFat: 0.2, micronutrients: 0.1, fiberDensity: 0.1, lowEnergyDensity: 0.05 }
  }
};

/** Sub-score values (0–1) for a food; undefined = not reported in the source. */
export function subScores(f: IntelFood): Record<string, number | undefined> {
  const aas = aminoAcidScore(f);
  const microKeys = ['k', 'mg', 'fe', 'vitC', 'folate', 'vitE'] as const;
  const dvs: Record<(typeof microKeys)[number], number> = { k: 4700, mg: 420, fe: 18, vitC: 90, folate: 400, vitE: 15 };
  const microVals = microKeys.map((k) => (f.micros[k] === undefined ? undefined : Math.min(1, ((f.micros[k]! / dvs[k]) * 100) / Math.max(f.kcal, 1))));
  const known = microVals.filter((v): v is number => v !== undefined);
  return {
    proteinDensity: clamp((per100kcal(f.protein, f.kcal) ?? 0) / 20),
    proteinAmount: clamp(f.protein / 30),
    aminoScore: aas?.score,
    lowSatFat: f.satFat === undefined ? undefined : 1 - clamp((per100kcal(f.satFat, f.kcal) ?? 0) / 3),
    // animal tissue contains no dietary fibre: when the source omits fibre for an animal food it is 0 g, not unknown
    fiberDensity: f.fiber === undefined ? (f.item.origin === 'animal' && !/powder/i.test(f.item.en) ? 0 : undefined) : clamp((per100kcal(f.fiber, f.kcal) ?? 0) / 4),
    lowEnergyDensity: 1 - clamp(f.kcal / 400),
    carbAmount: clamp(f.carbs / 70),
    wholeFood: f.item.whole ? 1 : 0,
    micronutrients: known.length >= 3 ? known.reduce((s, v) => s + v, 0) / known.length : undefined,
    unsaturatedShare: f.mufa === undefined || f.pufa === undefined || f.fat <= 0 ? undefined : clamp((f.mufa + f.pufa) / f.fat),
    omega3: f.ala === undefined && f.epaDha === undefined ? undefined : clamp((f.ala ?? 0) / 8) * 0.4 + clamp((f.epaDha ?? 0) / 1.5) * 0.6
  };
}

function weighted(f: IntelFood, weights: Record<string, number>): { score: number; subs: SubScore[]; coverage: number } {
  const s = subScores(f);
  const subs: SubScore[] = Object.entries(weights).map(([key, weight]) => ({ key, value: s[key], weight }));
  const usable = subs.filter((x) => x.value !== undefined);
  const wsum = usable.reduce((a, x) => a + x.weight, 0);
  const total = subs.reduce((a, x) => a + x.weight, 0);
  const score = wsum > 0 ? (usable.reduce((a, x) => a + x.value! * x.weight, 0) / wsum) * 100 : 0;
  return { score: Math.round(score * 10) / 10, subs, coverage: total > 0 ? Math.round((wsum / total) * 100) / 100 : 0 };
}

/** Ranks the catalog for one ranking kind and goal. Pure function — same inputs, same order. */
export function rankFoods(foods: IntelFood[], kind: RankingKind, goal: GoalClass): Ranked[] {
  const inGroup = (g: IntelGroup) => foods.filter((f) => f.item.groups.includes(g));
  let list: (Omit<Ranked, 'rank' | 'coverage'> & { coverage?: number })[];
  switch (kind) {
    case 'protein':
    case 'carb':
    case 'fat':
      list = inGroup(kind).map((f) => ({ food: f, ...weighted(f, W[kind][goal]), aas: aminoAcidScore(f) }));
      break;
    case 'fiber':
      list = foods.filter((f) => (f.fiber ?? 0) > 0).map((f) => {
        const a = clamp((f.fiber ?? 0) / 10), b = clamp((per100kcal(f.fiber, f.kcal) ?? 0) / 8);
        return { food: f, score: Math.round((0.5 * a + 0.5 * b) * 1000) / 10, subs: [{ key: 'fiberAmount', value: a, weight: 0.5 }, { key: 'fiberDensity', value: b, weight: 0.5 }] };
      });
      break;
    case 'lowCalorie':
      list = foods.map((f) => ({ food: f, score: Math.round((1 - clamp(f.kcal / 900)) * 1000) / 10, subs: [{ key: 'lowEnergyDensity', value: 1 - clamp(f.kcal / 900), weight: 1 }] }));
      break;
    case 'proteinPerCalorie':
      list = foods.filter((f) => (f.protein * 4) / Math.max(f.kcal, 1) >= 0.1).map((f) => {
        const v = per100kcal(f.protein, f.kcal) ?? 0;
        return { food: f, score: Math.round(clamp(v / 25) * 1000) / 10, subs: [{ key: 'proteinDensity', value: clamp(v / 25), weight: 1 }] };
      });
      break;
    case 'nutrientDense':
      list = foods.map((f) => ({ food: f, nrf: nrf93(f) })).filter((x) => x.nrf !== undefined)
        .map((x) => ({ food: x.food, nrf: x.nrf, score: Math.round(x.nrf! * 10) / 10, subs: [{ key: 'nrf93', value: undefined, weight: 1 }] }));
      break;
    case 'cutting':
      list = foods.map((f) => ({ food: f, ...weighted(f, { proteinDensity: 0.4, lowEnergyDensity: 0.3, fiberDensity: 0.2, lowSatFat: 0.1 }), aas: aminoAcidScore(f) }));
      break;
    case 'building':
      list = foods.filter((f) => f.protein >= 5).map((f) => ({ food: f, ...weighted(f, { proteinAmount: 0.35, aminoScore: 0.35, proteinDensity: 0.15, carbAmount: 0.15 }), aas: aminoAcidScore(f) }));
      break;
  }
  const full = (x: { coverage?: number }) => (x.coverage ?? 1) >= 0.999;
  return list
    .sort((a, b) => Number(full(b)) - Number(full(a)) || b.score - a.score || a.food.kcal - b.food.kcal)
    .map((x, i) => ({ ...x, coverage: x.coverage ?? 1, rank: i + 1 }));
}

/* ------------------------------------------------------------------ explanations (generated from the data) */

export interface Point { key: string; params?: Record<string, string | number> }
export function prosCons(f: IntelFood): { pros: Point[]; cons: Point[]; uses: string[] } {
  const pros: Point[] = [], cons: Point[] = [], uses: string[] = [];
  const pd = per100kcal(f.protein, f.kcal) ?? 0;
  const aas = aminoAcidScore(f);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  if (f.protein >= 20) pros.push({ key: 'pc_highProtein', params: { g: r1(f.protein) } });
  if (pd >= 15) pros.push({ key: 'pc_proteinDense', params: { g: r1(pd) } });
  if (aas && aas.score >= 1) pros.push({ key: 'pc_completeAA' });
  if (aas && aas.score < 1) cons.push({ key: 'pc_limitingAA', params: { aa: aas.limiting, s: Math.round(aas.score * 100) } });
  if ((f.fiber ?? 0) >= 5) pros.push({ key: 'pc_highFiber', params: { g: r1(f.fiber!) } });
  if ((f.epaDha ?? 0) >= 0.5) pros.push({ key: 'pc_epaDha', params: { g: r1(f.epaDha!) } });
  if ((f.ala ?? 0) >= 2) pros.push({ key: 'pc_ala', params: { g: r1(f.ala!) } });
  if (f.mufa !== undefined && f.pufa !== undefined && f.fat >= 5 && (f.mufa + f.pufa) / f.fat >= 0.7) pros.push({ key: 'pc_unsaturated', params: { p: Math.round(((f.mufa + f.pufa) / f.fat) * 100) } });
  if (f.kcal <= 60) pros.push({ key: 'pc_lowEnergy', params: { kcal: Math.round(f.kcal) } });
  if (f.item.whole && f.item.groups.includes('carb')) pros.push({ key: 'pc_whole' });
  if ((f.satFat ?? 0) >= 5) cons.push({ key: 'pc_satFat', params: { g: r1(f.satFat!) } });
  if (f.kcal >= 400) cons.push({ key: 'pc_energyDense', params: { kcal: Math.round(f.kcal) } });
  if ((f.sodium ?? 0) >= 400) cons.push({ key: 'pc_sodium', params: { mg: Math.round(f.sodium!) } });
  if (!f.item.whole && f.item.groups.includes('carb')) cons.push({ key: 'pc_refined' });
  if (f.item.groups.includes('carb') && (f.fiber ?? 0) < 1 && f.carbs > 10) cons.push({ key: 'pc_lowFiber' });
  if (pd >= 15 && f.kcal < 200) uses.push('use_cut');
  if (f.protein >= 20 && aas && aas.score >= 0.9) uses.push('use_build');
  if (f.carbs >= 20) uses.push('use_fuel');
  if ((f.fiber ?? 0) >= 3) uses.push('use_satiety');
  if ((f.epaDha ?? 0) >= 0.5 || (f.ala ?? 0) >= 2) uses.push('use_omega3');
  if (f.kcal >= 400 && f.fat >= 30) uses.push('use_smallPortions');
  return { pros, cons, uses };
}
