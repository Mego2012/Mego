import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { cycleDay } from '../lib/dietStrategy';
import type { DayLog } from '../lib/types';

/** Shows the active diet strategy (and, for carb cycling, the level of this day); opens Settings → Diet strategy. */
export function StrategyChip({ date, log }: { date: string; log?: DayLog }) {
  const { t, settings } = useApp();
  const s = settings.dietStrategy;
  if (!s) return null;
  const c = cycleDay(date, settings, log);
  return (
    <Link className="chip clickable" to="/settings#s-strategy" data-testid="strategy-chip">
      {t('ds_m_' + s.mode)}{c ? ` · ${t('ds_l_' + c.level)}` : ''}
    </Link>
  );
}
