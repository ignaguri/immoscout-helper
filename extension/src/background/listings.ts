import * as C from '../shared/constants';
import { capSeenListings } from '../shared/utils';
import { isMonitoring, setSearchTabId } from './state';
import { waitForTabLoad, humanDelay } from './helpers';
import { findOrCreateSearchTab } from './tabs';
import { syncContactedListings } from './sync';
import { enqueueListings, processQueue } from './queue';

export interface Listing {
  id: string;
  url: string;
  title?: string;
  [key: string]: any;
}

// Send activity log entry to popup + persist to storage
export async function sendActivityLog(data: Record<string, any>): Promise<void> {
  // Persist to storage
  try {
    const stored: Record<string, any> = await chrome.storage.local.get([C.ACTIVITY_LOG_KEY]);
    const log: any[] = stored[C.ACTIVITY_LOG_KEY] || [];
    const entry = { ...data, timestamp: Date.now() };
    log.push(entry);
    if (log.length > C.ACTIVITY_LOG_CAP) log.splice(0, log.length - C.ACTIVITY_LOG_CAP);
    await chrome.storage.local.set({ [C.ACTIVITY_LOG_KEY]: log });
  } catch (_e) {
    console.debug('[Listings] Failed to persist activity log to storage');
  }

  // Send to popup (may be closed)
  try {
    await chrome.runtime.sendMessage({ action: 'activityLog', ...data });
  } catch (_e) {
    console.debug('[Listings] Could not send activity log to popup (likely closed)');
  }
}

export async function checkForNewListings(): Promise<void> {
  try {
    await sendActivityLog({ message: `[${new Date().toLocaleTimeString()}] Checking for new listings...` });
    await syncContactedListings();

    const result = await findOrCreateSearchTab();

    if (!result) {
      console.log('Could not find or create search tab. Check your Search URL setting.');
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
      console.debug('[Listings] Could not check current tab state, will reload');
    }

    if (needsReload) {
      console.log(`[${new Date().toLocaleTimeString()}] Reloading search page...`);
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
        console.debug('[Listings] Pagination extraction failed, assuming single page');
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
      setSearchTabId(null);
    }
  } catch (error) {
    console.error('Error checking for new listings:', error);
    setSearchTabId(null);
  }
}
