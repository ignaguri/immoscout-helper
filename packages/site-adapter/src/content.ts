// Content-realm message dispatcher. Owns the chrome.runtime.onMessage switch
// that maps background→content messages onto a SiteContentAdapter's methods.
// The per-site app's content/index.ts registers this, then runs its own
// site-specific page-lifecycle side-effects.

import { debug } from '@repo/shared/logger';
import type { ContentRequest, OverlayData, SiteContentAdapter } from './index';

/**
 * Register the content-script message listener for `adapter`. Unsupported
 * capability actions (captcha/conversation on a site that lacks them) reply
 * with `{ success: false, error: 'unsupported' }`.
 */
export function createContentDispatcher(adapter: SiteContentAdapter): void {
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
          // Optional human-engagement scroll before extracting; extract either way.
          // Defer the call into the chain so a synchronous throw becomes a rejection.
          Promise.resolve()
            .then(() => adapter.simulateHumanEngagement?.())
            .then(() => sendResponse({ listings: adapter.extractListings() }))
            .catch(() => sendResponse({ listings: adapter.extractListings() }));
          return true; // Keep channel open for async response

        case 'extractLandlordName':
          sendResponse(adapter.extractLandlordInfo());
          break;

        case 'extractListingDetails':
          sendResponse(adapter.extractListingDetails());
          break;

        case 'extractForArchive':
          sendResponse(adapter.extractForArchive());
          break;

        case 'detectListingType':
          sendResponse(adapter.detectListingType());
          break;

        case 'extractPaginationInfo':
          sendResponse(adapter.extractPaginationInfo());
          break;

        case 'detectCaptcha':
          if (!adapter.captcha) {
            sendResponse({ hasCaptcha: false, error: 'unsupported' });
            break;
          }
          adapter.captcha
            .detect()
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ hasCaptcha: false, error: (error as Error).message }));
          return true;

        case 'solveCaptcha':
          if (!adapter.captcha) {
            sendResponse({ success: false, error: 'unsupported' });
            break;
          }
          adapter.captcha
            .solveAndSubmit(request.text ?? '')
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
          return true;

        case 'sendMessage':
          adapter
            .sendContactMessage(request.message ?? '', request.formValues ?? {}, request.autoSend !== false)
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
          return true; // Keep channel open for async response

        case 'refillMessage':
          // Re-fill only the message field (no form fields, no submit). Used for refinement.
          adapter
            .refillMessage(request.message ?? '')
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
          return true;

        case 'fillConversationReply':
          if (!adapter.conversation) {
            sendResponse({ success: false, error: 'unsupported' });
            break;
          }
          adapter.conversation
            .fillReply(request.message ?? '')
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
          return true;

        case 'handleAppointment':
          if (!adapter.conversation) {
            sendResponse({ success: false, error: 'unsupported' });
            break;
          }
          adapter.conversation
            .handleAppointment(request.response, request.courtesyMessage)
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
          return true;

        case 'applyOverlay':
          // The applyOverlay message carries overlay fields not on ContentRequest.
          sendResponse(adapter.applyOverlay(request as unknown as OverlayData));
          break;

        case 'checkMessageSent':
          sendResponse(adapter.checkMessageSent());
          break;

        default:
          // Preserve the original no-response behavior for unknown actions; log to aid debugging.
          debug('[dispatcher] Unknown content action:', request.action);
          break;
      }

      return false;
    },
  );
}
