import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import type { EnergyBreakdown } from '../lib/energy';
import { Icon } from './icons';
import { Card } from './ui';

/** Transparent breakdown: base → cardio → extra allowed → adjusted target → eaten → remaining, with the reasons. */
export function EnergyCard({ e }: { e: EnergyBreakdown }) {
  const { t, n } = useApp();
  const [why, setWhy] = useState(false);
  const rows: [string, string, string?][] = [
    ['en_base', n(e.base), 'en-base'],
    ['en_cardio', e.cardioKcal ? `≈ ${n(e.cardioKcal)}` : '0', 'en-cardio'],
    ['en_allowed', `+${n(e.allowed)}`, 'en-allowed'],
    ['en_adjusted', n(e.adjusted), 'en-adjusted'],
    ['en_consumed', n(e.consumed), 'en-consumed'],
    ['en_remaining', n(e.remaining), 'en-remaining']
  ];
  return (
    <Card title={<><Icon name="pulse" />{t('en_title')}</>} actions={<Link className="btn sm ghost" to="/cardio">{t('nav_cardio')}</Link>}>
      <ul className="adherence energy-rows" data-testid="energy-card">
        {rows.map(([k, v, id]) => (
          <li key={k} className={k === 'en_adjusted' || k === 'en_remaining' ? 'bold' : ''}><span>{t(k)}</span><b className="num" data-testid={id}>{v}</b></li>
        ))}
      </ul>
      <button className="btn sm ghost" onClick={() => setWhy((x) => !x)} data-testid="en-why" aria-expanded={why}>{t('en_why')}</button>
      {why && <EnergyReasons e={e} />}
    </Card>
  );
}

export function EnergyReasons({ e }: { e: EnergyBreakdown }) {
  const { t } = useApp();
  return (
    <ul className="small energy-why" data-testid="en-reasons">
      {e.reasons.map((r, i) => <li key={i}>{t(r.key, { ...(r.params ?? {}), ...(r.params?.level ? { level: t('act_' + r.params.level) } : {}) })}</li>)}
    </ul>
  );
}
