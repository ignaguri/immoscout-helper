// Background service worker for ImmoScout24 Auto Reloader
importScripts('shared.js');

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

const DEFAULT_CHECK_INTERVAL = 60000;

let isMonitoring = false;
let currentCheckInterval = DEFAULT_CHECK_INTERVAL;
let searchTabId = null;
let lastMessageTime = 0;
let messageCount = 0;
let messageCountResetTime = Date.now() + 3600000;

// Track listings that failed to process — skip them for a cooldown period
// Map<listingId, { count: number, lastAttempt: number }>
const failedListings = new Map();
const FAILED_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Manual queue processing state
let isQueueProcessing = false;
let queueAbortRequested = false;


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
    [RATE_MESSAGE_COUNT_KEY]: 0,
    [RATE_COUNT_RESET_TIME_KEY]: messageCountResetTime,
    [RATE_LAST_MESSAGE_TIME_KEY]: 0
  });
  console.log('Rate limit reset on install/reload');

  // Start conversation reply checking alarm (runs even when monitoring is off)
  chrome.alarms.create(CONVERSATIONS_ALARM_NAME, { periodInMinutes: 5 });
  console.log('[Conversations] Reply checking alarm started (every 5 min)');
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('Service worker started, checking monitoring state...');
  await restoreMonitoringState();
  // Ensure conversation alarm is running
  chrome.alarms.create(CONVERSATIONS_ALARM_NAME, { periodInMinutes: 5 });
});

(async () => {
  console.log('Service worker activated, checking monitoring state...');
  await restoreMonitoringState();
})();

async function restoreMonitoringState() {
  const stored = await chrome.storage.local.get([
    MONITORING_STATE_KEY,
    RATE_LAST_MESSAGE_TIME_KEY,
    RATE_MESSAGE_COUNT_KEY,
    RATE_COUNT_RESET_TIME_KEY,
    QUEUE_PROCESSING_KEY
  ]);

  // Restore rate limit state
  lastMessageTime = stored[RATE_LAST_MESSAGE_TIME_KEY] || 0;
  messageCount = stored[RATE_MESSAGE_COUNT_KEY] || 0;
  messageCountResetTime = stored[RATE_COUNT_RESET_TIME_KEY] || (Date.now() + 3600000);

  // Clear stale queue processing flag (SW was killed mid-run)
  if (stored[QUEUE_PROCESSING_KEY]) {
    isQueueProcessing = false;
    await chrome.storage.local.set({ [QUEUE_PROCESSING_KEY]: false });
    console.log('[Queue] Cleared stale processing flag from previous SW session');
  }

  if (stored[MONITORING_STATE_KEY]) {
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
  if (alarm.name === ALARM_NAME) {
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
  } else if (alarm.name === CONVERSATIONS_ALARM_NAME) {
    console.log(`[${new Date().toLocaleTimeString()}] Conversation alarm triggered - checking for replies...`);
    try {
      await checkForNewReplies();
    } catch (error) {
      console.error('[Conversations] Error checking replies:', error);
    }
  }
});

// Batched storage initialization — single read, single write
async function initializeStorage() {
  const defaults = {
    [STORAGE_KEY]: [],
    [SEARCH_URL_KEY]: 'https://www.immobilienscout24.de/Suche/de/wohnung-mieten',
    [MESSAGE_TEMPLATE_KEY]: 'Sehr geehrte Damen und Herren,\n\nich interessiere mich für diese Wohnung und würde gerne mehr Informationen erhalten.\n\nMit freundlichen Grüßen',
    [CHECK_INTERVAL_KEY]: 60,
    [RATE_LIMIT_KEY]: 10,
    [MIN_DELAY_KEY]: 30,
    [FORM_ADULTS_KEY]: 2,
    [FORM_CHILDREN_KEY]: 0,
    [FORM_PETS_KEY]: 'Nein',
    [FORM_SMOKER_KEY]: 'Nein',
    [FORM_INCOME_KEY]: 2000,
    [FORM_HOUSEHOLD_SIZE_KEY]: 'Einpersonenhaushalt',
    [FORM_EMPLOYMENT_KEY]: 'Angestellte:r',
    [FORM_INCOME_RANGE_KEY]: '1.500 - 2.000',
    [FORM_DOCUMENTS_KEY]: 'Vorhanden',
    [FORM_SALUTATION_KEY]: 'Frau',
    [FORM_PHONE_KEY]: '',
    [AUTO_SEND_MODE_KEY]: 'auto',
    [TOTAL_MESSAGES_SENT_KEY]: 0,
    [LAST_CHECK_TIME_KEY]: null,
    [AI_ENABLED_KEY]: false,
    [AI_SERVER_URL_KEY]: 'http://localhost:3456',
    [AI_MIN_SCORE_KEY]: 5,
    [AI_ABOUT_ME_KEY]: '',
    [AI_LISTINGS_SCORED_KEY]: 0,
    [AI_LISTINGS_SKIPPED_KEY]: 0,
    [SYNCED_CONTACTED_KEY]: 0
  };

  const keys = Object.keys(defaults);
  const result = await chrome.storage.local.get(keys);

  const toSet = {};
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

function getRandomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function humanDelay(baseMs, varianceMs = 0) {
  const delay = baseMs + (varianceMs > 0 ? getRandomDelay(-varianceMs, varianceMs) : 0);
  return Math.max(100, delay);
}

// Schedule next alarm with ±20% jitter (one-shot)
async function scheduleNextAlarm() {
  const baseSeconds = currentCheckInterval / 1000;
  const jitter = baseSeconds * 0.2;
  const nextSeconds = baseSeconds + getRandomDelay(-jitter, jitter);
  const delayInMinutes = Math.max(1, nextSeconds / 60);
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes });
  console.log(`[Alarm] Next check in ${Math.round(nextSeconds)}s (base ${baseSeconds}s ± 20%)`);
}

// Wait for a tab to finish loading using chrome.tabs.onUpdated
function waitForTabLoad(tabId, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let resolved = false;

    const done = () => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      }
    };

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        done();
      }
    };

    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);

    // Check if tab is already complete (race condition guard)
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') done();
    }).catch(() => done());
  });
}

// Check if listing ID is in seen set
function isListingSeen(listingId, seenSet) {
  if (!listingId || !seenSet) return false;
  return seenSet.has(String(listingId).toLowerCase().trim());
}

