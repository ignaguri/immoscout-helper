import * as C from '../shared/constants';

export async function logActivity(entry: Record<string, any>): Promise<void> {
  try {
    const stored: Record<string, any> = await chrome.storage.local.get([C.ACTIVITY_LOG_KEY]);
    const log: any[] = stored[C.ACTIVITY_LOG_KEY] || [];
    log.unshift({ ...entry, timestamp: Date.now() });
    // Cap to prevent unbounded growth
    if (log.length > C.ACTIVITY_LOG_CAP) log.length = C.ACTIVITY_LOG_CAP;
    await chrome.storage.local.set({ [C.ACTIVITY_LOG_KEY]: log });
  } catch (_e) {
    console.debug('[Activity] Logging failed (best-effort)');
  }
}
