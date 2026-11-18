/**
 * Cardio goals UI: goal editor, compact summary (Goals page / Workouts), full dashboard (today, week, schedule,
 * 8-week history) and weekly / monthly reports. All numbers come from lib/cardioGoals.ts and are recomputed from the
 * saved sessions on every change, so editing or deleting a session updates everything at once.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useCardio } from '../app/hooks';
import { MinutesChart } from './charts';
import { Icon } from './icons';
import { Card, NumField, ProgressBar, Segmented, Sheet, useAsync } from './ui';
import {
  cardioGoalsOf, compare, dayProgress, goalHints, goalsAreSuggested, monthlyHistory, PREFERRED, SUGGESTED_GOALS, validateGoals, weekProgress,
  weeklyHistory, weekSchedule, type CardioGoals, type DayStatus, type PeriodReport, type PreferredCardio, type Progress
} from '../lib/cardioGoals';
import { today } from '../lib/dates';
import { saveSettings } from '../lib/repo';

/** Everything the cardio-goal screens show for one day (and its calendar week). */
export function useCardioGoalsView(date = today()) {
  const { settings } = useApp();
  const sessions = useCardio();
  return useMemo(() => {
    const goals = cardioGoalsOf(settings);
    const ws = settings.weekStartsOn ?? 6;
    return {
      goals, sessions, suggested: goalsAreSuggested(settings),
      day: dayProgress(sessions, goals, date),
      week: weekProgress(sessions, goals, date, ws),
      schedule: weekSchedule(sessions, goals, date, ws),
      weeks: weeklyHistory(sessions, goals, date, ws, 8),
      months: monthlyHistory(sessions, goals, date, 6)
    };
  }, [settings, sessions, date]);
}

/** "14/11" (day/month) kept left-to-right inside Arabic text. */
const dm = (iso: string, n: (v: number) => string) => `\u2066${n(Number(iso.slice(8)))}/${n(Number(iso.slice(5, 7)))}\u2069`;
/** Signed number kept left-to-right ("-5" never shows as "5-"). */
const signed = (v: number, txt: string) => <bdi dir="ltr">{v > 0 ? '+' : ''}{txt}</bdi>;

/** Weekday numbers (0 = Sunday) in the order of the user's week. */
const weekOrder = (start: number) => Array.from({ length: 7 }, (_, i) => (start + i) % 7);
/** 2023-01-01 was a Sunday: a fixed date per weekday, for localized weekday names. */
const refDate = (wd: number) => `2023-01-0${wd + 1}`;

function GoalRow({ label, p, unit, testId, color = 'var(--info)', digits = 0 }: { label: string; p: Progress; unit: string; testId: string; color?: string; digits?: number }) {
  const { t, n } = useApp();
  const pct = p.pct === null ? '—' : `${n(p.pct, 1)}%`;
  return (
    <div className="cg-row" data-testid={testId} data-done={p.done} data-target={p.target} data-remaining={p.remaining} data-pct={p.pct ?? ''}>
      <div className="row between small"><span className="bold">{label}</span><b className="num">{pct}</b></div>
      <ProgressBar value={p.done} max={Math.max(p.target, 0.0001)} color={p.target > 0 && p.done >= p.target ? 'var(--good)' : color}
        label={`${label}: ${n(p.done, digits)} / ${n(p.target, digits)} ${unit}`} />
      <div className="tiny muted num cg-nums">
        <span>{t('cg_target')}: <b>{n(p.target, digits)}</b> {unit}</span>
        <span>{t('cg_done')}: <b>{n(p.done, digits)}</b> {unit}</span>
        <span>{t('cg_remaining')}: <b data-testid={testId + '-remaining'}>{n(p.remaining, digits)}</b> {unit}</span>
      </div>
    </div>
  );
}