function ensureSorting(url) {
  try {
    const urlObj = new URL(url);
    if (!urlObj.searchParams.has('sorting')) {
      urlObj.searchParams.set('sorting', '2');
    }
    return urlObj.toString();
  } catch (error) {
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

async function checkRateLimit() {
  const now = Date.now();

  if (now >= messageCountResetTime) {
    messageCount = 0;
    messageCountResetTime = now + 3600000;
    await chrome.storage.local.set({
      [RATE_MESSAGE_COUNT_KEY]: 0,
      [RATE_COUNT_RESET_TIME_KEY]: messageCountResetTime
    });
  }

  const { [RATE_LIMIT_KEY]: rateLimit, [MIN_DELAY_KEY]: minDelaySeconds } = await chrome.storage.local.get([RATE_LIMIT_KEY, MIN_DELAY_KEY]);
  const rateLimitValue = rateLimit || 10;
  const minDelay = (minDelaySeconds || 30) * 1000;

  if (messageCount >= rateLimitValue) {
    const waitTime = messageCountResetTime - now;
    console.log(`Rate limit reached (${messageCount}/${rateLimitValue} messages). Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
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

async function updateCheckInterval() {
  const { [CHECK_INTERVAL_KEY]: intervalSeconds } = await chrome.storage.local.get([CHECK_INTERVAL_KEY]);
  currentCheckInterval = (intervalSeconds || 60) * 1000;
  console.log(`Check interval set to ${intervalSeconds || 60} seconds`);
}

async function startMonitoring() {
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
      const { [STORAGE_KEY]: seenAfterSync } = await chrome.storage.local.get([STORAGE_KEY]);
      console.log(`[Startup] Seen list has ${(seenAfterSync || []).length} entries after messenger sync (${synced} new)`);
    } catch (error) {
      console.error('Error syncing contacted listings:', error);
    }

    console.log(`Monitoring started. Will check every ${currentCheckInterval / 1000} seconds.`);
    console.log('Listings already messaged (from messenger) will be skipped. All others will be scored.');

    await chrome.storage.local.set({ [MONITORING_STATE_KEY]: true });

    await scheduleNextAlarm();
  } catch (error) {
    console.error('Error in startMonitoring:', error);
    isMonitoring = false;
    throw error;
  }
}

async function stopMonitoring() {
  if (!isMonitoring) {
    console.log('Monitoring already stopped');
    return;
  }

  isMonitoring = false;
  console.log('Stopping monitoring...');

  await chrome.alarms.clear(ALARM_NAME);
  await chrome.storage.local.set({ [MONITORING_STATE_KEY]: false });

  searchTabId = null;
  console.log('Monitoring stopped.');
}

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

async function findOrCreateSearchTab() {
  try {
    const { [SEARCH_URL_KEY]: searchUrl } = await chrome.storage.local.get([SEARCH_URL_KEY]);

    if (!searchUrl) {
      console.error('No search URL configured');
      return null;
    }

    const configuredUrl = new URL(searchUrl);
    const basePath = configuredUrl.origin + configuredUrl.pathname;

    const allTabs = await chrome.tabs.query({});

    const matchingTab = allTabs.find(tab => {
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

    await waitForTabLoad(newTab.id, 10000);

    return { tab: newTab, searchUrl };
  } catch (error) {
    console.error('Error finding/creating search tab:', error);
    return null;
  }
}

// ============================================================================
// MESSENGER SYNC
// ============================================================================

async function syncContactedListings() {
  try {
    // Fetch ALL conversations using cursor-based pagination (timestampOfLastConversationPaginated)
    const allConversations = [];
    let cursor = null;
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
      const data = await response.json();
      const conversations = data.conversations || [];
      if (conversations.length === 0) break;

      allConversations.push(...conversations);
      pageNum++;
      console.log(`[Sync] Fetched page ${pageNum}: ${conversations.length} conversations (total: ${allConversations.length})`);

      // Use the last conversation's timestamp as cursor for next page
      const lastTimestamp = conversations[conversations.length - 1]?.lastUpdateDateTime;
      if (!lastTimestamp) break;
      cursor = lastTimestamp;

      // Safety cap
      if (allConversations.length > 2000) break;
    }

    // Extract expose IDs, filter nulls
    const contactedIds = allConversations
      .map(c => c.referenceId)
      .filter(Boolean)
      .map(id => String(id).toLowerCase().trim());

    if (contactedIds.length === 0) return 0;

    // Merge into seen list
    const { [STORAGE_KEY]: seenListings } = await chrome.storage.local.get([STORAGE_KEY]);
    const seenList = seenListings || [];
    const seenSet = new Set(seenList.map(id => String(id).toLowerCase().trim()));

    const newIds = contactedIds.filter(id => !seenSet.has(id));
    if (newIds.length === 0) {
      console.log(`[Sync] All ${contactedIds.length} contacted listings already in seen list`);
      return 0;
    }

    const updatedSeen = capSeenListings([...seenList, ...newIds]);
    await chrome.storage.local.set({ [STORAGE_KEY]: updatedSeen });

    // Track total synced count
    const { [SYNCED_CONTACTED_KEY]: prevSynced } = await chrome.storage.local.get([SYNCED_CONTACTED_KEY]);
    await chrome.storage.local.set({ [SYNCED_CONTACTED_KEY]: (prevSynced || 0) + newIds.length });

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

async function checkForNewReplies() {
  try {
    // Fetch conversations from ImmoScout API
    const allConversations = [];
    let cursor = null;
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
      const data = await response.json();
      const conversations = data.conversations || [];
      if (conversations.length === 0) break;

      allConversations.push(...conversations);
      pageNum++;

      // Only check first 2 pages for replies (most recent conversations)
      if (pageNum >= 2) break;

      const lastTimestamp = conversations[conversations.length - 1]?.lastUpdateDateTime;
      if (!lastTimestamp) break;
      cursor = lastTimestamp;
    }

    if (allConversations.length === 0) {
      console.log('[Conversations] No conversations found');
      return;
    }

    // Load stored conversation state
    const { [CONVERSATIONS_KEY]: storedConversations } = await chrome.storage.local.get([CONVERSATIONS_KEY]);
    const storedMap = {};
    if (storedConversations) {
      for (const conv of storedConversations) {
        storedMap[conv.conversationId] = conv;
      }
    }

    let newReplyCount = 0;
    const updatedConversations = [];

    for (const conv of allConversations) {
      const conversationId = conv.conversationId;
      if (!conversationId) continue;

      const referenceId = conv.referenceId;
      const lastUpdate = conv.lastUpdateDateTime;
      const stored = storedMap[conversationId];

      // Field mapping (from API discovery)
      const landlordName = conv.participantName || '';
      const salutation = conv.salutation || '';
      const addr = conv.address;
      const listingTitle = addr
        ? `${addr.street || ''} ${addr.houseNumber || ''}, ${addr.postcode || ''} ${addr.city || ''}`.trim()
        : (conv.referenceId ? `Expose ${conv.referenceId}` : '');
      const lastMessagePreview = conv.previewMessage || '';
      const hasUnread = conv.read === false;
      const imageUrl = conv.imageUrl || '';
      const shortDetails = conv.shortDetails?.details || {};
      const appointment = conv.appointment || null;

      // Check if this conversation has a new update
      const hasNewUpdate = !stored || stored.lastUpdateDateTime !== lastUpdate;

      // Build conversation entry
      const convEntry = {
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
        messages: stored?.messages || [],
        draftReply: stored?.draftReply || null,
        draftStatus: stored?.draftStatus || 'none'
      };

      // If unread, try to fetch conversation detail for message history
      if (hasUnread) {
        try {
          const detailMessages = await fetchConversationMessages(conversationId);
          if (detailMessages && detailMessages.length > 0) {
            convEntry.messages = detailMessages;
          }
        } catch (e) {
          console.warn(`[Conversations] Could not fetch detail for ${conversationId}:`, e.message);
        }

        // Only send desktop notification if this is a NEW reply (not first load)
        if (stored && hasNewUpdate) {
          newReplyCount++;
          console.log(`[Conversations] New reply in conversation ${conversationId} from ${landlordName} about "${listingTitle}"`);

          // Send desktop notification
          try {
            chrome.notifications.create(`conv-reply-${conversationId}`, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'New reply from landlord',
              message: `${landlordName || 'Landlord'}: ${lastMessagePreview.substring(0, 100) || 'New message'}`,
              priority: 2
            });
          } catch (e) { /* notifications may fail */ }

          // Auto-generate draft reply if AI is enabled
          try {
            const { [AI_ENABLED_KEY]: aiEnabled, [AI_SERVER_URL_KEY]: serverUrl, [AI_API_KEY_KEY]: apiKey } =
              await chrome.storage.local.get([AI_ENABLED_KEY, AI_SERVER_URL_KEY, AI_API_KEY_KEY]);
            if (aiEnabled && serverUrl && convEntry.messages.length > 0) {
              convEntry.draftStatus = 'generating';
              // Don't await — generate in background
              generateDraftReply(convEntry, serverUrl, apiKey).catch(e =>
                console.error(`[Conversations] Draft generation failed for ${conversationId}:`, e)
              );
            }
          } catch (e) { /* AI config error */ }

          // Log to activity
          await sendActivityLog({
            message: `New reply from ${landlordName || 'landlord'} about "${listingTitle || conversationId}"`,
            type: 'info'
          });
        }
      }

      updatedConversations.push(convEntry);
    }

    // Cap stored conversations
    const capped = updatedConversations.length > CONVERSATIONS_CAP
      ? updatedConversations.slice(0, CONVERSATIONS_CAP)
      : updatedConversations;

    // Count total unread
    const totalUnread = capped.filter(c => c.hasUnreadReply).length;

    await chrome.storage.local.set({
      [CONVERSATIONS_KEY]: capped,
      [CONVERSATIONS_LAST_CHECK_KEY]: Date.now(),
      [CONV_UNREAD_COUNT_KEY]: totalUnread
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
      console.log(`[Conversations] No new replies (${allConversations.length} conversations checked, ${totalUnread} unread)`);
    }

    // Notify popup
    try {
      await chrome.runtime.sendMessage({ action: 'conversationUpdate', unreadCount: totalUnread });
    } catch (e) { /* popup closed */ }

  } catch (error) {
    console.error('[Conversations] Error checking replies:', error);
  }
}

// Fetch individual conversation messages (API discovery + real fetch)
async function fetchConversationMessages(conversationId) {
  const endpoints = [
    `https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations/${conversationId}`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        console.log(`[Conversations] Endpoint ${url} returned ${response.status}`);
        continue;
      }

      const data = await response.json();
      // Extract messages from the confirmed API structure
      const rawMessages = data.messages;
      if (rawMessages && rawMessages.length > 0) {
        return rawMessages.map(msg => ({
          role: msg.userType === 'SEEKER' ? 'user' : 'landlord',
          text: msg.message || '',
          timestamp: msg.creationDateTime || ''
        })).filter(m => m.text);
      }

      console.log(`[Conversations] No messages found in response. Keys: ${Object.keys(data).join(', ')}`);
    } catch (e) {
      console.warn(`[Conversations] Error fetching ${url}:`, e.message);
    }
  }

  return null;
}

// Generate a draft reply using the AI server
async function generateDraftReply(conversation, serverUrl, apiKey) {
  if (!conversation.messages || conversation.messages.length === 0) return;

  try {
    // Load user profile for context
    const profileKeys = [
      PROFILE_NAME_KEY, PROFILE_AGE_KEY, PROFILE_OCCUPATION_KEY, PROFILE_LANGUAGES_KEY,
      PROFILE_MOVING_REASON_KEY, PROFILE_CURRENT_NEIGHBORHOOD_KEY, PROFILE_STRENGTHS_KEY,
      PROFILE_MAX_WARMMIETE_KEY, AI_ABOUT_ME_KEY,
      FORM_ADULTS_KEY, FORM_CHILDREN_KEY, FORM_PETS_KEY, FORM_SMOKER_KEY,
      FORM_INCOME_KEY, FORM_INCOME_RANGE_KEY, FORM_PHONE_KEY
    ];
    const profileData = await chrome.storage.local.get(profileKeys);

    const response = await fetch(`${serverUrl}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationHistory: conversation.messages,
        userProfile: {
          adults: profileData[FORM_ADULTS_KEY],
          children: profileData[FORM_CHILDREN_KEY],
          pets: profileData[FORM_PETS_KEY],
          smoker: profileData[FORM_SMOKER_KEY],
          income: profileData[FORM_INCOME_KEY],
          incomeRange: profileData[FORM_INCOME_RANGE_KEY],
          aboutMe: profileData[AI_ABOUT_ME_KEY],
          phone: profileData[FORM_PHONE_KEY]
        },
        landlordInfo: {
          name: conversation.landlordName
        },
        listingTitle: conversation.listingTitle,
        apiKey: apiKey || undefined,
        profile: {
          name: profileData[PROFILE_NAME_KEY],
          age: profileData[PROFILE_AGE_KEY] ? Number(profileData[PROFILE_AGE_KEY]) : undefined,
          occupation: profileData[PROFILE_OCCUPATION_KEY],
          languages: profileData[PROFILE_LANGUAGES_KEY] ? profileData[PROFILE_LANGUAGES_KEY].split(',').map(l => l.trim()) : undefined,
          movingReason: profileData[PROFILE_MOVING_REASON_KEY],
          currentNeighborhood: profileData[PROFILE_CURRENT_NEIGHBORHOOD_KEY],
          strengths: profileData[PROFILE_STRENGTHS_KEY] ? profileData[PROFILE_STRENGTHS_KEY].split(',').map(s => s.trim()) : undefined,
          maxWarmmiete: profileData[PROFILE_MAX_WARMMIETE_KEY] ? Number(profileData[PROFILE_MAX_WARMMIETE_KEY]) : undefined
        }
      })
    });

    if (!response.ok) {
      console.error(`[Conversations] Draft reply API error: ${response.status}`);
      await updateConversationDraft(conversation.conversationId, null, 'none');
      return;
    }

    const result = await response.json();
    if (result.reply) {
      await updateConversationDraft(conversation.conversationId, result.reply, 'ready');
      console.log(`[Conversations] Draft reply generated for ${conversation.conversationId} (${result.reply.length} chars)`);

      // Track token usage
      if (result.usage) {
        const { [AI_USAGE_PROMPT_TOKENS_KEY]: prevPrompt, [AI_USAGE_COMPLETION_TOKENS_KEY]: prevCompletion } =
          await chrome.storage.local.get([AI_USAGE_PROMPT_TOKENS_KEY, AI_USAGE_COMPLETION_TOKENS_KEY]);
        await chrome.storage.local.set({
          [AI_USAGE_PROMPT_TOKENS_KEY]: (prevPrompt || 0) + (result.usage.promptTokens || 0),
          [AI_USAGE_COMPLETION_TOKENS_KEY]: (prevCompletion || 0) + (result.usage.completionTokens || 0)
        });
      }

      // Notify popup
      try {
        await chrome.runtime.sendMessage({ action: 'conversationUpdate' });
      } catch (e) { /* popup closed */ }
    } else {
      await updateConversationDraft(conversation.conversationId, null, 'none');
    }
  } catch (error) {
    console.error(`[Conversations] Error generating draft:`, error);
    await updateConversationDraft(conversation.conversationId, null, 'none');
  }
}

