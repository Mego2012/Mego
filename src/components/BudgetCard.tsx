import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { budgetSettings, computeBudget, DEFAULT_BUDGET, monthBudget, TARGET_HISTORY_KEY, targetOn, weekBudget, type Budget, type BudgetSettings, type TargetHistoryEntry } from '../lib/budget';
import { monthKey, today } from '../lib/dates';
import { WEEKDAY_KEYS } from '../lib/i18n';
import { kvGet, saveSettings } from '../lib/repo';
import type { DataBundle } from '../lib/reports';
import { weekday } from '../lib/dates';
import { Icon } from './icons';
import { Card, MacroBars, NumField, Segmented, useAsync } from './ui';

export function useTargetHistory(): TargetHistoryEntry[] {
  return useLiveQuery(() => kvGet<TargetHistoryEntry[]>(TARGET_HISTORY_KEY, []), [], []);
}

function Meter({ used, total, over, testId }: { used: number; total: number; over: boolean; testId?: string }) {
  const { t } = useApp();
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return <div className={`bar budget-bar ${over ? 'over' : ''}`} role="progressbar" aria-label={t('bu_title')} aria-valuenow={Math.round(used)} aria-valuemax={Math.round(total)} data-testid={testId}><i style={{ width: `${pct}%` }} /></div>;
}

function Stat({ k, v, testId, tone }: { k: string; v: string; testId?: string; tone?: 'good' | 'warn' }) {
  return <div className="stat budget-stat"><div className="k">{k}</div><div className={`v num ${tone === 'warn' ? 'budget-over' : tone === 'good' ? 'budget-ok' : ''}`} data-testid={testId}>{v}</div></div>;
}

/**
 * Daily · Weekly · Monthly calorie budget (budget.ts). Read-only: shows targets, consumption and the optional
 * suggestion; it never changes targets or records. Wording is neutral — going above a day's target is not a failure.
 */
export function BudgetCard({ data }: { data: DataBundle }) {
  const { t, n, lang } = useApp();
  const history = useTargetHistory();
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const date = today();
  const bs = budgetSettings(data.settings);
  const week = useMemo(() => weekBudget(date, data, history), [data, history, date]);
  const month = useMemo(() => monthBudget(monthKey(date), data, history), [data, history, date]);
  const dayB = useMemo(() => computeBudget('week', [date], data, history), [data, history, date]).days[0];
  const target = targetOn(date, data.settings, data.days.find((d) => d.date === date), history);
  const consumed = dayB.consumed ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const signed = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + n(Math.abs(x));
  const dayLabel = (d: string) => t(WEEKDAY_KEYS[weekday(d)]);
  return (
    <Card title={<><Icon name="target" />{t('bu_title')}</>} className="budget-card">
      <div data-testid="budget-card" className="stack">
        <Segmented value={view} onChange={setView} options={[{ value: 'day', label: t('bu_daily') }, { value: 'week', label: t('bu_weekly') }, { value: 'month', label: t('bu_monthly') }]} />

        {view === 'day' && (
          <div className="stack" data-testid="budget-day">
            <div className="grid3">
              <Stat k={t('bu_target')} v={`${n(target.kcal)}`} />
              <Stat k={t('bu_consumed')} v={`${n(consumed.kcal)}`} testId="bu-day-consumed" />
              {consumed.kcal <= target.kcal
                ? <Stat k={t('bu_remaining')} v={n(target.kcal - consumed.kcal)} tone="good" testId="bu-day-remaining" />
                : <Stat k={t('bu_aboveBy')} v={`+${n(consumed.kcal - target.kcal)}`} tone="warn" testId="bu-day-excess" />}
            </div>
            <Meter used={consumed.kcal} total={target.kcal} over={consumed.kcal > target.kcal} testId="bu-day-bar" />
            <div className="row between tiny"><span className={`chip ${consumed.kcal > target.kcal ? 'warn' : 'good'}`} data-testid="bu-day-status">{consumed.kcal > target.kcal ? (dayB.aboveFlex ? t('bu_aboveFlex') : t('bu_aboveTarget')) : t('bu_within')}</span>
              <span className="muted num">{target.kcal ? Math.round((consumed.kcal / target.kcal) * 100) : 0}% {t('ofTarget')}</span></div>
            {consumed.kcal > target.kcal && <div className="tiny muted" data-testid="bu-day-note">{t('bu_dayOverNote', { kcal: n(consumed.kcal - target.kcal), left: n(Math.max(0, week.remaining)) })}</div>}
            <MacroBars totals={consumed} target={target} />
            <div className="tiny muted">{t('bu_proteinDaily')}</div>
          </div>
        )}

        {view === 'week' && <PeriodView b={week} kind="week" signed={signed} dayLabel={dayLabel} lang={lang} />}
        {view === 'month' && <PeriodView b={month} kind="month" signed={signed} dayLabel={dayLabel} lang={lang} />}
        {bs.flexKcal ? <div className="tiny muted">{t('bu_flexNote', { kcal: n(bs.flexKcal) })}</div> : null}
      </div>
    </Card>
  );
}

