import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useBundle } from '../app/hooks';
import { CaloriesChart } from '../components/charts';
import { InsightList } from '../components/Insights';
import { Card, MacroBars, MacroLine, Ring } from '../components/ui';
import { addDays, today } from '../lib/dates';
import { generateInsights } from '../lib/insights';
import { buildPeriod, summarizeDay, weekReport, weightTrend } from '../lib/reports';
import { MEALS } from '../lib/types';

export default function Dashboard() {
  const { t, n, settings } = useApp();
  const data = useBundle();
  const date = today();

  const view = useMemo(() => {
    if (!data) return null;
    const log = data.days.find((d) => d.date === date);
    const day = summarizeDay(date, data.entries, log, settings);
    const week = weekReport(date, data);
    const last7 = buildPeriod('week', '', Array.from({ length: 7 }, (_, i) => addDays(date, i - 6)), data);
    const latestWeight = [...data.body].reverse().find((b) => b.weight);
    return { day, week, last7, latestWeight, trend: weightTrend(data.body, date), insights: generateInsights(data, date) };
  }, [data, date, settings]);

  if (!view) return null;
  const { day, week, last7, latestWeight, trend, insights } = view;
  const remaining = day.target.kcal - day.totals.kcal;
  const pct = day.target.kcal ? Math.round((day.totals.kcal / day.target.kcal) * 100) : 0;

  return (
    <div data-testid="dashboard">
      <Card>
        <div className="row between" style={{ marginBottom: 6 }}>
          <span className="chip">{t(day.dayType)}</span>
          <span className={`chip status-${day.status}`}>{t('status_' + day.status)}</span>
        </div>
        <div className="row" style={{ gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Ring value={day.totals.kcal} max={day.target.kcal} size={164}>
            <div className="big num" data-testid="kcal-remaining">{n(Math.abs(remaining))}</div>
            <div className="small muted">{remaining >= 0 ? t('remaining') : t('over')}</div>
          </Ring>
          <div className="stack" style={{ minWidth: 150 }}>
            <div><div className="small muted">{t('target')}</div><div className="bold num" data-testid="kcal-target">{n(day.target.kcal)} {t('kcalUnit')}</div></div>
            <div><div className="small muted">{t('consumed')}</div><div className="bold num" data-testid="kcal-consumed">{n(day.totals.kcal)} {t('kcalUnit')}</div></div>
            <div><div className="small muted">{t('ofTarget')}</div><div className="bold num" data-testid="kcal-pct">{n(pct)}%</div></div>
          </div>
        </div>
        <div className="hr" />
        <div data-testid="macro-bars"><MacroBars totals={day.totals} target={day.target} /></div>
      </Card>

      <Card title={t('nav_diary')} actions={<Link className="btn sm primary" to="/diary?add=1" data-testid="quick-add">+ {t('addFood')}</Link>}>
        <ul className="list">
          {MEALS.map((m) => (
            <li key={m} className="clickable" data-testid={`meal-summary-${m}`}>
              <Link to={`/diary?meal=${m}`} className="row grow" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="grow"><div className="bold">{t(m)}</div><MacroLine m={day.byMeal[m]} compact /></div>
                <span className="num bold">{n(day.byMeal[m].kcal)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="stat"><div className="k">{t('mealsLogged')}</div><div className="v num" data-testid="meals-logged">{day.mealsLogged} / 4 <span className="small muted">({day.entryCount} {t('entries')})</span></div></div>
          <div className="stat"><div className="k">{t('dailyGoalCompletion')}</div><div className="v num" data-testid="goal-score">{day.entryCount ? `${day.score}%` : '—'}</div></div>
        </div>
      </Card>

      <div className="grid2">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="small muted">{t('currentWeight')}</div>
          <div className="big num" data-testid="current-weight">{n(latestWeight?.weight ?? settings.profile.currentWeight, 1)} <span className="small muted">{t('kg')}</span></div>
          <div className="tiny muted">{t('weeklyWeightTrend')}: {trend.direction === 'insufficient' ? t('insufficientWeight') : `${trend.change! > 0 ? '+' : ''}${n(trend.change, 2)} ${t('kg')}`}</div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="small muted">{t('weeklyCalorieAvg')}</div>
          <div className="big num" data-testid="week-avg">{week.averages ? n(week.averages.kcal) : '—'}</div>
          <div className="tiny muted">{week.completeDays ? t('basedOnCompleteDays', { n: week.completeDays }) : t('noCompleteDays')}</div>
        </div>
      </div>
      <div style={{ height: 12 }} />

      <Card title={t('dailyCalories')} actions={<Link className="btn sm" to="/reports/week">{t('nav_weekly')}</Link>}>
        <CaloriesChart days={last7.days} />
      </Card>

      <Card title={t('insightsTitle')}>
        <div className="tiny muted" style={{ marginBottom: 6 }}>{t('insightsNote')}</div>
        <InsightList items={insights} limit={6} />
      </Card>
    </div>
  );
}
