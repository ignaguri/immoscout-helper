import * as C from '../shared/constants';
import { log, error } from '../shared/logger';
import { scheduleNextAlarm } from './helpers';
import { currentCheckInterval, isMonitoring, setCurrentCheckInterval, setIsMonitoring, setSearchTabId } from './state';
import { syncContactedListings } from './sync';

export async function updateCheckInterval(): Promise<void> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.CHECK_INTERVAL_KEY]);
  const intervalSeconds = stored[C.CHECK_INTERVAL_KEY];
  setCurrentCheckInterval((intervalSeconds || 60) * 1000);
  log(`Check interval set to ${intervalSeconds || 60} seconds`);
}

export async function startMonitoring(): Promise<void> {
  if (isMonitoring) {
    log('Monitoring already active');
    return;
  }

  try {
    setIsMonitoring(true);
    log('Starting monitoring...');

    await updateCheckInterval();

    log('Syncing contacted listings from messenger...');
    try {
      const synced = await syncContactedListings();
      const stored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
      log(
        `[Startup] Seen list has ${(stored[C.STORAGE_KEY] || []).length} entries after messenger sync (${synced} new)`,
      );
    } catch (err) {
      error('Error syncing contacted listings:', err);
    }

    log(`Monitoring started. Will check every ${currentCheckInterval / 1000} seconds.`);
    log('Listings already messaged (from messenger) will be skipped. All others will be scored.');

    await chrome.storage.local.set({ [C.MONITORING_STATE_KEY]: true });

    await scheduleNextAlarm();
  } catch (err) {
    error('Error in startMonitoring:', err);
    setIsMonitoring(false);
    throw err;
  }
}

export async function stopMonitoring(): Promise<void> {
  if (!isMonitoring) {
    log('Monitoring already stopped');
    return;
  }

  setIsMonitoring(false);
  log('Stopping monitoring...');

  await chrome.alarms.clear(C.ALARM_NAME);
  await chrome.storage.local.set({ [C.MONITORING_STATE_KEY]: false });

  setSearchTabId(null);
  log('Monitoring stopped.');
}
