import type { Settings } from '../lib/types';
import { rebalance } from '../lib/dietStrategy';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useBundle, useCardio } from '../app/hooks';
import { WeightChart } from '../components/charts';
import { Icon } from '../components/icons';
import { Card, Confirm, NumField, ProgressBar, Segmented, useAsync } from '../components/ui';
import { datesBack, totalsFor } from '../lib/cardio';
import { addDays, startOfWeek, today } from '../lib/dates';
import { db } from '../lib/db';
import { autoReplenishPct, fitnessOf } from '../lib/energy';
import { adviseGoals, applyAdvice, CHECKIN_PREFIX, type Advice, type CheckIn } from '../lib/goalAdvisor';
import { kvSet, saveSettings } from '../lib/repo';
import { progressEstimate, rollingWeightAverage, weekReport } from '../lib/reports';
import type { Macros } from '../lib/types';

/** A Goals recommendation applied through the active diet strategy (keto keeps its carbs, flexible keeps its fat…). */
function adviceWithStrategy(targets: Settings['targets'], action: Parameters<typeof applyAdvice>[1], strategy: Settings['dietStrategy']): Settings['targets'] {
  const next = applyAdvice(targets, action);
  if (!strategy) return next;
  return { training: rebalance(strategy, next.training), rest: rebalance(strategy, next.rest) };
}

