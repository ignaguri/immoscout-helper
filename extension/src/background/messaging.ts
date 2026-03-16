import { canUseDirect, canUseServer, getAIConfig, getProvider, trackTokenUsage } from '../shared/ai-router';
import * as C from '../shared/constants';
import { log, debug, warn, error } from '../shared/logger';
import { buildShortenPrompt } from '../shared/prompts';
import { generatePersonalizedMessage } from '../shared/utils';
import { logActivity } from './activity';
import { type FormValues, tryAIAnalysis, trySolveCaptcha } from './ai';
import { humanDelay, waitForTabLoad } from './helpers';
import { type Listing, sendActivityLog } from './listings';
import type { QueueItem } from './queue';
import {
  incrementMessageCount,
  isMonitoring,
  isProcessingQueue,
  lastMessageTime,
  messageCount,
  setLastMessageTime,
} from './state';

export interface HandleListingResult {
  success: boolean;
  listing?: Listing | QueueItem;
  skipped?: boolean;
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

// Prompt user about duplicate landlord via chrome.notifications
// Returns 'send' | 'skip' | 'defer' (defer = timeout, move to end of queue)
//
// NOTE: chrome.notifications buttons are only supported on ChromeOS and Windows.
// On macOS, buttons are silently dropped. The notification body is still shown, and
// clicking it resolves to 'send'. If the user doesn't interact within the timeout,
// the listing is deferred (moved to end of queue) as a safe default.
function promptDuplicateLandlordDecision(
  landlordName: string,
  listing: Listing | QueueItem,
): Promise<'send' | 'skip' | 'defer'> {
  return new Promise((resolve) => {
    const notifId = `dup-landlord-${Date.now()}`;
    let resolved = false;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      chrome.notifications.onButtonClicked.removeListener(buttonListener);
      chrome.notifications.onClicked.removeListener(clickListener);
      chrome.notifications.clear(notifId);
    };

    const buttonListener = (clickedNotifId: string, buttonIndex: number) => {
      if (clickedNotifId !== notifId) return;
      cleanup();
      resolve(buttonIndex === 0 ? 'send' : 'skip');
    };

    const clickListener = (clickedNotifId: string) => {
      if (clickedNotifId !== notifId) return;
      cleanup();
      resolve('send');
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

    // 1-minute timeout → defer (move to end of queue)
    setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolve('defer');
      }
    }, C.DUPLICATE_LANDLORD_TIMEOUT_MS);
  });
}

