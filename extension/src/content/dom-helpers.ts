// DOM utility functions shared across content script modules

/**
 * Generate a random delay value (with optional variance).
 */
export function randomDelay(baseMs: number, varianceMs: number = 0): number {
  const variance = varianceMs > 0 ? Math.floor(Math.random() * varianceMs * 2) - varianceMs : 0;
  return Math.max(100, baseMs + variance);
}

/**
 * Sleep for `ms` milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Set an input/textarea value with React compatibility (prototype value setter).
 * Dispatches input, change, and blur events.
 */
export function setInputValue(
  input: HTMLInputElement | HTMLTextAreaElement | null,
  value: string | number | undefined | null,
): boolean {
  if (!input || value === undefined || value === null) return false;

  try {
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = String(value);
  } catch (_e) {
    input.value = String(value);
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

/**
 * Ensure React state is updated via the prototype value setter for a textarea.
 * This is used after chunked typing to set the final value atomically.
 */
export function setReactValue(textarea: HTMLTextAreaElement, value: string): void {
  try {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, value);
  } catch (_e) {
    /* ignore */
  }

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Set a select dropdown value (matches by value or text content).
 */
export function setSelectValue(select: HTMLSelectElement | null, value: string): boolean {
  if (!select || !value) return false;

  const option = Array.from(select.options || []).find(
    (opt) =>
      opt.value.toLowerCase() === value.toLowerCase() ||
      (opt.textContent || '').toLowerCase().includes(value.toLowerCase()),
  );

  if (option) {
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

/**
 * Find the first element matching any of the given CSS selectors.
 */
export function findElement(selectors: string[]): Element | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/**
 * Find an element by scanning label text and attribute names for keywords.
 */
export function findByLabel(keywords: string[], elementType: string = 'input'): Element | null {
  for (const keyword of keywords) {
    // By attribute
    const byAttr = document.querySelector(
      `${elementType}[name*="${keyword}" i], ${elementType}[id*="${keyword}" i], ${elementType}[data-testid*="${keyword}" i]`,
    );
    if (byAttr) return byAttr;

    // By label
    for (const label of document.querySelectorAll('label')) {
      if ((label.textContent || '').toLowerCase().includes(keyword)) {
        const container = label.closest('div, fieldset, li') || label.parentElement;
        const el = container?.querySelector(elementType) || document.getElementById(label.getAttribute('for') || '');
        if (el) return el;
      }
    }
  }
  return null;
}

/**
 * Find a button (or anchor) whose text content includes one of the given keywords.
 * Optionally skip submit buttons.
 */
export function findButtonByKeywords(
  keywords: string[],
  options: { selector?: string; skipSubmit?: boolean } = {},
): Element | null {
  const { selector = 'button, a', skipSubmit = false } = options;
  return (
    Array.from(document.querySelectorAll(selector)).find((btn) => {
      if (skipSubmit && (btn as HTMLButtonElement).type === 'submit') return false;
      const text = (btn.textContent || '').toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    }) || null
  );
}

/**
 * Simulate a human scrolling through the page (3-4 scroll steps).
 */
export async function simulateHumanEngagement(): Promise<void> {
  const totalHeight = document.body.scrollHeight;
  const steps = 3 + Math.floor(Math.random() * 2); // 3-4 steps
  for (let i = 1; i <= steps; i++) {
    window.scrollTo({ top: (totalHeight * i) / (steps + 1), behavior: 'smooth' });
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400)); // 300-700ms per step
  }
  // Scroll back to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
}
