import * as C from '../shared/constants';
import type { ConversationEntry, ConversationMessage } from '../shared/types';
import { getProfile } from './ai';
import type { ConversationApiResponse } from './sync';
import { sendActivityLog } from './listings';

export type { ConversationEntry, ConversationMessage };

export async function checkForNewReplies(): Promise<void> {
  try {
    // Fetch conversations from ImmoScout API
    const allConversations: any[] = [];
    let cursor: string | null = null;
    let pageNum = 0;

    while (true) {
      const url = cursor
        ? `https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations?timestampOfLastConversationPaginated=${encodeURIComponent(cursor)}`
        : 'https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        if (pageNum === 0) {
          console.log('[Conversations] Could not fetch conversations:', response.status);
          return;
        }
        break;
      }
      const data: ConversationApiResponse = await response.json();
      const conversations = data.conversations || [];
      if (conversations.length === 0) break;

      allConversations.push(...conversations);
      pageNum++;

      // Only check first 2 pages for replies (most recent conversations)
      if (pageNum >= 2) break;

      const lastTimestamp: string | undefined = conversations[conversations.length - 1]?.lastUpdateDateTime;
      if (!lastTimestamp) break;
      cursor = lastTimestamp;
    }

    if (allConversations.length === 0) {
      console.log('[Conversations] No conversations found');
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

      const referenceId: string | undefined = conv.referenceId;
      const lastUpdate: string = conv.lastUpdateDateTime;
      const stored = storedMap[conversationId];

      // Field mapping (from API discovery)
      const landlordName: string = conv.participantName || '';
      const salutation: string = conv.salutation || '';
      const addr = conv.address;
      const listingTitle: string = addr
        ? `${addr.street || ''} ${addr.houseNumber || ''}, ${addr.postcode || ''} ${addr.city || ''}`.trim()
        : conv.referenceId
          ? `Expose ${conv.referenceId}`
          : '';
      const lastMessagePreview: string = conv.previewMessage || '';
      const hasUnread: boolean = conv.read === false;
      const imageUrl: string = conv.imageUrl || '';
      const shortDetails: Record<string, any> = conv.shortDetails?.details || {};
      const appointment: any = conv.appointment || null;

      // Check if this conversation has a new update
      const hasNewUpdate = !stored || stored.lastUpdateDateTime !== lastUpdate;

      // Determine appointment status — preserve user's action if already set
      const appointmentStatus: string | null = stored?.appointmentStatus || (appointment ? 'pending' : null);

      // Build conversation entry
      const convEntry: ConversationEntry = {
        conversationId,
        referenceId: referenceId ? String(referenceId) : null,
        listingTitle,
        landlordName,
        salutation,
        lastUpdateDateTime: lastUpdate,
        hasUnreadReply: hasUnread,
        lastMessagePreview,
        imageUrl,
        shortDetails,
        appointment,
        appointmentStatus,
        messages: stored?.messages || [],
        draftReply: stored?.draftReply || null,
        draftStatus: stored?.draftStatus || 'none',
      };

      // If unread, try to fetch conversation detail for message history
      if (hasUnread) {
        try {
          const detailMessages = await fetchConversationMessages(conversationId);
          if (detailMessages && detailMessages.length > 0) {
            convEntry.messages = detailMessages;
          }
        } catch (e: any) {
          console.warn(`[Conversations] Could not fetch detail for ${conversationId}:`, e.message);
        }

        // Only send desktop notification if this is a NEW reply (not first load)
        if (stored && hasNewUpdate) {
          newReplyCount++;
          console.log(
            `[Conversations] New reply in conversation ${conversationId} from ${landlordName} about "${listingTitle}"`,
          );

          // Send desktop notification
          try {
            chrome.notifications.create(`conv-reply-${conversationId}`, {
              type: 'basic',
              iconUrl: C.ICON_PATH,
              title: 'New reply from landlord',
              message: `${landlordName || 'Landlord'}: ${lastMessagePreview.substring(0, 100) || 'New message'}`,
              priority: 2,
            });
          } catch (_e) {
            console.debug('[Conversations] Desktop notification for new reply failed');
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
      console.log(`[Conversations] Found ${newReplyCount} new replies (${totalUnread} total unread)`);
    } else {
      console.log(
        `[Conversations] No new replies (${allConversations.length} conversations checked, ${totalUnread} unread)`,
      );
    }

    // Notify popup
    try {
      await chrome.runtime.sendMessage({ action: 'conversationUpdate', unreadCount: totalUnread });
    } catch (_e) {
      console.debug('[Conversations] Could not notify popup of conversation update (likely closed)');
    }
  } catch (error) {
    console.error('[Conversations] Error checking replies:', error);
  }
}

// Fetch individual conversation messages (API discovery + real fetch)
export async function fetchConversationMessages(conversationId: string): Promise<ConversationMessage[] | null> {
  const endpoints = [`https://www.immobilienscout24.de/nachrichten-manager/api/seeker/conversations/${conversationId}`];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        console.log(`[Conversations] Endpoint ${url} returned ${response.status}`);
        continue;
      }

      const data: any = await response.json();
      // Extract messages from the confirmed API structure
      const rawMessages = data.messages;
      if (rawMessages && rawMessages.length > 0) {
        return rawMessages
          .map((msg: any) => ({
            role: msg.userType === 'SEEKER' ? 'user' : 'landlord',
            text: msg.message || '',
            timestamp: msg.creationDateTime || '',
          }))
          .filter((m: ConversationMessage) => m.text);
      }

      console.log(`[Conversations] No messages found in response. Keys: ${Object.keys(data).join(', ')}`);
    } catch (e: any) {
      console.warn(`[Conversations] Error fetching ${url}:`, e.message);
    }
  }

  return null;
}

