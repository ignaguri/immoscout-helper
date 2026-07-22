// IS24 implementation of the SiteContentAdapter seam. Thin wiring: delegates
// each method to the existing content-script feature modules. Registered by
// content/index.ts via createContentDispatcher.

import type { SiteContentAdapter } from '@repo/site-adapter';
import { simulateHumanEngagement } from '@repo/site-adapter/dom';
import type { CheckMessageSentResult } from '../shared/types';
import { detectCaptcha, detectCaptchaElement, fillCaptchaAndSubmit } from './captcha';
import { refillMessageOnly, sendMessageToLandlord } from './contact-form';
import { collectGalleryImageUrls, getListingIdFromUrl } from './gallery-images';
import { detectListingType, extractLandlordName, extractListingDetails } from './listing-details';
import { extractListings, extractPaginationInfo } from './listings';
import { fillConversationReply, handleAppointment } from './messenger';
import { applyOverlay } from './overlay';
import * as S from './selectors';

export const is24ContentAdapter: SiteContentAdapter = {
  extractListings,
  extractPaginationInfo,
  applyOverlay,
  detectListingType,
  extractLandlordInfo: () => extractLandlordName(),
  extractListingDetails,
  extractForArchive: () => ({
    listingId: getListingIdFromUrl(),
    url: location.href,
    details: extractListingDetails(),
    landlord: extractLandlordName(),
    imageUrls: collectGalleryImageUrls(),
  }),
  sendContactMessage: (message, formValues, autoSend) => sendMessageToLandlord(message, formValues, autoSend),
  refillMessage: (message) => refillMessageOnly(message),
  checkMessageSent: (): CheckMessageSentResult => {
    const successEl =
      document.querySelector(S.MESSAGE_SENT_SELECTORS) ||
      Array.from(document.querySelectorAll('div, span, h1, h2, h3, h4, p')).find(
        (el) =>
          (el.textContent || '').includes(S.MESSAGE_SENT_TEXT) ||
          (el.textContent || '').includes(S.MESSAGE_SENT_TEXT_ALT),
      );
    const contactForm = document.querySelector('textarea[name="message"], form[data-testid="contact-form"]');
    const { image: captchaImg, heading: captchaHeading } = detectCaptchaElement();
    return {
      messageSent: !!successEl,
      hasContactForm: !!contactForm,
      hasCaptcha: !!(captchaImg || captchaHeading),
      pageTitle: document.title,
      url: location.href,
    };
  },
  simulateHumanEngagement,
  captcha: {
    detect: detectCaptcha,
    solveAndSubmit: fillCaptchaAndSubmit,
  },
  conversation: {
    fillReply: fillConversationReply,
    handleAppointment,
  },
};
