import * as C from '../shared/constants';
import { waitForTabLoad } from './helpers';

export interface SearchTabResult {
  tab: chrome.tabs.Tab;
  searchUrl: string;
}

export async function findOrCreateSearchTab(): Promise<SearchTabResult | null> {
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
        console.debug('[Tabs] Could not parse tab URL for matching');
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
