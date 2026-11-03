import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useBody } from '../app/hooks';
import { WeightChart } from '../components/charts';
import { Card, Confirm, Delta, NumField, Segmented, Sheet, useAsync } from '../components/ui';
import { addDays, isValidISODate, monthDates, monthKey, startOfWeek, today, weekDates } from '../lib/dates';
import { round } from '../lib/nutrition';
import { rollingWeightAverage, weightStats } from '../lib/reports';
import { deleteBodyEntry, saveBodyEntry, type BodyInput } from '../lib/repo';
import type { BodyEntry } from '../lib/types';

const FIELDS = ['weight', 'waist', 'chest', 'hips', 'arm', 'thigh', 'neck', 'bodyFat'] as const;

export default function Progress() {
  const { t, n, d, settings } = useApp();
  const body = useBody();
  const [range, setRange] = useState<'30' | '90' | '365' | 'all'>('90');
  const [editing, setEditing] = useState<BodyEntry | 'new' | null>(null);
  const date = today();

  const view = useMemo(() => {
    const weights = body.filter((b) => b.weight);
    const first = weights[0];
    const latest = weights[weights.length - 1];
    const startWeight = settings.profile.startWeight || first?.weight || null;
    const from = range === 'all' ? body[0]?.date ?? date : addDays(date, -Number(range));
    const points = body.filter((b) => b.date >= from && b.weight).map((b) => ({ date: b.date, weight: b.weight!, avg: rollingWeightAverage(body, b.date) }));
    const waistPts = body.filter((b) => b.date >= from && b.waist).map((b) => ({ date: b.date, weight: b.waist! }));
    const week = weightStats(body, weekDates(startOfWeek(date, settings.weekStartsOn)));
    const month = weightStats(body, monthDates(monthKey(date)));
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const s = startOfWeek(addDays(date, -7 * i), settings.weekStartsOn);
      return { weekStart: s, ...weightStats(body, weekDates(s)) };
    });
    const waists = body.filter((b) => b.waist);
    return { latest, startWeight, points, waistPts, week, month, weeks, waistFirst: waists[0], waistLast: waists[waists.length - 1] };
  }, [body, range, date, settings]);

  return (
    <div data-testid="progress-page">
      <button className="btn primary block" style={{ marginBottom: 12 }} onClick={() => setEditing('new')} data-testid="add-measurement">+ {t('addMeasurement')}</button>
      <div className="grid2" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="k">{t('currentWeight')}</div><div className="v num" data-testid="progress-current">{n(view.latest?.weight ?? settings.profile.currentWeight, 1)} {t('kg')}</div></div>
        <div className="stat"><div className="k">{t('changeFromStart')} ({n(view.startWeight, 1)})</div><div className="v">
          <Delta value={view.latest?.weight && view.startWeight ? round(view.latest.weight - view.startWeight, 1) : null} unit={` ${t('kg')}`} /></div></div>
        <div className="stat"><div className="k">{t('weeklyAverage')}</div><div className="v num" data-testid="progress-week-avg">{n(view.week.average, 2)}</div><div className="tiny muted">{t('weighIns', { n: view.week.count })}</div></div>
        <div className="stat"><div className="k">{t('monthlyAverage')}</div><div className="v num">{n(view.month.average, 2)}</div><div className="tiny muted">{t('weighIns', { n: view.month.count })}</div></div>
        <div className="stat"><div className="k">{t('targetWeight')}</div><div className="v num">{n(settings.profile.targetWeight, 1)}</div></div>
        <div className="stat"><div className="k">{t('waistTrend')}</div><div className="v">
          {view.waistLast ? <>{n(view.waistLast.waist, 1)} <Delta value={view.waistFirst && view.waistLast !== view.waistFirst ? round(view.waistLast.waist! - view.waistFirst.waist!, 1) : null} unit={` ${t('cm')}`} /></> : '—'}</div></div>
      </div>

      <Card title={t('weightTrendChart')}>
        <Segmented value={range} options={[{ value: '30', label: '30' }, { value: '90', label: '90' }, { value: '365', label: '365' }, { value: 'all', label: t('all') }]} onChange={setRange} />
        {view.points.length ? <WeightChart points={view.points} avg target={settings.profile.targetWeight} /> : <div className="empty">{t('noData')}</div>}
        <div className="tiny muted">{t('weightChartNote')}</div>
      </Card>

      {view.waistPts.length > 1 && <Card title={t('waistTrend')}><WeightChart points={view.waistPts} /></Card>}

      <Card title={t('weeklyAverage')}>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>{t('week')}</th><th>{t('weightAvg')}</th><th>{t('vsPrevious')}</th><th>{t('weighIns', { n: '' }).trim()}</th></tr></thead>
          <tbody>{view.weeks.map((w, i) => (
            <tr key={w.weekStart}><td>{d(w.weekStart, { day: 'numeric', month: 'short' })}</td><td className="num">{n(w.average, 2)}</td>
              <td><Delta value={w.average !== null && view.weeks[i + 1]?.average != null ? round(w.average - view.weeks[i + 1].average!, 2) : null} digits={2} /></td><td className="num">{w.count}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>

      <Card title={t('weightHistory')}>
        <ul className="list" data-testid="body-history">
          {[...body].reverse().slice(0, 120).map((b) => (
            <li key={b.id} className="clickable" onClick={() => setEditing(b)} data-testid="body-row">
              <div className="grow"><div className="bold">{d(b.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div className="tiny muted">{FIELDS.filter((f) => f !== 'weight' && b[f]).map((f) => `${t(f)} ${n(b[f], 1)}`).join(' · ')}{b.notes ? ` · ${b.notes}` : ''}</div></div>
              <span className="num bold">{b.weight ? `${n(b.weight, 1)} ${t('kg')}` : '—'}</span>
            </li>
          ))}
          {!body.length && <li className="empty">{t('noData')}</li>}
        </ul>
      </Card>
      {editing && <BodySheet entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BodySheet({ entry, onClose }: { entry: BodyEntry | null; onClose: () => void }) {
  const { t } = useApp();
  const [date, setDate] = useState(entry?.date ?? today());
  const [v, setV] = useState<Record<string, number | ''>>(() => Object.fromEntries(FIELDS.map((f) => [f, entry?.[f] ?? ''])));
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [confirm, setConfirm] = useState(false);
  const { run, busy } = useAsync();
  const save = async () => {
    const values: BodyInput = { notes };
    for (const f of FIELDS) (values as Record<string, unknown>)[f] = v[f] === '' ? undefined : Number(v[f]);
    if (entry && entry.date !== date) await deleteBodyEntry(entry.id);
    if (await run(() => saveBodyEntry(date, values), t('measurementSaved'))) onClose();
  };
  return (
    <Sheet title={entry ? t('edit') : t('addMeasurement')} onClose={onClose}>
      <div className="stack" data-testid="body-form">
        <label className="field"><span>{t('date')}</span><input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} data-testid="body-date" /></label>
        <div className="grid2">
          {FIELDS.map((f) => <NumField key={f} label={t(f)} suffix={f === 'weight' ? t('kg') : f === 'bodyFat' ? '%' : t('cm')} value={v[f]} onChange={(x) => setV({ ...v, [f]: x })} testId={`body-${f}`} />)}
        </div>
        <label className="field"><span>{t('notes')}</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <button className="btn primary block" disabled={busy || !isValidISODate(date) || FIELDS.every((f) => v[f] === '')} onClick={save} data-testid="body-save">{t('save')}</button>
        {entry && <button className="btn danger block" onClick={() => setConfirm(true)}>{t('delete')}</button>}
      </div>
      {confirm && entry && <Confirm danger message={t('confirmDeleteMeasurement', { date: entry.date })} onNo={() => setConfirm(false)} onYes={async () => { await deleteBodyEntry(entry.id); onClose(); }} />}
    </Sheet>
  );
}