// Generate a draft reply using the AI server
export async function generateDraftReply(
  conversation: ConversationEntry,
  serverUrl: string,
  apiKey: string | undefined,
  userContext: string = '',
): Promise<void> {
  if (!conversation.messages || conversation.messages.length === 0) return;

  try {
    // Load user profile for context
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

    const response = await fetch(`${serverUrl}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationHistory: conversation.messages,
        userProfile: {
          adults: formData[C.FORM_ADULTS_KEY],
          children: formData[C.FORM_CHILDREN_KEY],
          pets: formData[C.FORM_PETS_KEY],
          smoker: formData[C.FORM_SMOKER_KEY],
          income: formData[C.FORM_INCOME_KEY],
          incomeRange: formData[C.FORM_INCOME_RANGE_KEY],
          aboutMe: formData[C.AI_ABOUT_ME_KEY],
          phone: formData[C.FORM_PHONE_KEY],
        },
        landlordInfo: {
          name: conversation.landlordName,
        },
        listingTitle: conversation.listingTitle,
        userContext: userContext || undefined,
        apiKey: apiKey || undefined,
        profile,
      }),
    });

    if (!response.ok) {
      console.error(`[Conversations] Draft reply API error: ${response.status}`);
      await updateConversationDraft(conversation.conversationId, null, 'none');
      return;
    }

    const result: any = await response.json();
    if (result.reply) {
      await updateConversationDraft(conversation.conversationId, result.reply, 'ready');
      console.log(
        `[Conversations] Draft reply generated for ${conversation.conversationId} (${result.reply.length} chars)`,
      );

      // Track token usage
      if (result.usage) {
        const usageStored: Record<string, any> = await chrome.storage.local.get([
          C.AI_USAGE_PROMPT_TOKENS_KEY,
          C.AI_USAGE_COMPLETION_TOKENS_KEY,
        ]);
        await chrome.storage.local.set({
          [C.AI_USAGE_PROMPT_TOKENS_KEY]:
            (usageStored[C.AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (result.usage.promptTokens || 0),
          [C.AI_USAGE_COMPLETION_TOKENS_KEY]:
            (usageStored[C.AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (result.usage.completionTokens || 0),
        });
      }

      // Notify popup
      try {
        await chrome.runtime.sendMessage({ action: 'conversationUpdate' });
      } catch (_e) {
        console.debug('[Conversations] Could not notify popup of draft update (likely closed)');
      }
    } else {
      await updateConversationDraft(conversation.conversationId, null, 'none');
    }
  } catch (error) {
    console.error(`[Conversations] Error generating draft:`, error);
    await updateConversationDraft(conversation.conversationId, null, 'none');
  }
}

// Update a single conversation's draft in storage
export async function updateConversationDraft(
  conversationId: string,
  draftReply: string | null,
  draftStatus: string,
): Promise<void> {
  const stored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
  if (!stored[C.CONVERSATIONS_KEY]) return;

  const updated = stored[C.CONVERSATIONS_KEY].map((c: ConversationEntry) => {
    if (c.conversationId === conversationId) {
      return { ...c, draftReply, draftStatus };
    }
    return c;
  });

  await chrome.storage.local.set({ [C.CONVERSATIONS_KEY]: updated });
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
    console.debug('[Conversations] Could not notify popup of appointment status update (likely closed)');
  }
}
