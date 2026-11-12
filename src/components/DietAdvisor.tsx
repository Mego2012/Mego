import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useBundle, useCardio, useTraining } from '../app/hooks';
import { db } from '../lib/db';
import { adviseDiet, type Adjustment, type Basis, type Reason, type StrategyOption } from '../lib/dietAdvisor';
import { applyDietOption, applyKcalDelta, applyMaintenance } from '../lib/dietActions';
import { CYCLE_LEVELS } from '../lib/dietStrategy';
import { CHECKIN_PREFIX, type CheckIn } from '../lib/goalAdvisor';
import { DIET_HISTORY_KEY, type PeriodResult, type StrategyPeriod } from '../lib/dietHistory';
import { WEEKDAY_KEYS } from '../lib/i18n';
import type { Macros } from '../lib/types';
import { Icon } from './icons';
import { Card, Confirm, Skeleton, useAsync } from './ui';

/** Coach → Diet advisor: recommended strategy, two alternatives, comparison, and a progress review with suggestions. */
export function DietAdvisor() {
  const { t, n, settings } = useApp();
  const data = useBundle();
  const cardio = useCardio();
  const training = useTraining();
  const checkins = useLiveQuery(async () => (await db.kv.where('key').startsWith(CHECKIN_PREFIX).toArray()).map((r) => r.value as CheckIn), [], []);
  const history = useLiveQuery(async () => ((await db.kv.get(DIET_HISTORY_KEY))?.value as StrategyPeriod[] | undefined) ?? [], [], [] as StrategyPeriod[]);
  const { run, busy } = useAsync();
  const [confirm, setConfirm] = useState<{ msg: string; go: () => Promise<void> } | null>(null);
  const r = useMemo(() => {
    if (!data || !training) return null;
    const program = training.programs.find((p) => p.id === training.activeId) ?? training.programs[0];
    return adviseDiet({ data, workouts: training.workouts, program, cardio, recovery: training.recovery, checkins, history });
  }, [data, training, cardio, checkins, history]);
  if (!r) return <Skeleton lines={8} />;
  const sg = r.signals;
  const fmt = (m: Macros) => `${n(m.kcal)} ${t('kcalUnit')} · ${t('protein')} ${n(m.protein)} · ${t('carbs')} ${n(m.carbs)} · ${t('fat')} ${n(m.fat)} ${t('g')}`;
  const active = settings.dietStrategy?.mode;
  const order = Array.from({ length: 7 }, (_, i) => (settings.weekStartsOn + i) % 7);

  const accept = (o: StrategyOption) => setConfirm({
    msg: t('da_confirmAccept', { mode: t('ds_m_' + o.mode), cur: fmt(settings.targets.training), next: fmt(o.mode === 'custom' ? settings.targets.training : o.targets) }),
    go: () => run(() => applyDietOption(o), t('saved')).then(() => undefined)
  });
  const act = (a: Adjustment) => {
    if (!a.action) return;
    if (a.action.kind === 'kcal') {
      const d = a.action.delta;
      setConfirm({ msg: t('da_confirmKcal', { from: n(settings.targets.training.kcal), to: n(settings.targets.training.kcal + d) }), go: () => run(() => applyKcalDelta(d), t('saved')).then(() => undefined) });
    } else if (a.action.kind === 'maintain') {
      setConfirm({ msg: t('da_confirmMaintain', { kcal: n(sg.tdee) }), go: () => run(() => applyMaintenance(sg.tdee, Math.round(sg.weight * 1.6)), t('saved')).then(() => undefined) });
    } else {
      const o = r.options.find((x) => x.mode === (a.action as { mode: string }).mode);
      if (o) accept(o);
    }
  };

  return (
    <div className="stack" data-testid="diet-advisor">
      <div className="banner info small" data-testid="adv-disclaimer">{t('da_disclaimer')}</div>

      <Card title={<><Icon name="chart" />{t('da_looked')}</>}>
        <ul className="adherence small" data-testid="adv-signals">
          <li><span>{t('da_s_body')}</span><b className="num">{n(sg.weight, 1)} kg · BMI {n(sg.bmi, 1)}{sg.whtr !== null ? ` · ${t('da_whtr')} ${n(sg.whtr, 2)}` : ''}</b></li>
          <li><span>{t('da_s_goal')}</span><b>{t('goal_' + sg.goal)}</b></li>
          <li><span>{t('da_s_training')}</span><b className="num">{t('da_s_trainingV', { done: n(sg.trainingPerWeek, 1), plan: sg.plannedTraining, cardio: sg.cardioMinWeek })}</b></li>
          <li><span>{t('da_s_intake')}</span><b className="num">{sg.intake ? fmt(sg.intake) : t('da_none')}</b></li>
          <li><span>{t('da_s_logging')}</span><b className="num">{t('da_s_loggingV', { days: sg.completeDays, pct: sg.adherencePct ?? '—' })}</b></li>
          <li><span>{t('da_s_trend')}</span><b className="num">{sg.ratePerWeek !== null ? t('da_s_trendV', { rate: n(sg.ratePerWeek, 2), n: sg.weighIns }) : t('da_s_trendNone', { n: sg.weighIns })}</b></li>
          <li><span>{t('da_s_feel')}</span><b className="num">{sg.hunger !== null ? t('da_s_feelV', { h: n(sg.hunger, 1), r: n(sg.recovery ?? 0, 1), s: t('ci_' + (sg.strength ?? 'same')) }) : t('da_none')}</b></li>
          <li><span>{t('da_s_lifts')}</span><b className="num">{t('da_s_liftsV', { up: sg.liftsUp, down: sg.liftsDown })}</b></li>
          <li><span>{t('da_s_kcal')}</span><b className="num" data-testid="adv-kcal">{t(sg.kcalBasis === 'kept' ? 'da_s_kcalKept' : sg.kcalBasis === 'adjusted' ? 'da_s_kcalAdjusted' : 'da_s_kcalFormula', { k: n(sg.kcal), c: n(sg.currentKcal), f: n(sg.formulaKcal) })}</b></li>
          <li><span>{t('da_s_protein')}</span><b className="num">{t(sg.proteinBasis === 'current' ? 'da_s_proteinCurrent' : 'da_s_proteinGoal', { g: sg.protein, gkg: n(sg.protein / sg.weight, 1) })}</b></li>
          <li><span>{t('da_s_tdee')}</span><b className="num">{n(sg.tdee)} {t('kcalUnit')} · <BasisTag b={sg.tdeeBasis} /></b></li>
        </ul>
        <div className="tiny muted">{sg.dataTdee !== null ? t('da_tdeeData', { data: n(sg.dataTdee), formula: n(sg.formulaTdee) }) : t('da_tdeeFormula', { formula: n(sg.formulaTdee) })}</div>
        <div className="tiny muted" data-testid="adv-confidence">{t('da_conf_' + r.confidence)}</div>
      </Card>

      {r.trial && (
        <div className={`banner small ${r.trial.done ? (r.trial.verdict === 'notEffective' ? 'offline' : 'info') : 'info'}`} data-testid="adv-trial">
          {r.trial.done ? t('da_trialDone', { mode: t('ds_m_' + r.trial.mode), days: r.trial.day }) : t('da_trialRunning', { mode: t('ds_m_' + r.trial.mode), day: r.trial.day, date: r.trial.evalDate })}
        </div>
      )}
      {(r.results.current || r.results.previous) && <ResultsCard cur={r.results.current} prev={r.results.previous} />}

      <OptionCard o={r.recommended} rec active={active === r.recommended.mode} onAccept={() => accept(r.recommended)} order={order} fmt={fmt} busy={busy} />
      <div className="small bold">{t('da_alternatives')}</div>
      {r.alternatives.map((o) => <OptionCard key={o.mode} o={o} active={active === o.mode} onAccept={() => accept(o)} order={order} fmt={fmt} busy={busy} />)}

      <Card title={<><Icon name="compare" />{t('da_compare')}</>}>
        <div className="table-wrap"><table className="da-table" data-testid="adv-compare">
          <thead><tr><th>{t('da_strategy')}</th><th>{t('da_fit')}</th><th>{t('kcalUnit')}</th><th>P</th><th>C</th><th>F</th></tr></thead>
          <tbody>{r.options.map((o) => <tr key={o.mode} className={o === r.recommended ? 'bold' : ''}><td>{t('ds_m_' + o.mode)}</td><td><span className="da-bar" style={{ width: `${Math.max(4, Math.min(100, o.score))}%` }} /></td><td className="num">{n(o.targets.kcal)}</td><td className="num">{n(o.targets.protein)}</td><td className="num">{n(o.targets.carbs)}</td><td className="num">{n(o.targets.fat)}</td></tr>)}</tbody>
        </table></div>
        <div className="tiny muted">{t('da_fitNote')}</div>
      </Card>

      <Card title={<><Icon name="pulse" />{t('da_review')}</>}>
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }} data-testid="adv-review">
          {r.adjustments.map((a) => (
            <li key={a.id} className={`banner small ${a.level === 'warn' ? 'offline' : 'info'}`} data-testid={'adv-adj-' + a.id}>
              <div>{t(a.key, a.params)} <BasisTag b={a.basis} /></div>
              {a.action && <button className="btn sm" style={{ marginTop: 6 }} disabled={busy} onClick={() => act(a)} data-testid={'adv-act-' + a.id}>{t(a.action.kind === 'kcal' ? 'da_doKcal' : a.action.kind === 'maintain' ? 'da_doMaintain' : 'da_doMode', a.action.kind === 'kcal' ? { d: (a.action.delta > 0 ? '+' : '') + a.action.delta } : a.action.kind === 'mode' ? { mode: t('ds_m_' + a.action.mode) } : {})}</button>}
            </li>
          ))}
          {!r.adjustments.length && <li className="small muted">{t('da_noAdjust')}</li>}
        </ul>
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <Link className="btn sm ghost" to="/goals">{t('da_toCheckin')}</Link>
          <Link className="btn sm ghost" to="/settings#s-strategy">{t('da_toStrategy')}</Link>
        </div>
      </Card>
      {confirm && <Confirm message={confirm.msg} onNo={() => setConfirm(null)} onYes={() => { const c = confirm; setConfirm(null); void c.go(); }} />}
    </div>
  );
}

