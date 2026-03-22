// Content script entry point — message listener dispatch
// All logic lives in the feature modules; this file only wires up the
// chrome.runtime.onMessage listener.

import { BLACKLIST_KEY, QUEUE_KEY, STORAGE_KEY } from '../shared/constants';
import { debug, log } from '../shared/logger';
import type { CheckMessageSentResult, ContentRequest } from '../shared/types';
import { detectCaptcha, detectCaptchaElement, fillCaptchaAndSubmit } from './captcha';
import { refillMessageOnly, sendMessageToLandlord } from './contact-form';
import { simulateHumanEngagement } from './dom-helpers';
import { detectListingType, extractLandlordName, extractListingDetails } from './listing-details';
import { extractListings, extractPaginationInfo } from './listings';
import { fillConversationReply, handleAppointment } from './messenger';
import { applyOverlay } from './overlay';
import * as S from './selectors';

chrome.runtime.onMessage.addListener(
  (
    request: ContentRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean | undefined => {
    switch (request.action) {
      case 'ping':
        sendResponse({ pong: true, ready: true });
        break;

      case 'extractListings':
        simulateHumanEngagement()
          .then(() => sendResponse({ listings: extractListings() }))
          .catch(() => sendResponse({ listings: extractListings() }));
        return true; // Keep channel open for async response

      case 'extractLandlordName':
        sendResponse(extractLandlordName());
        break;

      case 'extractListingDetails':
        sendResponse(extractListingDetails());
        break;

      case 'detectListingType':
        sendResponse(detectListingType());
        break;

      case 'extractPaginationInfo':
        sendResponse(extractPaginationInfo());
        break;

      case 'detectCaptcha':
        detectCaptcha()
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ hasCaptcha: false, error: (error as Error).message }));
        return true;

      case 'solveCaptcha':
        fillCaptchaAndSubmit(request.text!)
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
        return true;

      case 'sendMessage':
        sendMessageToLandlord(request.message!, request.formValues || {}, request.autoSend !== false)
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
        return true; // Keep channel open for async response

      case 'refillMessage':
        // Re-fill only the message textarea (no form fields, no submit). Used for refinement.
        refillMessageOnly(request.message!)
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
        return true;

      case 'fillConversationReply':
        // Fill reply textarea on ImmoScout messenger conversation page
        fillConversationReply(request.message!)
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
        return true;

      case 'handleAppointment':
        // Click appointment button and fill courtesy message on messenger page
        handleAppointment(request.response, request.courtesyMessage)
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
        return true;

      case 'applyOverlay':
        sendResponse(applyOverlay(request as any));
        break;

      case 'checkMessageSent':
        // Check if the current page shows a "message sent" confirmation
        {
          const successEl =
            document.querySelector(S.MESSAGE_SENT_SELECTORS) ||
            Array.from(document.querySelectorAll('div, span, h1, h2, h3, h4, p')).find(
              (el) =>
                (el.textContent || '').includes(S.MESSAGE_SENT_TEXT) ||
                (el.textContent || '').includes(S.MESSAGE_SENT_TEXT_ALT),
            );
          const contactForm = document.querySelector('textarea[name="message"], form[data-testid="contact-form"]');
          const { image: captchaImg, heading: captchaHeading } = detectCaptchaElement();
          sendResponse({
            messageSent: !!successEl,
            hasContactForm: !!contactForm,
            hasCaptcha: !!(captchaImg || captchaHeading),
            pageTitle: document.title,
            url: location.href,
          } as CheckMessageSentResult);
        }
        break;
    }

    return false;
  },
);

log('[IS24] Content script loaded');

// Auto-apply overlay on search results pages
if (location.pathname.startsWith('/Suche/') || location.href.includes('searchType=')) {
  function refreshOverlay() {
    chrome.storage.local
      .get([STORAGE_KEY, QUEUE_KEY, BLACKLIST_KEY])
      .then((stored) => {
        const seenIds: string[] = stored[STORAGE_KEY] || [];
        const queuedIds: string[] = (stored[QUEUE_KEY] || []).map((item: any) => String(item.id));
        const blacklistedIds: string[] = stored[BLACKLIST_KEY] || [];
        applyOverlay({ seenIds, queuedIds, blacklistedIds });
      })
      .catch((e) => debug('[IS24] Overlay auto-apply failed:', e));
  }

  // Initial apply
  refreshOverlay();

  // Re-apply when new listings are dynamically loaded (infinite scroll, pagination)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refreshOverlay, 300);
  });
  const target = document.querySelector('#resultListItems, [data-testid="result-list"]') || document.body;
  observer.observe(target, { childList: true, subtree: true });
}
