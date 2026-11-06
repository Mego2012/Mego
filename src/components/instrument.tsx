/**
 * MEGO signature components: brand mark, the calorie Dial (a graduated instrument gauge) and meal glyphs.
 * All colours come from CSS tokens so both themes are art-directed in styles.css.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MealType } from '../lib/types';

/** The MEGO mark: a 270° calibrated arc with a target notch — the same geometry as the Dial. */
export function MegoMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" fill="none">
      <circle cx="16" cy="16" r="11.5" stroke="currentColor" strokeOpacity=".22" strokeWidth="3.2" strokeDasharray="54.2 72.3" transform="rotate(135 16 16)" strokeLinecap="round" />
      <circle cx="16" cy="16" r="11.5" stroke="currentColor" strokeWidth="3.2" strokeDasharray="36 72.3" transform="rotate(135 16 16)" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.6" fill="currentColor" />
      <path d="M16 16 L23.2 9.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="brand-mark"><MegoMark /><span className="brand-word">MEGO</span></span>
  );
}

/** Counts a number up when it changes (respects reduced motion). */
export function useCountUp(value: number, ms = 900): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (value === from.current) { setShown(value); return; }
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof requestAnimationFrame === 'undefined') { setShown(value); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      setShown(a + (value - a) * e);
      if (t < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

const CX = 150, CY = 150, R = 118, SWEEP = 270, START = 135; // degrees, clockwise from +x
const polar = (deg: number, r: number) => { const a = (deg * Math.PI) / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };

/**
 * The Dial: consumption against target on a 270° graduated scale (ticks every 5 %, majors every 25 %).
 * Past the target the arc turns to the warning colour and the overflow is drawn as a second lap segment.
 */
export function Dial({ value, max, children, testId }: { value: number; max: number; children: ReactNode; testId?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);
  const ratio = max > 0 ? value / max : 0;
  const pct = mounted ? Math.min(1, Math.max(0, ratio)) : 0;
  const over = ratio > 1;
  const overPct = mounted ? Math.min(1, Math.max(0, ratio - 1)) : 0;
  const C = 2 * Math.PI * R;
  const arcLen = (SWEEP / 360) * C;
  const ticks = [];
  for (let i = 0; i <= 20; i++) {
    const deg = START + (SWEEP * i) / 20;
    const major = i % 5 === 0;
    const [x1, y1] = polar(deg, R + 14);
    const [x2, y2] = polar(deg, R + (major ? 24 : 19));
    ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={major ? 'var(--tick)' : 'var(--tick-faint)'} strokeWidth={major ? 2 : 1.2} strokeLinecap="round" />);
  }
  const [sx, sy] = polar(START, R);
  const [tx1, ty1] = polar(START + SWEEP, R - 12);
  const [tx2, ty2] = polar(START + SWEEP, R + 12);
  return (
    <div className="dial" data-testid={testId} role="img" aria-label={`${Math.round(value)} / ${Math.round(max)}`}>
      <svg viewBox="0 0 300 258">
        <defs>
          <linearGradient id="dialGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--primary-2)" />
          </linearGradient>
          <filter id="dialGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>
        {ticks}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--dial-track)" strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${arcLen} ${C}`} transform={`rotate(${START} ${CX} ${CY})`} />
        <circle className="arc" cx={CX} cy={CY} r={R} fill="none" stroke="var(--glow)" strokeWidth="16" strokeLinecap="round" filter="url(#dialGlow)"
          strokeDasharray={`${arcLen} ${C}`} strokeDashoffset={arcLen * (1 - pct)} transform={`rotate(${START} ${CX} ${CY})`} opacity={pct > 0 ? 0.9 : 0} />
        <circle className="arc" cx={CX} cy={CY} r={R} fill="none" stroke={over ? 'var(--warn)' : 'url(#dialGrad)'} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${arcLen} ${C}`} strokeDashoffset={arcLen * (1 - pct)} transform={`rotate(${START} ${CX} ${CY})`} opacity={pct > 0 ? 1 : 0} />
        {over && <circle className="arc" cx={CX} cy={CY} r={R - 22} fill="none" stroke="var(--danger)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${(SWEEP / 360) * 2 * Math.PI * (R - 22)} ${2 * Math.PI * (R - 22)}`}
          strokeDashoffset={(SWEEP / 360) * 2 * Math.PI * (R - 22) * (1 - overPct)} transform={`rotate(${START} ${CX} ${CY})`} />}
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" />
        {/* the knob rides the arc: rotated from the start position with the same easing as the arc */}
        <g className="needle" style={{ transform: `rotate(${SWEEP * pct}deg)`, opacity: pct > 0.002 ? 1 : 0 }}>
          <circle cx={sx} cy={sy} r="5.5" fill="var(--surface)" stroke={over ? 'var(--warn)' : 'var(--primary)'} strokeWidth="3" />
        </g>
      </svg>
      <div className="readout">{children}</div>
    </div>
  );
}

const MEAL_STYLE: Record<MealType, { bg: string; fg: string }> = {
  breakfast: { bg: 'color-mix(in srgb, var(--carbs) 16%, transparent)', fg: 'var(--carbs)' },
  lunch: { bg: 'color-mix(in srgb, var(--primary) 15%, transparent)', fg: 'var(--primary)' },
  dinner: { bg: 'color-mix(in srgb, var(--fat) 16%, transparent)', fg: 'var(--fat)' },
  snacks: { bg: 'color-mix(in srgb, var(--protein) 15%, transparent)', fg: 'var(--protein)' }
};
const MEAL_PATH: Record<MealType, ReactNode> = {
  breakfast: <><path d="M4 17h16M7 17a5 5 0 0 1 10 0" /><path d="M12 6v3M5.6 9.6l1.8 1.8M18.4 9.6l-1.8 1.8" /></>,
  lunch: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>,
  dinner: <path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5Z" />,
  snacks: <><path d="M12 4c3 2.4 5 5.2 5 8.3A5 5 0 0 1 7 12.3C7 9.2 9 6.4 12 4Z" /><path d="M12 9v8" /></>
};

/** A designed glyph per meal (or the user's own photo when one exists). */
export function MealGlyph({ meal, photo }: { meal: MealType; photo?: string }) {
  const s = MEAL_STYLE[meal];
  return (
    <span className="meal-glyph" style={{ ['--g-bg' as string]: s.bg, ['--g-fg' as string]: s.fg }}>
      {photo ? <img src={photo} alt="" /> : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{MEAL_PATH[meal]}</svg>
      )}
    </span>
  );
}

/** Time-of-day greeting key. */
export function greetingKey(d = new Date()): string {
  const h = d.getHours();
  return h < 5 ? 'greet_night' : h < 12 ? 'greet_morning' : h < 17 ? 'greet_afternoon' : 'greet_evening';
}
