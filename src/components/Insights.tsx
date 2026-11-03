import { useApp } from '../app/AppContext';
import type { Insight } from '../lib/insights';

export function InsightList({ items, limit }: { items: Insight[]; limit?: number }) {
  const { t, n } = useApp();
  const fmt = (p: Insight['params']) =>
    Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'number' ? n(v, Math.abs(v) < 10 && !Number.isInteger(v) ? 2 : 0) : v]));
  return (
    <div data-testid="insights">
      {(limit ? items.slice(0, limit) : items).map((i, idx) => (
        <div key={idx} className={`insight ${i.level}`} data-insight={i.key}>
          <span className="ico">{i.level === 'good' ? '✓' : i.level === 'warn' ? '!' : 'i'}</span>
          <span>{t('insights.' + i.key, fmt(i.params))}</span>
        </div>
      ))}
    </div>
  );
}
