// Captcha detection and solving

import { error, log } from '../shared/logger';
import type { CaptchaDetectResult, CaptchaSubmitResult } from '../shared/types';
import { setInputValue, sleep } from './dom-helpers';
import * as S from './selectors';

/**
 * Detect whether a captcha element (image or heading) is currently visible on the page.
 * Returns the captcha image element if found, or null.
 * This is the single source of truth for "is a captcha visible?" — used by
 * detectCaptcha(), fillCaptchaAndSubmit(), sendMessageToLandlord(), and checkMessageSent.
 */
export function detectCaptchaElement(): { image: Element | null; heading: Element | null } {
  const image = document.querySelector(S.CAPTCHA_IMAGE_SELECTORS);
  const heading =
    Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span')).find((el) =>
      (el.textContent || '').includes(S.CAPTCHA_HEADING_KEYWORDS),
    ) || null;
  return { image, heading };
}

/**
 * Check if a captcha is visible and, if so, extract its image as base64.
 */
export async function detectCaptcha(): Promise<CaptchaDetectResult> {
  const { image: captchaImg, heading: captchaHeading } = detectCaptchaElement();

  if (!captchaImg && !captchaHeading) {
    return { hasCaptcha: false };
  }

  // Find the captcha image source
  const imgEl = (captchaImg ||
    document.querySelector('img[src*="captcha"], img[src*="getimage"]')) as HTMLImageElement | null;
  if (!imgEl || !imgEl.src) {
    return { hasCaptcha: true, imageBase64: null, error: 'Captcha detected but image not found' };
  }

  // Wait for image to load if needed
  if (!imgEl.complete || !imgEl.naturalWidth) {
    await new Promise<void>((resolve) => {
      imgEl.addEventListener('load', () => resolve(), { once: true });
      imgEl.addEventListener('error', () => resolve(), { once: true });
      setTimeout(resolve, 3000); // max 3s wait
    });
  }

  // Validate image has non-zero dimensions
  const width = imgEl.naturalWidth || imgEl.width;
  const height = imgEl.naturalHeight || imgEl.height;
  if (!width || !height) {
    return { hasCaptcha: true, imageBase64: null, error: `Captcha image has no dimensions (${width}x${height})` };
  }

  // Convert image to base64 via canvas
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imgEl, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    // Validate the data URL is actually a proper image (not "data:,")
    if (!dataUrl.startsWith('data:image/')) {
      return { hasCaptcha: true, imageBase64: null, error: 'Canvas produced invalid data URL' };
    }
    return { hasCaptcha: true, imageBase64: dataUrl };
  } catch (e) {
    error('[IS24] Error converting captcha image:', e);
    return { hasCaptcha: true, imageBase64: null, error: (e as Error).message };
  }
}

export async function fillCaptchaAndSubmit(text: string): Promise<CaptchaSubmitResult> {
  if (!text) return { success: false, error: 'No captcha text provided' };

  try {
    // Find captcha input
    const captchaInput = document.querySelector(S.CAPTCHA_INPUT_SELECTORS) as HTMLInputElement | null;
    if (!captchaInput) {
      return { success: false, error: 'Captcha input field not found' };
    }

    // Fill the captcha answer
    setInputValue(captchaInput, text);
    await sleep(300);

    // Find and click submit — MUST be scoped to the captcha container.
    // Generic `form button[type="submit"]` would match the contact form or
    // the PLZ moving-company widget on the same page before the captcha button.
    let submitBtn: HTMLButtonElement | null = document.querySelector('button[data-testid="captcha-submit"]');

    if (!submitBtn) {
      // Walk up from the captcha input to its containing form/modal and find a button there
      const captchaForm =
        captchaInput.closest('form') || captchaInput.closest('[role="dialog"], [class*="modal"], [class*="captcha"]');
      if (captchaForm) {
        submitBtn = captchaForm.querySelector('button[type="submit"], button');
      }
    }

    if (!submitBtn) {
      // Last resort: walk up parent chain from the input
      let parent = captchaInput.parentElement;
      while (parent && parent !== document.body) {
        const btn = parent.querySelector('button[type="submit"], button') as HTMLButtonElement | null;
        if (btn) {
          submitBtn = btn;
          break;
        }
        parent = parent.parentElement;
      }
    }

    if (!submitBtn) {
      return { success: false, error: 'Captcha submit button not found' };
    }

    log(
      '[IS24] Clicking captcha submit:',
      submitBtn.textContent?.trim(),
      '| testid:',
      submitBtn.getAttribute('data-testid'),
    );
    submitBtn.click();

    // Wait for captcha to resolve (up to 8s)
    const startTime = Date.now();
    while (Date.now() - startTime < 8000) {
      await sleep(500);

      // Check if message was sent (captcha solved -> original form submitted)
      const messageSent =
        document.querySelector(S.MESSAGE_SENT_SELECTORS) ||
        Array.from(document.querySelectorAll('div, span, h4')).find((el) =>
          (el.textContent || '').includes(S.MESSAGE_SENT_TEXT),
        );
      if (messageSent) {
        log('[IS24] Captcha solved — message sent successfully');
        return { success: true, messageSent: true };
      }

      // Check if captcha disappeared (modal closed)
      const { image, heading } = detectCaptchaElement();
      if (!image && !heading) {
        return { success: true };
      }
    }

    return { success: false, error: 'Captcha modal still visible after submission' };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