function PeriodView({ b, kind, signed, dayLabel }: { b: Budget; kind: 'week' | 'month'; signed: (x: number) => string; dayLabel: (d: string) => string; lang: string }) {
  const { t, n, d } = useApp();
  const p = kind === 'week' ? 'w' : 'm';
  return (
    <div className="stack" data-testid={`budget-${kind}`}>
      <div className="grid2">
        <Stat k={t(kind === 'week' ? 'bu_weekBudget' : 'bu_monthBudget')} v={n(b.budget)} testId={`bu-${p}-budget`} />
        <Stat k={t('bu_consumed')} v={n(b.consumed)} testId={`bu-${p}-consumed`} />
        {b.remaining >= 0
          ? <Stat k={t('bu_remaining')} v={n(b.remaining)} tone="good" testId={`bu-${p}-remaining`} />
          : <Stat k={t('bu_aboveBy')} v={`+${n(-b.remaining)}`} tone="warn" testId={`bu-${p}-excess`} />}
        <Stat k={t('bu_avgDaily')} v={b.averageDaily !== null ? n(b.averageDaily) : '—'} testId={`bu-${p}-avg`} />
      </div>
      <Meter used={b.consumed} total={b.trackedBudget} over={b.exceeded} testId={`bu-${p}-bar`} />
      <div className="row between tiny"><span className={`chip ${b.exceeded ? 'warn' : 'good'}`} data-testid={`bu-${p}-status`}>{t(b.exceeded ? (kind === 'week' ? 'bu_weekExceeded' : 'bu_monthExceeded') : (kind === 'week' ? 'bu_weekLeft' : 'bu_monthLeft'))}</span>
        <span className="muted num">{t('bu_used', { pct: n(b.usedPct) })}{b.pacePct !== null ? ` · ${t('bu_pace', { pct: n(b.pacePct) })}` : ''}</span></div>
      {b.unloggedPastDays > 0 && <div className="tiny muted" data-testid={`bu-${p}-unlogged`}>{t('bu_unlogged', { n: n(b.unloggedPastDays) })}</div>}
      {b.suggestion && (
        <div className="banner info small" data-testid={`bu-${p}-suggestion`}>
          <div>{t('bu_suggest', { kcal: n(b.suggestion.perDay), days: n(b.suggestion.days) })}</div>
          {b.suggestion.note === 'floor' && <div className="tiny">{t('bu_suggestFloor', { exact: n(b.suggestion.exact), normal: n(b.suggestion.normalTarget) })}</div>}
          {b.suggestion.note === 'room' && <div className="tiny">{t('bu_suggestRoom', { exact: n(b.suggestion.exact) })}</div>}
          <div className="tiny muted">{t('bu_optional')}</div>
        </div>
      )}
      <div className="small bold">{t(kind === 'week' ? 'bu_byDay' : 'bu_byWeek')}</div>
      {kind === 'week' ? (
        <ul className="list budget-days" data-testid="bu-w-days">
          {b.days.map((x) => (
            <li key={x.date} data-testid="bu-day-row" className={x.isToday ? 'today' : ''}>
              <span className="grow small">{dayLabel(x.date)} <span className="tiny muted num">{d(x.date, { day: 'numeric', month: 'short' })}</span></span>
              <span className="num small">{x.consumed ? n(x.consumed.kcal) : <span className="muted tiny">{x.future ? '—' : t('bu_notLogged')}</span>}</span>
              <span className={`num tiny budget-diff ${x.diff !== null && x.diff > 0 ? 'budget-over' : 'budget-ok'}`}>{x.diff !== null ? signed(x.diff) : ''}</span>
              <span className="tiny muted num">{x.consumed ? `${t('protein')} ${n(x.consumed.protein)}` : ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="list budget-days" data-testid="bu-m-weeks">
          {b.weeks.map((w) => (
            <li key={w.start} data-testid="bu-week-row">
              <span className="grow small num">{d(w.dates[0], { day: 'numeric', month: 'short' })} – {d(w.dates[w.dates.length - 1], { day: 'numeric', month: 'short' })}</span>
              <span className="num small">{n(w.consumed)} / {n(w.target)}</span>
              <span className="tiny muted">{t('bu_loggedDays', { n: n(w.loggedDays), of: n(w.dates.length) })}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="tiny muted" data-testid={`bu-${p}-protein`}>{t('bu_proteinLine', { avg: b.protein.average !== null ? n(b.protein.average) : '—', target: n(b.protein.target), hit: n(b.protein.daysHit), days: n(b.protein.loggedDays) })}</div>
    </div>
  );
}

/** Report section: budget utilisation and day counts for the report's week or month. */
export function BudgetReport({ data, dates, kind }: { data: DataBundle; dates: string[]; kind: 'week' | 'month' }) {
  const { t, n } = useApp();
  const history = useTargetHistory();
  const b = useMemo(() => computeBudget(kind, dates, data, history), [data, dates, kind, history]);
  return (
    <Card title={<><Icon name="target" />{t('bu_reportTitle')}</>}>
      <div className="stack" data-testid="report-budget">
        <div className="grid3">
          <Stat k={t(kind === 'week' ? 'bu_weekBudget' : 'bu_monthBudget')} v={n(b.budget)} />
          <Stat k={t('bu_consumed')} v={n(b.consumed)} />
          {b.remaining >= 0 ? <Stat k={t('bu_remaining')} v={n(b.remaining)} tone="good" /> : <Stat k={t('bu_aboveBy')} v={`+${n(-b.remaining)}`} tone="warn" />}
        </div>
        <Meter used={b.consumed} total={b.trackedBudget} over={b.exceeded} />
        <ul className="adherence">
          <li><span>{t('bu_used', { pct: '' }).trim()}</span><b className="num">{n(b.usedPct)}%</b></li>
          <li><span>{t('bu_avgDaily')}</span><b className="num">{b.averageDaily !== null ? n(b.averageDaily) : '—'}</b></li>
          <li><span>{t('bu_daysAbove')}</span><b className="num" data-testid="rb-above">{n(b.daysAbove)}</b></li>
          <li><span>{t('bu_daysBelow')}</span><b className="num">{n(b.daysBelow)}</b></li>
          <li><span>{t('bu_avgProtein')}</span><b className="num">{b.protein.average !== null ? `${n(b.protein.average)} / ${n(b.protein.target)}` : '—'}</b></li>
          <li><span>{t('bu_proteinDays')}</span><b className="num">{n(b.protein.daysHit)} / {n(b.protein.loggedDays)}</b></li>
        </ul>
        {b.unloggedPastDays > 0 && <div className="tiny muted">{t('bu_unlogged', { n: n(b.unloggedPastDays) })}</div>}
        <div className="tiny muted">{t('bu_reportNote')}</div>
      </div>
    </Card>
  );
}

/** Goals → budget preferences (no target is changed here). */
export function BudgetSettingsCard() {
  const { t, n, settings } = useApp();
  const { run } = useAsync();
  const bs = budgetSettings(settings);
  const save = (patch: Partial<BudgetSettings>) => run(() => saveSettings((s) => { s.budget = { ...DEFAULT_BUDGET, ...(s.budget ?? {}), ...patch }; }));
  const T = settings.targets.training.kcal;
  return (
    <Card title={<><Icon name="target" />{t('bu_settings')}</>}>
      <div className="stack" data-testid="budget-settings">
        <div className="tiny muted">{t('bu_settingsIntro', { day: n(T), week: n(T * 7) })}</div>
        <label className="check"><input type="checkbox" checked={bs.flexKcal !== null} onChange={(e) => save({ flexKcal: e.target.checked ? 300 : null })} data-testid="bu-flex-on" />{t('bu_flexOn')}</label>
        {bs.flexKcal !== null && <NumField label={t('bu_flexKcal')} value={bs.flexKcal} min={0} onChange={(v) => v !== '' && v >= 0 && v <= 1500 && save({ flexKcal: v })} testId="bu-flex" />}
        <label className="field"><span>{t('bu_weekMethod')}</span>
          <select className="input" value={bs.weekMethod} onChange={(e) => save({ weekMethod: e.target.value as 'auto' | 'custom' })} data-testid="bu-week-method">
            <option value="auto">{t('bu_methodWeekAuto')}</option><option value="custom">{t('bu_methodCustom')}</option>
          </select></label>
        {bs.weekMethod === 'custom' && <NumField label={t('bu_weekBudget')} value={bs.weekCustom ?? T * 7} onChange={(v) => v !== '' && v >= 5600 && v <= 70000 && save({ weekCustom: v })} testId="bu-week-custom" />}
        <label className="field"><span>{t('bu_monthMethod')}</span>
          <select className="input" value={bs.monthMethod} onChange={(e) => save({ monthMethod: e.target.value as 'auto' | 'custom' })} data-testid="bu-month-method">
            <option value="auto">{t('bu_methodMonthAuto')}</option><option value="custom">{t('bu_methodCustom')}</option>
          </select></label>
        {bs.monthMethod === 'custom' && <NumField label={t('bu_monthBudget')} value={bs.monthCustom ?? T * 30} onChange={(v) => v !== '' && v >= 22400 && v <= 310000 && save({ monthCustom: v })} testId="bu-month-custom" />}
        <label className="check"><input type="checkbox" checked={bs.suggestions} onChange={(e) => save({ suggestions: e.target.checked })} data-testid="bu-suggestions" />{t('bu_suggestionsOn')}</label>
        <div className="tiny muted">{t('bu_settingsNote')}</div>
      </div>
    </Card>
  );
}