function BasisTag({ b }: { b: Basis }) {
  const { t } = useApp();
  return <span className={`chip da-basis ${b}`} title={t('da_basis_' + b + '_hint')}>{t('da_basis_' + b)}</span>;
}

function Why({ w }: { w: Reason }) {
  const { t } = useApp();
  const params = w.params?.other ? { ...w.params, other: t('ds_m_' + w.params.other) } : w.params;
  return <li>{t(w.key, params)} <BasisTag b={w.basis} /></li>;
}

function OptionCard({ o, rec, active, onAccept, order, fmt, busy }: { o: StrategyOption; rec?: boolean; active: boolean; onAccept: () => void; order: number[]; fmt: (m: Macros) => string; busy: boolean }) {
  const { t, n } = useApp();
  return (
    <Card title={<>{rec ? <Icon name="sparkle" /> : null}{rec ? t('da_recommended') + ': ' : ''}{t('ds_m_' + o.mode)}</>}>
      <div className="stack" data-testid={rec ? 'adv-recommended' : 'adv-alt-' + o.mode} data-mode={o.mode}>
        <div className="small num bold">{fmt(o.targets)}</div>
        {o.why.length > 0 && <><div className="tiny bold">{t('da_why')}</div><ul className="small da-why">{o.why.map((w, i) => <Why key={i} w={w} />)}</ul></>}
        {o.cycle && (
          <ul className="adherence tiny" data-testid="adv-cycle">
            {order.map((wd) => <li key={wd}><span>{t(WEEKDAY_KEYS[wd])} · {t('ds_l_' + o.cycle!.schedule[wd])}</span><b className="num">{n(o.cycle!.levels[o.cycle!.schedule[wd]].kcal)} · C {n(o.cycle!.levels[o.cycle!.schedule[wd]].carbs)}</b></li>)}
          </ul>
        )}
        {o.cycle && <div className="tiny muted">{CYCLE_LEVELS.map((l) => `${t('ds_l_' + l)}: ${n(o.cycle!.levels[l].kcal)}`).join(' · ')}</div>}
        <div className="grid2 tiny">
          <div><b>{t('da_benefits')}</b><ul className="da-why">{o.pros.map((k) => <li key={k}>{t(k)}</li>)}</ul></div>
          <div><b>{t('da_drawbacks')}</b><ul className="da-why">{o.cons.map((k) => <li key={k}>{t(k)}</li>)}</ul></div>
        </div>
        {active ? <div className="chip good">{t('da_current')}</div>
          : <button className={`btn ${rec ? 'primary' : ''} block`} disabled={busy} onClick={onAccept} data-testid={'adv-accept-' + o.mode}>{rec ? t('da_accept') : t('da_useInstead')}</button>}
      </div>
    </Card>
  );
}

