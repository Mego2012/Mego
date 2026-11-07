import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/db';
import { addPhoto, compressImage, deletePhoto } from '../lib/repo';
import { progressEstimate } from '../lib/reports';
import type { ProgressPhoto } from '../lib/types';
import { Icon } from '../components/icons';
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
    const est = progressEstimate(body, settings.profile.targetWeight, date);
    return { latest, startWeight, points, waistPts, week, month, weeks, waistFirst: waists[0], waistLast: waists[waists.length - 1], est };
  }, [body, range, date, settings]);

  const cur = view.latest?.weight ?? settings.profile.currentWeight;
  const target = settings.profile.targetWeight;
  const change = view.latest?.weight && view.startWeight ? round(view.latest.weight - view.startWeight, 1) : null;
  const span = (view.startWeight ?? cur) - target;
  const goalPct = span !== 0 ? Math.max(0, Math.min(100, (((view.startWeight ?? cur) - cur) / span) * 100)) : 0;
  return (
    <div data-testid="progress-page">
      <section className="weight-hero">
        <div className="wh-top">
          <div>
            <div className="k-label">{t('currentWeight')}</div>
            <div className="wh-now num" data-testid="progress-current">{n(cur, 1)} <span className="unit">{t('kg')}</span></div>
            <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
              <span className="chip">{t('changeFromStart')}: <Delta value={change} unit={` ${t('kg')}`} /></span>
              {view.est.ratePerWeek !== null && <span className="chip num">{view.est.ratePerWeek > 0 ? '+' : ''}{n(view.est.ratePerWeek, 2)} {t('kg')}{t('perWeek')}</span>}
            </div>
          </div>
          <button className="add-fab big" onClick={() => setEditing('new')} data-testid="add-measurement" aria-label={t('addMeasurement')}><Icon name="plus" /><span>{t('addMeasurement')}</span></button>
        </div>
        <div className="goal-line" aria-hidden="true">
          <div className="gl-track"><i style={{ width: `${goalPct}%` }} /><b style={{ insetInlineStart: `${goalPct}%` }} /></div>
          <div className="gl-labels num"><span>{n(view.startWeight, 1)}</span><span>{t('targetWeight')} {n(target, 1)}</span></div>
        </div>
        <div className="grid2 wh-stats" data-testid="progress-estimate">
          <div className="stat"><div className="k">{t('eta')}</div><div className="v num">{view.est.etaDate ? d(view.est.etaDate, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
            {view.est.weeksToTarget !== null && <div className="tiny muted">{t('weeksToGo', { n: view.est.weeksToTarget })}</div>}</div>
          <div className="stat"><div className="k">{t('rate')}</div><div className="v num">{view.est.ratePerWeek === null ? '—' : `${view.est.ratePerWeek > 0 ? '+' : ''}${n(view.est.ratePerWeek, 2)} ${t('kg')}${t('perWeek')}`}</div>
            {view.est.ratePctPerWeek !== null && <div className="tiny muted num">{n(view.est.ratePctPerWeek, 2)}%{t('perWeek')}</div>}</div>
        </div>
        <div className={`tiny ${view.est.pace === 'fast' || view.est.pace === 'away' ? 'delta pos' : 'muted'}`}>{t('pace_' + view.est.pace)}</div>
      </section>

      <div className="mini-stats">
        <div className="stat"><div className="k">{t('weeklyAverage')}</div><div className="v num" data-testid="progress-week-avg">{n(view.week.average, 2)}</div><div className="tiny muted">{t('weighIns', { n: view.week.count })}</div></div>
        <div className="stat"><div className="k">{t('monthlyAverage')}</div><div className="v num">{n(view.month.average, 2)}</div><div className="tiny muted">{t('weighIns', { n: view.month.count })}</div></div>
        <div className="stat"><div className="k">{t('waistTrend')}</div><div className="v">
          {view.waistLast ? <><span className="num">{n(view.waistLast.waist, 1)}</span> <Delta value={(settings.profile.startWaist ?? view.waistFirst?.waist) ? round(view.waistLast.waist! - (settings.profile.startWaist ?? view.waistFirst!.waist!), 1) : null} unit={` ${t('cm')}`} /></> : '—'}</div>
          <div className="tiny muted">{t('startWaist')} {n(settings.profile.startWaist ?? view.waistFirst?.waist ?? null, 1)}</div></div>
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
          {[...body].reverse().slice(0, 120).map((b, i, arr) => (
            <li key={b.id} className="clickable" onClick={() => setEditing(b)} data-testid="body-row">
              <span className="date-badge"><b className="num">{d(b.date, { day: 'numeric' })}</b><small>{d(b.date, { month: 'short' })}</small></span>
              <div className="grow"><div className="bold">{d(b.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div className="tiny muted">{FIELDS.filter((f) => f !== 'weight' && b[f]).map((f) => `${t(f)} ${n(b[f], 1)}`).join(' · ')}{b.notes ? ` · ${b.notes}` : ''}</div></div>
              <div style={{ textAlign: 'end' }}>
                <div className="num bold">{b.weight ? `${n(b.weight, 1)} ${t('kg')}` : '—'}</div>
                {b.weight && arr.slice(i + 1).find((x) => x.weight) && <div className="tiny"><Delta value={round(b.weight - arr.slice(i + 1).find((x) => x.weight)!.weight!, 1)} /></div>}
              </div>
            </li>
          ))}
          {!body.length && <li className="empty">{t('noData')}</li>}
        </ul>
      </Card>
      <PhotosCard />
      {editing && <BodySheet entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PhotosCard() {
  const { t, d } = useApp();
  const photos = useLiveQuery(() => db.photos.orderBy('date').reverse().toArray(), [], []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [del, setDel] = useState<ProgressPhoto | null>(null);
  const { run } = useAsync();
  return (
    <Card title={<><Icon name="camera" />{t('photos')}</>} actions={<button className="btn sm" onClick={() => fileRef.current?.click()} data-testid="add-photo">+ {t('addPhoto')}</button>}>
      <div className="tiny muted" style={{ marginBottom: 8 }}>{t('photosPrivate')}</div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden data-testid="photo-input"
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await run(async () => addPhoto(today(), await compressImage(f))); }} />
      <div className="grid3" data-testid="photo-grid">
        {photos.map((p) => <PhotoThumb key={p.id} p={p} label={d(p.date)} onDelete={() => setDel(p)} />)}
      </div>
      {!photos.length && <div className="empty">{t('noData')}</div>}
      {del && <Confirm danger message={t('delete') + '?'} onNo={() => setDel(null)} onYes={async () => { await deletePhoto(del.id); setDel(null); }} />}
    </Card>
  );
}

function PhotoThumb({ p, label, onDelete }: { p: ProgressPhoto; label: string; onDelete: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const u = URL.createObjectURL(p.blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [p.blob]);
  return (
    <div style={{ position: 'relative' }}>
      {url && <img src={url} alt={label} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 10 }} />}
      <div className="tiny center">{label}</div>
      <button className="icon-btn" style={{ position: 'absolute', top: 2, insetInlineEnd: 2, background: 'var(--surface)', width: 28, height: 28 }} onClick={onDelete} aria-label="delete">×</button>
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