/** Compact card: today + this week, with links to the dashboard and the editor. Used on Goals and Workouts. */
export function CardioGoalsSummary() {
  const { t, n } = useApp();
  const v = useCardioGoalsView();
  const [edit, setEdit] = useState(false);
  return (
    <Card title={<><Icon name="pulse" />{t('cg_title')}</>} actions={<button className="btn sm ghost" onClick={() => setEdit(true)} data-testid="cg-edit">{t('cg_edit')}</button>}>
      <div className="stack" data-testid="cg-summary">
        <GoalRow label={t('cg_today')} p={v.day} unit={t('min')} testId="cgs-day" />
        <GoalRow label={t('cg_week')} p={v.week.minutes} unit={t('min')} testId="cgs-week" />
        <div className="tiny muted">{t('cg_sessionsLine', { done: n(v.week.sessions.done), goal: n(v.week.sessions.target), left: n(v.schedule.remainingSessions) })}</div>
        {v.suggested && <div className="tiny muted" data-testid="cg-suggested">{t('cg_suggestedNote')}</div>}
        <Link className="btn sm" to="/cardio?tab=goals" data-testid="cg-open">{t('cg_open')}</Link>
      </div>
      {edit && <CardioGoalsEditor onClose={() => setEdit(false)} />}
    </Card>
  );
}

const STATUS_ICON: Record<DayStatus, string> = { done: '✓', extra: '+', missed: '!', today: '•', planned: '', rest: '' };

/** Home: one compact line for today's cardio goal (keeps the main dashboard uncluttered). */
export function CardioTodayCard() {
  const { t, n } = useApp();
  const v = useCardioGoalsView();
  return (
    <Card title={<><Icon name="pulse" />{t('cg_todayCard')}</>} actions={<Link className="btn sm ghost" to="/cardio?tab=goals" data-testid="home-cardio-open">{t('cg_open')}</Link>}>
      <GoalRow label={t('cg_today')} p={v.day} unit={t('min')} testId="home-cardio-day" />
      <div className="tiny muted" style={{ marginTop: 4 }}>{t('cg_weekShort', { done: n(v.week.minutes.done), goal: n(v.week.minutes.target), left: n(v.schedule.remainingSessions) })}</div>
    </Card>
  );
}

