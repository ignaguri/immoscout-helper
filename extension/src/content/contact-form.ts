// Contact form filling and message sending

import { log as logMsg } from '../shared/logger';
import type { FormValues, SendMessageResult } from '../shared/types';
import { detectCaptchaElement } from './captcha';
import {
  findButtonByKeywords,
  findByLabel,
  findElement,
  randomDelay,
  setInputValue,
  setReactValue,
  setSelectValue,
  sleep,
} from './dom-helpers';
import * as S from './selectors';

// --- Form field defaults ---

const DEFAULT_FORM_VALUES: Required<FormValues> = {
  adults: 1,
  children: 0,
  pets: 'Nein',
  smoker: 'Nein',
  income: 2000,
  householdSize: 'Einpersonenhaushalt',
  employmentType: 'Angestellte:r',
  incomeRange: '1.500 - 2.000',
  documents: 'Vorhanden',
  salutation: 'Frau',
  phone: '',
};

// --- Helpers ---

/**
 * Find the "Nachricht schreiben" / "Kontaktieren" contact button on a listing page.
 */
export function findContactButton(): Element | null {
  const btn = findElement(S.CONTACT_BUTTON_SELECTORS);
  if (btn) return btn;
  return findButtonByKeywords(S.CONTACT_BUTTON_KEYWORDS, { skipSubmit: true });
}

/**
 * Find the form submit button ("Abschicken", "Senden", etc.).
 */
export function findSubmitButton(): Element | null {
  const btn = findElement(S.SUBMIT_BUTTON_SELECTORS);
  if (btn) return btn;
  return findButtonByKeywords(S.SUBMIT_BUTTON_KEYWORDS, { selector: 'button' });
}

// --- Form filling ---

export async function fillFormFields(formValues: FormValues = {}): Promise<number> {
  const values: Required<FormValues> = { ...DEFAULT_FORM_VALUES, ...formValues };
  let filled = 0;

  // Number/text fields
  const textFields: Array<{ keywords: string[]; value: string | number }> = [
    { keywords: ['erwachsene', 'adults'], value: values.adults },
    { keywords: ['kinder', 'children'], value: values.children },
    { keywords: ['einkommen', 'income', 'gehalt'], value: values.income },
    { keywords: ['telefon', 'phone', 'handy'], value: values.phone },
  ];

  for (const field of textFields) {
    if (field.value === '' || field.value === undefined) continue;
    const input = findByLabel(field.keywords, 'input') as HTMLInputElement | null;
    if (input && setInputValue(input, field.value)) {
      filled++;
    }
    await sleep(randomDelay(50, 30));
  }

  // Select/dropdown fields
  const selectFields: Array<{ keywords: string[]; value: string }> = [
    { keywords: ['anrede'], value: values.salutation },
    { keywords: ['haushaltsgröße', 'haushaltsgroesse'], value: values.householdSize },
    { keywords: ['haustiere'], value: values.pets },
    { keywords: ['raucher', 'smoker', 'raucherin'], value: values.smoker },
    { keywords: ['beschäftigung', 'beschaeftigung', 'beruf'], value: values.employmentType },
    { keywords: ['einkommen', 'income'], value: values.incomeRange },
    { keywords: ['bewerbungsunterlagen', 'unterlagen'], value: values.documents },
  ];

  for (const field of selectFields) {
    // Try select dropdown
    const select = findByLabel(field.keywords, 'select') as HTMLSelectElement | null;
    if (select && setSelectValue(select, field.value)) {
      filled++;
      await sleep(randomDelay(50, 30));
      continue;
    }

    // Try radio buttons
    for (const keyword of field.keywords) {
      for (const label of document.querySelectorAll('label, span, div')) {
        if (!(label.textContent || '').toLowerCase().includes(keyword)) continue;

        const container = label.closest('div, fieldset, li') || label.parentElement;
        if (!container) continue;

        // Check for select in container
        const containerSelect = container.querySelector('select') as HTMLSelectElement | null;
        if (containerSelect && setSelectValue(containerSelect, field.value)) {
          filled++;
          break;
        }

        // Check for radio buttons
        const radio = Array.from(
          container.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>,
        ).find((r) => {
          const rLabel = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
          return (rLabel?.textContent || '').toLowerCase().includes(field.value.toLowerCase());
        });

        if (radio && !radio.checked) {
          radio.click();
          filled++;
          break;
        }
      }
    }
    await sleep(randomDelay(50, 30));
  }

  return filled;
}

