import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useBundle } from '../app/hooks';
import { CaloriesChart, MacrosChart, WeightChart } from '../components/charts';
import { Icon } from '../components/icons';
import { InsightList } from '../components/Insights';
import { Card, Delta } from '../components/ui';
import { addDays, addMonths, isValidISODate, monthKey, today } from '../lib/dates';
import { exportReportCSV, exportReportXLSX } from '../lib/exporters';
import { DICTS } from '../lib/i18n';
import { generateInsights } from '../lib/insights';
import { rollingWeightAverage, monthComparison, weekComparison, type Comparison } from '../lib/reports';

export default function Reports({ kind }: { kind: 'week' | 'month' }) {
  const { t, n, d, lang } = useApp();
  const [params, setParams] = useSearchParams();
  const data = useBundle();
  const anchorDate = isValidISODate(params.get('date') ?? '') ? params.get('date')! : today();
  const anchorMonth = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : monthKey(today());

  const cmp: Comparison | null = useMemo(() => {
    if (!data) return null;
    return kind === 'week' ? weekComparison(anchorDate, data) : monthComparison(anchorMonth, data);
  }, [data, kind, anchorDate, anchorMonth]);

  const insights = useMemo(() => {
    if (!data || !cmp) return [];
    const end = cmp.current.dates[cmp.current.dates.length - 1];
    return generateInsights(data, end > today() ? today() : end);
  }, [data, cmp]);

  if (!data || !cmp) return null;
  const r = cmp.current;
  const p = cmp.previous;
  const go = (dir: number) =>
    setParams(kind === 'week' ? { date: addDays(r.dates[0], dir * 7) } : { month: addMonths(anchorMonth, dir) }, { replace: true });
  const title = kind === 'week'
    ? `${d(r.dates[0], { day: 'numeric', month: 'short' })} – ${d(r.dates[6], { day: 'numeric', month: 'short', year: 'numeric' })}`
    : d(`${anchorMonth}-01`, { month: 'long', year: 'numeric' });
  const labels = { ...DICTS.en, ...DICTS[lang] } as Record<string, string>;
  const weightPoints = r.dates.map((dt) => {
    const b = data.body.find((x) => x.date === dt);
    return { date: dt, weight: b?.weight ?? null, avg: rollingWeightAverage(data.body, dt) };
  }).filter((x) => x.weight !== null || x.avg !== null);
  const weightDelta = cmp.delta.weightAvg;

  const Stat = ({ k, v, delta, unit, testId, invert }: { k: string; v: string; delta?: number | null; unit?: string; testId?: string; invert?: boolean }) => (
    <div className="stat"><div className="k">{k}</div><div className="v num" data-testid={testId}>{v}</div>
      {delta !== undefined && <div className="tiny">{t('vsPrevious')}: <Delta value={delta} unit={unit} invert={invert} /></div>}</div>
  );

  return (
    <div data-testid={`report-${kind}`}>
      <div className="datenav no-print">
        <button className="icon-btn flip" onClick={() => go(-1)} aria-label={t('previous')} data-testid="report-prev"><Icon name="back" /></button>
        <div className="label" data-testid="report-title">{title}</div>
        <button className="icon-btn flip" onClick={() => go(1)} aria-label={t('next')} data-testid="report-next"><Icon name="fwd" /></button>
      </div>
      <h2 className="center" style={{ display: 'none' }}>{title}</h2>

      <Card title={t('summary')}>
        <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
          <span className="chip status-complete" data-testid="complete-days">{t('completeDays')}: {r.completeDays}</span>
          <span className="chip status-partial" data-testid="partial-days">{t('partialDays')}: {r.partialDays}</span>
          <span className="chip status-empty" data-testid="empty-days">{t('emptyDays')}: {r.emptyDays}</span>
        </div>
        <div className="tiny muted" style={{ marginBottom: 10 }}>{t('averagesExcludePartial')}</div>
        <div className="grid2" data-testid="report-stats">
          <Stat k={t('avgKcal')} v={`${n(r.averages?.kcal)} / ${n(r.averageTarget?.kcal)}`} delta={cmp.delta.kcal} testId="avg-kcal" />
          <Stat k={t('avgProtein')} v={`${n(r.averages?.protein, 1)} / ${n(r.averageTarget?.protein)}`} delta={cmp.delta.protein} invert testId="avg-protein" />
          <Stat k={t('avgCarbs')} v={`${n(r.averages?.carbs, 1)} / ${n(r.averageTarget?.carbs)}`} delta={cmp.delta.carbs} testId="avg-carbs" />
          <Stat k={t('avgFat')} v={`${n(r.averages?.fat, 1)} / ${n(r.averageTarget?.fat)}`} delta={cmp.delta.fat} testId="avg-fat" />
          <Stat k={t('daysInCalorieTarget')} v={`${r.caloriesInRangeDays} / ${r.completeDays}`} testId="days-cal" />
          <Stat k={t('daysProteinTarget')} v={`${r.proteinHitDays} / ${r.completeDays}`} testId="days-protein" />
          <Stat k={t('calorieConsistency')} v={r.calorieConsistencyPct === null ? '—' : `${r.calorieConsistencyPct}%`} delta={cmp.delta.calorieConsistency} unit="%" invert testId="cal-consistency" />
          <Stat k={t('proteinConsistency')} v={r.proteinConsistencyPct === null ? '—' : `${r.proteinConsistencyPct}%`} delta={cmp.delta.proteinConsistency} unit="%" invert testId="protein-consistency" />
          <Stat k={t('goalCompletion')} v={r.goalCompletionPct === null ? '—' : `${r.goalCompletionPct}%`} testId="goal-completion" />
          <Stat k={t('daysOverCalories')} v={`${r.overCalorieDays}`} />
        </div>
      </Card>

      <Card title={t('weight')}>
        <div className="grid2">
          <Stat k={t('weightStart')} v={n(r.weight.start, 1)} testId="w-start" />
          <Stat k={t('weightEnd')} v={n(r.weight.end, 1)} testId="w-end" />
          <Stat k={t('weightAvg')} v={n(r.weight.average, 2)} testId="w-avg" />
          <Stat k={t('weightChangeVsPrev')} v={weightDelta === null ? '—' : `${weightDelta > 0 ? '+' : ''}${n(weightDelta, 2)} ${t('kg')}`} testId="w-delta" />
          <Stat k={t('waistChange')} v={r.weight.waistChange === null ? '—' : `${r.weight.waistChange > 0 ? '+' : ''}${n(r.weight.waistChange, 1)} ${t('cm')}`} />
          <Stat k={t('weighIns', { n: '' }).trim()} v={String(r.weight.count)} />
        </div>
        {weightPoints.length > 0 && <WeightChart points={weightPoints} avg />}
      </Card>

      <Card title={t('dailyCalories')}><CaloriesChart days={r.days} /></Card>
      <Card title={t('dailyMacros')}><MacrosChart days={r.days} /></Card>

      <Card title={`${t('comparison')} — ${t('current')} / ${t('previous')}`}>
        <div className="table-wrap"><table className="tbl" data-testid="comparison">
          <thead><tr><th></th><th>{t('current')}</th><th>{t('previous')}</th><th>{t('difference')}</th></tr></thead>
          <tbody>
            {([['avgKcal', r.averages?.kcal, p.averages?.kcal, cmp.delta.kcal, 0], ['avgProtein', r.averages?.protein, p.averages?.protein, cmp.delta.protein, 1],
              ['avgCarbs', r.averages?.carbs, p.averages?.carbs, cmp.delta.carbs, 1], ['avgFat', r.averages?.fat, p.averages?.fat, cmp.delta.fat, 1],
              ['calorieConsistency', r.calorieConsistencyPct, p.calorieConsistencyPct, cmp.delta.calorieConsistency, 0],
              ['proteinConsistency', r.proteinConsistencyPct, p.proteinConsistencyPct, cmp.delta.proteinConsistency, 0],
              ['weightAvg', r.weight.average, p.weight.average, cmp.delta.weightAvg, 2], ['completeDays', r.completeDays, p.completeDays, r.completeDays - p.completeDays, 0]] as const)
              .map(([k, a, b, dl, dg]) => (
                <tr key={k}><td>{t(k)}</td><td className="num">{n(a ?? null, dg)}</td><td className="num">{n(b ?? null, dg)}</td><td><Delta value={dl ?? null} digits={dg} /></td></tr>
              ))}
          </tbody>
        </table></div>
      </Card>

      {kind === 'month' && (
        <Card title={t('bestDays')}>
          <ul className="list">{r.bestDays.map((x) => (
            <li key={x.date}><span className="grow">{d(x.date)}</span><span className="num small">{n(x.totals.kcal)} {t('kcalUnit')} · {n(x.totals.protein)} {t('g')}</span><span className="chip good">{x.score}%</span></li>
          ))}{!r.bestDays.length && <li className="empty">{t('noCompleteDays')}</li>}</ul>
        </Card>
      )}

      <Card title={t('nav_diary')}>
        <div className="table-wrap"><table className="tbl" data-testid="days-table">
          <thead><tr><th>{t('date')}</th><th>{t('status')}</th><th>{t('kcal')}</th><th>{t('protein')}</th><th>{t('carbs')}</th><th>{t('fat')}</th><th>{t('target')}</th></tr></thead>
          <tbody>{r.days.map((x) => (
            <tr key={x.date} data-status={x.status}>
              <td>{d(x.date, { weekday: 'short', day: 'numeric' })}</td>
              <td><span className={`chip status-${x.status}`}>{t('status_' + x.status)}</span></td>
              <td className="num">{x.status === 'empty' ? '—' : n(x.totals.kcal)}{x.overCalories ? ' ▲' : ''}</td>
              <td className="num">{x.status === 'empty' ? '—' : n(x.totals.protein)}</td>
              <td className="num">{x.status === 'empty' ? '—' : n(x.totals.carbs)}</td>
              <td className="num">{x.status === 'empty' ? '—' : n(x.totals.fat)}</td>
              <td className="num small muted">{n(x.target.kcal)}/{n(x.target.protein)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>

      <Card title={kind === 'month' ? t('overallSummary') : t('insightsTitle')}>
        <InsightList items={insights} />
      </Card>

      <Card title={t('importExport')} className="no-print">
        <div className="row wrap">
          <button className="btn" onClick={() => exportReportCSV(r, labels)} data-testid="export-csv"><Icon name="download" /> {t('exportCSV')}</button>
          <button className="btn" onClick={() => exportReportXLSX(r, labels, data.entries)} data-testid="export-xlsx"><Icon name="download" /> {t('exportXLSX')}</button>
          <button className="btn" onClick={() => window.print()} data-testid="export-pdf"><Icon name="download" /> {t('exportPDF')}</button>
        </div>
      </Card>
    </div>
  );
}
