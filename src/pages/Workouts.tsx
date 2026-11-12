import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { joinList } from '../lib/localize';
import { useBundle, useCardio, useTraining } from '../app/hooks';
import { MinutesChart } from '../components/charts';
import { Icon } from '../components/icons';
import { Card, Confirm, NumField, ProgressBar, Segmented, Sheet, useAsync } from '../components/ui';
import { totalsFor } from '../lib/cardio';
import { addDays, today, weekday } from '../lib/dates';
import { fitnessOf } from '../lib/energy';
import {
  EQUIPMENT, EXERCISES, findExercise, MUSCLES, saveCustomExercise, searchExercises, type Equipment, type Exercise, type Muscle
} from '../lib/exercises';
import { kvSet, saveSettings } from '../lib/repo';
import { progressEstimate, rollingWeightAverage, summarizeDay } from '../lib/reports';
import {
  ask, exerciseHistory, exerciseTrend, lastWeekEnd, nutritionForTraining, personalRecords, progression, QUESTIONS, recoveryIndicators, recoveryPoor,
  setsPerMuscle, startSession, trainingStats, weeklyReview, type CoachContext, type Line, type Question
} from '../lib/trainingCoach';
import {
  dayFor, dayLabel, DEFAULT_GENERATOR, deleteProgram, deleteWorkout, doneSets, generateProgram, getActiveProgram, isCompleted, OWNER_SPLIT, plannedSetsPerMuscle,
  saveProgram, saveRecovery, saveWorkout, SETS_RANGE, type Experience, type LoggedExercise, type Program, type ProgramDay, type WorkoutSession
} from '../lib/workouts';

const TABS = ['overview', 'today', 'program', 'library', 'progress', 'coach'] as const;
type Tab = (typeof TABS)[number];

/** Renders a coach/analytics line, translating exercise ids, muscle ids, indicator keys and actions. */
export function useLine() {
  const { t, lang } = useApp();
  return (l: Line, list?: Exercise[]) => {
    const p: Record<string, string | number> = { ...(l.params ?? {}) };
    if (typeof p.ex === 'string') { const e = findExercise(p.ex, list); p.ex = e ? (lang === 'ar' ? e.nameAr : e.nameEn) : p.ex; }
    if (typeof p.f === 'string') p.f = t('f_' + p.f);
    if (typeof p.action === 'string') p.action = t('pa_' + p.action);
    if (typeof p.conf === 'string') p.conf = t('conf_' + p.conf);
    if (typeof p.name === 'string' && typeof p.muscles === 'string') p.name = dayLabel({ name: p.name, muscles: p.muscles.split(',') as Muscle[], rest: false }, t);
    if (typeof p.list === 'string') p.list = p.list.split(', ').map((x) => { const [m, ...rest] = x.split(' '); return (MUSCLES as readonly string[]).includes(m) ? [t('mus_' + m), ...rest].join(' ') : x; }).join('، ');
    return t(l.key, p);
  };
}

export default function Workouts() {
  const { t } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'today';
  const tr = useTraining();
  const [program, setProgram] = useState<Program | null>(null);
  // first visit: the owner's split is generated once and saved (editable afterwards)
  useEffect(() => { if (tr) getActiveProgram().then(setProgram); }, [tr]);
  if (!tr || !program) return null;
  const active = tr.programs.find((p) => p.id === tr.activeId) ?? program;
  const list = [...EXERCISES, ...tr.custom];
  return (
    <div data-testid="workouts-page">
      <div className="tool-row" role="tablist">
        {TABS.map((x) => <button key={x} role="tab" aria-selected={tab === x} className={`chip clickable ${tab === x ? 'on' : ''}`} onClick={() => setParams({ tab: x }, { replace: true })} data-testid={`wtab-${x}`}>{t('wt_' + x)}</button>)}
      </div>
      {tab === 'overview' && <Overview program={active} list={list} />}
      {tab === 'today' && <TodayTab program={active} list={list} />}
      {tab === 'program' && <ProgramTab active={active} programs={tr.programs} list={list} preferred={tr.preferred} />}
      {tab === 'library' && <LibraryTab list={list} preferred={tr.preferred} />}
      {tab === 'progress' && <ProgressTab program={active} list={list} />}
      {tab === 'coach' && <CoachTab program={active} list={list} />}
    </div>
  );
}

function useCoachContext(program: Program, list: Exercise[]): CoachContext | null {
  const data = useBundle();
  const cardio = useCardio();
  const tr = useTraining();
  return useMemo(() => (data && tr ? { data, workouts: tr.workouts, program, cardio, recovery: tr.recovery, exercises: list } : null), [data, tr, program, cardio, list]);
}

const exName = (e: Exercise | undefined, lang: string, id: string) => (e ? (lang === 'ar' ? e.nameAr : e.nameEn) : id);

/* ------------------------------------------------------------------ overview (unified dashboard) */

