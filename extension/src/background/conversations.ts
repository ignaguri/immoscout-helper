import {
  canUseDirect,
  canUseServer,
  getAIConfig,
  getProvider,
  litellmPayload,
  trackTokenUsage,
} from '../shared/ai-router';
import * as C from '../shared/constants';
import type {
  IS24Conversation,
  IS24ConversationDetailResponse,
  IS24ConversationsResponse,
  IS24Message,
} from '../shared/immoscout-api';
import { debug, error, log, warn } from '../shared/logger';
import { buildConversationText, buildReplyPrompt } from '../shared/prompts';
import type { ConversationEntry, ConversationMessage } from '../shared/types';
import { getProfile } from './ai';
import { sendActivityLog } from './listings';
import { loadNotificationPrefs, shouldNotifyWith } from './notifications';

export type { ConversationEntry, ConversationMessage };

export async function checkForNewReplies(): Promise<void> {
  try {
    const notifPrefs = await loadNotificationPrefs();

    // Fetch conversations from ImmoScout API
    const allConversations: IS24Conversation[] = [];
    let cursor: string | null = null;
    let pageNum = 0;

    while (true) {
      const url = cursor
        ? `https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations?timestampOfLastConversationPaginated=${encodeURIComponent(cursor)}`
        : 'https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        if (pageNum === 0) {
          log('[Conversations] Could not fetch conversations:', response.status);
          return;
        }
        break;
      }
      const data: IS24ConversationsResponse = await response.json();
      const conversations = data.conversations || [];
      if (conversations.length === 0) break;

      allConversations.push(...conversations);
      pageNum++;
      log(
        `[Conversations] Fetched page ${pageNum}: ${conversations.length} conversations (total: ${allConversations.length})`,
      );

      // Safety cap to avoid unbounded fetching
      if (allConversations.length >= 500) break;

      const lastTimestamp = conversations[conversations.length - 1]?.lastUpdateDateTime;
      if (!lastTimestamp || lastTimestamp === cursor) break;
      cursor = lastTimestamp;
    }

    if (allConversations.length === 0) {
      log('[Conversations] No conversations found');
      return;
    }

    // Load stored conversation state
    const stored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
    const storedMap: Record<string, ConversationEntry> = {};
    if (stored[C.CONVERSATIONS_KEY]) {
      for (const conv of stored[C.CONVERSATIONS_KEY]) {
        storedMap[conv.conversationId] = conv;
      }
    }

    let newReplyCount = 0;
    const updatedConversations: ConversationEntry[] = [];

    for (const conv of allConversations) {
      const conversationId: string = conv.conversationId;
      if (!conversationId) continue;

      const referenceId = conv.referenceId;
      const lastUpdate = conv.lastUpdateDateTime;
      const stored = storedMap[conversationId];

      // Field mapping (from API discovery)
      const landlordName = conv.participantName || '';
      const salutation = conv.salutation || '';
      const addr = conv.address;
      const listingTitle = addr
        ? `${addr.street || ''} ${addr.houseNumber || ''}, ${addr.postcode || ''} ${addr.city || ''}`.trim()
        : conv.referenceId
          ? `Expose ${conv.referenceId}`
          : '';
      const lastMessagePreview = conv.previewMessage || '';
      const hasUnread = conv.read === false;
      const imageUrl = conv.imageUrl || '';
      const shortDetails = conv.shortDetails?.details || {};
      const appointment = conv.appointment || null;

      // Check if this conversation has a new update
      const hasNewUpdate = !stored || stored.lastUpdateDateTime !== lastUpdate;

      // Determine appointment status — API state takes priority when definitive,
      // falling back to stored (extension action), then defaulting to pending.
      const apiState = appointment?.state;
      const definiteApiStatus: string | null =
        apiState === 'ACCEPT'
          ? 'accepted'
          : apiState === 'DECLINE'
            ? 'rejected'
            : apiState === 'RESCHEDULE'
              ? 'alternative_requested'
              : null;
      const appointmentStatus: string | null =
        definiteApiStatus || stored?.appointmentStatus || (appointment ? 'pending' : null);

      // Sticky flag: once we detect a landlord reply, it stays true forever.
      // Backfill: also check stored messages for any landlord message.
      const storedHasLandlordMsg = stored?.messages?.some((m) => m.role === 'landlord') || false;
      const hasLandlordReply: boolean = hasUnread || stored?.hasLandlordReply || storedHasLandlordMsg;

      // Build conversation entry
      const convEntry: ConversationEntry = {
        conversationId,
        referenceId: referenceId ? String(referenceId) : null,
        listingTitle,
        landlordName,
        salutation,
        lastUpdateDateTime: lastUpdate,
        hasUnreadReply: hasUnread,
        hasLandlordReply,
        lastMessagePreview,
        imageUrl,
        shortDetails,
        appointment,
        appointmentStatus,
        messages: stored?.messages || [],
        draftReply: stored?.draftReply || null,
        draftStatus: stored?.draftStatus || 'none',
        draftError: stored?.draftError || null,
      };

      // If unread, try to fetch conversation detail for message history
      if (hasUnread) {
        try {
          const detailMessages = await fetchConversationMessages(conversationId);
          if (detailMessages && detailMessages.length > 0) {
            convEntry.messages = detailMessages;
          }
        } catch (e: any) {
          warn(`[Conversations] Could not fetch detail for ${conversationId}:`, e.message);
        }

        // Only send desktop notification if this is a NEW reply (not first load)
        if (stored && hasNewUpdate) {
          newReplyCount++;
          log(
            `[Conversations] New reply in conversation ${conversationId} from ${landlordName} about "${listingTitle}"`,
          );

          // Send desktop notification
          if (shouldNotifyWith(notifPrefs, 'newReply')) {
            try {
              chrome.notifications.create(`conv-reply-${conversationId}`, {
                type: 'basic',
                iconUrl: C.ICON_PATH,
                title: 'New reply from landlord',
                message: `${landlordName || 'Landlord'}: ${lastMessagePreview.substring(0, 100) || 'New message'}`,
                priority: 2,
              });
            } catch (_e) {
              debug('[Conversations] Desktop notification for new reply failed');
            }
          }

          // Log to activity
          await sendActivityLog({
            message: `New reply from ${landlordName || 'landlord'} about "${listingTitle || conversationId}"`,
            type: 'info',
          });
        }
      }

      updatedConversations.push(convEntry);
    }

    // Cap stored conversations
    const capped =
      updatedConversations.length > C.CONVERSATIONS_CAP
        ? updatedConversations.slice(0, C.CONVERSATIONS_CAP)
        : updatedConversations;

    // Count total unread
    const totalUnread = capped.filter((c) => c.hasUnreadReply).length;

    await chrome.storage.local.set({
      [C.CONVERSATIONS_KEY]: capped,
      [C.CONVERSATIONS_LAST_CHECK_KEY]: Date.now(),
      [C.CONV_UNREAD_COUNT_KEY]: totalUnread,
    });

    // Update badge
    if (totalUnread > 0) {
      chrome.action.setBadgeText({ text: String(totalUnread) });
      chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }

    if (newReplyCount > 0) {
      log(`[Conversations] Found ${newReplyCount} new replies (${totalUnread} total unread)`);
    } else {
      log(`[Conversations] No new replies (${allConversations.length} conversations checked, ${totalUnread} unread)`);
    }

    // Notify popup
    try {
      await chrome.runtime.sendMessage({ action: 'conversationUpdate', unreadCount: totalUnread });
    } catch (_e) {
      debug('[Conversations] Could not notify popup of conversation update (likely closed)');
    }
  } catch (err) {
    error('[Conversations] Error checking replies:', err);
  }
}

