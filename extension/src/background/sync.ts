import * as C from '../shared/constants';
import { capSeenListings } from '../shared/utils';
import { humanDelay, waitForTabLoad } from './helpers';
import { isMonitoring, setSearchTabId } from './state';
import { findOrCreateSearchTab } from './tabs';

export interface ConversationApiResponse {
  conversations?: any[];
}

export async function syncContactedListings(): Promise<number> {
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

interface Listing {
  id: string;
  url: string;
  title?: string;
  [key: string]: any;
}

export async function _markAllCurrentListingsAsSeen(): Promise<void> {
  const result = await findOrCreateSearchTab();

  if (!result) {
    console.log('No search tab found. Will mark listings as seen on first check.');
    return;
  }

  const { tab, searchUrl } = result;

  await chrome.tabs.update(tab.id!, { url: searchUrl });
  await waitForTabLoad(tab.id!, C.TAB_LOAD_TIMEOUT);
  await new Promise((resolve) => setTimeout(resolve, humanDelay(2000, 1000)));

  try {
    const results: any = await chrome.tabs.sendMessage(tab.id!, { action: 'extractListings' });
    const allListings: Listing[] = results?.listings || [];

    // Check for additional pages
    let paginationInfo = { currentPage: 1, totalPages: 1 };
    try {
      paginationInfo = await chrome.tabs.sendMessage(tab.id!, { action: 'extractPaginationInfo' });
    } catch (_e) {
      console.debug('[Sync] Pagination extraction failed, assuming single page');
    }

    const maxPages = Math.min(paginationInfo.totalPages, 3);
    for (let page = 2; page <= maxPages; page++) {
      const pageUrl = new URL(searchUrl);
      pageUrl.searchParams.set('pagenumber', String(page));

      await chrome.tabs.update(tab.id!, { url: pageUrl.toString() });
      await waitForTabLoad(tab.id!, C.TAB_LOAD_TIMEOUT);
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
