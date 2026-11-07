/**
 * Demo data for screenshots and visual audits ONLY. Included in a build only when VITE_DEMO=1
 * (scripts/screenshots.mjs); production builds never contain it. Every value comes from the shipped USDA database.
 */
import { db } from './db';
import { addDays, today } from './dates';
import { loadRefFoods, toRefFood } from './refFoods';
import { addFoodEntry, addWater, createFood, saveBodyEntry, saveSettings, updateDayLog } from './repo';
import type { Food, MealType } from './types';

const PICK: [string, string, string][] = [
  ['S171477', 'صدر دجاج مشوي', 'Chicken breast, roasted'], ['S168878', 'أرز أبيض مطبوخ', 'White rice, cooked'],
  ['S173424', 'بيض مسلوق', 'Egg, hard-boiled'], ['S173904', 'شوفان', 'Oats'], ['S173944', 'موز', 'Banana'],
  ['S170894', 'زبادي يوناني خالي الدسم', 'Greek yogurt, nonfat'], ['S175168', 'سلمون مطبوخ', 'Salmon, cooked'],
  ['S169967', 'بروكلي مسلوق', 'Broccoli, boiled'], ['S171413', 'زيت زيتون', 'Olive oil'], ['S170567', 'لوز', 'Almonds'],
  ['S168191', 'تمر مجدول', 'Medjool dates'], ['S172421', 'عدس مطبوخ', 'Lentils, cooked'], ['S174916', 'خبز بر', 'Whole-wheat pita'],
  ['S170457', 'طماطم', 'Tomatoes'], ['S168409', 'خيار', 'Cucumber'], ['S168483', 'بطاطا حلوة مشوية', 'Sweet potato, baked']
];

/** [food index, grams] per meal; varied by day so charts are not flat. */
const DAYS: Record<MealType, [number, number][]>[] = [
  { breakfast: [[3, 60], [4, 120], [5, 170]], lunch: [[0, 180], [1, 200], [7, 120]], dinner: [[6, 150], [15, 200], [8, 10]], snacks: [[9, 30], [10, 48]] },
  { breakfast: [[2, 100], [12, 64], [13, 120]], lunch: [[11, 250], [1, 150], [14, 100]], dinner: [[0, 200], [7, 150]], snacks: [[5, 170], [4, 120]] },
  { breakfast: [[3, 70], [5, 200], [10, 24]], lunch: [[6, 160], [1, 220]], dinner: [[2, 100], [12, 64], [14, 150]], snacks: [[9, 25]] }
];

export async function seedDemo() {
  if ((await db.entries.count()) > 0) return 'already';
  const ref = await loadRefFoods();
  const byId = new Map(ref.rows.map((r) => [r[0], r]));
  const foods: Food[] = [];
  for (const [id, ar, en] of PICK) {
    const row = byId.get(id);
    if (!row) throw new Error('missing ' + id);
    const rf = toRefFood(row);
    foods.push(await createFood({
      nameAr: ar, nameEn: en, category: rf.category, per100: { ...rf.per100 }, state: rf.state, stateLabel: '', prep: '',
      notes: rf.source, source: 'usda', sourceRef: rf.source, servings: rf.portions.map((p, k) => ({ id: 'p' + k, name: p.label, grams: p.grams }))
    }, { allowDuplicate: true }));
  }
  const now = today();
  for (let i = 27; i >= 0; i--) {
    const date = addDays(now, -i);
    const plan = DAYS[i % DAYS.length];
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks'] as MealType[]) {
      if (i === 0 && meal !== 'breakfast' && meal !== 'lunch') continue; // today: a day in progress
      for (const [fi, g] of plan[meal]) await addFoodEntry(date, meal, foods[fi], Math.round(g * (0.9 + ((i * 7 + fi) % 5) * 0.05)), 'g');
    }
    await addWater(date, i === 0 ? 1250 : 2250 + (i % 4) * 250);
    if (i > 0 && i % 6 !== 3) await updateDayLog(date, { status: 'complete' });
    if (i % 3 === 0) await saveBodyEntry(date, { weight: Math.round((86.4 - (27 - i) * 0.09 + ((i * 13) % 5) * 0.08) * 10) / 10 });
  }
  await saveSettings((s) => { s.profile = { ...s.profile, name: s.profile.name || 'Sara', startWeight: 87, targetWeight: 80 }; });
  return 'seeded';
}
