/**
 * Applying Diet Advisor suggestions — only ever called after the user confirmed in the UI. Each action saves a local
 * backup first and changes settings only (targets / strategy / goal); food logs, weights, reports and workouts are
 * never touched. The targets saved before the first strategy are kept so "Undo strategy" can restore them.
 */
import type { StrategyOption } from './dietAdvisor';
import { computeMacros, rebalance } from './dietStrategy';
import { saveLocalBackup } from './localBackup';
import { saveSettings } from './repo';
import { recordStrategyChange } from './dietHistory';

export async function applyDietOption(opt: StrategyOption) {
  await saveLocalBackup('manual');
  await saveSettings((s) => {
    const keep = opt.mode === 'custom';
    s.dietStrategy = { ...opt.strategy, appliedAt: Date.now(), previousTargets: s.dietStrategy?.previousTargets ?? s.targets };
    if (!keep) s.targets = { training: { ...opt.targets }, rest: { ...opt.targets } };
  });
  await recordStrategyChange(opt.mode, opt.targets.kcal);
}

/** Calorie change through the active strategy (keto keeps its carbs, flexible keeps its fat …). */
export async function applyKcalDelta(delta: number) {
  await saveLocalBackup('manual');
  await saveSettings((s) => {
    const adj = (m: typeof s.targets.training) => {
      const next = { ...m, kcal: m.kcal + delta, carbs: Math.max(0, Math.round(m.carbs + delta / 4)) };
      return s.dietStrategy ? rebalance(s.dietStrategy, next) : next;
    };
    s.targets = { training: adj(s.targets.training), rest: adj(s.targets.rest) };
    if (s.dietStrategy && s.dietStrategy.mode !== 'custom') s.dietStrategy = { ...s.dietStrategy, kcal: s.targets.training.kcal };
  });
  await recordCurrent();
}

/** Target reached: switch the goal to maintenance at the estimated maintenance calories. */
export async function applyMaintenance(kcal: number, protein: number) {
  await saveLocalBackup('manual');
  await saveSettings((s) => {
    s.profile = { ...s.profile, goalType: 'maintain' };
    const base = computeMacros('flexible', kcal, { protein, carbs: 0, fat: Math.round((kcal * 0.25) / 9) }).macros;
    const m = s.dietStrategy ? rebalance(s.dietStrategy, base) : base;
    s.targets = { training: m, rest: m };
    if (s.dietStrategy && s.dietStrategy.mode !== 'custom') s.dietStrategy = { ...s.dietStrategy, kcal: m.kcal, protein: m.protein };
  });
  await recordCurrent();
}

/** A calorie change starts a new evaluation period (same strategy), so its effect is judged before the next change. */
async function recordCurrent() {
  const { getSettings } = await import('./repo');
  const s = await getSettings();
  await recordStrategyChange(s.dietStrategy?.mode ?? 'none', s.targets.training.kcal);
}
