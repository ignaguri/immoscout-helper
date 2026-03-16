import * as C from '../shared/constants';
import { scheduleNextAlarm } from './helpers';
import { currentCheckInterval, isMonitoring, setCurrentCheckInterval, setIsMonitoring, setSearchTabId } from './state';
import { syncContactedListings } from './sync';

export async function updateCheckInterval(): Promise<void> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.CHECK_INTERVAL_KEY]);
  const intervalSeconds = stored[C.CHECK_INTERVAL_KEY];
  setCurrentCheckInterval((intervalSeconds || 60) * 1000);
  console.log(`Check interval set to ${intervalSeconds || 60} seconds`);
}

export async function startMonitoring(): Promise<void> {
  if (isMonitoring) {
    console.log('Monitoring already active');
    return;
  }

  try {
    setIsMonitoring(true);
    console.log('Starting monitoring...');

    await updateCheckInterval();

    console.log('Syncing contacted listings from messenger...');
    try {
      const synced = await syncContactedListings();
      const stored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
      console.log(
        `[Startup] Seen list has ${(stored[C.STORAGE_KEY] || []).length} entries after messenger sync (${synced} new)`,
      );
    } catch (error) {
      console.error('Error syncing contacted listings:', error);
    }

    console.log(`Monitoring started. Will check every ${currentCheckInterval / 1000} seconds.`);
    console.log('Listings already messaged (from messenger) will be skipped. All others will be scored.');

    await chrome.storage.local.set({ [C.MONITORING_STATE_KEY]: true });

    await scheduleNextAlarm();
  } catch (error) {
    console.error('Error in startMonitoring:', error);
    setIsMonitoring(false);
    throw error;
  }
}

export async function stopMonitoring(): Promise<void> {
  if (!isMonitoring) {
    console.log('Monitoring already stopped');
    return;
  }

  setIsMonitoring(false);
  console.log('Stopping monitoring...');

  await chrome.alarms.clear(C.ALARM_NAME);
  await chrome.storage.local.set({ [C.MONITORING_STATE_KEY]: false });

  setSearchTabId(null);
  console.log('Monitoring stopped.');
}
