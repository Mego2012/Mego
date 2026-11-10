/**
 * Custom MEGO charts (SVG, drawn to scale, theme tokens only). Replaces the generic chart library.
 * Time runs in reading direction: left→right in English, right→left in Arabic.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import type { DaySummary } from '../lib/reports';

const W = 340, PAD_L = 34, PAD_R = 8, PAD_T = 14, PAD_B = 22;

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(id); }, []);
  return m;
}

/** "Nice" axis maximum and 3–4 gridlines that the chart actually reaches. */
function niceScale(max: number): { top: number; steps: number[] } {
  if (!(max > 0)) return { top: 1, steps: [0] };
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const steps: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) steps.push(Math.round(v * 100) / 100);
  return { top, steps };
}

export function CaloriesChart({ days }: { days: DaySummary[]; target?: number }) {
  const { t, d, n, dir } = useApp();
  const mounted = useMounted();
  const H = 190;
  const ordered = dir === 'rtl' ? [...days].reverse() : days;
  const max = Math.max(1, ...days.map((x) => Math.max(x.totals.kcal, x.target.kcal)));
  const { top, steps } = niceScale(max * 1.05);
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH * (1 - v / top);
  const slot = (W - PAD_L - PAD_R) / Math.max(1, ordered.length);
  const bw = Math.min(26, slot * 0.56);
  const xOf = (i: number) => (dir === 'rtl' ? PAD_R : PAD_L) + slot * i + slot / 2;
  const today = days[days.length - 1]?.date;
  const target = days.length ? days[days.length - 1].target.kcal : 0;
  return (
    <div className="vchart" data-testid="calories-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dailyCalories')}>
        <defs>
          <pattern id="partialStripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="color-mix(in srgb, var(--warn) 30%, transparent)" /><rect width="3" height="6" fill="var(--warn)" />
          </pattern>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--primary-2)" /><stop offset="1" stopColor="var(--primary)" /></linearGradient>
        </defs>
        {steps.map((v) => (
          <g key={v}>
            <line x1={PAD_L - (dir === 'rtl' ? PAD_L - PAD_R : 0)} x2={W - (dir === 'rtl' ? PAD_L : PAD_R)} y1={y(v)} y2={y(v)} stroke="var(--hairline)" strokeWidth="1" />
            <text className="lbl" x={dir === 'rtl' ? W - 2 : 2} y={y(v) + 3.5} textAnchor={dir === 'rtl' ? 'end' : 'start'}>{n(v)}</text>
          </g>
        ))}
        {ordered.map((x, i) => {
          const v = x.status === 'empty' ? 0 : x.totals.kcal;
          const h = mounted ? plotH * (v / top) : 0;
          const isToday = x.date === today;
          const fill = x.status === 'complete' ? 'url(#barGrad)' : x.status === 'partial' ? 'url(#partialStripe)' : 'var(--surface-3)';
          return (
            <g key={x.date}>
              {x.status === 'empty'
                ? <rect x={xOf(i) - bw / 2} y={y(0) - 3} width={bw} height="3" rx="1.5" fill="var(--surface-3)" />
                : <rect className="bar-rect" x={xOf(i) - bw / 2} y={y(0) - h} width={bw} height={h} rx="5" fill={fill} opacity={isToday || x.status === 'complete' ? 1 : 0.85} />}
              <text className="lbl" x={xOf(i)} y={H - 6} textAnchor="middle" style={isToday ? { fill: 'var(--text)', fontWeight: 600 } : undefined}>
                {d(x.date, ordered.length <= 7 ? { weekday: 'narrow' } : { day: 'numeric' })}
              </text>
              {isToday && v > 0 && <text className="val" x={xOf(i)} y={y(0) - h - 5} textAnchor="middle">{n(v)}</text>}
            </g>
          );
        })}
        {target > 0 && (
          <g>
            <line x1={dir === 'rtl' ? PAD_R : PAD_L} x2={dir === 'rtl' ? W - PAD_L : W - PAD_R} y1={y(target)} y2={y(target)} stroke="var(--text)" strokeOpacity=".55" strokeWidth="1.2" strokeDasharray="4 4" />
          </g>
        )}
      </svg>
      <div className="legend">
        <span><i style={{ ['--c' as string]: 'var(--primary)' }} />{t('status_complete')}</span>
        <span><i style={{ ['--c' as string]: 'var(--warn)' }} />{t('status_partial')}</span>
        <span><i style={{ ['--c' as string]: 'var(--text)', height: 2, borderRadius: 0 }} />{t('target')}</span>
      </div>
    </div>
  );
}

