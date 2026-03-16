// Pending approval storage for tenant-recommendation listings.
// These listings require explicit user confirmation before a message is sent.

import * as C from '../shared/constants';
import { capSeenListings } from '../shared/utils';
import type { PendingApprovalItem } from '../shared/types';

export async function getPendingApprovalListings(): Promise<PendingApprovalItem[]> {
  const result = await chrome.storage.local.get(C.PENDING_APPROVAL_KEY);
  return result[C.PENDING_APPROVAL_KEY] || [];
}

export async function addToPendingApproval(item: PendingApprovalItem): Promise<void> {
  const current = await getPendingApprovalListings();
  // Dedup by id
  if (current.some((p) => p.id === item.id)) return;
  await chrome.storage.local.set({ [C.PENDING_APPROVAL_KEY]: [...current, item] });
}

export async function removePendingApprovalById(id: string): Promise<void> {
  const current = await getPendingApprovalListings();
  await chrome.storage.local.set({
    [C.PENDING_APPROVAL_KEY]: current.filter((p) => p.id !== id),
  });
}

/** User approved — remove from pending. Caller is responsible for processing. */
export async function approvePendingListing(id: string): Promise<void> {
  await removePendingApprovalById(id);
}

/** User skipped — remove from pending and mark as seen so it won't resurface. */
export async function skipPendingListing(id: string): Promise<void> {
  await removePendingApprovalById(id);

  const normalizedId = String(id).toLowerCase().trim();
  const stored = await chrome.storage.local.get(C.STORAGE_KEY);
  const seenList: string[] = stored[C.STORAGE_KEY] || [];
  if (!seenList.map((s: string) => s.toLowerCase().trim()).includes(normalizedId)) {
    await chrome.storage.local.set({
      [C.STORAGE_KEY]: capSeenListings([...seenList, normalizedId]),
    });
  }
}