function Overview({ program, list }: { program: Program; list: Exercise[] }) {
  const { t, n, settings } = useApp();
  const ctx = useCoachContext(program, list);
  const line = useLine();
  const view = useMemo(() => {
    if (!ctx) return null;
    const date = today();
    const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
    const day = summarizeDay(date, ctx.data.entries, ctx.data.days.find((d) => d.date === date), settings);
    const ids = [...new Set(ctx.workouts.flatMap((w) => w.exercises.map((x) => x.exerciseId)))];
    const trends = ids.map((id) => exerciseTrend(exerciseHistory(id, ctx.workouts, list)).trend);
    return {
      day, week, stats: trainingStats(ctx.workouts, week, program, list), sets: setsPerMuscle(ctx.workouts, week, list),
      cardio: totalsFor(ctx.cardio, week), ind: recoveryIndicators(ctx), review: weeklyReview(ctx),
      est: progressEstimate(ctx.data.body, settings.profile.targetWeight, date), w: rollingWeightAverage(ctx.data.body, date),
      waist: [...ctx.data.body].filter((b) => b.waist && !b.deleted).sort((a, b) => a.date.localeCompare(b.date)).pop()?.waist,
      up: trends.filter((x) => x === 'improving').length, down: trends.filter((x) => x === 'declining').length, flat: trends.filter((x) => x === 'stable').length
    };
  }, [ctx, settings, program, list]);
  if (!view || !ctx) return null;
  const fit = fitnessOf(settings);
  const goal = fit.setsPerMuscle ?? 14;
  const p = settings.profile;
  return (
    <div data-testid="overview">
      <Card title={t('ov_body')}>
        <div className="grid3">
          <div className="stat"><div className="k">{t('currentWeight')}</div><div className="v num">{n(view.w ?? p.currentWeight, 1)}</div><div className="tiny muted">{t('targetWeight')}: {n(p.targetWeight, 1)} {t('kg')}</div></div>
          <div className="stat"><div className="k">{t('waist')}</div><div className="v num">{view.waist ? n(view.waist, 1) : '—'}</div><div className="tiny muted">{t('cm')}</div></div>
          <div className="stat"><div className="k">{t('rateLoss')}</div><div className="v small num">{view.est.ratePerWeek === null ? '—' : `${n(view.est.ratePerWeek, 2)} ${t('kg')}`}</div></div>
        </div>
      </Card>
      <Card title={t('ov_today')}>
        <div className="row between small"><span>{t('kcal')}</span><b className="num">{n(view.day.totals.kcal)} / {n(view.day.target.kcal)}</b></div>
        <ProgressBar value={view.day.totals.kcal} max={view.day.target.kcal} color="var(--kcal)" />
        <div className="row between small" style={{ marginTop: 6 }}><span>{t('protein')}</span><b className="num">{n(view.day.totals.protein)} / {n(view.day.target.protein)} {t('g')}</b></div>
        <ProgressBar value={view.day.totals.protein} max={view.day.target.protein} color="var(--protein)" />
      </Card>
      <Card title={t('ov_week')}>
        <div className="stack">
          <div><div className="row between small"><span>{t('ov_workouts')}</span><b className="num" data-testid="ov-workouts">{view.stats.sessions} / {view.stats.planned}</b></div><ProgressBar value={view.stats.sessions} max={Math.max(1, view.stats.planned)} color="var(--primary)" /></div>
          <div><div className="row between small"><span>{t('gp_cardio')}</span><b className="num">{n(view.cardio.minutes)} / {n(fit.cardioSessionsPerWeek * fit.cardioMinPerSession)}</b></div><ProgressBar value={view.cardio.minutes} max={Math.max(1, fit.cardioSessionsPerWeek * fit.cardioMinPerSession)} color="var(--info)" /></div>
          <div className="small">{t('ov_strength', { up: view.up, flat: view.flat, down: view.down })}</div>
        </div>
      </Card>
      <MuscleVolume sets={view.sets} goal={goal} />
      <Card title={t('wt_recovery')}><Indicators items={view.ind} /></Card>
      <Card title={t('ov_insights')}>
        <ul className="small energy-why">{view.review.recommendations.map((l, i) => <li key={i}>{line(l, list)}</li>)}</ul>
        <Link className="btn sm ghost" to="/workouts?tab=coach">{t('wt_coach')}</Link>
      </Card>
    </div>
  );
}

function Indicators({ items }: { items: { key: string; level: string; params?: Record<string, string | number> }[] }) {
  const line = useLine();
  return (
    <ul className="list" data-testid="indicators">
      {items.map((i, k) => <li key={k}><span className={`dot-mark ${i.level}`} aria-hidden="true" /><span className="grow small">{line(i)}</span></li>)}
    </ul>
  );
}

