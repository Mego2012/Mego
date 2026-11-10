import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useBody, useCardio } from '../app/hooks';
import { MinutesChart } from '../components/charts';
import { Icon } from '../components/icons';
import { Card, Confirm, NumField, Segmented, Sheet, useAsync } from '../components/ui';
import {
  ACTIVITIES, activityDef, buildSession, cardioTrends, dailyMinutes, datesBack, DEFAULT_ROUTINE, deleteCardio, effectiveSpeed,
  ROUTINE_KEY, saveCardio, saveRoutine, totalsFor, validateCardio, weightOn, WHO_WEEKLY_MIN,
  type CardioActivity, type CardioInput, type CardioRoutine, type CardioSession, type Intensity
} from '../lib/cardio';
import { db } from '../lib/db';
import { monthKey, today } from '../lib/dates';

const nowTime = () => new Date().toTimeString().slice(0, 5);

export default function Cardio() {
  const { t, n, settings } = useApp();
  const sessions = useCardio();
  const body = useBody();
  const routine = useLiveQuery(async () => (await db.kv.get(ROUTINE_KEY))?.value as CardioRoutine | undefined, [], undefined) ?? DEFAULT_ROUTINE;
  const [form, setForm] = useState<{ mode: 'new' | 'edit' | 'routine'; session?: CardioSession } | null>(null);
  const [del, setDel] = useState<CardioSession | null>(null);
  const { run, busy } = useAsync();
  const date = today();

  const view = useMemo(() => {
    const month = monthKey(date);
    const monthDates = datesBack(31, date).filter((x) => x.startsWith(month));
    return {
      day: totalsFor(sessions, [date]),
      week: totalsFor(sessions, datesBack(7, date)),
      month: totalsFor(sessions, monthDates),
      week7: dailyMinutes(sessions, datesBack(7, date)),
      days30: dailyMinutes(sessions, datesBack(30, date)),
      trend: cardioTrends(sessions, 7, date)
    };
  }, [sessions, date]);

  const logRoutine = () => run(async () => {
    await saveCardio({ ...routine, date, time: nowTime() }, weightOn(date, body, settings));
  }, t('cardioRoutineLogged'));

  const name = (s: Pick<CardioSession, 'activity' | 'customName'>) => (s.activity === 'other' && s.customName ? s.customName : t('act_' + s.activity));
  const routineLine = [t('act_' + routine.activity), t('cardioMinutes', { n: n(routine.durationMin) }),
    routine.speedKmh ? `${n(routine.speedKmh, 1)} ${t('kmh')}` : '', routine.inclinePct !== undefined ? `${n(routine.inclinePct)}%` : ''].filter(Boolean).join(' · ');

  return (
    <div data-testid="cardio-page">
      <section className="cardio-summary" data-testid="cardio-summary">
        {([['cardioToday', view.day, 'cardio-today'], ['cardioWeek', view.week, 'cardio-week'], ['cardioMonth', view.month, 'cardio-month']] as const).map(([k, v, id]) => (
          <div key={k} className="stat">
            <div className="k">{t(k)}</div>
            <div className="v num" data-testid={id} data-min={v.minutes}>{t('cardioMinutes', { n: n(v.minutes) })}</div>
            <div className="tiny muted num">{t('cardioSessionsN', { n: n(v.sessions) })} · {t('cardioEstKcal', { n: n(v.kcal) })}</div>
          </div>
        ))}
      </section>

      <div className="row wrap" style={{ gap: 8, margin: '12px 0' }}>
        <button className="btn primary grow" onClick={() => setForm({ mode: 'new' })} data-testid="cardio-add"><Icon name="plus" /> {t('cardioLog')}</button>
      </div>

      <Card title={<><Icon name="pulse" />{t('cardioRoutine')}</>} actions={<button className="btn sm ghost" onClick={() => setForm({ mode: 'routine' })} data-testid="routine-edit">{t('cardioRoutineEdit')}</button>}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <span className="small" data-testid="routine-line">{routineLine}</span>
          <button className="btn sm primary" disabled={busy} onClick={logRoutine} data-testid="routine-log">{t('cardioRoutineLog')}</button>
        </div>
      </Card>

      <Card title={t('cardioWeekChart')}>
        <MinutesChart days={view.week7} label={t('cardioWeekChart')} testId="cardio-week-chart" />
        <div className="tiny muted">{t('cardioWho', { n: WHO_WEEKLY_MIN })} <b className="num">{n(view.week.minutes)} / {n(WHO_WEEKLY_MIN)}</b></div>
      </Card>

      <Card title={t('cardioMonthChart')}>
        <MinutesChart days={view.days30} label={t('cardioMonthChart')} testId="cardio-month-chart" />
      </Card>

      <Card title={t('cardioTrends')}>
        <div className="grid3" data-testid="cardio-trends">
          <div className="stat"><div className="k">{t('cardioVsLastWeek')}</div><div className="v num" data-testid="trend-delta">{view.trend.minutesDelta > 0 ? '+' : ''}{n(view.trend.minutesDelta)}</div><div className="tiny muted">{t('cardioMinutes', { n: '' }).trim()}</div></div>
          <div className="stat"><div className="k">{t('cardioAvgSession')}</div><div className="v num">{view.trend.avgSessionMin === null ? '—' : t('cardioMinutes', { n: n(view.trend.avgSessionMin) })}</div></div>
          <div className="stat"><div className="k">{t('cardioTopActivity')}</div><div className="v small">{view.trend.topActivity ? t('act_' + view.trend.topActivity) : '—'}</div></div>
        </div>
      </Card>

      <Card title={t('cardioHistory')}>
        <ul className="list cardio-list" data-testid="cardio-history">
          {sessions.slice(0, 60).map((s) => (
            <li key={s.id} data-testid="cardio-row">
              <button className="grow cardio-row-main" onClick={() => setForm({ mode: 'edit', session: s })} data-testid="cardio-open">
                <span className="bold">{name(s)}</span>
                <span className="tiny muted num">{s.date} {s.time} · {t('cardioMinutes', { n: n(s.durationMin) })}
                  {s.distanceKm ? ` · ${n(s.distanceKm, 2)} ${t('km')}` : ''}{s.speedKmh ? ` · ${n(s.speedKmh, 1)} ${t('kmh')}` : ''}{s.inclinePct !== undefined ? ` · ${n(s.inclinePct)}%` : ''}</span>
                {s.notes && <span className="tiny muted">{s.notes}</span>}
              </button>
              <span className="num small" title={t('cardioEstKcalShort')}>{s.method === 'manual' ? n(s.kcal) : `≈ ${n(s.kcal)}`}</span>
              <button className="icon-btn" aria-label={t('delete')} onClick={() => setDel(s)} data-testid="cardio-delete"><Icon name="trash" /></button>
            </li>
          ))}
          {!sessions.length && <li className="empty">{t('cardioNoSessions')}</li>}
        </ul>
        <div className="tiny muted" style={{ marginTop: 8 }}>{t('cardioEstimateNote')}</div>
      </Card>

      {form && <CardioForm mode={form.mode} session={form.session} routine={routine} onClose={() => setForm(null)} />}
      {del && <Confirm danger message={t('cardioDeleteQ')} onNo={() => setDel(null)} onYes={async () => {
        const s = del; setDel(null);
        await run(() => deleteCardio(s.id), t('deleted'));
      }} />}
    </div>
  );
}

