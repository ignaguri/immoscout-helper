import { type AIConfig, canUseDirect, canUseServer, getAIConfig, getProvider, trackTokenUsage } from '../shared/ai-router';
import * as C from '../shared/constants';
import { debug, error, log, warn } from '../shared/logger';
import { buildShortenPrompt } from '../shared/prompts';
import type { ManualReviewData } from '../shared/types';
import { generatePersonalizedMessage } from '../shared/utils';
import { logActivity } from './activity';
import { type AIAnalysisResult, type FormValues, lastAIError, tryAIAnalysis, trySolveCaptcha } from './ai';
import { humanDelay, safeCloseTab, waitForTabLoad } from './helpers';
import { type Listing, sendActivityLog } from './listings';
import { loadNotificationPrefs, type NotificationPrefs, shouldNotifyWith } from './notifications';
import { addToPendingApproval } from './pending-approval';
import type { QueueItem } from './queue';
import {
  incrementMessageCount,
  isMonitoring,
  isProcessingQueue,
  lastMessageTime,
  messageCount,
  setLastMessageTime,
  userTriggeredProcessing,
} from './state';

export interface HandleListingResult {
  success: boolean;
  listing?: Listing | QueueItem;
  skipped?: boolean;
  pendingApproval?: boolean;
  error?: string;
}

// Track contacted landlords after a successful send
async function recordContactedLandlord(landlordName: string): Promise<void> {
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
  let popupListener: (request: any, sender: any, sendResponse: any) => boolean | void;
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

// ─── Phase 1: Open listing tab and wait for content script readiness ───

async function openListingTab(listing: Listing | QueueItem): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, humanDelay(500, 300)));
  const listingTab = await chrome.tabs.create({ url: listing.url, active: false });
  const tabId = listingTab.id!;

  await waitForTabLoad(tabId, 10000);

  if (!isMonitoring && !isProcessingQueue) {
    log('Monitoring/queue stopped, skipping message sending');
    await safeCloseTab(tabId);
    throw new AbortError('monitoring-stopped');
  }

  // Wait for content script to be ready
  let contentScriptReady = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      contentScriptReady = true;
      break;
    } catch (_error) {
      debug('[Messaging] Content script ping attempt failed, retrying...');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (!contentScriptReady) {
    error('Content script not ready after waiting');
    await safeCloseTab(tabId);
    throw new TabError('Content script not ready');
  }

  await new Promise((resolve) => setTimeout(resolve, humanDelay(1000, 500)));

  if (!isMonitoring && !isProcessingQueue) {
    log('Monitoring/queue stopped during processing, aborting');
    await safeCloseTab(tabId);
    throw new AbortError('monitoring-stopped');
  }

  return tabId;
}

// ─── Phase 2: Detect listing type and route ───

interface DetectResult {
  type: 'continue' | 'pendingApproval' | 'skipped';
  isTenantNetwork: boolean;
}

async function detectListingTypeAndRoute(
  tabId: number,
  listing: Listing | QueueItem,
): Promise<DetectResult> {
  try {
    const listingType: any = await chrome.tabs.sendMessage(tabId, { action: 'detectListingType' });
    const isTenantNetwork = listingType?.isTenantNetwork || false;

    // Tenant-recommendation: current tenant posted the listing with an "Interesse bekunden" CTA.
    // Checked top-level (independent of isTenantNetwork) to guard against React render race conditions
    // where tenant-network DOM markers haven't appeared yet but the CTA button has.
    // Skip this branch when user-triggered (i.e. the user just approved this listing from the popup).
    if (listingType?.hasTenantCTA && !userTriggeredProcessing) {
      log(`[PendingApproval] ${listing.id} is a tenant-recommendation listing — adding to pending approval`);
      await addToPendingApproval({
        id: listing.id,
        url: listing.url,
        title: (listing as any).title || '',
        addedAt: Date.now(),
      });
      await sendActivityLog({
        message: `Needs approval: ${listing.id} (tenant recommendation — requires user confirmation)`,
        type: 'wait',
      });
      return { type: 'pendingApproval', isTenantNetwork };
    }

    // Pure tenant-network with no contact form — skip silently
    if (isTenantNetwork && !listingType?.hasContactForm) {
      log(`[Skip] ${listing.id} is a tenant-network listing with no contact form — marking as seen`);
      await sendActivityLog({ message: `Skipped ${listing.id} (tenant-network, no contact form)`, type: 'wait' });
      return { type: 'skipped', isTenantNetwork };
    }

    return { type: 'continue', isTenantNetwork };
  } catch (_e) {
    debug('[Messaging] Listing type detection failed, proceeding with default');
    return { type: 'continue', isTenantNetwork: false };
  }
}

