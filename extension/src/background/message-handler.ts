import {
  canUseDirect,
  canUseServer,
  getAIConfig,
  getProvider,
  litellmPayload,
  trackTokenUsage,
} from '../shared/ai-router';
import * as C from '../shared/constants';
import { debug, error, log, warn } from '../shared/logger';
import { buildConversationText, buildReplyPrompt } from '../shared/prompts';
import type { ManualReviewData, PendingApprovalItem } from '../shared/types';
import { getProfile } from './ai';
import type { ConversationEntry } from './conversations';
import {
  checkForNewReplies,
  generateDraftReply,
  updateAppointmentStatus,
  updateConversationDraft,
} from './conversations';
import { exportSnapshot as runExportSnapshot } from './exporter';
import { scheduleNextAlarm, waitForTabLoad } from './helpers';
import type { Listing } from './listings';
import { handleNewListing } from './messaging';
import { startMonitoring, stopMonitoring, updateCheckInterval } from './monitoring';
import { approvePendingListing, getPendingApprovalListings, skipPendingListing } from './pending-approval';
import { enqueueListings, processQueue } from './queue';
import {
  deleteSnapshot as deleteSavedSnapshot,
  exportSavedSnapshot,
  getSnapshotsIndex,
  saveSnapshotById,
} from './saved-snapshots';
import {
  currentCheckInterval,
  isMonitoring,
  isProcessingQueue,
  messageCount,
  messageCountResetTime,
  setMessageCount,
  setMessageCountResetTime,
  setQueueAbortRequested,
  setUserTriggeredProcessing,
} from './state';

type MessageRequest = { action: string; [key: string]: any };

