/** Detailed, bilingual technique for one exercise (shown on the exercise details page). */
export interface Technique {
  /** Starting position: body position, grip/hand placement, foot placement, equipment setup — 3 to 5 short points. */
  setupEn: string[];
  setupAr: string[];
  /** Execution step by step — 3 to 6 short points, in order. */
  stepsEn: string[];
  stepsAr: string[];
  /** One sentence each. */
  breathingEn: string;
  breathingAr: string;
  rangeEn: string;
  rangeAr: string;
  tempoEn: string;
  tempoAr: string;
  /** Common mistakes — 3 to 5 points (posture, movement pattern, momentum, joint position…). */
  mistakesEn: string[];
  mistakesAr: string[];
  /** Safety tips — 2 to 4 points; practical, no medical claims. */
  safetyEn: string[];
  safetyAr: string[];
}
