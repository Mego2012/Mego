import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aminoAcidScore, buildIntelFoods, goalClass, nrf93, prosCons, rankFoods, RANKINGS, subScores } from '../src/lib/foodIntel';
import { INTEL_CATALOG } from '../src/lib/intelCatalog';

const ref = JSON.parse(readFileSync(new URL('../public/fooddb/usda.json', import.meta.url), 'utf8'));
const extra = JSON.parse(readFileSync(new URL('../public/fooddb/usda-extra.json', import.meta.url), 'utf8'));
const foods = buildIntelFoods(ref, extra, 'en');
const F = (en: string) => foods.find((f) => f.item.en === en)!;

describe('Food Intelligence', () => {
  it('every catalog food exists in USDA data; values are the USDA values', () => {
    expect(foods).toHaveLength(INTEL_CATALOG.length);
    const row = ref.rows.find((r: unknown[]) => r[0] === 'S171477');
    expect([F('Chicken breast, roasted (skinless)').kcal, F('Chicken breast, roasted (skinless)').protein]).toEqual([row[3], row[4]]);
    expect(foods.every((f) => /^USDA FDC \d+/.test(f.source))).toBe(true);
  });
  it('amino-acid scores reproduce known limiting amino acids', () => {
    expect(aminoAcidScore(F('White rice, cooked'))!.limiting).toBe('lys');
    expect(aminoAcidScore(F('White rice, cooked'))!.score).toBeLessThan(0.9);
    expect(aminoAcidScore(F('Lentils, cooked'))!.limiting).toBe('saa');
    expect(aminoAcidScore(F('Chicken breast, roasted (skinless)'))!.score).toBe(1);
    expect(aminoAcidScore(F('Egg white'))!.score).toBe(1);
    expect(aminoAcidScore(F('Whey protein powder'))).toBeUndefined(); // not in the source → no guess
    expect(subScores(F('Whey protein powder')).aminoScore).toBeUndefined();
  });
  it('rankings depend on the goal', () => {
    const cut = rankFoods(foods, 'protein', 'cut').map((r) => r.food.item.id);
    const build = rankFoods(foods, 'protein', 'build').map((r) => r.food.item.id);
    expect(cut).not.toEqual(build);
    const carbCut = rankFoods(foods, 'carb', 'cut'), carbBuild = rankFoods(foods, 'carb', 'build');
    expect(carbCut[0].food.item.id).not.toBe(carbBuild[0].food.item.id);
    expect(goalClass('fat_loss_preserve')).toBe('cut');
    expect(goalClass('lean_bulk')).toBe('build');
  });
  it('origin (animal/plant) never changes a score', () => {
    const lentils = F('Lentils, cooked');
    const flipped = { ...lentils, item: { ...lentils.item, origin: 'animal' as const } };
    const a = rankFoods([lentils], 'protein', 'maintain')[0].score, b = rankFoods([flipped], 'protein', 'maintain')[0].score;
    expect(a).toBe(b);
  });
  it('all ranking kinds produce ordered, explained lists', () => {
    for (const k of RANKINGS) {
      const r = rankFoods(foods, k, 'maintain');
      expect(r.length).toBeGreaterThan(5);
      for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
      expect(r[0].rank).toBe(1);
    }
    expect(rankFoods(foods, 'lowCalorie', 'maintain')[0].food.kcal).toBeLessThan(25);
    expect(rankFoods(foods, 'fiber', 'maintain')[0].food.fiber).toBeGreaterThan(8);
  });
  it('nutrient density NRF9.3: spinach ≫ butter; pros/cons come from the values', () => {
    expect(nrf93(F('Spinach'))!).toBeGreaterThan(nrf93(F('Butter'))! + 100);
    const pc = prosCons(F('Chicken breast, roasted (skinless)'));
    expect(pc.pros.map((p) => p.key)).toEqual(expect.arrayContaining(['pc_highProtein', 'pc_proteinDense', 'pc_completeAA']));
    expect(prosCons(F('White rice, cooked')).cons.map((p) => p.key)).toEqual(expect.arrayContaining(['pc_limitingAA', 'pc_refined', 'pc_lowFiber']));
    expect(prosCons(F('Salmon (farmed), cooked')).pros.map((p) => p.key)).toContain('pc_epaDha');
  });
});