// Update a single conversation's draft in storage
async function updateConversationDraft(conversationId, draftReply, draftStatus) {
  const { [CONVERSATIONS_KEY]: conversations } = await chrome.storage.local.get([CONVERSATIONS_KEY]);
  if (!conversations) return;

  const updated = conversations.map(c => {
    if (c.conversationId === conversationId) {
      return { ...c, draftReply, draftStatus };
    }
    return c;
  });

  await chrome.storage.local.set({ [CONVERSATIONS_KEY]: updated });
}

// ============================================================================
// LISTING DETECTION
// ============================================================================

async function markAllCurrentListingsAsSeen() {
  const result = await findOrCreateSearchTab();

  if (!result) {
    console.log('No search tab found. Will mark listings as seen on first check.');
    return;
  }

  const { tab, searchUrl } = result;

  await chrome.tabs.update(tab.id, { url: searchUrl });
  await waitForTabLoad(tab.id, 15000);
  await new Promise(resolve => setTimeout(resolve, humanDelay(2000, 1000)));

  try {
    const results = await chrome.tabs.sendMessage(tab.id, { action: 'extractListings' });
    let allListings = results?.listings || [];

    // Check for additional pages
    let paginationInfo = { currentPage: 1, totalPages: 1 };
    try {
      paginationInfo = await chrome.tabs.sendMessage(tab.id, { action: 'extractPaginationInfo' });
    } catch (e) { /* single page fallback */ }

    const maxPages = Math.min(paginationInfo.totalPages, 3);
    for (let page = 2; page <= maxPages; page++) {
      const pageUrl = new URL(searchUrl);
      pageUrl.searchParams.set('pagenumber', String(page));

      await chrome.tabs.update(tab.id, { url: pageUrl.toString() });
      await waitForTabLoad(tab.id, 15000);
      await new Promise(r => setTimeout(r, humanDelay(3000, 2000)));

      const pageResults = await chrome.tabs.sendMessage(tab.id, { action: 'extractListings' });
      if (pageResults?.listings?.length) {
        allListings.push(...pageResults.listings);
      } else {
        break;
      }
    }

    if (allListings.length > 0) {
      const { [STORAGE_KEY]: seenListings } = await chrome.storage.local.get([STORAGE_KEY]);
      const seenList = seenListings || [];
      const seenSet = new Set(seenList.map(id => String(id).toLowerCase().trim()));

      const newSeenIds = allListings
        .map(listing => String(listing.id).toLowerCase().trim())
        .filter(id => id && !seenSet.has(id));

      if (newSeenIds.length > 0) {
        const updatedSeen = capSeenListings([...seenList, ...newSeenIds]);
        await chrome.storage.local.set({ [STORAGE_KEY]: updatedSeen });
        console.log(`Marked ${newSeenIds.length} existing listings as seen (from ${maxPages} page(s)):`, newSeenIds.join(', '));
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
async function sendActivityLog(data) {
  // Persist to storage
  try {
    const stored = await chrome.storage.local.get([ACTIVITY_LOG_KEY]);
    const log = stored[ACTIVITY_LOG_KEY] || [];
    const entry = { ...data, timestamp: Date.now() };
    log.push(entry);
    if (log.length > ACTIVITY_LOG_CAP) log.splice(0, log.length - ACTIVITY_LOG_CAP);
    await chrome.storage.local.set({ [ACTIVITY_LOG_KEY]: log });
  } catch (e) { /* storage error */ }

  // Send to popup (may be closed)
  try {
    await chrome.runtime.sendMessage({ action: 'activityLog', ...data });
  } catch (e) { /* popup closed */ }
}

async function checkForNewListings() {
  try {
    await sendActivityLog({ message: `[${new Date().toLocaleTimeString()}] Checking for new listings...` });
    await syncContactedListings();

    const result = await findOrCreateSearchTab();

    if (!result) {
      console.log('Could not find or create search tab. Check your Search URL setting.');
      return;
    }

    const { tab, searchUrl } = result;
    searchTabId = tab.id;

    // Check if tab is already showing the search page (skip reload)
    let needsReload = true;
    try {
      const currentTab = await chrome.tabs.get(searchTabId);
      const currentUrl = new URL(currentTab.url);
      const targetUrl = new URL(searchUrl);
      if (currentUrl.origin === targetUrl.origin && currentUrl.pathname === targetUrl.pathname) {
        // URL matches — check if content script is alive
        try {
          await chrome.tabs.sendMessage(searchTabId, { action: 'ping' });
          needsReload = false;
          console.log(`[${new Date().toLocaleTimeString()}] Search tab already loaded, content script ready — extracting...`);
        } catch {
          console.log(`[${new Date().toLocaleTimeString()}] Search tab URL matches but content script not available — reloading...`);
        }
      }
    } catch { /* reload as fallback */ }

    if (needsReload) {
      console.log(`[${new Date().toLocaleTimeString()}] Reloading search page...`);
      await chrome.tabs.update(searchTabId, { url: searchUrl });
      await waitForTabLoad(searchTabId, 15000);
      await new Promise(resolve => setTimeout(resolve, humanDelay(2000, 1000)));
    }

    if (!isMonitoring) return;

    await chrome.storage.local.set({ [LAST_CHECK_TIME_KEY]: Date.now() });

    try {
      await chrome.tabs.get(searchTabId);
      const results = await chrome.tabs.sendMessage(searchTabId, { action: 'extractListings' });
      let allListings = results?.listings || [];

      // Check for additional pages
      let paginationInfo = { currentPage: 1, totalPages: 1 };
      try {
        paginationInfo = await chrome.tabs.sendMessage(searchTabId, { action: 'extractPaginationInfo' });
      } catch (e) { /* single page fallback */ }

      const maxPages = Math.min(paginationInfo.totalPages, 3);
      for (let page = 2; page <= maxPages; page++) {
        if (!isMonitoring) break;

        const pageUrl = new URL(searchUrl);
        pageUrl.searchParams.set('pagenumber', String(page));

        await chrome.tabs.update(searchTabId, { url: pageUrl.toString() });
        await waitForTabLoad(searchTabId, 15000);
        await new Promise(r => setTimeout(r, humanDelay(3000, 2000)));

        const pageResults = await chrome.tabs.sendMessage(searchTabId, { action: 'extractListings' });
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

      await processNewListings(allListings, false);
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
// LISTING PROCESSING
// ============================================================================

async function processNewListings(listings, ignoreSeen = false) {
  if (!listings || listings.length === 0) {
    return 0;
  }

  // Deduplicate listings by ID — extractListings() can return the same ID multiple times
  const dedupMap = new Map();
  for (const listing of listings) {
    const id = String(listing.id || '').toLowerCase().trim();
    if (id && listing.url && !dedupMap.has(id)) {
      dedupMap.set(id, listing);
    }
  }
  const uniqueListings = Array.from(dedupMap.values());

  const { [STORAGE_KEY]: seenListings } = await chrome.storage.local.get([STORAGE_KEY]);
  const seenList = seenListings || [];
  const seenSet = new Set(seenList.map(id => String(id).toLowerCase().trim()));

  // Summary log
  const seenIds = [...dedupMap.keys()].filter(id => seenSet.has(id));
  const newIds = [...dedupMap.keys()].filter(id => !seenSet.has(id));
  console.log('='.repeat(60));
  console.log(`LISTING CHECK: ${uniqueListings.length} unique listings (${listings.length} raw), ${seenIds.length} already messaged, ${newIds.length} to process`);
  if (seenIds.length > 0) console.log(`  Already messaged: ${seenIds.join(', ')}`);
  if (newIds.length > 0) console.log(`  New to process: ${newIds.join(', ')}`);
  console.log('='.repeat(60));

  if (!isQueueProcessing) {
    if (newIds.length > 0) {
      await sendActivityLog({ message: `Found ${uniqueListings.length} listings, ${newIds.length} new` });
    } else {
      await sendActivityLog({ message: `Found ${uniqueListings.length} listings, none new` });
    }
  }

  // Purge expired cooldowns and sort failed listings to the end
  const now = Date.now();
  for (const [id, info] of failedListings) {
    if (now - info.lastAttempt >= FAILED_COOLDOWN_MS) failedListings.delete(id);
  }

  // Sort: non-failed first, failed-but-cooldown-expired at end
  const sortedListings = [...uniqueListings].sort((a, b) => {
    const aFailed = failedListings.has(String(a.id).toLowerCase().trim());
    const bFailed = failedListings.has(String(b.id).toLowerCase().trim());
    if (aFailed === bFailed) return 0;
    return aFailed ? 1 : -1;
  });

  for (const listing of sortedListings) {
    if (!isMonitoring && !isQueueProcessing) break;
    if (isQueueProcessing && queueAbortRequested) break;

    const normalizedId = String(listing.id).toLowerCase().trim();

    if (!ignoreSeen) {
      if (seenSet.has(normalizedId)) {
        continue;
      }

      // Double-check with fresh seen list (in case of race condition)
      const freshSeen = await chrome.storage.local.get([STORAGE_KEY]);
      const freshSet = new Set((freshSeen[STORAGE_KEY] || []).map(id => String(id).toLowerCase().trim()));
      if (freshSet.has(normalizedId)) {
        continue;
      }
    }

    // Skip listings on cooldown from recent failures
    const failInfo = failedListings.get(normalizedId);
    if (failInfo && (now - failInfo.lastAttempt < FAILED_COOLDOWN_MS)) {
      console.log(`[Process] Skipping ${normalizedId} — failed ${failInfo.count}x, cooldown ${Math.round((FAILED_COOLDOWN_MS - (now - failInfo.lastAttempt)) / 60000)}min left`);
      continue;
    }

    console.log(`[Process] ${normalizedId} — ${listing.title || 'untitled'}`);

    if (!isQueueProcessing) {
      await sendActivityLog({ current: { id: normalizedId, title: listing.title || 'untitled', url: listing.url } });
    }

    const listingToProcess = { ...listing, id: normalizedId };

    // Check rate limit
    const rateLimitCheck = await checkRateLimit();
    if (!rateLimitCheck.allowed) {
      const waitSec = Math.round(rateLimitCheck.waitTime / 1000);
      if (!isQueueProcessing) {
        await sendActivityLog({ message: `Rate limit — waiting ${waitSec}s...`, type: 'wait' });
      }
      await new Promise(resolve => setTimeout(resolve, rateLimitCheck.waitTime));
      const recheck = await checkRateLimit();
      if (!recheck.allowed) return 0;
    }

    try {
      const result = await handleNewListing(listingToProcess);

      if (result && result.success) {
        // Clear from failed map on success
        failedListings.delete(normalizedId);

        if (!ignoreSeen) {
          const currentSeen = await chrome.storage.local.get([STORAGE_KEY]);
          const currentSeenList = currentSeen[STORAGE_KEY] || [];

          const currentSet = new Set(currentSeenList.map(id => String(id).toLowerCase().trim()));
          if (!currentSet.has(normalizedId)) {
            const updatedSeen = capSeenListings([...currentSeenList, normalizedId]);
            await chrome.storage.local.set({ [STORAGE_KEY]: updatedSeen });
            console.log(`Marked listing as seen: ${normalizedId}`);
          }
        }
        return 1;
      } else {
        // Failed — add to cooldown and try next listing
        const prev = failedListings.get(normalizedId);
        failedListings.set(normalizedId, { count: (prev?.count || 0) + 1, lastAttempt: Date.now() });
        console.log(`[Process] ${normalizedId} failed (${(prev?.count || 0) + 1}x) — moving to back of queue, will retry in 30min`);
        continue;
      }
    } catch (error) {
      console.error('Error processing listing:', error);
      const prev = failedListings.get(normalizedId);
      failedListings.set(normalizedId, { count: (prev?.count || 0) + 1, lastAttempt: Date.now() });
      console.log(`[Process] ${normalizedId} errored (${(prev?.count || 0) + 1}x) — moving to back of queue, will retry in 30min`);
      continue;
    }
  }

  console.log('No new listings to process');
  return 0;
}

// ============================================================================
// MANUAL QUEUE PROCESSING
// ============================================================================

async function processQueueListings() {
  console.log('[Queue] Starting queue processing');
  isQueueProcessing = true;
  queueAbortRequested = false;
  await chrome.storage.local.set({ [QUEUE_PROCESSING_KEY]: true });

  // Sync conversations before processing to avoid messaging already-contacted landlords
  try {
    await syncContactedListings();
  } catch (e) {
    console.warn('[Queue] Conversation sync failed, continuing anyway:', e.message);
  }

  try {
    while (!queueAbortRequested) {
      const stored = await chrome.storage.local.get([QUEUE_KEY]);
      const queue = stored[QUEUE_KEY] || [];

      if (queue.length === 0) {
        console.log('[Queue] Queue empty — processing complete');
        break;
      }

      const listing = queue[0];
      const remaining = queue.slice(1);
      const normalizedId = String(listing.id).toLowerCase().trim();

      // Notify popup
      try {
        await chrome.runtime.sendMessage({
          action: 'queueProgress',
          current: listing,
          remaining: remaining.length
        });
      } catch (e) { /* popup closed */ }

      // Skip if already in seen list (already contacted or processed)
      const { [STORAGE_KEY]: seenListings } = await chrome.storage.local.get([STORAGE_KEY]);
      const seenSet = new Set((seenListings || []).map(id => String(id).toLowerCase().trim()));
      if (seenSet.has(normalizedId)) {
        console.log(`[Queue] ${listing.id} already in seen list — skipping`);
        await chrome.storage.local.set({ [QUEUE_KEY]: remaining });
        try {
          await chrome.runtime.sendMessage({
            action: 'queueProgress',
            message: `Skipped ${listing.title || listing.id} (already contacted)`,
            remaining: remaining.length
          });
        } catch (e) { /* popup closed */ }
        chrome.storage.local.get([QUEUE_KEY]).then(() => {}); // trigger UI update
        continue;
      }

      // Check rate limit
      const rateLimitCheck = await checkRateLimit();
      if (!rateLimitCheck.allowed) {
        const waitSec = Math.round(rateLimitCheck.waitTime / 1000);
        console.log(`[Queue] Rate limit — waiting ${waitSec}s`);
        try {
          await chrome.runtime.sendMessage({
            action: 'queueProgress',
            message: `Rate limit — waiting ${waitSec}s...`,
            nextActionTime: Date.now() + rateLimitCheck.waitTime
          });
        } catch (e) { /* popup closed */ }
        await new Promise(resolve => setTimeout(resolve, rateLimitCheck.waitTime));
        if (queueAbortRequested) break;
        const recheck = await checkRateLimit();
        if (!recheck.allowed) {
          console.log('[Queue] Rate limit still exceeded — stopping');
          break;
        }
      }

      // Run the same pipeline as automatic mode
      const result = await handleNewListing(listing);

      if (result && result.success) {
        // Remove from queue, mark as seen
        const { [STORAGE_KEY]: seenListings } = await chrome.storage.local.get([STORAGE_KEY]);
        const seenList = seenListings || [];
        const seenSet = new Set(seenList.map(id => String(id).toLowerCase().trim()));

        if (!seenSet.has(normalizedId)) {
          const updated = capSeenListings([...seenList, normalizedId]);
          await chrome.storage.local.set({ [STORAGE_KEY]: updated, [QUEUE_KEY]: remaining });
        } else {
          await chrome.storage.local.set({ [QUEUE_KEY]: remaining });
        }

        failedListings.delete(normalizedId);
        console.log(`[Queue] Processed ${normalizedId} — ${remaining.length} remaining`);

        try {
          await chrome.runtime.sendMessage({
            action: 'queueProgress',
            lastResult: result.skipped ? 'skipped' : 'success',
            lastId: listing.id,
            lastTitle: listing.title,
            remaining: remaining.length
          });
        } catch (e) { /* popup closed */ }
      } else {
        // Failed — move to end of queue
        await chrome.storage.local.set({ [QUEUE_KEY]: [...remaining, listing] });
        const prev = failedListings.get(normalizedId);
        failedListings.set(normalizedId, { count: (prev?.count || 0) + 1, lastAttempt: Date.now() });
        console.log(`[Queue] ${listing.id} failed — moved to end of queue`);

        try {
          await chrome.runtime.sendMessage({
            action: 'queueProgress',
            lastResult: 'failed',
            lastId: listing.id,
            lastTitle: listing.title,
            remaining: remaining.length + 1,
            error: result?.error
          });
        } catch (e) { /* popup closed */ }
      }

      // Delay between listings
      const delay = humanDelay(2000, 1000);
      try {
        await chrome.runtime.sendMessage({
          action: 'queueProgress',
          nextActionTime: Date.now() + delay
        });
      } catch (e) { /* popup closed */ }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  } finally {
    isQueueProcessing = false;
    queueAbortRequested = false;
    await chrome.storage.local.set({ [QUEUE_PROCESSING_KEY]: false });
    console.log('[Queue] Processing loop exited');
    try {
      await chrome.runtime.sendMessage({ action: 'queueProgress', done: true });
    } catch (e) { /* popup closed */ }
  }
}

// ============================================================================
// AI ANALYSIS
// ============================================================================

async function getProfile() {
  const keys = [
    PROFILE_NAME_KEY, PROFILE_AGE_KEY, PROFILE_OCCUPATION_KEY,
    PROFILE_LANGUAGES_KEY, PROFILE_MOVING_REASON_KEY,
    PROFILE_CURRENT_NEIGHBORHOOD_KEY, PROFILE_IDEAL_APARTMENT_KEY,
    PROFILE_DEALBREAKERS_KEY, PROFILE_STRENGTHS_KEY, PROFILE_MAX_WARMMIETE_KEY
  ];
  const stored = await chrome.storage.local.get(keys);
  const parseList = (val) => val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
  return {
    name: stored[PROFILE_NAME_KEY] || undefined,
    age: stored[PROFILE_AGE_KEY] ? parseInt(stored[PROFILE_AGE_KEY]) : undefined,
    occupation: stored[PROFILE_OCCUPATION_KEY] || undefined,
    languages: parseList(stored[PROFILE_LANGUAGES_KEY]),
    movingReason: stored[PROFILE_MOVING_REASON_KEY] || undefined,
    currentNeighborhood: stored[PROFILE_CURRENT_NEIGHBORHOOD_KEY] || undefined,
    idealApartment: stored[PROFILE_IDEAL_APARTMENT_KEY] || undefined,
    dealbreakers: parseList(stored[PROFILE_DEALBREAKERS_KEY]),
    strengths: parseList(stored[PROFILE_STRENGTHS_KEY]),
    maxWarmmiete: stored[PROFILE_MAX_WARMMIETE_KEY] ? parseInt(stored[PROFILE_MAX_WARMMIETE_KEY]) : undefined
  };
}

async function tryAIAnalysis(tabId, landlordTitle, landlordName, isPrivateLandlord, formValues, messageTemplate, isTenantNetwork = false) {
  try {
    const aiSettings = await chrome.storage.local.get([
      AI_ENABLED_KEY, AI_API_KEY_KEY, AI_SERVER_URL_KEY, AI_MIN_SCORE_KEY, AI_ABOUT_ME_KEY
    ]);

    if (!aiSettings[AI_ENABLED_KEY]) return null;

    const serverUrl = aiSettings[AI_SERVER_URL_KEY] || 'http://localhost:3456';
    const minScore = aiSettings[AI_MIN_SCORE_KEY] || 5;
    const apiKey = aiSettings[AI_API_KEY_KEY] || undefined;
    const profile = await getProfile();

    // Extract listing details from the page
    let listingDetails;
    try {
      listingDetails = await chrome.tabs.sendMessage(tabId, { action: 'extractListingDetails' });
    } catch (e) {
      console.error('[AI] Failed to extract listing details:', e.message);
      return null;
    }

    if (!listingDetails) return null;

    const payload = {
      listingDetails,
      landlordInfo: { title: landlordTitle, name: landlordName, isPrivate: isPrivateLandlord, isTenantNetwork },
      userProfile: {
        ...formValues,
        aboutMe: aiSettings[AI_ABOUT_ME_KEY] || ''
      },
      messageTemplate,
      minScore,
      apiKey,
      profile
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${serverUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[AI] Server returned ${response.status}`);
        return null;
      }

      const result = await response.json();

      // Update AI stats
      const stats = await chrome.storage.local.get([AI_LISTINGS_SCORED_KEY, AI_LISTINGS_SKIPPED_KEY, AI_USAGE_PROMPT_TOKENS_KEY, AI_USAGE_COMPLETION_TOKENS_KEY]);
      const updates = {
        [AI_LISTINGS_SCORED_KEY]: (stats[AI_LISTINGS_SCORED_KEY] || 0) + 1
      };
      if (result.skip) {
        updates[AI_LISTINGS_SKIPPED_KEY] = (stats[AI_LISTINGS_SKIPPED_KEY] || 0) + 1;
      }
      if (result.usage) {
        updates[AI_USAGE_PROMPT_TOKENS_KEY] = (stats[AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (result.usage.promptTokens || 0);
        updates[AI_USAGE_COMPLETION_TOKENS_KEY] = (stats[AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (result.usage.completionTokens || 0);
      }
      await chrome.storage.local.set(updates);

      console.log(`[AI] Score: ${result.score}/10, Skip: ${result.skip}, Message: ${result.message ? 'yes' : 'no'}`);
      return result;
    } catch (e) {
      clearTimeout(timeout);
      console.error('[AI] Fetch error:', e.message);
      return null;
    }
  } catch (e) {
    console.error('[AI] Unexpected error:', e.message);
    return null;
  }
}

async function trySolveCaptcha(tabId, serverUrl, apiKey) {
  let sentSolution = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`[Captcha] Attempt ${attempt}/2 — detecting...`);

    // If we sent a solution on the previous attempt and got "channel closed",
    // the page likely navigated after successful captcha → wait for it to load
    if (sentSolution) {
      console.log('[Captcha] Previous attempt sent solution — waiting for page to settle...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Try to ping the content script — page may have reloaded
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      } catch (e) {
        // Content script not ready — wait for tab to finish loading
        await waitForTabLoad(tabId);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    let detection;
    try {
      detection = await chrome.tabs.sendMessage(tabId, { action: 'detectCaptcha' });
    } catch (e) {
      if (sentSolution) {
        // Sent a solution and now can't talk to page — wait for it to load and verify
        console.log('[Captcha] Page unreachable after sending solution — waiting for reload...');
        try {
          await waitForTabLoad(tabId);
          await new Promise(resolve => setTimeout(resolve, 1500));
          const pageCheck = await chrome.tabs.sendMessage(tabId, { action: 'checkMessageSent' });
          if (pageCheck?.messageSent) {
            console.log('[Captcha] Confirmed: message was sent after page reload');
            return { solved: true, messageSent: true };
          }
          console.warn('[Captcha] Page reloaded but no confirmation found. Page:', pageCheck?.url);
          return { solved: false, messageSent: false };
        } catch (e2) {
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
          const pageCheck = await chrome.tabs.sendMessage(tabId, { action: 'checkMessageSent' });
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
          console.warn('[Captcha] Cannot verify page state:', e.message);
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
        signal: controller.signal
      });
      clearTimeout(timeout);

      const result = await response.json();

      if (result.usage) {
        const usageStats = await chrome.storage.local.get([AI_USAGE_PROMPT_TOKENS_KEY, AI_USAGE_COMPLETION_TOKENS_KEY]);
        await chrome.storage.local.set({
          [AI_USAGE_PROMPT_TOKENS_KEY]: (usageStats[AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (result.usage.promptTokens || 0),
          [AI_USAGE_COMPLETION_TOKENS_KEY]: (usageStats[AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (result.usage.completionTokens || 0)
        });
      }

      if (!result.text) {
        console.error('[Captcha] Server could not solve:', result.error);
        return false;
      }

      console.log(`[Captcha] Solution: "${result.text}", filling...`);
      sentSolution = true;

      const solveResult = await chrome.tabs.sendMessage(tabId, {
        action: 'solveCaptcha',
        text: result.text
      });

      if (solveResult?.success) {
        if (solveResult.messageSent) {
          console.log('[Captcha] Solved — message was sent successfully');
          return { solved: true, messageSent: true };
        }
        console.log('[Captcha] Solved successfully');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { solved: true, messageSent: false };
      }

      console.warn(`[Captcha] Attempt ${attempt} failed:`, solveResult?.error);
    } catch (e) {
      console.error(`[Captcha] Attempt ${attempt} error:`, e.message);
      // If we just sent a solution and got channel closed, loop will handle it
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.error('[Captcha] All attempts failed');
  return false;
}

// ============================================================================
// ACTIVITY LOGGING
// ============================================================================

async function logActivity(entry) {
  try {
    const aiSettings = await chrome.storage.local.get([AI_ENABLED_KEY, AI_SERVER_URL_KEY]);
    if (!aiSettings[AI_ENABLED_KEY]) return;
    const serverUrl = aiSettings[AI_SERVER_URL_KEY] || 'http://localhost:3456';
    await fetch(`${serverUrl}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
  } catch (e) {
    // Logging is best-effort, don't block on failure
  }
}

// ============================================================================
// MESSAGE SENDING
// ============================================================================

async function handleNewListing(listing) {
  console.log('Processing new listing:', listing.url);

  await new Promise(resolve => setTimeout(resolve, humanDelay(500, 300)));
  const listingTab = await chrome.tabs.create({ url: listing.url, active: true });
  const currentListingTabId = listingTab.id;

  // Wait for page load via event instead of fixed delay
  await waitForTabLoad(currentListingTabId, 10000);

  if (!isMonitoring && !isQueueProcessing) {
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
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (!contentScriptReady) {
      console.error('Content script not ready after waiting');
      try { await chrome.tabs.remove(currentListingTabId); } catch (e) { /* ignore */ }
      return { success: false, listing, error: 'Content script not ready' };
    }

    await new Promise(resolve => setTimeout(resolve, humanDelay(1000, 500)));

    if (!isMonitoring && !isQueueProcessing) {
      console.log('Monitoring/queue stopped during processing, aborting');
      return { success: false, listing };
    }

    // Detect listing type (tenant-network vs standard)
    let isTenantNetwork = false;
    try {
      const listingType = await chrome.tabs.sendMessage(currentListingTabId, { action: 'detectListingType' });
      isTenantNetwork = listingType?.isTenantNetwork || false;
      if (isTenantNetwork && !listingType?.hasContactForm) {
        console.log(`[Skip] ${listing.id} is a tenant-network listing with no contact form — marking as seen`);
        if (!isQueueProcessing) {
          await sendActivityLog({ message: `Skipped ${listing.id} (tenant-network, no contact form)`, type: 'wait' });
        }
        try { await chrome.tabs.remove(currentListingTabId); } catch (e) { /* ignore */ }
        return { success: true, listing, skipped: true };
      }
      if (isTenantNetwork) {
        console.log(`[Info] ${listing.id} is a tenant-network listing with contact form — proceeding`);
      }
    } catch (e) { /* proceed if detection fails */ }

    const nameResult = await chrome.tabs.sendMessage(currentListingTabId, { action: 'extractLandlordName' });
    const landlordTitle = nameResult?.title || null;
    const landlordName = nameResult?.name || null;
    const isPrivateLandlord = nameResult?.isPrivate || false;

    // Get message template and all form values (including smoker)
    const storageKeys = [
      MESSAGE_TEMPLATE_KEY, AUTO_SEND_MODE_KEY, FORM_ADULTS_KEY, FORM_CHILDREN_KEY,
      FORM_PETS_KEY, FORM_SMOKER_KEY, FORM_INCOME_KEY, FORM_HOUSEHOLD_SIZE_KEY,
      FORM_EMPLOYMENT_KEY, FORM_INCOME_RANGE_KEY, FORM_DOCUMENTS_KEY,
      FORM_SALUTATION_KEY, FORM_PHONE_KEY
    ];
    const stored = await chrome.storage.local.get(storageKeys);

    const formValues = {
      adults: stored[FORM_ADULTS_KEY] || 2,
      children: stored[FORM_CHILDREN_KEY] || 0,
      pets: stored[FORM_PETS_KEY] || 'Nein',
      smoker: stored[FORM_SMOKER_KEY] || 'Nein',
      income: stored[FORM_INCOME_KEY] || 2000,
      householdSize: stored[FORM_HOUSEHOLD_SIZE_KEY] || 'Einpersonenhaushalt',
      employmentType: stored[FORM_EMPLOYMENT_KEY] || 'Angestellte:r',
      incomeRange: stored[FORM_INCOME_RANGE_KEY] || '1.500 - 2.000',
      documents: stored[FORM_DOCUMENTS_KEY] || 'Vorhanden',
      salutation: stored[FORM_SALUTATION_KEY] || 'Frau',
      phone: stored[FORM_PHONE_KEY] || ''
    };

    // AI analysis: score listing and optionally generate message
    const aiResult = await tryAIAnalysis(
      currentListingTabId, landlordTitle, landlordName, isPrivateLandlord, formValues, stored[MESSAGE_TEMPLATE_KEY] || '', isTenantNetwork
    );

    const landlordInfo = landlordTitle && landlordName
      ? `${landlordTitle} ${landlordName}`
      : landlordName || 'Unknown';

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
      if (isQueueProcessing) {
        try { await chrome.runtime.sendMessage({ action: 'queueProgress', message: analysisMsg }); } catch (e) { /* popup closed */ }
      } else {
        await sendActivityLog({ message: analysisMsg, type: 'analysis' });
      }
    }

    // If AI says skip, notify and close tab
    if (aiResult?.skip) {
      console.log(`[AI] Skipping listing (score ${aiResult.score}/10): ${aiResult.reason}`);
      if (!isQueueProcessing) {
        await sendActivityLog({ lastResult: 'skipped', lastId: listing.id, lastTitle: listing.title || '' });
      }
      await logActivity({
        listingId: listing.id,
        title: listing.title,
        url: listing.url,
        score: aiResult.score,
        reason: aiResult.reason,
        action: 'skipped',
        landlord: landlordInfo
      });
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: `Skipped (${aiResult.score}/10)`,
          message: `${landlordInfo}: ${aiResult.reason || listing.title || 'Low score'}`
        });
      } catch (e) { /* ignore */ }

      try { await chrome.tabs.remove(currentListingTabId); } catch (e) { /* ignore */ }
      return { success: true, skipped: true, listing };
    }

    // Use AI message if available, otherwise fall back to template
    const personalizedMessage = aiResult?.message
      || generatePersonalizedMessage(stored[MESSAGE_TEMPLATE_KEY] || '', landlordTitle, landlordName, isTenantNetwork);

    if (aiResult?.message) {
      console.log(`[AI] Using AI-generated message (score ${aiResult.score}/10)`);
    }

    await new Promise(resolve => setTimeout(resolve, humanDelay(500, 300)));

    const isAutoSend = stored[AUTO_SEND_MODE_KEY] !== 'manual';
    let sendResult = null;
    try {
      sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
        action: 'sendMessage',
        message: personalizedMessage,
        formValues: formValues,
        autoSend: isAutoSend
      });
    } catch (error) {
      console.error('Error sending message to content script:', error);
      try { await chrome.tabs.remove(currentListingTabId); } catch (e) { /* ignore */ }
      return { success: false, listing, error: error.message };
    }

    // Handle "message too long" error — ask AI to shorten, retry once
    if (sendResult && !sendResult.success && sendResult.messageTooLong) {
      const limit = sendResult.maxLength || 2000;
      console.warn(`[Message] Too long for form (${personalizedMessage.length} chars, limit: ${limit}) — asking AI to shorten`);
      try {
        const aiSettings = await chrome.storage.local.get([AI_ENABLED_KEY, AI_API_KEY_KEY, AI_SERVER_URL_KEY]);
        const serverUrl = aiSettings[AI_SERVER_URL_KEY] || 'http://localhost:3456';
        const shortenApiKey = aiSettings[AI_API_KEY_KEY] || undefined;
        const shortenResponse = await fetch(`${serverUrl}/shorten`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: personalizedMessage, maxLength: limit, apiKey: shortenApiKey })
        });
        if (shortenResponse.ok) {
          const shortenResult = await shortenResponse.json();
          const shortened = shortenResult.message;
          if (shortenResult.usage) {
            const usageStats = await chrome.storage.local.get([AI_USAGE_PROMPT_TOKENS_KEY, AI_USAGE_COMPLETION_TOKENS_KEY]);
            await chrome.storage.local.set({
              [AI_USAGE_PROMPT_TOKENS_KEY]: (usageStats[AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (shortenResult.usage.promptTokens || 0),
              [AI_USAGE_COMPLETION_TOKENS_KEY]: (usageStats[AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (shortenResult.usage.completionTokens || 0)
            });
          }
          if (shortened && shortened.length <= limit) {
            console.log(`[Message] AI shortened from ${personalizedMessage.length} to ${shortened.length} chars — retrying`);
            sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
              action: 'sendMessage',
              message: shortened,
              formValues: formValues,
              autoSend: isAutoSend
            });
          } else {
            console.warn(`[Message] AI shorten returned ${shortened?.length} chars (limit ${limit}) — hard truncating`);
            sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
              action: 'sendMessage',
              message: (shortened || personalizedMessage).substring(0, limit),
              formValues: formValues,
              autoSend: isAutoSend
            });
          }
        } else {
          console.error(`[Message] Shorten API returned ${shortenResponse.status} — hard truncating`);
          sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
            action: 'sendMessage',
            message: personalizedMessage.substring(0, limit),
            formValues: formValues,
            autoSend: isAutoSend
          });
        }
      } catch (e) {
        console.error('[Message] Error shortening message:', e.message);
      }
    }

    // Check for captcha after form submission
    if (sendResult && !sendResult.success && sendResult.error) {
      if (!isQueueProcessing) {
        await sendActivityLog({ message: 'Captcha detected, solving...', type: 'wait' });
      }
      const aiSettings = await chrome.storage.local.get([AI_ENABLED_KEY, AI_API_KEY_KEY, AI_SERVER_URL_KEY]);
      if (aiSettings[AI_ENABLED_KEY]) {
        const serverUrl = aiSettings[AI_SERVER_URL_KEY] || 'http://localhost:3456';
        const captchaApiKey = aiSettings[AI_API_KEY_KEY] || undefined;
        const captchaResult = await trySolveCaptcha(currentListingTabId, serverUrl, captchaApiKey);
        console.log('[Captcha] Result:', JSON.stringify(captchaResult));
        if (captchaResult?.messageSent) {
          // Captcha solved AND message confirmed sent
          console.log('[Captcha] Message confirmed sent after captcha resolution');
          sendResult = { success: true, messageSent: personalizedMessage };
        } else if (captchaResult?.solved) {
          // Captcha solved but message not sent yet — retry the full send
          console.log('[Captcha] Captcha solved, retrying message send...');
          try {
            sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
              action: 'sendMessage',
              message: personalizedMessage,
              formValues: formValues,
              autoSend: isAutoSend
            });
          } catch (e) {
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
      if (!isQueueProcessing) {
        await sendActivityLog({ lastResult: 'failed', lastId: listing.id, lastTitle: listing.title || '', error: errorMsg });
      }
      await logActivity({
        listingId: listing.id,
        title: listing.title,
        url: listing.url,
        score: aiResult?.score,
        reason: errorMsg,
        action: 'failed',
        landlord: landlordInfo
      });
    } else {
      if (!isQueueProcessing) {
        await sendActivityLog({ lastResult: 'success', lastId: listing.id, lastTitle: listing.title || '' });
      }
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
        landlord: landlordInfo
      });

      // Increment rate limit counter (only on actual sends)
      messageCount++;
      lastMessageTime = Date.now();
      const { [TOTAL_MESSAGES_SENT_KEY]: totalSent } = await chrome.storage.local.get([TOTAL_MESSAGES_SENT_KEY]);
      await chrome.storage.local.set({
        [TOTAL_MESSAGES_SENT_KEY]: (totalSent || 0) + 1,
        [RATE_MESSAGE_COUNT_KEY]: messageCount,
        [RATE_LAST_MESSAGE_TIME_KEY]: lastMessageTime
      });
      console.log(`[Rate] ${messageCount}/${await chrome.storage.local.get([RATE_LIMIT_KEY]).then(s => s[RATE_LIMIT_KEY] || 10)} messages this hour`);

      // Send browser notification
      if (isAutoSend) {
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Message Sent',
            message: `Sent to ${landlordInfo}: ${listing.title || 'New Listing'}${aiResult ? ` (Score: ${aiResult.score}/10)` : ''}`
          });
        } catch (e) {
          console.error('Notification error:', e);
        }
      } else {
        // Manual mode: persistent notification with click-to-focus
        const notifId = 'manual-review-' + (listing.id || Date.now());
        try {
          chrome.notifications.create(notifId, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Nachricht bereit zur Überprüfung',
            message: `${landlordInfo}: ${listing.title || 'New Listing'}${aiResult ? ` (Score: ${aiResult.score}/10)` : ''}`,
            requireInteraction: true
          });
        } catch (e) {
          console.error('Notification error:', e);
        }
      }
    }

    if (isAutoSend) {
      await new Promise(resolve => setTimeout(resolve, humanDelay(2000, 1000)));
      try {
        await chrome.tabs.remove(currentListingTabId);
        console.log('Closed listing tab');
      } catch (closeError) { /* ignore */ }
    } else {
      try {
        await chrome.tabs.update(currentListingTabId, { active: true });
        const tabInfo = await chrome.tabs.get(currentListingTabId);
        await chrome.windows.update(tabInfo.windowId, { focused: true });
      } catch (e) { /* ignore */ }
    }

    return { success: sendResult && sendResult.success, listing };

  } catch (error) {
    console.error('Error sending message:', error);
    try { await chrome.tabs.remove(currentListingTabId); } catch (e) { /* ignore */ }
    return { success: false, listing, error: error.message };
  }
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startMonitoring') {
    startMonitoring().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Error starting monitoring:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;

  } else if (request.action === 'stopMonitoring') {
    (async () => {
      try {
        await stopMonitoring();
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error stopping monitoring:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;

  } else if (request.action === 'getStatus') {
    (async () => {
      try {
        const stats = await chrome.storage.local.get([
          TOTAL_MESSAGES_SENT_KEY, LAST_CHECK_TIME_KEY, STORAGE_KEY,
          RATE_MESSAGE_COUNT_KEY, RATE_COUNT_RESET_TIME_KEY,
          AI_ENABLED_KEY, AI_LISTINGS_SCORED_KEY, AI_LISTINGS_SKIPPED_KEY,
          AI_USAGE_PROMPT_TOKENS_KEY, AI_USAGE_COMPLETION_TOKENS_KEY,
          SYNCED_CONTACTED_KEY, QUEUE_KEY
        ]);
        sendResponse({
          isMonitoring,
          checkInterval: currentCheckInterval / 1000,
          totalMessagesSent: stats[TOTAL_MESSAGES_SENT_KEY] || 0,
          messagesThisHour: stats[RATE_MESSAGE_COUNT_KEY] || messageCount,
          lastCheckTime: stats[LAST_CHECK_TIME_KEY] || null,
          seenListingsCount: (stats[STORAGE_KEY] || []).length,
          syncedContacted: stats[SYNCED_CONTACTED_KEY] || 0,
          aiEnabled: stats[AI_ENABLED_KEY] || false,
          aiScored: stats[AI_LISTINGS_SCORED_KEY] || 0,
          aiSkipped: stats[AI_LISTINGS_SKIPPED_KEY] || 0,
          aiPromptTokens: stats[AI_USAGE_PROMPT_TOKENS_KEY] || 0,
          aiCompletionTokens: stats[AI_USAGE_COMPLETION_TOKENS_KEY] || 0,
          isQueueProcessing,
          queueLength: (stats[QUEUE_KEY] || []).length
        });
      } catch (error) {
        sendResponse({ isMonitoring, checkInterval: currentCheckInterval / 1000 });
      }
    })();
    return true;

  } else if (request.action === 'updateInterval') {
    (async () => {
      try {
        if (isMonitoring) {
          if (request.interval) {
            await chrome.storage.local.set({ [CHECK_INTERVAL_KEY]: request.interval });
          }
          await updateCheckInterval();
          await scheduleNextAlarm();
          console.log(`Check interval updated to ${currentCheckInterval / 1000} seconds`);
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error updating interval:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;

  } else if (request.action === 'clearSeenListings') {
    (async () => {
      try {
        const { [STORAGE_KEY]: before } = await chrome.storage.local.get([STORAGE_KEY]);
        console.log(`[Clear] Clearing ${(before || []).length} seen listings and resetting rate limit`);
        messageCount = 0;
        messageCountResetTime = Date.now() + 3600000;
        await chrome.storage.local.set({
          [STORAGE_KEY]: [],
          [SYNCED_CONTACTED_KEY]: 0,
          [RATE_MESSAGE_COUNT_KEY]: 0,
          [RATE_COUNT_RESET_TIME_KEY]: messageCountResetTime
        });
        console.log('[Clear] Seen list and rate limit reset');
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;

  // --- Manual Queue handlers ---

  } else if (request.action === 'captureQueueItems') {
    (async () => {
      try {
        const incomingListings = request.listings || [];
        const { [STORAGE_KEY]: seenListings, [QUEUE_KEY]: currentQueue } =
          await chrome.storage.local.get([STORAGE_KEY, QUEUE_KEY]);

        const seenSet = new Set((seenListings || []).map(id => String(id).toLowerCase().trim()));
        const queueSet = new Set((currentQueue || []).map(item => String(item.id).toLowerCase().trim()));

        const addedAt = Date.now();
        const newItems = incomingListings
          .filter(l => {
            const id = String(l.id).toLowerCase().trim();
            return id && l.url && !seenSet.has(id) && !queueSet.has(id);
          })
          .map(l => ({
            id: String(l.id).toLowerCase().trim(),
            url: l.url,
            title: l.title || '',
            addedAt
          }));

        const updatedQueue = [...(currentQueue || []), ...newItems];
        await chrome.storage.local.set({ [QUEUE_KEY]: updatedQueue });

        console.log(`[Queue] Captured ${newItems.length} new items (${incomingListings.length - newItems.length} filtered as seen/duplicate)`);
        sendResponse({ success: true, added: newItems.length, total: updatedQueue.length });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;

  } else if (request.action === 'startQueueProcessing') {
    (async () => {
      if (isQueueProcessing) {
        sendResponse({ success: false, error: 'Already processing' });
        return;
      }
      const { [QUEUE_KEY]: queue } = await chrome.storage.local.get([QUEUE_KEY]);
      if (!queue || queue.length === 0) {
        sendResponse({ success: false, error: 'Queue is empty' });
        return;
      }
      processQueueListings().catch(e => console.error('[Queue] Processing error:', e));
      sendResponse({ success: true });
    })();
    return true;

  } else if (request.action === 'stopQueueProcessing') {
    queueAbortRequested = true;
    sendResponse({ success: true });
    return true;

  } else if (request.action === 'getQueueStatus') {
    (async () => {
      const { [QUEUE_KEY]: queue } = await chrome.storage.local.get([QUEUE_KEY]);
      sendResponse({
        isProcessing: isQueueProcessing,
        queue: queue || []
      });
    })();
    return true;

  // --- Conversation handlers ---

  } else if (request.action === 'checkRepliesNow') {
    (async () => {
      try {
        await checkForNewReplies();
        sendResponse({ success: true });
      } catch (error) {
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

        await waitForTabLoad(tab.id, 15000);
        // Extra wait for React to render
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Ping content script until ready
        let contentReady = false;
        for (let i = 0; i < 5; i++) {
          try {
            const pong = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            if (pong?.pong) { contentReady = true; break; }
          } catch (e) { /* not ready yet */ }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!contentReady) {
          sendResponse({ success: false, error: 'Content script not ready on messenger page' });
          return;
        }

        // Send the reply text to content script for filling
        const result = await chrome.tabs.sendMessage(tab.id, {
          action: 'fillConversationReply',
          message
        });

        if (result?.success) {
          // Update draft status
          await updateConversationDraft(conversationId, message, 'sent');
          console.log(`[Conversations] Reply filled for ${conversationId}, tab left open for user review`);
          sendResponse({ success: true, tabId: tab.id });
        } else {
          sendResponse({ success: false, error: result?.error || 'Failed to fill reply' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;

  } else if (request.action === 'markConversationRead') {
    (async () => {
      try {
        const { conversationId } = request;
        const { [CONVERSATIONS_KEY]: conversations } = await chrome.storage.local.get([CONVERSATIONS_KEY]);
        if (!conversations) { sendResponse({ success: true }); return; }

        const updated = conversations.map(c => {
          if (c.conversationId === conversationId) {
            return { ...c, hasUnreadReply: false };
          }
          return c;
        });

        const totalUnread = updated.filter(c => c.hasUnreadReply).length;
        await chrome.storage.local.set({
          [CONVERSATIONS_KEY]: updated,
          [CONV_UNREAD_COUNT_KEY]: totalUnread
        });

        // Update badge
        if (totalUnread > 0) {
          chrome.action.setBadgeText({ text: String(totalUnread) });
        } else {
          chrome.action.setBadgeText({ text: '' });
        }

        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;

  } else if (request.action === 'regenerateDraft') {
    (async () => {
      try {
        const { conversationId } = request;
        const { [CONVERSATIONS_KEY]: conversations, [AI_SERVER_URL_KEY]: serverUrl, [AI_API_KEY_KEY]: apiKey } =
          await chrome.storage.local.get([CONVERSATIONS_KEY, AI_SERVER_URL_KEY, AI_API_KEY_KEY]);
        if (!conversations || !serverUrl) {
          sendResponse({ success: false, error: 'No conversations or AI server URL' });
          return;
        }

        const conv = conversations.find(c => c.conversationId === conversationId);
        if (!conv) {
          sendResponse({ success: false, error: 'Conversation not found' });
          return;
        }

        await updateConversationDraft(conversationId, null, 'generating');
        // Notify popup of status change
        try { await chrome.runtime.sendMessage({ action: 'conversationUpdate' }); } catch (e) {}

        await generateDraftReply(conv, serverUrl, apiKey);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  return false;
});

// ============================================================================
// NOTIFICATION CLICK HANDLER
// ============================================================================

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith('manual-review-')) {
    // Focus the listing tab — find the most recently created ImmoScout tab
    try {
      const tabs = await chrome.tabs.query({ url: 'https://www.immobilienscout24.de/expose/*' });
      if (tabs.length > 0) {
        const tab = tabs[tabs.length - 1];
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    } catch (e) {
      console.error('Error focusing tab from notification:', e);
    }
    chrome.notifications.clear(notificationId);
  }
});
