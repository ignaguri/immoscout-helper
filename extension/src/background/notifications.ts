import { NOTIFICATION_PREFS_KEY, DEFAULT_NOTIFICATION_PREFS, type NotificationEvent } from '../shared/constants';

export async function shouldNotify(event: NotificationEvent): Promise<boolean> {
  const stored = await chrome.storage.local.get([NOTIFICATION_PREFS_KEY]);
  const prefs = stored[NOTIFICATION_PREFS_KEY] || DEFAULT_NOTIFICATION_PREFS;
  return prefs[event] !== false; // default to true if not set
}
