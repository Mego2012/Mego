import type { Settings } from './types';

/** Starting profile from the user's brief. Every value is editable in Settings. */
export function defaultSettings(): Settings {
  return {
    id: 'main',
    profile: {
      sex: 'male',
      age: 26,
      heightCm: 170,
      startWeight: 72,
      currentWeight: 72,
      targetWeight: 72,
      weeklyChangeKg: -0.25,
      goal: 'Fat loss while preserving muscle',
      trainingDaysPerWeek: 6
    },
    targets: {
      training: { kcal: 2000, protein: 160, carbs: 200, fat: 62 },
      rest: { kcal: 2000, protein: 160, carbs: 200, fat: 62 }
    },
    // Saturday..Thursday training, Friday rest (6 days/week). Editable.
    trainingWeekdays: [6, 0, 1, 2, 3, 4],
    tolerance: { caloriePct: 10, proteinPct: 5 },
    autoCompletePastDays: true,
    weekStartsOn: 6,
    lang: 'ar',
    theme: 'system',
    sync: { url: '', token: '', autoSync: true, writeFoodsToSheet: false },
    updatedAt: Date.now()
  };
}
