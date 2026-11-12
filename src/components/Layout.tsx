import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { pushNow, subscribeSync, type SyncStatus } from '../lib/sync';
import { saveSettings } from '../lib/repo';
import { Icon, type IconName } from './icons';
import { Sheet } from './ui';
import { Wordmark } from './instrument';

const ALL: { to: string; key: string; icon: IconName }[] = [
  { to: '/', key: 'nav_dashboard', icon: 'home' },
  { to: '/diary', key: 'nav_diary', icon: 'diary' },
  { to: '/recipes', key: 'nav_library', icon: 'recipes' },
  { to: '/coach', key: 'nav_coach', icon: 'coach' },
  { to: '/progress', key: 'nav_progress', icon: 'progress' },
  { to: '/foods', key: 'nav_foods', icon: 'foods' },
  { to: '/planner', key: 'nav_planner', icon: 'planner' },
  { to: '/goals', key: 'nav_goals', icon: 'target' },
  { to: '/workouts', key: 'nav_workouts', icon: 'flame' },
  { to: '/cardio', key: 'nav_cardio', icon: 'pulse' },
  { to: '/habits', key: 'nav_habits', icon: 'water' },
  { to: '/reports/week', key: 'nav_weekly', icon: 'weekly' },
  { to: '/reports/month', key: 'nav_monthly', icon: 'monthly' },
  { to: '/settings', key: 'nav_settings', icon: 'settings' }
];
const BOTTOM = ['/', '/diary', '/recipes', '/progress'];

export function useSyncStatus() {
  const [s, setS] = useState<SyncStatus>({ state: 'disabled', pending: 0 });
  useEffect(() => {
    const off = subscribeSync(setS);
    return () => { off(); };
  }, []);
  return s;
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function Layout({ children }: { children: ReactNode }) {
  const { t, lang } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const [more, setMore] = useState(false);
  const sync = useSyncStatus();
  const online = useOnline();
  const path = loc.pathname.startsWith('/exercise/') ? '/workouts' : loc.pathname;
  const current = ALL.filter((a) => (a.to === '/' ? path === '/' : path.startsWith(a.to))).pop();
  const inMore = current && !BOTTOM.includes(current.to);
  const state = !online ? 'offline' : sync.state;
  const { toast } = useApp();
  useEffect(() => {
    const h = (e: Event) => toast((e as CustomEvent<string>).detail);
    window.addEventListener('mego-reminder', h);
    return () => window.removeEventListener('mego-reminder', h);
  }, [toast]);

  return (
    <div className="app">
      <nav className="side-nav" aria-label={t('nav_main')}>
        <div className="brand"><Wordmark /></div>
        {ALL.map((a) => (
          <NavLink key={a.to} to={a.to} end={a.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={a.icon} /> {t(a.key)}
          </NavLink>
        ))}
      </nav>
      <div className="content">
        <header className="header">
          {loc.pathname === '/' ? <h1 aria-label={t('appName')}><Wordmark /></h1> : <h1>{current ? t(current.key) : t('appName')}</h1>}
          <button className="lang-switch" onClick={() => saveSettings((x) => { x.lang = lang === 'ar' ? 'en' : 'ar'; })} data-testid="lang-switch"
            aria-label={t('switchLanguage')} title={t('switchLanguage')}><Icon name="globe" /><span>{lang === 'ar' ? 'EN' : 'ع'}</span></button>
          <button className="sync-chip" onClick={() => (sync.state === 'disabled' ? nav('/settings#sync') : pushNow())} data-testid="sync-chip" title={sync.error}>
            <span className={`dot ${state}`} />
            {t('syncState_' + state)}{sync.pending > 0 ? ` · ${sync.pending}` : ''}{sync.state === 'error' && sync.retryIn ? ` · ${t('retryIn', { s: sync.retryIn })}` : ''}
          </button>
        </header>
        <main className="main">
          {!online && <div className="banner offline no-print" data-testid="offline-banner">{t('offlineBanner')}</div>}
          {children}
        </main>
      </div>
      <nav className="bottom-nav" aria-label={t('nav_main')}>
        {ALL.filter((a) => BOTTOM.includes(a.to)).map((a) => (
          <NavLink key={a.to} to={a.to} end={a.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')} data-testid={`nav-${a.icon}`}>
            <Icon name={a.icon} /> <span>{t(a.key)}</span>
          </NavLink>
        ))}
        <button className={inMore ? 'active' : ''} onClick={() => setMore(true)} data-testid="nav-more">
          <Icon name="more" /> <span>{t('nav_more')}</span>
        </button>
      </nav>
      {more && (
        <Sheet title={t('nav_more')} onClose={() => setMore(false)}>
          <div className="drawer-grid">
            {ALL.filter((a) => !BOTTOM.includes(a.to)).map((a) => (
              <NavLink key={a.to} to={a.to} onClick={() => setMore(false)} data-testid={`more-${a.icon}`}>
                <Icon name={a.icon} /> {t(a.key)}
              </NavLink>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