export default function Goals() {
  const { t, n, settings } = useApp();
  const data = useBundle();
  const cardio = useCardio();
  const checkins = useLiveQuery(async () => (await db.kv.where('key').startsWith(CHECKIN_PREFIX).toArray()).map((r) => r.value as CheckIn), [], []);
  const [confirm, setConfirm] = useState<Advice | null>(null);
  const { run } = useAsync();
  const date = today();
  const view = useMemo(() => {
    if (!data) return null;
    return {
      week: weekReport(date, data),
      advice: adviseGoals(data, cardio, checkins, date),
      est: progressEstimate(data.body, settings.profile.targetWeight, date),
      cardioWeek: totalsFor(cardio, datesBack(7, date))
    };
  }, [data, cardio, checkins, date, settings]);
  if (!data || !view) return null;
  const fit = fitnessOf(settings);
  const p = settings.profile;
  const latest = [...data.body].filter((b) => b.weight && !b.deleted).pop();
  const current = rollingWeightAverage(data.body, date) ?? latest?.weight ?? p.currentWeight;
  const span = p.startWeight - p.targetWeight;
  const weightPct = Math.abs(span) >= 0.1 ? Math.max(0, Math.min(100, ((p.startWeight - current) / span) * 100)) : null;
  const waist = [...data.body].filter((b) => b.waist && !b.deleted).pop()?.waist;
  const goalMin = fit.cardioSessionsPerWeek * fit.cardioMinPerSession;
  const w = view.week;
  const fmtT = (m: Macros) => `${n(m.kcal)} ${t('kcalUnit')} · P ${n(m.protein)} · C ${n(m.carbs)} · F ${n(m.fat)}`;

  const bars: [string, number, number, string][] = ([
    ['gp_calories', w.caloriesInRangeDays, Math.max(1, w.completeDays), `${w.caloriesInRangeDays} / ${w.completeDays}`],
    ['gp_protein', w.proteinHitDays, Math.max(1, w.completeDays), `${w.proteinHitDays} / ${w.completeDays}`],
    ['gp_cardio', view.cardioWeek.minutes, Math.max(1, goalMin), `${n(view.cardioWeek.minutes)} / ${n(goalMin)}`],
    ['gp_sessions', view.cardioWeek.sessions, Math.max(1, fit.cardioSessionsPerWeek), `${view.cardioWeek.sessions} / ${fit.cardioSessionsPerWeek}`],
    weightPct === null ? null : ['gp_weight', weightPct, 100, `${n(weightPct)}%`]
  ] as ([string, number, number, string] | null)[]).filter((x): x is [string, number, number, string] => x !== null);

  return (
    <div data-testid="goals-page">
      <Card title={<><Icon name="target" />{t('goalsProgress')}</>}>
        <div className="stack" data-testid="goal-progress">
          {bars.map(([k, v, max, label]) => (
            <div key={k}>
              <div className="row between small"><span>{t(k)}</span><b className="num">{label}</b></div>
              <ProgressBar value={v} max={max} color={v >= max ? 'var(--good, var(--primary))' : 'var(--primary)'} />
            </div>
          ))}
        </div>
      </Card>

      <Card title={<><Icon name="sparkle" />{t('goalsAdvice')}</>}>
        <div className="tiny muted" style={{ marginBottom: 6 }}>{t('goalsAdviceNote')}</div>
        <ul className="list" data-testid="advice-list">
          {view.advice.map((a) => (
            <li key={a.id} data-testid="advice" data-id={a.id}>
              <span className={`dot-mark ${a.level}`} aria-hidden="true" />
              <span className="grow small">{t(a.key, a.params)}</span>
              {a.action && <button className="btn sm" onClick={() => setConfirm(a)} data-testid="advice-apply">{t('apply')}</button>}
            </li>
          ))}
        </ul>
      </Card>

      <CheckInCard checkins={checkins} />

      <Card title={t('goalsNutrition')}>
        <TargetsEditor />
        <div className="grid2" style={{ marginTop: 8 }}>
          <NumField label={t('targetWeight')} suffix={t('kg')} value={p.targetWeight} step="0.1" testId="goal-target-weight"
            onChange={(v) => v !== '' && v > 20 && run(() => saveSettings((s) => { s.profile.targetWeight = v; }))} />
          <NumField label={t('weeklyChange')} value={p.weeklyChangeKg} step="0.05" testId="goal-weekly-change"
            onChange={(v) => v !== '' && Math.abs(v) <= 1.5 && run(() => saveSettings((s) => { s.profile.weeklyChangeKg = v; }))} />
        </div>
      </Card>

      <Card title={t('goalsFitness')}>
        <div className="grid3">
          <NumField label={t('resistanceDays')} value={fit.resistanceDaysPerWeek} min={0} testId="goal-resistance"
            onChange={(v) => v !== '' && v >= 0 && v <= 14 && run(() => saveSettings((s) => { s.fitness = { ...fitnessOf(s), resistanceDaysPerWeek: v }; }))} />
          <NumField label={t('cardioSessionsGoal')} value={fit.cardioSessionsPerWeek} min={0} testId="goal-cardio-sessions"
            onChange={(v) => v !== '' && v >= 0 && v <= 21 && run(() => saveSettings((s) => { s.fitness = { ...fitnessOf(s), cardioSessionsPerWeek: v }; }))} />
          <NumField label={t('cardioMinGoal')} value={fit.cardioMinPerSession} min={0} testId="goal-cardio-min"
            onChange={(v) => v !== '' && v >= 0 && v <= 300 && run(() => saveSettings((s) => { s.fitness = { ...fitnessOf(s), cardioMinPerSession: v }; }))} />
        </div>
        <div className="small bold" style={{ marginTop: 6 }} data-testid="goal-weekly-cardio">{t('weeklyCardioGoal', { n: n(goalMin) })}</div>
        <div className="tiny muted" data-testid="goal-cardio-source">{settings.fitness?.cardioSessionsPerWeek === undefined ? t('fit_default', { min: fit.cardioMinPerSession, n: fit.resistanceDaysPerWeek }) : t('fit_saved', { s: fit.cardioSessionsPerWeek, min: fit.cardioMinPerSession })}</div>
        <div className="tiny muted">{t('stepsNotSupported')}</div>
        <div className="field" style={{ marginTop: 10 }}>
          <span>{t('en_mode')}</span>
          <Segmented value={settings.cardioCalorieMode ?? 'smart'} onChange={(v) => run(() => saveSettings((s) => { s.cardioCalorieMode = v; }))}
            options={[{ value: 'smart', label: t('en_modeSmart') }, { value: 'off', label: t('en_modeOff') }]} />
        </div>
        {(settings.cardioCalorieMode ?? 'smart') === 'smart' && (
          <label className="field">
            <span>{t('en_pct')}</span>
            <select className="input" value={settings.cardioReplenishPct ?? ''} data-testid="goal-replenish"
              onChange={(e) => run(() => saveSettings((s) => { s.cardioReplenishPct = e.target.value === '' ? null : Number(e.target.value); }))}>
              <option value="">{t('en_pctAuto', { pct: autoReplenishPct(p.goalType) })}</option>
              {[0, 25, 50, 75, 100].map((x) => <option key={x} value={x}>{x}%</option>)}
            </select>
          </label>
        )}
      </Card>

      <Card title={t('goalsBody')}>
        <div className="grid3" data-testid="goal-body">
          <div className="stat"><div className="k">{t('currentWeight')}</div><div className="v num">{n(current, 1)} {t('kg')}</div><div className="tiny muted">{t('toTarget', { v: n(Math.abs(current - p.targetWeight), 1) })}</div></div>
          <div className="stat"><div className="k">{t('waist')}</div><div className="v num">{waist ? `${n(waist, 1)} ${t('cm')}` : '—'}</div>
            {waist && p.startWaist ? <div className="tiny muted">{t('waistSinceStart', { v: `${waist - p.startWaist > 0 ? '+' : ''}${n(waist - p.startWaist, 1)}` })}</div> : null}</div>
          <div className="stat"><div className="k">{t('rateLoss')}</div><div className="v small num">{view.est.ratePerWeek === null ? t('rateNeedData') : t('rateLossV', { v: n(view.est.ratePerWeek, 2), pct: n(view.est.ratePctPerWeek, 2) })}</div></div>
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>{t('fatLossNote')}</div>
        <WeightChart avg target={p.targetWeight} points={datesBack(90, date).map((dt) => ({ date: dt, weight: data.body.find((b) => b.date === dt && !b.deleted)?.weight ?? null, avg: rollingWeightAverage(data.body, dt) })).filter((x) => x.weight !== null)} />
      </Card>

      {confirm?.action && (() => {
        const next = adviceWithStrategy(settings.targets, confirm.action, settings.dietStrategy);
        const msg = confirm.action.kind === 'cardio' ? t(confirm.key, confirm.params) : t('applyAdviceQ', { from: fmtT(settings.targets.training), to: fmtT(next.training) });
        return <Confirm message={msg} onNo={() => setConfirm(null)} onYes={async () => {
          const a = confirm; setConfirm(null);
          await run(() => saveSettings((s) => {
            s.targets = adviceWithStrategy(s.targets, a.action!, s.dietStrategy);
            // the strategy follows the new calories/protein, so its preview and carb-cycling days stay in step
            if (s.dietStrategy && s.dietStrategy.mode !== 'custom') s.dietStrategy = { ...s.dietStrategy, kcal: s.targets.training.kcal, protein: s.targets.training.protein };
          }), t('applied'));
        }} />;
      })()}
    </div>
  );
}