export function registerMessageHandler(): void {
  chrome.runtime.onMessage.addListener(
    (request: MessageRequest, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      if (request.action === 'startMonitoring') {
        startMonitoring()
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((err) => {
            error('Error starting monitoring:', err);
            sendResponse({ success: false, error: err.message });
          });
        return true;
      } else if (request.action === 'stopMonitoring') {
        (async () => {
          try {
            await stopMonitoring();
            sendResponse({ success: true });
          } catch (err: any) {
            error('Error stopping monitoring:', err);
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'getStatus') {
        (async () => {
          try {
            const stats: Record<string, any> = await chrome.storage.local.get([
              C.TOTAL_MESSAGES_SENT_KEY,
              C.LAST_CHECK_TIME_KEY,
              C.STORAGE_KEY,
              C.RATE_MESSAGE_COUNT_KEY,
              C.RATE_COUNT_RESET_TIME_KEY,
              C.AI_ENABLED_KEY,
              C.AI_LISTINGS_SCORED_KEY,
              C.AI_LISTINGS_SKIPPED_KEY,
              C.AI_USAGE_PROMPT_TOKENS_KEY,
              C.AI_USAGE_COMPLETION_TOKENS_KEY,
              C.SYNCED_CONTACTED_KEY,
              C.QUEUE_KEY,
              C.ACTIVITY_LOG_KEY,
            ]);

            // Derive accurate counts from activity log
            const activityLog: any[] = stats[C.ACTIVITY_LOG_KEY] || [];
            let actSent = 0;
            let actFilled = 0;
            let actSkipped = 0;
            let actFailed = 0;
            for (const entry of activityLog) {
              if (entry.action === 'sent') actSent++;
              else if (entry.action === 'filled') actFilled++;
              else if (entry.action === 'skipped') actSkipped++;
              else if (entry.action === 'failed') actFailed++;
            }

            sendResponse({
              isMonitoring,
              checkInterval: currentCheckInterval / 1000,
              totalMessagesSent: stats[C.TOTAL_MESSAGES_SENT_KEY] || 0,
              messagesThisHour: stats[C.RATE_MESSAGE_COUNT_KEY] || messageCount,
              lastCheckTime: stats[C.LAST_CHECK_TIME_KEY] || null,
              seenListingsCount: (stats[C.STORAGE_KEY] || []).length,
              syncedContacted: stats[C.SYNCED_CONTACTED_KEY] || 0,
              aiEnabled: stats[C.AI_ENABLED_KEY] || false,
              aiScored: stats[C.AI_LISTINGS_SCORED_KEY] || 0,
              aiSkipped: stats[C.AI_LISTINGS_SKIPPED_KEY] || 0,
              aiPromptTokens: stats[C.AI_USAGE_PROMPT_TOKENS_KEY] || 0,
              aiCompletionTokens: stats[C.AI_USAGE_COMPLETION_TOKENS_KEY] || 0,
              isProcessingQueue,
              queueLength: (stats[C.QUEUE_KEY] || []).length,
              activitySent: actSent,
              activityFilled: actFilled,
              activitySkipped: actSkipped,
              activityFailed: actFailed,
            });
          } catch (_error) {
            sendResponse({ isMonitoring, checkInterval: currentCheckInterval / 1000 });
          }
        })();
        return true;
      } else if (request.action === 'updateInterval') {
        (async () => {
          try {
            if (isMonitoring) {
              if (request.interval) {
                await chrome.storage.local.set({ [C.CHECK_INTERVAL_KEY]: request.interval });
              }
              await updateCheckInterval();
              await scheduleNextAlarm();
              log(`Check interval updated to ${currentCheckInterval / 1000} seconds`);
            }
            sendResponse({ success: true });
          } catch (err: any) {
            error('Error updating interval:', err);
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'clearSeenListings') {
        (async () => {
          try {
            const stored: Record<string, any> = await chrome.storage.local.get([C.STORAGE_KEY]);
            log(`[Clear] Clearing ${(stored[C.STORAGE_KEY] || []).length} seen listings and resetting rate limit`);
            setMessageCount(0);
            setMessageCountResetTime(Date.now() + 3600000);
            await chrome.storage.local.set({
              [C.STORAGE_KEY]: [],
              [C.SYNCED_CONTACTED_KEY]: 0,
              [C.RATE_MESSAGE_COUNT_KEY]: 0,
              [C.RATE_COUNT_RESET_TIME_KEY]: messageCountResetTime,
            });
            log('[Clear] Seen list and rate limit reset');
            sendResponse({ success: true });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;

        // --- Manual Queue handlers ---
      } else if (request.action === 'captureQueueItems') {
        (async () => {
          try {
            const incomingListings: Listing[] = request.listings || [];
            const added = await enqueueListings(incomingListings, 'manual');
            const stored: Record<string, any> = await chrome.storage.local.get([C.QUEUE_KEY]);
            sendResponse({ success: true, added, total: (stored[C.QUEUE_KEY] || []).length });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'startQueueProcessing') {
        (async () => {
          if (isProcessingQueue) {
            sendResponse({ success: false, error: 'Already processing' });
            return;
          }
          const stored: Record<string, any> = await chrome.storage.local.get([C.QUEUE_KEY]);
          if (!stored[C.QUEUE_KEY] || stored[C.QUEUE_KEY].length === 0) {
            sendResponse({ success: false, error: 'Queue is empty' });
            return;
          }
          setUserTriggeredProcessing(true);
          processQueue().catch((e) => error('[Queue] Processing error:', e));
          sendResponse({ success: true });
        })();
        return true;
      } else if (request.action === 'stopQueueProcessing') {
        setQueueAbortRequested(true);
        setUserTriggeredProcessing(false);
        sendResponse({ success: true });
        return true;
      } else if (request.action === 'getQueueStatus') {
        (async () => {
          const stored: Record<string, any> = await chrome.storage.local.get([C.QUEUE_KEY]);
          sendResponse({
            isProcessing: isProcessingQueue,
            queue: stored[C.QUEUE_KEY] || [],
          });
        })();
        return true;

        // --- Pending approval handlers ---
      } else if (request.action === 'getPendingApprovalListings') {
        (async () => {
          try {
            const items = await getPendingApprovalListings();
            sendResponse({ success: true, items });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'approvePendingListing') {
        (async () => {
          try {
            const { id, url, title } = request as unknown as PendingApprovalItem;
            if (!id || !url) {
              sendResponse({ success: false, error: 'id and url required' });
              return;
            }
            await approvePendingListing(id);
            // Re-process the listing through the standard flow
            setUserTriggeredProcessing(true);
            let result: any;
            try {
              result = await handleNewListing({ id, url, title: title || '', index: 0 });
            } finally {
              setUserTriggeredProcessing(false);
            }
            sendResponse({ success: true, result });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'skipPendingListing') {
        (async () => {
          try {
            const { id } = request;
            if (!id) {
              sendResponse({ success: false, error: 'id required' });
              return;
            }
            await skipPendingListing(id);
            sendResponse({ success: true });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;

        // --- Conversation handlers ---
      } else if (request.action === 'checkRepliesNow') {
        (async () => {
          try {
            await checkForNewReplies();
            sendResponse({ success: true });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'sendConversationReply') {
        (async () => {
          try {
            const { conversationId, message } = request;
            if (!conversationId || !message) {
              sendResponse({ success: false, error: 'conversationId and message required' });
              return;
            }

            // Open the messenger conversation page
            const messengerUrl = C.getMessengerUrl(conversationId);
            const tab = await chrome.tabs.create({ url: messengerUrl, active: false });

            await waitForTabLoad(tab.id!, C.TAB_LOAD_TIMEOUT);
            // Extra wait for React to render
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Ping content script until ready
            let contentReady = false;
            for (let i = 0; i < 5; i++) {
              try {
                const pong: any = await chrome.tabs.sendMessage(tab.id!, { action: 'ping' });
                if (pong?.pong) {
                  contentReady = true;
                  break;
                }
              } catch (_e) {
                debug('[MessageHandler] Content script ping failed on messenger page, retrying...');
              }
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            if (!contentReady) {
              sendResponse({ success: false, error: 'Content script not ready on messenger page' });
              return;
            }

            // Send the reply text to content script for filling
            const result: any = await chrome.tabs.sendMessage(tab.id!, {
              action: 'fillConversationReply',
              message,
            });

            if (result?.success) {
              // Update draft status
              await updateConversationDraft(conversationId, message, 'sent');
              log(`[Conversations] Reply filled for ${conversationId}, tab left open for user review`);
              sendResponse({ success: true, tabId: tab.id });
            } else {
              sendResponse({ success: false, error: result?.error || 'Failed to fill reply' });
            }
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'respondToAppointment') {
        (async () => {
          try {
            const { conversationId, response: apptResponse, userContext, appointment } = request;
            if (!conversationId || !apptResponse) {
              sendResponse({ success: false, error: 'conversationId and response required' });
              return;
            }

            // Load conversation from storage
            const convStored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
            const conv = ((convStored[C.CONVERSATIONS_KEY] || []) as ConversationEntry[]).find(
              (c) => c.conversationId === conversationId,
            );
            if (!conv) {
              sendResponse({ success: false, error: 'Conversation not found' });
              return;
            }

            // Generate AI courtesy message
            let courtesyMessage = '';
            try {
              const aiConfig = await getAIConfig();
              const profile = await getProfile();
              const formData: Record<string, any> = await chrome.storage.local.get([
                C.AI_ABOUT_ME_KEY,
                C.FORM_ADULTS_KEY,
                C.FORM_CHILDREN_KEY,
                C.FORM_PETS_KEY,
                C.FORM_SMOKER_KEY,
                C.FORM_INCOME_KEY,
                C.FORM_INCOME_RANGE_KEY,
                C.FORM_PHONE_KEY,
              ]);

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

              const landlordInfo = { name: conv.landlordName };
              const appointmentAction = {
                type: apptResponse as 'accept' | 'reject' | 'alternative',
                date: appointment?.date,
                time: appointment?.time,
                location: appointment?.location,
                userContext: userContext || undefined,
              };

              if (canUseDirect(aiConfig) && aiConfig.apiKey) {
                const systemPrompt = buildReplyPrompt(userProfile, landlordInfo, profile);
                const conversationText = buildConversationText(
                  conv.messages || [],
                  conv.listingTitle || undefined,
                  appointmentAction,
                );
                const provider = getProvider(aiConfig);
                const result = await provider.generateText(aiConfig.apiKey, systemPrompt, conversationText, {
                  maxTokens: 2048,
                });
                courtesyMessage = result.text.trim();
                await trackTokenUsage(result.usage.promptTokens, result.usage.completionTokens);
              } else if (canUseServer(aiConfig)) {
                const resp = await fetch(`${aiConfig.serverUrl}/reply`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    conversationHistory: conv.messages || [],
                    userProfile,
                    landlordInfo,
                    listingTitle: conv.listingTitle,
                    apiKey: aiConfig.apiKey || undefined,
                    provider: aiConfig.provider,
                    profile,
                    appointmentAction,
                    ...litellmPayload(aiConfig),
                  }),
                });

                if (resp.ok) {
                  const result: any = await resp.json();
                  courtesyMessage = result.reply || '';
                  if (result.usage) {
                    await trackTokenUsage(result.usage.promptTokens || 0, result.usage.completionTokens || 0);
                  }
                }
              }
            } catch (e: any) {
              warn(`[Appointments] AI draft failed:`, e.message);
            }

            // Open the messenger conversation page
            const messengerUrl = C.getMessengerUrl(conversationId);
            const tab = await chrome.tabs.create({ url: messengerUrl, active: false });

            await waitForTabLoad(tab.id!, C.TAB_LOAD_TIMEOUT);
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Ping content script until ready
            let contentReady = false;
            for (let i = 0; i < 5; i++) {
              try {
                const pong: any = await chrome.tabs.sendMessage(tab.id!, { action: 'ping' });
                if (pong?.pong) {
                  contentReady = true;
                  break;
                }
              } catch (_e) {
                debug('[MessageHandler] Content script ping failed for appointment page, retrying...');
              }
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            if (!contentReady) {
              sendResponse({ success: false, error: 'Content script not ready on messenger page' });
              return;
            }

            // Send appointment action to content script
            const result: any = await chrome.tabs.sendMessage(tab.id!, {
              action: 'handleAppointment',
              response: apptResponse,
              courtesyMessage,
            });

            if (result?.success) {
              const statusMap: Record<string, string> = {
                accept: 'accepted',
                reject: 'rejected',
                alternative: 'alternative_requested',
              };
              await updateAppointmentStatus(conversationId, statusMap[apptResponse] || apptResponse);
              log(`[Appointments] ${apptResponse} for ${conversationId}, tab left open for user review`);
              sendResponse({ success: true, tabId: tab.id });
            } else {
              sendResponse({ success: false, error: result?.error || 'Failed to handle appointment' });
            }
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'generateDocuments') {
        (async () => {
          try {
            const { address, moveIn } = request;
            if (!address) {
              sendResponse({ success: false, error: 'No address provided' });
              return;
            }

            const aiStored: Record<string, any> = await chrome.storage.local.get([C.AI_SERVER_URL_KEY]);
            const serverUrl: string | undefined = aiStored[C.AI_SERVER_URL_KEY];
            if (!serverUrl) {
              sendResponse({ success: false, error: 'AI server URL not configured' });
              return;
            }

            // Load all document profile fields
            const docKeys = [
              C.PROFILE_NAME_KEY,
              C.PROFILE_BIRTH_DATE_KEY,
              C.PROFILE_MARITAL_STATUS_KEY,
              C.PROFILE_CURRENT_ADDRESS_KEY,
              C.PROFILE_EMAIL_KEY,
              C.PROFILE_OCCUPATION_KEY,
              C.PROFILE_NET_INCOME_KEY,
              C.PROFILE_EMPLOYER_KEY,
              C.PROFILE_EMPLOYED_SINCE_KEY,
              C.PROFILE_CURRENT_LANDLORD_KEY,
              C.PROFILE_LANDLORD_PHONE_KEY,
              C.PROFILE_LANDLORD_EMAIL_KEY,
              C.FORM_PHONE_KEY,
            ];
            const profile: Record<string, any> = await chrome.storage.local.get(docKeys);

            const nameRaw: string = profile[C.PROFILE_NAME_KEY] || '';
            // Convert "First Last" to "Last, First" for the form
            const nameParts = nameRaw.split(' ').filter(Boolean);
            const formName = nameParts.length >= 2 ? `${nameParts.slice(1).join(' ')}, ${nameParts[0]}` : nameRaw;

            // Convert YYYY-MM-DD (date input) to DD.MM.YYYY (German format)
            const formatDate = (isoDate: string | undefined): string => {
              if (!isoDate || !isoDate.includes('-')) return isoDate || '';
              const [y, m, d] = isoDate.split('-');
              return `${d}.${m}.${y}`;
            };

            // Convert plain number to German currency format "X.XXX,XX EUR"
            const formatEurAmount = (val: string | number | undefined): string => {
              if (!val) return '';
              const num = parseFloat(String(val));
              if (Number.isNaN(num)) return String(val);
              const parts = num.toFixed(2).split('.');
              const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
              return `${intPart},${parts[1]} EUR`;
            };

            // Today as signing date in DD.MM.YYYY
            const today = new Date();
            const signingDate = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;

            const body = {
              address,
              name: formName,
              moveIn: formatDate(moveIn),
              birthDate: formatDate(profile[C.PROFILE_BIRTH_DATE_KEY]),
              maritalStatus: profile[C.PROFILE_MARITAL_STATUS_KEY] || '',
              currentAddress: profile[C.PROFILE_CURRENT_ADDRESS_KEY] || '',
              phone: profile[C.FORM_PHONE_KEY] || '',
              email: profile[C.PROFILE_EMAIL_KEY] || '',
              profession: profile[C.PROFILE_OCCUPATION_KEY] || '',
              netIncome: formatEurAmount(profile[C.PROFILE_NET_INCOME_KEY]),
              employer: profile[C.PROFILE_EMPLOYER_KEY] || '',
              employedSince: formatDate(profile[C.PROFILE_EMPLOYED_SINCE_KEY]),
              currentLandlord: profile[C.PROFILE_CURRENT_LANDLORD_KEY] || '',
              landlordPhone: profile[C.PROFILE_LANDLORD_PHONE_KEY] || '',
              landlordEmail: profile[C.PROFILE_LANDLORD_EMAIL_KEY] || '',
              signingDate,
              signatureName: nameRaw,
            };

            const resp = await fetch(`${serverUrl}/documents/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            if (!resp.ok) {
              const err: any = await resp.json().catch(() => ({ error: resp.statusText }));
              sendResponse({ success: false, error: err.error || `Server error: ${resp.status}` });
              return;
            }

            // Download the PDF — convert to data URL since service workers lack URL.createObjectURL
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const dataUrl = `data:application/pdf;base64,${btoa(binary)}`;

            const street = address.split(',')[0].trim().replace(/\s+/g, '_');
            const filename = `Bewerbungsunterlagen_${nameParts[nameParts.length - 1] || 'Tenant'}_${street}.pdf`;

            await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });

            log(`[Documents] Generated and downloading: ${filename}`);
            sendResponse({ success: true });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'blacklistListing') {
        (async () => {
          try {
            const listingId = String(request.listingId || '')
              .toLowerCase()
              .trim();
            if (!listingId) {
              sendResponse({ success: false, error: 'No listing ID' });
              return;
            }
            const stored: Record<string, any> = await chrome.storage.local.get([C.BLACKLIST_KEY]);
            const blacklist: string[] = stored[C.BLACKLIST_KEY] || [];
            if (!blacklist.includes(listingId)) {
              blacklist.push(listingId);
              await chrome.storage.local.set({ [C.BLACKLIST_KEY]: blacklist });
            }
            sendResponse({ success: true });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'markConversationRead') {
        (async () => {
          try {
            const { conversationId } = request;
            const convStored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
            if (!convStored[C.CONVERSATIONS_KEY]) {
              sendResponse({ success: true });
              return;
            }

            const updated = convStored[C.CONVERSATIONS_KEY].map((c: ConversationEntry) => {
              if (c.conversationId === conversationId) {
                return { ...c, hasUnreadReply: false };
              }
              return c;
            });

            const totalUnread = updated.filter((c: ConversationEntry) => c.hasUnreadReply).length;
            await chrome.storage.local.set({
              [C.CONVERSATIONS_KEY]: updated,
              [C.CONV_UNREAD_COUNT_KEY]: totalUnread,
            });

            // Update badge
            if (totalUnread > 0) {
              chrome.action.setBadgeText({ text: String(totalUnread) });
            } else {
              chrome.action.setBadgeText({ text: '' });
            }

            sendResponse({ success: true });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'regenerateDraft') {
        (async () => {
          try {
            const { conversationId, userContext } = request;
            const aiConfig = await getAIConfig();
            const draftStored: Record<string, any> = await chrome.storage.local.get([C.CONVERSATIONS_KEY]);
            if (!draftStored[C.CONVERSATIONS_KEY]) {
              sendResponse({ success: false, error: 'No conversations found' });
              return;
            }

            // Check that we have a valid AI configuration
            if (!canUseDirect(aiConfig) && !canUseServer(aiConfig)) {
              sendResponse({ success: false, error: 'No valid AI configuration (need API key or server URL)' });
              return;
            }

            const conv = (draftStored[C.CONVERSATIONS_KEY] as ConversationEntry[]).find(
              (c) => c.conversationId === conversationId,
            );
            if (!conv) {
              sendResponse({ success: false, error: 'Conversation not found' });
              return;
            }

            await updateConversationDraft(conversationId, null, 'generating');
            // Notify popup of status change
            try {
              await chrome.runtime.sendMessage({ action: 'conversationUpdate' });
            } catch (_e) {
              debug('[MessageHandler] Could not notify popup of draft status change');
            }

            await generateDraftReply(conv, aiConfig.apiKey, userContext);
            sendResponse({ success: true });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'getManualReview') {
        (async () => {
          try {
            const stored = await chrome.storage.local.get([C.PENDING_MANUAL_REVIEW_KEY]);
            const review: ManualReviewData | null = stored[C.PENDING_MANUAL_REVIEW_KEY] || null;
            if (!review) {
              sendResponse({ success: true, review: null });
              return;
            }
            // Verify tab still exists
            try {
              await chrome.tabs.get(review.tabId);
            } catch {
              // Tab was closed — clear the review
              await chrome.storage.local.remove(C.PENDING_MANUAL_REVIEW_KEY);
              sendResponse({ success: true, review: null });
              return;
            }
            sendResponse({ success: true, review });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'refineManualMessage') {
        (async () => {
          try {
            const instructions = (request.instructions || '').trim();
            if (!instructions) {
              sendResponse({ success: false, error: 'Refinement instructions cannot be empty' });
              return;
            }
            const stored = await chrome.storage.local.get([C.PENDING_MANUAL_REVIEW_KEY]);
            const review: ManualReviewData | null = stored[C.PENDING_MANUAL_REVIEW_KEY] || null;
            if (!review) {
              sendResponse({ success: false, error: 'No pending manual review found' });
              return;
            }

            const aiConfig = await getAIConfig();
            if (!canUseDirect(aiConfig) && !canUseServer(aiConfig)) {
              sendResponse({ success: false, error: 'No valid AI configuration' });
              return;
            }

            const profile = await getProfile();
            const landlordInfo = {
              name: review.landlordName,
              title: review.landlordTitle,
              isTenantNetwork: review.isTenantNetwork,
              isPrivate: review.isPrivateLandlord,
            };
            const userContext = `CURRENT MESSAGE:\n${review.message}\n\nREFINEMENT INSTRUCTIONS:\n${instructions}`;

            // Load user profile from storage (same keys as initial message generation)
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

            // Build prompt using the same AI pipeline as initial message generation
            const { buildMessagePrompt } = await import('../shared/prompts');
            const systemPrompt = buildMessagePrompt(userProfile, landlordInfo, undefined, profile);

            let newMessage: string | null = null;

            if (canUseDirect(aiConfig) && aiConfig.apiKey) {
              const provider = getProvider(aiConfig);
              const result = await provider.generateText(aiConfig.apiKey, systemPrompt, userContext, {
                maxTokens: 2048,
              });
              newMessage = result.text.trim() || null;
              if (result.usage) {
                await trackTokenUsage(result.usage.promptTokens, result.usage.completionTokens);
              }
            } else if (canUseServer(aiConfig)) {
              const response = await fetch(`${aiConfig.serverUrl}/refine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  currentMessage: review.message,
                  instructions,
                  landlordInfo,
                  listingTitle: review.listingTitle,
                  apiKey: aiConfig.apiKey,
                  provider: aiConfig.provider,
                  profile,
                  userProfile,
                  isTenantNetwork: review.isTenantNetwork,
                  ...litellmPayload(aiConfig),
                }),
              });
              if (response.ok) {
                const result: any = await response.json();
                newMessage = result.message || null;
                if (result.usage) {
                  await trackTokenUsage(result.usage.promptTokens || 0, result.usage.completionTokens || 0);
                }
              }
            }

            if (!newMessage) {
              sendResponse({ success: false, error: 'AI failed to generate refined message' });
              return;
            }

            // Re-fill only the message textarea on the tab (no form fields)
            try {
              await chrome.tabs.get(review.tabId); // verify tab exists
              const fillResult: any = await chrome.tabs.sendMessage(review.tabId, {
                action: 'refillMessage',
                message: newMessage,
              });

              if (fillResult?.success) {
                // Update stored review with new message
                review.message = newMessage;
                await chrome.storage.local.set({ [C.PENDING_MANUAL_REVIEW_KEY]: review });
                sendResponse({ success: true, message: newMessage });
              } else {
                sendResponse({ success: false, error: fillResult?.error || 'Failed to refill form' });
              }
            } catch (e: any) {
              sendResponse({ success: false, error: `Tab error: ${e.message}` });
            }
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'dismissManualReview') {
        (async () => {
          try {
            // Clear the persistent notification if one exists
            const stored = await chrome.storage.local.get([C.PENDING_MANUAL_REVIEW_KEY]);
            const review: ManualReviewData | null = stored[C.PENDING_MANUAL_REVIEW_KEY] || null;
            if (review?.notificationId) {
              chrome.notifications.clear(review.notificationId);
            }
            await chrome.storage.local.remove(C.PENDING_MANUAL_REVIEW_KEY);
            sendResponse({ success: true });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message ?? 'Failed to dismiss' });
          }
        })();
        return true;

        // --- Saved snapshots handlers ---
      } else if (request.action === 'exportListingNow') {
        (async () => {
          try {
            const { listingId, url, details, landlord, imageUrls, format } = request;
            if (!listingId || !format) {
              sendResponse({ success: false, error: 'listingId and format required' });
              return;
            }
            // PDF skips the SW image fetch — the print page re-fetches them itself,
            // so a one-shot PDF export avoids buffering potentially huge blobs in
            // the service worker just to hand them to a tab.
            if (format === 'pdf') {
              const result = await runExportSnapshot({
                listingId,
                sourceUrl: url,
                details,
                landlord,
                images: [],
                savedAt: Date.now(),
                format,
                pdfSource: 'ephemeral',
                ephemeralImageUrls: imageUrls || [],
              });
              sendResponse(result);
              return;
            }
            const { fetchListingImages, splitFetchResults } = await import('./exporter');
            const fetched = await fetchListingImages(imageUrls || []);
            const { images } = splitFetchResults(imageUrls || [], fetched);
            const result = await runExportSnapshot({
              listingId,
              sourceUrl: url,
              details,
              landlord,
              images,
              savedAt: Date.now(),
              format,
            });
            sendResponse(result);
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'saveSnapshot') {
        (async () => {
          try {
            const { listingId, url } = request;
            if (!listingId || !url) {
              sendResponse({ success: false, error: 'listingId and url required' });
              return;
            }
            const result = await saveSnapshotById(listingId, url);
            sendResponse(result);
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'exportSnapshot') {
        (async () => {
          try {
            const { listingId, format } = request;
            if (!listingId || !format) {
              sendResponse({ success: false, error: 'listingId and format required' });
              return;
            }
            const result = await exportSavedSnapshot(listingId, format);
            sendResponse(result);
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'deleteSnapshot') {
        (async () => {
          try {
            const result = await deleteSavedSnapshot(request.listingId);
            sendResponse(result);
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      } else if (request.action === 'getSnapshotsIndex') {
        (async () => {
          try {
            const index = await getSnapshotsIndex();
            sendResponse({ success: true, index });
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      }

      return false;
    },
  );
}

export function registerNotificationHandler(): void {
  chrome.notifications.onClicked.addListener(async (notificationId: string) => {
    if (notificationId.startsWith('manual-review-')) {
      // Focus the listing tab — find the most recently created ImmoScout tab
      try {
        const tabs = await chrome.tabs.query({ url: 'https://www.immobilienscout24.de/expose/*' });
        if (tabs.length > 0) {
          const tab = tabs[tabs.length - 1];
          await chrome.tabs.update(tab.id!, { active: true });
          await chrome.windows.update(tab.windowId, { focused: true });
        }
      } catch (e) {
        error('Error focusing tab from notification:', e);
      }
      chrome.notifications.clear(notificationId);
    }
  });
}
