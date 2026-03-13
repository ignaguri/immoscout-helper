// Content script entry point — message listener dispatch
// All logic lives in the feature modules; this file only wires up the
// chrome.runtime.onMessage listener.

import type { CheckMessageSentResult, ContentRequest } from '../shared/types';
import { detectCaptcha, detectCaptchaElement, fillCaptchaAndSubmit } from './captcha';
import { sendMessageToLandlord } from './contact-form';
import { simulateHumanEngagement } from './dom-helpers';
import { detectListingType, extractLandlordName, extractListingDetails } from './listing-details';
import { extractListings, extractPaginationInfo } from './listings';
import { fillConversationReply, handleAppointment } from './messenger';
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

console.log('[IS24] Content script loaded');
