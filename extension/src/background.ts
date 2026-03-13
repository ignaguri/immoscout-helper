// Background service worker for ImmoScout24 Auto Reloader
import * as C from './shared/constants';
import { capSeenListings, generatePersonalizedMessage } from './shared/utils';

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

const DEFAULT_CHECK_INTERVAL = 60000;

let isMonitoring = false;
let currentCheckInterval = DEFAULT_CHECK_INTERVAL;
let searchTabId: number | null = null;
let lastMessageTime = 0;
let messageCount = 0;
let messageCountResetTime = Date.now() + 3600000;

// Unified queue processing state
let isProcessingQueue = false;
let queueAbortRequested = false;
let userTriggeredProcessing = false;

// ============================================================================
// INITIALIZATION & LIFECYCLE
// ============================================================================

chrome.runtime.onInstalled.addListener(async () => {
  console.log('Apartment Messenger installed');
  await initializeStorage();
  // Reset rate limit on extension install/reload so we start fresh
  messageCount = 0;
  messageCountResetTime = Date.now() + 3600000;
  lastMessageTime = 0;
  await chrome.storage.local.set({
    [C.RATE_MESSAGE_COUNT_KEY]: 0,
    [C.RATE_COUNT_RESET_TIME_KEY]: messageCountResetTime,
    [C.RATE_LAST_MESSAGE_TIME_KEY]: 0,
  });
  console.log('Rate limit reset on install/reload');

  // Start conversation reply checking alarm (runs even when monitoring is off)
  chrome.alarms.create(C.CONVERSATIONS_ALARM_NAME, { periodInMinutes: 5 });
  console.log('[Conversations] Reply checking alarm started (every 5 min)');
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('Service worker started, checking monitoring state...');
  await restoreMonitoringState();
  // Ensure conversation alarm is running
  chrome.alarms.create(C.CONVERSATIONS_ALARM_NAME, { periodInMinutes: 5 });
});

(async () => {
  console.log('Service worker activated, checking monitoring state...');
  await restoreMonitoringState();
})();

async function restoreMonitoringState(): Promise<void> {
  const stored: Record<string, any> = await chrome.storage.local.get([
    C.MONITORING_STATE_KEY,
    C.RATE_LAST_MESSAGE_TIME_KEY,
    C.RATE_MESSAGE_COUNT_KEY,
    C.RATE_COUNT_RESET_TIME_KEY,
    C.QUEUE_PROCESSING_KEY,
  ]);

  // Restore rate limit state
  lastMessageTime = stored[C.RATE_LAST_MESSAGE_TIME_KEY] || 0;
  messageCount = stored[C.RATE_MESSAGE_COUNT_KEY] || 0;
  messageCountResetTime = stored[C.RATE_COUNT_RESET_TIME_KEY] || Date.now() + 3600000;

  // Clear stale queue processing flag (SW was killed mid-run)
  if (stored[C.QUEUE_PROCESSING_KEY]) {
    isProcessingQueue = false;
    await chrome.storage.local.set({ [C.QUEUE_PROCESSING_KEY]: false });
    console.log('[Queue] Cleared stale processing flag from previous SW session');
  }

  if (stored[C.MONITORING_STATE_KEY]) {
    console.log('Restoring monitoring state: was monitoring');
    isMonitoring = true;
    await updateCheckInterval();
    await scheduleNextAlarm();
    console.log('Alarm restored with jitter');
  } else {
    console.log('No saved monitoring state - monitoring is off');
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === C.ALARM_NAME) {
    console.log(`[${new Date().toLocaleTimeString()}] Alarm triggered - checking for new listings...`);
    if (isMonitoring) {
      try {
        await checkForNewListings();
      } catch (error) {
        console.error('Error in alarm check:', error);
      }
      // Reschedule with jitter for next cycle
      if (isMonitoring) {
        await scheduleNextAlarm();
      }
    }
  } else if (alarm.name === C.CONVERSATIONS_ALARM_NAME) {
    console.log(`[${new Date().toLocaleTimeString()}] Conversation alarm triggered - checking for replies...`);
    try {
      await checkForNewReplies();
    } catch (error) {
      console.error('[Conversations] Error checking replies:', error);
    }
  }
});

// Batched storage initialization — single read, single write
async function initializeStorage(): Promise<void> {
  const defaults: Record<string, any> = {
    [C.STORAGE_KEY]: [],
    [C.SEARCH_URL_KEY]: 'https://www.immobilienscout24.de/Suche/de/wohnung-mieten',
    [C.MESSAGE_TEMPLATE_KEY]:
      'Sehr geehrte Damen und Herren,\n\nich interessiere mich für diese Wohnung und würde gerne mehr Informationen erhalten.\n\nMit freundlichen Grüßen',
    [C.CHECK_INTERVAL_KEY]: 60,
    [C.RATE_LIMIT_KEY]: 10,
    [C.MIN_DELAY_KEY]: 30,
    [C.FORM_ADULTS_KEY]: 2,
    [C.FORM_CHILDREN_KEY]: 0,
    [C.FORM_PETS_KEY]: 'Nein',
    [C.FORM_SMOKER_KEY]: 'Nein',
    [C.FORM_INCOME_KEY]: 2000,
    [C.FORM_HOUSEHOLD_SIZE_KEY]: 'Einpersonenhaushalt',
    [C.FORM_EMPLOYMENT_KEY]: 'Angestellte:r',
    [C.FORM_INCOME_RANGE_KEY]: '1.500 - 2.000',
    [C.FORM_DOCUMENTS_KEY]: 'Vorhanden',
    [C.FORM_SALUTATION_KEY]: 'Frau',
    [C.FORM_PHONE_KEY]: '',
    [C.AUTO_SEND_MODE_KEY]: 'auto',
    [C.TOTAL_MESSAGES_SENT_KEY]: 0,
    [C.LAST_CHECK_TIME_KEY]: null,
    [C.AI_ENABLED_KEY]: false,
    [C.AI_SERVER_URL_KEY]: 'http://localhost:3456',
    [C.AI_MIN_SCORE_KEY]: 5,
    [C.AI_ABOUT_ME_KEY]: '',
    [C.AI_LISTINGS_SCORED_KEY]: 0,
    [C.AI_LISTINGS_SKIPPED_KEY]: 0,
    [C.SYNCED_CONTACTED_KEY]: 0,
  };

  const keys = Object.keys(defaults);
  const result: Record<string, any> = await chrome.storage.local.get(keys);

  const toSet: Record<string, any> = {};
  for (const key of keys) {
    if (result[key] === undefined || result[key] === null) {
      toSet[key] = defaults[key];
    }
  }

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getRandomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function humanDelay(baseMs: number, varianceMs: number = 0): number {
  const delay = baseMs + (varianceMs > 0 ? getRandomDelay(-varianceMs, varianceMs) : 0);
  return Math.max(100, delay);
}

// Schedule next alarm with ±20% jitter (one-shot)
async function scheduleNextAlarm(): Promise<void> {
  const baseSeconds = currentCheckInterval / 1000;
  const jitter = baseSeconds * 0.2;
  const nextSeconds = baseSeconds + getRandomDelay(-jitter, jitter);
  const delayInMinutes = Math.max(1, nextSeconds / 60);
  await chrome.alarms.clear(C.ALARM_NAME);
  await chrome.alarms.create(C.ALARM_NAME, { delayInMinutes });
  console.log(`[Alarm] Next check in ${Math.round(nextSeconds)}s (base ${baseSeconds}s ± 20%)`);
}

// Wait for a tab to finish loading using chrome.tabs.onUpdated
function waitForTabLoad(tabId: number, timeoutMs: number = 10000): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;

    const done = (): void => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      }
    };

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo): void => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        done();
      }
    };

    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);

    // Check if tab is already complete (race condition guard)
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === 'complete') done();
      })
      .catch(() => done());
  });
}

// Check if listing ID is in seen set
function _isListingSeen(listingId: string | number | null | undefined, seenSet: Set<string>): boolean {
  if (!listingId || !seenSet) return false;
  return seenSet.has(String(listingId).toLowerCase().trim());
}

function _ensureSorting(url: string): string {
  try {
    const urlObj = new URL(url);
    if (!urlObj.searchParams.has('sorting')) {
      urlObj.searchParams.set('sorting', '2');
    }
    return urlObj.toString();
  } catch (_error) {
    const separator = url.includes('?') ? '&' : '?';
    if (!url.includes('sorting=')) {
      return `${url}${separator}sorting=2`;
    }
    return url;
  }
}

// ============================================================================
// RATE LIMITING (persisted)
// ============================================================================

interface RateLimitResult {
  allowed: boolean;
  waitTime?: number;
}

async function checkRateLimit(): Promise<RateLimitResult> {
  const now = Date.now();

  if (now >= messageCountResetTime) {
    messageCount = 0;
    messageCountResetTime = now + 3600000;
    await chrome.storage.local.set({
      [C.RATE_MESSAGE_COUNT_KEY]: 0,
      [C.RATE_COUNT_RESET_TIME_KEY]: messageCountResetTime,
    });
  }

  const stored: Record<string, any> = await chrome.storage.local.get([C.RATE_LIMIT_KEY, C.MIN_DELAY_KEY]);
  const rateLimitValue = stored[C.RATE_LIMIT_KEY] || 10;
  const minDelay = (stored[C.MIN_DELAY_KEY] || 30) * 1000;

  if (messageCount >= rateLimitValue) {
    const waitTime = messageCountResetTime - now;
    console.log(
      `Rate limit reached (${messageCount}/${rateLimitValue} messages). Waiting ${Math.ceil(waitTime / 1000)} seconds...`,
    );
    return { allowed: false, waitTime };
  }

  const timeSinceLastMessage = now - lastMessageTime;
  if (timeSinceLastMessage < minDelay) {
    const waitTime = minDelay - timeSinceLastMessage;
    console.log(`Rate limiting: Waiting ${Math.ceil(waitTime / 1000)} seconds before next message...`);
    return { allowed: false, waitTime };
  }

  return { allowed: true };
}

// ============================================================================
// MONITORING CONTROL
// ============================================================================

async function updateCheckInterval(): Promise<void> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.CHECK_INTERVAL_KEY]);
  const intervalSeconds = stored[C.CHECK_INTERVAL_KEY];
  currentCheckInterval = (intervalSeconds || 60) * 1000;
  console.log(`Check interval set to ${intervalSeconds || 60} seconds`);
}

async function startMonitoring(): Promise<void> {
  if (isMonitoring) {
    console.log('Monitoring already active');
    return;
  }

  try {
    isMonitoring = true;
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
    isMonitoring = false;
    throw error;
  }
}

async function stopMonitoring(): Promise<void> {
  if (!isMonitoring) {
    console.log('Monitoring already stopped');
    return;
  }

  isMonitoring = false;
  console.log('Stopping monitoring...');

  await chrome.alarms.clear(C.ALARM_NAME);
  await chrome.storage.local.set({ [C.MONITORING_STATE_KEY]: false });

  searchTabId = null;
  console.log('Monitoring stopped.');
}

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

interface SearchTabResult {
  tab: chrome.tabs.Tab;
  searchUrl: string;
}