// --- Message sending ---

export async function sendMessageToLandlord(
  message: string,
  formValues: FormValues = {},
  autoSend: boolean = true,
): Promise<SendMessageResult> {
  const log: string[] = [];
  const addLog = (msg: string): void => {
    log.push(msg);
    logMsg('[IS24]', msg);
    // Send real-time update to popup
    chrome.runtime.sendMessage({ action: 'progressUpdate', message: msg }).catch(() => {});
  };

  try {
    addLog(`📝 Starting to send message (${message.length} chars)`);
    await sleep(randomDelay(1500, 500));

    // Check if form is already visible
    let textarea = document.querySelector(
      'textarea[name="message"], textarea[id="message"], textarea[data-testid="message"]',
    ) as HTMLTextAreaElement | null;

    if (!textarea) {
      addLog('🔍 Looking for contact button...');

      let contactBtn: Element | null = null;

      // Retry up to 3 times — button may load dynamically
      for (let attempt = 0; attempt < 3 && !contactBtn; attempt++) {
        if (attempt > 0) {
          addLog(`⏳ Retrying button search (attempt ${attempt + 1})...`);
          await sleep(randomDelay(2000, 500));
        }

        contactBtn = findContactButton();
      }

      if (contactBtn) {
        addLog(`✅ Found contact button: "${(contactBtn.textContent || '').trim().substring(0, 40)}"`);
        (contactBtn as HTMLElement).click();
        await sleep(randomDelay(3000, 1000));
        addLog('⏳ Waiting for form to load...');
      } else {
        addLog('⚠️ No contact button found after 3 attempts');
      }
    } else {
      addLog('✅ Form already visible');
    }

    // Find textarea
    textarea = findElement(S.TEXTAREA_SELECTORS) as HTMLTextAreaElement | null;

    if (!textarea) {
      addLog('❌ ERROR: Message textarea not found!');
      return { success: false, error: 'Message textarea not found', log };
    }

    addLog('✅ Found message textarea');

    // Fill message
    textarea.focus();
    textarea.value = '';

    // Type message in chunks for React compatibility
    addLog('⌨️ Typing message...');
    const chunkSize = 20 + Math.floor(Math.random() * 30); // 20-49 chars per chunk
    for (let i = 0; i < message.length; i += chunkSize) {
      textarea.value += message.slice(i, i + chunkSize);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(randomDelay(50, 30));
    }

    // Ensure React state is updated
    setReactValue(textarea, message);

    addLog(`✅ Message filled (${textarea.value.length} chars)`);

    await sleep(randomDelay(500, 200));

    // Fill additional form fields
    addLog('📋 Filling form fields...');
    const fieldsFilled = await fillFormFields(formValues);
    addLog(`✅ Filled ${fieldsFilled} form fields`);

    await sleep(randomDelay(500, 200));

    // Find submit button (retry up to 3 times — tenant-network forms may load slowly)
    let submitBtn: Element | null = null;
    for (let attempt = 0; attempt < 3 && !submitBtn; attempt++) {
      if (attempt > 0) {
        addLog(`⏳ Retrying submit button search (attempt ${attempt + 1})...`);
        await sleep(randomDelay(1500, 500));
      }

      submitBtn = findSubmitButton();
    }

    if (!submitBtn) {
      addLog('❌ ERROR: Submit button not found after 3 attempts!');
      return { success: false, error: 'Submit button not found', log };
    }

    addLog(`✅ Found submit button: "${(submitBtn.textContent || '').trim().substring(0, 40)}"`);

    // If manual mode, don't click submit - just return success (form is filled)
    if (!autoSend) {
      addLog('📋 Form filled - manual mode, waiting for user to review and send');
      return { success: true, messageSent: message, manualMode: true, log };
    }

    if ((submitBtn as HTMLButtonElement).disabled) {
      addLog('⏳ Submit button disabled, waiting...');
      await sleep(1000);
      if ((submitBtn as HTMLButtonElement).disabled) {
        addLog('❌ ERROR: Submit button still disabled!');
        return { success: false, error: 'Submit button is disabled', log };
      }
    }

    // Submit form (single click only)
    addLog('🚀 Submitting form...');
    (submitBtn as HTMLElement).click();

    // Wait for confirmation (check for captcha and success indicators)
    addLog('⏳ Waiting for confirmation...');
    const startTime = Date.now();
    while (Date.now() - startTime < 8000) {
      await sleep(300);

      // Check for "message too long" error — the field-level error next to the textarea
      // HTML: <div class="font-error_...">Deine Nachricht ist zu lang.</div>
      const tooLongError = document.querySelector('[class*="font-error"]');
      if (tooLongError && (tooLongError.textContent || '').trim().includes('zu lang')) {
        addLog(`❌ Message too long: "${(tooLongError.textContent || '').trim()}"`);
        const textareaEl = document.querySelector('textarea[name="message"], textarea') as HTMLTextAreaElement | null;
        const maxLen = textareaEl?.maxLength && textareaEl.maxLength > 0 ? textareaEl.maxLength : null;
        return { success: false, error: 'Message too long', messageTooLong: true, maxLength: maxLen, log };
      }

      // Check for other validation errors (generic "fix errors above" banner)
      const statusError = document.querySelector('[class*="StatusMessage_status-error"], [class*="status-error"]');
      if (statusError) {
        const errorText = (statusError.textContent || '').trim().substring(0, 100);
        addLog(`❌ Validation error: "${errorText}"`);
        return { success: false, error: `Validation error: ${errorText}`, log };
      }

      // Check for CAPTCHA modal — means the message was NOT sent yet
      const { image: captchaImg, heading: captchaHeading } = detectCaptchaElement();
      if (captchaImg || captchaHeading) {
        addLog('🔒 CAPTCHA detected after submit — message not sent');
        return { success: false, error: 'Captcha appeared after submit', captchaBlocked: true, log };
      }

      const success = document.querySelector('[class*="success"], [class*="erfolg"]');
      if (success) {
        addLog('🎉 SUCCESS: Message sent!');
        return { success: true, messageSent: message, log };
      }

      const formGone = !document.querySelector('textarea[name="message"]');
      if (formGone) {
        // Form disappeared but no explicit success — wait a bit more to rule out captcha
        await sleep(500);
        const { image: captchaAfterImg, heading: captchaAfterHeading } = detectCaptchaElement();
        if (captchaAfterImg || captchaAfterHeading) {
          addLog('🔒 CAPTCHA detected after form disappeared — message not sent');
          return { success: false, error: 'Captcha appeared after submit', captchaBlocked: true, log };
        }
        addLog('🎉 SUCCESS: Message sent!');
        return { success: true, messageSent: message, log };
      }
    }

    // Timeout: check one last time for captcha before giving up
    const { image: captchaFinalImg, heading: captchaFinalHeading } = detectCaptchaElement();
    if (captchaFinalImg || captchaFinalHeading) {
      addLog('🔒 CAPTCHA still present — message not sent');
      return { success: false, error: 'Captcha appeared after submit', captchaBlocked: true, log };
    }

    addLog('⚠️ Could not confirm — treating as failed');
    return { success: false, error: 'Could not confirm message was sent', log };
  } catch (error) {
    addLog(`❌ ERROR: ${(error as Error).message}`);
    return { success: false, error: (error as Error).message, log };
  }
}

/** Re-fill only the message textarea (no form fields, no submit). Used for message refinement. */
export async function refillMessageOnly(message: string): Promise<SendMessageResult> {
  try {
    const textarea = findElement(S.TEXTAREA_SELECTORS) as HTMLTextAreaElement | null;
    if (!textarea) {
      return { success: false, error: 'Message textarea not found', log: [] };
    }
    textarea.focus();
    textarea.value = '';
    const chunkSize = 20 + Math.floor(Math.random() * 30);
    for (let i = 0; i < message.length; i += chunkSize) {
      textarea.value += message.slice(i, i + chunkSize);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(randomDelay(50, 30));
    }
    setReactValue(textarea, message);
    return { success: true, messageSent: message, log: [] };
  } catch (error) {
    return { success: false, error: (error as Error).message, log: [] };
  }
}
