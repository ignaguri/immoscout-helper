// Background service worker for ImmoScout24 Auto Reloader

const DEFAULT_CHECK_INTERVAL = 60000; // Default: Check every 60 seconds (1 minute)
const STORAGE_KEY = 'seenListings';
const SEARCH_URL_KEY = 'searchUrl';
const MESSAGE_TEMPLATE_KEY = 'messageTemplate';
const CHECK_INTERVAL_KEY = 'checkInterval';
const RATE_LIMIT_KEY = 'rateLimit'; // Messages per hour
const MIN_DELAY_KEY = 'minDelay'; // Minimum delay between messages (seconds)
const MONITORING_STATE_KEY = 'isMonitoring'; // Persist monitoring state
const ALARM_NAME = 'checkListings';

// Form field keys
const FORM_ADULTS_KEY = 'formAdults';
const FORM_CHILDREN_KEY = 'formChildren';
const FORM_PETS_KEY = 'formPets';
const FORM_INCOME_KEY = 'formIncome';
const FORM_HOUSEHOLD_SIZE_KEY = 'formHouseholdSize';
const FORM_EMPLOYMENT_KEY = 'formEmployment';
const FORM_INCOME_RANGE_KEY = 'formIncomeRange';
const FORM_DOCUMENTS_KEY = 'formDocuments';
const FORM_SALUTATION_KEY = 'formSalutation';
const FORM_PHONE_KEY = 'formPhone';
const AUTO_SEND_MODE_KEY = 'autoSendMode';

let isMonitoring = false;
let currentCheckInterval = DEFAULT_CHECK_INTERVAL;
let searchTabId = null; // Track the search results tab (reused and reloaded)
let lastMessageTime = 0; // Track last message time for rate limiting
let messageCount = 0; // Track messages sent in current hour
let messageCountResetTime = Date.now() + 3600000; // Reset count after 1 hour
let pendingTimeouts = []; // Track all pending timeouts to clear on stop

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Apartment Messenger installed');
  initializeStorage();
});

// Restore monitoring state when service worker wakes up
chrome.runtime.onStartup.addListener(async () => {
  console.log('Service worker started, checking monitoring state...');
  await restoreMonitoringState();
});

// Also check on service worker activation (for when it wakes from sleep)
(async () => {
  console.log('Service worker activated, checking monitoring state...');
  await restoreMonitoringState();
})();

// Restore monitoring state from storage
async function restoreMonitoringState() {
  const { [MONITORING_STATE_KEY]: savedState } = await chrome.storage.local.get([MONITORING_STATE_KEY]);
  if (savedState) {
    console.log('Restoring monitoring state: was monitoring');
    isMonitoring = true;
    await updateCheckInterval();
    
    // Always recreate the alarm to ensure it fires soon
    await chrome.alarms.clear(ALARM_NAME);
    const periodInMinutes = Math.max(1, currentCheckInterval / 60000); // Minimum 1 minute
    
    // Set alarm to fire in 1 minute, then repeat at the configured period
    await chrome.alarms.create(ALARM_NAME, { 
      delayInMinutes: 1, // First check in 1 minute
      periodInMinutes: periodInMinutes 
    });
    
    console.log(`Alarm restored: first check in 1 minute, then every ${periodInMinutes} minutes`);
  } else {
    console.log('No saved monitoring state - monitoring is off');
  }
}

// Listen for alarms (persists across service worker restarts)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log(`[${new Date().toLocaleTimeString()}] Alarm triggered - checking for new listings...`);
    if (isMonitoring) {
      try {
        await checkForNewListings();
      } catch (error) {
        console.error('Error in alarm check:', error);
      }
    }
  }
});