// ─── Phase 3: Extract landlord info ───

interface LandlordInfo {
  landlordTitle: string | null;
  landlordName: string | null;
  isPrivateLandlord: boolean;
  landlordDisplay: string;
}

async function extractLandlordInfo(tabId: number): Promise<LandlordInfo> {
  const nameResult: any = await chrome.tabs.sendMessage(tabId, { action: 'extractLandlordName' });
  const landlordTitle: string | null = nameResult?.title || null;
  const landlordName: string | null = nameResult?.name || null;
  const isPrivateLandlord: boolean = nameResult?.isPrivate || false;
  const landlordDisplay = landlordTitle && landlordName ? `${landlordTitle} ${landlordName}` : landlordName || 'Unknown';
  return { landlordTitle, landlordName, isPrivateLandlord, landlordDisplay };
}

// ─── Phase 4: Check duplicate landlord ───

type DuplicateDecision = 'send' | 'skip' | 'defer' | 'not-duplicate';

async function checkDuplicateLandlord(
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

// ─── Phase 5: Compose message (AI analysis + message generation) ───

interface ComposeResult {
  message: string;
  aiResult: AIAnalysisResult | null;
  formValues: FormValues;
  isAutoSend: boolean;
}

async function composeMessage(
  tabId: number,
  aiConfig: AIConfig,
  listing: Listing | QueueItem,
  landlordTitle: string | null,
  landlordName: string | null,
  isPrivateLandlord: boolean,
  isTenantNetwork: boolean,
  landlordDisplay: string,
): Promise<ComposeResult> {
  // Get message template and all form values
  const storageKeys = [
    C.MESSAGE_TEMPLATE_KEY,
    C.AUTO_SEND_MODE_KEY,
    C.FORM_ADULTS_KEY,
    C.FORM_CHILDREN_KEY,
    C.FORM_PETS_KEY,
    C.FORM_SMOKER_KEY,
    C.FORM_INCOME_KEY,
    C.FORM_HOUSEHOLD_SIZE_KEY,
    C.FORM_EMPLOYMENT_KEY,
    C.FORM_INCOME_RANGE_KEY,
    C.FORM_DOCUMENTS_KEY,
    C.FORM_SALUTATION_KEY,
    C.FORM_PHONE_KEY,
  ];
  const stored: Record<string, any> = await chrome.storage.local.get(storageKeys);

  const formValues: FormValues = {
    adults: stored[C.FORM_ADULTS_KEY] || 2,
    children: stored[C.FORM_CHILDREN_KEY] || 0,
    pets: stored[C.FORM_PETS_KEY] || 'Nein',
    smoker: stored[C.FORM_SMOKER_KEY] || 'Nein',
    income: stored[C.FORM_INCOME_KEY] || 2000,
    householdSize: stored[C.FORM_HOUSEHOLD_SIZE_KEY] || 'Einpersonenhaushalt',
    employmentType: stored[C.FORM_EMPLOYMENT_KEY] || 'Angestellte:r',
    incomeRange: stored[C.FORM_INCOME_RANGE_KEY] || '1.500 - 2.000',
    documents: stored[C.FORM_DOCUMENTS_KEY] || 'Vorhanden',
    salutation: stored[C.FORM_SALUTATION_KEY] || 'Frau',
    phone: stored[C.FORM_PHONE_KEY] || '',
  };

  const isAutoSend = stored[C.AUTO_SEND_MODE_KEY] !== 'manual';

  // AI analysis: score listing and optionally generate message
  const aiResult = await tryAIAnalysis(
    tabId,
    landlordTitle,
    landlordName,
    isPrivateLandlord,
    formValues,
    stored[C.MESSAGE_TEMPLATE_KEY] || '',
    isTenantNetwork,
  );

  // Log full AI analysis
  if (aiResult) {
    log(`[AI] ─── Analysis for ${listing.id} ───`);
    log(`[AI] Score: ${aiResult.score}/10 | Skip: ${aiResult.skip} | Landlord: ${landlordDisplay}`);
    if (aiResult.reason) log(`[AI] Reason: ${aiResult.reason}`);
    if (aiResult.summary) log(`[AI] Summary: ${aiResult.summary}`);
    if (aiResult.flags?.length) log(`[AI] Flags: ${aiResult.flags.join(', ')}`);
    log(`[AI] ─────────────────────────────────`);

    // Send AI analysis to popup progress area
    const lines = [`  AI Score: ${aiResult.score}/10 | ${aiResult.skip ? 'SKIP' : 'SEND'}`];
    if (aiResult.reason) lines.push(`  Reason: ${aiResult.reason}`);
    if (aiResult.summary) lines.push(`  Summary: ${aiResult.summary}`);
    if (aiResult.flags?.length) lines.push(`  Flags: ${aiResult.flags.join(', ')}`);
    const analysisMsg = lines.join('\n');
    await sendActivityLog({ message: analysisMsg, type: 'analysis' });
  }

  // If AI says skip, notify and throw
  if (aiResult?.skip) {
    log(`[AI] Skipping listing (score ${aiResult.score}/10): ${aiResult.reason}`);
    await sendActivityLog({ lastResult: 'skipped', lastId: listing.id, lastTitle: listing.title || '' });
    await logActivity({
      listingId: listing.id,
      title: listing.title,
      url: listing.url,
      score: aiResult.score,
      reason: aiResult.reason,
      action: 'skipped',
      landlord: landlordDisplay,
    });
    throw new SkipError(aiResult);
  }

  // Determine the message to send
  let personalizedMessage: string;
  if (aiResult?.message) {
    personalizedMessage = aiResult.message;
    log(`[AI] Using AI-generated message (score ${aiResult.score}/10)`);
  } else {
    // Check if AI is enabled — if so, failing is a hard error (never fall back to template)
    if (aiConfig.enabled) {
      const genericReason = aiResult
        ? 'AI message generation failed'
        : 'AI analysis failed (server unreachable or extraction error)';
      const failReason = lastAIError || genericReason;
      error(`[Messaging] ${failReason} — aborting send to prevent template fallback`);
      await sendActivityLog({
        lastResult: 'failed',
        lastId: listing.id,
        lastTitle: listing.title || '',
        error: failReason,
      });
      await logActivity({
        listingId: listing.id,
        title: listing.title,
        url: listing.url,
        score: aiResult?.score,
        action: 'failed',
        reason: failReason,
        landlord: landlordDisplay,
      });
      throw new ComposeError(failReason);
    }
    // AI not configured — use template
    warn('[Messaging] AI not configured — using template');
    personalizedMessage = generatePersonalizedMessage(
      stored[C.MESSAGE_TEMPLATE_KEY] || '',
      landlordTitle,
      landlordName,
      isTenantNetwork,
    );
  }

  return { message: personalizedMessage, aiResult, formValues, isAutoSend };
}

// ─── Phase 6: Send message with retry (shortening + captcha) ───

async function sendAndRetry(
  tabId: number,
  message: string,
  formValues: FormValues,
  isAutoSend: boolean,
  aiConfig: AIConfig,
): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, humanDelay(500, 300)));

  let sendResult: any = null;
  try {
    sendResult = await chrome.tabs.sendMessage(tabId, {
      action: 'sendMessage',
      message,
      formValues,
      autoSend: isAutoSend,
    });
  } catch (err: any) {
    error('Error sending message to content script:', err);
    throw err;
  }

  // Handle "message too long" error — ask AI to shorten, retry once
  if (sendResult && !sendResult.success && sendResult.messageTooLong) {
    const limit: number = sendResult.maxLength || 2000;
    warn(`[Message] Too long for form (${message.length} chars, limit: ${limit}) — asking AI to shorten`);
    try {
      let shortened: string | null = null;
      let shortenUsage = { promptTokens: 0, completionTokens: 0 };

      if (canUseDirect(aiConfig) && aiConfig.apiKey) {
        const systemPrompt = buildShortenPrompt(limit);
        const provider = getProvider(aiConfig);
        const result = await provider.generateText(
          aiConfig.apiKey,
          systemPrompt,
          `Kürze diese Nachricht auf maximal ${limit} Zeichen:\n\n${message}`,
          { maxTokens: 4096 },
        );
        shortened = result.text.trim();
        shortenUsage = result.usage;
      } else if (canUseServer(aiConfig)) {
        const shortenResponse = await fetch(`${aiConfig.serverUrl}/shorten`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            maxLength: limit,
            apiKey: aiConfig.apiKey,
            provider: aiConfig.provider,
          }),
        });
        if (shortenResponse.ok) {
          const shortenResult: any = await shortenResponse.json();
          shortened = shortenResult.message;
          if (shortenResult.usage) {
            shortenUsage = {
              promptTokens: shortenResult.usage.promptTokens || 0,
              completionTokens: shortenResult.usage.completionTokens || 0,
            };
          }
        } else {
          error(`[Message] Shorten API returned ${shortenResponse.status}`);
        }
      }

      if (shortenUsage.promptTokens || shortenUsage.completionTokens) {
        await trackTokenUsage(shortenUsage.promptTokens, shortenUsage.completionTokens);
      }

      if (shortened && shortened.length <= limit) {
        log(`[Message] AI shortened from ${message.length} to ${shortened.length} chars — retrying`);
        sendResult = await chrome.tabs.sendMessage(tabId, {
          action: 'sendMessage',
          message: shortened,
          formValues,
          autoSend: isAutoSend,
        });
      } else {
        warn(`[Message] AI shorten returned ${shortened?.length} chars (limit ${limit}) — hard truncating`);
        sendResult = await chrome.tabs.sendMessage(tabId, {
          action: 'sendMessage',
          message: (shortened || message).substring(0, limit),
          formValues,
          autoSend: isAutoSend,
        });
      }
    } catch (e: any) {
      error('[Message] Error shortening message:', e.message);
    }
  }

  // Check for captcha after form submission
  if (sendResult && !sendResult.success && sendResult.error) {
    await sendActivityLog({ message: 'Captcha detected, solving...', type: 'wait' });
    if (aiConfig.enabled) {
      const captchaResult = await trySolveCaptcha(tabId, aiConfig.serverUrl, aiConfig.apiKey);
      log('[Captcha] Result:', JSON.stringify(captchaResult));
      if (captchaResult && typeof captchaResult !== 'boolean' && captchaResult.messageSent) {
        log('[Captcha] Message confirmed sent after captcha resolution');
        sendResult = { success: true, messageSent: message };
      } else if (captchaResult && typeof captchaResult !== 'boolean' && captchaResult.solved) {
        log('[Captcha] Captcha solved, retrying message send...');
        try {
          sendResult = await chrome.tabs.sendMessage(tabId, {
            action: 'sendMessage',
            message,
            formValues,
            autoSend: isAutoSend,
          });
        } catch (e: any) {
          error('Error retrying after captcha:', e.message);
        }
      } else {
        warn('[Captcha] Captcha was NOT solved — message not sent');
      }
    }
  }

  return sendResult;
}

