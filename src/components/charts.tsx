import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../app/AppContext';
import type { DaySummary } from '../lib/reports';

const axis = { fontSize: 11, fill: 'var(--muted)' } as const;
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text)' };

function useAxisProps() {
  const { dir } = useApp();
  return { reversed: dir === 'rtl', yOrient: (dir === 'rtl' ? 'right' : 'left') as 'right' | 'left' };
}

export function CaloriesChart({ days, target }: { days: DaySummary[]; target?: number }) {
  const { t, d } = useApp();
  const ax = useAxisProps();
  const data = days.map((x) => ({
    label: d(x.date, { day: 'numeric', ...(days.length <= 7 ? { weekday: 'short' } : {}) }),
    kcal: x.status === 'empty' ? null : x.totals.kcal,
    partial: x.status === 'partial' ? x.totals.kcal : null,
    complete: x.status === 'complete' ? x.totals.kcal : null,
    target: x.target.kcal
  }));
  return (
    <div className="chart" data-testid="calories-chart">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={axis} reversed={ax.reversed} interval="preserveStartEnd" />
          <YAxis tick={axis} orientation={ax.yOrient} width={38} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="complete" name={t('status_complete')} fill="var(--kcal)" radius={[5, 5, 0, 0]} stackId="a" />
          <Bar dataKey="partial" name={t('status_partial')} fill="var(--warn)" radius={[5, 5, 0, 0]} stackId="a" />
          <Line dataKey="target" name={t('target')} stroke="var(--danger)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} type="stepAfter" />
          {target ? <ReferenceLine y={target} stroke="transparent" /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MacrosChart({ days }: { days: DaySummary[] }) {
  const { t, d } = useApp();
  const ax = useAxisProps();
  const data = days.map((x) => ({
    label: d(x.date, { day: 'numeric', ...(days.length <= 7 ? { weekday: 'short' } : {}) }),
    protein: x.status === 'empty' ? null : x.totals.protein,
    carbs: x.status === 'empty' ? null : x.totals.carbs,
    fat: x.status === 'empty' ? null : x.totals.fat
  }));
  return (
    <div className="chart" data-testid="macros-chart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={axis} reversed={ax.reversed} interval="preserveStartEnd" />
          <YAxis tick={axis} orientation={ax.yOrient} width={38} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="protein" name={t('protein')} fill="var(--protein)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="carbs" name={t('carbs')} fill="var(--carbs)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="fat" name={t('fat')} fill="var(--fat)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeightChart({ points, avg, target }: { points: { date: string; weight?: number | null; avg?: number | null }[]; avg?: boolean; target?: number }) {
  const { t, d } = useApp();
  const ax = useAxisProps();
  const data = points.map((p) => ({ ...p, label: d(p.date, { day: 'numeric', month: 'short' }) }));
  const vals = points.flatMap((p) => [p.weight, p.avg]).filter((v): v is number => typeof v === 'number');
  const min = vals.length ? Math.floor(Math.min(...vals) - 0.5) : 0;
  const max = vals.length ? Math.ceil(Math.max(...vals) + 0.5) : 100;
  return (
    <div className="chart" data-testid="weight-chart">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={axis} reversed={ax.reversed} interval="preserveStartEnd" />
          <YAxis tick={axis} orientation={ax.yOrient} width={38} domain={[min, max]} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line dataKey="weight" name={t('dailyWeight')} stroke="var(--muted)" strokeWidth={1} dot={{ r: 2.5 }} connectNulls />
          {avg && <Line dataKey="avg" name={t('sevenDayAvg')} stroke="var(--primary)" strokeWidth={2.5} dot={false} connectNulls />}
          {target ? <ReferenceLine y={target} stroke="var(--good)" strokeDasharray="4 4" /> : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
