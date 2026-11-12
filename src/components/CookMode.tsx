import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { fmtClock, stepTimers } from '../lib/cooking';
import type { LibraryRecipe } from '../lib/recipeLibraryData';
import { householdMeasure } from '../lib/seasonings';
import { Icon } from './icons';
import { Sheet } from './ui';

interface Running { id: number; label: string; total: number; endsAt: number; pausedLeft: number | null; done: boolean }

/** Short beep through Web Audio (no audio files); silent when the browser blocks audio. */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 1500);
  } catch { /* no audio */ }
  try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch { /* no vibration */ }
}

/**
 * Step-by-step cooking mode: ingredient check-off (scaled amounts), one large step at a time, timers found in each
 * step (several can run at once and keep running while you move between steps), and a final serving step.
 * Keeps the screen awake while open where the browser allows it. Reads nothing from and writes nothing to the database.
 */
export function CookMode({ lib, nameOf, onClose }: { lib: LibraryRecipe; nameOf: (ar: string) => string; onClose: () => void }) {
  const { t, lang, n } = useApp();
  const steps = lang === 'ar' ? lib.stepsAr : lib.stepsEn;
  const total = steps.length + 2; // ready + steps + serve
  const [i, setI] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [timers, setTimers] = useState<Running[]>([]);
  const [now, setNow] = useState(Date.now());
  const seq = useRef(0);
  const all = useMemo(() => [...lib.ingredients, ...(lib.seasonings ?? [])], [lib]);

  // screen wake lock (optional)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (k: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    return () => { lock?.release().catch(() => undefined); };
  }, []);

  // tick + completion
  useEffect(() => {
    const h = setInterval(() => {
      const tNow = Date.now();
      setNow(tNow);
      setTimers((ts) => {
        let rang = false;
        const next = ts.map((x) => {
          if (x.done || x.pausedLeft !== null || x.endsAt > tNow) return x;
          rang = true;
          return { ...x, done: true };
        });
        if (rang) beep();
        return rang ? next : ts;
      });
    }, 500);
    return () => clearInterval(h);
  }, []);

  const start = (seconds: number, label: string) => setTimers((ts) => [...ts, { id: ++seq.current, label, total: seconds, endsAt: Date.now() + seconds * 1000, pausedLeft: null, done: false }]);
  const left = (x: Running) => (x.pausedLeft !== null ? x.pausedLeft : Math.max(0, Math.ceil((x.endsAt - now) / 1000)));
  const togglePause = (id: number) => setTimers((ts) => ts.map((x) => (x.id !== id ? x : x.pausedLeft !== null ? { ...x, endsAt: Date.now() + x.pausedLeft * 1000, pausedLeft: null } : { ...x, pausedLeft: left(x) })));
  const remove = (id: number) => setTimers((ts) => ts.filter((x) => x.id !== id));

  const stepIdx = i - 1; // -1 = ready, steps.length = serve
  const found = stepIdx >= 0 && stepIdx < steps.length ? stepTimers(lib.stepsEn[stepIdx] ?? '') : [];

  return (
    <Sheet title={<span className="cook-title"><Icon name="flame" />{t('ck_cooking')}</span>} onClose={onClose} className="cook-sheet">
      <div className="cook" data-testid="cook-mode">
        <div className="cook-progress" aria-hidden="true"><span style={{ width: `${((i + 1) / total) * 100}%` }} /></div>
        <div className="tiny muted" data-testid="cook-step-n">{t('ck_stepOf', { i: i + 1, n: total })}</div>

        {timers.length > 0 && (
          <div className="cook-timers" data-testid="cook-timers" aria-live="polite">
            {timers.map((x) => (
              <div key={x.id} className={`cook-timer ${x.done ? 'done' : ''}`} data-testid="cook-timer">
                <b className="num">{x.done ? t('ck_timerDone') : fmtClock(left(x))}</b>
                <span className="tiny muted">{x.label}</span>
                {!x.done && <button className="btn sm ghost" onClick={() => togglePause(x.id)}>{x.pausedLeft !== null ? t('ck_resume') : t('ck_pause')}</button>}
                <button className="icon-btn" aria-label={t('close')} onClick={() => remove(x.id)}><Icon name="close" /></button>
              </div>
            ))}
          </div>
        )}

        {i === 0 && (
          <div className="stack">
            <h3 className="cook-step-h">{t('ck_ready')}</h3>
            <div className="small muted">{t('ck_readyHint', { n: n(lib.servings) })}</div>
            <ul className="list cook-checklist">
              {all.map(([name, grams], k) => {
                const hm = householdMeasure(name, grams, lang);
                return (
                  <li key={name + k}>
                    <label className="check grow">
                      <input type="checkbox" checked={checked.has(k)} onChange={() => setChecked((s) => { const c = new Set(s); if (c.has(k)) c.delete(k); else c.add(k); return c; })} />
                      <span className={checked.has(k) ? 'muted strike' : ''}>{nameOf(name)}</span>
                    </label>
                    <span className="num small"><b>{n(grams, grams < 10 ? 1 : 0)} {t('g')}</b>{hm && <span className="tiny muted"> · {hm}</span>}</span>
                  </li>
                );
              })}
              {!!lib.waterMl && <li><span className="grow small">{t('ck_water')}</span><span className="num small">{n(lib.waterMl)} {t('unit_ml')}</span></li>}
            </ul>
            <div className="tiny muted">{t('ck_checked', { a: n(checked.size), b: n(all.length) })}</div>
          </div>
        )}

        {stepIdx >= 0 && stepIdx < steps.length && (
          <div className="stack">
            <h3 className="cook-step-h">{t('ck_step', { i: stepIdx + 1 })}</h3>
            <p className="cook-step-text" data-testid="cook-step-text">{steps[stepIdx]}</p>
            {found.length > 0 && (
              <div className="row wrap" style={{ gap: 8 }}>
                {found.map((f, k) => (
                  <button key={k} className="btn primary" onClick={() => start(f.seconds, `${t('ck_step', { i: stepIdx + 1 })} · ${fmtClock(f.seconds)}`)} data-testid="cook-start-timer">
                    <Icon name="history" /> {t('ck_startTimer', { t: fmtClock(f.seconds) })}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {i === total - 1 && (
          <div className="stack" data-testid="cook-serve">
            <h3 className="cook-step-h">{t('ck_serve')}</h3>
            <p className="cook-step-text">{(lang === 'ar' ? lib.servingAr : lib.servingEn) || t('ck_serveDefault', { n: n(lib.servings) })}</p>
            <div className="banner info small">{t('ck_doneHint')}</div>
          </div>
        )}

        <div className="cook-nav">
          <button className="btn grow" disabled={i === 0} onClick={() => setI(i - 1)} data-testid="cook-prev"><span className="flip"><Icon name="back" /></span> {t('previous')}</button>
          {i < total - 1
            ? <button className="btn primary grow" onClick={() => setI(i + 1)} data-testid="cook-next">{t('next')} <span className="flip"><Icon name="fwd" /></span></button>
            : <button className="btn primary grow" onClick={onClose} data-testid="cook-finish">{t('ck_finish')}</button>}
        </div>
      </div>
    </Sheet>
  );
}