// ─── Phase 7: Record outcome (logging, rate limits, notifications, tab cleanup) ───

interface RecordOutcomeParams {
  sendResult: any;
  listing: Listing | QueueItem;
  message: string;
  aiResult: AIAnalysisResult | null;
  landlordDisplay: string;
  landlordName: string | null;
  landlordTitle: string | null;
  isAutoSend: boolean;
  isTenantNetwork: boolean;
  isPrivateLandlord: boolean;
  tabId: number;
  notifPrefs: NotificationPrefs;
}

async function recordOutcome(params: RecordOutcomeParams): Promise<HandleListingResult> {
  const {
    sendResult,
    listing,
    message,
    aiResult,
    landlordDisplay,
    landlordName,
    landlordTitle,
    isAutoSend,
    isTenantNetwork,
    isPrivateLandlord,
    tabId,
    notifPrefs,
  } = params;

  if (!sendResult || !sendResult.success) {
    const errorMsg = sendResult?.error || 'Unknown error';
    error(`Failed to send message to ${landlordDisplay}: ${errorMsg}`);
    await sendActivityLog({
      lastResult: 'failed',
      lastId: listing.id,
      lastTitle: listing.title || '',
      error: errorMsg,
    });
    await logActivity({
      listingId: listing.id,
      title: listing.title,
      url: listing.url,
      score: aiResult?.score,
      reason: errorMsg,
      action: 'failed',
      landlord: landlordDisplay,
    });
  } else {
    await sendActivityLog({ lastResult: 'success', lastId: listing.id, lastTitle: listing.title || '' });
    if (isAutoSend) {
      log(`Message sent successfully to ${landlordDisplay}`);
    } else {
      log(`Form filled for ${landlordDisplay} - waiting for manual send`);
    }

    await logActivity({
      listingId: listing.id,
      title: listing.title,
      url: listing.url,
      score: aiResult?.score,
      reason: aiResult?.reason,
      action: isAutoSend ? 'sent' : 'filled',
      landlord: landlordDisplay,
    });

    // Track landlord and increment rate limit counter
    if (landlordName) {
      await recordContactedLandlord(landlordName);
    }
    incrementMessageCount();
    setLastMessageTime(Date.now());
    const totalStored: Record<string, any> = await chrome.storage.local.get([C.TOTAL_MESSAGES_SENT_KEY]);
    await chrome.storage.local.set({
      [C.TOTAL_MESSAGES_SENT_KEY]: (totalStored[C.TOTAL_MESSAGES_SENT_KEY] || 0) + (isAutoSend ? 1 : 0),
      [C.RATE_MESSAGE_COUNT_KEY]: messageCount,
      [C.RATE_LAST_MESSAGE_TIME_KEY]: lastMessageTime,
    });
    log(
      `[Rate] ${messageCount}/${await chrome.storage.local.get([C.RATE_LIMIT_KEY]).then((s: Record<string, any>) => s[C.RATE_LIMIT_KEY] || 10)} messages this hour`,
    );

    // Send browser notification
    if (isAutoSend) {
      if (shouldNotifyWith(notifPrefs, 'messageSent')) {
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: C.ICON_PATH,
            title: 'Message Sent',
            message: `Sent to ${landlordDisplay}: ${listing.title || 'New Listing'}${aiResult ? ` (Score: ${aiResult.score}/10)` : ''}`,
          });
        } catch (e) {
          error('Notification error:', e);
        }
      }
    } else {
      // Manual mode: store review data for popup refine feature
      const reviewData: ManualReviewData = {
        message,
        listingId: listing.id,
        listingUrl: listing.url,
        listingTitle: listing.title || '',
        landlordName: landlordName || '',
        landlordTitle: landlordTitle || '',
        isTenantNetwork,
        isPrivateLandlord,
        tabId,
        aiScore: aiResult?.score,
        aiReason: aiResult?.reason,
        timestamp: Date.now(),
      };
      // Persistent notification with click-to-focus
      if (shouldNotifyWith(notifPrefs, 'manualReview')) {
        const notifId = `manual-review-${listing.id || Date.now()}`;
        reviewData.notificationId = notifId;
        try {
          chrome.notifications.create(notifId, {
            type: 'basic',
            iconUrl: C.ICON_PATH,
            title: 'Nachricht bereit zur Überprüfung',
            message: `${landlordDisplay}: ${listing.title || 'New Listing'}${aiResult ? ` (Score: ${aiResult.score}/10)` : ''}`,
            requireInteraction: true,
          });
        } catch (e) {
          error('Notification error:', e);
        }
      }
      await chrome.storage.local.set({ [C.PENDING_MANUAL_REVIEW_KEY]: reviewData });
    }
  }

  // Tab cleanup
  if (isAutoSend) {
    await new Promise((resolve) => setTimeout(resolve, humanDelay(2000, 1000)));
    await safeCloseTab(tabId);
    log('Closed listing tab');
  } else {
    try {
      await chrome.tabs.update(tabId, { active: true });
      const tabInfo = await chrome.tabs.get(tabId);
      await chrome.windows.update(tabInfo.windowId, { focused: true });
    } catch (_e) {
      debug('[Messaging] Tab focus failed for manual review');
    }
  }

  return { success: sendResult?.success, listing };
}

