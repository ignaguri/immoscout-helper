import * as C from '../shared/constants';
import { log, debug, error } from '../shared/logger';
import { waitForTabLoad } from './helpers';
import { advanceSearchUrlIndex, searchUrlIndex } from './state';

export interface SearchTabResult {
  tab: chrome.tabs.Tab;
  searchUrl: string;
}

// Resolve the list of search URLs (multi-URL with legacy single-URL fallback)
async function getSearchUrls(): Promise<string[]> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.SEARCH_URLS_KEY, C.SEARCH_URL_KEY]);
  const urls: string[] = stored[C.SEARCH_URLS_KEY] || [];
  if (urls.length > 0) return urls.map((u: string) => u.trim()).filter(Boolean);

  // Fallback: legacy single URL
  const legacy: string | undefined = stored[C.SEARCH_URL_KEY];
  if (legacy?.trim()) return [legacy.trim()];

  return [];
}

export async function findOrCreateSearchTab(): Promise<SearchTabResult | null> {
  try {
    const urls = await getSearchUrls();

    if (urls.length === 0) {
      error('No search URL configured');
      return null;
    }

    // Round-robin: pick the current URL and advance the index
    const searchUrl = urls[searchUrlIndex % urls.length];
    await advanceSearchUrlIndex(urls.length);

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
        debug('[Tabs] Could not parse tab URL for matching');
        return false;
      }
    });

    if (matchingTab) {
      log('Found existing tab with configured URL');
      return { tab: matchingTab, searchUrl };
    }

    log('Creating new tab with configured URL');
    const newTab = await chrome.tabs.create({ url: searchUrl, active: false });

    await waitForTabLoad(newTab.id!, 10000);

    return { tab: newTab, searchUrl };
  } catch (err) {
    error('Error finding/creating search tab:', err);
    return null;
  }
}