/** Full dashboard (Cardio → Goals tab). */
export function CardioGoalsDashboard({ onLog }: { onLog: () => void }) {
  const { t, n, d, lang } = useApp();
  const v = useCardioGoalsView();
  const [edit, setEdit] = useState(false);
  const g = v.goals;
  const sch = v.schedule;
  return (
    <div className="stack" data-testid="cg-dashboard">
      <Card title={<><Icon name="target" />{t('cg_today')}</>} actions={<button className="btn sm ghost" onClick={() => setEdit(true)} data-testid="cg-edit">{t('cg_edit')}</button>}>
        <GoalRow label={t('cg_dailyGoal')} p={v.day} unit={t('min')} testId="cg-day" />
        {!v.day.planned && <div className="tiny muted" data-testid="cg-rest-today">{t('cg_restToday')}</div>}
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={onLog} data-testid="cg-log">
          <Icon name="plus" /> {t('cg_logPreferred', { act: t('cg_pref_' + g.preferred) })}
        </button>
        {v.suggested && <div className="tiny muted" style={{ marginTop: 6 }} data-testid="cg-suggested">{t('cg_suggestedNote')}</div>}
      </Card>

      <Card title={<><Icon name="calendar" />{t('cg_week')}</>}>
        <div className="tiny muted" style={{ marginBottom: 6 }}>{d(v.week.start, { day: 'numeric', month: 'short' })} – {d(v.week.end, { day: 'numeric', month: 'short' })}</div>
        <div className="stack">
          <GoalRow label={t('cg_weeklyMinutes')} p={v.week.minutes} unit={t('min')} testId="cg-week" />
          <GoalRow label={t('cg_weeklySessions')} p={v.week.sessions} unit={t('cg_sessionsUnit')} testId="cg-sessions" color="var(--primary)" />
          {v.week.distance
            ? <GoalRow label={t('cg_weeklyDistance')} p={v.week.distance} unit={t('km')} testId="cg-distance" color="var(--primary-2)" digits={1} />
            : <div className="small" data-testid="cg-distance-plain">{t('cg_weeklyDistance')}: <b className="num">{n(v.week.distanceKm, 1)}</b> {t('km')}</div>}
        </div>
      </Card>

      <Card title={<><Icon name="calendar" />{t('cg_schedule')}</>}>
        {!g.days.length && <div className="tiny muted" data-testid="cg-no-days">{t('cg_noDays')}</div>}
        <ol className="cg-week" data-testid="cg-schedule">
          {sch.days.map((x) => (
            <li key={x.date} className={`cg-day ${x.status}`} data-testid="cg-schedule-day" data-status={x.status} data-date={x.date}
              aria-label={`${d(x.date, { weekday: 'long' })}: ${t('cg_st_' + x.status)}${x.minutes ? ` · ${n(x.minutes)} ${t('min')}` : ''}`}>
              <span className="wd" aria-hidden="true">{d(x.date, { weekday: lang === 'ar' ? 'narrow' : 'short' })}</span>
              <span className="dn num" aria-hidden="true">{n(Number(x.date.slice(8)))}</span>
              <span className="mark" aria-hidden="true">{STATUS_ICON[x.status]}</span>
              <span className="tiny num" aria-hidden="true">{x.minutes ? n(x.minutes) : ''}</span>
            </li>
          ))}
        </ol>
        <div className="cg-legend tiny muted" aria-hidden="true">
          {(['done', 'missed', 'planned', 'extra', 'rest'] as DayStatus[]).map((s) => <span key={s} className={`cg-key ${s}`}><i />{t('cg_st_' + s)}</span>)}
        </div>
        <div className="grid2 cg-sched-stats" style={{ marginTop: 10 }}>
          <div className="stat"><div className="k">{t('cg_plannedDone')}</div><div className="v num" data-testid="cg-planned-done">{n(sch.completedPlanned)} / {n(sch.planned)}</div></div>
          <div className="stat"><div className="k">{t('cg_missed')}</div><div className="v num" data-testid="cg-missed">{n(sch.missed)}</div></div>
          <div className="stat"><div className="k">{t('cg_sessionsLeft')}</div><div className="v num" data-testid="cg-sessions-left">{n(sch.remainingSessions)}</div></div>
          <div className="stat"><div className="k">{t('cg_activeDays')}</div><div className="v num">{n(v.week.activeDays)}</div></div>
        </div>
      </Card>

      <Card title={t('cg_history8')}>
        <MinutesChart days={v.weeks.map((w) => ({ date: w.start, minutes: w.minutes }))} goal={g.weeklyMin} label={t('cg_history8')} testId="cg-weeks-chart"
          labelOf={(x) => dm(x, n)} />
        <div className="tiny muted">{t('cg_chartNote', { goal: n(g.weeklyMin) })}</div>
      </Card>

      {edit && <CardioGoalsEditor onClose={() => setEdit(false)} />}
    </div>
  );
}

