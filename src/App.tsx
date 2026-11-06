import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './app/AppContext';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Diary from './pages/Diary';

const Foods = lazy(() => import('./pages/Foods'));
const Recipes = lazy(() => import('./pages/Recipes'));
const Planner = lazy(() => import('./pages/Planner'));
const Progress = lazy(() => import('./pages/Progress'));
const Reports = lazy(() => import('./pages/Reports'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Habits = lazy(() => import('./pages/Habits'));

function Routed() {
  const { ready } = useApp();
  if (!ready) return null;
  return (
    <Layout>
      <Suspense fallback={<div className="empty">…</div>}>
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
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
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