function MuscleVolume({ sets, goal, planned }: { sets: Record<Muscle, number>; goal: number; planned?: Record<Muscle, number> }) {
  const { t, n } = useApp();
  return (
    <Card title={t('ov_muscleSets')}>
      <div className="stack" data-testid="muscle-volume">
        {MUSCLES.filter((m) => m !== 'forearms').map((m) => (
          <div key={m}>
            <div className="row between small"><span>{t('mus_' + m)}</span><b className="num">{n(sets[m], 1)}{planned ? ` · ${t('planned')} ${n(planned[m], 1)}` : ''} / {goal}</b></div>
            <ProgressBar value={sets[m]} max={Math.max(goal, 1)} color={sets[m] > SETS_RANGE.max ? 'var(--warn)' : 'var(--primary)'} />
          </div>
        ))}
        <div className="tiny muted">{t('ov_setsNote', { min: SETS_RANGE.min, max: SETS_RANGE.max })}</div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ today + session logger */

function TodayTab({ program, list }: { program: Program; list: Exercise[] }) {
  const { t, d, lang, settings } = useApp();
  const tr = useTraining();
  const data = useBundle();
  const { run } = useAsync();
  const [openId, setOpenId] = useState<string | null>(null);
  const [del, setDel] = useState<WorkoutSession | null>(null);
  if (!tr || !data) return null;
  const date = today();
  const day = dayFor(program, date);
  const todays = tr.workouts.filter((w) => w.date === date);
  const open = tr.workouts.find((w) => w.id === openId) ?? todays.find((w) => !w.endedAt);
  const bw = rollingWeightAverage(data.body, date) ?? settings.profile.currentWeight;
  const ind = recoveryIndicators({ data, workouts: tr.workouts, program, cardio: [], recovery: tr.recovery, exercises: list });
  const start = (dayId: string) => run(async () => { const w = await saveWorkout(startSession(date, program, dayId, tr.workouts, bw, list, recoveryPoor(ind))); setOpenId(w.id); });
  const weekStart = Array.from({ length: 7 }, (_, i) => addDays(date, i - ((weekday(date) - settings.weekStartsOn + 7) % 7)));
  return (
    <div data-testid="today-tab">
      {open ? <SessionLogger session={open} list={list} onClose={() => setOpenId(null)} /> : (
        <Card title={t('wk_today')}>
          {day && !day.rest ? (
            <>
              <div className="bold" data-testid="today-day">{dayLabel(day, t)}</div>
              <div className="tiny muted">{day.muscles.map((m) => t('mus_' + m)).join(' · ')} · {t('wk_exN', { n: day.exercises.length })}</div>
              <ul className="small" style={{ paddingInlineStart: 18, margin: '6px 0' }}>{day.exercises.map((x) => <li key={x.exerciseId}>{exName(findExercise(x.exerciseId, list), lang, x.exerciseId)} — {x.sets}×{x.repMin}–{x.repMax}</li>)}</ul>
              <button className="btn primary block" onClick={() => start(day.id)} data-testid="start-workout"><Icon name="plus" /> {todays.length ? t('wk_startAgain') : t('wk_start')}</button>
            </>
          ) : <div className="small" data-testid="today-rest">{t('wk_restDay')}</div>}
          <details style={{ marginTop: 8 }}><summary className="small">{t('wk_otherDay')}</summary>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>{program.days.filter((x) => !x.rest).map((x) => <button key={x.id} className="chip clickable" onClick={() => start(x.id)}>{dayLabel(x, t)}</button>)}</div>
          </details>
        </Card>
      )}
      <Card title={t('wk_schedule')}>
        <ul className="list" data-testid="week-schedule">
          {weekStart.map((dt) => {
            const pd = dayFor(program, dt);
            const did = tr.workouts.some((w) => w.date === dt && isCompleted(w));
            // "missed" only for days after the program existed (never before you started using it)
            const started = new Date(program.createdAt).toISOString().slice(0, 10);
            return <li key={dt} className={dt === date ? 'bold' : ''}><span className="grow small">{d(dt, { weekday: 'short', day: 'numeric' })} · {pd ? dayLabel(pd, t) : '—'}</span>{did ? <span className="chip good">✓</span> : dt < date && dt >= started && pd && !pd.rest ? <span className="chip warn">{t('wk_missed')}</span> : null}</li>;
          })}
        </ul>
      </Card>
      <Card title={t('wk_history')}>
        <ul className="list" data-testid="workout-history">
          {tr.workouts.slice(0, 30).map((w) => (
            <li key={w.id} data-testid="workout-row">
              <button className="grow cardio-row-main" onClick={() => setOpenId(w.id)}><span className="bold">{dayLabel({ name: w.name, muscles: w.muscles, rest: false }, t)}</span><span className="tiny muted num">{w.date} · {t('wk_setsN', { n: w.exercises.reduce((a, x) => a + doneSets(x).length, 0) })}</span></button>
              <button className="icon-btn" aria-label={t('delete')} onClick={() => setDel(w)} data-testid="workout-delete"><Icon name="trash" /></button>
            </li>
          ))}
          {!tr.workouts.length && <li className="empty">{t('wk_none')}</li>}
        </ul>
      </Card>
      {del && <Confirm danger message={t('wk_deleteQ')} onNo={() => setDel(null)} onYes={async () => { const w = del; setDel(null); if (openId === w.id) setOpenId(null); await run(() => deleteWorkout(w.id), t('deleted')); }} />}
    </div>
  );
}

function SessionLogger({ session, list, onClose }: { session: WorkoutSession; list: Exercise[]; onClose: () => void }) {
  const { t, n, lang } = useApp();
  const tr = useTraining();
  const { run } = useAsync();
  const [w, setW] = useState(session);
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const line = useLine();
  useEffect(() => { setW(session); }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!rest) return; const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i); }, [rest]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const persist = (next: WorkoutSession) => { setW(next); clearTimeout(timer.current); timer.current = setTimeout(() => { run(() => saveWorkout(next)); }, 400); };
  const upd = (i: number, f: (x: LoggedExercise) => LoggedExercise) => persist({ ...w, exercises: w.exercises.map((x, k) => (k === i ? f(x) : x)) });
  const history = tr?.workouts.filter((x) => x.id !== w.id) ?? [];
  const left = rest ? Math.max(0, Math.round((rest.until - now) / 1000)) : 0;
  return (
    <div data-testid="session-logger">
      <Card title={<>{dayLabel({ name: w.name, muscles: w.muscles, rest: false }, t)} · <span className="num">{w.date}</span></>} actions={<button className="btn sm ghost" onClick={onClose}>{t('close')}</button>}>
        <div className="tiny muted">{t('wk_loggerHint')}</div>
      </Card>
      {w.exercises.map((x, i) => {
        const e = findExercise(x.exerciseId, list);
        const h = exerciseHistory(x.exerciseId, history, list).filter((p) => p.date <= w.date);
        const prev = h[h.length - 1];
        const pg = x.target ? progression(x.target, h, e) : null;
        return (
          <div key={x.exerciseId + i} className={`card ex-card ${x.status}`} data-testid="ex-card">
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <div className="bold">{exName(e, lang, x.exerciseId)}</div>
                {x.target && <div className="tiny muted num">{t('wk_target', { s: x.target.sets, min: x.target.repMin, max: x.target.repMax, rir: x.target.targetRir })}</div>}
              </div>
              <button className="btn sm ghost" onClick={() => upd(i, (y) => ({ ...y, status: y.status === 'skipped' ? 'pending' : 'skipped' }))} data-testid="ex-skip">{x.status === 'skipped' ? t('wk_unskip') : t('wk_skip')}</button>
            </div>
            <div className="tiny" data-testid="ex-prev">{prev ? t('wk_prev', { d: prev.date, sets: prev.sets.map((s) => `${n(s.weightKg ?? 0, 1)}×${s.reps}${s.rir != null ? ` @${s.rir}` : ''}`).join(' · ') }) : t('wk_noPrev')}</div>
            {pg && <div className={`tiny pg pg-${pg.action}`} data-testid="ex-advice">{t('pa_' + pg.action)}{pg.weightKg !== null ? ` · ${n(pg.weightKg, 1)} ${t('kg')}` : ''} · {t('conf_' + pg.confidence)} — {pg.reasons.slice(1).map((r) => line(r, list)).join(' ')}</div>}
            {x.status !== 'skipped' && (
              <div className="set-grid" data-testid="set-grid">
                <span className="tiny muted">#</span><span className="tiny muted">{t('kg')}</span><span className="tiny muted">{t('wk_reps')}</span><span className="tiny muted">RIR</span><span className="tiny muted">✓</span>
                {x.sets.map((s, k) => (
                  <SetRow key={k} k={k} s={s} onChange={(ns) => upd(i, (y) => ({ ...y, sets: y.sets.map((z, j) => (j === k ? ns : z)), status: 'pending' }))}
                    onDone={() => { if (x.restSec) setRest({ until: Date.now() + x.restSec * 1000, total: x.restSec }); }} />
                ))}
              </div>
            )}
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              {x.status !== 'skipped' && <button className="btn sm" onClick={() => upd(i, (y) => ({ ...y, sets: [...y.sets, { ...(y.sets[y.sets.length - 1] ?? { reps: null, weightKg: null }), done: false, rir: null, rpe: null }] }))} data-testid="add-set">+ {t('wk_set')}</button>}
              {x.sets.length > 1 && x.status !== 'skipped' && <button className="btn sm ghost" onClick={() => upd(i, (y) => ({ ...y, sets: y.sets.slice(0, -1) }))}>− {t('wk_set')}</button>}
              <input className="input grow" dir="auto" placeholder={t('wk_notes')} value={x.notes ?? ''} onChange={(ev) => upd(i, (y) => ({ ...y, notes: ev.target.value }))} />
            </div>
          </div>
        );
      })}
      {rest && left > 0 && (
        <div className="rest-bar" data-testid="rest-timer" role="timer">
          <span>{t('wk_rest')}</span><b className="num">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b>
          <button className="btn sm" onClick={() => setRest(null)}>{t('wk_skipRest')}</button>
        </div>
      )}
      <button className="btn primary block" style={{ margin: '12px 0' }} data-testid="finish-workout"
        onClick={async () => { clearTimeout(timer.current); const fin = { ...w, endedAt: w.endedAt ?? Date.now(), exercises: w.exercises.map((x) => ({ ...x, status: x.status === 'skipped' ? 'skipped' as const : doneSets(x).length ? 'done' as const : 'pending' as const })) }; const r = await run(() => saveWorkout(fin), t('wk_saved')); if (r) onClose(); }}>{t('wk_finish')}</button>
    </div>
  );
}

