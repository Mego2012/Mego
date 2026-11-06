import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './app/AppContext';
import { Layout } from './components/Layout';
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
const Coach = lazy(() => import('./pages/Coach'));

function Routed() {
  const { ready, lang } = useApp();
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
          <Route path="/coach" element={<Coach />} />
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