async function findOrCreateSearchTab(): Promise<SearchTabResult | null> {
  try {
    const stored: Record<string, any> = await chrome.storage.local.get([C.SEARCH_URL_KEY]);
    const searchUrl: string | undefined = stored[C.SEARCH_URL_KEY];

    if (!searchUrl) {
      console.error('No search URL configured');
      return null;
    }

    const configuredUrl = new URL(searchUrl);
    const basePath = configuredUrl.origin + configuredUrl.pathname;

    const allTabs = await chrome.tabs.query({});

    const matchingTab = allTabs.find((tab) => {
      if (!tab.url) return false;
      try {
        const tabUrl = new URL(tab.url);
        const tabBasePath = tabUrl.origin + tabUrl.pathname;
        return tabBasePath === basePath;
      } catch {
        return false;
      }
    });

    if (matchingTab) {
      console.log('Found existing tab with configured URL');
      return { tab: matchingTab, searchUrl };
    }

    console.log('Creating new tab with configured URL');
    const newTab = await chrome.tabs.create({ url: searchUrl, active: false });

    await waitForTabLoad(newTab.id!, 10000);

    return { tab: newTab, searchUrl };
  } catch (error) {
    console.error('Error finding/creating search tab:', error);
    return null;
  }
}

// ============================================================================
// MESSENGER SYNC
// ============================================================================

interface ConversationApiResponse {
  conversations?: any[];
}

async function syncContactedListings(): Promise<number> {
  try {
    // Fetch ALL conversations using cursor-based pagination (timestampOfLastConversationPaginated)
    const allConversations: any[] = [];
    let cursor: string | null = null;
    let pageNum = 0;

    while (true) {
      const url = cursor
        ? `https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations?timestampOfLastConversationPaginated=${encodeURIComponent(cursor)}`
        : 'https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        if (pageNum === 0) {
          console.log('[Sync] Could not fetch conversations:', response.status);
          return 0;
        }
        break;
      }
      const data: ConversationApiResponse = await response.json();
      const conversations = data.conversations || [];
      if (conversations.length === 0) break;

      allConversations.push(...conversations);
      pageNum++;
      console.log(
        `[Sync] Fetched page ${pageNum}: ${conversations.length} conversations (total: ${allConversations.length})`,
      );

      // Use the last conversation's timestamp as cursor for next page
      const lastTimestamp: string | undefined = conversations[conversations.length - 1]?.lastUpdateDateTime;
      if (!lastTimestamp) break;
      cursor = lastTimestamp;

      // Safety cap
      if (allConversations.length > 2000) break;
    }

    // Extract expose IDs, filter nulls
    const contactedIds = allConversations
      .map((c) => c.referenceId)
      .filter(Boolean)
      .map((id: string | number) => String(id).toLowerCase().trim());

    if (contactedIds.length === 0) return 0;

    // Merge into seen list
    const stored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
    const seenList: string[] = stored[C.STORAGE_KEY] || [];
    const seenSet = new Set(seenList.map((id: string) => String(id).toLowerCase().trim()));

    const newIds = contactedIds.filter((id: string) => !seenSet.has(id));
    if (newIds.length === 0) {
      console.log(`[Sync] All ${contactedIds.length} contacted listings already in seen list`);
      return 0;
    }

    const updatedSeen = capSeenListings([...seenList, ...newIds]);
    await chrome.storage.local.set({ [C.STORAGE_KEY]: updatedSeen });

    // Track total synced count
    const syncStored: Record<string, any> = await chrome.storage.local.get([C.SYNCED_CONTACTED_KEY]);
    await chrome.storage.local.set({
      [C.SYNCED_CONTACTED_KEY]: (syncStored[C.SYNCED_CONTACTED_KEY] || 0) + newIds.length,
    });

    console.log(`[Sync] Added ${newIds.length} contacted listing(s) to seen list:`, newIds.join(', '));
    return newIds.length;
  } catch (error) {
    console.error('[Sync] Error syncing conversations:', error);
    return 0;
  }
}

// ============================================================================
// CONVERSATION REPLY DETECTION
// ============================================================================

interface ConversationEntry {
  conversationId: string;
  referenceId: string | null;
  listingTitle: string;
  landlordName: string;
  salutation: string;
  lastUpdateDateTime: string;
  hasUnreadReply: boolean;
  lastMessagePreview: string;
  imageUrl: string;
  shortDetails: Record<string, any>;
  appointment: any;
  appointmentStatus: string | null;
  messages: ConversationMessage[];
  draftReply: string | null;
  draftStatus: string;
}

interface ConversationMessage {
  role: string;
  text: string;
  timestamp: string;
}

async function checkForNewReplies(): Promise<void> {
  try {
    // Fetch conversations from ImmoScout API
    const allConversations: any[] = [];
    let cursor: string | null = null;
    let pageNum = 0;

    while (true) {
      const url = cursor
        ? `https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations?timestampOfLastConversationPaginated=${encodeURIComponent(cursor)}`
        : 'https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        if (pageNum === 0) {
          console.log('[Conversations] Could not fetch conversations:', response.status);
          return;
        }
        break;
      }
      const data: ConversationApiResponse = await response.json();
      const conversations = data.conversations || [];
      if (conversations.length === 0) break;

      allConversations.push(...conversations);
      pageNum++;

      // Only check first 2 pages for replies (most recent conversations)
      if (pageNum >= 2) break;

      const lastTimestamp: string | undefined = conversations[conversations.length - 1]?.lastUpdateDateTime;
      if (!lastTimestamp) break;
      cursor = lastTimestamp;
    }

    if (allConversations.length === 0) {
      console.log('[Conversations] No conversations found');
      return;
    }

    // Load stored conversation state
    const stored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
    const storedMap: Record<string, ConversationEntry> = {};
    if (stored[C.CONVERSATIONS_KEY]) {
      for (const conv of stored[C.CONVERSATIONS_KEY]) {
        storedMap[conv.conversationId] = conv;
      }
    }

    let newReplyCount = 0;
    const updatedConversations: ConversationEntry[] = [];

    for (const conv of allConversations) {
      const conversationId: string = conv.conversationId;
      if (!conversationId) continue;

      const referenceId: string | undefined = conv.referenceId;
      const lastUpdate: string = conv.lastUpdateDateTime;
      const stored = storedMap[conversationId];

      // Field mapping (from API discovery)
      const landlordName: string = conv.participantName || '';
      const salutation: string = conv.salutation || '';
      const addr = conv.address;
      const listingTitle: string = addr
        ? `${addr.street || ''} ${addr.houseNumber || ''}, ${addr.postcode || ''} ${addr.city || ''}`.trim()
        : conv.referenceId
          ? `Expose ${conv.referenceId}`
          : '';
      const lastMessagePreview: string = conv.previewMessage || '';
      const hasUnread: boolean = conv.read === false;
      const imageUrl: string = conv.imageUrl || '';
      const shortDetails: Record<string, any> = conv.shortDetails?.details || {};
      const appointment: any = conv.appointment || null;

      // Check if this conversation has a new update
      const hasNewUpdate = !stored || stored.lastUpdateDateTime !== lastUpdate;

      // Determine appointment status — preserve user's action if already set
      const appointmentStatus: string | null = stored?.appointmentStatus || (appointment ? 'pending' : null);

      // Build conversation entry
      const convEntry: ConversationEntry = {
        conversationId,
        referenceId: referenceId ? String(referenceId) : null,
        listingTitle,
        landlordName,
        salutation,
        lastUpdateDateTime: lastUpdate,
        hasUnreadReply: hasUnread,
        lastMessagePreview,
        imageUrl,
        shortDetails,
        appointment,
        appointmentStatus,
        messages: stored?.messages || [],
        draftReply: stored?.draftReply || null,
        draftStatus: stored?.draftStatus || 'none',
      };

      // If unread, try to fetch conversation detail for message history
      if (hasUnread) {
        try {
          const detailMessages = await fetchConversationMessages(conversationId);
          if (detailMessages && detailMessages.length > 0) {
            convEntry.messages = detailMessages;
          }
        } catch (e: any) {
          console.warn(`[Conversations] Could not fetch detail for ${conversationId}:`, e.message);
        }

        // Only send desktop notification if this is a NEW reply (not first load)
        if (stored && hasNewUpdate) {
          newReplyCount++;
          console.log(
            `[Conversations] New reply in conversation ${conversationId} from ${landlordName} about "${listingTitle}"`,
          );

          // Send desktop notification
          try {
            chrome.notifications.create(`conv-reply-${conversationId}`, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'New reply from landlord',
              message: `${landlordName || 'Landlord'}: ${lastMessagePreview.substring(0, 100) || 'New message'}`,
              priority: 2,
            });
          } catch (_e) {
            /* notifications may fail */
          }

          // Log to activity
          await sendActivityLog({
            message: `New reply from ${landlordName || 'landlord'} about "${listingTitle || conversationId}"`,
            type: 'info',
          });
        }
      }

      updatedConversations.push(convEntry);
    }

    // Cap stored conversations
    const capped =
      updatedConversations.length > C.CONVERSATIONS_CAP
        ? updatedConversations.slice(0, C.CONVERSATIONS_CAP)
        : updatedConversations;

    // Count total unread
    const totalUnread = capped.filter((c) => c.hasUnreadReply).length;

    await chrome.storage.local.set({
      [C.CONVERSATIONS_KEY]: capped,
      [C.CONVERSATIONS_LAST_CHECK_KEY]: Date.now(),
      [C.CONV_UNREAD_COUNT_KEY]: totalUnread,
    });

    // Update badge
    if (totalUnread > 0) {
      chrome.action.setBadgeText({ text: String(totalUnread) });
      chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }

    if (newReplyCount > 0) {
      console.log(`[Conversations] Found ${newReplyCount} new replies (${totalUnread} total unread)`);
    } else {
      console.log(
        `[Conversations] No new replies (${allConversations.length} conversations checked, ${totalUnread} unread)`,
      );
    }

    // Notify popup
    try {
      await chrome.runtime.sendMessage({ action: 'conversationUpdate', unreadCount: totalUnread });
    } catch (_e) {
      /* popup closed */
    }
  } catch (error) {
    console.error('[Conversations] Error checking replies:', error);
  }
}

// Fetch individual conversation messages (API discovery + real fetch)
async function fetchConversationMessages(conversationId: string): Promise<ConversationMessage[] | null> {
  const endpoints = [`https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations/${conversationId}`];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        console.log(`[Conversations] Endpoint ${url} returned ${response.status}`);
        continue;
      }

      const data: any = await response.json();
      // Extract messages from the confirmed API structure
      const rawMessages = data.messages;
      if (rawMessages && rawMessages.length > 0) {
        return rawMessages
          .map((msg: any) => ({
            role: msg.userType === 'SEEKER' ? 'user' : 'landlord',
            text: msg.message || '',
            timestamp: msg.creationDateTime || '',
          }))
          .filter((m: ConversationMessage) => m.text);
      }

      console.log(`[Conversations] No messages found in response. Keys: ${Object.keys(data).join(', ')}`);
    } catch (e: any) {
      console.warn(`[Conversations] Error fetching ${url}:`, e.message);
    }
  }

  return null;
}

