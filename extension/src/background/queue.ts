import * as C from '../shared/constants';
import { debug, error, log } from '../shared/logger';
import { capSeenListings } from '../shared/utils';
import { humanDelay } from './helpers';
import { type Listing, sendActivityLog } from './listings';
import { handleNewListing } from './messaging';
import { checkRateLimit } from './rate-limit';
import {
  isMonitoring,
  isProcessingQueue,
  queueAbortRequested,
  setIsProcessingQueue,
  setQueueAbortRequested,
  setUserTriggeredProcessing,
  userTriggeredProcessing,
} from './state';

export interface QueueItem {
  id: string;
  url: string;
  title: string;
  source: string;
  addedAt: number;
  retries: number;
}

// Enqueue listings into the shared queue (used by both auto-discovery and manual capture)
export async function enqueueListings(listings: Listing[], source: string): Promise<number> {
  if (!listings || listings.length === 0) return 0;

  // Deduplicate input by ID
  const dedupMap = new Map<string, Listing>();
  for (const listing of listings) {
    const id = String(listing.id || '')
      .toLowerCase()
      .trim();
    if (id && listing.url && !dedupMap.has(id)) {
      dedupMap.set(id, listing);
    }
  }

  const stored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY, C.QUEUE_KEY, C.BLACKLIST_KEY]);

  const seenSet = new Set((stored[C.STORAGE_KEY] || []).map((id: string) => String(id).toLowerCase().trim()));
  const queueSet = new Set((stored[C.QUEUE_KEY] || []).map((item: QueueItem) => String(item.id).toLowerCase().trim()));
  const blacklistSet = new Set((stored[C.BLACKLIST_KEY] || []).map((id: string) => String(id).toLowerCase().trim()));

  const addedAt = Date.now();
  const newItems: QueueItem[] = [];

  for (const [id, listing] of dedupMap) {
    if (!seenSet.has(id) && !queueSet.has(id) && !blacklistSet.has(id)) {
      newItems.push({
        id,
        url: listing.url,
        title: listing.title || '',
        source,
        addedAt,
        retries: 0,
      });
    }
  }

  if (newItems.length === 0) {
    log(`[Queue] No new items to enqueue (${dedupMap.size} input, all seen or already queued)`);
    return 0;
  }

  const updatedQueue = [...(stored[C.QUEUE_KEY] || []), ...newItems];
  await chrome.storage.local.set({ [C.QUEUE_KEY]: updatedQueue });

  log(
    `[Queue] Enqueued ${newItems.length} ${source} items (${dedupMap.size - newItems.length} filtered as seen/duplicate)`,
  );
  await sendActivityLog({
    message: `Enqueued ${newItems.length} ${source} listing${newItems.length !== 1 ? 's' : ''} (${updatedQueue.length} total in queue)`,
  });

  return newItems.length;
}

