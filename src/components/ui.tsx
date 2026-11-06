import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import { addDays, today } from '../lib/dates';
import type { FoodState, Macros } from '../lib/types';
import { Icon } from './icons';

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar ${value > max ? 'over' : ''}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={Math.round(max)}>
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Ring({ value, max, size = 150, stroke = 14, color = 'var(--kcal)', children }: { value: number; max: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = value > max;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over ? 'var(--danger)' : color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} style={{ transition: 'stroke-dasharray .4s' }} />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

type CoreKey = 'kcal' | 'protein' | 'carbs' | 'fat';
const MACRO_COLORS: Record<CoreKey, string> = { kcal: 'var(--kcal)', protein: 'var(--protein)', carbs: 'var(--carbs)', fat: 'var(--fat)' };

/** Consumed / target with remaining (or over) for each macro. */
export function MacroBars({ totals, target, keys = ['protein', 'carbs', 'fat'] }: { totals: Macros; target: Macros; keys?: CoreKey[] }) {
  const { t, n } = useApp();
  return (
    <div className="stack">
      {keys.map((k) => {
        const left = target[k] - totals[k];
        const unit = k === 'kcal' ? t('kcalUnit') : t('g');
        return (
          <div key={k} className="macro-row" data-macro={k}>
            <span className="small bold" style={{ color: MACRO_COLORS[k] }}>{t(k)}</span>
            <span className="small num">
              <b>{n(totals[k], k === 'kcal' ? 0 : 1)}</b> / {n(target[k])} {unit}
            </span>
            <ProgressBar value={totals[k]} max={target[k]} color={MACRO_COLORS[k]} />
            <span className={`tiny num ${left < 0 ? 'delta pos' : 'muted'}`} style={{ gridColumn: '1 / -1' }} data-testid={`remaining-${k}`}>
              {left >= 0 ? `${t('remainingShort')} ${n(left, k === 'kcal' ? 0 : 1)} ${unit}` : `${t('overShort')} ${n(-left, k === 'kcal' ? 0 : 1)} ${unit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Fiber / sugar / sodium line — only shown for nutrients that have data. */
export function OptionalNutrientsLine({ m, coverage, total }: { m: Macros; coverage?: Record<string, number>; total?: number }) {
  const { t, n } = useApp();
  const parts = (['fiber', 'sugar', 'satFat', 'sodium'] as const).filter((k) => typeof m[k] === 'number' && (coverage ? coverage[k] > 0 : true));
  if (!parts.length) return null;
  return (
    <div className="tiny muted num">
      {parts.map((k) => `${t(k)} ${n(m[k], k === 'sodium' ? 0 : 1)}${k === 'sodium' ? t('mg') : t('g')}${coverage && total && coverage[k] < total ? ` (${coverage[k]}/${total})` : ''}`).join(' · ')}
    </div>
  );
}

export function MacroLine({ m, compact }: { m: Macros; compact?: boolean }) {
  const { t, n } = useApp();
  if (compact)
    return (
      <span className="tiny muted num">
        {t('pShort')} {n(m.protein, 1)} · {t('cShort')} {n(m.carbs, 1)} · {t('fShort')} {n(m.fat, 1)}
      </span>
    );
  return (
    <span className="small muted num">
      {t('protein')} {n(m.protein, 1)}{t('g')} · {t('carbs')} {n(m.carbs, 1)}{t('g')} · {t('fat')} {n(m.fat, 1)}{t('g')}
    </span>
  );
}

export function StateChip({ state, label }: { state: FoodState; label?: string }) {
  const { t } = useApp();
  return <span className={`chip ${state}`} title={label}>{t('state_' + state)}</span>;
}

/**
 * Reference-counted page scroll lock. Each open sheet holds one lock; the page unlocks only when the last
 * one closes — regardless of the order in which nested sheets unmount (the old save/restore approach could
 * leave the page permanently locked when a parent and child sheet closed together).
 */
let locks = 0;
export function lockScroll() {
  locks++;
  document.body.classList.add('scroll-locked');
  return () => {
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.classList.remove('scroll-locked');
  };
}

/* Stack of open sheets: Escape and the Android Back button close only the top-most one. */
type SheetEntry = { id: number; close: () => void };
const stack: SheetEntry[] = [];
let sheetSeq = 0;
let ignorePop = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop--; return; }
    const top = stack[stack.length - 1];
    if (top) { (top as SheetEntry & { viaBack?: boolean }).viaBack = true; top.close(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const top = stack[stack.length - 1];
    if (top) top.close();
  });
}

export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { t } = useApp();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const entry: SheetEntry & { viaBack?: boolean } = { id: ++sheetSeq, close: () => closeRef.current() };
    stack.push(entry);
    try { history.pushState({ ...(history.state ?? {}), megoSheet: entry.id }, ''); } catch { /* ignore */ }
    const unlock = lockScroll();
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      unlock();
      // Closed by a button/Escape: drop the history entry we added (without triggering another close).
      if (!entry.viaBack && history.state?.megoSheet === entry.id) {
        ignorePop++;
        history.back();
      }
    };
  }, []);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="grabber" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('close')}><Icon name="close" /></button>
        </div>
        {children}
        {footer && <div className="row" style={{ marginTop: 14 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ message, onYes, onNo, danger }: { message: string; onYes: () => void; onNo: () => void; danger?: boolean }) {
  const { t } = useApp();
  return (
    <Sheet title={t('confirm')} onClose={onNo} footer={<>
      <button className="btn grow" onClick={onNo}>{t('cancel')}</button>
      <button className={`btn grow ${danger ? 'danger' : 'primary'}`} onClick={onYes} data-testid="confirm-yes">{t('confirm')}</button>
    </>}>
      <p>{message}</p>
    </Sheet>
  );
}

export function NumField({ label, value, onChange, step = 'any', min, suffix, testId, placeholder }: {
  label: string; value: number | '' | undefined; onChange: (v: number | '') => void; step?: string; min?: number; suffix?: string; testId?: string; placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}{suffix ? ` (${suffix})` : ''}</span>
      <input className="input num" type="number" inputMode="decimal" step={step} min={min} value={value ?? ''} placeholder={placeholder}
        data-testid={testId} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
    </label>
  );
}

export function TextField({ label, value, onChange, testId, placeholder, dir }: { label: string; value: string; onChange: (v: string) => void; testId?: string; placeholder?: string; dir?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" value={value} placeholder={placeholder} dir={dir} data-testid={testId} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function DateNav({ date, onChange, testId }: { date: string; onChange: (d: string) => void; testId?: string }) {
  const { t, d } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const label = date === today() ? t('today') : date === addDays(today(), -1) ? t('yesterday') : d(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="datenav">
      <button className="icon-btn flip" onClick={() => onChange(addDays(date, -1))} aria-label={t('previous')} data-testid="date-prev"><Icon name="back" /></button>
      <button className="btn ghost label" onClick={() => ref.current?.showPicker?.() ?? ref.current?.click()} data-testid={testId}>
        <Icon name="calendar" /> {label}
      </button>
      <input ref={ref} type="date" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} data-testid="date-input" />
      <button className="icon-btn flip" onClick={() => onChange(addDays(date, 1))} aria-label={t('next')} data-testid="date-next"><Icon name="fwd" /></button>
    </div>
  );
}

export function useAsync() {
  const { toast, t } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast(okMsg);
      return r;
    } catch (e) {
      const m = (e as Error).message;
      toast(`${t('error')}: ${m.startsWith('DUPLICATE:') ? t('duplicateFood') : m}`);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

export function Delta({ value, unit = '', invert = false, digits = 1 }: { value: number | null; unit?: string; invert?: boolean; digits?: number }) {
  const { n } = useApp();
  if (value === null) return <span className="muted">—</span>;
  const cls = value === 0 ? '' : (value > 0) !== invert ? 'pos' : 'neg';
  return <span className={`delta num ${cls}`}>{value > 0 ? '+' : ''}{n(value, digits)}{unit}</span>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ height: i === 0 ? 120 : 64, marginBottom: 12 }} />)}
    </div>
  );
}

export function EmptyState({ icon, text, action }: { icon: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="ico" aria-hidden="true">{icon}</div>
      <div>{text}</div>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}
