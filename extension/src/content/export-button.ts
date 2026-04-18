// Inject an "Export listing" button on /expose/ pages, placed inside the
// native `.right_buttons` container next to Save / Share / 3-dots so it scrolls
// with the gallery and picks up the site's FAB styling. Falls back to a floating
// bottom-right FAB if the container isn't found (e.g., logged-out or variant layouts).

import { log } from '../shared/logger';
import type { ExportFormat } from '../shared/types';
import { collectGalleryImageUrls, getListingIdFromUrl } from './gallery-images';
import { extractLandlordName, extractListingDetails } from './listing-details';

const HOST_ID = 'is24-export-host';
const TARGET_SELECTOR = '[class*="right_buttons"]';
const CSS = `
  .is24-export-wrap { position: relative; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .is24-export-fab-btn { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; border: 1px solid #d0d0d0; background: white; cursor: pointer; color: #333; font-size: 18px; line-height: 1; padding: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
  .is24-export-fab-btn:hover { background: #f5f5f5; }
  .is24-export-fab-btn:disabled { opacity: 0.6; cursor: wait; }
  .is24-export-fab-btn.busy { color: #3dbda8; }
  .is24-export-menu { position: absolute; top: calc(100% + 6px); right: 0; background: white; border: 1px solid #e0e0e0; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.15); overflow: hidden; display: none; min-width: 180px; z-index: 2147483647; }
  .is24-export-wrap.open .is24-export-menu { display: block; }
  .is24-export-menu button { background: transparent; border: none; width: 100%; text-align: left; padding: 10px 14px; font-size: 13px; color: #333; cursor: pointer; display: block; }
  .is24-export-menu button:hover { background: #f5f5f5; }
  .is24-export-toast { position: absolute; top: calc(100% + 6px); right: 0; background: #333; color: white; padding: 8px 12px; font-size: 12px; border-radius: 6px; white-space: nowrap; display: none; z-index: 2147483647; }
  .is24-export-wrap.toast .is24-export-toast { display: block; }
  /* Fallback floating position when the native container isn't available */
  .is24-export-wrap.is24-floating { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; }
  .is24-export-wrap.is24-floating .is24-export-menu { top: auto; bottom: calc(100% + 6px); }
  .is24-export-wrap.is24-floating .is24-export-toast { top: auto; bottom: calc(100% + 6px); }
`;

let injected = false;

function ensureStyles(): void {
  if (document.getElementById('is24-export-styles')) return;
  const style = document.createElement('style');
  style.id = 'is24-export-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function buildWrap(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'is24-export-wrap';
  wrap.id = HOST_ID;
  wrap.innerHTML = `
    <button class="is24-export-fab-btn" type="button" aria-label="Export listing" title="Export listing">
      <span class="is24-export-icon">📦</span>
    </button>
    <div class="is24-export-menu" role="menu">
      <button type="button" data-format="html">Save as HTML</button>
      <button type="button" data-format="pdf">Print as PDF</button>
      <button type="button" data-format="zip">Download as ZIP</button>
    </div>
    <div class="is24-export-toast" role="status"></div>
  `;
  return wrap;
}

/** Place the Export button. Tries the native `.right_buttons` container first,
 *  falls back to a floating bottom-right FAB. Returns the wrap element. */
function place(wrap: HTMLElement): HTMLElement {
  const target = document.querySelector<HTMLElement>(TARGET_SELECTOR);
  if (target) {
    target.appendChild(wrap);
    return wrap;
  }
  wrap.classList.add('is24-floating');
  document.documentElement.appendChild(wrap);
  return wrap;
}

/** If we injected via the fallback but the native container appears later, relocate. */
function maybeRelocate(wrap: HTMLElement): void {
  if (!wrap.classList.contains('is24-floating')) return;
  const target = document.querySelector<HTMLElement>(TARGET_SELECTOR);
  if (!target) return;
  wrap.classList.remove('is24-floating');
  target.appendChild(wrap);
}

export function injectExportButton(): void {
  if (injected) return;
  if (!getListingIdFromUrl()) return;
  injected = true;

  ensureStyles();
  const wrap = place(buildWrap());

  // If the page renders the FAB container after we run, move from fallback into it.
  if (wrap.classList.contains('is24-floating')) {
    const observer = new MutationObserver(() => {
      maybeRelocate(wrap);
      if (!wrap.classList.contains('is24-floating')) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10_000);
  }

  const btn = wrap.querySelector<HTMLButtonElement>('.is24-export-fab-btn')!;
  const menu = wrap.querySelector<HTMLElement>('.is24-export-menu')!;
  const toastEl = wrap.querySelector<HTMLElement>('.is24-export-toast')!;
  const iconEl = wrap.querySelector<HTMLElement>('.is24-export-icon')!;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) wrap.classList.remove('open');
  });

  menu.querySelectorAll<HTMLButtonElement>('button[data-format]').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const format = opt.dataset.format as ExportFormat;
      wrap.classList.remove('open');
      void runExport(format);
    });
  });

  function showToast(msg: string, durationMs: number): void {
    toastEl.textContent = msg;
    wrap.classList.add('toast');
    setTimeout(() => wrap.classList.remove('toast'), durationMs);
  }

  async function runExport(format: ExportFormat): Promise<void> {
    const listingId = getListingIdFromUrl();
    if (!listingId) {
      showToast('No listing detected', 2500);
      return;
    }
    btn.disabled = true;
    btn.classList.add('busy');
    iconEl.textContent = '⏳';
    try {
      const details = extractListingDetails();
      const landlord = extractLandlordName();
      const imageUrls = collectGalleryImageUrls();
      log(`[IS24] Export ${format} for ${listingId}: ${imageUrls.length} images`);
      const resp: any = await chrome.runtime.sendMessage({
        action: 'exportListingNow',
        format,
        listingId,
        url: location.href,
        details,
        landlord,
        imageUrls,
      });
      if (resp?.success) {
        iconEl.textContent = '✓';
        showToast(`${format.toUpperCase()} export started`, 2500);
      } else {
        iconEl.textContent = '⚠️';
        showToast(resp?.error || 'Export failed', 4000);
      }
    } catch (err: any) {
      iconEl.textContent = '⚠️';
      showToast(err?.message || 'Export failed', 4000);
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.classList.remove('busy');
        iconEl.textContent = '📦';
      }, 2500);
    }
  }
}
