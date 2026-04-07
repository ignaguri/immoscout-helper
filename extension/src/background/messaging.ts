// Listing processing orchestrator.
// Chains phases from ./phases.ts with duplicate detection from ./duplicates.ts.

import { getAIConfig } from '../shared/ai-router';
import * as C from '../shared/constants';
import { debug, error, log } from '../shared/logger';
import { checkDuplicateLandlord } from './duplicates';
import { safeCloseTab } from './helpers';
import type { Listing } from './listings';
import { loadNotificationPrefs, shouldNotifyWith } from './notifications';
import {
  AbortError,
  ComposeError,
  composeMessage,
  detectListingTypeAndRoute,
  extractLandlordInfo,
  type HandleListingResult,
  openListingTab,
  recordOutcome,
  SkipError,
  sendAndRetry,
  TabError,
} from './phases';
import type { QueueItem } from './queue';

// Re-export for consumers (queue.ts, message-handler.ts)
export type { HandleListingResult } from './phases';

export async function handleNewListing(listing: Listing | QueueItem): Promise<HandleListingResult> {
  log('Processing new listing:', listing.url);

  const notifPrefs = await loadNotificationPrefs();
  let tabId: number | undefined;

  try {
    // Phase 1: Open tab, wait for content script
    tabId = await openListingTab(listing);

    // Phase 2: Detect listing type and route
    const detectResult = await detectListingTypeAndRoute(tabId, listing);
    if (detectResult.type === 'pendingApproval') {
      await safeCloseTab(tabId);
      return { success: true, pendingApproval: true, listing };
    }
    if (detectResult.type === 'skipped') {
      await safeCloseTab(tabId);
      return { success: true, listing, skipped: true };
    }
    if (detectResult.type === 'comingSoon') {
      await safeCloseTab(tabId);
      return { success: false, listing, error: 'coming-soon' };
    }

    // Phase 3: Extract landlord info
    const landlord = await extractLandlordInfo(tabId);

    // Phase 4: Check duplicate landlord
    const dupDecision = await checkDuplicateLandlord(landlord.landlordName, listing, notifPrefs);
    if (dupDecision === 'skip') {
      await safeCloseTab(tabId);
      return { success: true, skipped: true, listing };
    }
    if (dupDecision === 'defer') {
      await safeCloseTab(tabId);
      return { success: false, listing, error: 'duplicate-landlord-deferred' };
    }

    // Phase 5: Compose message (AI analysis + generation)
    const aiConfig = await getAIConfig();
    const composed = await composeMessage(
      tabId,
      aiConfig,
      listing,
      landlord.landlordTitle,
      landlord.landlordName,
      landlord.isPrivateLandlord,
      detectResult.isTenantNetwork,
      landlord.landlordDisplay,
    );

    // Phase 6: Send with retry (shortening + captcha)
    const sendResult = await sendAndRetry(tabId, composed.message, composed.formValues, composed.isAutoSend, aiConfig);

    // Phase 7: Record outcome
    return await recordOutcome({
      sendResult,
      listing,
      message: composed.message,
      aiResult: composed.aiResult,
      landlordDisplay: landlord.landlordDisplay,
      landlordName: landlord.landlordName,
      landlordTitle: landlord.landlordTitle,
      isAutoSend: composed.isAutoSend,
      isTenantNetwork: detectResult.isTenantNetwork,
      isPrivateLandlord: landlord.isPrivateLandlord,
      tabId,
      notifPrefs,
    });
  } catch (err: any) {
    if (err instanceof AbortError) {
      return { success: false, listing };
    }
    if (err instanceof TabError) {
      return { success: false, listing, error: err.message };
    }
    if (err instanceof SkipError) {
      if (shouldNotifyWith(notifPrefs, 'listingSkipped')) {
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: C.ICON_PATH,
            title: `Skipped (${err.aiResult.score}/10)`,
            message: `${err.aiResult.reason || listing.title || 'Low score'}`,
          });
        } catch (_e) {
          debug('[Messaging] Skip notification failed');
        }
      }
      if (tabId) await safeCloseTab(tabId);
      return { success: true, skipped: true, listing };
    }
    if (err instanceof ComposeError) {
      if (tabId) await safeCloseTab(tabId);
      return { success: false, listing, error: err.message };
    }
    // Unexpected error
    error('Error sending message:', err);
    if (tabId) await safeCloseTab(tabId);
    return { success: false, listing, error: err.message };
  }
}
