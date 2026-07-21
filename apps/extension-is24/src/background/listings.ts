import * as C from '../shared/constants';
import { debug, error, log } from '../shared/logger';
import { humanDelay, waitForTabLoad } from './helpers';
import { enqueueListings, processQueue } from './queue';
import { isMonitoring, setSearchTabId } from './state';
import { syncContactedListings } from './sync';
import { findOrCreateSearchTab } from './tabs';

export interface Listing {
  id: string;
  url: string;
  title?: string;
  [key: string]: any;
}

// Send activity log entry to popup + persist to storage
export async function sendActivityLog(data: Record<string, any>): Promise<void> {
  const entry = { ...data, timestamp: Date.now(), _id: crypto.randomUUID() };

  // Persist to storage
  try {
    const stored: Record<string, any> = await chrome.storage.local.get([C.ACTIVITY_LOG_KEY]);
    const activityLog: any[] = stored[C.ACTIVITY_LOG_KEY] || [];
    activityLog.push(entry);
    if (activityLog.length > C.ACTIVITY_LOG_CAP) activityLog.splice(0, activityLog.length - C.ACTIVITY_LOG_CAP);
    await chrome.storage.local.set({ [C.ACTIVITY_LOG_KEY]: activityLog });
  } catch (_e) {
    debug('[Listings] Failed to persist activity log to storage');
  }

  // Send to popup (may be closed) — include timestamp for dedup
  try {
    await chrome.runtime.sendMessage({ action: 'activityLog', ...entry });
  } catch (_e) {
    debug('[Listings] Could not send activity log to popup (likely closed)');
  }
}

export async function checkForNewListings(): Promise<void> {
  try {
    await sendActivityLog({ message: `[${new Date().toLocaleTimeString()}] Checking for new listings...` });
    await syncContactedListings();

    const result = await findOrCreateSearchTab();

    if (!result) {
      log('Could not find or create search tab. Check your Search URL setting.');
      return;
    }

    const { tab, searchUrl } = result;
    setSearchTabId(tab.id!);

    // Check if tab is already showing the search page (skip reload)
    let needsReload = true;
    try {
      const currentTab = await chrome.tabs.get(tab.id!);
      const currentUrl = new URL(currentTab.url!);
      const targetUrl = new URL(searchUrl);
      if (currentUrl.origin === targetUrl.origin && currentUrl.pathname === targetUrl.pathname) {
        // URL matches — check if content script is alive
        try {
          await chrome.tabs.sendMessage(tab.id!, { action: 'ping' });
          needsReload = false;
          log(`[${new Date().toLocaleTimeString()}] Search tab already loaded, content script ready — extracting...`);
        } catch {
          log(
            `[${new Date().toLocaleTimeString()}] Search tab URL matches but content script not available — reloading...`,
          );
        }
      }
    } catch {
      debug('[Listings] Could not check current tab state, will reload');
    }

    if (needsReload) {
      log(`[${new Date().toLocaleTimeString()}] Reloading search page...`);
      await chrome.tabs.update(tab.id!, { url: searchUrl });
      await waitForTabLoad(tab.id!, C.TAB_LOAD_TIMEOUT);
      await new Promise((resolve) => setTimeout(resolve, humanDelay(2000, 1000)));
    }

    if (!isMonitoring) return;

    await chrome.storage.local.set({ [C.LAST_CHECK_TIME_KEY]: Date.now() });

    try {
      await chrome.tabs.get(tab.id!);
      const results: any = await chrome.tabs.sendMessage(tab.id!, { action: 'extractListings' });
      const allListings: Listing[] = results?.listings || [];

      // Check for additional pages
      let paginationInfo = { currentPage: 1, totalPages: 1 };
      try {
        paginationInfo = await chrome.tabs.sendMessage(tab.id!, { action: 'extractPaginationInfo' });
      } catch (_e) {
        debug('[Listings] Pagination extraction failed, assuming single page');
      }

      const maxPages = Math.min(paginationInfo.totalPages, 3);
      for (let page = 2; page <= maxPages; page++) {
        if (!isMonitoring) break;

        const pageUrl = new URL(searchUrl);
        pageUrl.searchParams.set('pagenumber', String(page));

        await chrome.tabs.update(tab.id!, { url: pageUrl.toString() });
        await waitForTabLoad(tab.id!, C.TAB_LOAD_TIMEOUT);
        await new Promise((r) => setTimeout(r, humanDelay(3000, 2000)));

        const pageResults: any = await chrome.tabs.sendMessage(tab.id!, { action: 'extractListings' });
        if (pageResults?.listings?.length) {
          allListings.push(...pageResults.listings);
          log(`[Pagination] Page ${page}: ${pageResults.listings.length} listings`);
        } else {
          break;
        }
      }

      if (maxPages > 1) {
        log(`[Pagination] Total: ${allListings.length} listings from ${maxPages} pages`);
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
    } catch (err) {
      error('Error extracting listings:', err);
      setSearchTabId(null);
    }
  } catch (err) {
    error('Error checking for new listings:', err);
    setSearchTabId(null);
  }
}