function TargetsEditor() {
  const { t, settings } = useApp();
  const { run } = useAsync();
  const [kind, setKind] = useState<'training' | 'rest'>('training');
  const m = settings.targets[kind];
  const set = (k: keyof Macros) => (v: number | '') => {
    if (v === '' || !(v >= 0) || (k === 'kcal' && v < 800)) return;
    run(() => saveSettings((s) => { s.targets[kind] = { ...s.targets[kind], [k]: v }; }));
  };
  return (
    <>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'training', label: t('trainingDay') }, { value: 'rest', label: t('restDay') }]} />
      <div className="grid2" style={{ marginTop: 8 }} data-testid="targets-editor">
        <NumField label={t('kcal')} value={m.kcal} onChange={set('kcal')} testId="goal-kcal" />
        <NumField label={t('protein')} suffix={t('g')} value={m.protein} onChange={set('protein')} testId="goal-protein" />
        <NumField label={t('carbs')} suffix={t('g')} value={m.carbs} onChange={set('carbs')} testId="goal-carbs" />
        <NumField label={t('fat')} suffix={t('g')} value={m.fat} onChange={set('fat')} testId="goal-fat" />
      </div>
    </>
  );
}

function CheckInCard({ checkins }: { checkins: CheckIn[] }) {
  const { t, settings } = useApp();
  const { run } = useAsync();
  const week = startOfWeek(today(), settings.weekStartsOn);
  const cur = checkins.find((c) => c.week === week);
  const prev = [...checkins].sort((a, b) => a.week.localeCompare(b.week)).filter((c) => c.week < week).pop();
  const [v, setV] = useState<Omit<CheckIn, 'week' | 'updatedAt'>>({
    strength: cur?.strength ?? 'same', hunger: cur?.hunger ?? 3, recovery: cur?.recovery ?? 3, resistanceSessions: cur?.resistanceSessions ?? prev?.resistanceSessions ?? 0
  });
  return (
    <Card title={t('checkIn')}>
      <div className="tiny muted">{t('checkInNote')}</div>
      <div className="stack" style={{ marginTop: 8 }} data-testid="checkin">
        <div className="field"><span>{t('ci_strength')}</span>
          <Segmented value={v.strength} onChange={(strength) => setV({ ...v, strength })} options={(['down', 'same', 'up'] as const).map((x) => ({ value: x, label: t('ci_' + x) }))} /></div>
        <div className="grid3">
          <NumField label={t('ci_hunger')} value={v.hunger} min={1} onChange={(x) => x !== '' && setV({ ...v, hunger: Math.min(5, Math.max(1, x)) })} testId="ci-hunger" />
          <NumField label={t('ci_recovery')} value={v.recovery} min={1} onChange={(x) => x !== '' && setV({ ...v, recovery: Math.min(5, Math.max(1, x)) })} testId="ci-recovery" />
          <NumField label={t('ci_sessions')} value={v.resistanceSessions} min={0} onChange={(x) => x !== '' && setV({ ...v, resistanceSessions: Math.min(14, Math.max(0, x)) })} testId="ci-sessions" />
        </div>
        <button className="btn primary" data-testid="ci-save" onClick={() => run(() => kvSet(CHECKIN_PREFIX + week, { ...v, week, updatedAt: Date.now() }), t('ci_saved'))}>{t('save')}</button>
        {cur && <div className="tiny muted">✓ {addDays(week, 0)}</div>}
      </div>
    </Card>
  );
}
