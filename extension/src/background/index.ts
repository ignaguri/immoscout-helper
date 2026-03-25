// Background service worker entry point for ImmoScout24 Auto Reloader
import * as C from '../shared/constants';
import { error, log } from '../shared/logger';
import { checkForNewReplies } from './conversations';
import { handleDuplicateLandlordAlarm } from './duplicates';
import { scheduleNextAlarm } from './helpers';
import { checkForNewListings } from './listings';
import { registerMessageHandler, registerNotificationHandler } from './message-handler';
import { updateCheckInterval } from './monitoring';
import {
  isMonitoring,
  messageCountResetTime,
  setIsMonitoring,
  setIsProcessingQueue,
  setLastMessageTime,
  setMessageCount,
  setMessageCountResetTime,
} from './state';
// Note: setLastMessageTime, setMessageCount, setMessageCountResetTime are still
// used by the onInstalled handler to reset rate limits on install/reload.
import { initializeStorage } from './storage';
import { checkForUpdate, setupUpdateAlarm } from './update-checker';

// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Register message and notification handlers
registerMessageHandler();
registerNotificationHandler();

// ============================================================================
// INITIALIZATION & LIFECYCLE
// ============================================================================

chrome.runtime.onInstalled.addListener(async () => {
  log('Apartment Messenger installed');
  await initializeStorage();
  // Reset rate limit on extension install/reload so we start fresh
  setMessageCount(0);
  setMessageCountResetTime(Date.now() + 3600000);
  setLastMessageTime(0);
  await chrome.storage.local.set({
    [C.RATE_MESSAGE_COUNT_KEY]: 0,
    [C.RATE_COUNT_RESET_TIME_KEY]: messageCountResetTime,
    [C.RATE_LAST_MESSAGE_TIME_KEY]: 0,
  });
  log('Rate limit reset on install/reload');

  // Start conversation reply checking alarm (runs even when monitoring is off)
  chrome.alarms.create(C.CONVERSATIONS_ALARM_NAME, { periodInMinutes: 5 });
  log('[Conversations] Reply checking alarm started (every 5 min)');

  // Start update checker alarm
  await setupUpdateAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  log('Service worker started, checking monitoring state...');
  await restoreMonitoringState();
  // Ensure conversation alarm is running
  chrome.alarms.create(C.CONVERSATIONS_ALARM_NAME, { periodInMinutes: 5 });
  // Ensure update checker alarm is running
  await setupUpdateAlarm();
});

(async () => {
  log('Service worker activated, checking monitoring state...');
  await restoreMonitoringState();
})();

async function restoreMonitoringState(): Promise<void> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.MONITORING_STATE_KEY, C.QUEUE_PROCESSING_KEY]);

  // Rate limit state is now restored eagerly on module load in state.ts
  // (via rateStateRestored promise) to prevent race conditions.

  // Clear stale queue processing flag (SW was killed mid-run)
  if (stored[C.QUEUE_PROCESSING_KEY]) {
    setIsProcessingQueue(false);
    await chrome.storage.local.set({ [C.QUEUE_PROCESSING_KEY]: false });
    log('[Queue] Cleared stale processing flag from previous SW session');
  }

  if (stored[C.MONITORING_STATE_KEY]) {
    log('Restoring monitoring state: was monitoring');
    setIsMonitoring(true);
    await updateCheckInterval();
    await scheduleNextAlarm();
    log('Alarm restored with jitter');
  } else {
    log('No saved monitoring state - monitoring is off');
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === C.ALARM_NAME) {
    log(`[${new Date().toLocaleTimeString()}] Alarm triggered - checking for new listings...`);
    if (isMonitoring) {
      try {
        await checkForNewListings();
      } catch (err) {
        error('Error in alarm check:', err);
      }
      // Reschedule with jitter for next cycle
      if (isMonitoring) {
        await scheduleNextAlarm();
      }
    }
  } else if (alarm.name === 'dup-landlord-timeout') {
    log('[Duplicate] Alarm fired — deferring pending duplicate landlord decision');
    handleDuplicateLandlordAlarm();
  } else if (alarm.name === C.CONVERSATIONS_ALARM_NAME) {
    log(`[${new Date().toLocaleTimeString()}] Conversation alarm triggered - checking for replies...`);
    try {
      await checkForNewReplies();
    } catch (err) {
      error('[Conversations] Error checking replies:', err);
    }
  } else if (alarm.name === C.UPDATE_CHECK_ALARM) {
    log('[Update] Periodic update check triggered');
    await checkForUpdate();
  }
});