export function MacrosChart({ days }: { days: DaySummary[] }) {
  const { t, d, n, dir } = useApp();
  const mounted = useMounted();
  const H = 190;
  const ordered = dir === 'rtl' ? [...days].reverse() : days;
  const kcalOf = (x: DaySummary) => x.totals.protein * 4 + x.totals.carbs * 4 + x.totals.fat * 9;
  const max = Math.max(1, ...days.map(kcalOf));
  const { top, steps } = niceScale(max * 1.05);
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH * (1 - v / top);
  const slot = (W - PAD_L - PAD_R) / Math.max(1, ordered.length);
  const bw = Math.min(22, slot * 0.5);
  const xOf = (i: number) => (dir === 'rtl' ? PAD_R : PAD_L) + slot * i + slot / 2;
  return (
    <div className="vchart" data-testid="macros-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('macroSplit')}>
        {steps.map((v) => (
          <g key={v}>
            <line x1={dir === 'rtl' ? PAD_R : PAD_L} x2={dir === 'rtl' ? W - PAD_L : W - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--hairline)" />
            <text className="lbl" x={dir === 'rtl' ? W - 2 : 2} y={y(v) + 3.5} textAnchor={dir === 'rtl' ? 'end' : 'start'}>{n(v)}</text>
          </g>
        ))}
        {ordered.map((x, i) => {
          if (x.status === 'empty') return <text key={x.date} className="lbl" x={xOf(i)} y={H - 6} textAnchor="middle">{d(x.date, ordered.length <= 7 ? { weekday: 'narrow' } : { day: 'numeric' })}</text>;
          const parts = [['protein', x.totals.protein * 4], ['carbs', x.totals.carbs * 4], ['fat', x.totals.fat * 9]] as const;
          let acc = 0;
          return (
            <g key={x.date}>
              {parts.map(([k, v]) => {
                const h = mounted ? plotH * (v / top) : 0;
                const yy = y(0) - (mounted ? plotH * (acc / top) : 0) - h;
                acc += v;
                return <rect key={k} className="bar-rect" x={xOf(i) - bw / 2} y={yy} width={bw} height={Math.max(0, h - 1)} rx="3" fill={`var(--${k})`} />;
              })}
              <text className="lbl" x={xOf(i)} y={H - 6} textAnchor="middle">{d(x.date, ordered.length <= 7 ? { weekday: 'narrow' } : { day: 'numeric' })}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {(['protein', 'carbs', 'fat'] as const).map((k) => <span key={k}><i style={{ ['--c' as string]: `var(--${k})` }} />{t(k)} ({t('kcalUnit')})</span>)}
      </div>
    </div>
  );
}

/** Weight (or waist) over time: daily points + smoothed 7-day average + optional target line. */
export function WeightChart({ points, avg, target }: { points: { date: string; weight?: number | null; avg?: number | null }[]; avg?: boolean; target?: number }) {
  const { t, d, n, dir } = useApp();
  const mounted = useMounted();
  const H = 200;
  const vals = useMemo(() => points.flatMap((p) => [p.weight, p.avg]).filter((v): v is number => typeof v === 'number').concat(target && points.length ? [target] : []), [points, target]);
  if (!vals.length) return null;
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const span = Math.max(1, hi - lo);
  const step = span <= 4 ? 1 : span <= 10 ? 2 : 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH * (1 - (v - lo) / span);
  const x0 = dir === 'rtl' ? PAD_R : PAD_L, x1 = dir === 'rtl' ? W - PAD_L : W - PAD_R;
  const xOf = (i: number) => (points.length <= 1 ? (x0 + x1) / 2 : dir === 'rtl' ? x1 - ((x1 - x0) * i) / (points.length - 1) : x0 + ((x1 - x0) * i) / (points.length - 1));
  const path = (key: 'weight' | 'avg') => points.map((p, i) => (typeof p[key] === 'number' ? [xOf(i), y(p[key] as number)] : null)).filter(Boolean)
    .map((pt, i) => `${i ? 'L' : 'M'}${pt![0].toFixed(1)},${pt![1].toFixed(1)}`).join(' ');
  const avgPath = avg ? path('avg') : '';
  const last = [...points].reverse().find((p) => typeof (avg ? p.avg : p.weight) === 'number');
  const lastIdx = last ? points.indexOf(last) : -1;
  const lastVal = last ? ((avg ? last.avg : last.weight) as number) : null;
  return (
    <div className="vchart" data-testid="weight-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dailyWeight')}>
        <defs>
          <linearGradient id="wArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity=".22" /><stop offset="1" stopColor="var(--primary)" stopOpacity="0" /></linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} stroke="var(--hairline)" />
            <text className="lbl" x={dir === 'rtl' ? W - 2 : 2} y={y(v) + 3.5} textAnchor={dir === 'rtl' ? 'end' : 'start'}>{n(v)}</text>
          </g>
        ))}
        {target ? <><line x1={x0} x2={x1} y1={y(target)} y2={y(target)} stroke="var(--good)" strokeDasharray="5 4" strokeWidth="1.3" /><text className="lbl" x={dir === 'rtl' ? x0 + 2 : x1 - 2} y={y(target) - 4} textAnchor={dir === 'rtl' ? 'start' : 'end'} style={{ fill: 'var(--good)' }}>{t('target')} {n(target, 1)}</text></> : null}
        {points.map((p, i) => typeof p.weight === 'number' && <circle key={p.date} cx={xOf(i)} cy={y(p.weight)} r="2.6" fill="var(--faint)" opacity={mounted ? 1 : 0} style={{ transition: 'opacity .6s' }} />)}
        {avgPath && <>
          <path d={`${avgPath} L${xOf(lastIdx).toFixed(1)},${(H - PAD_B).toFixed(1)} L${xOf(points.findIndex((p) => typeof p.avg === 'number')).toFixed(1)},${(H - PAD_B).toFixed(1)} Z`} fill="url(#wArea)" opacity={mounted ? 1 : 0} style={{ transition: 'opacity .8s' }} />
          <path d={avgPath} fill="none" stroke="var(--primary)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={mounted ? 0 : 1} style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)' }} />
        </>}
        {!avg && <path d={path('weight')} fill="none" stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
        {lastVal !== null && lastIdx >= 0 && <>
          <circle cx={xOf(lastIdx)} cy={y(lastVal)} r="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.6" />
          <text className="val" x={xOf(lastIdx)} y={y(lastVal) - 9} textAnchor="middle">{n(lastVal, 1)}</text>
        </>}
        {points.length > 1 && [0, points.length - 1].map((i) => (
          <text key={i} className="lbl" x={xOf(i)} y={H - 6} textAnchor="middle">{d(points[i].date, { day: 'numeric', month: 'short' })}</text>
        ))}
      </svg>
      {avg && <div className="legend"><span><i style={{ ['--c' as string]: 'var(--faint)', borderRadius: '50%' }} />{t('dailyWeight')}</span><span><i style={{ ['--c' as string]: 'var(--primary)', height: 3 }} />{t('sevenDayAvg')}</span></div>}
    </div>
  );
}

/** Cardio minutes per day (bars). Same axis rules as the calorie chart; time follows reading direction. */
export function MinutesChart({ days, label, testId }: { days: { date: string; minutes: number }[]; label: string; testId?: string }) {
  const { d, n, dir } = useApp();
  const mounted = useMounted();
  const H = 150;
  const ordered = dir === 'rtl' ? [...days].reverse() : days;
  const { top, steps } = niceScale(Math.max(10, ...days.map((x) => x.minutes)) * 1.05);
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH * (1 - v / top);
  const slot = (W - PAD_L - PAD_R) / Math.max(1, ordered.length);
  const bw = Math.max(3, Math.min(24, slot * 0.6));
  const xOf = (i: number) => (dir === 'rtl' ? PAD_R : PAD_L) + slot * i + slot / 2;
  const last = days[days.length - 1]?.date;
  const every = ordered.length > 10 ? 5 : 1;
  return (
    <div className="vchart" data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {steps.map((v) => (
          <g key={v}>
            <line x1={dir === 'rtl' ? PAD_R : PAD_L} x2={dir === 'rtl' ? W - PAD_L : W - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--hairline)" strokeWidth="1" />
            <text className="lbl" x={dir === 'rtl' ? W - 2 : 2} y={y(v) + 3.5} textAnchor={dir === 'rtl' ? 'end' : 'start'}>{n(v)}</text>
          </g>
        ))}
        {ordered.map((x, i) => {
          const h = mounted ? plotH * (x.minutes / top) : 0;
          const idx = dir === 'rtl' ? ordered.length - 1 - i : i;
          const showLabel = ordered.length <= 10 || (ordered.length - 1 - idx) % every === 0;
          return (
            <g key={x.date}>
              {x.minutes > 0
                ? <rect className="bar-rect" x={xOf(i) - bw / 2} y={y(0) - h} width={bw} height={h} rx={Math.min(5, bw / 2)} fill="var(--info)" />
                : <rect x={xOf(i) - bw / 2} y={y(0) - 2} width={bw} height="2" rx="1" fill="var(--surface-3)" />}
              {showLabel && <text className="lbl" x={xOf(i)} y={H - 6} textAnchor="middle" style={x.date === last ? { fill: 'var(--text)', fontWeight: 600 } : undefined}>
                {d(x.date, ordered.length <= 7 ? { weekday: 'narrow' } : { day: 'numeric' })}
              </text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
