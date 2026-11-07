import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { preMigrationBackup, requestPersistentStorage } from './lib/db';
import { autoDailyBackup } from './lib/localBackup';
import { startReminders } from './lib/reminders';
import { getSettings } from './lib/repo';
import { refreshPending, startAutoSync } from './lib/sync';
import { bootAccount, watchSession } from './lib/account';
import { onLocalChange } from './lib/repo';
import './styles.css';
import './screens.css';

async function boot() {
  // Protect existing data before Dexie upgrades the schema.
  try {
    await preMigrationBackup();
  } catch (e) {
    console.warn('pre-migration backup failed', e);
  }
  // Accounts: selects this account's own local database (or guest mode) before anything renders.
  const acc = await bootAccount().catch(() => ({ mode: 'guest' as const }));
  await getSettings(); // creates the default profile on first run
  requestPersistentStorage();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  refreshPending();
  // screenshot/audit builds only (VITE_DEMO=1): production builds drop this branch and the demo module entirely
  if (import.meta.env.VITE_DEMO === '1') (window as unknown as Record<string, unknown>).__megoSeedDemo = () => import('./lib/demoSeed').then((m) => m.seedDemo());
  if (acc.mode === 'account') {
    // signed-in: Firestore sync (own data only); the Google-Sheet Hub sync stays for guest/owner devices
    watchSession(async (uid) => { const { startCloudSync } = await import('./lib/cloudSync'); startCloudSync(uid, (fn) => onLocalChange(fn)); });
  } else {
    startAutoSync();
  }
  startReminders();
  autoDailyBackup().catch(() => {});
  registerSW({ immediate: true });
}

boot();
