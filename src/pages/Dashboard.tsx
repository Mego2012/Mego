import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useBundle, useCardio, useTraining } from '../app/hooks';
import { TrainingCard } from '../components/TrainingCard';
import { EnergyCard } from '../components/EnergyCard';
import { StrategyChip } from '../components/StrategyChip';
import { energyFor } from '../lib/energy';
import { CaloriesChart } from '../components/charts';
import { InsightList } from '../components/Insights';
import { Dial, greetingKey, MealGlyph, useCountUp } from '../components/instrument';
import { ScanButtons } from '../components/MealScanner';
import { Icon } from '../components/icons';
import { Card, MacroBars, MacroLine, OptionalNutrientsLine, useAsync } from '../components/ui';
import { dailyCoach, tipOfDay } from '../lib/coach';
import { addDays, today } from '../lib/dates';
import { generateInsights } from '../lib/insights';
import { addWater } from '../lib/repo';
import { buildPeriod, progressEstimate, summarizeDay, weekReport, weightTrend } from '../lib/reports';
import { MEALS } from '../lib/types';

export default function Dashboard() {
  const { t, n, d, settings } = useApp();
  const data = useBundle();
  const cardio = useCardio();
  const training = useTraining();
  const { run } = useAsync();
  const date = today();

  const view = useMemo(() => {
    if (!data) return null;
    const log = data.days.find((x) => x.date === date);
    const day = summarizeDay(date, data.entries, log, settings);
    const week = weekReport(date, data);
    const last7 = buildPeriod('week', '', Array.from({ length: 7 }, (_, i) => addDays(date, i - 6)), data);
    const latestWeight = [...data.body].reverse().find((b) => b.weight);
    return {
      day, week, last7, latestWeight, trend: weightTrend(data.body, date), insights: generateInsights(data, date),
      coach: dailyCoach(data, date, [])[0], est: progressEstimate(data.body, settings.profile.targetWeight, date),
      energy: energyFor(date, day.target.kcal, day.totals.kcal, cardio, settings, training?.workouts ?? [])
    };
  }, [data, date, settings, cardio, training]);

  if (!view) return null;
  const { day, week, last7, latestWeight, trend, insights, coach, est, energy } = view;
  // Dial and remaining use the adjusted target (= base target unless extra cardio justifies more; see energy.ts).
  const target = energy.adjusted;
  const remaining = target - day.totals.kcal;
  const pct = target ? Math.round((day.totals.kcal / target) * 100) : 0;
  const water = day.waterMl, waterTarget = settings.waterTargetMl;
  const drops = Math.max(1, Math.round(waterTarget / 250));
  const p = settings.profile;
  const current = latestWeight?.weight ?? p.currentWeight;
  const goalSpan = p.startWeight - p.targetWeight;
  const goalPct = goalSpan !== 0 ? Math.max(0, Math.min(100, ((p.startWeight - current) / goalSpan) * 100)) : 0;

  return (
    <div data-testid="dashboard">
      <section className="home-hero">
        <div className="greeting">
          <h2 className="hello">{t(greetingKey())}{p.name ? `، ${p.name}` : ''}</h2>
          <div className="date">{d(date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div className="chips">
            <span className={`chip status-${day.status}`}>{t('status_' + day.status)}</span>
            <span className="chip">{t(day.dayType)}</span>
            <StrategyChip date={date} />
          </div>
        </div>
        <Dial value={day.totals.kcal} max={target} testId="calorie-dial">
          <CountUp value={Math.abs(remaining)} testId="kcal-remaining" />
          <div className="k">{remaining >= 0 ? t('remaining') : t('over')} · <span className="unit">{t('kcalUnit')}</span></div>
          <div className="tiny muted num" style={{ marginTop: 6 }}><span data-testid="kcal-pct">{n(pct)}%</span> {t('ofTarget')}</div>
        </Dial>
        <div className="balance" aria-label={t('goalMinusFood')}>
          <div><div className="v num" data-testid="kcal-target">{n(target)}</div><div className="k">{t('goal_short')}</div></div>
          <div><div className="v num" data-testid="kcal-consumed">{n(day.totals.kcal)}</div><div className="k">{t('food_')}</div></div>
          <div><div className="v num" style={{ color: remaining < 0 ? 'var(--warn)' : 'var(--primary)' }}>{n(remaining)}</div><div className="k">{remaining >= 0 ? t('remaining') : t('over')}</div></div>
        </div>
        <div className="hr" />
        <div data-testid="macro-bars"><MacroBars totals={day.totals} target={day.target} /></div>
        <OptionalNutrientsLine m={day.totals} coverage={day.coverage} total={day.entryCount} />
        <Link to="/recipes?tab=suggest" className="btn block" style={{ marginTop: 14, flexDirection: 'column', gap: 2 }} data-testid="what-to-eat">
          <span>{t('suggestions')}</span>
          <span className="tiny muted" style={{ fontWeight: 400 }}>{t('remainingNow', { kcal: n(Math.max(0, day.remaining.kcal)), p: n(Math.max(0, day.remaining.protein)), c: n(Math.max(0, day.remaining.carbs)), f: n(Math.max(0, day.remaining.fat)) })}</span>
        </Link>
      </section>

      <EnergyCard e={energy} />
      <TrainingCard />

      <nav className="quick" aria-label={t('quickActions')}>
        <Link to="/diary?add=1" data-testid="quick-add"><span className="q-ico"><Icon name="plus" /></span>{t('addFood')}</Link>
        <button onClick={() => run(() => addWater(date, 250))} data-testid="dash-water-250"><span className="q-ico" style={{ background: 'color-mix(in srgb, var(--info) 14%, transparent)', color: 'var(--info)' }}><Icon name="water" /></span>+250 {t('ml')}</button>
        <Link to="/coach" data-testid="open-coach"><span className="q-ico" style={{ background: 'color-mix(in srgb, var(--fat) 15%, transparent)', color: 'var(--fat)' }}><Icon name="coach" /></span>{t('nav_coach')}</Link>
        <Link to="/progress"><span className="q-ico" style={{ background: 'color-mix(in srgb, var(--protein) 14%, transparent)', color: 'var(--protein)' }}><Icon name="progress" /></span>{t('weigh')}</Link>
      </nav>

      <Card title={t('scanMeal')} className="scan-card">
        <ScanButtons />
      </Card>

      <Card title={t('nav_coach')}>
        <div data-testid="dash-coach">{coach ? t(coach.key, coach.params) : t(tipOfDay(date))}</div>
      </Card>

      <div className="section-label">{t('nav_diary')}</div>
      <div className="meals">
        {MEALS.map((m) => (
          <Link key={m} to={`/diary?meal=${m}`} className="meal-tile" data-testid={`meal-summary-${m}`}>
            <MealGlyph meal={m} />
            <div className="grow">
              <div className="bold">{t(m)}</div>
              <div className="tiny muted"><MacroLine m={day.byMeal[m]} compact /></div>
              <div className="m-share"><i style={{ width: `${day.target.kcal ? Math.min(100, (day.byMeal[m].kcal / day.target.kcal) * 100) : 0}%` }} /></div>
            </div>
            <span className="m-kcal num">{n(day.byMeal[m].kcal)}</span>
          </Link>
        ))}
      </div>
      <div className="grid2" style={{ margin: '10px 0 14px' }}>
        <div className="stat"><div className="k">{t('mealsLogged')}</div><div className="v num" data-testid="meals-logged">{day.mealsLogged} / 4 <span className="small muted">({day.entryCount} {t('entries')})</span></div></div>
        <div className="stat"><div className="k">{t('dailyGoalCompletion')}</div><div className="v num" data-testid="goal-score">{day.entryCount ? `${day.score}%` : '—'}</div></div>
      </div>

      <Card title={t('water')} actions={<Link className="btn sm ghost" to="/habits">{t('nav_habits')}</Link>}>
        <div className="row between">
          <span className="num"><b className="big" style={{ fontSize: 24 }} data-testid="dash-water">{n(water)}</b> <span className="muted small">/ {n(waterTarget)} {t('ml')}</span></span>
          <button className="btn sm" onClick={() => run(() => addWater(date, 500))}>+500</button>
        </div>
        <div className="drops" aria-hidden="true">{Array.from({ length: drops }, (_, i) => <i key={i} className={water >= (i + 1) * 250 ? 'on' : ''} />)}</div>
      </Card>

      <Card title={t('goalProgress')}>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="small muted">{t('currentWeight')}</div>
            <div className="big num" data-testid="current-weight">{n(current, 1)} <span className="small muted">{t('kg')}</span></div>
          </div>
          <div style={{ textAlign: 'end' }}>
            <div className="small muted">{t('targetWeight')}</div>
            <div className="bold num">{n(p.targetWeight, 1)} {t('kg')}</div>
          </div>
        </div>
        <div className="goal-track"><i style={{ width: `${goalPct}%` }} /><b style={{ insetInlineStart: `${goalPct}%` }} /></div>
        <div className="tiny muted">{t('weeklyWeightTrend')}: {trend.direction === 'insufficient' ? t('insufficientWeight') : `${trend.change! > 0 ? '+' : ''}${n(trend.change, 2)} ${t('kg')}`}{est.weeksToTarget ? ` · ${t('etaWeeks', { n: n(est.weeksToTarget) })}` : ''}</div>
      </Card>

      <Card title={t('weeklySummary')} actions={<Link className="btn sm ghost" to="/reports/week">{t('nav_weekly')}</Link>}>
        <div className="grid3" data-testid="week-summary">
          <div className="stat"><div className="k">{t('weeklyCalorieAvg')}</div><div className="v num" data-testid="week-avg">{week.averages ? n(week.averages.kcal) : '—'}</div></div>
          <div className="stat"><div className="k">{t('avgProtein')}</div><div className="v num">{week.averages ? n(week.averages.protein) : '—'}</div></div>
          <div className="stat"><div className="k">{t('completeDays')}</div><div className="v num">{week.completeDays}/7</div></div>
        </div>
        <div className="tiny muted" style={{ margin: '8px 0' }}>{week.completeDays ? t('basedOnCompleteDays', { n: week.completeDays }) : t('noCompleteDays')}{week.calorieConsistencyPct !== null ? ` · ${t('calorieConsistency')} ${week.calorieConsistencyPct}%` : ''}</div>
        <CaloriesChart days={last7.days} />
      </Card>

      <Card title={t('insightsTitle')}>
        <div className="tiny muted" style={{ marginBottom: 6 }}>{t('insightsNote')}</div>
        <InsightList items={insights} limit={6} />
      </Card>
    </div>
  );
}

/** Animated number: shows the exact value on first render, animates only when the value changes. */
function CountUp({ value, testId }: { value: number; testId: string }) {
  const { n } = useApp();
  const shown = useCountUp(value);
  return <div className="v" data-testid={testId} data-value={Math.round(value)}>{n(Math.round(shown))}</div>;
}
