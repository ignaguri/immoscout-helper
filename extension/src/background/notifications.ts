import { NOTIFICATION_PREFS_KEY, DEFAULT_NOTIFICATION_PREFS, type NotificationEvent } from '../shared/constants';

export type NotificationPrefs = Record<NotificationEvent, boolean>;

/** Load notification prefs once — use in hot paths to avoid repeated storage reads. */
export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const stored = await chrome.storage.local.get([NOTIFICATION_PREFS_KEY]);
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(stored[NOTIFICATION_PREFS_KEY] || {}) };
}

/** Check a single event. For one-off checks (conversations, queue, ai). */
export async function shouldNotify(event: NotificationEvent): Promise<boolean> {
  const prefs = await loadNotificationPrefs();
  return prefs[event] !== false;
}

/** Check against pre-loaded prefs. Use in handleNewListing to avoid repeated storage I/O. */
export function shouldNotifyWith(prefs: NotificationPrefs, event: NotificationEvent): boolean {
  return prefs[event] !== false;
}
