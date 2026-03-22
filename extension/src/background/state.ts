// Module-level mutable state shared across all background modules
import * as C from '../shared/constants';

export const DEFAULT_CHECK_INTERVAL = 60000;

export let isMonitoring = false;
export let currentCheckInterval = DEFAULT_CHECK_INTERVAL;
export let searchTabId: number | null = null;
export let lastMessageTime = 0;
export let messageCount = 0;
export let messageCountResetTime = Date.now() + 3600000;

// Multi-URL round-robin index (persisted to survive SW restarts)
export let searchUrlIndex = 0;

// Flag to prevent the async restore from overwriting an explicit reset (e.g. onInstalled).
let rateStateExplicitlySet = false;

// Restore rate limit state on module load so checkRateLimit() never sees defaults.
// Skips restore if setters were already called (e.g. onInstalled reset ran first).
export const rateStateRestored: Promise<void> = chrome.storage.local
  .get([C.RATE_LAST_MESSAGE_TIME_KEY, C.RATE_MESSAGE_COUNT_KEY, C.RATE_COUNT_RESET_TIME_KEY])
  .then((stored: Record<string, any>) => {
    if (rateStateExplicitlySet) return;
    lastMessageTime = stored[C.RATE_LAST_MESSAGE_TIME_KEY] || 0;
    messageCount = stored[C.RATE_MESSAGE_COUNT_KEY] || 0;
    messageCountResetTime = stored[C.RATE_COUNT_RESET_TIME_KEY] || Date.now() + 3600000;
  })
  .catch(() => {});

// Restore persisted index on module load, with a promise guard to prevent
// race conditions when advanceSearchUrlIndex is called before restore completes.
const searchUrlIndexRestored: Promise<void> =
  chrome.storage.session
    ?.get('searchUrlIndex')
    .then((data) => {
      if (typeof data?.searchUrlIndex === 'number') {
        searchUrlIndex = data.searchUrlIndex;
      }
    })
    .catch(() => {
      /* session storage may not be available */
    }) ?? Promise.resolve();

export async function advanceSearchUrlIndex(total: number) {
  await searchUrlIndexRestored;
  searchUrlIndex = total > 0 ? (searchUrlIndex + 1) % total : 0;
  chrome.storage.session?.set({ searchUrlIndex }).catch(() => {});
}

// Unified queue processing state
export let isProcessingQueue = false;
export let queueAbortRequested = false;
export let userTriggeredProcessing = false;

// Setter functions since `let` exports can't be reassigned from outside
export function setIsMonitoring(val: boolean) {
  isMonitoring = val;
}
export function setCurrentCheckInterval(val: number) {
  currentCheckInterval = val;
}
export function setSearchTabId(val: number | null) {
  searchTabId = val;
}
export function setLastMessageTime(val: number) {
  rateStateExplicitlySet = true;
  lastMessageTime = val;
}
export function setMessageCount(val: number) {
  rateStateExplicitlySet = true;
  messageCount = val;
}
export function setMessageCountResetTime(val: number) {
  rateStateExplicitlySet = true;
  messageCountResetTime = val;
}
export function setIsProcessingQueue(val: boolean) {
  isProcessingQueue = val;
}
export function setQueueAbortRequested(val: boolean) {
  queueAbortRequested = val;
}
export function setUserTriggeredProcessing(val: boolean) {
  userTriggeredProcessing = val;
}
export function incrementMessageCount() {
  messageCount++;
}
