import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useDayLog } from '../app/hooks';
import { Card, Confirm, NumField, ProgressBar, useAsync } from '../components/ui';
import { db } from '../lib/db';
import { addDays, today } from '../lib/dates';
import { requestNotificationPermission } from '../lib/reminders';
import { addWater, deleteFast, endFast, saveSettings, setWater, startFast, toggleHabit, uid } from '../lib/repo';
import type { Reminder } from '../lib/types';

export default function Habits() {
  return (
    <div data-testid="habits-page">
      <WaterCard />
      <HabitsCard />
      <FastingCard />
      <RemindersCard />
    </div>
  );
}

function WaterCard() {
  const { t, n, settings } = useApp();
  const date = today();
  const log = useDayLog(date);
  const water = log?.waterMl ?? 0;
  const [custom, setCustom] = useState<number | ''>('');
  const { run } = useAsync();
  return (
    <Card title={`💧 ${t('water')}`}>
      <div className="big num center" data-testid="water-total">{n(water)} <span className="small muted">/ {n(settings.waterTargetMl)} {t('ml')}</span></div>
      <div style={{ margin: '8px 0' }}><ProgressBar value={water} max={settings.waterTargetMl} color="var(--info)" /></div>
      <div className="row wrap" style={{ gap: 6, justifyContent: 'center' }}>
        {[150, 250, 330, 500, 750].map((ml) => <button key={ml} className="btn sm" onClick={() => run(() => addWater(date, ml))} data-testid={`h-water-${ml}`}>+{ml}</button>)}
        <button className="btn sm ghost" onClick={() => run(() => addWater(date, -250))} data-testid="h-water-minus">−250</button>
      </div>
      <WaterHistory />
      <div className="row" style={{ marginTop: 10 }}>
        <input className="input num grow" type="number" inputMode="numeric" placeholder={t('ml')} value={custom} onChange={(e) => setCustom(e.target.value === '' ? '' : Number(e.target.value))} />
        <button className="btn" disabled={custom === ''} onClick={() => run(() => setWater(date, Number(custom)))}>{t('save')}</button>
      </div>
    </Card>
  );
}