// Fetch individual conversation messages (API discovery + real fetch)
export async function fetchConversationMessages(conversationId: string): Promise<ConversationMessage[] | null> {
  const endpoints = [`https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations/${conversationId}`];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        log(`[Conversations] Endpoint ${url} returned ${response.status}`);
        continue;
      }

      const data: IS24ConversationDetailResponse = await response.json();
      // Extract messages from the confirmed API structure
      if (data.messages && data.messages.length > 0) {
        return data.messages
          .map((msg: IS24Message) => ({
            role: (msg.userType === 'SEEKER' ? 'user' : 'landlord') as ConversationMessage['role'],
            text: msg.message || '',
            timestamp: msg.creationDateTime || '',
          }))
          .filter((m) => m.text);
      }

      log(`[Conversations] No messages found in response. Keys: ${Object.keys(data).join(', ')}`);
    } catch (e: any) {
      warn(`[Conversations] Error fetching ${url}:`, e.message);
    }
  }

  return null;
}

// Write a terminal draft state (ready/error) only if the user hasn't dismissed or started another generation.
async function finalizeDraft(
  conversationId: string,
  draftReply: string | null,
  draftStatus: 'ready' | 'error',
  draftError: string | null,
): Promise<boolean> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
  const current = (stored[C.CONVERSATIONS_KEY] as ConversationEntry[] | undefined)?.find(
    (c) => c.conversationId === conversationId,
  );
  if (current?.draftStatus !== 'generating') return false;
  await updateConversationDraft(conversationId, draftReply, draftStatus, draftError);
  return true;
}