// ─── Sentinel error types for flow control ───

class AbortError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AbortError';
  }
}

class TabError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'TabError';
  }
}

class SkipError extends Error {
  aiResult: AIAnalysisResult;
  constructor(aiResult: AIAnalysisResult) {
    super(`AI skip (score ${aiResult.score}/10)`);
    this.name = 'SkipError';
    this.aiResult = aiResult;
  }
}

class ComposeError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ComposeError';
  }
}

// ─── Orchestrator ───

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
      tabId, aiConfig, listing,
      landlord.landlordTitle, landlord.landlordName, landlord.isPrivateLandlord,
      detectResult.isTenantNetwork, landlord.landlordDisplay,
    );

    // Phase 6: Send with retry (shortening + captcha)
    const sendResult = await sendAndRetry(
      tabId, composed.message, composed.formValues, composed.isAutoSend, aiConfig,
    );

    // Phase 7: Record outcome
    return await recordOutcome({
      sendResult, listing, message: composed.message,
      aiResult: composed.aiResult, landlordDisplay: landlord.landlordDisplay,
      landlordName: landlord.landlordName, landlordTitle: landlord.landlordTitle,
      isAutoSend: composed.isAutoSend, isTenantNetwork: detectResult.isTenantNetwork,
      isPrivateLandlord: landlord.isPrivateLandlord, tabId, notifPrefs,
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
