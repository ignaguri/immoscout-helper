// Listing extraction from search results pages

import { log } from '../shared/logger';
import type { Listing, PaginationInfo } from '../shared/types';
import * as S from './selectors';

export function extractListings(): Listing[] {
  const listings: Listing[] = [];

  // Primary: listing cards with data-obid (IS24's current structure)
  let elements: NodeListOf<Element> | Element[] = document.querySelectorAll(S.LISTING_CARD_SELECTORS);

  // Fallback: links with data-exp-id
  if (elements.length === 0) {
    elements = document.querySelectorAll(S.LISTING_FALLBACK_SELECTORS);
  }

  // Last resort: expose links (dedup by container)
  if (elements.length === 0) {
    const links = Array.from(document.querySelectorAll(S.LISTING_LINK_SELECTOR)).filter((link) =>
      link.getAttribute('href')?.match(/\/expose\/\d+/),
    );
    const containers = new Map<Element, Element>();
    links.forEach((link) => {
      const container = link.closest('article, li, div[class*="result"], div[class*="listing"]') || link;
      if (!containers.has(container)) containers.set(container, link);
    });
    elements = Array.from(containers.keys());
  }

  elements.forEach((el, index) => {
    try {
      let exposeId =
        el.getAttribute('data-obid') ||
        el.getAttribute('data-exp-id') ||
        el.getAttribute('data-go-to-expose-id') ||
        el.getAttribute('data-id');

      // Skip non-numeric IDs (ads, touchpoints)
      if (exposeId && !/^\d+$/.test(exposeId)) return;

      const link =
        el.querySelector(S.LISTING_LINK_SELECTOR) ||
        el.closest(S.LISTING_LINK_SELECTOR) ||
        (el.tagName === 'A' && (el as HTMLAnchorElement).href?.includes('/expose/') ? el : null);

      let url = (link as HTMLAnchorElement | null)?.href?.startsWith('http')
        ? (link as HTMLAnchorElement).href
        : link
          ? `https://www.immobilienscout24.de${link.getAttribute('href')}`
          : null;

      if (!exposeId && url) {
        const match = url.match(/\/expose\/(\d+)/);
        exposeId = match?.[1] ?? null;
      }

      if (exposeId && !url) {
        url = `https://www.immobilienscout24.de/expose/${exposeId}`;
      }

      if (exposeId && url) {
        const title =
          el.querySelector('h2, h3, h4, [class*="title"], [data-testid="headline"]')?.textContent?.trim() || 'Unknown';
        listings.push({ id: exposeId.toLowerCase(), url, title, index });
      }
    } catch (_e) {
      /* skip invalid */
    }
  });

  listings.sort((a, b) => a.index - b.index);
  log(`[IS24] Found ${listings.length} listings`);
  return listings;
}

export function extractPaginationInfo(): PaginationInfo {
  // Primary: IS24 pagination nav with page buttons
  const pageButtons = document.querySelectorAll(S.PAGINATION_NAV_BUTTONS);
  if (pageButtons.length > 0) {
    let maxPage = 1;
    let currentPage = 1;
    pageButtons.forEach((btn) => {
      const page = parseInt(btn.getAttribute('page') || '0', 10);
      if (page > maxPage) maxPage = page;
      if (btn.getAttribute('aria-current') === 'true') currentPage = page;
    });
    return { currentPage, totalPages: maxPage };
  }

  // Fallback: pagination links with pagenumber in URL
  const pageLinks = document.querySelectorAll(S.PAGINATION_LINKS);
  if (pageLinks.length > 0) {
    let maxPage = 1;
    pageLinks.forEach((link) => {
      const match = (link as HTMLAnchorElement).href?.match(/pagenumber=(\d+)/);
      const page = parseInt(match?.[1] || '0', 10);
      if (page > maxPage) maxPage = page;
    });
    return { currentPage: 1, totalPages: maxPage };
  }

  // Fallback: next button existence
  const nextBtn = document.querySelector('button[aria-label*="nächste"], a[aria-label*="next"]');
  return { currentPage: 1, totalPages: nextBtn ? 2 : 1 };
}