export async function handleNewListing(listing: Listing | QueueItem): Promise<HandleListingResult> {
  log('Processing new listing:', listing.url);

  await new Promise((resolve) => setTimeout(resolve, humanDelay(500, 300)));
  const listingTab = await chrome.tabs.create({ url: listing.url, active: true });
  const currentListingTabId = listingTab.id!;

  // Wait for page load via event instead of fixed delay
  await waitForTabLoad(currentListingTabId, 10000);

  if (!isMonitoring && !isProcessingQueue) {
    log('Monitoring/queue stopped, skipping message sending');
    return { success: false, listing };
  }

  try {
    // Wait for content script to be ready
    let contentScriptReady = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await chrome.tabs.sendMessage(currentListingTabId, { action: 'ping' });
        contentScriptReady = true;
        break;
      } catch (_error) {
        debug('[Messaging] Content script ping attempt failed, retrying...');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!contentScriptReady) {
      error('Content script not ready after waiting');
      try {
        await chrome.tabs.remove(currentListingTabId);
      } catch (_e) {
        debug('[Messaging] Tab cleanup failed after content script timeout');
      }
      return { success: false, listing, error: 'Content script not ready' };
    }

    await new Promise((resolve) => setTimeout(resolve, humanDelay(1000, 500)));

    if (!isMonitoring && !isProcessingQueue) {
      log('Monitoring/queue stopped during processing, aborting');
      return { success: false, listing };
    }

    // Detect listing type (tenant-network vs standard)
    let isTenantNetwork = false;
    try {
      const listingType: any = await chrome.tabs.sendMessage(currentListingTabId, { action: 'detectListingType' });
      isTenantNetwork = listingType?.isTenantNetwork || false;
      if (isTenantNetwork && !listingType?.hasContactForm) {
        log(`[Skip] ${listing.id} is a tenant-network listing with no contact form — marking as seen`);
        await sendActivityLog({ message: `Skipped ${listing.id} (tenant-network, no contact form)`, type: 'wait' });
        try {
          await chrome.tabs.remove(currentListingTabId);
        } catch (_e) {
          debug('[Messaging] Tab cleanup failed after tenant-network skip');
        }
        return { success: true, listing, skipped: true };
      }
      if (isTenantNetwork) {
        log(`[Info] ${listing.id} is a tenant-network listing with contact form — proceeding`);
      }
    } catch (_e) {
      debug('[Messaging] Listing type detection failed, proceeding with default');
    }

    const nameResult: any = await chrome.tabs.sendMessage(currentListingTabId, { action: 'extractLandlordName' });
    const landlordTitle: string | null = nameResult?.title || null;
    const landlordName: string | null = nameResult?.name || null;
    const isPrivateLandlord: boolean = nameResult?.isPrivate || false;

    // Duplicate landlord detection
    if (landlordName) {
      const normalizedLandlord = landlordName.toLowerCase().trim();
      const landlordStored: Record<string, any> = await chrome.storage.local.get([C.CONTACTED_LANDLORDS_KEY]);
      const contactedLandlords: string[] = landlordStored[C.CONTACTED_LANDLORDS_KEY] || [];

      if (contactedLandlords.includes(normalizedLandlord)) {
        log(`[Duplicate] Landlord "${landlordName}" already contacted — prompting user`);
        await sendActivityLog({
          message: `Duplicate landlord detected: "${landlordName}" — waiting for user decision...`,
          type: 'wait',
        });

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
          try {
            await chrome.tabs.remove(currentListingTabId);
          } catch (_e) {
            debug('[Messaging] Tab cleanup failed after duplicate skip');
          }
          return { success: true, skipped: true, listing };
        } else if (decision === 'defer') {
          log(`[Duplicate] No response for "${landlordName}" — deferring to end of queue`);
          await sendActivityLog({
            message: `No response — "${landlordName}" moved to end of queue`,
            type: 'wait',
          });
          try {
            await chrome.tabs.remove(currentListingTabId);
          } catch (_e) {
            debug('[Messaging] Tab cleanup failed after duplicate defer');
          }
          return { success: false, listing, error: 'duplicate-landlord-deferred' };
        }
        // decision === 'send' → continue normally
        log(`[Duplicate] User chose to send anyway to "${landlordName}"`);
      }
    }

    // Get message template and all form values (including smoker)
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

    // AI analysis: score listing and optionally generate message
    const aiResult = await tryAIAnalysis(
      currentListingTabId,
      landlordTitle,
      landlordName,
      isPrivateLandlord,
      formValues,
      stored[C.MESSAGE_TEMPLATE_KEY] || '',
      isTenantNetwork,
    );

    const landlordInfo = landlordTitle && landlordName ? `${landlordTitle} ${landlordName}` : landlordName || 'Unknown';

    // Log full AI analysis
    if (aiResult) {
      log(`[AI] ─── Analysis for ${listing.id} ───`);
      log(`[AI] Score: ${aiResult.score}/10 | Skip: ${aiResult.skip} | Landlord: ${landlordInfo}`);
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

    // If AI says skip, notify and close tab
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
        landlord: landlordInfo,
      });
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: C.ICON_PATH,
          title: `Skipped (${aiResult.score}/10)`,
          message: `${landlordInfo}: ${aiResult.reason || listing.title || 'Low score'}`,
        });
      } catch (_e) {
        debug('[Messaging] Skip notification failed');
      }

      try {
        await chrome.tabs.remove(currentListingTabId);
      } catch (_e) {
        debug('[Messaging] Tab cleanup failed after AI skip');
      }
      return { success: true, skipped: true, listing };
    }

    // Use AI message if available, otherwise fall back to template
    if (!aiResult?.message) {
      warn('[Messaging] AI did not generate a message — falling back to template');
    }
    const personalizedMessage =
      aiResult?.message ||
      generatePersonalizedMessage(stored[C.MESSAGE_TEMPLATE_KEY] || '', landlordTitle, landlordName, isTenantNetwork);

    if (aiResult?.message) {
      log(`[AI] Using AI-generated message (score ${aiResult.score}/10)`);
    }

    await new Promise((resolve) => setTimeout(resolve, humanDelay(500, 300)));

    const isAutoSend = stored[C.AUTO_SEND_MODE_KEY] !== 'manual';
    let sendResult: any = null;
    try {
      sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
        action: 'sendMessage',
        message: personalizedMessage,
        formValues: formValues,
        autoSend: isAutoSend,
      });
    } catch (err: any) {
      error('Error sending message to content script:', err);
      try {
        await chrome.tabs.remove(currentListingTabId);
      } catch (_e) {
        debug('[Messaging] Tab cleanup failed after send error');
      }
      return { success: false, listing, error: err.message };
    }

    // Handle "message too long" error — ask AI to shorten, retry once
    if (sendResult && !sendResult.success && sendResult.messageTooLong) {
      const limit: number = sendResult.maxLength || 2000;
      warn(
        `[Message] Too long for form (${personalizedMessage.length} chars, limit: ${limit}) — asking AI to shorten`,
      );
      try {
        const shortenConfig = await getAIConfig();
        let shortened: string | null = null;
        let shortenUsage = { promptTokens: 0, completionTokens: 0 };

        if (canUseDirect(shortenConfig) && shortenConfig.apiKey) {
          // Direct provider mode
          const systemPrompt = buildShortenPrompt(limit);
          const provider = getProvider(shortenConfig);
          const result = await provider.generateText(
            shortenConfig.apiKey,
            systemPrompt,
            `Kürze diese Nachricht auf maximal ${limit} Zeichen:\n\n${personalizedMessage}`,
            { maxTokens: 4096 },
          );
          shortened = result.text.trim();
          shortenUsage = result.usage;
        } else if (canUseServer(shortenConfig)) {
          // Server mode
          const shortenResponse = await fetch(`${shortenConfig.serverUrl}/shorten`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: personalizedMessage,
              maxLength: limit,
              apiKey: shortenConfig.apiKey,
              provider: shortenConfig.provider,
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
          log(
            `[Message] AI shortened from ${personalizedMessage.length} to ${shortened.length} chars — retrying`,
          );
          sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
            action: 'sendMessage',
            message: shortened,
            formValues: formValues,
            autoSend: isAutoSend,
          });
        } else {
          warn(`[Message] AI shorten returned ${shortened?.length} chars (limit ${limit}) — hard truncating`);
          sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
            action: 'sendMessage',
            message: (shortened || personalizedMessage).substring(0, limit),
            formValues: formValues,
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
      const captchaConfig = await getAIConfig();
      if (captchaConfig.enabled) {
        const captchaResult = await trySolveCaptcha(currentListingTabId, captchaConfig.serverUrl, captchaConfig.apiKey);
        log('[Captcha] Result:', JSON.stringify(captchaResult));
        if (captchaResult && typeof captchaResult !== 'boolean' && captchaResult.messageSent) {
          // Captcha solved AND message confirmed sent
          log('[Captcha] Message confirmed sent after captcha resolution');
          sendResult = { success: true, messageSent: personalizedMessage };
        } else if (captchaResult && typeof captchaResult !== 'boolean' && captchaResult.solved) {
          // Captcha solved but message not sent yet — retry the full send
          log('[Captcha] Captcha solved, retrying message send...');
          try {
            sendResult = await chrome.tabs.sendMessage(currentListingTabId, {
              action: 'sendMessage',
              message: personalizedMessage,
              formValues: formValues,
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

    if (!sendResult || !sendResult.success) {
      const errorMsg = sendResult?.error || 'Unknown error';
      error(`Failed to send message to ${landlordInfo}: ${errorMsg}`);
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
        landlord: landlordInfo,
      });
    } else {
      await sendActivityLog({ lastResult: 'success', lastId: listing.id, lastTitle: listing.title || '' });
      if (isAutoSend) {
        log(`Message sent successfully to ${landlordInfo}`);
      } else {
        log(`Form filled for ${landlordInfo} - waiting for manual send`);
      }

      await logActivity({
        listingId: listing.id,
        title: listing.title,
        url: listing.url,
        score: aiResult?.score,
        reason: aiResult?.reason,
        action: 'sent',
        landlord: landlordInfo,
      });

      // Track landlord and increment rate limit counter
      if (landlordName) {
        await recordContactedLandlord(landlordName);
      }
      incrementMessageCount();
      setLastMessageTime(Date.now());
      const totalStored: Record<string, any> = await chrome.storage.local.get([C.TOTAL_MESSAGES_SENT_KEY]);
      await chrome.storage.local.set({
        [C.TOTAL_MESSAGES_SENT_KEY]: (totalStored[C.TOTAL_MESSAGES_SENT_KEY] || 0) + 1,
        [C.RATE_MESSAGE_COUNT_KEY]: messageCount,
        [C.RATE_LAST_MESSAGE_TIME_KEY]: lastMessageTime,
      });
      log(
        `[Rate] ${messageCount}/${await chrome.storage.local.get([C.RATE_LIMIT_KEY]).then((s: Record<string, any>) => s[C.RATE_LIMIT_KEY] || 10)} messages this hour`,
      );

      // Send browser notification
      if (isAutoSend) {
        try {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: C.ICON_PATH,
            title: 'Message Sent',
            message: `Sent to ${landlordInfo}: ${listing.title || 'New Listing'}${aiResult ? ` (Score: ${aiResult.score}/10)` : ''}`,
          });
        } catch (e) {
          error('Notification error:', e);
        }
      } else {
        // Manual mode: persistent notification with click-to-focus
        const notifId = `manual-review-${listing.id || Date.now()}`;
        try {
          chrome.notifications.create(notifId, {
            type: 'basic',
            iconUrl: C.ICON_PATH,
            title: 'Nachricht bereit zur Überprüfung',
            message: `${landlordInfo}: ${listing.title || 'New Listing'}${aiResult ? ` (Score: ${aiResult.score}/10)` : ''}`,
            requireInteraction: true,
          });
        } catch (e) {
          error('Notification error:', e);
        }
      }
    }

    if (isAutoSend) {
      await new Promise((resolve) => setTimeout(resolve, humanDelay(2000, 1000)));
      try {
        await chrome.tabs.remove(currentListingTabId);
        log('Closed listing tab');
      } catch (_closeError) {
        debug('[Messaging] Tab close failed after auto-send');
      }
    } else {
      try {
        await chrome.tabs.update(currentListingTabId, { active: true });
        const tabInfo = await chrome.tabs.get(currentListingTabId);
        await chrome.windows.update(tabInfo.windowId, { focused: true });
      } catch (_e) {
        debug('[Messaging] Tab focus failed for manual review');
      }
    }

    return { success: sendResult?.success, listing };
  } catch (err: any) {
    error('Error sending message:', err);
    try {
      await chrome.tabs.remove(currentListingTabId);
    } catch (_e) {
      debug('[Messaging] Tab cleanup failed in error handler');
    }
    return { success: false, listing, error: err.message };
  }
}
