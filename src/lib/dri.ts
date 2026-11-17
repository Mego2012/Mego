/**
 * Daily reference intakes for adults (19+), from the U.S. National Academies' Dietary Reference Intakes as summarised by
 * the NIH Office of Dietary Supplements fact sheets (https://ods.od.nih.gov/factsheets/). RDA where one exists, otherwise
 * AI. Pregnancy and lactation are not covered (the app says so). Values are per day.
 *
 * Upper limits (UL) are the tolerable upper intake levels. Some ULs apply only to supplements / fortified foods /
 * preformed forms (magnesium, niacin, folate, vitamin E, vitamin A as retinol); for those the app shows the UL as
 * information but does not compare food intake with it, because food totals cannot be split by form.
 *
 * Limits that are not DRIs: sodium uses the Chronic Disease Risk Reduction intake (2,300 mg); saturated fat and added
 * sugars use < 10 % of the energy target (Dietary Guidelines for Americans 2020–2025, WHO). Trans fat and cholesterol:
 * "as low as possible" — shown without a target.
 */
import type { MicroKey } from './micros';

export type Sex = 'male' | 'female';
export interface Reference {
  /** daily reference amount (RDA or AI); undefined = no reference (shown as amount only) */
  target?: number;
  kind: 'RDA' | 'AI' | 'limit' | 'none';
  /** tolerable upper intake level */
  ul?: number;
  /** 'total' = applies to food + supplements; 'supplemental' = applies only to supplements / fortified / preformed forms */
  ulScope?: 'total' | 'supplemental';
}

const by = (sex: Sex, age: number, m: number | [number, number][], f: number | [number, number][]) => {
  const v = sex === 'male' ? m : f;
  if (typeof v === 'number') return v;
  for (const [maxAge, val] of v) if (age <= maxAge) return val;
  return v[v.length - 1][1];
};

/** Reference values for one adult. kcalTarget is used for the < 10 % of energy limits. */
export function referenceFor(key: MicroKey, sex: Sex, age: number, kcalTarget: number): Reference {
  const a = Math.max(19, age || 30);
  switch (key) {
    case 'potassium': return { target: by(sex, a, 3400, 2600), kind: 'AI' };
    case 'calcium': return { target: by(sex, a, [[70, 1000], [200, 1200]], [[50, 1000], [200, 1200]]), kind: 'RDA', ul: a <= 50 ? 2500 : 2000, ulScope: 'total' };
    case 'magnesium': return { target: by(sex, a, [[30, 400], [200, 420]], [[30, 310], [200, 320]]), kind: 'RDA', ul: 350, ulScope: 'supplemental' };
    case 'iron': return { target: by(sex, a, 8, [[50, 18], [200, 8]]), kind: 'RDA', ul: 45, ulScope: 'total' };
    case 'zinc': return { target: by(sex, a, 11, 8), kind: 'RDA', ul: 40, ulScope: 'total' };
    case 'phosphorus': return { target: 700, kind: 'RDA', ul: a <= 70 ? 4000 : 3000, ulScope: 'total' };
    case 'selenium': return { target: 55, kind: 'RDA', ul: 400, ulScope: 'total' };
    case 'copper': return { target: 0.9, kind: 'RDA', ul: 10, ulScope: 'total' };
    case 'manganese': return { target: by(sex, a, 2.3, 1.8), kind: 'AI', ul: 11, ulScope: 'total' };
    case 'iodine': return { target: 150, kind: 'RDA', ul: 1100, ulScope: 'total' };
    case 'vitA': return { target: by(sex, a, 900, 700), kind: 'RDA', ul: 3000, ulScope: 'supplemental' };
    case 'vitC': return { target: by(sex, a, 90, 75), kind: 'RDA', ul: 2000, ulScope: 'total' };
    case 'vitD': return { target: a <= 70 ? 15 : 20, kind: 'RDA', ul: 100, ulScope: 'total' };
    case 'vitE': return { target: 15, kind: 'RDA', ul: 1000, ulScope: 'supplemental' };
    case 'vitK': return { target: by(sex, a, 120, 90), kind: 'AI' };
    case 'b1': return { target: by(sex, a, 1.2, 1.1), kind: 'RDA' };
    case 'b2': return { target: by(sex, a, 1.3, 1.1), kind: 'RDA' };
    case 'b3': return { target: by(sex, a, 16, 14), kind: 'RDA', ul: 35, ulScope: 'supplemental' };
    case 'b5': return { target: 5, kind: 'AI' };
    case 'b6': return { target: a <= 50 ? 1.3 : by(sex, a, 1.7, 1.5), kind: 'RDA', ul: 100, ulScope: 'total' };
    case 'b7': return { target: 30, kind: 'AI' };
    case 'folate': return { target: 400, kind: 'RDA', ul: 1000, ulScope: 'supplemental' };
    case 'b12': return { target: 2.4, kind: 'RDA' };
    case 'omega3': return { target: by(sex, a, 1.6, 1.1), kind: 'AI' }; // AI is for ALA; the total includes EPA/DPA/DHA
    case 'omega6': return { target: by(sex, a, [[50, 17], [200, 14]], [[50, 12], [200, 11]]), kind: 'AI' }; // AI for linoleic acid
    case 'addedSugar': return { target: Math.round((kcalTarget * 0.1) / 4), kind: 'limit' };
    case 'transFat': case 'cholesterol': case 'mufa': case 'pufa': case 'starch': case 'sugarAlcohol': case 'water': return { kind: 'none' };
  }
}

/** Saturated fat (already tracked as an optional nutrient): < 10 % of energy. Sodium: CDRR 2,300 mg. */
export const satFatLimit = (kcalTarget: number) => Math.round((kcalTarget * 0.1) / 9);
export const SODIUM_LIMIT_MG = 2300;
