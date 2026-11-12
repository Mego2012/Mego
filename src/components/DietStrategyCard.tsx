import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useTraining } from '../app/hooks';
import { scheduleFromProgram } from '../lib/dietAdvisor';
import {
  computeMacros, CYCLE_LEVELS, cycleWeek, defaultSchedule, DIET_MODES, modeDefaults, strategyTargets,
  type CycleLevel, type DietMode, type DietStrategy
} from '../lib/dietStrategy';
import { WEEKDAY_KEYS } from '../lib/i18n';
import { saveLocalBackup } from '../lib/localBackup';
import { saveSettings } from '../lib/repo';
import { recordStrategyChange } from '../lib/dietHistory';
import type { Macros } from '../lib/types';
import { Icon } from './icons';
import { Card, Confirm, NumField, useAsync } from './ui';

/**
 * Settings → Diet strategy. Choose how the daily calories are split (and, for carb cycling, how they vary by day),
 * preview the result next to the current targets, then apply. Applying changes the daily targets only — food logs,
 * weights, reports and workouts are never touched. The previous targets are kept for "undo".
 */
export function DietStrategyCard() {
  const { t, n, settings } = useApp();
  const { run, busy } = useAsync();
  const active = settings.dietStrategy;
  const cur = settings.targets.training;
  const weight = settings.profile.currentWeight;
  const [mode, setMode] = useState<DietMode>(active?.mode ?? 'flexible');
  const [kcal, setKcal] = useState<number>(cur.kcal);
  const initial = (m: DietMode, k: number) => (active && active.mode === m ? { protein: active.protein, carbs: active.carbs, fat: active.fat } : m === 'flexible' || m === 'custom' ? { protein: cur.protein, carbs: cur.carbs, fat: cur.fat } : modeDefaults(m, k, weight, cur));
  const [v, setV] = useState(() => initial(mode, kcal));
  const [schedule, setSchedule] = useState<CycleLevel[]>(active?.cycle?.schedule ?? defaultSchedule(settings.trainingWeekdays, settings.weekStartsOn));
  const [overrides, setOverrides] = useState<Partial<Record<CycleLevel, Macros>>>(active?.cycle?.overrides ?? {});
  const [confirm, setConfirm] = useState<'apply' | 'undo' | null>(null);

  const pick = (m: DietMode) => { setMode(m); setV(initial(m, kcal)); };
  const training = useTraining();
  const result = useMemo(() => (mode === 'carb_cycling' ? computeMacros('flexible', kcal, { protein: v.protein, carbs: 0, fat: Math.round(kcal * 0.25 / 9) }, weight) : computeMacros(mode, kcal, v, weight)), [mode, kcal, v, weight]);
  const week = useMemo(() => (mode === 'carb_cycling' ? cycleWeek(kcal, v.protein, schedule, overrides) : null), [mode, kcal, v.protein, schedule, overrides]);
  const levels = week?.levels ?? null;
  const program = training ? training.programs.find((p) => p.id === training.activeId) ?? training.programs[0] : undefined;
  const next: Macros = mode === 'carb_cycling' ? strategyTargets({ mode, kcal, protein: v.protein, carbs: 0, fat: 0, appliedAt: 0 }) : result!.macros;
  const order = Array.from({ length: 7 }, (_, i) => (settings.weekStartsOn + i) % 7);
  const fmt = (m: Macros) => `${n(m.kcal)} ${t('kcalUnit')} · ${t('protein')} ${n(m.protein)} · ${t('carbs')} ${n(m.carbs)} · ${t('fat')} ${n(m.fat)} ${t('g')}`;
  const pct = (m: Macros, k: 'protein' | 'carbs' | 'fat') => Math.round(((k === 'fat' ? 9 : 4) * m[k] * 100) / Math.max(m.kcal, 1));
  // which fields the user sets for this mode (the others balance automatically)
  const editP = true, editC = mode === 'low_carb' || mode === 'keto' || mode === 'custom', editF = mode === 'flexible' || mode === 'high_protein' || mode === 'custom';

  const apply = () => run(async () => {
    await saveLocalBackup('manual');
    const strat: DietStrategy = {
      mode, kcal: next.kcal, protein: v.protein, carbs: mode === 'carb_cycling' ? next.carbs : next.carbs, fat: next.fat, appliedAt: Date.now(),
      previousTargets: active?.previousTargets ?? settings.targets,
      ...(mode === 'carb_cycling' ? { cycle: { schedule, ...(Object.keys(overrides).length ? { overrides } : {}) } } : {})
    };
    await saveSettings((s) => { s.dietStrategy = strat; s.targets = { training: { ...next }, rest: { ...next } }; });
    await recordStrategyChange(mode, next.kcal);
  }, t('saved'));
  const undo = () => run(async () => {
    const prev = active?.previousTargets;
    await saveLocalBackup('manual');
    await saveSettings((s) => { if (prev) s.targets = prev; delete s.dietStrategy; });
    await recordStrategyChange('none', prev?.training.kcal ?? cur.kcal);
  }, t('saved'));

  return (
    <Card title={<><Icon name="target" />{t('ds_title')}</>}>
      <div className="stack" data-testid="diet-strategy">
        <div className="tiny muted">{t('ds_intro')}</div>
        {active && <div className="banner info small" data-testid="ds-active">{t('ds_active', { mode: t('ds_m_' + active.mode) })}</div>}

        <div className="ds-modes" role="radiogroup" aria-label={t('ds_title')}>
          {DIET_MODES.map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={`ds-mode ${mode === m ? 'on' : ''}`} onClick={() => pick(m)} data-testid={'ds-mode-' + m}>
              <b>{t('ds_m_' + m)}</b><span className="tiny muted">{t('ds_s_' + m)}</span>
            </button>
          ))}
        </div>
        <div className="small" data-testid="ds-explain">{t('ds_x_' + mode)}</div>

        <div className="grid2">
          {mode !== 'custom' && <NumField label={t(mode === 'carb_cycling' ? 'ds_kcalAvg' : 'ds_kcal')} value={kcal} onChange={(x) => setKcal(Number(x) || 0)} testId="ds-kcal" />}
          {editP && <NumField label={`${t('protein')} (${t('g')}) · ${n(v.protein / Math.max(weight, 1), 1)} ${t('g')}/kg`} value={v.protein} onChange={(x) => setV({ ...v, protein: Number(x) || 0 })} testId="ds-protein" />}
          {editC && <NumField label={`${t('carbs')} (${t('g')})`} value={v.carbs} onChange={(x) => setV({ ...v, carbs: Number(x) || 0 })} testId="ds-carbs" />}
          {editF && <NumField label={`${t('fat')} (${t('g')})`} value={v.fat} onChange={(x) => setV({ ...v, fat: Number(x) || 0 })} testId="ds-fat" />}
        </div>
        {mode !== 'custom' && mode !== 'carb_cycling' && <div className="tiny muted">{t(editC ? 'ds_fatBalances' : 'ds_carbsBalance')}</div>}

        {mode === 'carb_cycling' && levels && (
          <div className="stack" data-testid="ds-cycle">
            <div className="row between"><div className="small bold">{t('ds_schedule')}</div>
              <button className="btn sm ghost" onClick={() => setSchedule(scheduleFromProgram(program, settings.trainingWeekdays, settings.weekStartsOn))} data-testid="ds-from-program">{t('ds_fromProgram')}</button></div>
            <div className="tiny muted">{t('ds_scheduleHint')}</div>
            <div className="ds-week">
              {order.map((wd) => (
                <label key={wd} className="field"><span>{t(WEEKDAY_KEYS[wd])}</span>
                  <select className="input" value={schedule[wd]} data-testid={'ds-day-' + wd} onChange={(e) => { const s = [...schedule]; s[wd] = e.target.value as CycleLevel; setSchedule(s); }}>
                    {CYCLE_LEVELS.map((l) => <option key={l} value={l}>{t('ds_l_' + l)}</option>)}
                  </select></label>
              ))}
            </div>
            <div className="small bold">{t('ds_levelTargets')}</div>
            <ul className="list" data-testid="ds-levels">
              {CYCLE_LEVELS.map((l) => (
                <li key={l}><span className="grow small"><b>{t('ds_l_' + l)}</b>{overrides[l] ? ` · ${t('ds_manual')}` : ''}<br /><span className="tiny num">{fmt(levels[l])}</span></span>
                  <button className="btn sm ghost" onClick={() => setOverrides((o) => { const c = { ...o }; if (c[l]) delete c[l]; else c[l] = { ...levels[l] }; return c; })} data-testid={'ds-ovr-' + l}>{overrides[l] ? t('ds_auto') : t('edit')}</button>
                  {overrides[l] && (
                    <div className="grid2" style={{ width: '100%' }}>
                      {(['protein', 'carbs', 'fat'] as const).map((k) => <NumField key={k} label={`${t(k)} (${t('g')})`} value={overrides[l]![k]} onChange={(x) => setOverrides((o) => { const m = { ...o[l]!, [k]: Number(x) || 0 }; m.kcal = 4 * m.protein + 4 * m.carbs + 9 * m.fat; return { ...o, [l]: m }; })} />)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="small bold">{t('ds_weekPreview')}</div>
            <ul className="adherence" data-testid="ds-week-preview">
              {order.map((wd) => <li key={wd}><span>{t(WEEKDAY_KEYS[wd])} · {t('ds_l_' + schedule[wd])}</span><b className="num small">{n(levels[schedule[wd]].kcal)} · C {n(levels[schedule[wd]].carbs)} · F {n(levels[schedule[wd]].fat)}</b></li>)}
            </ul>
            <div className="tiny muted">{t('ds_cycleNote', { avg: n(Math.round(order.reduce((a, wd) => a + levels[schedule[wd]].kcal, 0) / 7)) })}</div>
            <div className={`banner small ${week!.aligned ? 'info' : 'offline'}`} data-testid="ds-week-total">{t(week!.aligned ? 'ds_weekAligned' : 'ds_weekNotAligned', { week: n(week!.weeklyKcal), target: n(week!.weeklyTarget) })}</div>
          </div>
        )}

        <div className="ds-preview" data-testid="ds-preview">
          <div><span className="tiny muted">{t('ds_current')}</span><div className="small num">{fmt(cur)}</div></div>
          <div><span className="tiny muted">{t(mode === 'carb_cycling' ? 'ds_newBase' : 'ds_new')}</span><div className="small num bold" data-testid="ds-new">{fmt(next)}</div>
            <div className="tiny muted num">{t('protein')} {pct(next, 'protein')}% · {t('carbs')} {pct(next, 'carbs')}% · {t('fat')} {pct(next, 'fat')}% · {t('ds_check', { sum: n(4 * next.protein + 4 * next.carbs + 9 * next.fat) })}</div></div>
        </div>
        {result?.warnings.map((w) => <div key={w} className="banner offline small" data-testid="ds-warning">{t(w)}</div>)}

        <div className="row" style={{ gap: 8 }}>
          {active && <button className="btn" disabled={busy} onClick={() => setConfirm('undo')} data-testid="ds-undo">{t('ds_undo')}</button>}
          <button className="btn primary grow" disabled={busy || next.kcal <= 0} onClick={() => setConfirm('apply')} data-testid="ds-apply">{t('ds_apply')}</button>
        </div>
        <div className="tiny muted">{t('ds_safe')}</div>
      </div>
      {confirm === 'apply' && <Confirm message={t('ds_confirm', { mode: t('ds_m_' + mode), cur: fmt(cur), next: fmt(next) })} onNo={() => setConfirm(null)} onYes={() => { setConfirm(null); apply(); }} />}
      {confirm === 'undo' && <Confirm message={t('ds_confirmUndo', { prev: active?.previousTargets ? fmt(active.previousTargets.training) : '—' })} onNo={() => setConfirm(null)} onYes={() => { setConfirm(null); undo(); }} />}
    </Card>
  );
}