// Generate a draft reply using the AI server
async function generateDraftReply(
  conversation: ConversationEntry,
  serverUrl: string,
  apiKey: string | undefined,
  userContext: string = '',
): Promise<void> {
  if (!conversation.messages || conversation.messages.length === 0) return;

  try {
    // Load user profile for context
    const profileKeys = [
      C.PROFILE_NAME_KEY,
      C.PROFILE_AGE_KEY,
      C.PROFILE_OCCUPATION_KEY,
      C.PROFILE_LANGUAGES_KEY,
      C.PROFILE_MOVING_REASON_KEY,
      C.PROFILE_CURRENT_NEIGHBORHOOD_KEY,
      C.PROFILE_STRENGTHS_KEY,
      C.PROFILE_MAX_WARMMIETE_KEY,
      C.AI_ABOUT_ME_KEY,
      C.FORM_ADULTS_KEY,
      C.FORM_CHILDREN_KEY,
      C.FORM_PETS_KEY,
      C.FORM_SMOKER_KEY,
      C.FORM_INCOME_KEY,
      C.FORM_INCOME_RANGE_KEY,
      C.FORM_PHONE_KEY,
    ];
    const profileData: Record<string, any> = await chrome.storage.local.get(profileKeys);

    const response = await fetch(`${serverUrl}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationHistory: conversation.messages,
        userProfile: {
          adults: profileData[C.FORM_ADULTS_KEY],
          children: profileData[C.FORM_CHILDREN_KEY],
          pets: profileData[C.FORM_PETS_KEY],
          smoker: profileData[C.FORM_SMOKER_KEY],
          income: profileData[C.FORM_INCOME_KEY],
          incomeRange: profileData[C.FORM_INCOME_RANGE_KEY],
          aboutMe: profileData[C.AI_ABOUT_ME_KEY],
          phone: profileData[C.FORM_PHONE_KEY],
        },
        landlordInfo: {
          name: conversation.landlordName,
        },
        listingTitle: conversation.listingTitle,
        userContext: userContext || undefined,
        apiKey: apiKey || undefined,
        profile: {
          name: profileData[C.PROFILE_NAME_KEY],
          age: profileData[C.PROFILE_AGE_KEY] ? Number(profileData[C.PROFILE_AGE_KEY]) : undefined,
          occupation: profileData[C.PROFILE_OCCUPATION_KEY],
          languages: profileData[C.PROFILE_LANGUAGES_KEY]
            ? profileData[C.PROFILE_LANGUAGES_KEY].split(',').map((l: string) => l.trim())
            : undefined,
          movingReason: profileData[C.PROFILE_MOVING_REASON_KEY],
          currentNeighborhood: profileData[C.PROFILE_CURRENT_NEIGHBORHOOD_KEY],
          strengths: profileData[C.PROFILE_STRENGTHS_KEY]
            ? profileData[C.PROFILE_STRENGTHS_KEY].split(',').map((s: string) => s.trim())
            : undefined,
          maxWarmmiete: profileData[C.PROFILE_MAX_WARMMIETE_KEY]
            ? Number(profileData[C.PROFILE_MAX_WARMMIETE_KEY])
            : undefined,
        },
      }),
    });

    if (!response.ok) {
      console.error(`[Conversations] Draft reply API error: ${response.status}`);
      await updateConversationDraft(conversation.conversationId, null, 'none');
      return;
    }

    const result: any = await response.json();
    if (result.reply) {
      await updateConversationDraft(conversation.conversationId, result.reply, 'ready');
      console.log(
        `[Conversations] Draft reply generated for ${conversation.conversationId} (${result.reply.length} chars)`,
      );

      // Track token usage
      if (result.usage) {
        const usageStored: Record<string, any> = await chrome.storage.local.get([
          C.AI_USAGE_PROMPT_TOKENS_KEY,
          C.AI_USAGE_COMPLETION_TOKENS_KEY,
        ]);
        await chrome.storage.local.set({
          [C.AI_USAGE_PROMPT_TOKENS_KEY]:
            (usageStored[C.AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (result.usage.promptTokens || 0),
          [C.AI_USAGE_COMPLETION_TOKENS_KEY]:
            (usageStored[C.AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (result.usage.completionTokens || 0),
        });
      }

      // Notify popup
      try {
        await chrome.runtime.sendMessage({ action: 'conversationUpdate' });
      } catch (_e) {
        /* popup closed */
      }
    } else {
      await updateConversationDraft(conversation.conversationId, null, 'none');
    }
  } catch (error) {
    console.error(`[Conversations] Error generating draft:`, error);
    await updateConversationDraft(conversation.conversationId, null, 'none');
  }
}

// Update a single conversation's draft in storage
async function updateConversationDraft(
  conversationId: string,
  draftReply: string | null,
  draftStatus: string,
): Promise<void> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
  if (!stored[C.CONVERSATIONS_KEY]) return;

  const updated = stored[C.CONVERSATIONS_KEY].map((c: ConversationEntry) => {
    if (c.conversationId === conversationId) {
      return { ...c, draftReply, draftStatus };
    }
    return c;
  });

  await chrome.storage.local.set({ [C.CONVERSATIONS_KEY]: updated });
}

// Update a single conversation's appointment status in storage
async function updateAppointmentStatus(conversationId: string, appointmentStatus: string): Promise<void> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
  if (!stored[C.CONVERSATIONS_KEY]) return;

  const updated = stored[C.CONVERSATIONS_KEY].map((c: ConversationEntry) => {
    if (c.conversationId === conversationId) {
      return { ...c, appointmentStatus };
    }
    return c;
  });

  await chrome.storage.local.set({ [C.CONVERSATIONS_KEY]: updated });
  try {
    await chrome.runtime.sendMessage({ action: 'conversationUpdate' });
  } catch (_e) {
    /* popup closed */
  }
}

// ============================================================================
// LISTING DETECTION
// ============================================================================

interface Listing {
  id: string;
  url: string;
  title?: string;
  [key: string]: any;
}

async function _markAllCurrentListingsAsSeen(): Promise<void> {
  const result = await findOrCreateSearchTab();

  if (!result) {
    console.log('No search tab found. Will mark listings as seen on first check.');
    return;
  }

  const { tab, searchUrl } = result;

  await chrome.tabs.update(tab.id!, { url: searchUrl });
  await waitForTabLoad(tab.id!, 15000);
  await new Promise((resolve) => setTimeout(resolve, humanDelay(2000, 1000)));

  try {
    const results: any = await chrome.tabs.sendMessage(tab.id!, { action: 'extractListings' });
    const allListings: Listing[] = results?.listings || [];

    // Check for additional pages
    let paginationInfo = { currentPage: 1, totalPages: 1 };
    try {
      paginationInfo = await chrome.tabs.sendMessage(tab.id!, { action: 'extractPaginationInfo' });
    } catch (_e) {
      /* single page fallback */
    }

    const maxPages = Math.min(paginationInfo.totalPages, 3);
    for (let page = 2; page <= maxPages; page++) {
      const pageUrl = new URL(searchUrl);
      pageUrl.searchParams.set('pagenumber', String(page));

      await chrome.tabs.update(tab.id!, { url: pageUrl.toString() });
      await waitForTabLoad(tab.id!, 15000);
      await new Promise((r) => setTimeout(r, humanDelay(3000, 2000)));

      const pageResults: any = await chrome.tabs.sendMessage(tab.id!, { action: 'extractListings' });
      if (pageResults?.listings?.length) {
        allListings.push(...pageResults.listings);
      } else {
        break;
      }
    }

    if (allListings.length > 0) {
      const stored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
      const seenList: string[] = stored[C.STORAGE_KEY] || [];
      const seenSet = new Set(seenList.map((id: string) => String(id).toLowerCase().trim()));

      const newSeenIds = allListings
        .map((listing) => String(listing.id).toLowerCase().trim())
        .filter((id) => id && !seenSet.has(id));

      if (newSeenIds.length > 0) {
        const updatedSeen = capSeenListings([...seenList, ...newSeenIds]);
        await chrome.storage.local.set({ [C.STORAGE_KEY]: updatedSeen });
        console.log(
          `Marked ${newSeenIds.length} existing listings as seen (from ${maxPages} page(s)):`,
          newSeenIds.join(', '),
        );
      } else {
        console.log('All listings already in seen list.');
      }
    } else {
      console.log('No listings found on page to mark as seen.');
    }
  } catch (error) {
    console.error('Error extracting listings for initial seen marking:', error);
  }
}

// Send activity log entry to popup + persist to storage
async function sendActivityLog(data: Record<string, any>): Promise<void> {
  // Persist to storage
  try {
    const stored: Record<string, any> = await chrome.storage.local.get([C.ACTIVITY_LOG_KEY]);
    const log: any[] = stored[C.ACTIVITY_LOG_KEY] || [];
    const entry = { ...data, timestamp: Date.now() };
    log.push(entry);
    if (log.length > C.ACTIVITY_LOG_CAP) log.splice(0, log.length - C.ACTIVITY_LOG_CAP);
    await chrome.storage.local.set({ [C.ACTIVITY_LOG_KEY]: log });
  } catch (_e) {
    /* storage error */
  }

  // Send to popup (may be closed)
  try {
    await chrome.runtime.sendMessage({ action: 'activityLog', ...data });
  } catch (_e) {
    /* popup closed */
  }
}

async function checkForNewListings(): Promise<void> {
  try {
    await sendActivityLog({ message: `[${new Date().toLocaleTimeString()}] Checking for new listings...` });
    await syncContactedListings();

    const result = await findOrCreateSearchTab();

    if (!result) {
      console.log('Could not find or create search tab. Check your Search URL setting.');
      return;
    }

    const { tab, searchUrl } = result;
    searchTabId = tab.id!;

    // Check if tab is already showing the search page (skip reload)
    let needsReload = true;
    try {
      const currentTab = await chrome.tabs.get(searchTabId);
      const currentUrl = new URL(currentTab.url!);
      const targetUrl = new URL(searchUrl);
      if (currentUrl.origin === targetUrl.origin && currentUrl.pathname === targetUrl.pathname) {
        // URL matches — check if content script is alive
        try {
          await chrome.tabs.sendMessage(searchTabId, { action: 'ping' });
          needsReload = false;
          console.log(
            `[${new Date().toLocaleTimeString()}] Search tab already loaded, content script ready — extracting...`,
          );
        } catch {
          console.log(
            `[${new Date().toLocaleTimeString()}] Search tab URL matches but content script not available — reloading...`,
          );
        }
      }
    } catch {
      /* reload as fallback */
    }

    if (needsReload) {
      console.log(`[${new Date().toLocaleTimeString()}] Reloading search page...`);
      await chrome.tabs.update(searchTabId, { url: searchUrl });
      await waitForTabLoad(searchTabId, 15000);
      await new Promise((resolve) => setTimeout(resolve, humanDelay(2000, 1000)));
    }

    if (!isMonitoring) return;

    await chrome.storage.local.set({ [C.LAST_CHECK_TIME_KEY]: Date.now() });

    try {
      await chrome.tabs.get(searchTabId);
      const results: any = await chrome.tabs.sendMessage(searchTabId, { action: 'extractListings' });
      const allListings: Listing[] = results?.listings || [];

      // Check for additional pages
      let paginationInfo = { currentPage: 1, totalPages: 1 };
      try {
        paginationInfo = await chrome.tabs.sendMessage(searchTabId, { action: 'extractPaginationInfo' });
      } catch (_e) {
        /* single page fallback */
      }

      const maxPages = Math.min(paginationInfo.totalPages, 3);
      for (let page = 2; page <= maxPages; page++) {
        if (!isMonitoring) break;

        const pageUrl = new URL(searchUrl);
        pageUrl.searchParams.set('pagenumber', String(page));

        await chrome.tabs.update(searchTabId, { url: pageUrl.toString() });
        await waitForTabLoad(searchTabId, 15000);
        await new Promise((r) => setTimeout(r, humanDelay(3000, 2000)));

        const pageResults: any = await chrome.tabs.sendMessage(searchTabId, { action: 'extractListings' });
        if (pageResults?.listings?.length) {
          allListings.push(...pageResults.listings);
          console.log(`[Pagination] Page ${page}: ${pageResults.listings.length} listings`);
        } else {
          break;
        }
      }

      if (maxPages > 1) {
        console.log(`[Pagination] Total: ${allListings.length} listings from ${maxPages} pages`);
      }

      // Summary log
      const stored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
      const seenSet = new Set((stored[C.STORAGE_KEY] || []).map((id: string) => String(id).toLowerCase().trim()));
      const dedupMap = new Map<string, Listing>();
      for (const listing of allListings) {
        const id = String(listing.id || '')
          .toLowerCase()
          .trim();
        if (id && listing.url && !dedupMap.has(id)) dedupMap.set(id, listing);
      }
      const newCount = [...dedupMap.keys()].filter((id) => !seenSet.has(id)).length;
      if (newCount > 0) {
        await sendActivityLog({ message: `Found ${dedupMap.size} listings, ${newCount} new` });
      } else {
        await sendActivityLog({ message: `Found ${dedupMap.size} listings, none new` });
      }

      // Enqueue new listings, then process the queue
      await enqueueListings(allListings, 'auto');
      await processQueue();
    } catch (error) {
      console.error('Error extracting listings:', error);
      searchTabId = null;
    }
  } catch (error) {
    console.error('Error checking for new listings:', error);
    searchTabId = null;
  }
}

// ============================================================================
// UNIFIED QUEUE: ENQUEUE + PROCESS
// ============================================================================

interface QueueItem {
  id: string;
  url: string;
  title: string;
  source: string;
  addedAt: number;
  retries: number;
}

// Enqueue listings into the shared queue (used by both auto-discovery and manual capture)
async function enqueueListings(listings: Listing[], source: string): Promise<number> {
  if (!listings || listings.length === 0) return 0;

  // Deduplicate input by ID
  const dedupMap = new Map<string, Listing>();
  for (const listing of listings) {
    const id = String(listing.id || '')
      .toLowerCase()
      .trim();
    if (id && listing.url && !dedupMap.has(id)) {
      dedupMap.set(id, listing);
    }
  }

  const stored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY, C.QUEUE_KEY]);

  const seenSet = new Set((stored[C.STORAGE_KEY] || []).map((id: string) => String(id).toLowerCase().trim()));
  const queueSet = new Set((stored[C.QUEUE_KEY] || []).map((item: QueueItem) => String(item.id).toLowerCase().trim()));

  const addedAt = Date.now();
  const newItems: QueueItem[] = [];

  for (const [id, listing] of dedupMap) {
    if (!seenSet.has(id) && !queueSet.has(id)) {
      newItems.push({
        id,
        url: listing.url,
        title: listing.title || '',
        source,
        addedAt,
        retries: 0,
      });
    }
  }

  if (newItems.length === 0) {
    console.log(`[Queue] No new items to enqueue (${dedupMap.size} input, all seen or already queued)`);
    return 0;
  }

  const updatedQueue = [...(stored[C.QUEUE_KEY] || []), ...newItems];
  await chrome.storage.local.set({ [C.QUEUE_KEY]: updatedQueue });

  console.log(
    `[Queue] Enqueued ${newItems.length} ${source} items (${dedupMap.size - newItems.length} filtered as seen/duplicate)`,
  );
  await sendActivityLog({
    message: `Enqueued ${newItems.length} ${source} listing${newItems.length !== 1 ? 's' : ''} (${updatedQueue.length} total in queue)`,
  });

  return newItems.length;
}

// Unified queue processor — drains the shared queue (FIFO)
async function processQueue(): Promise<void> {
  if (isProcessingQueue) {
    console.log('[Queue] Already processing — skipping');
    return;
  }

  // Guard: only process when monitoring or user triggered
  if (!isMonitoring && !userTriggeredProcessing) {
    console.log('[Queue] Not monitoring and no user trigger — skipping');
    return;
  }

  isProcessingQueue = true;
  queueAbortRequested = false;
  await chrome.storage.local.set({ [C.QUEUE_PROCESSING_KEY]: true });

  console.log('[Queue] Starting unified queue processing');

  try {
    while (!queueAbortRequested) {
      if (!isMonitoring && !userTriggeredProcessing) break;

      const stored: Record<string, any> = await chrome.storage.local.get([C.QUEUE_KEY]);
      const queue: QueueItem[] = stored[C.QUEUE_KEY] || [];

      if (queue.length === 0) {
        console.log('[Queue] Queue empty — processing complete');
        await sendActivityLog({ message: 'Queue empty — processing complete' });
        break;
      }

      const item = queue[0];
      const remaining = queue.slice(1);
      const normalizedId = String(item.id).toLowerCase().trim();

      // Skip if already in seen list
      const seenStored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
      const seenSet = new Set((seenStored[C.STORAGE_KEY] || []).map((id: string) => String(id).toLowerCase().trim()));
      if (seenSet.has(normalizedId)) {
        console.log(`[Queue] ${normalizedId} already seen — removing from queue`);
        await chrome.storage.local.set({ [C.QUEUE_KEY]: remaining });
        await sendActivityLog({ message: `Skipped ${item.title || normalizedId} (already contacted)` });
        continue;
      }

      // Skip if max retries exceeded
      if (item.retries >= C.QUEUE_MAX_RETRIES) {
        console.log(`[Queue] ${normalizedId} exceeded max retries (${item.retries}) — dropping`);
        await chrome.storage.local.set({ [C.QUEUE_KEY]: remaining });
        await sendActivityLog({
          message: `Dropped ${item.title || normalizedId} (failed ${item.retries}x)`,
          type: 'wait',
        });
        continue;
      }

      await sendActivityLog({ current: { id: normalizedId, title: item.title || 'untitled', url: item.url } });

      // Check rate limit
      const rateLimitCheck = await checkRateLimit();
      if (!rateLimitCheck.allowed) {
        const waitSec = Math.round(rateLimitCheck.waitTime! / 1000);
        console.log(`[Queue] Rate limit — waiting ${waitSec}s`);
        await sendActivityLog({ message: `Rate limit — waiting ${waitSec}s...`, type: 'wait' });
        await new Promise((resolve) => setTimeout(resolve, rateLimitCheck.waitTime!));
        if (queueAbortRequested) break;
        const recheck = await checkRateLimit();
        if (!recheck.allowed) {
          console.log('[Queue] Rate limit still exceeded — pausing');
          break;
        }
      }

      // Process the listing
      try {
        const result = await handleNewListing(item);

        if (result?.success) {
          // Success: remove from queue, mark as seen
          const freshSeen: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
          const freshList: string[] = freshSeen[C.STORAGE_KEY] || [];
          const freshSet = new Set(freshList.map((id: string) => String(id).toLowerCase().trim()));

          if (!freshSet.has(normalizedId)) {
            const updatedSeen = capSeenListings([...freshList, normalizedId]);
            await chrome.storage.local.set({ [C.STORAGE_KEY]: updatedSeen, [C.QUEUE_KEY]: remaining });
          } else {
            await chrome.storage.local.set({ [C.QUEUE_KEY]: remaining });
          }

          console.log(`[Queue] Processed ${normalizedId} — ${remaining.length} remaining`);
          await sendActivityLog({
            lastResult: result.skipped ? 'skipped' : 'success',
            lastId: item.id,
            lastTitle: item.title || '',
          });
        } else {
          // Failure: increment retries, move to end
          const updatedItem = { ...item, retries: (item.retries || 0) + 1 };
          await chrome.storage.local.set({ [C.QUEUE_KEY]: [...remaining, updatedItem] });
          console.log(
            `[Queue] ${normalizedId} failed (attempt ${updatedItem.retries}/${C.QUEUE_MAX_RETRIES}) — moved to end`,
          );
          await sendActivityLog({
            lastResult: 'failed',
            lastId: item.id,
            lastTitle: item.title || '',
            error: result?.error,
          });
        }
      } catch (error: any) {
        console.error('[Queue] Error processing listing:', error);
        const updatedItem = { ...item, retries: (item.retries || 0) + 1 };
        await chrome.storage.local.set({ [C.QUEUE_KEY]: [...remaining, updatedItem] });
        await sendActivityLog({
          lastResult: 'failed',
          lastId: item.id,
          lastTitle: item.title || '',
          error: error.message,
        });
      }

      // Human delay between listings
      const delay = humanDelay(2000, 1000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  } finally {
    isProcessingQueue = false;
    queueAbortRequested = false;
    userTriggeredProcessing = false;
    await chrome.storage.local.set({ [C.QUEUE_PROCESSING_KEY]: false });
    console.log('[Queue] Processing loop exited');
    try {
      await chrome.runtime.sendMessage({ action: 'queueDone' });
    } catch (_e) {
      /* popup closed */
    }
  }
}

// ============================================================================
// AI ANALYSIS
// ============================================================================

interface UserProfile {
  name?: string;
  age?: number;
  occupation?: string;
  languages?: string[];
  movingReason?: string;
  currentNeighborhood?: string;
  idealApartment?: string;
  dealbreakers?: string[];
  strengths?: string[];
  maxWarmmiete?: number;
}

async function getProfile(): Promise<UserProfile> {
  const keys = [
    C.PROFILE_NAME_KEY,
    C.PROFILE_AGE_KEY,
    C.PROFILE_OCCUPATION_KEY,
    C.PROFILE_LANGUAGES_KEY,
    C.PROFILE_MOVING_REASON_KEY,
    C.PROFILE_CURRENT_NEIGHBORHOOD_KEY,
    C.PROFILE_IDEAL_APARTMENT_KEY,
    C.PROFILE_DEALBREAKERS_KEY,
    C.PROFILE_STRENGTHS_KEY,
    C.PROFILE_MAX_WARMMIETE_KEY,
  ];
  const stored: Record<string, any> = await chrome.storage.local.get(keys);
  const parseList = (val: string | undefined): string[] =>
    val
      ? val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  return {
    name: stored[C.PROFILE_NAME_KEY] || undefined,
    age: stored[C.PROFILE_AGE_KEY] ? parseInt(stored[C.PROFILE_AGE_KEY], 10) : undefined,
    occupation: stored[C.PROFILE_OCCUPATION_KEY] || undefined,
    languages: parseList(stored[C.PROFILE_LANGUAGES_KEY]),
    movingReason: stored[C.PROFILE_MOVING_REASON_KEY] || undefined,
    currentNeighborhood: stored[C.PROFILE_CURRENT_NEIGHBORHOOD_KEY] || undefined,
    idealApartment: stored[C.PROFILE_IDEAL_APARTMENT_KEY] || undefined,
    dealbreakers: parseList(stored[C.PROFILE_DEALBREAKERS_KEY]),
    strengths: parseList(stored[C.PROFILE_STRENGTHS_KEY]),
    maxWarmmiete: stored[C.PROFILE_MAX_WARMMIETE_KEY] ? parseInt(stored[C.PROFILE_MAX_WARMMIETE_KEY], 10) : undefined,
  };
}

interface AIAnalysisResult {
  score: number;
  skip: boolean;
  message?: string;
  reason?: string;
  summary?: string;
  flags?: string[];
  usage?: { promptTokens?: number; completionTokens?: number };
}

interface FormValues {
  adults: number;
  children: number;
  pets: string;
  smoker: string;
  income: number;
  householdSize: string;
  employmentType: string;
  incomeRange: string;
  documents: string;
  salutation: string;
  phone: string;
}

async function tryAIAnalysis(
  tabId: number,
  landlordTitle: string | null,
  landlordName: string | null,
  isPrivateLandlord: boolean,
  formValues: FormValues,
  messageTemplate: string,
  isTenantNetwork: boolean = false,
): Promise<AIAnalysisResult | null> {
  try {
    const aiSettings: Record<string, any> = await chrome.storage.local.get([
      C.AI_ENABLED_KEY,
      C.AI_API_KEY_KEY,
      C.AI_SERVER_URL_KEY,
      C.AI_MIN_SCORE_KEY,
      C.AI_ABOUT_ME_KEY,
    ]);

    if (!aiSettings[C.AI_ENABLED_KEY]) return null;

    const serverUrl: string = aiSettings[C.AI_SERVER_URL_KEY] || 'http://localhost:3456';
    const minScore: number = aiSettings[C.AI_MIN_SCORE_KEY] || 5;
    const apiKey: string | undefined = aiSettings[C.AI_API_KEY_KEY] || undefined;
    const profile = await getProfile();

    // Extract listing details from the page
    let listingDetails: any;
    try {
      listingDetails = await chrome.tabs.sendMessage(tabId, { action: 'extractListingDetails' });
    } catch (e: any) {
      console.error('[AI] Failed to extract listing details:', e.message);
      return null;
    }

    if (!listingDetails) return null;

    const payload = {
      listingDetails,
      landlordInfo: { title: landlordTitle, name: landlordName, isPrivate: isPrivateLandlord, isTenantNetwork },
      userProfile: {
        ...formValues,
        aboutMe: aiSettings[C.AI_ABOUT_ME_KEY] || '',
      },
      messageTemplate,
      minScore,
      apiKey,
      profile,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${serverUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[AI] Server returned ${response.status}`);
        return null;
      }

      const result: AIAnalysisResult = await response.json();

      // Update AI stats
      const stats: Record<string, any> = await chrome.storage.local.get([
        C.AI_LISTINGS_SCORED_KEY,
        C.AI_LISTINGS_SKIPPED_KEY,
        C.AI_USAGE_PROMPT_TOKENS_KEY,
        C.AI_USAGE_COMPLETION_TOKENS_KEY,
      ]);
      const updates: Record<string, number> = {
        [C.AI_LISTINGS_SCORED_KEY]: (stats[C.AI_LISTINGS_SCORED_KEY] || 0) + 1,
      };
      if (result.skip) {
        updates[C.AI_LISTINGS_SKIPPED_KEY] = (stats[C.AI_LISTINGS_SKIPPED_KEY] || 0) + 1;
      }
      if (result.usage) {
        updates[C.AI_USAGE_PROMPT_TOKENS_KEY] =
          (stats[C.AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (result.usage.promptTokens || 0);
        updates[C.AI_USAGE_COMPLETION_TOKENS_KEY] =
          (stats[C.AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (result.usage.completionTokens || 0);
      }
      await chrome.storage.local.set(updates);

      console.log(`[AI] Score: ${result.score}/10, Skip: ${result.skip}, Message: ${result.message ? 'yes' : 'no'}`);
      return result;
    } catch (e: any) {
      clearTimeout(timeout);
      console.error('[AI] Fetch error:', e.message);
      return null;
    }
  } catch (e: any) {
    console.error('[AI] Unexpected error:', e.message);
    return null;
  }
}

interface CaptchaResult {
  solved: boolean;
  messageSent: boolean;
  unverified?: boolean;
}

async function trySolveCaptcha(
  tabId: number,
  serverUrl: string,
  apiKey: string | undefined,
): Promise<CaptchaResult | false> {
  let sentSolution = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`[Captcha] Attempt ${attempt}/2 — detecting...`);

    // If we sent a solution on the previous attempt and got "channel closed",
    // the page likely navigated after successful captcha → wait for it to load
    if (sentSolution) {
      console.log('[Captcha] Previous attempt sent solution — waiting for page to settle...');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Try to ping the content script — page may have reloaded
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      } catch (_e) {
        // Content script not ready — wait for tab to finish loading
        await waitForTabLoad(tabId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    let detection: any;
    try {
      detection = await chrome.tabs.sendMessage(tabId, { action: 'detectCaptcha' });
    } catch (e: any) {
      if (sentSolution) {
        // Sent a solution and now can't talk to page — wait for it to load and verify
        console.log('[Captcha] Page unreachable after sending solution — waiting for reload...');
        try {
          await waitForTabLoad(tabId);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const pageCheck: any = await chrome.tabs.sendMessage(tabId, { action: 'checkMessageSent' });
          if (pageCheck?.messageSent) {
            console.log('[Captcha] Confirmed: message was sent after page reload');
            return { solved: true, messageSent: true };
          }
          console.warn('[Captcha] Page reloaded but no confirmation found. Page:', pageCheck?.url);
          return { solved: false, messageSent: false };
        } catch (e2: any) {
          console.warn('[Captcha] Cannot verify after page reload:', e2.message);
          return { solved: true, messageSent: false, unverified: true };
        }
      }
      console.error('[Captcha] Detection failed:', e.message);
      return false;
    }

    if (!detection?.hasCaptcha) {
      if (sentSolution) {
        // Captcha is gone after we sent a solution — but was the message actually sent?
        // Check the page for confirmation instead of blindly assuming success
        console.log('[Captcha] Captcha gone after sending solution — verifying message delivery...');
        try {
          const pageCheck: any = await chrome.tabs.sendMessage(tabId, { action: 'checkMessageSent' });
          if (pageCheck?.messageSent) {
            console.log('[Captcha] Confirmed: message was sent');
            return { solved: true, messageSent: true };
          }
          if (pageCheck?.hasCaptcha) {
            console.log('[Captcha] New captcha appeared — previous solution was wrong');
            // Continue the loop to try again (but we're likely out of attempts)
            sentSolution = false;
            continue;
          }
          if (pageCheck?.hasContactForm) {
            console.log('[Captcha] Contact form still present — captcha solved but message not sent yet');
            return { solved: true, messageSent: false };
          }
          // No confirmation, no form, no captcha — page likely reloaded (wrong captcha)
          console.warn('[Captcha] No confirmation found on page — captcha likely failed. Page:', pageCheck?.url);
          return { solved: false, messageSent: false };
        } catch (e) {
          // Can't talk to page at all — it navigated away completely
          console.warn('[Captcha] Cannot verify page state:', (e as any).message);
          // Could be success (navigated to confirmation) or failure (page reloaded)
          // Be conservative: report as unverified
          return { solved: true, messageSent: false, unverified: true };
        }
      }
      console.log('[Captcha] No captcha detected');
      return { solved: true, messageSent: false };
    }

    if (!detection.imageBase64) {
      console.error('[Captcha] Captcha detected but no image:', detection.error);
      return false;
    }

    console.log('[Captcha] Captcha detected, sending to AI server...');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${serverUrl}/captcha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: detection.imageBase64, apiKey }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const result: any = await response.json();

      if (result.usage) {
        const usageStats: Record<string, any> = await chrome.storage.local.get([
          C.AI_USAGE_PROMPT_TOKENS_KEY,
          C.AI_USAGE_COMPLETION_TOKENS_KEY,
        ]);
        await chrome.storage.local.set({
          [C.AI_USAGE_PROMPT_TOKENS_KEY]:
            (usageStats[C.AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (result.usage.promptTokens || 0),
          [C.AI_USAGE_COMPLETION_TOKENS_KEY]:
            (usageStats[C.AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (result.usage.completionTokens || 0),
        });
      }

      if (!result.text) {
        console.error('[Captcha] Server could not solve:', result.error);
        return false;
      }

      console.log(`[Captcha] Solution: "${result.text}", filling...`);
      sentSolution = true;

      const solveResult: any = await chrome.tabs.sendMessage(tabId, {
        action: 'solveCaptcha',
        text: result.text,
      });

      if (solveResult?.success) {
        if (solveResult.messageSent) {
          console.log('[Captcha] Solved — message was sent successfully');
          return { solved: true, messageSent: true };
        }
        console.log('[Captcha] Solved successfully');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return { solved: true, messageSent: false };
      }

      console.warn(`[Captcha] Attempt ${attempt} failed:`, solveResult?.error);
    } catch (e: any) {
      console.error(`[Captcha] Attempt ${attempt} error:`, e.message);
      // If we just sent a solution and got channel closed, loop will handle it
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.error('[Captcha] All attempts failed');
  return false;
}

// ============================================================================
// ACTIVITY LOGGING
// ============================================================================

async function logActivity(entry: Record<string, any>): Promise<void> {
  try {
    const aiSettings: Record<string, any> = await chrome.storage.local.get([C.AI_ENABLED_KEY, C.AI_SERVER_URL_KEY]);
    if (!aiSettings[C.AI_ENABLED_KEY]) return;
    const serverUrl: string = aiSettings[C.AI_SERVER_URL_KEY] || 'http://localhost:3456';
    await fetch(`${serverUrl}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch (_e) {
    // Logging is best-effort, don't block on failure
  }
}

// ============================================================================
// MESSAGE SENDING
// ============================================================================

interface HandleListingResult {
  success: boolean;
  listing?: Listing | QueueItem;
  skipped?: boolean;
  error?: string;
}

async function handleNewListing(listing: Listing | QueueItem): Promise<HandleListingResult> {
  console.log('Processing new listing:', listing.url);

  await new Promise((resolve) => setTimeout(resolve, humanDelay(500, 300)));
  const listingTab = await chrome.tabs.create({ url: listing.url, active: true });
  const currentListingTabId = listingTab.id!;

  // Wait for page load via event instead of fixed delay
  await waitForTabLoad(currentListingTabId, 10000);

  if (!isMonitoring && !isProcessingQueue) {
    console.log('Monitoring/queue stopped, skipping message sending');
    return { success: false, listing };
  }

  try {
    // Wait for content script to be ready
    let contentScriptReady = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await chrome.tabs.sendMessage(currentListingTabId, { action: 'ping' });
        contentScriptReady = true;
        break;
      } catch (_error) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!contentScriptReady) {
      console.error('Content script not ready after waiting');
      try {
        await chrome.tabs.remove(currentListingTabId);
      } catch (_e) {
        /* ignore */
      }
      return { success: false, listing, error: 'Content script not ready' };
    }

    await new Promise((resolve) => setTimeout(resolve, humanDelay(1000, 500)));

    if (!isMonitoring && !isProcessingQueue) {
      console.log('Monitoring/queue stopped during processing, aborting');
      return { success: false, listing };
    }

    // Detect listing type (tenant-network vs standard)
    let isTenantNetwork = false;
    try {
      const listingType: any = await chrome.tabs.sendMessage(currentListingTabId, { action: 'detectListingType' });
      isTenantNetwork = listingType?.isTenantNetwork || false;
      if (isTenantNetwork && !listingType?.hasContactForm) {
        console.log(`[Skip] ${listing.id} is a tenant-network listing with no contact form — marking as seen`);
        await sendActivityLog({ message: `Skipped ${listing.id} (tenant-network, no contact form)`, type: 'wait' });
        try {
          await chrome.tabs.remove(currentListingTabId);
        } catch (_e) {
          /* ignore */
        }
        return { success: true, listing, skipped: true };
      }
      if (isTenantNetwork) {
        console.log(`[Info] ${listing.id} is a tenant-network listing with contact form — proceeding`);
      }
    } catch (_e) {
      /* proceed if detection fails */
    }

    const nameResult: any = await chrome.tabs.sendMessage(currentListingTabId, { action: 'extractLandlordName' });
    const landlordTitle: string | null = nameResult?.title || null;
    const landlordName: string | null = nameResult?.name || null;
    const isPrivateLandlord: boolean = nameResult?.isPrivate || false;

    // Get message template and all form values (including smoker)
    const storageKeys = [
      C.MESSAGE_TEMPLATE_KEY,
      C.AUTO_SEND_MODE_KEY,
      C.FORM_ADULTS_KEY,
      C.FORM_CHILDREN_KEY,
      C.FORM_PETS_KEY,
      C.FORM_SMOKER_KEY,
      C.FORM_INCOME_KEY,
      C.FORM_HOUSEHOLD_SIZE_KEY,
      C.FORM_EMPLOYMENT_KEY,
      C.FORM_INCOME_RANGE_KEY,
      C.FORM_DOCUMENTS_KEY,
      C.FORM_SALUTATION_KEY,
      C.FORM_PHONE_KEY,
    ];
    const stored: Record<string, any> = await chrome.storage.local.get(storageKeys);

    const formValues: FormValues = {
      adults: stored[C.FORM_ADULTS_KEY] || 2,
      children: stored[C.FORM_CHILDREN_KEY] || 0,
      pets: stored[C.FORM_PETS_KEY] || 'Nein',
      smoker: stored[C.FORM_SMOKER_KEY] || 'Nein',
      income: stored[C.FORM_INCOME_KEY] || 2000,
      householdSize: stored[C.FORM_HOUSEHOLD_SIZE_KEY] || 'Einpersonenhaushalt',
      employmentType: stored[C.FORM_EMPLOYMENT_KEY] || 'Angestellte:r',
      incomeRange: stored[C.FORM_INCOME_RANGE_KEY] || '1.500 - 2.000',
      documents: stored[C.FORM_DOCUMENTS_KEY] || 'Vorhanden',
      salutation: stored[C.FORM_SALUTATION_KEY] || 'Frau',
      phone: stored[C.FORM_PHONE_KEY] || '',
    };

    // AI analysis: score listing and optionally generate message
    const aiResult = await tryAIAnalysis(
      currentListingTabId,
      landlordTitle,
      landlordName,
      isPrivateLandlord,
      formValues,
      stored[C.MESSAGE_TEMPLATE_KEY] || '',
      isTenantNetwork,
    );

    const landlordInfo = landlordTitle && landlordName ? `${landlordTitle} ${landlordName}` : landlordName || 'Unknown';

    // Log full AI analysis
    if (aiResult) {
      console.log(`[AI] ─── Analysis for ${listing.id} ───`);
      console.log(`[AI] Score: ${aiResult.score}/10 | Skip: ${aiResult.skip} | Landlord: ${landlordInfo}`);
      if (aiResult.reason) console.log(`[AI] Reason: ${aiResult.reason}`);
      if (aiResult.summary) console.log(`[AI] Summary: ${aiResult.summary}`);
      if (aiResult.flags?.length) console.log(`[AI] Flags: ${aiResult.flags.join(', ')}`);
      console.log(`[AI] ─────────────────────────────────`);

      // Send AI analysis to popup progress area
      const lines = [`  AI Score: ${aiResult.score}/10 | ${aiResult.skip ? 'SKIP' : 'SEND'}`];
      if (aiResult.reason) lines.push(`  Reason: ${aiResult.reason}`);
      if (aiResult.summary) lines.push(`  Summary: ${aiResult.summary}`);
      if (aiResult.flags?.length) lines.push(`  Flags: ${aiResult.flags.join(', ')}`);
      const analysisMsg = lines.join('\n');
      await sendActivityLog({ message: analysisMsg, type: 'analysis' });
    }

    // If AI says skip, notify and close tab
    if (aiResult?.skip) {
      console.log(`[AI] Skipping listing (score ${aiResult.score}/10): ${aiResult.reason}`);
      await sendActivityLog({ lastResult: 'skipped', lastId: listing.id, lastTitle: listing.title || '' });
      await logActivity({
        listingId: listing.id,
        title: listing.title,
        url: listing.url,
        score: aiResult.score,
        reason: aiResult.reason,
        action: 'skipped',
        landlord: landlordInfo,
      });
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: `Skipped (${aiResult.score}/10)`,
          message: `${landlordInfo}: ${aiResult.reason || listing.title || 'Low score'}`,
        });
      } catch (_e) {
        /* ignore */
      }

      try {
        await chrome.tabs.remove(currentListingTabId);
      } catch (_e) {
        /* ignore */
      }
      return { success: true, skipped: true, listing };
    }

    // Use AI message if available, otherwise fall back to template
    const personalizedMessage =
      aiResult?.message ||
      generatePersonalizedMessage(stored[C.MESSAGE_TEMPLATE_KEY] || '', landlordTitle, landlordName, isTenantNetwork);

    if (aiResult?.message) {
      console.log(`[AI] Using AI-generated message (score ${aiResult.score}/10)`);
    }

    await new Promise((resolve) => setTimeout(resolve, humanDelay(500, 300)));

    const isAutoSend = stored[C.AUTO_SEND_MODE_KEY] !== 'manual';
    let sendResult: any = null;
    try {
      sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
        action: 'sendMessage',
        message: personalizedMessage,
        formValues: formValues,
        autoSend: isAutoSend,
      });
    } catch (error: any) {
      console.error('Error sending message to content script:', error);
      try {
        await chrome.tabs.remove(currentListingTabId);
      } catch (_e) {
        /* ignore */
      }
      return { success: false, listing, error: error.message };
    }

    // Handle "message too long" error — ask AI to shorten, retry once
    if (sendResult && !sendResult.success && sendResult.messageTooLong) {
      const limit: number = sendResult.maxLength || 2000;
      console.warn(
        `[Message] Too long for form (${personalizedMessage.length} chars, limit: ${limit}) — asking AI to shorten`,
      );
      try {
        const aiSettings: Record<string, any> = await chrome.storage.local.get([
          C.AI_ENABLED_KEY,
          C.AI_API_KEY_KEY,
          C.AI_SERVER_URL_KEY,
        ]);
        const serverUrl: string = aiSettings[C.AI_SERVER_URL_KEY] || 'http://localhost:3456';
        const shortenApiKey: string | undefined = aiSettings[C.AI_API_KEY_KEY] || undefined;
        const shortenResponse = await fetch(`${serverUrl}/shorten`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: personalizedMessage, maxLength: limit, apiKey: shortenApiKey }),
        });
        if (shortenResponse.ok) {
          const shortenResult: any = await shortenResponse.json();
          const shortened: string = shortenResult.message;
          if (shortenResult.usage) {
            const usageStats: Record<string, any> = await chrome.storage.local.get([
              C.AI_USAGE_PROMPT_TOKENS_KEY,
              C.AI_USAGE_COMPLETION_TOKENS_KEY,
            ]);
            await chrome.storage.local.set({
              [C.AI_USAGE_PROMPT_TOKENS_KEY]:
                (usageStats[C.AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (shortenResult.usage.promptTokens || 0),
              [C.AI_USAGE_COMPLETION_TOKENS_KEY]:
                (usageStats[C.AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (shortenResult.usage.completionTokens || 0),
            });
          }
          if (shortened && shortened.length <= limit) {
            console.log(
              `[Message] AI shortened from ${personalizedMessage.length} to ${shortened.length} chars — retrying`,
            );
            sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
              action: 'sendMessage',
              message: shortened,
              formValues: formValues,
              autoSend: isAutoSend,
            });
          } else {
            console.warn(`[Message] AI shorten returned ${shortened?.length} chars (limit ${limit}) — hard truncating`);
            sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
              action: 'sendMessage',
              message: (shortened || personalizedMessage).substring(0, limit),
              formValues: formValues,
              autoSend: isAutoSend,
            });
          }
        } else {
          console.error(`[Message] Shorten API returned ${shortenResponse.status} — hard truncating`);
          sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
            action: 'sendMessage',
            message: personalizedMessage.substring(0, limit),
            formValues: formValues,
            autoSend: isAutoSend,
          });
        }
      } catch (e: any) {
        console.error('[Message] Error shortening message:', e.message);
      }
    }

    // Check for captcha after form submission
    if (sendResult && !sendResult.success && sendResult.error) {
      await sendActivityLog({ message: 'Captcha detected, solving...', type: 'wait' });
      const aiSettings: Record<string, any> = await chrome.storage.local.get([
        C.AI_ENABLED_KEY,
        C.AI_API_KEY_KEY,
        C.AI_SERVER_URL_KEY,
      ]);
      if (aiSettings[C.AI_ENABLED_KEY]) {
        const serverUrl: string = aiSettings[C.AI_SERVER_URL_KEY] || 'http://localhost:3456';
        const captchaApiKey: string | undefined = aiSettings[C.AI_API_KEY_KEY] || undefined;
        const captchaResult = await trySolveCaptcha(currentListingTabId, serverUrl, captchaApiKey);
        console.log('[Captcha] Result:', JSON.stringify(captchaResult));
        if (captchaResult && typeof captchaResult !== 'boolean' && captchaResult.messageSent) {
          // Captcha solved AND message confirmed sent
          console.log('[Captcha] Message confirmed sent after captcha resolution');
          sendResult = { success: true, messageSent: personalizedMessage };
        } else if (captchaResult && typeof captchaResult !== 'boolean' && captchaResult.solved) {
          // Captcha solved but message not sent yet — retry the full send
          console.log('[Captcha] Captcha solved, retrying message send...');
          try {
            sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
              action: 'sendMessage',
              message: personalizedMessage,
              formValues: formValues,
              autoSend: isAutoSend,
            });
          } catch (e: any) {
            console.error('Error retrying after captcha:', e.message);
          }
        } else {
          console.warn('[Captcha] Captcha was NOT solved — message not sent');
        }
      }
    }

    if (!sendResult || !sendResult.success) {
      const errorMsg = sendResult?.error || 'Unknown error';
      console.error(`Failed to send message to ${landlordInfo}: ${errorMsg}`);
      await sendActivityLog({
        lastResult: 'failed',
        lastId: listing.id,
        lastTitle: listing.title || '',
        error: errorMsg,
      });
      await logActivity({
        listingId: listing.id,
        title: listing.title,
        url: listing.url,
        score: aiResult?.score,
        reason: errorMsg,
        action: 'failed',
        landlord: landlordInfo,
      });
    } else {
      await sendActivityLog({ lastResult: 'success', lastId: listing.id, lastTitle: listing.title || '' });
      if (isAutoSend) {
        console.log(`Message sent successfully to ${landlordInfo}`);
      } else {
        console.log(`Form filled for ${landlordInfo} - waiting for manual send`);
      }

      await logActivity({
        listingId: listing.id,
        title: listing.title,
        url: listing.url,
        score: aiResult?.score,
        reason: aiResult?.reason,
        action: 'sent',
        landlord: landlordInfo,
      });

      // Increment rate limit counter (only on actual sends)
      messageCount++;
      lastMessageTime = Date.now();
      const totalStored: Record<string, any> = await chrome.storage.local.get([C.TOTAL_MESSAGES_SENT_KEY]);
      await chrome.storage.local.set({
        [C.TOTAL_MESSAGES_SENT_KEY]: (totalStored[C.TOTAL_MESSAGES_SENT_KEY] || 0) + 1,
        [C.RATE_MESSAGE_COUNT_KEY]: messageCount,
        [C.RATE_LAST_MESSAGE_TIME_KEY]: lastMessageTime,
      });
      console.log(
        `[Rate] ${messageCount}/${await chrome.storage.local.get([C.RATE_LIMIT_KEY]).then((s: Record<string, any>) => s[C.RATE_LIMIT_KEY] || 10)} messages this hour`,
      );

      // Send browser notification
      if (isAutoSend) {
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Message Sent',
            message: `Sent to ${landlordInfo}: ${listing.title || 'New Listing'}${aiResult ? ` (Score: ${aiResult.score}/10)` : ''}`,
          });
        } catch (e) {
          console.error('Notification error:', e);
        }
      } else {
        // Manual mode: persistent notification with click-to-focus
        const notifId = `manual-review-${listing.id || Date.now()}`;
        try {
          chrome.notifications.create(notifId, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Nachricht bereit zur Überprüfung',
            message: `${landlordInfo}: ${listing.title || 'New Listing'}${aiResult ? ` (Score: ${aiResult.score}/10)` : ''}`,
            requireInteraction: true,
          });
        } catch (e) {
          console.error('Notification error:', e);
        }
      }
    }

    if (isAutoSend) {
      await new Promise((resolve) => setTimeout(resolve, humanDelay(2000, 1000)));
      try {
        await chrome.tabs.remove(currentListingTabId);
        console.log('Closed listing tab');
      } catch (_closeError) {
        /* ignore */
      }
    } else {
      try {
        await chrome.tabs.update(currentListingTabId, { active: true });
        const tabInfo = await chrome.tabs.get(currentListingTabId);
        await chrome.windows.update(tabInfo.windowId, { focused: true });
      } catch (_e) {
        /* ignore */
      }
    }

    return { success: sendResult?.success, listing };
  } catch (error: any) {
    console.error('Error sending message:', error);
    try {
      await chrome.tabs.remove(currentListingTabId);
    } catch (_e) {
      /* ignore */
    }
    return { success: false, listing, error: error.message };
  }
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

type MessageRequest = { action: string; [key: string]: any };

chrome.runtime.onMessage.addListener(
  (request: MessageRequest, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (request.action === 'startMonitoring') {
      startMonitoring()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('Error starting monitoring:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    } else if (request.action === 'stopMonitoring') {
      (async () => {
        try {
          await stopMonitoring();
          sendResponse({ success: true });
        } catch (error: any) {
          console.error('Error stopping monitoring:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    } else if (request.action === 'getStatus') {
      (async () => {
        try {
          const stats: Record<string, any> = await chrome.storage.local.get([
            C.TOTAL_MESSAGES_SENT_KEY,
            C.LAST_CHECK_TIME_KEY,
            C.STORAGE_KEY,
            C.RATE_MESSAGE_COUNT_KEY,
            C.RATE_COUNT_RESET_TIME_KEY,
            C.AI_ENABLED_KEY,
            C.AI_LISTINGS_SCORED_KEY,
            C.AI_LISTINGS_SKIPPED_KEY,
            C.AI_USAGE_PROMPT_TOKENS_KEY,
            C.AI_USAGE_COMPLETION_TOKENS_KEY,
            C.SYNCED_CONTACTED_KEY,
            C.QUEUE_KEY,
          ]);
          sendResponse({
            isMonitoring,
            checkInterval: currentCheckInterval / 1000,
            totalMessagesSent: stats[C.TOTAL_MESSAGES_SENT_KEY] || 0,
            messagesThisHour: stats[C.RATE_MESSAGE_COUNT_KEY] || messageCount,
            lastCheckTime: stats[C.LAST_CHECK_TIME_KEY] || null,
            seenListingsCount: (stats[C.STORAGE_KEY] || []).length,
            syncedContacted: stats[C.SYNCED_CONTACTED_KEY] || 0,
            aiEnabled: stats[C.AI_ENABLED_KEY] || false,
            aiScored: stats[C.AI_LISTINGS_SCORED_KEY] || 0,
            aiSkipped: stats[C.AI_LISTINGS_SKIPPED_KEY] || 0,
            aiPromptTokens: stats[C.AI_USAGE_PROMPT_TOKENS_KEY] || 0,
            aiCompletionTokens: stats[C.AI_USAGE_COMPLETION_TOKENS_KEY] || 0,
            isProcessingQueue,
            queueLength: (stats[C.QUEUE_KEY] || []).length,
          });
        } catch (_error) {
          sendResponse({ isMonitoring, checkInterval: currentCheckInterval / 1000 });
        }
      })();
      return true;
    } else if (request.action === 'updateInterval') {
      (async () => {
        try {
          if (isMonitoring) {
            if (request.interval) {
              await chrome.storage.local.set({ [C.CHECK_INTERVAL_KEY]: request.interval });
            }
            await updateCheckInterval();
            await scheduleNextAlarm();
            console.log(`Check interval updated to ${currentCheckInterval / 1000} seconds`);
          }
          sendResponse({ success: true });
        } catch (error: any) {
          console.error('Error updating interval:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    } else if (request.action === 'clearSeenListings') {
      (async () => {
        try {
          const stored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
          console.log(
            `[Clear] Clearing ${(stored[C.STORAGE_KEY] || []).length} seen listings and resetting rate limit`,
          );
          messageCount = 0;
          messageCountResetTime = Date.now() + 3600000;
          await chrome.storage.local.set({
            [C.STORAGE_KEY]: [],
            [C.SYNCED_CONTACTED_KEY]: 0,
            [C.RATE_MESSAGE_COUNT_KEY]: 0,
            [C.RATE_COUNT_RESET_TIME_KEY]: messageCountResetTime,
          });
          console.log('[Clear] Seen list and rate limit reset');
          sendResponse({ success: true });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

      // --- Manual Queue handlers ---
    } else if (request.action === 'captureQueueItems') {
      (async () => {
        try {
          const incomingListings: Listing[] = request.listings || [];
          const added = await enqueueListings(incomingListings, 'manual');
          const stored: Record<string, any> = await chrome.storage.local.get([C.QUEUE_KEY]);
          sendResponse({ success: true, added, total: (stored[C.QUEUE_KEY] || []).length });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    } else if (request.action === 'startQueueProcessing') {
      (async () => {
        if (isProcessingQueue) {
          sendResponse({ success: false, error: 'Already processing' });
          return;
        }
        const stored: Record<string, any> = await chrome.storage.local.get([C.QUEUE_KEY]);
        if (!stored[C.QUEUE_KEY] || stored[C.QUEUE_KEY].length === 0) {
          sendResponse({ success: false, error: 'Queue is empty' });
          return;
        }
        userTriggeredProcessing = true;
        processQueue().catch((e) => console.error('[Queue] Processing error:', e));
        sendResponse({ success: true });
      })();
      return true;
    } else if (request.action === 'stopQueueProcessing') {
      queueAbortRequested = true;
      userTriggeredProcessing = false;
      sendResponse({ success: true });
      return true;
    } else if (request.action === 'getQueueStatus') {
      (async () => {
        const stored: Record<string, any> = await chrome.storage.local.get([C.QUEUE_KEY]);
        sendResponse({
          isProcessing: isProcessingQueue,
          queue: stored[C.QUEUE_KEY] || [],
        });
      })();
      return true;

      // --- Conversation handlers ---
    } else if (request.action === 'checkRepliesNow') {
      (async () => {
        try {
          await checkForNewReplies();
          sendResponse({ success: true });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    } else if (request.action === 'sendConversationReply') {
      (async () => {
        try {
          const { conversationId, message } = request;
          if (!conversationId || !message) {
            sendResponse({ success: false, error: 'conversationId and message required' });
            return;
          }

          // Open the messenger conversation page
          const messengerUrl = `https://www.immobilienscout24.de/messenger/conversations/${conversationId}`;
          const tab = await chrome.tabs.create({ url: messengerUrl, active: true });

          await waitForTabLoad(tab.id!, 15000);
          // Extra wait for React to render
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // Ping content script until ready
          let contentReady = false;
          for (let i = 0; i < 5; i++) {
            try {
              const pong: any = await chrome.tabs.sendMessage(tab.id!, { action: 'ping' });
              if (pong?.pong) {
                contentReady = true;
                break;
              }
            } catch (_e) {
              /* not ready yet */
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          if (!contentReady) {
            sendResponse({ success: false, error: 'Content script not ready on messenger page' });
            return;
          }

          // Send the reply text to content script for filling
          const result: any = await chrome.tabs.sendMessage(tab.id!, {
            action: 'fillConversationReply',
            message,
          });

          if (result?.success) {
            // Update draft status
            await updateConversationDraft(conversationId, message, 'sent');
            console.log(`[Conversations] Reply filled for ${conversationId}, tab left open for user review`);
            sendResponse({ success: true, tabId: tab.id });
          } else {
            sendResponse({ success: false, error: result?.error || 'Failed to fill reply' });
          }
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    } else if (request.action === 'respondToAppointment') {
      (async () => {
        try {
          const { conversationId, response: apptResponse, userContext, appointment } = request;
          if (!conversationId || !apptResponse) {
            sendResponse({ success: false, error: 'conversationId and response required' });
            return;
          }

          // Load conversation from storage
          const convStored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
          const conv = ((convStored[C.CONVERSATIONS_KEY] || []) as ConversationEntry[]).find(
            (c) => c.conversationId === conversationId,
          );
          if (!conv) {
            sendResponse({ success: false, error: 'Conversation not found' });
            return;
          }

          // Generate AI courtesy message
          let courtesyMessage = '';
          const aiStored: Record<string, any> = await chrome.storage.local.get([C.AI_SERVER_URL_KEY, C.AI_API_KEY_KEY]);
          const serverUrl: string | undefined = aiStored[C.AI_SERVER_URL_KEY];
          const apiKey: string | undefined = aiStored[C.AI_API_KEY_KEY];
          if (serverUrl) {
            try {
              const profileKeys = [
                C.PROFILE_NAME_KEY,
                C.PROFILE_AGE_KEY,
                C.PROFILE_OCCUPATION_KEY,
                C.PROFILE_LANGUAGES_KEY,
                C.PROFILE_MOVING_REASON_KEY,
                C.PROFILE_CURRENT_NEIGHBORHOOD_KEY,
                C.PROFILE_STRENGTHS_KEY,
                C.PROFILE_MAX_WARMMIETE_KEY,
                C.AI_ABOUT_ME_KEY,
                C.FORM_ADULTS_KEY,
                C.FORM_CHILDREN_KEY,
                C.FORM_PETS_KEY,
                C.FORM_SMOKER_KEY,
                C.FORM_INCOME_KEY,
                C.FORM_INCOME_RANGE_KEY,
                C.FORM_PHONE_KEY,
              ];
              const profileData: Record<string, any> = await chrome.storage.local.get(profileKeys);

              const resp = await fetch(`${serverUrl}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  conversationHistory: conv.messages || [],
                  userProfile: {
                    adults: profileData[C.FORM_ADULTS_KEY],
                    children: profileData[C.FORM_CHILDREN_KEY],
                    pets: profileData[C.FORM_PETS_KEY],
                    smoker: profileData[C.FORM_SMOKER_KEY],
                    income: profileData[C.FORM_INCOME_KEY],
                    incomeRange: profileData[C.FORM_INCOME_RANGE_KEY],
                    aboutMe: profileData[C.AI_ABOUT_ME_KEY],
                    phone: profileData[C.FORM_PHONE_KEY],
                  },
                  landlordInfo: { name: conv.landlordName },
                  listingTitle: conv.listingTitle,
                  apiKey: apiKey || undefined,
                  profile: {
                    name: profileData[C.PROFILE_NAME_KEY],
                    age: profileData[C.PROFILE_AGE_KEY] ? Number(profileData[C.PROFILE_AGE_KEY]) : undefined,
                    occupation: profileData[C.PROFILE_OCCUPATION_KEY],
                    languages: profileData[C.PROFILE_LANGUAGES_KEY]
                      ? profileData[C.PROFILE_LANGUAGES_KEY].split(',').map((l: string) => l.trim())
                      : undefined,
                    movingReason: profileData[C.PROFILE_MOVING_REASON_KEY],
                    strengths: profileData[C.PROFILE_STRENGTHS_KEY]
                      ? profileData[C.PROFILE_STRENGTHS_KEY].split(',').map((s: string) => s.trim())
                      : undefined,
                    maxWarmmiete: profileData[C.PROFILE_MAX_WARMMIETE_KEY]
                      ? Number(profileData[C.PROFILE_MAX_WARMMIETE_KEY])
                      : undefined,
                  },
                  appointmentAction: {
                    type: apptResponse,
                    date: appointment?.date,
                    time: appointment?.time,
                    location: appointment?.location,
                    userContext: userContext || undefined,
                  },
                }),
              });

              if (resp.ok) {
                const result: any = await resp.json();
                courtesyMessage = result.reply || '';
              }
            } catch (e: any) {
              console.warn(`[Appointments] AI draft failed:`, e.message);
            }
          }

          // Open the messenger conversation page
          const messengerUrl = `https://www.immobilienscout24.de/messenger/conversations/${conversationId}`;
          const tab = await chrome.tabs.create({ url: messengerUrl, active: true });

          await waitForTabLoad(tab.id!, 15000);
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // Ping content script until ready
          let contentReady = false;
          for (let i = 0; i < 5; i++) {
            try {
              const pong: any = await chrome.tabs.sendMessage(tab.id!, { action: 'ping' });
              if (pong?.pong) {
                contentReady = true;
                break;
              }
            } catch (_e) {
              /* not ready yet */
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          if (!contentReady) {
            sendResponse({ success: false, error: 'Content script not ready on messenger page' });
            return;
          }

          // Send appointment action to content script
          const result: any = await chrome.tabs.sendMessage(tab.id!, {
            action: 'handleAppointment',
            response: apptResponse,
            courtesyMessage,
          });

          if (result?.success) {
            const statusMap: Record<string, string> = {
              accept: 'accepted',
              reject: 'rejected',
              alternative: 'alternative_requested',
            };
            await updateAppointmentStatus(conversationId, statusMap[apptResponse] || apptResponse);
            console.log(`[Appointments] ${apptResponse} for ${conversationId}, tab left open for user review`);
            sendResponse({ success: true, tabId: tab.id });
          } else {
            sendResponse({ success: false, error: result?.error || 'Failed to handle appointment' });
          }
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    } else if (request.action === 'generateDocuments') {
      (async () => {
        try {
          const { address, moveIn } = request;
          if (!address) {
            sendResponse({ success: false, error: 'No address provided' });
            return;
          }

          const aiStored: Record<string, any> = await chrome.storage.local.get([C.AI_SERVER_URL_KEY]);
          const serverUrl: string | undefined = aiStored[C.AI_SERVER_URL_KEY];
          if (!serverUrl) {
            sendResponse({ success: false, error: 'AI server URL not configured' });
            return;
          }

          // Load all document profile fields
          const docKeys = [
            C.PROFILE_NAME_KEY,
            C.PROFILE_BIRTH_DATE_KEY,
            C.PROFILE_MARITAL_STATUS_KEY,
            C.PROFILE_CURRENT_ADDRESS_KEY,
            C.PROFILE_EMAIL_KEY,
            C.PROFILE_OCCUPATION_KEY,
            C.PROFILE_NET_INCOME_KEY,
            C.PROFILE_EMPLOYER_KEY,
            C.PROFILE_EMPLOYED_SINCE_KEY,
            C.PROFILE_CURRENT_LANDLORD_KEY,
            C.PROFILE_LANDLORD_PHONE_KEY,
            C.PROFILE_LANDLORD_EMAIL_KEY,
            C.FORM_PHONE_KEY,
          ];
          const profile: Record<string, any> = await chrome.storage.local.get(docKeys);

          const nameRaw: string = profile[C.PROFILE_NAME_KEY] || '';
          // Convert "First Last" to "Last, First" for the form
          const nameParts = nameRaw.split(' ').filter(Boolean);
          const formName = nameParts.length >= 2 ? `${nameParts.slice(1).join(' ')}, ${nameParts[0]}` : nameRaw;

          // Convert YYYY-MM-DD (date input) to DD.MM.YYYY (German format)
          const formatDate = (isoDate: string | undefined): string => {
            if (!isoDate || !isoDate.includes('-')) return isoDate || '';
            const [y, m, d] = isoDate.split('-');
            return `${d}.${m}.${y}`;
          };

          // Convert plain number to German currency format "X.XXX,XX EUR"
          const formatEurAmount = (val: string | number | undefined): string => {
            if (!val) return '';
            const num = parseFloat(String(val));
            if (Number.isNaN(num)) return String(val);
            const parts = num.toFixed(2).split('.');
            const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            return `${intPart},${parts[1]} EUR`;
          };

          // Today as signing date in DD.MM.YYYY
          const today = new Date();
          const signingDate = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;

          const body = {
            address,
            name: formName,
            moveIn: formatDate(moveIn),
            birthDate: formatDate(profile[C.PROFILE_BIRTH_DATE_KEY]),
            maritalStatus: profile[C.PROFILE_MARITAL_STATUS_KEY] || '',
            currentAddress: profile[C.PROFILE_CURRENT_ADDRESS_KEY] || '',
            phone: profile[C.FORM_PHONE_KEY] || '',
            email: profile[C.PROFILE_EMAIL_KEY] || '',
            profession: profile[C.PROFILE_OCCUPATION_KEY] || '',
            netIncome: formatEurAmount(profile[C.PROFILE_NET_INCOME_KEY]),
            employer: profile[C.PROFILE_EMPLOYER_KEY] || '',
            employedSince: formatDate(profile[C.PROFILE_EMPLOYED_SINCE_KEY]),
            currentLandlord: profile[C.PROFILE_CURRENT_LANDLORD_KEY] || '',
            landlordPhone: profile[C.PROFILE_LANDLORD_PHONE_KEY] || '',
            landlordEmail: profile[C.PROFILE_LANDLORD_EMAIL_KEY] || '',
            signingDate,
            signatureName: nameRaw,
          };

          const resp = await fetch(`${serverUrl}/documents/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          if (!resp.ok) {
            const err: any = await resp.json().catch(() => ({ error: resp.statusText }));
            sendResponse({ success: false, error: err.error || `Server error: ${resp.status}` });
            return;
          }

          // Download the PDF — convert to data URL since service workers lack URL.createObjectURL
          const buf = await resp.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const dataUrl = `data:application/pdf;base64,${btoa(binary)}`;

          const street = address.split(',')[0].trim().replace(/\s+/g, '_');
          const filename = `Bewerbungsunterlagen_${nameParts[nameParts.length - 1] || 'Tenant'}_${street}.pdf`;

          await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });

          console.log(`[Documents] Generated and downloading: ${filename}`);
          sendResponse({ success: true });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    } else if (request.action === 'markConversationRead') {
      (async () => {
        try {
          const { conversationId } = request;
          const convStored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
          if (!convStored[C.CONVERSATIONS_KEY]) {
            sendResponse({ success: true });
            return;
          }

          const updated = convStored[C.CONVERSATIONS_KEY].map((c: ConversationEntry) => {
            if (c.conversationId === conversationId) {
              return { ...c, hasUnreadReply: false };
            }
            return c;
          });

          const totalUnread = updated.filter((c: ConversationEntry) => c.hasUnreadReply).length;
          await chrome.storage.local.set({
            [C.CONVERSATIONS_KEY]: updated,
            [C.CONV_UNREAD_COUNT_KEY]: totalUnread,
          });

          // Update badge
          if (totalUnread > 0) {
            chrome.action.setBadgeText({ text: String(totalUnread) });
          } else {
            chrome.action.setBadgeText({ text: '' });
          }

          sendResponse({ success: true });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    } else if (request.action === 'regenerateDraft') {
      (async () => {
        try {
          const { conversationId, userContext } = request;
          const draftStored: Record<string, any> = await chrome.storage.local.get([
            C.CONVERSATIONS_KEY,
            C.AI_SERVER_URL_KEY,
            C.AI_API_KEY_KEY,
          ]);
          if (!draftStored[C.CONVERSATIONS_KEY] || !draftStored[C.AI_SERVER_URL_KEY]) {
            sendResponse({ success: false, error: 'No conversations or AI server URL' });
            return;
          }

          const conv = (draftStored[C.CONVERSATIONS_KEY] as ConversationEntry[]).find(
            (c) => c.conversationId === conversationId,
          );
          if (!conv) {
            sendResponse({ success: false, error: 'Conversation not found' });
            return;
          }

          await updateConversationDraft(conversationId, null, 'generating');
          // Notify popup of status change
          try {
            await chrome.runtime.sendMessage({ action: 'conversationUpdate' });
          } catch (_e) {}

          await generateDraftReply(conv, draftStored[C.AI_SERVER_URL_KEY], draftStored[C.AI_API_KEY_KEY], userContext);
          sendResponse({ success: true });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }

    return false;
  },
);

// ============================================================================
// NOTIFICATION CLICK HANDLER
// ============================================================================

chrome.notifications.onClicked.addListener(async (notificationId: string) => {
  if (notificationId.startsWith('manual-review-')) {
    // Focus the listing tab — find the most recently created ImmoScout tab
    try {
      const tabs = await chrome.tabs.query({ url: 'https://www.immobilienscout24.de/expose/*' });
      if (tabs.length > 0) {
        const tab = tabs[tabs.length - 1];
        await chrome.tabs.update(tab.id!, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    } catch (e) {
      console.error('Error focusing tab from notification:', e);
    }
    chrome.notifications.clear(notificationId);
  }
});