/** Weekly / monthly reports with the previous period for comparison. */
export function CardioReports() {
  const { t, n, d } = useApp();
  const v = useCardioGoalsView();
  const [kind, setKind] = useState<'week' | 'month'>('week');
  const rows: PeriodReport[] = kind === 'week' ? v.weeks : v.months;
  const label = (r: PeriodReport) => (kind === 'week' ? `${d(r.start, { day: 'numeric', month: 'short' })} – ${d(r.end, { day: 'numeric', month: 'short' })}` : d(r.start, { month: 'long', year: 'numeric' }));
  const cur = rows[rows.length - 1];
  const cmp = compare(cur, rows[rows.length - 2]);
  return (
    <div className="stack" data-testid="cg-reports">
      <Segmented value={kind} onChange={setKind} options={[{ value: 'week', label: t('cg_weekly') }, { value: 'month', label: t('cg_monthly') }]} />
      <Card title={kind === 'week' ? t('cg_thisWeek') : t('cg_thisMonth')}>
        <div className="grid3 cg-report-stats" data-testid="cg-report-current">
          <div className="stat"><div className="k">{t('cg_totalMin')}</div><div className="v num" data-testid="cgr-minutes">{n(cur.minutes)}</div></div>
          <div className="stat"><div className="k">{t('cg_sessions')}</div><div className="v num" data-testid="cgr-sessions">{n(cur.sessions)}</div></div>
          <div className="stat"><div className="k">{t('cg_avgSession')}</div><div className="v num" data-testid="cgr-avg">{cur.avgSessionMin === null ? '—' : n(cur.avgSessionMin, 1)}</div></div>
          <div className="stat"><div className="k">{t('cg_totalKm')}</div><div className="v num" data-testid="cgr-km">{n(cur.distanceKm, 1)}</div></div>
          <div className="stat"><div className="k">{t('cg_goalPct')}</div><div className="v num" data-testid="cgr-goal">{cur.goalPct === null ? '—' : `${n(cur.goalPct, 1)}%`}</div></div>
          <div className="stat"><div className="k">{kind === 'week' ? t('cg_vsLastWeek') : t('cg_vsLastMonth')}</div>
            <div className="v num" data-testid="cgr-delta">{cmp.minutesDelta === null ? '—' : signed(cmp.minutesDelta, n(cmp.minutesDelta))}</div>
            {cmp.pctChange !== null && <div className="tiny muted num">{signed(cmp.pctChange, `${n(cmp.pctChange, 1)}%`)}</div>}</div>
        </div>
      </Card>
      <Card title={kind === 'week' ? t('cg_history8') : t('cg_history6m')}>
        <MinutesChart days={rows.map((r) => ({ date: r.start, minutes: r.minutes }))} goal={kind === 'week' ? v.goals.weeklyMin : undefined} label={kind === 'week' ? t('cg_history8') : t('cg_history6m')}
          testId="cg-report-chart" labelOf={(x) => (kind === 'week' ? dm(x, n) : d(x, { month: 'short' }))} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label={kind === 'week' ? t('cg_history8') : t('cg_history6m')}>
          <table className="cg-table small" data-testid="cg-report-table">
            <thead><tr><th>{kind === 'week' ? t('cg_weekCol') : t('cg_monthCol')}</th><th>{t('cg_totalMin')}</th><th>{t('cg_sessions')}</th><th>{t('cg_avgSession')}</th><th>{t('cg_totalKm')}</th><th>{t('cg_goalPct')}</th></tr></thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.key} data-testid="cg-report-row">
                  <td>{label(r)}</td><td className="num">{n(r.minutes)}</td><td className="num">{n(r.sessions)}</td>
                  <td className="num">{r.avgSessionMin === null ? '—' : n(r.avgSessionMin, 1)}</td><td className="num">{n(r.distanceKm, 1)}</td>
                  <td className="num">{r.goalPct === null ? '—' : `${n(r.goalPct, 1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** Goal editor: every value editable; "suggested values" restores 20 / 120 / 6. */
export function CardioGoalsEditor({ onClose }: { onClose: () => void }) {
  const { t, n, d, settings } = useApp();
  const { run, busy } = useAsync();
  const start = cardioGoalsOf(settings);
  const [daily, setDaily] = useState<number | ''>(start.dailyMin);
  const [weekly, setWeekly] = useState<number | ''>(start.weeklyMin);
  const [sessions, setSessions] = useState<number | ''>(start.weeklySessions);
  const [km, setKm] = useState<number | ''>(start.weeklyKm ?? '');
  const [preferred, setPreferred] = useState<PreferredCardio>(start.preferred);
  const [days, setDays] = useState<number[]>(start.days);
  const draft = { dailyMin: daily === '' ? NaN : daily, weeklyMin: weekly === '' ? NaN : weekly, weeklySessions: sessions === '' ? NaN : sessions, weeklyKm: km === '' ? null : km, preferred, days };
  const errs = validateGoals(draft);
  const hints = errs.length ? [] : goalHints(draft as CardioGoals);
  const toggle = (wd: number) => setDays((x) => (x.includes(wd) ? x.filter((y) => y !== wd) : [...x, wd].sort((a, b) => a - b)));
  const reset = () => { setDaily(SUGGESTED_GOALS.dailyMin); setWeekly(SUGGESTED_GOALS.weeklyMin); setSessions(SUGGESTED_GOALS.weeklySessions); setKm(''); };
  const save = async () => {
    const ok = await run(() => saveSettings((s) => { s.cardioGoals = { ...(draft as CardioGoals), updatedAt: Date.now() }; }), t('cg_saved'));
    if (ok) onClose();
  };
  const label: Record<string, string> = { dailyMin: 'cg_dailyGoal', weeklyMin: 'cg_weeklyMinutes', weeklySessions: 'cg_weeklySessions', weeklyKm: 'cg_weeklyDistance' };
  return (
    <Sheet title={t('cg_editTitle')} onClose={onClose} footer={<>
      <button className="btn grow" onClick={onClose}>{t('cancel')}</button>
      <button className="btn primary grow" disabled={busy || errs.length > 0} onClick={save} data-testid="cg-save">{t('save')}</button>
    </>}>
      <div className="stack" data-testid="cg-editor">
        <div className="tiny muted">{t('cg_editorNote')}</div>
        <div className="grid2">
          <NumField label={t('cg_dailyGoal')} suffix={t('min')} value={daily} onChange={setDaily} min={0} testId="cg-daily" />
          <NumField label={t('cg_weeklyMinutes')} suffix={t('min')} value={weekly} onChange={setWeekly} min={0} testId="cg-weekly" />
          <NumField label={t('cg_weeklySessions')} value={sessions} onChange={setSessions} min={0} testId="cg-sessions-in" />
          <NumField label={t('cg_weeklyDistanceOpt')} suffix={t('km')} value={km} onChange={setKm} min={0} step="0.1" testId="cg-km" />
        </div>
        <label className="field"><span>{t('cg_preferred')}</span>
          <select className="input" value={preferred} onChange={(e) => setPreferred(e.target.value as PreferredCardio)} data-testid="cg-preferred">
            {PREFERRED.map((p) => <option key={p} value={p}>{t('cg_pref_' + p)}</option>)}
          </select>
        </label>
        <fieldset className="field cg-days-field">
          <legend>{t('cg_days')}</legend>
          <div className="row wrap" style={{ gap: 6 }} data-testid="cg-days">
            {weekOrder(settings.weekStartsOn ?? 6).map((wd) => (
              <button key={wd} type="button" className={`chip clickable ${days.includes(wd) ? 'on' : ''}`} aria-pressed={days.includes(wd)} onClick={() => toggle(wd)} data-testid={'cg-day-' + wd}>
                {d(refDate(wd), { weekday: 'short' })}
              </button>
            ))}
          </div>
          <div className="tiny muted">{days.length ? t('cg_daysN', { n: n(days.length) }) : t('cg_daysNone')}</div>
        </fieldset>
        {errs.length > 0 && <div className="tiny" style={{ color: 'var(--warn)' }} role="alert" data-testid="cg-errors">{t('cg_invalid', { fields: errs.map((e) => t(label[e] ?? e)).join(' · ') })}</div>}
        {hints.map((h) => <div key={h} className="tiny muted" data-testid="cg-hint">{t(h, { daily: n(draft.dailyMin), weekly: n(draft.weeklyMin), days: n(days.length || 7), sessions: n(draft.weeklySessions) })}</div>)}
        <button type="button" className="btn sm ghost" onClick={reset} data-testid="cg-reset">{t('cg_reset')}</button>
        <div className="tiny muted">{t('cg_notMedical')}</div>
      </div>
    </Sheet>
  );
}

