import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { preMigrationBackup, requestPersistentStorage } from './lib/db';
import { autoDailyBackup } from './lib/localBackup';
import { startReminders } from './lib/reminders';
import { getSettings } from './lib/repo';
import { refreshPending, startAutoSync } from './lib/sync';
import './styles.css';

async function boot() {
  // Protect existing data before Dexie upgrades the schema.
  try {
    await preMigrationBackup();
  } catch (e) {
    console.warn('pre-migration backup failed', e);
  }
  await getSettings(); // creates the default profile on first run
  requestPersistentStorage();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  refreshPending();
  startAutoSync();
  startReminders();
  autoDailyBackup().catch(() => {});
  registerSW({ immediate: true });
}

boot();
