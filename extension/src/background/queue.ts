import * as C from '../shared/constants';
import { debug, error, log } from '../shared/logger';
import { capSeenListings } from '../shared/utils';
import { humanDelay } from './helpers';
import { type Listing, sendActivityLog } from './listings';
import { handleNewListing } from './messaging';
import { shouldNotify } from './notifications';
import { getPendingApprovalListings } from './pending-approval';
import { checkRateLimit } from './rate-limit';
import { checkListingAlreadyContacted } from './sync';
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
  const pendingApproval = await getPendingApprovalListings();
  const pendingSet = new Set(pendingApproval.map((p) => String(p.id).toLowerCase().trim()));

  const addedAt = Date.now();
  const newItems: QueueItem[] = [];

  for (const [id, listing] of dedupMap) {
    if (!seenSet.has(id) && !queueSet.has(id) && !blacklistSet.has(id) && !pendingSet.has(id)) {
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

  // Load seen and blacklist sets once before the loop, kept in sync via storage listener
  const preloadStored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY, C.BLACKLIST_KEY]);
  const seenList: string[] = preloadStored[C.STORAGE_KEY] || [];
  const seenSet = new Set(seenList.map((id: string) => String(id).toLowerCase().trim()));
  const blacklistSet = new Set(
    (preloadStored[C.BLACKLIST_KEY] || []).map((id: string) => String(id).toLowerCase().trim()),
  );

  // Keep blacklist in sync if updated mid-run (e.g. user blacklists via popup)
  const storageListener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (changes[C.BLACKLIST_KEY]) {
      const updated: string[] = changes[C.BLACKLIST_KEY].newValue || [];
      blacklistSet.clear();
      for (const id of updated) blacklistSet.add(String(id).toLowerCase().trim());
    }
  };
  chrome.storage.local.onChanged.addListener(storageListener);

  try {
    while (!queueAbortRequested) {
      if (!isMonitoring && !userTriggeredProcessing) break;

      // Read queue at the start of each iteration to pick up newly-enqueued items
      const stored: Record<string, any> = await chrome.storage.local.get([C.QUEUE_KEY]);
      const queue: QueueItem[] = stored[C.QUEUE_KEY] || [];

      if (queue.length === 0) {
        log('[Queue] Queue empty — processing complete');
        await sendActivityLog({ message: 'Queue empty — processing complete' });
        break;
      }

      const item = queue[0];
      const normalizedId = String(item.id).toLowerCase().trim();

      // Helper: re-read queue from storage, remove processed item by ID, write back.
      // This preserves any items added by enqueueListings during handleNewListing.
      const removeFromQueue = async (id: string) => {
        const fresh: Record<string, any> = await chrome.storage.local.get([C.QUEUE_KEY]);
        const currentQueue: QueueItem[] = fresh[C.QUEUE_KEY] || [];
        return currentQueue.filter((q) => String(q.id).toLowerCase().trim() !== id);
      };

      // Helper: re-read queue, remove processed item, append replacement(s), write back.
      const replaceInQueue = async (id: string, ...append: QueueItem[]) => {
        const filtered = await removeFromQueue(id);
        await chrome.storage.local.set({ [C.QUEUE_KEY]: [...filtered, ...append] });
        return filtered.length + append.length;
      };

      // Skip if already in seen list or blacklisted (using in-memory sets)
      if (seenSet.has(normalizedId)) {
        log(`[Queue] ${normalizedId} already seen — removing from queue`);
        const updated = await removeFromQueue(normalizedId);
        await chrome.storage.local.set({ [C.QUEUE_KEY]: updated });
        await sendActivityLog({ message: `Skipped ${item.title || normalizedId} (already contacted)` });
        queueSkippedCount++;
        continue;
      }
      if (blacklistSet.has(normalizedId)) {
        log(`[Queue] ${normalizedId} is blacklisted — removing from queue`);
        const updated = await removeFromQueue(normalizedId);
        await chrome.storage.local.set({ [C.QUEUE_KEY]: updated });
        await sendActivityLog({ message: `Skipped ${item.title || normalizedId} (blacklisted)` });
        queueSkippedCount++;
        continue;
      }

      // Skip if max retries exceeded
      if (item.retries >= C.QUEUE_MAX_RETRIES) {
        log(`[Queue] ${normalizedId} exceeded max retries (${item.retries}) — dropping`);
        const updated = await removeFromQueue(normalizedId);
        await chrome.storage.local.set({ [C.QUEUE_KEY]: updated });
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

      // Mark a listing as seen and remove it from the queue
      const markSeenAndDequeue = async (id: string): Promise<void> => {
        if (!seenSet.has(id)) {
          const freshSeen: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
          const freshList: string[] = freshSeen[C.STORAGE_KEY] || [];
          const updatedSeen = capSeenListings([...freshList, id]);
          const updatedQueue = await removeFromQueue(id);
          await chrome.storage.local.set({ [C.STORAGE_KEY]: updatedSeen, [C.QUEUE_KEY]: updatedQueue });
          seenSet.add(id);
        } else {
          const updatedQueue = await removeFromQueue(id);
          await chrome.storage.local.set({ [C.QUEUE_KEY]: updatedQueue });
        }
      };

      // Safety net: before retrying, check ImmoScout API to see if message was already sent
      if (item.retries > 0) {
        const alreadySent = await checkListingAlreadyContacted(normalizedId);
        if (alreadySent) {
          log(`[Queue] API confirms ${normalizedId} already contacted — skipping retry`);
          await markSeenAndDequeue(normalizedId);
          await sendActivityLog({
            message: `Skipped retry for ${item.title || normalizedId} (already contacted — verified via API)`,
          });
          queueSkippedCount++;
          continue;
        }
      }

      // Process the listing
      try {
        const result = await handleNewListing(item);

        if (result?.pendingApproval) {
          // Pending approval: remove from queue but do NOT mark as seen or log as sent.
          // The listing is now in the pending-approval list awaiting user action.
          const updated = await removeFromQueue(normalizedId);
          await chrome.storage.local.set({ [C.QUEUE_KEY]: updated });
          log(`[Queue] ${normalizedId} moved to pending approval — ${updated.length} remaining`);
        } else if (result?.success) {
          await markSeenAndDequeue(normalizedId);

          if (result.skipped) {
            queueSkippedCount++;
          } else {
            queueSentCount++;
          }
          log(`[Queue] Processed ${normalizedId}`);
          await sendActivityLog({
            lastResult: result.skipped ? 'skipped' : 'success',
            lastId: item.id,
            lastTitle: item.title || '',
          });
        } else if (result?.error === 'duplicate-landlord-deferred') {
          // Deferred due to duplicate landlord — move to end without incrementing retries
          await replaceInQueue(normalizedId, item);
          log(`[Queue] ${normalizedId} deferred (duplicate landlord) — moved to end without retry increment`);
        } else {
          // Failure: increment retries, move to end
          const updatedItem = { ...item, retries: (item.retries || 0) + 1 };
          await replaceInQueue(normalizedId, updatedItem);
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
        await replaceInQueue(normalizedId, updatedItem);
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
    chrome.storage.local.onChanged.removeListener(storageListener);
    setIsProcessingQueue(false);
    setQueueAbortRequested(false);
    setUserTriggeredProcessing(false);
    await chrome.storage.local.set({ [C.QUEUE_PROCESSING_KEY]: false });
    log('[Queue] Processing loop exited');

    // Desktop notification with processing summary
    const totalProcessed = queueSentCount + queueFailedCount + queueSkippedCount;
    if (totalProcessed > 0 && (await shouldNotify('queueComplete'))) {
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
