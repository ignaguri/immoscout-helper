// Duplicate landlord detection and decision flow.
// Handles prompting, notification, alarm timeout, and decision recording.

import * as C from '../shared/constants';
import { log } from '../shared/logger';
import { logActivity } from './activity';
import type { Listing } from './listings';
import { sendActivityLog } from './listings';
import { type NotificationPrefs, shouldNotifyWith } from './notifications';
import type { QueueItem } from './queue';

// Track contacted landlords after a successful send
export async function recordContactedLandlord(landlordName: string): Promise<void> {
  const normalizedLandlord = landlordName.toLowerCase().trim();
  if (!normalizedLandlord) return;
  const stored: Record<string, any> = await chrome.storage.local.get([C.CONTACTED_LANDLORDS_KEY]);
  const landlords: string[] = stored[C.CONTACTED_LANDLORDS_KEY] || [];
  if (!landlords.includes(normalizedLandlord)) {
    landlords.push(normalizedLandlord);
    await chrome.storage.local.set({ [C.CONTACTED_LANDLORDS_KEY]: landlords });
  }
}

// Update activity log entry in storage to remove the pending marker after a decision
async function resolveDuplicateDecisionInLog(decisionId: string, outcome: string): Promise<void> {
  try {
    const stored = await chrome.storage.local.get([C.ACTIVITY_LOG_KEY]);
    const actLog: any[] = stored[C.ACTIVITY_LOG_KEY] || [];
    const updated = actLog.map((entry) => {
      if (entry.duplicateDecisionId === decisionId) {
        const outcomeLabel =
          outcome === 'send'
            ? 'User chose: Send Anyway'
            : outcome === 'skip'
              ? 'User chose: Skip'
              : 'No response — deferred to end of queue';
        return {
          ...entry,
          duplicateDecisionId: undefined,
          message: `"${entry.duplicateLandlordName || 'Duplicate landlord'}": ${outcomeLabel}`,
        };
      }
      return entry;
    });
    await chrome.storage.local.set({ [C.ACTIVITY_LOG_KEY]: updated });
    try {
      await chrome.runtime.sendMessage({ action: 'duplicateDecisionResolved', decisionId, outcome });
    } catch (_e) {
      /* popup may be closed */
    }
  } catch (_e) {
    /* best effort */
  }
}

// Alarm name for duplicate landlord decision timeout (survives SW suspension)
const DUP_LANDLORD_ALARM = 'dup-landlord-timeout';

// Singleton resolver — set while a decision is pending so the alarm handler can resolve it
let pendingDecisionResolve: ((decision: 'send' | 'skip' | 'defer') => void) | null = null;

/** Called from index.ts alarm listener when the dup-landlord-timeout alarm fires. */
export function handleDuplicateLandlordAlarm(): void {
  if (pendingDecisionResolve) {
    pendingDecisionResolve('defer');
  }
}