function SetRow({ k, s, onChange, onDone }: { k: number; s: import('../lib/workouts').SetLog; onChange: (s: import('../lib/workouts').SetLog) => void; onDone: () => void }) {
  const { t } = useApp();
  const num = (v: string) => (v === '' ? null : Number(v));
  return (
    <>
      <span className="num small">{k + 1}</span>
      <input className="input num" type="number" inputMode="decimal" step="0.5" value={s.weightKg ?? ''} onChange={(e) => onChange({ ...s, weightKg: num(e.target.value) })} data-testid="set-weight" aria-label={t('kg')} />
      <input className="input num" type="number" inputMode="numeric" value={s.reps ?? ''} onChange={(e) => onChange({ ...s, reps: num(e.target.value) })} data-testid="set-reps" aria-label={t('wk_reps')} />
      <select className="input num" value={s.rir ?? ''} onChange={(e) => onChange({ ...s, rir: num(e.target.value) })} data-testid="set-rir" aria-label="RIR">
        <option value="">–</option>{[0, 1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>{x}{x === 5 ? '+' : ''}</option>)}
      </select>
      <input type="checkbox" checked={s.done} style={{ width: 24, height: 24 }} data-testid="set-done" aria-label={t('wk_setDone')}
        onChange={(e) => { onChange({ ...s, done: e.target.checked }); if (e.target.checked) onDone(); }} />
    </>
  );
}

/* ------------------------------------------------------------------ program editor + generator */

