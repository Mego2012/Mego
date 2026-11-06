import { getSettings, kvGet, kvSet } from './repo';
import { today } from './dates';

/**
 * Local reminders. A PWA cannot schedule notifications for when the app is closed without a push
 * server, so reminders are checked every 30 s while the app (or its tab) is alive, and on app start
 * a missed reminder from earlier today is shown once.
 */
export type ReminderHandler = (label: string) => void;

export async function checkReminders(now = new Date(), show: ReminderHandler = defaultShow) {
  const s = await getSettings();
  const fired = await kvGet<Record<string, string>>('remindersFired', {});
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const d = today();
  let changed = false;
  for (const r of s.reminders) {
    if (!r.enabled || fired[r.id] === d) continue;
    if (r.time <= hhmm) {
      show(r.label);
      fired[r.id] = d;
      changed = true;
    }
  }
  if (changed) await kvSet('remindersFired', fired);
}

function defaultShow(label: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready
        .then((reg) => reg.showNotification(label, { body: 'Mego Nutrition', icon: 'icon-192.png', tag: 'mego-' + label }))
        .catch(() => new Notification(label));
      return;
    }
  } catch {
    /* fall through */
  }
  window.dispatchEvent(new CustomEvent('mego-reminder', { detail: label }));
}

let started = false;
export function startReminders() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const tick = () => checkReminders().catch(() => {});
  setTimeout(tick, 4000);
  setInterval(tick, 30_000);
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