// Prompt user about duplicate landlord via chrome.notifications + popup buttons.
// Returns 'send' | 'skip' | 'defer' (defer = alarm timeout, move to end of queue)
async function promptDuplicateLandlordDecision(
  landlordName: string,
  listing: Listing | QueueItem,
): Promise<'send' | 'skip' | 'defer'> {
  const decisionId = crypto.randomUUID();
  const notifId = `dup-landlord-${Date.now()}`;
  let resolved = false;

  // Declare listeners at function scope so removeListeners can reference them
  let popupListener: (request: any, sender: any, sendResponse: any) => boolean | undefined;
  let buttonListener: (clickedId: string, buttonIndex: number) => void;
  let clickListener: (clickedId: string) => void;

  // Synchronous listener cleanup — safe to call from any listener context
  const removeListeners = () => {
    chrome.notifications.onButtonClicked.removeListener(buttonListener);
    chrome.notifications.onClicked.removeListener(clickListener);
    chrome.runtime.onMessage.removeListener(popupListener);
    chrome.notifications.clear(notifId);
    chrome.alarms.clear(DUP_LANDLORD_ALARM);
    pendingDecisionResolve = null;
  };

  // Async post-resolution work — fire-and-forget with error protection
  const cleanupStorage = (outcome: string) => {
    chrome.storage.local.remove(C.PENDING_DUPLICATE_DECISION_KEY).catch(() => {});
    resolveDuplicateDecisionInLog(decisionId, outcome).catch(() => {});
  };

  // Do async setup before awaiting the decision promise
  await chrome.storage.local.set({
    [C.PENDING_DUPLICATE_DECISION_KEY]: {
      decisionId,
      landlordName,
      listingId: listing.id,
      listingTitle: listing.title || '',
      createdAt: Date.now(),
    },
  });

  await sendActivityLog({
    message: `Duplicate landlord detected: "${landlordName}" — waiting for user decision...`,
    type: 'wait',
    duplicateDecisionId: decisionId,
    duplicateLandlordName: landlordName,
  });

  // Await the user's decision (resolved by popup buttons, notification, or alarm timeout)
  const decision = await new Promise<'send' | 'skip' | 'defer'>((resolve) => {
    const settle = (outcome: 'send' | 'skip' | 'defer') => {
      if (resolved) return;
      resolved = true;
      removeListeners();
      cleanupStorage(outcome);
      resolve(outcome);
    };

    // Expose settle so the alarm handler in index.ts can trigger defer
    pendingDecisionResolve = settle;

    popupListener = (request: any, _sender: any, sendResponse: any) => {
      if (request.action === 'duplicateLandlordDecision' && request.decisionId === decisionId) {
        settle(request.decision);
        sendResponse({ success: true });
        return true;
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(popupListener);

    buttonListener = (clickedNotifId: string, buttonIndex: number) => {
      if (clickedNotifId !== notifId) return;
      settle(buttonIndex === 0 ? 'send' : 'skip');
    };

    clickListener = (clickedNotifId: string) => {
      if (clickedNotifId !== notifId) return;
      settle('send');
    };

    chrome.notifications.onButtonClicked.addListener(buttonListener);
    chrome.notifications.onClicked.addListener(clickListener);

    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: C.ICON_PATH,
      title: 'Duplicate Landlord Detected',
      message: `"${landlordName}" was already contacted. Click to send anyway, or wait to defer.\n${listing.title || listing.id}`,
      buttons: [{ title: 'Send Anyway' }, { title: 'Skip' }],
      requireInteraction: true,
    });

    // Use chrome.alarms for timeout — survives MV3 service worker suspension
    chrome.alarms.create(DUP_LANDLORD_ALARM, {
      delayInMinutes: C.DUPLICATE_LANDLORD_TIMEOUT_MS / 60000,
    });
  });

  return decision;
}

// ─── Check duplicate landlord (exported for use by orchestrator) ───

export type DuplicateDecision = 'send' | 'skip' | 'defer' | 'not-duplicate';

export async function checkDuplicateLandlord(
  landlordName: string | null,
  listing: Listing | QueueItem,
  notifPrefs: NotificationPrefs,
): Promise<DuplicateDecision> {
  if (!landlordName) return 'not-duplicate';

  const normalizedLandlord = landlordName.toLowerCase().trim();
  const landlordStored: Record<string, any> = await chrome.storage.local.get([C.CONTACTED_LANDLORDS_KEY]);
  const contactedLandlords: string[] = landlordStored[C.CONTACTED_LANDLORDS_KEY] || [];

  if (!contactedLandlords.includes(normalizedLandlord)) return 'not-duplicate';

  // If duplicate landlord notifications are disabled, skip silently (can't ask user)
  if (!shouldNotifyWith(notifPrefs, 'duplicateLandlord')) {
    log(`[Duplicate] Landlord "${landlordName}" already contacted — notifications disabled, skipping`);
    await sendActivityLog({ lastResult: 'skipped', lastId: listing.id, lastTitle: listing.title || '' });
    await logActivity({
      listingId: listing.id,
      title: listing.title,
      url: listing.url,
      action: 'skipped',
      reason: `Duplicate landlord: ${landlordName} (auto-skipped, notifications disabled)`,
      landlord: landlordName,
    });
    return 'skip';
  }

  log(`[Duplicate] Landlord "${landlordName}" already contacted — prompting user`);
  const decision = await promptDuplicateLandlordDecision(landlordName, listing);

  if (decision === 'skip') {
    log(`[Duplicate] User chose to skip "${landlordName}"`);
    await sendActivityLog({ lastResult: 'skipped', lastId: listing.id, lastTitle: listing.title || '' });
    await logActivity({
      listingId: listing.id,
      title: listing.title,
      url: listing.url,
      action: 'skipped',
      reason: `Duplicate landlord: ${landlordName}`,
      landlord: landlordName,
    });
    return 'skip';
  } else if (decision === 'defer') {
    log(`[Duplicate] No response for "${landlordName}" — deferring to end of queue`);
    await sendActivityLog({
      message: `No response — "${landlordName}" moved to end of queue`,
      type: 'wait',
    });
    return 'defer';
  }

  // decision === 'send' → continue normally
  log(`[Duplicate] User chose to send anyway to "${landlordName}"`);
  return 'send';
}
