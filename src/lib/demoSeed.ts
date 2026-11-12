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
  await seedTraining(now);
  return 'seeded';
}

/** Workouts (from the active program), cardio, waist, recovery and a generated meal plan for this week. */
async function seedTraining(now: string) {
  const { getActiveProgram, dayFor, saveWorkout, saveRecovery } = await import('./workouts');
  const { saveCardio } = await import('./cardio');
  const { findExercise } = await import('./exercises');
  const prog = await getActiveProgram();
  for (let i = 20; i >= 1; i--) {
    const date = addDays(now, -i);
    const day = dayFor(prog, date);
    if (day && !day.rest && day.exercises.length) {
      const k = 20 - i; // progressive overload over the weeks
      await saveWorkout({
        id: 'demo-w-' + date, date, programId: prog.id, dayId: day.id, name: day.name, muscles: day.muscles,
        startedAt: Date.parse(date + 'T18:00:00'), endedAt: Date.parse(date + 'T19:05:00'), bodyWeightKg: 84, updatedAt: Date.now(),
        exercises: day.exercises.map((e) => {
          const ex = findExercise(e.exerciseId);
          const base = ex?.equipment.includes('bodyweight') ? null : 20 + ((e.exerciseId.length * 7) % 40);
          return {
            exerciseId: e.exerciseId, name: ex?.nameEn ?? e.exerciseId, status: 'done' as const, restSec: e.restSec,
            target: { sets: e.sets, repMin: e.repMin, repMax: e.repMax, targetRir: e.targetRir },
            sets: Array.from({ length: e.sets }, (_, j) => ({ reps: e.repMax - (j > 1 ? 1 : 0), weightKg: base === null ? null : base + Math.floor(k / 4) * 2.5, rir: e.targetRir, done: true }))
          };
        })
      });
    }
    await saveRecovery({ date, sleepH: 6.5 + (i % 3) * 0.5, soreness: 2 + (i % 3), energy: 3 + (i % 2), fatigue: 2 + (i % 2) });
    if (i % 2 === 0) await saveCardio({ activity: i % 4 === 0 ? 'walking' : 'cycling', date, time: '07:00', durationMin: 30 + (i % 3) * 5, ...(i % 4 === 0 ? { distanceKm: 3.2, speedKmh: 5.5 } : {}), intensity: 'moderate' }, 84);
  }
  for (let i = 27; i >= 0; i -= 7) await saveBodyEntry(addDays(now, -i), { weight: Math.round((86.3 - (27 - i) * 0.09) * 10) / 10, waist: Math.round((96 - (27 - i) * 0.07) * 10) / 10 });
  const { computeLibrary, generatePlan, applyGeneratedPlan } = await import('./recipeEngine');
  const { getSettings } = await import('./repo');
  const { targetsFor } = await import('./targets');
  const s = await getSettings();
  const lib = await computeLibrary();
  const dates = Array.from({ length: 7 }, (_, i) => addDays(now, i));
  await applyGeneratedPlan(generatePlan(dates, (d) => targetsFor(d, s), lib));
}
