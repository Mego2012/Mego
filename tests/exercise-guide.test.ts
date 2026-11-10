import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../src/lib/exercises';
import { solveSide, VISUALS, type SidePose } from '../src/lib/exerciseVisuals';
import { TECHNIQUE } from '../src/lib/technique';

const AR = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

describe('exercise guide coverage (all 54 exercises)', () => {
  it('there are 54 exercises and each has an illustration and a full technique entry', () => {
    expect(EXERCISES).toHaveLength(54);
    const missingVisual = EXERCISES.filter((e) => !VISUALS[e.id]).map((e) => e.id);
    const missingTech = EXERCISES.filter((e) => !TECHNIQUE[e.id]).map((e) => e.id);
    expect(missingVisual).toEqual([]);
    expect(missingTech).toEqual([]);
    expect(Object.keys(VISUALS).sort()).toEqual(EXERCISES.map((e) => e.id).sort()); // no orphan drawings
  });

  it('every illustration has a real movement between start and finish, finite coordinates, and contacts that are reached', () => {
    for (const e of EXERCISES) {
      const v = VISUALS[e.id];
      if (v.view === 'front') {
        const a = v.start as { abd: number; h: number; elbow: number }, b = v.end as typeof a;
        expect(Math.abs(a.abd - b.abd) + Math.abs(a.h - b.h) + Math.abs(a.elbow - b.elbow), e.id).toBeGreaterThan(20);
        continue;
      }
      const s = solveSide(v.start as SidePose), f = solveSide(v.end as SidePose);
      const moved = (Object.keys(s) as (keyof typeof s)[]).reduce((m, k) => Math.max(m, Math.hypot(s[k][0] - f[k][0], s[k][1] - f[k][1])), 0);
      expect(moved, e.id + ' moves').toBeGreaterThan(8);
      for (const sk of [s, f]) for (const p of Object.values(sk)) { expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), e.id).toBe(true); }
      // hands/feet that are placed on something (bar, floor, pad, platform) actually reach it
      for (const [pose, sk] of [[v.start, s], [v.end, f]] as const) {
        const p = pose as SidePose;
        if (p.arm.to) expect(Math.hypot(sk.wrist[0] - p.arm.to[0], sk.wrist[1] - p.arm.to[1]), e.id + ' hand contact').toBeLessThan(1.5);
        if (p.leg.to) expect(Math.hypot(sk.ankle[0] - p.leg.to[0], sk.ankle[1] - p.leg.to[1]), e.id + ' foot contact').toBeLessThan(1.5);
        // feet never below the floor
        if (v.floor !== 0) expect(Math.max(sk.ankle[1], sk.ankle2[1]), e.id + ' floor').toBeLessThanOrEqual((v.floor ?? 182) + 1);
      }
    }
  });

  it('every technique entry is complete in English and Arabic, with the required number of points', () => {
    for (const e of EXERCISES) {
      const t = TECHNIQUE[e.id];
      const n = (en: string[], ar: string[], min: number, max: number, what: string) => {
        expect(en.length, `${e.id} ${what}`).toBeGreaterThanOrEqual(min);
        expect(en.length, `${e.id} ${what}`).toBeLessThanOrEqual(max);
        expect(ar.length, `${e.id} ${what} ar`).toBe(en.length);
        for (const x of en) expect(LATIN.test(x) && x.length > 8, `${e.id} ${what}: ${x}`).toBe(true);
        for (const x of ar) expect(AR.test(x) && x.length > 6, `${e.id} ${what} ar: ${x}`).toBe(true);
      };
      n(t.setupEn, t.setupAr, 3, 5, 'setup');
      n(t.stepsEn, t.stepsAr, 3, 6, 'steps');
      n(t.mistakesEn, t.mistakesAr, 3, 5, 'mistakes');
      n(t.safetyEn, t.safetyAr, 2, 4, 'safety');
      for (const [en, ar] of [[t.breathingEn, t.breathingAr], [t.rangeEn, t.rangeAr], [t.tempoEn, t.tempoAr]]) {
        expect(LATIN.test(en) && en.length > 10, e.id).toBe(true);
        expect(AR.test(ar) && ar.length > 8, e.id).toBe(true);
      }
    }
  });

  it('no unsupported medical claims in the technique text', () => {
    const banned = /\b(cures?|treats?|heals?|guarantee[sd]?|prevents? (all )?injur|therapy|rehabilitat)/i;
    const bannedAr = /(يعالج|يشفي|علاج|يضمن|تأهيل)/;
    for (const e of EXERCISES) {
      const t = TECHNIQUE[e.id];
      const en = [...t.setupEn, ...t.stepsEn, ...t.mistakesEn, ...t.safetyEn, t.breathingEn, t.rangeEn, t.tempoEn].join(' ');
      const ar = [...t.setupAr, ...t.stepsAr, ...t.mistakesAr, ...t.safetyAr, t.breathingAr, t.rangeAr, t.tempoAr].join(' ');
      expect(banned.exec(en)?.[0] ?? null, e.id).toBeNull();
      expect(bannedAr.exec(ar)?.[0] ?? null, e.id).toBeNull();
    }
  });
});
