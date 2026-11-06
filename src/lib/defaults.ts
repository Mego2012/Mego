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
      goalType: 'fat_loss_preserve',
      trainingDaysPerWeek: 6,
      startWaist: 82,
      activityLevel: 'active'
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
    completeThresholdPct: 60,
    waterTargetMl: 3000,
    habits: [
      { id: 'h-protein-each-meal', name: 'بروتين في كل وجبة', active: true },
      { id: 'h-veg', name: 'خضار مرتين يومياً', active: true },
      { id: 'h-weigh', name: 'وزن الصباح', active: true }
    ],
    reminders: [
      { id: 'r-water', kind: 'water', label: 'اشرب ماء', time: '11:00', enabled: false },
      { id: 'r-lunch', kind: 'meal', label: 'سجّل الغداء', time: '15:00', enabled: false },
      { id: 'r-dinner', kind: 'meal', label: 'سجّل العشاء', time: '21:30', enabled: false },
      { id: 'r-weigh', kind: 'weigh', label: 'سجّل وزنك', time: '08:00', enabled: false }
    ],
    fastingTargetHours: 16,
    backupPhotos: false,
    updatedAt: Date.now()
  };
}
