// Content script entry point. Registers the site-agnostic message dispatcher
// with the IS24 adapter, then runs IS24-specific page-lifecycle side-effects.

import { debug, log } from '@repo/shared/logger';
import { createContentDispatcher } from '@repo/site-adapter/content';
import { BLACKLIST_KEY, QUEUE_KEY, STORAGE_KEY } from '../shared/constants';
import { is24ContentAdapter } from './adapter';
import { injectExportButton } from './export-button';
import { applyOverlay } from './overlay';

createContentDispatcher(is24ContentAdapter);

log('[IS24] Content script loaded');

// Inject the Export-listing floating button on /expose/ pages
if (location.pathname.startsWith('/expose/')) {
  // Delay slightly so the export button doesn't fight with page-load layout
  setTimeout(() => injectExportButton(), 500);
}

// Auto-apply overlay on search results pages
if (location.pathname.startsWith('/Suche/') || location.href.includes('searchType=')) {
  function refreshOverlay() {
    chrome.storage.local
      .get([STORAGE_KEY, QUEUE_KEY, BLACKLIST_KEY])
      .then((stored) => {
        const seenIds: string[] = stored[STORAGE_KEY] || [];
        const queuedIds: string[] = (stored[QUEUE_KEY] || []).map((item: any) => String(item.id));
        const blacklistedIds: string[] = stored[BLACKLIST_KEY] || [];
        applyOverlay({ seenIds, queuedIds, blacklistedIds });
      })
      .catch((e) => debug('[IS24] Overlay auto-apply failed:', e));
  }

  // Initial apply
  refreshOverlay();

  // Re-apply when new listings are dynamically loaded (infinite scroll, pagination)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refreshOverlay, 300);
  });
  const target = document.querySelector('#resultListItems, [data-testid="result-list"]') || document.body;
  observer.observe(target, { childList: true, subtree: true });
}