function ProgramTab({ active, programs, list, preferred }: { active: Program; programs: Program[]; list: Exercise[]; preferred: string[] }) {
  const { t, n, lang, settings, ln } = useApp();
  const { run } = useAsync();
  const [p, setP] = useState<Program>(active);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<string | null>(null);
  const [gen, setGen] = useState(false);
  const [del, setDel] = useState<Program | null>(null);
  useEffect(() => { setP(active); setDirty(false); }, [active.id, active.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (f: (x: Program) => Program) => { setP(f); setDirty(true); };
  const editDay = (id: string, f: (d: ProgramDay) => ProgramDay) => edit((x) => ({ ...x, days: x.days.map((d) => (d.id === id ? f(d) : d)) }));
  const planned = plannedSetsPerMuscle(p, list);
  const goal = fitnessOf(settings).setsPerMuscle ?? 14;
  const wd = (i: number) => new Date(2023, 0, 1 + i).toLocaleDateString(lang === 'ar' ? 'ar' : 'en', { weekday: 'long' });
  return (
    <div data-testid="program-tab">
      <Card title={t('pr_programs')}>
        <div className="row wrap" style={{ gap: 6 }}>
          {programs.map((x) => <button key={x.id} className={`chip clickable ${x.id === active.id ? 'on' : ''}`} onClick={() => run(() => kvSet('activeProgram', x.id))} data-testid="program-chip">{ln(x.name)}</button>)}
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          <button className="btn sm" onClick={() => setGen(true)} data-testid="open-generator"><Icon name="sparkle" /> {t('pr_generate')}</button>
          <button className="btn sm" onClick={() => run(() => saveProgram({ ...structuredClone(p), id: crypto.randomUUID(), name: p.name + ' (2)', createdAt: Date.now() }, true))}>{t('pr_copy')}</button>
          {programs.length > 1 && <button className="btn sm ghost" onClick={() => setDel(active)}>{t('pr_delete')}</button>}
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>{t('pr_activeNote')}</div>
      </Card>
      <Card>
        <label className="field"><span>{t('pr_name')}</span><input className="input" dir="auto" value={p.name} onChange={(e) => edit((x) => ({ ...x, name: e.target.value }))} data-testid="program-name" /></label>
      </Card>
      {p.days.map((d, di) => (
        <div key={d.id} className="card" data-testid="program-day">
          <div className="row wrap" style={{ gap: 6 }}>
            <input className="input grow" dir="auto" value={dayLabel(d, t)} onChange={(e) => editDay(d.id, (x) => ({ ...x, name: e.target.value }))} aria-label={t('pr_dayName')} />
            <select className="input" value={d.weekday} onChange={(e) => editDay(d.id, (x) => ({ ...x, weekday: Number(e.target.value) }))} aria-label={t('pr_weekday')}>
              <option value={-1}>—</option>{[0, 1, 2, 3, 4, 5, 6].map((i) => <option key={i} value={i}>{wd(i)}</option>)}
            </select>
            <label className="check small"><input type="checkbox" checked={d.rest} onChange={(e) => editDay(d.id, (x) => ({ ...x, rest: e.target.checked }))} data-testid="day-rest" />{t('wk_rest')}</label>
          </div>
          {!d.rest && (
            <>
              <div className="row wrap" style={{ gap: 4, margin: '6px 0' }}>
                {MUSCLES.map((m) => <button key={m} className={`chip clickable tiny ${d.muscles.includes(m) ? 'on' : ''}`} onClick={() => editDay(d.id, (x) => ({ ...x, muscles: x.muscles.includes(m) ? x.muscles.filter((y) => y !== m) : [...x.muscles, m] }))}>{t('mus_' + m)}</button>)}
              </div>
              <ul className="list">
                {d.exercises.map((x, xi) => {
                  const e = findExercise(x.exerciseId, list);
                  const set = (k: 'sets' | 'repMin' | 'repMax' | 'restSec' | 'targetRir') => (v: number | '') => v !== '' && editDay(d.id, (y) => ({ ...y, exercises: y.exercises.map((z, j) => (j === xi ? { ...z, [k]: v } : z)) }));
                  return (
                    <li key={x.exerciseId + xi} className="prog-ex" data-testid="program-ex">
                      <div className="row between" style={{ width: '100%' }}>
                        <span className="small bold">{exName(e, lang, x.exerciseId)}</span>
                        <span className="row" style={{ gap: 2 }}>
                          <button className="icon-btn" aria-label={t('pr_up')} disabled={xi === 0} onClick={() => editDay(d.id, (y) => { const a = [...y.exercises]; [a[xi - 1], a[xi]] = [a[xi], a[xi - 1]]; return { ...y, exercises: a }; })}>↑</button>
                          <button className="icon-btn" aria-label={t('pr_down')} disabled={xi === d.exercises.length - 1} onClick={() => editDay(d.id, (y) => { const a = [...y.exercises]; [a[xi + 1], a[xi]] = [a[xi], a[xi + 1]]; return { ...y, exercises: a }; })}>↓</button>
                          <button className="icon-btn" aria-label={t('delete')} onClick={() => editDay(d.id, (y) => ({ ...y, exercises: y.exercises.filter((_, j) => j !== xi) }))} data-testid="ex-remove">×</button>
                        </span>
                      </div>
                      {x.why && <div className="tiny muted">{t(x.why)}</div>}
                      <div className="grid5">
                        <NumField label={t('pr_sets')} value={x.sets} onChange={set('sets')} />
                        <NumField label={t('pr_repMin')} value={x.repMin} onChange={set('repMin')} />
                        <NumField label={t('pr_repMax')} value={x.repMax} onChange={set('repMax')} />
                        <NumField label={t('pr_rest')} value={x.restSec} onChange={set('restSec')} />
                        <NumField label="RIR" value={x.targetRir} onChange={set('targetRir')} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <button className="btn sm" onClick={() => setPicker(d.id)} data-testid="add-exercise">+ {t('pr_addEx')}</button>
            </>
          )}
          {di === p.days.length - 1 && <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => edit((x) => ({ ...x, days: x.days.slice(0, -1) }))}>{t('pr_removeDay')}</button>}
        </div>
      ))}
      <button className="btn block" onClick={() => edit((x) => ({ ...x, days: [...x.days, { id: crypto.randomUUID(), name: t('pr_newDay'), weekday: -1, muscles: [], rest: false, exercises: [] }] }))}>+ {t('pr_addDay')}</button>
      <MuscleVolume sets={planned} goal={goal} />
      <div className="sticky-save">
        <button className="btn primary block" disabled={!dirty} onClick={() => run(async () => { await saveProgram(p, true); setDirty(false); }, t('saved'))} data-testid="program-save">{t('save')}</button>
      </div>
      {picker && <ExercisePicker list={list} onClose={() => setPicker(null)} onPick={(e) => { editDay(picker, (y) => ({ ...y, exercises: [...y.exercises, { exerciseId: e.id, sets: e.sets, repMin: e.reps[0], repMax: e.reps[1], restSec: e.restSec, targetRir: e.category === 'compound' ? 2 : 1 }] })); setPicker(null); }} />}
      {gen && <GeneratorSheet list={list} preferred={preferred} current={p} onClose={() => setGen(false)} />}
      {del && <Confirm danger message={t('pr_deleteQ')} onNo={() => setDel(null)} onYes={async () => { const x = del; setDel(null); const other = programs.find((y) => y.id !== x.id)!; await run(async () => { await kvSet('activeProgram', other.id); await deleteProgram(x.id); }); }} />}
      <div className="tiny muted">{n(p.days.filter((d) => !d.rest).length)} {t('pr_trainingDays')}</div>
    </div>
  );
}

function GeneratorSheet({ list, preferred, current, onClose }: { list: Exercise[]; preferred: string[]; current: Program; onClose: () => void }) {
  const { t, lang, settings } = useApp();
  const tr = useTraining();
  const { run } = useAsync();
  const fit = fitnessOf(settings);
  const [exp, setExp] = useState<Experience>(fit.experience ?? 'intermediate');
  const [eq, setEq] = useState<Equipment[]>((fit.equipment as Equipment[] | undefined) ?? DEFAULT_GENERATOR.equipment);
  const [pu, setPu] = useState<number | ''>(fit.pullupsPerWeek ?? 2);
  const [dp, setDp] = useState<number | ''>(fit.dipsPerWeek ?? 2);
  const [sets, setSets] = useState<number | ''>(fit.setsPerMuscle ?? 14);
  const [keepSplit, setKeepSplit] = useState(true);
  const days = keepSplit ? current.days.map((d) => ({ name: d.name, muscles: d.muscles, rest: d.rest, weekday: d.weekday })) : OWNER_SPLIT;
  const history = tr ? [...new Set(tr.workouts.filter((w) => w.date > addDays(today(), -42)).flatMap((w) => w.exercises.filter((x) => doneSets(x).length).map((x) => x.exerciseId)))] : [];
  const preview = useMemo(() => generateProgram({ days, experience: exp, equipment: eq, pullupsPerWeek: Number(pu) || 0, dipsPerWeek: Number(dp) || 0, setsPerMuscle: Number(sets) || undefined, preferred, history, exercises: list }, `${current.name} · ${t('pr_generated')}`), [days, exp, eq, pu, dp, sets, preferred, history, list, current.name, t]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet title={t('pr_generate')} onClose={onClose} footer={<>
      <button className="btn grow" onClick={onClose}>{t('cancel')}</button>
      <button className="btn primary grow" data-testid="gen-save" onClick={async () => {
        const ok = await run(async () => {
          await saveSettings((s) => { s.fitness = { ...fitnessOf(s), experience: exp, equipment: eq, pullupsPerWeek: Number(pu) || 0, dipsPerWeek: Number(dp) || 0, setsPerMuscle: Number(sets) || 14 }; });
          return saveProgram(preview, true);
        }, t('pr_savedNew'));
        if (ok) onClose();
      }}>{t('pr_saveNew')}</button>
    </>}>
      <div className="stack" data-testid="generator">
        <div className="tiny muted">{t('pr_genNote')}</div>
        <label className="check small"><input type="checkbox" checked={keepSplit} onChange={(e) => setKeepSplit(e.target.checked)} />{t('pr_keepSplit')}</label>
        <div className="field"><span>{t('pr_experience')}</span><Segmented value={exp} onChange={setExp} options={(['beginner', 'intermediate', 'advanced'] as const).map((x) => ({ value: x, label: t('exp_' + x) }))} /></div>
        <div className="grid3">
          <NumField label={t('pr_pullups')} value={pu} onChange={setPu} min={0} testId="gen-pullups" />
          <NumField label={t('pr_dips')} value={dp} onChange={setDp} min={0} testId="gen-dips" />
          <NumField label={t('pr_setsMuscle')} value={sets} onChange={setSets} min={4} />
        </div>
        <div className="field"><span>{t('pr_equipment')}</span>
          <div className="row wrap" style={{ gap: 4 }}>{EQUIPMENT.map((q) => <button key={q} className={`chip clickable tiny ${eq.includes(q) ? 'on' : ''}`} onClick={() => setEq(eq.includes(q) ? eq.filter((x) => x !== q) : [...eq, q])}>{t('eq_' + q)}</button>)}</div>
        </div>
        {preview.days.map((d) => (
          <div key={d.id} className="small" data-testid="gen-day"><b>{dayLabel(d, t)}</b>{d.rest ? ` — ${t('wk_rest')}` : ''}
            <ul style={{ paddingInlineStart: 18, margin: '2px 0 6px' }}>{d.exercises.map((x) => <li key={x.exerciseId}>{exName(findExercise(x.exerciseId, list), lang, x.exerciseId)} · {x.sets}×{x.repMin}–{x.repMax} · {x.restSec}s · RIR {x.targetRir}<div className="tiny muted">{t(x.why ?? '')}</div></li>)}</ul>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function ExercisePicker({ list, onPick, onClose }: { list: Exercise[]; onPick: (e: Exercise) => void; onClose: () => void }) {
  const { t, lang } = useApp();
  const [q, setQ] = useState('');
  const [m, setM] = useState<Muscle | ''>('');
  return (
    <Sheet title={t('pr_addEx')} onClose={onClose}>
      <input className="input" placeholder={t('search') + '…'} value={q} onChange={(e) => setQ(e.target.value)} data-testid="picker-search" />
      <div className="tool-row" style={{ marginTop: 6 }}>{['', ...MUSCLES].map((x) => <button key={x} className={`chip clickable ${m === x ? 'on' : ''}`} onClick={() => setM(x as Muscle | '')}>{x ? t('mus_' + x) : t('all')}</button>)}</div>
      <ul className="list">{searchExercises(list, q, m).map((e) => <li key={e.id}><button className="grow cardio-row-main" onClick={() => onPick(e)} data-testid="picker-item"><span className="small bold">{exName(e, lang, e.id)}</span><span className="tiny muted">{t('mus_' + e.primary)} · {e.equipment.map((x) => t('eq_' + x)).join('، ')}</span></button></li>)}</ul>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ exercise library */

function LibraryTab({ list, preferred }: { list: Exercise[]; preferred: string[] }) {
  const { t, lang } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [m, setM] = useState<Muscle | ''>('');
  const [custom, setCustom] = useState(false);
  const res = searchExercises(list, q, m);
  return (
    <div data-testid="library-tab">
      <Card>
        <input className="input" placeholder={t('search') + '…'} value={q} onChange={(e) => setQ(e.target.value)} data-testid="ex-search" />
        <div className="tool-row" style={{ marginTop: 6 }}>{['', ...MUSCLES].map((x) => <button key={x} className={`chip clickable ${m === x ? 'on' : ''}`} onClick={() => setM(x as Muscle | '')}>{x ? t('mus_' + x) : t('all')}</button>)}</div>
        <div className="row between"><span className="tiny muted" data-testid="ex-count">{res.length} / {list.length}</span><button className="btn sm" onClick={() => setCustom(true)} data-testid="custom-ex">+ {t('lib_custom')}</button></div>
      </Card>
      <ul className="list card">{res.map((e) => (
        <li key={e.id} data-testid="ex-row"><button className="grow cardio-row-main" onClick={() => nav('/exercise/' + e.id)}>
          <span className="small bold">{exName(e, lang, e.id)} {preferred.includes(e.id) && <Icon name="star" filled />}</span>
          <span className="tiny muted">{t('mus_' + e.primary)}{e.secondary.length ? ` + ${joinList(e.secondary.map((s) => t('mus_' + s)), lang)}` : ''} · {t('cat_' + e.category)} · {joinList(e.equipment.map((x) => t('eq_' + x)), lang)}</span>
        </button></li>
      ))}</ul>
      {custom && <CustomExerciseSheet onClose={() => setCustom(false)} />}
    </div>
  );
}

function CustomExerciseSheet({ onClose }: { onClose: () => void }) {
  const { t } = useApp();
  const { run } = useAsync();
  const [v, setV] = useState({ nameAr: '', nameEn: '', primary: 'chest' as Muscle, secondary: [] as Muscle[], equipment: ['machine'] as Equipment[], category: 'compound' as Exercise['category'], min: 8 as number | '', max: 12 as number | '', sets: 3 as number | '', rest: 90 as number | '' });
  return (
    <Sheet title={t('lib_custom')} onClose={onClose} footer={<button className="btn primary block" data-testid="custom-save" onClick={async () => {
      const ok = await run(() => saveCustomExercise({ nameAr: v.nameAr, nameEn: v.nameEn, primary: v.primary, secondary: v.secondary, equipment: v.equipment, category: v.category, reps: [Number(v.min), Number(v.max)], sets: Number(v.sets), restSec: Number(v.rest) }), t('saved'));
      if (ok) onClose();
    }}>{t('save')}</button>}>
      <div className="stack">
        <label className="field"><span>{t('lib_nameAr')}</span><input className="input" dir="rtl" value={v.nameAr} onChange={(e) => setV({ ...v, nameAr: e.target.value })} data-testid="custom-name-ar" /></label>
        <label className="field"><span>{t('lib_nameEn')}</span><input className="input" dir="ltr" value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} /></label>
        <label className="field"><span>{t('lib_primary')}</span><select className="input" value={v.primary} onChange={(e) => setV({ ...v, primary: e.target.value as Muscle })}>{MUSCLES.map((m) => <option key={m} value={m}>{t('mus_' + m)}</option>)}</select></label>
        <div className="row wrap" style={{ gap: 4 }}>{MUSCLES.filter((m) => m !== v.primary).map((m) => <button key={m} className={`chip clickable tiny ${v.secondary.includes(m) ? 'on' : ''}`} onClick={() => setV({ ...v, secondary: v.secondary.includes(m) ? v.secondary.filter((x) => x !== m) : [...v.secondary, m] })}>{t('mus_' + m)}</button>)}</div>
        <div className="row wrap" style={{ gap: 4 }}>{EQUIPMENT.map((q) => <button key={q} className={`chip clickable tiny ${v.equipment.includes(q) ? 'on' : ''}`} onClick={() => setV({ ...v, equipment: v.equipment.includes(q) ? v.equipment.filter((x) => x !== q) : [...v.equipment, q] })}>{t('eq_' + q)}</button>)}</div>
        <Segmented value={v.category} onChange={(category) => setV({ ...v, category })} options={[{ value: 'compound', label: t('cat_compound') }, { value: 'isolation', label: t('cat_isolation') }]} />
        <div className="grid2">
          <NumField label={t('pr_repMin')} value={v.min} onChange={(x) => setV({ ...v, min: x })} /><NumField label={t('pr_repMax')} value={v.max} onChange={(x) => setV({ ...v, max: x })} />
          <NumField label={t('pr_sets')} value={v.sets} onChange={(x) => setV({ ...v, sets: x })} /><NumField label={t('pr_rest')} value={v.rest} onChange={(x) => setV({ ...v, rest: x })} />
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ progress + recovery */

function ProgressTab({ program, list }: { program: Program; list: Exercise[] }) {
  const { t, n, lang, settings } = useApp();
  const ctx = useCoachContext(program, list);
  const [open, setOpen] = useState<string | null>(null);
  if (!ctx) return null;
  const ids = [...new Set(ctx.workouts.flatMap((w) => w.exercises.filter((x) => doneSets(x).length).map((x) => x.exerciseId)))];
  const rows = ids.map((id) => { const h = exerciseHistory(id, ctx.workouts, list); return { id, h, tr: exerciseTrend(h), pr: personalRecords(h) }; });
  const week = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
  const goal = fitnessOf(settings).setsPerMuscle ?? 14;
  return (
    <div data-testid="progress-tab">
      <Card title={t('pg_title')}>
        <ul className="list" data-testid="strength-list">
          {rows.map((r) => (
            <li key={r.id} data-testid="strength-row"><button className="grow cardio-row-main" onClick={() => setOpen(r.id)}>
              <span className="small bold">{exName(findExercise(r.id, list), lang, r.id)}</span>
              <span className="tiny muted num">{t('pg_lastBest', { w: n(r.h[r.h.length - 1].topWeight, 1), r: r.h[r.h.length - 1].topReps, e: n(r.pr?.bestE1rm ?? 0, 1) })}</span>
            </button><span className={`chip tr-${r.tr.trend}`} data-testid="trend-chip">{t('tr_' + r.tr.trend)}{r.tr.changePct !== null ? ` ${r.tr.changePct > 0 ? '+' : ''}${n(r.tr.changePct, 1)}%` : ''}</span></li>
          ))}
          {!rows.length && <li className="empty">{t('wk_none')}</li>}
        </ul>
        <div className="tiny muted">{t('pg_note')}</div>
      </Card>
      <MuscleVolume sets={setsPerMuscle(ctx.workouts, week, list)} goal={goal} planned={plannedSetsPerMuscle(program, list)} />
      <RecoveryCard ctx={ctx} />
      {open && <ExerciseProgressSheet id={open} ctx={ctx} list={list} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ExerciseProgressSheet({ id, ctx, list, onClose }: { id: string; ctx: CoachContext; list: Exercise[]; onClose: () => void }) {
  const { t, n, lang } = useApp();
  const line = useLine();
  const e = findExercise(id, list);
  const h = exerciseHistory(id, ctx.workouts, list);
  const pr = personalRecords(h);
  const target = ctx.program.days.flatMap((d) => d.exercises).find((x) => x.exerciseId === id) ?? { sets: e?.sets ?? 3, repMin: e?.reps[0] ?? 8, repMax: e?.reps[1] ?? 12 };
  const pg = progression(target, h, e);
  return (
    <Sheet title={exName(e, lang, id)} onClose={onClose}>
      <div className="stack" data-testid="ex-progress">
        {pr && <div className="grid2">
          <div className="stat"><div className="k">{t('pr_e1rm')}</div><div className="v num">{n(pr.bestE1rm, 1)} {t('kg')}</div><div className="tiny muted">{pr.dates.bestE1rm}</div></div>
          <div className="stat"><div className="k">{t('pr_maxW')}</div><div className="v num">{n(pr.maxWeight, 1)} {t('kg')}</div><div className="tiny muted">{pr.dates.maxWeight}</div></div>
          <div className="stat"><div className="k">{t('pr_maxReps')}</div><div className="v num">{pr.maxReps}</div></div>
          <div className="stat"><div className="k">{t('pr_maxVol')}</div><div className="v num">{n(pr.maxVolume)}</div></div>
        </div>}
        <MinutesChart days={h.slice(-20).map((p) => ({ date: p.date, minutes: p.bestE1rm }))} label={t('pr_e1rm')} testId="e1rm-chart" />
        <div className="small"><b>{t('pa_' + pg.action)}</b>{pg.weightKg !== null ? ` · ${n(pg.weightKg, 1)} ${t('kg')}` : ''} · {t('conf_' + pg.confidence)}</div>
        <ul className="small energy-why">{pg.reasons.map((r, i) => <li key={i}>{line(r, list)}</li>)}</ul>
        {pg.alternatives?.length ? <div className="tiny">{t('lib_alternatives')}: {joinList(pg.alternatives.map((a) => exName(findExercise(a, list), lang, a)), lang)}</div> : null}
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>{t('date')}</th><th>{t('wk_sets')}</th><th>e1RM</th><th>{t('pg_volume')}</th></tr></thead>
          <tbody>{[...h].reverse().map((p) => <tr key={p.sessionId}><td>{p.date}</td><td className="num small">{p.sets.map((s) => `${s.weightKg ?? 0}×${s.reps}${s.rir != null ? `@${s.rir}` : ''}`).join(' · ')}</td><td className="num">{n(p.bestE1rm, 1)}</td><td className="num">{n(p.volume)}</td></tr>)}</tbody>
        </table></div>
        <div className="tiny muted">{t('pg_e1rmNote')}</div>
      </div>
    </Sheet>
  );
}

function RecoveryCard({ ctx }: { ctx: CoachContext }) {
  const { t } = useApp();
  const { run } = useAsync();
  const date = today();
  const cur = ctx.recovery.find((r) => r.date === date);
  const [v, setV] = useState({ sleepH: cur?.sleepH ?? '' as number | '', soreness: cur?.soreness ?? 2, energy: cur?.energy ?? 3, fatigue: cur?.fatigue ?? 2 });
  const scale = (k: 'soreness' | 'energy' | 'fatigue') => (
    <div className="field"><span>{t('rl_' + k)}</span>
      <Segmented value={String(v[k])} onChange={(x) => setV({ ...v, [k]: Number(x) })} options={[1, 2, 3, 4, 5].map((x) => ({ value: String(x), label: String(x) }))} /></div>
  );
  return (
    <Card title={t('wt_recovery')}>
      <Indicators items={recoveryIndicators(ctx)} />
      <div className="stack" style={{ marginTop: 8 }} data-testid="recovery-form">
        <div className="tiny muted">{t('rl_note')}</div>
        <NumField label={t('rl_sleep')} value={v.sleepH} onChange={(x) => setV({ ...v, sleepH: x })} step="0.5" testId="rl-sleep" />
        {scale('soreness')}{scale('energy')}{scale('fatigue')}
        <button className="btn primary" data-testid="rl-save" onClick={() => run(() => saveRecovery({ date, sleepH: v.sleepH === '' ? null : Number(v.sleepH), soreness: v.soreness, energy: v.energy, fatigue: v.fatigue }), t('saved'))}>{t('save')}</button>
        <div className="tiny muted">{t('rl_disclaimer')}</div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ coach + weekly review */

function CoachTab({ program, list }: { program: Program; list: Exercise[] }) {
  const { t, d, settings } = useApp();
  const ctx = useCoachContext(program, list);
  const line = useLine();
  const [q, setQ] = useState<Question>('today');
  const [which, setWhich] = useState<'last' | 'current'>('last');
  if (!ctx) return null;
  const a = ask(q, ctx);
  const end = which === 'last' ? lastWeekEnd(today(), settings.weekStartsOn) : today();
  const rv = weeklyReview(ctx, end);
  return (
    <div data-testid="coach-tab">
      <Card title={<><Icon name="coach" />{t('wt_coach')}</>}>
        <div className="tiny muted" style={{ marginBottom: 6 }}>{t('cq_disclaimer')}</div>
        <div className="row wrap" style={{ gap: 4 }}>{QUESTIONS.map((x) => <button key={x} className={`chip clickable ${q === x ? 'on' : ''}`} onClick={() => setQ(x)} data-testid={`q-${x}`}>{t('q_' + x)}</button>)}</div>
        <div className="coach-answer" data-testid="coach-answer">
          <ul className="small energy-why">{a.lines.map((l, i) => <li key={i}>{line(l, list)}</li>)}</ul>
          <div className="tiny muted" data-testid="coach-confidence">{t('conf_label')}: {t('conf_' + a.confidence)} · {line(a.basedOn)}</div>
        </div>
      </Card>
      <Card title={t('wr_title')} actions={<Segmented value={which} onChange={setWhich} options={[{ value: 'last', label: t('wr_last') }, { value: 'current', label: t('wr_current') }]} />}>
        <div className="tiny muted">{d(rv.from)} – {d(rv.to)}</div>
        <div className="small bold" style={{ marginTop: 6 }}>{t('wr_obs')}</div>
        <ol className="small energy-why" data-testid="wr-observations">{rv.observations.map((l, i) => <li key={i}>{line(l, list)}</li>)}</ol>
        <div className="small bold" style={{ marginTop: 6 }}>{t('wr_rec')}</div>
        <ul className="small energy-why" data-testid="wr-recommendations">{rv.recommendations.map((l, i) => <li key={i}>{line(l, list)}</li>)}</ul>
        <div className="tiny muted">{t('wr_noAuto')}</div>
      </Card>
      <Card title={t('nt_title')}><Indicators items={nutritionForTraining(ctx)} /></Card>
    </div>
  );
}