// Initialize storage with default values
async function initializeStorage() {
  const result = await chrome.storage.local.get([
    STORAGE_KEY, SEARCH_URL_KEY, MESSAGE_TEMPLATE_KEY, CHECK_INTERVAL_KEY, 
    RATE_LIMIT_KEY, MIN_DELAY_KEY, FORM_ADULTS_KEY, FORM_CHILDREN_KEY, 
    FORM_PETS_KEY, FORM_INCOME_KEY
  ]);
  
  if (!result[STORAGE_KEY]) {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  }
  
  if (!result[SEARCH_URL_KEY]) {
    await chrome.storage.local.set({ 
      [SEARCH_URL_KEY]: 'https://www.immobilienscout24.de/Suche/de/wohnung-mieten'
    });
  }
  
  if (!result[MESSAGE_TEMPLATE_KEY]) {
    await chrome.storage.local.set({ 
      [MESSAGE_TEMPLATE_KEY]: 'Sehr geehrte Damen und Herren,\n\nich interessiere mich für diese Wohnung und würde gerne mehr Informationen erhalten.\n\nMit freundlichen Grüßen'
    });
  }
  
  if (!result[CHECK_INTERVAL_KEY]) {
    await chrome.storage.local.set({ 
      [CHECK_INTERVAL_KEY]: 60 // Default 60 seconds (1 minute)
    });
  }
  
  if (!result[RATE_LIMIT_KEY]) {
    await chrome.storage.local.set({ 
      [RATE_LIMIT_KEY]: 10 // Default: max 10 messages per hour
    });
  }
  
  if (!result[MIN_DELAY_KEY]) {
    await chrome.storage.local.set({ 
      [MIN_DELAY_KEY]: 30 // Default: minimum 30 seconds between messages
    });
  }
  
  // Initialize form field defaults
  if (!result[FORM_ADULTS_KEY]) {
    await chrome.storage.local.set({ [FORM_ADULTS_KEY]: 2 });
  }
  if (!result[FORM_CHILDREN_KEY]) {
    await chrome.storage.local.set({ [FORM_CHILDREN_KEY]: 0 });
  }
  if (!result[FORM_PETS_KEY]) {
    await chrome.storage.local.set({ [FORM_PETS_KEY]: 'Nein' });
  }
  if (!result[FORM_INCOME_KEY]) {
    await chrome.storage.local.set({ [FORM_INCOME_KEY]: 2000 });
  }
  if (!result[FORM_HOUSEHOLD_SIZE_KEY]) {
    await chrome.storage.local.set({ [FORM_HOUSEHOLD_SIZE_KEY]: 'Einpersonenhaushalt' });
  }
  if (!result[FORM_EMPLOYMENT_KEY]) {
    await chrome.storage.local.set({ [FORM_EMPLOYMENT_KEY]: 'Angestellte' });
  }
  if (!result[FORM_INCOME_RANGE_KEY]) {
    await chrome.storage.local.set({ [FORM_INCOME_RANGE_KEY]: '1.500 - 2.000' });
  }
  if (!result[FORM_DOCUMENTS_KEY]) {
    await chrome.storage.local.set({ [FORM_DOCUMENTS_KEY]: 'Vorhanden' });
  }
  if (!result[FORM_SALUTATION_KEY]) {
    await chrome.storage.local.set({ [FORM_SALUTATION_KEY]: 'Frau' });
  }
  if (!result[FORM_PHONE_KEY]) {
    await chrome.storage.local.set({ [FORM_PHONE_KEY]: '' });
  }
}

// Get random delay between min and max (in milliseconds)
function getRandomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

// Human-like delay with randomization
function humanDelay(baseMs, varianceMs = 0) {
  const delay = baseMs + (varianceMs > 0 ? getRandomDelay(-varianceMs, varianceMs) : 0);
  return Math.max(100, delay); // Minimum 100ms
}