// Unified queue processor — drains the shared queue (FIFO)
export async function processQueue(): Promise<void> {
  if (isProcessingQueue) {
    log('[Queue] Already processing — skipping');
    return;
  }

  // Guard: only process when monitoring or user triggered
  if (!isMonitoring && !userTriggeredProcessing) {
    log('[Queue] Not monitoring and no user trigger — skipping');
    return;
  }

  setIsProcessingQueue(true);
  setQueueAbortRequested(false);
  await chrome.storage.local.set({ [C.QUEUE_PROCESSING_KEY]: true });

  log('[Queue] Starting unified queue processing');

  let queueSentCount = 0;
  let queueFailedCount = 0;
  let queueSkippedCount = 0;

  try {
    while (!queueAbortRequested) {
      if (!isMonitoring && !userTriggeredProcessing) break;

      const stored: Record<string, any> = await chrome.storage.local.get([C.QUEUE_KEY]);
      const queue: QueueItem[] = stored[C.QUEUE_KEY] || [];

      if (queue.length === 0) {
        log('[Queue] Queue empty — processing complete');
        await sendActivityLog({ message: 'Queue empty — processing complete' });
        break;
      }

      const item = queue[0];
      const remaining = queue.slice(1);
      const normalizedId = String(item.id).toLowerCase().trim();

      // Skip if already in seen list or blacklisted
      const seenStored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY, C.BLACKLIST_KEY]);
      const seenSet = new Set((seenStored[C.STORAGE_KEY] || []).map((id: string) => String(id).toLowerCase().trim()));
      const blacklistSet = new Set(
        (seenStored[C.BLACKLIST_KEY] || []).map((id: string) => String(id).toLowerCase().trim()),
      );
      if (seenSet.has(normalizedId)) {
        log(`[Queue] ${normalizedId} already seen — removing from queue`);
        await chrome.storage.local.set({ [C.QUEUE_KEY]: remaining });
        await sendActivityLog({ message: `Skipped ${item.title || normalizedId} (already contacted)` });
        queueSkippedCount++;
        continue;
      }
      if (blacklistSet.has(normalizedId)) {
        log(`[Queue] ${normalizedId} is blacklisted — removing from queue`);
        await chrome.storage.local.set({ [C.QUEUE_KEY]: remaining });
        await sendActivityLog({ message: `Skipped ${item.title || normalizedId} (blacklisted)` });
        queueSkippedCount++;
        continue;
      }

      // Skip if max retries exceeded
      if (item.retries >= C.QUEUE_MAX_RETRIES) {
        log(`[Queue] ${normalizedId} exceeded max retries (${item.retries}) — dropping`);
        await chrome.storage.local.set({ [C.QUEUE_KEY]: remaining });
        await sendActivityLog({
          message: `Dropped ${item.title || normalizedId} (failed ${item.retries}x)`,
          type: 'wait',
        });
        queueSkippedCount++;
        continue;
      }

      await sendActivityLog({ current: { id: normalizedId, title: item.title || 'untitled', url: item.url } });

      // Check rate limit
      const rateLimitCheck = await checkRateLimit();
      if (!rateLimitCheck.allowed) {
        const waitSec = Math.round(rateLimitCheck.waitTime! / 1000);
        log(`[Queue] Rate limit — waiting ${waitSec}s`);
        await sendActivityLog({ message: `Rate limit — waiting ${waitSec}s...`, type: 'wait' });
        await new Promise((resolve) => setTimeout(resolve, rateLimitCheck.waitTime!));
        if (queueAbortRequested) break;
        const recheck = await checkRateLimit();
        if (!recheck.allowed) {
          log('[Queue] Rate limit still exceeded — pausing');
          break;
        }
      }

      // Process the listing
      try {
        const result = await handleNewListing(item);

        if (result?.success) {
          // Success: remove from queue, mark as seen
          const freshSeen: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
          const freshList: string[] = freshSeen[C.STORAGE_KEY] || [];
          const freshSet = new Set(freshList.map((id: string) => String(id).toLowerCase().trim()));

          if (!freshSet.has(normalizedId)) {
            const updatedSeen = capSeenListings([...freshList, normalizedId]);
            await chrome.storage.local.set({ [C.STORAGE_KEY]: updatedSeen, [C.QUEUE_KEY]: remaining });
          } else {
            await chrome.storage.local.set({ [C.QUEUE_KEY]: remaining });
          }

          if (result.skipped) {
            queueSkippedCount++;
          } else {
            queueSentCount++;
          }
          log(`[Queue] Processed ${normalizedId} — ${remaining.length} remaining`);
          await sendActivityLog({
            lastResult: result.skipped ? 'skipped' : 'success',
            lastId: item.id,
            lastTitle: item.title || '',
          });
        } else if (result?.error === 'duplicate-landlord-deferred') {
          // Deferred due to duplicate landlord — move to end without incrementing retries
          await chrome.storage.local.set({ [C.QUEUE_KEY]: [...remaining, item] });
          log(`[Queue] ${normalizedId} deferred (duplicate landlord) — moved to end without retry increment`);
        } else {
          // Failure: increment retries, move to end
          const updatedItem = { ...item, retries: (item.retries || 0) + 1 };
          await chrome.storage.local.set({ [C.QUEUE_KEY]: [...remaining, updatedItem] });
          log(`[Queue] ${normalizedId} failed (attempt ${updatedItem.retries}/${C.QUEUE_MAX_RETRIES}) — moved to end`);
          queueFailedCount++;
          await sendActivityLog({
            lastResult: 'failed',
            lastId: item.id,
            lastTitle: item.title || '',
            error: result?.error,
          });
        }
      } catch (err: any) {
        error('[Queue] Error processing listing:', err);
        queueFailedCount++;
        const updatedItem = { ...item, retries: (item.retries || 0) + 1 };
        await chrome.storage.local.set({ [C.QUEUE_KEY]: [...remaining, updatedItem] });
        await sendActivityLog({
          lastResult: 'failed',
          lastId: item.id,
          lastTitle: item.title || '',
          error: err.message,
        });
      }

      // Human delay between listings
      const delay = humanDelay(2000, 1000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  } finally {
    setIsProcessingQueue(false);
    setQueueAbortRequested(false);
    setUserTriggeredProcessing(false);
    await chrome.storage.local.set({ [C.QUEUE_PROCESSING_KEY]: false });
    log('[Queue] Processing loop exited');

    // Desktop notification with processing summary
    const totalProcessed = queueSentCount + queueFailedCount + queueSkippedCount;
    if (totalProcessed > 0) {
      const parts: string[] = [];
      if (queueSentCount > 0) parts.push(`${queueSentCount} sent`);
      if (queueFailedCount > 0) parts.push(`${queueFailedCount} failed`);
      if (queueSkippedCount > 0) parts.push(`${queueSkippedCount} skipped`);
      chrome.notifications.create(`queue-done-${Date.now()}`, {
        type: 'basic',
        iconUrl: C.ICON_PATH,
        title: 'Queue Processing Complete',
        message: parts.join(', '),
      });
    }

    try {
      await chrome.runtime.sendMessage({ action: 'queueDone' });
    } catch (_e) {
      debug('[Queue] Could not notify popup of queue completion (likely closed)');
    }
  }
}
