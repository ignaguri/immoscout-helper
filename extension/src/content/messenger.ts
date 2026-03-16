// Conversation reply and appointment handling on the ImmoScout messenger page

import { log } from '../shared/logger';
import type { FillReplyResult, HandleAppointmentResult } from '../shared/types';
import { findElement, randomDelay, setReactValue, sleep } from './dom-helpers';
import * as S from './selectors';

export async function fillConversationReply(message: string): Promise<FillReplyResult> {
  if (!message) return { success: false, error: 'No message provided' };

  // Check we're on a messenger page
  if (!location.href.includes('/messenger/')) {
    return { success: false, error: 'Not on a messenger page' };
  }

  log('[IS24] Filling conversation reply...');

  let input: HTMLElement | null = null;
  // Retry a few times in case the page is still loading
  for (let attempt = 0; attempt < 5; attempt++) {
    input = findElement(S.REPLY_TEXTAREA_SELECTORS) as HTMLElement | null;
    if (input) break;
    await sleep(1000);
  }

  if (!input) {
    return { success: false, error: 'Reply input not found on messenger page' };
  }

  const isContentEditable = input.contentEditable === 'true' && input.tagName !== 'TEXTAREA';

  if (isContentEditable) {
    // For contenteditable divs
    input.focus();
    input.innerHTML = '';
    input.textContent = message;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // For textarea elements — use React-compatible value setter
    const textareaInput = input as HTMLTextAreaElement;
    textareaInput.focus();
    textareaInput.value = '';

    // Type in chunks for React compatibility
    const chunkSize = 20 + Math.floor(Math.random() * 30);
    for (let i = 0; i < message.length; i += chunkSize) {
      textareaInput.value += message.slice(i, i + chunkSize);
      textareaInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(randomDelay(30, 20));
    }

    // Ensure React state is updated via prototype setter
    setReactValue(textareaInput, message);
  }

  log(`[IS24] Reply filled (${message.length} chars). Tab left open for user to review and send.`);
  return { success: true, filled: true, charsFilled: message.length };
}

export async function handleAppointment(
  apptResponse: string | undefined,
  courtesyMessage: string | undefined,
): Promise<HandleAppointmentResult> {
  if (!location.href.includes('/messenger/')) {
    return { success: false, error: 'Not on a messenger page' };
  }

  // Ensure the conversation detail panel is open.
  // The messenger is a React SPA — navigating to /conversations/{id} loads the
  // list but the detail panel may not slide in automatically.
  const messagesSection = document.querySelector(S.MESSAGES_SECTION_SELECTORS);
  if (!messagesSection) {
    log('[IS24] Messages panel not visible, looking for conversation in sidebar list...');

    // Wait for the conversation list to render
    await sleep(2000);

    // Try to find and click the conversation item in the sidebar.
    const convId = location.pathname.split('/conversations/')[1]?.split('/')[0]?.split('?')[0];
    let clicked = false;
    if (convId) {
      // Look for links containing the conversation ID
      const convLinks = document.querySelectorAll(`a[href*="${convId}"], [data-testid*="conversation"]`);
      for (const link of convLinks) {
        if ((link as HTMLAnchorElement).href?.includes(convId) || link.closest(`a[href*="${convId}"]`)) {
          (link as HTMLElement).click();
          log(`[IS24] Clicked conversation link for ${convId}`);
          clicked = true;
          break;
        }
      }
    }

    // If no link found, try clicking the first/active conversation item
    if (!clicked) {
      const convItems = document.querySelectorAll(
        '[data-testid^="conversation-list-item"], [class*="conversationList"] a, [class*="ConversationList"] a',
      );
      for (const item of convItems) {
        if ((item as HTMLAnchorElement).href?.includes(convId || '') || item.querySelector(`[href*="${convId}"]`)) {
          (item as HTMLElement).click();
          log('[IS24] Clicked conversation list item');
          clicked = true;
          break;
        }
      }
    }

    // Wait for the detail panel to slide in
    if (clicked) {
      await sleep(3000);
    }
  }

  // Wait for the appointment invitation to render
  let invitationWrapper: Element | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    invitationWrapper = document.querySelector(S.APPOINTMENT_INVITATION_SELECTOR);
    if (invitationWrapper) break;
    log(`[IS24] Waiting for appointment invitation to render... (attempt ${attempt + 1})`);
    await sleep(1500);
  }
  if (!invitationWrapper) {
    return { success: false, error: 'No appointment invitation found on page' };
  }

  // Find the correct button based on response type
  const buttonTextMap: Record<string, string> = {
    accept: 'Zusagen',
    reject: 'Absagen',
    alternative: 'Alternativen Termin',
  };
  const targetText = buttonTextMap[apptResponse || ''];
  if (!targetText) {
    return { success: false, error: `Unknown response type: ${apptResponse}` };
  }

  const buttons = invitationWrapper.querySelectorAll('button');
  let targetBtn: HTMLButtonElement | null = null;
  for (const btn of buttons) {
    if ((btn.textContent || '').includes(targetText)) {
      targetBtn = btn;
      break;
    }
  }

  if (!targetBtn) {
    return { success: false, error: `Button "${targetText}" not found in appointment card` };
  }

  // Click the appointment action button
  targetBtn.click();
  log(`[IS24] Clicked appointment button: ${targetText}`);

  // Wait for UI to process the button click (may trigger modal, state change, etc.)
  await sleep(2000);

  // Fill the courtesy message if provided
  let filled = false;
  if (courtesyMessage) {
    const fillResult = await fillConversationReply(courtesyMessage);
    filled = fillResult?.success || false;
  }

  return {
    success: true,
    buttonClicked: targetText,
    messageFilled: filled,
  };
}
