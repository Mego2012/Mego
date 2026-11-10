import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import type { DataBundle } from '../lib/reports';
import type { BodyEntry, DayLog, DiaryEntry } from '../lib/types';
import { useApp } from './AppContext';

export function useEntries(date: string): DiaryEntry[] {
  return useLiveQuery(() => db.entries.where('date').equals(date).sortBy('order'), [date], []);
}

export function useDayLog(date: string): DayLog | undefined {
  return useLiveQuery(() => db.days.get(date), [date]);
}

export function useBody(): BodyEntry[] {
  return useLiveQuery(() => db.body.orderBy('date').toArray(), [], []);
}

/** Entire dataset for reports (personal scale — a few thousand rows). Live: updates on every change. */
export function useBundle(): DataBundle | null {
  const { settings } = useApp();
  const raw = useLiveQuery(async () => ({
    entries: await db.entries.toArray(),
    days: await db.days.toArray(),
    body: await db.body.orderBy('date').toArray()
  }), []);
  if (!raw) return null;
  return { ...raw, settings };
}

/** All cardio sessions (kv records "cardio:<id>"), newest first. */
export function useCardio(): import('../lib/cardio').CardioSession[] {
  return useLiveQuery(async () => (await db.kv.where('key').startsWith('cardio:').toArray())
    .map((r) => r.value as import('../lib/cardio').CardioSession).filter((s) => s && s.id && s.date)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)), [], []);
}

/** Training data (kv records): sessions, programs, active program id, recovery logs, custom exercises, preferred ids. */
export function useTraining() {
  return useLiveQuery(async () => {
    const rows = await db.kv.where('key').anyOf(['activeProgram', 'preferredExercises']).toArray();
    const pick = async <T,>(prefix: string) => (await db.kv.where('key').startsWith(prefix).toArray()).map((r) => r.value as T);
    return {
      workouts: (await pick<import('../lib/workouts').WorkoutSession>('workout:')).filter((w) => w && w.id).sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt),
      programs: (await pick<import('../lib/workouts').Program>('program:')).filter((p) => p && p.id).sort((a, b) => a.createdAt - b.createdAt),
      recovery: (await pick<import('../lib/workouts').RecoveryLog>('recovery:')).sort((a, b) => a.date.localeCompare(b.date)),
      custom: (await pick<import('../lib/exercises').Exercise>('exercise:')).filter((e) => e && e.id),
      activeId: rows.find((r) => r.key === 'activeProgram')?.value as string | undefined,
      preferred: (rows.find((r) => r.key === 'preferredExercises')?.value as string[] | undefined) ?? []
    };
  }, [], null);
}