/** Consecutive days a habit was done, counting back from today (or from yesterday if today isn't done yet). */
export function habitStreak(days: { date: string; habits?: Record<string, boolean> }[], id: string, from = today()): number {
  const done = new Set(days.filter((d) => d.habits?.[id]).map((d) => d.date));
  let d = done.has(from) ? from : addDays(from, -1);
  let n = 0;
  while (done.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

function HabitsCard() {
  const { t, settings } = useApp();
  const date = today();
  const log = useDayLog(date);
  const allDays = useLiveQuery(() => db.days.toArray(), [], []);
  const [name, setName] = useState('');
  const active = settings.habits.filter((h) => h.active);
  const done = active.filter((h) => log?.habits?.[h.id]).length;
  return (
    <Card title={t('habitsTitle')} actions={<span className="chip">{t('dayCompletion')}: {active.length ? Math.round((done / active.length) * 100) : 0}%</span>}>
      {active.map((h) => (
        <label key={h.id} className="check" data-testid="habit-row">
          <input type="checkbox" checked={!!log?.habits?.[h.id]} onChange={() => toggleHabit(date, h.id)} data-testid="habit-check" />
          <span className="grow">{h.name} <span className="tiny muted" data-testid="habit-streak">🔥 {t('streak', { n: habitStreak(allDays, h.id) })}</span></span>
          <button className="icon-btn" aria-label={t('delete')} onClick={(e) => { e.preventDefault(); saveSettings((s) => { s.habits = s.habits.map((x) => (x.id === h.id ? { ...x, active: false } : x)); }); }}>×</button>
        </label>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        <input className="input grow" placeholder={t('habitName')} value={name} onChange={(e) => setName(e.target.value)} data-testid="habit-name" />
        <button className="btn" disabled={!name.trim()} data-testid="habit-add" onClick={async () => { await saveSettings((s) => { s.habits = [...s.habits, { id: uid(), name: name.trim(), active: true }]; }); setName(''); }}>{t('addHabit')}</button>
      </div>
    </Card>
  );
}

function FastingCard() {
  const { t, n, d, settings } = useApp();
  const fasts = useLiveQuery(() => db.fasts.orderBy('start').reverse().toArray(), [], []);
  const open = fasts.find((f) => !f.end && !f.deleted);
  const [now, setNow] = useState(Date.now());
  const [hours, setHours] = useState<number | ''>(settings.fastingTargetHours);
  const [del, setDel] = useState<string | null>(null);
  const { run } = useAsync();
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(i); }, []);
  const elapsed = open ? (now - open.start) / 3600000 : 0;
  return (
    <Card title={`⏳ ${t('fasting')}`}>
      {open ? (
        <div className="stack" data-testid="fast-running">
          <div className="big num center">{t('fastRunning', { h: Math.floor(elapsed), m: Math.floor((elapsed % 1) * 60) })}</div>
          <ProgressBar value={elapsed} max={open.targetHours} color="var(--primary)" />
          <div className="tiny muted center">{elapsed >= open.targetHours ? `✓ ${t('fastGoalReached')}` : `${t('target')}: ${open.targetHours} h`}</div>
          <button className="btn primary block" onClick={() => run(() => endFast(open.id))} data-testid="fast-end">{t('endFast')}</button>
        </div>
      ) : (
        <div className="row">
          <div className="grow"><NumField label={t('fastingHours')} value={hours} onChange={setHours} /></div>
          <button className="btn primary" style={{ alignSelf: 'flex-end' }} disabled={!(Number(hours) > 0 && Number(hours) <= 72)} data-testid="fast-start"
            onClick={() => run(async () => { await saveSettings((s) => { s.fastingTargetHours = Number(hours); }); return startFast(Number(hours)); })}>{t('startFast')}</button>
        </div>
      )}
      <div className="small bold" style={{ marginTop: 12 }}>{t('fastHistory')}</div>
      <ul className="list">
        {fasts.filter((f) => f.end).slice(0, 14).map((f) => {
          const h = (f.end! - f.start) / 3600000;
          return (
            <li key={f.id}>
              <span className="grow small">{d(new Date(f.start).toISOString().slice(0, 10))}</span>
              <span className="num small">{n(h, 1)} h {h >= f.targetHours ? '✓' : ''}</span>
              <button className="icon-btn" onClick={() => setDel(f.id)} aria-label={t('delete')}>×</button>
            </li>
          );
        })}
        {!fasts.some((f) => f.end) && <li className="empty">{t('noFasts')}</li>}
      </ul>
      {del && <Confirm danger message={t('delete') + '?'} onNo={() => setDel(null)} onYes={async () => { await deleteFast(del); setDel(null); }} />}
    </Card>
  );
}

function RemindersCard() {
  const { t, settings, toast } = useApp();
  const update = (id: string, patch: Partial<Reminder>) => saveSettings((s) => { s.reminders = s.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)); });
  return (
    <Card title={`🔔 ${t('reminders')}`}>
      <div className="tiny muted" style={{ marginBottom: 8 }}>{t('remindersNote')}</div>
      <button className="btn sm" style={{ marginBottom: 8 }} onClick={async () => { const p = await requestNotificationPermission(); if (p === 'denied') toast(t('notificationsBlocked')); }}>{t('enableNotifications')}</button>
      {settings.reminders.map((r) => (
        <div key={r.id} className="row" style={{ padding: '6px 0' }} data-testid="reminder-row">
          <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.id, { enabled: e.target.checked })} style={{ width: 20, height: 20 }} aria-label={r.label} />
          <input className="input grow" value={r.label} onChange={(e) => update(r.id, { label: e.target.value })} />
          <input className="input" style={{ width: 110 }} type="time" value={r.time} onChange={(e) => update(r.id, { time: e.target.value })} aria-label={t('reminderTime')} />
        </div>
      ))}
    </Card>
  );
}

function WaterHistory() {
  const { t, n, d, settings } = useApp();
  const days = useLiveQuery(() => db.days.where('date').between(addDays(today(), -13), today(), true, true).toArray(), [], []);
  const map = new Map(days.map((x) => [x.date, x.waterMl ?? 0]));
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
  const max = Math.max(settings.waterTargetMl, ...dates.map((x) => map.get(x) ?? 0), 1);
  return (
    <div style={{ marginTop: 12 }} data-testid="water-history">
      <div className="tiny muted" style={{ marginBottom: 4 }}>{t('waterHistory')}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 70, direction: 'ltr' }}>
        {dates.map((x) => {
          const v = map.get(x) ?? 0;
          return <div key={x} title={`${d(x)}: ${n(v)} ${t('ml')}`} style={{ flex: 1, height: `${Math.max(3, (v / max) * 100)}%`, borderRadius: 4, background: v >= settings.waterTargetMl ? 'var(--info)' : v ? 'color-mix(in srgb, var(--info) 45%, transparent)' : 'var(--surface-2)' }} />;
        })}
      </div>
    </div>
  );
}