// Check rate limit
async function checkRateLimit() {
  const now = Date.now();
  
  // Reset counter if an hour has passed
  if (now >= messageCountResetTime) {
    messageCount = 0;
    messageCountResetTime = now + 3600000; // Next hour
  }
  
  const { [RATE_LIMIT_KEY]: rateLimit, [MIN_DELAY_KEY]: minDelaySeconds } = await chrome.storage.local.get([RATE_LIMIT_KEY, MIN_DELAY_KEY]);
  const rateLimitValue = rateLimit || 10;
  const minDelay = (minDelaySeconds || 30) * 1000; // Convert to milliseconds
  
  // Check if we've exceeded rate limit
  if (messageCount >= rateLimitValue) {
    const waitTime = messageCountResetTime - now;
    console.log(`Rate limit reached (${messageCount}/${rateLimitValue} messages). Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
    return { allowed: false, waitTime };
  }
  
  // Check minimum delay between messages
  const timeSinceLastMessage = now - lastMessageTime;
  if (timeSinceLastMessage < minDelay) {
    const waitTime = minDelay - timeSinceLastMessage;
    console.log(`Rate limiting: Waiting ${Math.ceil(waitTime / 1000)} seconds before next message...`);
    return { allowed: false, waitTime };
  }
  
  return { allowed: true };
}

// Ensure URL has sorting parameter for newest first
function ensureSorting(url) {
  try {
    const urlObj = new URL(url);
    
    // ImmoScout24 uses sorting=2 for newest first (Aktualität)
    // Don't override if already set
    if (!urlObj.searchParams.has('sorting')) {
      urlObj.searchParams.set('sorting', '2');
    }
    
    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, try to append parameter
    const separator = url.includes('?') ? '&' : '?';
    if (!url.includes('sorting=')) {
      return `${url}${separator}sorting=2`;
    }
    return url;
  }
}

// Start monitoring for new listings
async function startMonitoring() {
  if (isMonitoring) {
    console.log('Monitoring already active');
    return;
  }
  
  try {
    isMonitoring = true;
    console.log('Starting monitoring...');
    
    // Get check interval from storage (always get fresh value)
    await updateCheckInterval();
    
    // FIRST: Mark all current listings as seen (don't process them)
    console.log('Initial scan: marking all existing listings as seen...');
    try {
      await markAllCurrentListingsAsSeen();
    } catch (error) {
      console.error('Error marking existing listings as seen:', error);
    }
    
    console.log(`Monitoring started. Will check every ${currentCheckInterval / 1000} seconds.`);
    console.log('Only NEW listings (appearing after now) will be processed.');
    
    // Save monitoring state to persist across service worker restarts
    await chrome.storage.local.set({ [MONITORING_STATE_KEY]: true });
    
    // Use chrome.alarms instead of setInterval (survives service worker sleep)
    const periodInMinutes = Math.max(1, currentCheckInterval / 60000); // Minimum 1 minute
    
    // Set alarm to fire at the configured period
    await chrome.alarms.create(ALARM_NAME, { 
      delayInMinutes: periodInMinutes, // First check after the interval
      periodInMinutes: periodInMinutes 
    });
    
    console.log(`Alarm set. First check in ${periodInMinutes} minutes, then every ${periodInMinutes} minutes.`);
  } catch (error) {
    console.error('Error in startMonitoring:', error);
    isMonitoring = false;
    throw error;
  }
}

// Mark all current listings on the page as seen (without processing them)
async function markAllCurrentListingsAsSeen() {
  // Find or create tab with configured search URL
  const result = await findOrCreateSearchTab();
  
  if (!result) {
    console.log('No search tab found. Will mark listings as seen on first check.');
    return;
  }
  
  const { tab, searchUrl } = result;
  
  // Navigate to configured URL (this also loads the page)
  await chrome.tabs.update(tab.id, { url: searchUrl });
  
  // Wait for page to load
  await new Promise(resolve => setTimeout(resolve, humanDelay(4000, 1000)));
  
  try {
    // Extract all listings
    const results = await chrome.tabs.sendMessage(tab.id, { action: 'extractListings' });
    
    if (results && results.listings && results.listings.length > 0) {
      // Get current seen list
      const { [STORAGE_KEY]: seenListings } = await chrome.storage.local.get([STORAGE_KEY]);
      const seenList = seenListings || [];
      
      // Add all listing IDs to seen list
      const newSeenIds = results.listings
        .map(listing => String(listing.id).toLowerCase().trim())
        .filter(id => id && !isListingSeen(id, seenList));
      
      if (newSeenIds.length > 0) {
        const updatedSeen = [...seenList, ...newSeenIds];
        await chrome.storage.local.set({ [STORAGE_KEY]: updatedSeen });
        console.log(`Marked ${newSeenIds.length} existing listings as seen:`, newSeenIds.join(', '));
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

// Update check interval from storage
async function updateCheckInterval() {
  const { [CHECK_INTERVAL_KEY]: intervalSeconds } = await chrome.storage.local.get([CHECK_INTERVAL_KEY]);
  currentCheckInterval = (intervalSeconds || 60) * 1000; // Convert to milliseconds
  console.log(`Check interval set to ${intervalSeconds || 60} seconds`);
}

// Stop monitoring
async function stopMonitoring() {
  if (!isMonitoring) {
    console.log('Monitoring already stopped');
    return;
  }
  
  isMonitoring = false;
  console.log('Stopping monitoring...');
  
  // Clear the alarm
  await chrome.alarms.clear(ALARM_NAME);
  
  // Clear persisted state
  await chrome.storage.local.set({ [MONITORING_STATE_KEY]: false });
  
  // Clear all pending timeouts
  pendingTimeouts.forEach(timeoutId => {
    clearTimeout(timeoutId);
  });
  pendingTimeouts = [];
  
  // Don't close tabs - keep them open for the user
  searchTabId = null;
  
  console.log('Monitoring stopped.');
}

// Find or create tab with the configured search URL
async function findOrCreateSearchTab() {
  try {
    // Get the configured search URL
    const { [SEARCH_URL_KEY]: searchUrl } = await chrome.storage.local.get([SEARCH_URL_KEY]);
    
    if (!searchUrl) {
      console.error('No search URL configured');
      return null;
    }
    
    // Extract the base path to match tabs (ignore query params for matching)
    const configuredUrl = new URL(searchUrl);
    const basePath = configuredUrl.origin + configuredUrl.pathname;
    
    // Query for all tabs
    const allTabs = await chrome.tabs.query({});
    
    // Find tab that matches our configured URL (check if URL starts with same base)
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
    
    // No matching tab found - create one
    console.log('Creating new tab with configured URL');
    const newTab = await chrome.tabs.create({ url: searchUrl, active: false });
    
    // Wait for tab to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return { tab: newTab, searchUrl };
  } catch (error) {
    console.error('Error finding/creating search tab:', error);
    return null;
  }
}

// Check for new listings
async function checkForNewListings() {
  try {
    // Find or create tab with the configured search URL
    const result = await findOrCreateSearchTab();
    
    if (!result) {
      console.log('Could not find or create search tab. Check your Search URL setting.');
      return;
    }
    
    const { tab, searchUrl } = result;
    searchTabId = tab.id;
    
    console.log(`[${new Date().toLocaleTimeString()}] Reloading search page...`);
    
    // Navigate to the configured URL (this also reloads the page)
    await chrome.tabs.update(searchTabId, { url: searchUrl });
    
    // Wait for page to load with random delay (human-like behavior)
    const loadDelay = humanDelay(3000, 1000); // 3-4 seconds for reload
    const timeoutId = setTimeout(async () => {
      if (!isMonitoring) return;
      
      try {
        // Make sure tab still exists
        await chrome.tabs.get(searchTabId);
        
        const results = await chrome.tabs.sendMessage(searchTabId, { action: 'extractListings' });
        
        if (results && results.listings) {
          await processNewListings(results.listings, false);
        }
      } catch (error) {
        console.error('Error extracting listings:', error);
        // Tab might have been closed, reset searchTabId
        searchTabId = null;
      }
    }, loadDelay);
    
    // Track this timeout so we can clear it if monitoring stops
    pendingTimeouts.push(timeoutId);
    
  } catch (error) {
    console.error('Error checking for new listings:', error);
    searchTabId = null;
  }
}

// Check if listing ID is in seen list (simple direct comparison with lowercase normalization)
function isListingSeen(listingId, seenList) {
  if (!listingId || !seenList || seenList.length === 0) {
    return false;
  }
  
  const normalizedId = String(listingId).toLowerCase().trim();
  
  for (const seenEntry of seenList) {
    const seenId = String(seenEntry).toLowerCase().trim();
    if (seenId === normalizedId) {
      return true;
    }
  }
  
  return false;
}

// Process new listings - find first unseen listing and process it
async function processNewListings(listings, ignoreSeen = false) {
  if (!listings || listings.length === 0) {
    return 0;
  }
  
  // Get seen list
  const { [STORAGE_KEY]: seenListings } = await chrome.storage.local.get([STORAGE_KEY]);
  const seenList = seenListings || [];
  
  // Print all seen listings for debugging
  console.log('='.repeat(60));
  console.log('SEEN LIST CHECK');
  console.log(`Total seen listings: ${seenList.length}`);
  if (seenList.length > 0) {
    console.log('Seen IDs:', seenList.join(', '));
  }
  console.log('='.repeat(60));
  
  // Find first unseen listing
  for (let i = 0; i < listings.length; i++) {
    if (!isMonitoring) break;
    
    const listing = listings[i];
    
    // Use the ID from content script (expose ID, already lowercased)
    const listingId = listing.id;
    
    if (!listingId || !listing.url) continue;
    
    const normalizedId = String(listingId).toLowerCase().trim();
    
    console.log(`Checking listing: ${normalizedId}`);
    
    // Skip if already seen
    if (!ignoreSeen) {
      if (isListingSeen(normalizedId, seenList)) {
        console.log(`  -> SKIP (already seen)`);
        continue;
      }
      
      // Double-check with fresh seen list (in case of race condition)
      const freshSeen = await chrome.storage.local.get([STORAGE_KEY]);
      if (isListingSeen(normalizedId, freshSeen[STORAGE_KEY] || [])) {
        console.log(`  -> SKIP (already seen - fresh check)`);
        continue;
      }
    }
    
    console.log(`  -> NEW! Processing...`);
    
    // Found unseen listing - process it
    const listingToProcess = { ...listing, id: normalizedId };
    
    // Check rate limit
    const rateLimitCheck = await checkRateLimit();
    if (!rateLimitCheck.allowed) {
      await new Promise(resolve => setTimeout(resolve, rateLimitCheck.waitTime));
      const recheck = await checkRateLimit();
      if (!recheck.allowed) return 0;
    }
    
    // Process listing
    try {
      const result = await handleNewListing(listingToProcess);
      
      // Mark as seen if successful
      if (!ignoreSeen && result && result.success) {
        const currentSeen = await chrome.storage.local.get([STORAGE_KEY]);
        const currentSeenList = currentSeen[STORAGE_KEY] || [];
        
        if (!isListingSeen(normalizedId, currentSeenList)) {
          const updatedSeen = [...currentSeenList, normalizedId];
        await chrome.storage.local.set({ [STORAGE_KEY]: updatedSeen });
          console.log(`Marked listing as seen: ${normalizedId}`);
        }
      }
      
      return 1;
    } catch (error) {
      console.error('Error processing listing:', error);
      return 0;
    }
  }
  
  console.log('No new listings to process');
  return 0;
}

// Handle a new listing - navigate to it and send message
async function handleNewListing(listing) {
  console.log('Processing new listing:', listing.url);
  
  // Update message count and last message time
  messageCount++;
  lastMessageTime = Date.now();
  
  // Always create a NEW tab for each listing (don't reuse)
  await new Promise(resolve => setTimeout(resolve, humanDelay(500, 300)));
  const listingTab = await chrome.tabs.create({ url: listing.url, active: true });
  const currentListingTabId = listingTab.id;
  
  // Wait for page to load with random delay (human-like behavior)
  // Give more time for content script to inject and be ready
  const pageLoadDelay = humanDelay(4000, 1000); // 4-5 seconds with randomization
  
  // Use Promise to wait for the entire process to complete
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(async () => {
      // Check if monitoring was stopped
      if (!isMonitoring) {
        console.log('Monitoring stopped, skipping message sending');
        resolve({ success: false, listing: listing });
        return;
      }
    
    try {
      // Wait for content script to be ready - try multiple times
      let contentScriptReady = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          await chrome.tabs.sendMessage(currentListingTabId, { action: 'ping' });
          contentScriptReady = true;
          break;
        } catch (error) {
          // Content script not ready yet, wait and retry
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (!contentScriptReady) {
        console.error('Content script not ready after waiting');
        try {
          await chrome.tabs.remove(currentListingTabId);
        } catch (closeError) { /* ignore */ }
        resolve({ success: false, listing: listing, error: 'Content script not ready' });
        return;
      }
      
      // First, extract landlord name and title with random delay
      await new Promise(resolve => setTimeout(resolve, humanDelay(1000, 500)));
      
      // Check again after delay
      if (!isMonitoring) {
        console.log('Monitoring stopped during processing, aborting');
        resolve({ success: false, listing: listing });
        return;
      }
      
      const nameResult = await chrome.tabs.sendMessage(currentListingTabId, { action: 'extractLandlordName' });
      const landlordTitle = nameResult?.title || null;
      const landlordName = nameResult?.name || null;
      
      // Get message template and form values
      const { 
        [MESSAGE_TEMPLATE_KEY]: messageTemplate,
        [AUTO_SEND_MODE_KEY]: autoSendMode,
        [FORM_ADULTS_KEY]: formAdults,
        [FORM_CHILDREN_KEY]: formChildren,
        [FORM_PETS_KEY]: formPets,
        [FORM_INCOME_KEY]: formIncome,
        [FORM_HOUSEHOLD_SIZE_KEY]: formHouseholdSize,
        [FORM_EMPLOYMENT_KEY]: formEmployment,
        [FORM_INCOME_RANGE_KEY]: formIncomeRange,
        [FORM_DOCUMENTS_KEY]: formDocuments,
        [FORM_SALUTATION_KEY]: formSalutation,
        [FORM_PHONE_KEY]: formPhone
      } = await chrome.storage.local.get([
        MESSAGE_TEMPLATE_KEY, AUTO_SEND_MODE_KEY, FORM_ADULTS_KEY, FORM_CHILDREN_KEY, FORM_PETS_KEY, FORM_INCOME_KEY,
        FORM_HOUSEHOLD_SIZE_KEY, FORM_EMPLOYMENT_KEY, FORM_INCOME_RANGE_KEY, FORM_DOCUMENTS_KEY,
        FORM_SALUTATION_KEY, FORM_PHONE_KEY
      ]);
      
      const formValues = {
        adults: formAdults || 2,
        children: formChildren || 0,
        pets: formPets || 'Nein',
        income: formIncome || 2000,
        householdSize: formHouseholdSize || 'Einpersonenhaushalt',
        employmentType: formEmployment || 'Angestellte',
        incomeRange: formIncomeRange || '1.500 - 2.000',
        documents: formDocuments || 'Vorhanden',
        salutation: formSalutation || 'Frau',
        phone: formPhone || ''
      };
      
      // Personalize message with landlord name and title
      let personalizedMessage = messageTemplate || '';
      
      // Build the greeting based on title and name
      // Only use personalized greeting if we have a recognized title (Frau/Herr)
      let greeting = 'Sehr geehrte Damen und Herren,';
      if (landlordTitle === 'Frau' && landlordName) {
        greeting = `Sehr geehrte Frau ${landlordName},`;
      } else if (landlordTitle === 'Herr' && landlordName) {
        greeting = `Sehr geehrter Herr ${landlordName},`;
      }
      
      // Replace {name} placeholder if it exists in template
      // Only use personalized name if we have a recognized title (Frau/Herr)
      if (personalizedMessage.includes('{name}')) {
        if (landlordTitle === 'Frau' && landlordName) {
          personalizedMessage = personalizedMessage.replace(/{name}/g, `Frau ${landlordName}`);
        } else if (landlordTitle === 'Herr' && landlordName) {
          personalizedMessage = personalizedMessage.replace(/{name}/g, `Herr ${landlordName}`);
        } else {
          personalizedMessage = personalizedMessage.replace(/{name}/g, 'Damen und Herren');
        }
      }
      
      // If template doesn't have {name} placeholder, prepend the greeting
      // But only if there's no existing greeting
      if (!personalizedMessage.includes('{name}')) {
        const hasGreeting = /^(Sehr\s+geehrte|Liebe|Hallo|Guten\s+Tag)/i.test(personalizedMessage.trim());
        if (!hasGreeting) {
          personalizedMessage = `${greeting}\n\n${personalizedMessage}`;
        }
        // If user already has a greeting, leave it as-is
      }
      
      // Add small random delay before sending message (human-like)
      await new Promise(resolve => setTimeout(resolve, humanDelay(500, 300)));
      
      // Send the message (or just fill form if manual mode)
      const isAutoSend = autoSendMode !== 'manual';
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
        try {
          await chrome.tabs.remove(currentListingTabId);
        } catch (closeError) { /* ignore */ }
        resolve({ success: false, listing: listing, error: error.message });
        return;
      }
      
      const landlordInfo = landlordTitle && landlordName 
        ? `${landlordTitle} ${landlordName}` 
        : landlordName || 'Unknown';
      
      if (!sendResult || !sendResult.success) {
        const errorMsg = sendResult?.error || 'Unknown error';
        console.error(`Failed to send message to ${landlordInfo}: ${errorMsg}`);
      } else {
        if (isAutoSend) {
          console.log(`Message sent successfully to ${landlordInfo}`);
        } else {
          console.log(`Form filled for ${landlordInfo} - waiting for manual send`);
        }
      }
      
      // In manual mode, keep the tab open for user to review and send
      if (isAutoSend) {
        // Wait a bit to ensure message was sent
        await new Promise(resolve => setTimeout(resolve, humanDelay(2000, 1000))); // 2-3 seconds
        
        // Close the listing tab after sending message
        try {
          await chrome.tabs.remove(currentListingTabId);
          console.log('Closed listing tab');
        } catch (closeError) {
          // Tab might already be closed, ignore error
        }
      } else {
        // In manual mode, focus the tab so user can review
        try {
          await chrome.tabs.update(currentListingTabId, { active: true });
        } catch (e) { /* ignore */ }
      }
      
      // Return success status
      resolve({ success: sendResult && sendResult.success, listing: listing });
      
    } catch (error) {
      console.error('Error sending message:', error);
      // Close the tab even on error
      try {
        await chrome.tabs.remove(currentListingTabId);
      } catch (closeError) {
        // Ignore close errors
      }
      resolve({ success: false, listing: listing, error: error.message });
    }
    }, pageLoadDelay);
    
    // Track this timeout so we can clear it if monitoring stops
    pendingTimeouts.push(timeoutId);
  });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startMonitoring') {
    startMonitoring().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Error starting monitoring:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
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
    return true; // Keep message channel open for async response
  } else if (request.action === 'getStatus') {
    sendResponse({ isMonitoring, checkInterval: currentCheckInterval / 1000 });
  } else if (request.action === 'updateInterval') {
    // Update interval and restart alarm if currently monitoring
    (async () => {
      try {
        if (isMonitoring) {
          // Update the interval value
          if (request.interval) {
            await chrome.storage.local.set({ [CHECK_INTERVAL_KEY]: request.interval });
          }
          // Update current interval
          await updateCheckInterval();
          // Restart the alarm with new period
          await chrome.alarms.clear(ALARM_NAME);
          const periodInMinutes = currentCheckInterval / 60000;
          await chrome.alarms.create(ALARM_NAME, { periodInMinutes });
          console.log(`Check interval updated to ${currentCheckInterval / 1000} seconds`);
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error updating interval:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  
  return false;
});
