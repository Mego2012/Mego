import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './app/AppContext';
import { Layout } from './components/Layout';
import { accountState } from './lib/account';
import { useAccount } from './pages/accountHook';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Skeleton } from './components/ui';
import Dashboard from './pages/Dashboard';
import Diary from './pages/Diary';

const Foods = lazy(() => import('./pages/Foods'));
const Recipes = lazy(() => import('./pages/Recipes'));
const Planner = lazy(() => import('./pages/Planner'));
const Progress = lazy(() => import('./pages/Progress'));
const Reports = lazy(() => import('./pages/Reports'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Habits = lazy(() => import('./pages/Habits'));
const Cardio = lazy(() => import('./pages/Cardio'));
const Goals = lazy(() => import('./pages/Goals'));
const Workouts = lazy(() => import('./pages/Workouts'));
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail'));
const Coach = lazy(() => import('./pages/Coach'));
const AccountPages = lazy(() => import('./pages/Account').then((m) => ({ default: m.AccountRouter })));

function Routed() {
  const { ready, lang } = useApp();
  useAccount(); // re-render when the account state changes (profile, suspension)
  const loc = useLocation();
  useEffect(() => {
    if (!ready) return;
    const el = document.getElementById('splash');
    if (!el) return;
    el.classList.add('gone');
    const id = setTimeout(() => el.remove(), 500);
    return () => clearTimeout(id);
  }, [ready]);
  if (!ready) return <div className="main"><Skeleton /></div>;
  const acc = accountState();
  // Public landing (signed out, cloud enabled), suspended accounts and legal pages render without the app shell.
  if ((acc.mode === 'welcome' || acc.suspended) && !['/privacy', '/terms'].includes(loc.pathname)) return <Suspense fallback={<Skeleton />}><AccountPages view={acc.suspended ? 'suspended' : 'welcome'} /></Suspense>;
  if (acc.mode === 'welcome') return <Suspense fallback={<Skeleton />}><AccountPages view={loc.pathname === '/terms' ? 'terms' : 'privacy'} /></Suspense>;
  return (
    <Layout>
      <ErrorBoundary lang={lang} key={loc.pathname}>
      <Suspense fallback={<Skeleton />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/diary" element={<Diary />} />
          <Route path="/foods" element={<Foods />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/reports/week" element={<Reports kind="week" />} />
          <Route path="/reports/month" element={<Reports kind="month" />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/cardio" element={<Cardio />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/workouts" element={<Workouts />} />
          <Route path="/exercise/:id" element={<ExerciseDetail />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/admin" element={<AccountPages view="admin" />} />
          <Route path="/privacy" element={<AccountPages view="privacy" />} />
          <Route path="/terms" element={<AccountPages view="terms" />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routed />
      </HashRouter>
    </AppProvider>
  );
}
