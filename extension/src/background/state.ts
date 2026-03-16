// Module-level mutable state shared across all background modules

export const DEFAULT_CHECK_INTERVAL = 60000;

export let isMonitoring = false;
export let currentCheckInterval = DEFAULT_CHECK_INTERVAL;
export let searchTabId: number | null = null;
export let lastMessageTime = 0;
export let messageCount = 0;
export let messageCountResetTime = Date.now() + 3600000;

// Multi-URL round-robin index (persisted to survive SW restarts)
export let searchUrlIndex = 0;

// Restore persisted index on module load
chrome.storage.session
  ?.get('searchUrlIndex')
  .then((data) => {
    if (typeof data?.searchUrlIndex === 'number') {
      searchUrlIndex = data.searchUrlIndex;
    }
  })
  .catch(() => {
    /* session storage may not be available */
  });

export function advanceSearchUrlIndex(total: number) {
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
  lastMessageTime = val;
}
export function setMessageCount(val: number) {
  messageCount = val;
}
export function setMessageCountResetTime(val: number) {
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
