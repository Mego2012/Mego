import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../lib/db';
import { defaultSettings } from '../lib/defaults';
import { fmtDate, fmtNum, translate } from '../lib/i18n';
import type { Settings } from '../lib/types';

interface Ctx {
  settings: Settings;
  ready: boolean;
  lang: Settings['lang'];
  dir: 'rtl' | 'ltr';
  t: (key: string, params?: Record<string, string | number>) => string;
  n: (v: number | null | undefined, digits?: number) => string;
  d: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  toast: (msg: string) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const stored = useLiveQuery(() => db.settings.get('main'), [], null);
  const settings = useMemo<Settings>(() => {
    const d = defaultSettings();
    if (!stored) return d;
    return { ...d, ...stored, profile: { ...d.profile, ...stored.profile }, targets: { ...d.targets, ...stored.targets }, tolerance: { ...d.tolerance, ...stored.tolerance }, sync: { ...d.sync, ...stored.sync } };
  }, [stored]);
  const lang = settings.lang;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = translate(lang, 'appName');
  }, [lang, dir]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const toast = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2800);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      settings, ready: stored !== null, lang, dir,
      t: (k, p) => translate(lang, k, p),
      n: (v, digits = 0) => fmtNum(v, lang, digits),
      d: (iso, opts) => fmtDate(iso, lang, opts),
      toast
    }),
    [settings, stored, lang, dir, toast]
  );

  return (
    <AppCtx.Provider value={value}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </AppCtx.Provider>
  );
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}
