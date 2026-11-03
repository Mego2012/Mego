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