const dist = (a: CardioActivity, km?: number) => (km === undefined ? '' : activityDef(a).distanceUnit === 'm' ? Math.round(km * 1000) : km);

function CardioForm({ mode, session, routine, onClose }: { mode: 'new' | 'edit' | 'routine'; session?: CardioSession; routine: CardioRoutine; onClose: () => void }) {
  const { t, n, settings } = useApp();
  const body = useBody();
  const { run, busy } = useAsync();
  const start: Partial<CardioInput> = session ?? (mode === 'routine' ? routine : { activity: 'treadmill_walk', durationMin: undefined, intensity: 'moderate' });
  const [activity, setActivity] = useState<CardioActivity>(start.activity ?? 'treadmill_walk');
  const [customName, setCustomName] = useState(start.customName ?? '');
  const [date, setDate] = useState(session?.date ?? today());
  const [time, setTime] = useState(session?.time ?? nowTime());
  const [duration, setDuration] = useState<number | ''>(start.durationMin ?? '');
  const [distance, setDistance] = useState<number | ''>(dist(start.activity ?? 'treadmill_walk', start.distanceKm));
  const [speed, setSpeed] = useState<number | ''>(start.speedKmh ?? '');
  const [incline, setIncline] = useState<number | ''>(start.inclinePct ?? '');
  const [intensity, setIntensity] = useState<Intensity>(start.intensity ?? 'moderate');
  const [manual, setManual] = useState<number | ''>(session?.manualKcal ?? '');
  const [notes, setNotes] = useState(session?.notes ?? '');
  const def = activityDef(activity);
  const has = (f: 'distance' | 'speed' | 'incline') => def.fields.includes(f);

  const input: CardioInput = {
    activity, customName, date, time, intensity, notes,
    durationMin: Number(duration),
    distanceKm: has('distance') && distance !== '' ? (def.distanceUnit === 'm' ? Number(distance) / 1000 : Number(distance)) : undefined,
    speedKmh: has('speed') && speed !== '' ? Number(speed) : undefined,
    inclinePct: has('incline') && incline !== '' ? Number(incline) : undefined,
    manualKcal: mode !== 'routine' && manual !== '' ? Number(manual) : undefined
  };
  const errs = duration === '' ? ['duration'] : validateCardio(input);
  const weight = weightOn(date, body, settings);
  let preview: CardioSession | null = null;
  try { preview = errs.length ? null : buildSession(input, weight, session); } catch { preview = null; }
  const derived = !input.speedKmh ? effectiveSpeed(input) : undefined;

  const save = async () => {
    const ok = await run(async () => {
      if (mode === 'routine') return saveRoutine(input);
      return saveCardio(input, weight, session?.id);
    }, mode === 'routine' ? t('cardioRoutineSaved') : t('saved'));
    if (ok) onClose();
  };

  return (
    <Sheet title={mode === 'edit' ? t('cardioEdit') : mode === 'routine' ? t('cardioRoutineEdit') : t('cardioLog')} onClose={onClose}
      footer={<>
        <button className="btn grow" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary grow" disabled={busy || errs.length > 0} onClick={save} data-testid="cardio-save">{t('save')}</button>
      </>}>
      <div className="stack" data-testid="cardio-form">
        <label className="field">
          <span>{t('cardioActivity')}</span>
          <select className="input" value={activity} onChange={(e) => setActivity(e.target.value as CardioActivity)} data-testid="cardio-activity">
            {ACTIVITIES.map((a) => <option key={a.id} value={a.id}>{t('act_' + a.id)}</option>)}
          </select>
        </label>
        {activity === 'other' && (
          <label className="field"><span>{t('cardioName')}</span><input className="input" dir="auto" value={customName} onChange={(e) => setCustomName(e.target.value)} data-testid="cardio-name" /></label>
        )}
        {mode !== 'routine' && (
          <div className="grid2">
            <label className="field"><span>{t('date')}</span><input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} data-testid="cardio-date" /></label>
            <label className="field"><span>{t('cardioTime')}</span><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="cardio-time" /></label>
          </div>
        )}
        <div className="grid2">
          <NumField label={t('cardioDuration')} value={duration} onChange={setDuration} min={1} testId="cardio-duration" />
          {has('distance') && <NumField label={def.distanceUnit === 'm' ? t('cardioDistanceM') : t('cardioDistanceKm')} value={distance} onChange={setDistance} min={0} testId="cardio-distance" />}
          {has('speed') && <NumField label={t('cardioSpeed')} value={speed} onChange={setSpeed} min={0} testId="cardio-speed" placeholder={derived ? n(derived, 1) : undefined} />}
          {has('incline') && <NumField label={t('cardioIncline')} value={incline} onChange={setIncline} min={0} testId="cardio-incline" />}
        </div>
        <div className="field">
          <span>{t('cardioIntensity')}</span>
          <Segmented value={intensity} onChange={setIntensity} options={(['light', 'moderate', 'vigorous'] as const).map((v) => ({ value: v, label: t('int_' + v) }))} />
        </div>
        {mode !== 'routine' && (
          <>
            <NumField label={t('cardioManualKcal')} value={manual} onChange={setManual} min={0} testId="cardio-kcal" placeholder={preview && preview.method !== 'manual' ? `≈ ${n(preview.kcal)}` : undefined} />
            <div className="tiny muted">{t('cardioManualHint')}</div>
            <label className="field"><span>{t('cardioNotes')}</span><textarea className="input" dir="auto" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="cardio-notes" /></label>
          </>
        )}
        {preview && (
          <div className="cardio-preview" data-testid="cardio-preview">
            <div className="bold num">{preview.method === 'manual' ? `${n(preview.kcal)} ${t('kcalUnit')}` : t('cardioEstKcal', { n: n(preview.kcal) })}</div>
            <div className="tiny muted">{t('cardioMethod_' + preview.method, { incline: preview.inclinePct ? t('cardioInclinePart') : '' })} · MET {n(preview.met, 1)} · {t('cardioWeightUsed', { w: n(weight, 1) })}</div>
          </div>
        )}
        {errs.length > 0 && duration !== '' && <div className="tiny" style={{ color: 'var(--warn)' }} data-testid="cardio-errors">{t('cardioInvalid', { fields: errs.map((e) => t(fieldLabel(e, def.distanceUnit))).join('، ') })}</div>}
      </div>
    </Sheet>
  );
}

function fieldLabel(e: string, unit?: 'km' | 'm'): string {
  return ({ duration: 'cardioDuration', distance: unit === 'm' ? 'cardioDistanceM' : 'cardioDistanceKm', speed: 'cardioSpeed', incline: 'cardioIncline', kcal: 'cardioManualKcal', name: 'cardioName', date: 'date', time: 'cardioTime' } as Record<string, string>)[e] ?? e;
}