// Generate a draft reply using AI (direct Gemini or server)
export async function generateDraftReply(
  conversation: ConversationEntry,
  apiKey: string | undefined,
  userContext: string = '',
): Promise<void> {
  if (!conversation.messages || conversation.messages.length === 0) {
    await finalizeDraft(
      conversation.conversationId,
      null,
      'error',
      'No conversation history available. Open the conversation first.',
    );
    return;
  }

  let errorReported = false;
  try {
    const config = await getAIConfig();
    const profile = await getProfile();
    const formKeys = [
      C.AI_ABOUT_ME_KEY,
      C.FORM_ADULTS_KEY,
      C.FORM_CHILDREN_KEY,
      C.FORM_PETS_KEY,
      C.FORM_SMOKER_KEY,
      C.FORM_INCOME_KEY,
      C.FORM_INCOME_RANGE_KEY,
      C.FORM_PHONE_KEY,
    ];
    const formData: Record<string, any> = await chrome.storage.local.get(formKeys);

    const userProfile = {
      adults: formData[C.FORM_ADULTS_KEY],
      children: formData[C.FORM_CHILDREN_KEY],
      pets: formData[C.FORM_PETS_KEY],
      smoker: formData[C.FORM_SMOKER_KEY],
      income: formData[C.FORM_INCOME_KEY],
      incomeRange: formData[C.FORM_INCOME_RANGE_KEY],
      aboutMe: formData[C.AI_ABOUT_ME_KEY],
      phone: formData[C.FORM_PHONE_KEY],
    };

    const landlordInfo = { name: conversation.landlordName };

    let reply: string | null = null;
    let replyUsage = { promptTokens: 0, completionTokens: 0 };

    if (canUseDirect(config) && config.apiKey) {
      // Direct provider mode
      const systemPrompt = buildReplyPrompt(userProfile, landlordInfo, profile);
      const conversationText = buildConversationText(
        conversation.messages,
        conversation.listingTitle || undefined,
        undefined,
        userContext || undefined,
      );
      const provider = getProvider(config);
      const result = await provider.generateText(config.apiKey, systemPrompt, conversationText, { maxTokens: 2048 });
      reply = result.text.trim() || null;
      replyUsage = result.usage;
    } else if (canUseServer(config)) {
      // Server mode
      const response = await fetch(`${config.serverUrl}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: conversation.messages,
          userProfile,
          landlordInfo,
          listingTitle: conversation.listingTitle,
          userContext: userContext || undefined,
          apiKey: apiKey || undefined,
          provider: config.provider,
          profile,
          ...litellmPayload(config),
        }),
      });

      if (!response.ok) {
        error(`[Conversations] Draft reply API error: ${response.status}`);
        await finalizeDraft(
          conversation.conversationId,
          null,
          'error',
          `AI server error (${response.status}). Try again.`,
        );
        errorReported = true;
        throw new Error(`AI server error (${response.status})`);
      }

      const result: { reply?: string; usage?: { promptTokens?: number; completionTokens?: number } } =
        await response.json();
      reply = result.reply || null;
      if (result.usage) {
        replyUsage = {
          promptTokens: result.usage.promptTokens || 0,
          completionTokens: result.usage.completionTokens || 0,
        };
      }
    } else {
      warn('[Conversations] No valid AI configuration for draft reply');
      await finalizeDraft(
        conversation.conversationId,
        null,
        'error',
        'No AI configured. Set an API key or server URL in Settings.',
      );
      errorReported = true;
      throw new Error('No valid AI configuration');
    }

    if (reply) {
      const wrote = await finalizeDraft(conversation.conversationId, reply, 'ready', null);
      await trackTokenUsage(replyUsage.promptTokens, replyUsage.completionTokens);
      if (wrote) {
        log(`[Conversations] Draft reply generated for ${conversation.conversationId} (${reply.length} chars)`);
      } else {
        // User dismissed or started another generation; discard this result.
        log(`[Conversations] Draft reply for ${conversation.conversationId} discarded (state changed during generation)`);
      }
    } else {
      await finalizeDraft(
        conversation.conversationId,
        null,
        'error',
        'AI returned an empty reply. Try again.',
      );
      errorReported = true;
      throw new Error('AI returned an empty reply');
    }
  } catch (err: any) {
    error(`[Conversations] Error generating draft:`, err);
    if (!errorReported) {
      await finalizeDraft(
        conversation.conversationId,
        null,
        'error',
        err?.message || 'Unknown error generating draft',
      );
    }
    throw err;
  }
}

// Update a single conversation's draft in storage
export async function updateConversationDraft(
  conversationId: string,
  draftReply: string | null,
  draftStatus: ConversationEntry['draftStatus'],
  draftError: string | null = null,
): Promise<void> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
  if (!stored[C.CONVERSATIONS_KEY]) return;

  const updated = stored[C.CONVERSATIONS_KEY].map((c: ConversationEntry) => {
    if (c.conversationId === conversationId) {
      return { ...c, draftReply, draftStatus, draftError };
    }
    return c;
  });

  await chrome.storage.local.set({ [C.CONVERSATIONS_KEY]: updated });
  try {
    await chrome.runtime.sendMessage({ action: 'conversationUpdate' });
  } catch (_e) {
    debug('[Conversations] Could not notify popup of draft update (likely closed)');
  }
}

// Update a single conversation's appointment status in storage
export async function updateAppointmentStatus(conversationId: string, appointmentStatus: string): Promise<void> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
  if (!stored[C.CONVERSATIONS_KEY]) return;

  const updated = stored[C.CONVERSATIONS_KEY].map((c: ConversationEntry) => {
    if (c.conversationId === conversationId) {
      return { ...c, appointmentStatus };
    }
    return c;
  });

  await chrome.storage.local.set({ [C.CONVERSATIONS_KEY]: updated });
  try {
    await chrome.runtime.sendMessage({ action: 'conversationUpdate' });
  } catch (_e) {
    debug('[Conversations] Could not notify popup of appointment status update (likely closed)');
  }
}
