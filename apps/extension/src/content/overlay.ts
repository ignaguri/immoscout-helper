// Search page overlay — injects status badges and action buttons on listing cards

import { log } from '../shared/logger';
import * as S from './selectors';

interface OverlayData {
  seenIds: string[];
  queuedIds: string[];
  blacklistedIds: string[];
}

const BADGE_CLASS = 'is24-ext-badge';
const ACTIONS_CLASS = 'is24-ext-actions';
const OVERLAY_ATTR = 'data-is24-ext-overlay';

function injectStyles(): void {
  if (document.getElementById('is24-ext-overlay-styles')) return;
  const style = document.createElement('style');
  style.id = 'is24-ext-overlay-styles';
  style.textContent = `
    .${BADGE_CLASS} {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 100;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      line-height: 18px;
      pointer-events: none;
      white-space: nowrap;
    }
    .${BADGE_CLASS}--sent {
      background: #22c55e;
      color: #fff;
    }
    .${BADGE_CLASS}--queued {
      background: #eab308;
      color: #000;
    }
    .${BADGE_CLASS}--blacklisted {
      background: #6b7280;
      color: #fff;
    }
    .${ACTIONS_CLASS} {
      position: absolute;
      bottom: 8px;
      right: 8px;
      z-index: 100;
      display: flex;
      gap: 6px;
    }
    .${ACTIONS_CLASS} button {
      padding: 3px 10px;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      opacity: 0.9;
      transition: opacity 0.15s;
    }
    .${ACTIONS_CLASS} button:hover {
      opacity: 1;
    }
    .${ACTIONS_CLASS} .is24-ext-queue-btn {
      background: #3b82f6;
      color: #fff;
    }
    .${ACTIONS_CLASS} .is24-ext-skip-btn {
      background: #6b7280;
      color: #fff;
    }
  `;
  document.head.appendChild(style);
}

function getListingId(el: Element): string | null {
  const id =
    el.getAttribute('data-obid') ||
    el.getAttribute('data-exp-id') ||
    el.getAttribute('data-go-to-expose-id') ||
    el.getAttribute('data-id');
  if (id && /^\d+$/.test(id)) return id.toLowerCase();

  const link = el.querySelector(S.LISTING_LINK_SELECTOR) as HTMLAnchorElement | null;
  const href = link?.href || '';
  const match = href.match(/\/expose\/(\d+)/);
  return match ? match[1].toLowerCase() : null;
}

function getListingTitle(el: Element): string {
  return el.querySelector('h2, h3, h4, [class*="title"], [data-testid="headline"]')?.textContent?.trim() || '';
}

function getListingUrl(el: Element, id: string): string {
  const link = el.querySelector(S.LISTING_LINK_SELECTOR) as HTMLAnchorElement | null;
  if (link?.href?.startsWith('http')) return link.href;
  return `https://www.immobilienscout24.de/expose/${id}`;
}

function clearOverlay(el: Element): void {
  el.querySelectorAll(`.${BADGE_CLASS}, .${ACTIONS_CLASS}`).forEach((c) => {
    c.remove();
  });
  el.removeAttribute(OVERLAY_ATTR);
}

function ensureRelativePosition(el: Element): void {
  const style = getComputedStyle(el);
  if (style.position === 'static') {
    (el as HTMLElement).style.position = 'relative';
  }
}

export function applyOverlay(data: OverlayData): { applied: number } {
  injectStyles();

  const seenSet = new Set(data.seenIds.map((id) => String(id).toLowerCase().trim()));
  const queuedSet = new Set(data.queuedIds.map((id) => String(id).toLowerCase().trim()));
  const blacklistSet = new Set(data.blacklistedIds.map((id) => String(id).toLowerCase().trim()));

  // Find listing card elements (same strategy as listings.ts)
  let elements: Element[] = Array.from(document.querySelectorAll(S.LISTING_CARD_SELECTORS));
  if (elements.length === 0) {
    elements = Array.from(document.querySelectorAll(S.LISTING_FALLBACK_SELECTORS));
  }
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

  let applied = 0;

  for (const el of elements) {
    const id = getListingId(el);
    if (!id) continue;

    // Clear any existing overlay before re-applying
    clearOverlay(el);
    ensureRelativePosition(el);
    el.setAttribute(OVERLAY_ATTR, id);

    const isSeen = seenSet.has(id);
    const isQueued = queuedSet.has(id);
    const isBlacklisted = blacklistSet.has(id);

    // Badge
    if (isSeen || isQueued || isBlacklisted) {
      const badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      if (isBlacklisted) {
        badge.classList.add(`${BADGE_CLASS}--blacklisted`);
        badge.textContent = 'Skipped';
      } else if (isSeen) {
        badge.classList.add(`${BADGE_CLASS}--sent`);
        badge.textContent = 'Sent';
      } else {
        badge.classList.add(`${BADGE_CLASS}--queued`);
        badge.textContent = 'Queued';
      }
      el.appendChild(badge);
      applied++;
      continue; // No action buttons for already-processed listings
    }

    // Action buttons for un-processed listings
    const actions = document.createElement('div');
    actions.className = ACTIONS_CLASS;

    const queueBtn = document.createElement('button');
    queueBtn.className = 'is24-ext-queue-btn';
    queueBtn.textContent = 'Queue';
    queueBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const title = getListingTitle(el);
      const url = getListingUrl(el, id);
      chrome.runtime.sendMessage(
        { action: 'captureQueueItems', listings: [{ id, url, title, index: 0 }] },
        (response) => {
          if (response?.success) {
            queueBtn.textContent = 'Queued';
            queueBtn.disabled = true;
            skipBtn.remove();
          } else {
            queueBtn.textContent = 'Error';
            setTimeout(() => {
              queueBtn.textContent = 'Queue';
            }, 2000);
          }
        },
      );
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'is24-ext-skip-btn';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: 'blacklistListing', listingId: id }, (response) => {
        if (response?.success) {
          clearOverlay(el);
          ensureRelativePosition(el);
          const badge = document.createElement('span');
          badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--blacklisted`;
          badge.textContent = 'Skipped';
          el.appendChild(badge);
        } else {
          skipBtn.textContent = 'Error';
          setTimeout(() => {
            skipBtn.textContent = 'Skip';
          }, 2000);
        }
      });
    });

    actions.appendChild(queueBtn);
    actions.appendChild(skipBtn);
    el.appendChild(actions);
    applied++;
  }

  log(`[IS24] Overlay applied to ${applied} listings`);
  return { applied };
}