/** Results of the current strategy next to the previous one (from the user's own records over each period). */
function ResultsCard({ cur, prev }: { cur: PeriodResult | null; prev: PeriodResult | null }) {
  const { t, n, d } = useApp();
  const v = (x: number | null, digits = 1, unit = '') => (x === null ? '—' : `${x > 0 && unit !== '%' ? '+' : ''}${n(x, digits)}${unit}`);
  const col = (r: PeriodResult | null) => r ? [
    `${t('ds_m_' + r.period.mode)} · ${d(r.period.start)} → ${r.period.end ? d(r.period.end) : t('today')} (${r.days})`,
    r.ratePerWeek === null ? t('da_res_needWeeks') : `${v(r.ratePerWeek, 2)} kg/${t('da_week')}`,
    v(r.waistChange, 1, ' cm'), `${r.strength.up}↑ · ${r.strength.down}↓`,
    r.hunger === null ? '—' : `${n(r.hunger, 1)}/5`, r.recovery === null ? '—' : `${n(r.recovery, 1)}/5`,
    r.adherencePct === null ? '—' : `${r.adherencePct}%`, r.proteinPct === null ? '—' : `${r.proteinPct}%`
  ] : Array(8).fill('—');
  const rows = ['da_res_period', 'da_res_weight', 'da_res_waist', 'da_res_strength', 'da_res_hunger', 'da_res_recovery', 'da_res_adherence', 'da_res_protein'];
  const a = col(prev), b = col(cur);
  return (
    <Card title={<><Icon name="compare" />{t('da_results')}</>}>
      <div className="table-wrap"><table className="da-table" data-testid="adv-results">
        <thead><tr><th></th><th>{t('da_res_previous')}</th><th>{t('da_res_current')}</th></tr></thead>
        <tbody>{rows.map((k, i) => <tr key={k}><td>{t(k)}</td><td className="num" style={{ whiteSpace: 'normal' }}>{a[i]}</td><td className="num" style={{ whiteSpace: 'normal' }}>{b[i]}</td></tr>)}</tbody>
      </table></div>
      <div className="tiny muted">{t('da_resNote')}</div>
    </Card>
  );
}
