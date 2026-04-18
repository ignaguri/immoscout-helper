// Shared image fetcher + export format dispatch for saved/exported listings.
// Runs only in the service worker (has host_permissions for pictures.immobilienscout24.de).

import type { LandlordInfo, ListingDetails } from '@repo/shared-types';
import * as C from '../shared/constants';
import { buildSelfContainedHtml, type HtmlImageRef, slugForFilename } from '../shared/export-html';
import { buildZip } from '../shared/export-zip';
import { error, warn } from '../shared/logger';
import type { ExportFormat, SavedImage } from '../shared/types';

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  // Chunked conversion to avoid stack overflow on large images
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return `data:${blob.type || 'image/webp'};base64,${btoa(binary)}`;
}

async function fetchOne(url: string): Promise<SavedImage | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      warn(`[Exporter] image HTTP ${res.status}: ${url}`);
      return null;
    }
    const blob = await res.blob();
    if (blob.size > C.SAVED_IMAGE_MAX_BYTES) {
      warn(`[Exporter] image too big (${blob.size} bytes), skipping: ${url}`);
      return null;
    }
    return {
      url,
      blob,
      mimeType: blob.type || 'image/webp',
    };
  } catch (e: any) {
    warn(`[Exporter] fetch failed for ${url}: ${e?.message}`);
    return null;
  }
}

/** Fetches all image URLs with bounded concurrency. Returns one entry per URL
 *  (in order). Failed entries are null and the caller can surface the failures. */
export async function fetchListingImages(urls: string[]): Promise<Array<SavedImage | null>> {
  const results: Array<SavedImage | null> = new Array(urls.length).fill(null);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < urls.length) {
      const idx = cursor++;
      results[idx] = await fetchOne(urls[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(C.SAVED_IMAGE_CONCURRENCY, urls.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Filters null entries out and returns [images, failedUrls]. */
export function splitFetchResults(
  urls: string[],
  results: Array<SavedImage | null>,
): { images: SavedImage[]; failedUrls: string[] } {
  const images: SavedImage[] = [];
  const failedUrls: string[] = [];
  results.forEach((r, i) => {
    if (r) images.push(r);
    else failedUrls.push(urls[i]);
  });
  return { images, failedUrls };
}

async function imagesToHtmlRefs(images: SavedImage[]): Promise<HtmlImageRef[]> {
  const refs: HtmlImageRef[] = [];
  for (let i = 0; i < images.length; i++) {
    const dataUrl = await blobToDataUrl(images[i].blob);
    refs.push({ src: dataUrl, alt: `Image ${i + 1}` });
  }
  return refs;
}

/** Download a Blob via chrome.downloads by converting to data URL (service
 *  workers lack URL.createObjectURL). */
async function downloadBlob(blob: Blob, filename: string): Promise<number> {
  const dataUrl = await blobToDataUrl(blob);
  return chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
}

/** Remove `print-*` session-storage stashes older than one hour. Protects
 *  against orphan accumulation when the user closes the print tab before the
 *  page consumes the key. */
const PRINT_KEY_TTL_MS = 60 * 60 * 1000;
async function evictStalePrintKeys(): Promise<void> {
  try {
    const all = await chrome.storage.session.get(null);
    const now = Date.now();
    const stale: string[] = [];
    for (const k of Object.keys(all)) {
      if (!k.startsWith('print-')) continue;
      const ts = Number(k.split('-')[1]);
      if (Number.isFinite(ts) && now - ts > PRINT_KEY_TTL_MS) stale.push(k);
    }
    if (stale.length) await chrome.storage.session.remove(stale);
  } catch {
    /* best-effort cleanup */
  }
}

export interface ExportInput {
  listingId: string;
  sourceUrl: string;
  details: ListingDetails;
  landlord: LandlordInfo;
  images: SavedImage[];
  savedAt: number;
  format: ExportFormat;
  /** For PDF flow only: if this export is for a persisted snapshot we can open
   *  the print page by listingId and let it read images from IndexedDB instead
   *  of stashing them in session storage. */
  pdfSource?: 'snapshot' | 'ephemeral';
  /** For PDF from an ephemeral listing-page export: original image URLs so the
   *  print page can fetch them from the CDN (it has host permission). */
  ephemeralImageUrls?: string[];
}

/** Export a saved/collected snapshot in the requested format.
 *  Returns `{ success, filename?, method? }` or `{ success: false, error }`. */
export async function exportSnapshot(
  input: ExportInput,
): Promise<{ success: true; method: 'download' | 'print-tab'; filename?: string } | { success: false; error: string }> {
  const { listingId, sourceUrl, details, landlord, images, savedAt, format } = input;
  const slug = slugForFilename(details, listingId);
  const datePart = new Date(savedAt).toISOString().slice(0, 10);

  try {
    if (format === 'zip') {
      const zipBlob = await buildZip({ details, landlord, images, sourceUrl, savedAt, listingId });
      const filename = `immoscout-${slug}-${datePart}.zip`;
      await downloadBlob(zipBlob, filename);
      return { success: true, method: 'download', filename };
    }

    if (format === 'html') {
      const refs = await imagesToHtmlRefs(images);
      const html = buildSelfContainedHtml({ details, landlord, images: refs, sourceUrl, savedAt });
      const blob = new Blob([html], { type: 'text/html' });
      const filename = `immoscout-${slug}-${datePart}.html`;
      await downloadBlob(blob, filename);
      return { success: true, method: 'download', filename };
    }

    if (format === 'pdf') {
      // Route PDF through the extension's own print page to avoid Chrome's
      // data-URL length cap on <tabs.create>. Two paths:
      //   snapshot  → print page reads images from IndexedDB by listingId
      //   ephemeral → stash (details, landlord, imageUrls) in storage.session
      //               and let the print page re-fetch images from the CDN.
      if (input.pdfSource === 'snapshot') {
        const url = `${chrome.runtime.getURL('print.html')}?id=${encodeURIComponent(listingId)}`;
        await chrome.tabs.create({ url, active: true });
        return { success: true, method: 'print-tab' };
      }
      await evictStalePrintKeys();
      const key = `print-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const imageUrls = input.ephemeralImageUrls || images.map((i) => i.url);
      await chrome.storage.session.set({
        [key]: { details, landlord, imageUrls, sourceUrl, savedAt },
      });
      const url = `${chrome.runtime.getURL('print.html')}?key=${encodeURIComponent(key)}`;
      await chrome.tabs.create({ url, active: true });
      return { success: true, method: 'print-tab' };
    }

    return { success: false, error: `Unknown format: ${format}` };
  } catch (e: any) {
    error('[Exporter] export failed:', e);
    return { success: false, error: e?.message || 'Export failed' };
  }
}

