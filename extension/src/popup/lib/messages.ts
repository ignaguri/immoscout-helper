// Typed chrome.runtime.sendMessage wrappers
import type { AppointmentInfo, CaptureQueueResponse, ManualReviewData, PendingApprovalItem, QueueItem, QueueStatusResponse } from '../../shared/types';

export async function sendAction(action: string, data?: Record<string, unknown>): Promise<unknown> {
  return chrome.runtime.sendMessage({ action, ...data });
}

export async function getStatus(): Promise<{
  isMonitoring: boolean;
  messagesThisHour: number;
  totalMessagesSent: number;
  seenListingsCount: number;
  syncedContacted: number;
  aiScored: number;
  aiSkipped: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
  activitySent: number;
  activityFilled: number;
  activitySkipped: number;
  activityFailed: number;
}> {
  return chrome.runtime.sendMessage({ action: 'getStatus' });
}

export async function startMonitoring(): Promise<{ success: boolean; error?: string }> {
  return chrome.runtime.sendMessage({ action: 'startMonitoring' });
}

export async function stopMonitoring(): Promise<{ success: boolean }> {
  return chrome.runtime.sendMessage({ action: 'stopMonitoring' });
}

export async function clearSeenListings(): Promise<{ success: boolean; error?: string }> {
  return chrome.runtime.sendMessage({ action: 'clearSeenListings' });
}

export async function updateInterval(interval: number): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'updateInterval', interval });
}

export async function getQueueStatus(): Promise<QueueStatusResponse> {
  return chrome.runtime.sendMessage({ action: 'getQueueStatus' });
}

export async function captureQueueItems(
  listings: Pick<QueueItem, 'id' | 'url' | 'title'>[],
): Promise<CaptureQueueResponse> {
  return chrome.runtime.sendMessage({ action: 'captureQueueItems', listings });
}

export async function startQueueProcessing(): Promise<{ success: boolean; error?: string }> {
  return chrome.runtime.sendMessage({ action: 'startQueueProcessing' });
}

export async function stopQueueProcessing(): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'stopQueueProcessing' });
}

export async function checkRepliesNow(): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'checkRepliesNow' });
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'markConversationRead', conversationId });
}

export async function sendConversationReply(
  conversationId: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  return chrome.runtime.sendMessage({ action: 'sendConversationReply', conversationId, message });
}

export async function regenerateDraft(conversationId: string, userContext: string): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'regenerateDraft', conversationId, userContext });
}

export async function respondToAppointment(
  conversationId: string,
  response: string,
  userContext: string,
  appointment: AppointmentInfo,
): Promise<{ success: boolean; error?: string }> {
  return chrome.runtime.sendMessage({
    action: 'respondToAppointment',
    conversationId,
    response,
    userContext,
    appointment,
  });
}

export async function getPendingApprovalListings(): Promise<PendingApprovalItem[]> {
  const result: any = await chrome.runtime.sendMessage({ action: 'getPendingApprovalListings' });
  if (result && !result.success) throw new Error(result.error || 'Failed to load pending approvals');
  return result?.items || [];
}

export async function approvePendingListing(
  item: PendingApprovalItem,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  return chrome.runtime.sendMessage({ action: 'approvePendingListing', ...item });
}

export async function skipPendingListing(id: string): Promise<{ success: boolean; error?: string }> {
  return chrome.runtime.sendMessage({ action: 'skipPendingListing', id });
}

export async function sendDuplicateLandlordDecision(
  decisionId: string,
  decision: 'send' | 'skip',
): Promise<{ success: boolean }> {
  return chrome.runtime.sendMessage({ action: 'duplicateLandlordDecision', decisionId, decision });
}

export async function generateDocuments(
  conversationId: string,
  address: string,
  moveIn: string,
): Promise<{ success: boolean; error?: string }> {
  return chrome.runtime.sendMessage({
    action: 'generateDocuments',
    conversationId,
    address,
    moveIn,
  });
}

export async function getManualReview(): Promise<ManualReviewData | null> {
  const result: any = await chrome.runtime.sendMessage({ action: 'getManualReview' });
  return result?.review || null;
}

export async function refineManualMessage(
  instructions: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  return chrome.runtime.sendMessage({ action: 'refineManualMessage', instructions });
}

export async function dismissManualReview(): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'dismissManualReview' });
}
