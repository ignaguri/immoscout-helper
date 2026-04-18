// Background handlers for the conversation-bound snapshot archive.
// - saveSnapshot(listingId, url): opens/reuses a tab, asks content script for
//   details + image URLs, fetches images, writes to IndexedDB + meta to storage.
// - exportSnapshot(listingId, format): loads full snapshot and delegates to exporter.
// - deleteSnapshot(listingId): removes meta + IDB entries.
// - getSnapshotsIndex(): reads the chrome.storage.local map (for popup bootstrap).

import type { LandlordInfo, ListingDetails } from '@repo/shared-types';
import * as C from '../shared/constants';
import { error, log, warn } from '../shared/logger';
import type { ExportFormat, SavedSnapshotMeta } from '../shared/types';
import { fetchListingImages, exportSnapshot as runExport, splitFetchResults } from './exporter';
import { safeCloseTab, waitForContentScript, waitForTabLoad } from './helpers';
import { getFullText, getImages, deleteListing as idbDeleteListing, putFullText, putImages } from './indexeddb';

async function readIndex(): Promise<Record<string, SavedSnapshotMeta>> {
  const stored = await chrome.storage.local.get([C.SAVED_SNAPSHOTS_KEY]);
  return (stored[C.SAVED_SNAPSHOTS_KEY] as Record<string, SavedSnapshotMeta>) || {};
}

async function writeIndex(index: Record<string, SavedSnapshotMeta>): Promise<void> {
  await chrome.storage.local.set({ [C.SAVED_SNAPSHOTS_KEY]: index });
}

function evictIfOverCap(index: Record<string, SavedSnapshotMeta>): {
  index: Record<string, SavedSnapshotMeta>;
  evictedIds: string[];
} {
  const entries = Object.values(index);
  if (entries.length <= C.SAVED_SNAPSHOTS_CAP) return { index, evictedIds: [] };
  entries.sort((a, b) => a.savedAt - b.savedAt);
  const overflow = entries.length - C.SAVED_SNAPSHOTS_CAP;
  const toEvict = entries.slice(0, overflow);
  const next: Record<string, SavedSnapshotMeta> = { ...index };
  const evictedIds: string[] = [];
  for (const e of toEvict) {
    delete next[e.listingId];
    evictedIds.push(e.listingId);
  }
  return { index: next, evictedIds };
}

/** Find or open a tab at the listing URL and return its id + whether we opened it. */
async function getOrOpenListingTab(url: string): Promise<{ tabId: number; opened: boolean }> {
  // Match by expose path only (query params vary)
  const expose = url.match(/\/expose\/\d+/)?.[0];
  if (expose) {
    const existing = await chrome.tabs.query({ url: `*://www.immobilienscout24.de${expose}*` });
    if (existing.length > 0 && existing[0].id) {
      return { tabId: existing[0].id, opened: false };
    }
  }
  const tab = await chrome.tabs.create({ url, active: false });
  await waitForTabLoad(tab.id!, C.TAB_LOAD_TIMEOUT);
  return { tabId: tab.id!, opened: true };
}

export interface SaveSnapshotResult {
  success: boolean;
  imageCount?: number;
  failedImageCount?: number;
  evictedIds?: string[];
  error?: string;
}

/** Save snapshot by opening/reusing the listing tab and asking content to extract. */
export async function saveSnapshotById(listingId: string, url: string): Promise<SaveSnapshotResult> {
  let tabId: number | null = null;
  let opened = false;
  try {
    const tab = await getOrOpenListingTab(url);
    tabId = tab.tabId;
    opened = tab.opened;

    const ready = await waitForContentScript(tabId);
    if (!ready) return { success: false, error: 'Content script not ready' };

    const payload: any = await chrome.tabs.sendMessage(tabId, { action: 'extractForArchive' });
    if (!payload || !payload.listingId) {
      return { success: false, error: 'Could not extract listing on the page' };
    }

    return await ingestSnapshot({
      listingId: payload.listingId || listingId,
      url: payload.url || url,
      details: payload.details as ListingDetails,
      landlord: payload.landlord as LandlordInfo,
      imageUrls: (payload.imageUrls as string[]) || [],
    });
  } catch (e: any) {
    error('[Snapshots] saveSnapshotById failed:', e);
    return { success: false, error: e?.message || 'Save failed' };
  } finally {
    if (tabId != null && opened) {
      void safeCloseTab(tabId);
    }
  }
}

/** Common save path: fetch images, write to IDB, update meta index. */
export async function ingestSnapshot(args: {
  listingId: string;
  url: string;
  details: ListingDetails;
  landlord: LandlordInfo;
  imageUrls: string[];
}): Promise<SaveSnapshotResult> {
  const { listingId, url, details, landlord, imageUrls } = args;
  const savedAt = Date.now();
  log(`[Snapshots] Saving ${listingId}: ${imageUrls.length} images`);

  const fetchResults = await fetchListingImages(imageUrls);
  const { images, failedUrls } = splitFetchResults(imageUrls, fetchResults);

  if (images.length === 0 && imageUrls.length > 0) {
    warn(`[Snapshots] All ${imageUrls.length} images failed to fetch for ${listingId}`);
  }

  await Promise.all([putImages(listingId, images), putFullText(listingId, details, landlord)]);

  const meta: SavedSnapshotMeta = {
    listingId,
    url,
    title: String((details as any).title || ''),
    address: String((details as any).address || ''),
    landlordName: landlord?.name || '',
    savedAt,
    imageCount: images.length,
    failedImageUrls: failedUrls.length ? failedUrls : undefined,
  };

  const current = await readIndex();
  current[listingId] = meta;
  const { index: trimmed, evictedIds } = evictIfOverCap(current);
  for (const id of evictedIds) {
    try {
      await idbDeleteListing(id);
    } catch (e: any) {
      warn(`[Snapshots] IDB eviction cleanup failed for ${id}: ${e?.message}`);
    }
  }
  await writeIndex(trimmed);

  return {
    success: true,
    imageCount: images.length,
    failedImageCount: failedUrls.length,
    evictedIds: evictedIds.length ? evictedIds : undefined,
  };
}

export async function deleteSnapshot(listingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const index = await readIndex();
    if (index[listingId]) {
      delete index[listingId];
      await writeIndex(index);
    }
    await idbDeleteListing(listingId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Delete failed' };
  }
}

export async function exportSavedSnapshot(
  listingId: string,
  format: ExportFormat,
): Promise<{ success: true; method: 'download' | 'print-tab'; filename?: string } | { success: false; error: string }> {
  const index = await readIndex();
  const meta = index[listingId];
  if (!meta) return { success: false, error: 'Snapshot not found' };

  const text = await getFullText(listingId);
  if (!text) return { success: false, error: 'Snapshot text data missing' };

  const images = await getImages(listingId);
  return runExport({
    listingId,
    sourceUrl: meta.url,
    details: text.details,
    landlord: text.landlord,
    images,
    savedAt: meta.savedAt,
    format,
    pdfSource: 'snapshot',
  });
}

export async function getSnapshotsIndex(): Promise<Record<string, SavedSnapshotMeta>> {
  return readIndex();
}
