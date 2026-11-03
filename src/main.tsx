import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { requestPersistentStorage } from './lib/db';
import { getSettings } from './lib/repo';
import { refreshPending, startAutoSync } from './lib/sync';
import './styles.css';

async function boot() {
  await getSettings(); // creates the default profile on first run
  requestPersistentStorage();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  refreshPending();
  startAutoSync();
  registerSW({ immediate: true });
}

boot();
