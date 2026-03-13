// Content script for ImmoScout24 Auto Reloader

// ============================================================================
// TYPES
// ============================================================================

interface Listing {
  id: string;
  url: string;
  title: string;
  index: number;
}

interface LandlordInfo {
  title: string | null;
  name: string | null;
  isPrivate: boolean;
}

interface ListingDetails {
  title?: string;
  address?: string;
  kaltmiete?: string;
  warmmiete?: string;
  nebenkosten?: string;
  kaution?: string;
  wohnflaeche?: string;
  zimmer?: string;
  etage?: string;
  bezugsfrei?: string;
  baujahr?: string;
  objekttyp?: string;
  heizungsart?: string;
  energieverbrauch?: string;
  energieeffizienzklasse?: string;
  aufzug?: string;
  garage?: string;
  haustiere?: string;
  heizkosten?: string;
  energietraeger?: string;
  objektzustand?: string;
  internet?: string;
  rauchen?: string;
  wbs?: string;
  description?: string;
  amenities?: string[];
  extraAttributes?: Record<string, string>;
  rawText?: string;
  [key: string]: unknown;
}

interface ListingType {
  isTenantNetwork: boolean;
  hasContactForm: boolean;
  type: 'tenant-network' | 'standard';
}

interface CaptchaDetectResult {
  hasCaptcha: boolean;
  imageBase64?: string | null;
  error?: string;
}

interface CaptchaSubmitResult {
  success: boolean;
  messageSent?: boolean;
  error?: string;
}

interface FormValues {
  adults?: number | string;
  children?: number | string;
  pets?: string;
  smoker?: string;
  income?: number | string;
  householdSize?: string;
  employmentType?: string;
  incomeRange?: string;
  documents?: string;
  salutation?: string;
  phone?: string;
}

interface SendMessageResult {
  success: boolean;
  error?: string;
  messageSent?: string | boolean;
  manualMode?: boolean;
  captchaBlocked?: boolean;
  messageTooLong?: boolean;
  maxLength?: number | null;
  log: string[];
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
}

interface FillReplyResult {
  success: boolean;
  error?: string;
  filled?: boolean;
  charsFilled?: number;
}

interface HandleAppointmentResult {
  success: boolean;
  error?: string;
  buttonClicked?: string;
  messageFilled?: boolean;
}

interface CheckMessageSentResult {
  messageSent: boolean;
  hasContactForm: boolean;
  hasCaptcha: boolean;
  pageTitle: string;
  url: string;
}

interface ContentRequest {
  action: string;
  message?: string;
  text?: string;
  formValues?: FormValues;
  autoSend?: boolean;
  response?: string;
  courtesyMessage?: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function randomDelay(baseMs: number, varianceMs: number = 0): number {
  const variance = varianceMs > 0 ? Math.floor(Math.random() * varianceMs * 2) - varianceMs : 0;
  return Math.max(100, baseMs + variance);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Set input value with React compatibility
function setInputValue(
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

// Set select dropdown value
function setSelectValue(select: HTMLSelectElement | null, value: string): boolean {
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

// Find element by selectors (returns first match)
function findElement(selectors: string[]): Element | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

// Find element by label text
function findByLabel(keywords: string[], elementType: string = 'input'): Element | null {
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

// ============================================================================
// HUMAN ENGAGEMENT SIMULATION
// ============================================================================

async function simulateHumanEngagement(): Promise<void> {
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

// ============================================================================
// LISTING EXTRACTION
// ============================================================================

function extractListings(): Listing[] {
  const listings: Listing[] = [];

  // Primary: listing cards with data-obid (IS24's current structure)
  let elements: NodeListOf<Element> | Element[] = document.querySelectorAll('[data-obid]');

  // Fallback: links with data-exp-id
  if (elements.length === 0) {
    elements = document.querySelectorAll('a[data-exp-id]');
  }

  // Last resort: expose links (dedup by container)
  if (elements.length === 0) {
    const links = Array.from(document.querySelectorAll('a[href*="/expose/"]')).filter((link) =>
      link.getAttribute('href')?.match(/\/expose\/\d+/),
    );
    const containers = new Map<Element, Element>();
    links.forEach((link) => {
      const container = link.closest('article, li, div[class*="result"], div[class*="listing"]') || link;
      if (!containers.has(container)) containers.set(container, link);
    });
    elements = Array.from(containers.keys());
  }

  elements.forEach((el, index) => {
    try {
      let exposeId =
        el.getAttribute('data-obid') ||
        el.getAttribute('data-exp-id') ||
        el.getAttribute('data-go-to-expose-id') ||
        el.getAttribute('data-id');

      // Skip non-numeric IDs (ads, touchpoints)
      if (exposeId && !/^\d+$/.test(exposeId)) return;

      const link =
        el.querySelector('a[href*="/expose/"]') ||
        el.closest('a[href*="/expose/"]') ||
        (el.tagName === 'A' && (el as HTMLAnchorElement).href?.includes('/expose/') ? el : null);

      let url = (link as HTMLAnchorElement | null)?.href?.startsWith('http')
        ? (link as HTMLAnchorElement).href
        : link
          ? `https://www.immobilienscout24.de${link.getAttribute('href')}`
          : null;

      if (!exposeId && url) {
        const match = url.match(/\/expose\/(\d+)/);
        exposeId = match?.[1] ?? null;
      }

      if (exposeId && !url) {
        url = `https://www.immobilienscout24.de/expose/${exposeId}`;
      }

      if (exposeId && url) {
        const title =
          el.querySelector('h2, h3, h4, [class*="title"], [data-testid="headline"]')?.textContent?.trim() || 'Unknown';
        listings.push({ id: exposeId.toLowerCase(), url, title, index });
      }
    } catch (_e) {
      /* skip invalid */
    }
  });

  listings.sort((a, b) => a.index - b.index);
  console.log(`[IS24] Found ${listings.length} listings`);
  return listings;
}

// ============================================================================
// LISTING TYPE DETECTION
// ============================================================================

function detectListingType(): ListingType {
  // Tenant-network listings (Nachvermietung): posted by the current tenant,
  // not the landlord. These have no contact form — only a tenant info box.
  const isTenantNetwork =
    !!document.querySelector('.tenant-network-listing') ||
    !!document.getElementById('is24-tenant-listing-description-section') ||
    !!document.querySelector('.newTenancyAvailability') ||
    !!document.querySelector('[class*="privateDetailsBox"]');

  // Check if a contact button or form exists
  const hasContactForm = !!document.querySelector(
    'button[data-testid="contact-button"], ' + 'textarea[name="message"], ' + 'form[data-testid="contact-form"]',
  );
  // Fallback: button with contact-related text
  const hasContactButton =
    hasContactForm ||
    !!Array.from(document.querySelectorAll('button, a')).find((btn) => {
      if ((btn as HTMLButtonElement).type === 'submit') return false;
      const text = (btn.textContent || '').toLowerCase();
      return (
        text.includes('nachricht schreiben') ||
        text.includes('kontaktieren') ||
        text.includes('anfrage senden') ||
        text.includes('interesse bekunden')
      );
    });

  return {
    isTenantNetwork,
    hasContactForm: hasContactButton,
    type: isTenantNetwork ? 'tenant-network' : 'standard',
  };
}

// ============================================================================
// LANDLORD NAME EXTRACTION
// ============================================================================

function extractLandlordName(): LandlordInfo {
  const selectors = [
    '.is24qa-offerer-name',
    '[data-qa="contactName"]',
    '.contact-box__name',
    '.contact-name',
    '.realtor-title',
    '[class*="contact"] [class*="name"]',
  ];

  let nameEl: Element | null = findElement(selectors);

  // Fallback: search contact sections
  if (!nameEl) {
    for (const section of document.querySelectorAll('[class*="contact"], .contact-box')) {
      for (const heading of section.querySelectorAll('h1, h2, h3, h4, strong')) {
        const text = (heading.textContent || '').trim();
        if (text.length > 2 && text.length < 50 && /^[A-ZÄÖÜ]/.test(text)) {
          nameEl = heading;
          break;
        }
      }
      if (nameEl) break;
    }
  }

  // Detect if listing is from a private person or commercial agent
  const isPrivate =
    !!document.querySelector('[class*="private-offer-logo"], [class*="PrivateOfferLogo"]') ||
    document.body.innerText.includes('von privat');

  if (!nameEl) return { title: null, name: null, isPrivate };

  const text = (nameEl.textContent || '').trim().split('\n')[0].split(',')[0].trim();

  const frauMatch = text.match(/^Frau\s+(.+)/i);
  if (frauMatch) return { title: 'Frau', name: frauMatch[1].trim(), isPrivate };

  const herrMatch = text.match(/^Herr\s+(.+)/i);
  if (herrMatch) return { title: 'Herr', name: herrMatch[1].trim(), isPrivate };

  return { title: null, name: text || null, isPrivate };
}

// ============================================================================
// LISTING DETAIL EXTRACTION
// ============================================================================

function extractListingDetails(): ListingDetails {
  const details: ListingDetails = {};

  // Title
  const titleEl = document.querySelector('#expose-title');
  if (titleEl) details.title = (titleEl.textContent || '').trim();

  // Address (get full address block, not just first span)
  const addressBlock = findElement([
    '.address-block',
    '[data-qa="expose-address"]',
    '[data-qa="is24-expose-address"]',
    '.address-link',
  ]);
  if (addressBlock) details.address = (addressBlock.textContent || '').trim().replace(/\s+/g, ' ');

  // Primary fields via is24qa CSS classes (try multiple variant suffixes)
  const primaryFields: Record<string, string[]> = {
    kaltmiete: ['kaltmiete'],
    warmmiete: ['gesamtmiete', 'warmmiete'],
    nebenkosten: ['nebenkosten'],
    kaution: ['kaution-o-genossenschaftsanteile', 'kaution'],
    wohnflaeche: ['wohnflaeche-ca', 'wohnflaeche'],
    zimmer: ['zimmer', 'zi'],
    etage: ['etage'],
    bezugsfrei: ['bezugsfrei-ab', 'bezugsfrei'],
    baujahr: ['baujahr'],
    objekttyp: ['typ'],
    heizungsart: ['heizungsart'],
    energieverbrauch: ['endenergiebedarf', 'wesentlicher-energieverbrauch'],
    energieeffizienzklasse: ['energieeffizienzklasse'],
    aufzug: ['personenaufzug'],
    garage: ['garage-stellplatz'],
    haustiere: ['haustiere'],
    heizkosten: ['heizkosten'],
    energietraeger: ['wesentliche-energietraeger'],
    objektzustand: ['objektzustand'],
  };

  const matchedKeys = new Set<string>();
  for (const [field, cssKeys] of Object.entries(primaryFields)) {
    for (const cssKey of cssKeys) {
      const el = document.querySelector(`dd.is24qa-${cssKey}`);
      if (el) {
        // Energy efficiency class contains an img with alt text (e.g. "D")
        const img = el.querySelector('img');
        details[field] = img ? (img as HTMLImageElement).alt : (el.textContent || '').trim();
        matchedKeys.add(cssKey);
        break;
      }
    }
  }

  // Main criteria fallback (the big numbers at the top of the page)
  if (!details.kaltmiete) {
    const el = document.querySelector('.is24qa-kaltmiete-main');
    if (el) details.kaltmiete = (el.textContent || '').trim();
  }
  if (!details.warmmiete) {
    const el = document.querySelector('.is24qa-warmmiete-main');
    if (el) details.warmmiete = (el.textContent || '').trim();
  }
  if (!details.zimmer) {
    const el = document.querySelector('.is24qa-zi-main');
    if (el) details.zimmer = (el.textContent || '').trim();
  }
  if (!details.wohnflaeche) {
    const el = document.querySelector('.is24qa-flaeche-main');
    if (el) details.wohnflaeche = (el.textContent || '').trim();
  }

  // Boolean criteria (Balkon, Keller, Einbauküche, etc.) — spans, not dd elements
  document.querySelectorAll('.criteriagroup.boolean-listing span[class*="is24qa-"]').forEach((span) => {
    const text = (span.textContent || '').trim();
    if (text) {
      const cls = Array.from(span.classList).find((c) => c.startsWith('is24qa-'));
      if (cls) matchedKeys.add(cls.replace('is24qa-', '').replace('-label', ''));
    }
  });

  // Internet speed from media availability widget
  if (!details.internet) {
    const container = document.getElementById('expose-media-availability-container');
    if (container) {
      const speedText = Array.from(container.querySelectorAll('span')).find((s) =>
        /\d+\s*MBit/i.test(s.textContent || ''),
      );
      if (speedText) details.internet = (speedText.textContent || '').trim();
    }
  }

  // Extra attributes: collect any other is24qa-* dd elements not already matched
  const extraAttrs: Record<string, string> = {};
  document.querySelectorAll('dd[class*="is24qa-"]').forEach((dd) => {
    const classes = Array.from(dd.classList);
    const qaClass = classes.find((c) => c.startsWith('is24qa-'));
    if (qaClass) {
      const key = qaClass.replace('is24qa-', '');
      if (!matchedKeys.has(key)) {
        const img = dd.querySelector('img');
        extraAttrs[key] = img ? (img as HTMLImageElement).alt : (dd.textContent || '').trim();
      }
    }
  });
  if (Object.keys(extraAttrs).length > 0) details.extraAttributes = extraAttrs;

  // Collect ALL dt/dd pairs as extra attributes (catches any structured data)
  const allDtDd: Record<string, string> = {};
  document.querySelectorAll('dl').forEach((dl) => {
    const dts = dl.querySelectorAll('dt');
    dts.forEach((dt) => {
      const label = (dt.textContent || '').trim();
      const dd = dt.nextElementSibling;
      if (dd?.tagName === 'DD' && label && label.length < 60) {
        const img = dd.querySelector('img');
        const value = img ? (img as HTMLImageElement).alt : (dd.textContent || '').trim();
        if (value && value.length < 200) {
          allDtDd[label] = value;
        }
      }
    });
  });
  if (Object.keys(allDtDd).length > 0) {
    details.extraAttributes = { ...allDtDd, ...(details.extraAttributes || {}) };
  }

  // Description sections
  const descSections: string[] = [];
  const sectionSelectors = [
    '.is24qa-objektbeschreibung',
    '.is24qa-ausstattung',
    '.is24qa-lage',
    '.is24qa-sonstiges',
    '.is24qa-freitext',
    '[data-qa="objektbeschreibung"]',
    '[data-qa="ausstattung"]',
    '[data-qa="lage"]',
  ];
  for (const sel of sectionSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.textContent || '').trim();
      if (text.length > 10) descSections.push(text);
    }
  }
  if (descSections.length > 0) details.description = descSections.join('\n\n');

  // Amenities: boolean criteria (spans) + list items
  const amenities: string[] = [];
  document.querySelectorAll('.criteriagroup.boolean-listing span[class*="is24qa-"]').forEach((span) => {
    const text = (span.textContent || '').trim();
    if (text && text.length < 100) amenities.push(text);
  });
  document.querySelectorAll('.is24qa-ausstattung li, .criteriagroup li').forEach((li) => {
    const text = (li.textContent || '').trim();
    if (text && text.length < 100) amenities.push(text);
  });
  if (amenities.length > 0) details.amenities = amenities;

  // Pet/smoking restrictions via body text (only if not already extracted)
  const bodyText = document.body.innerText;
  if (!details.haustiere) {
    const petMatch = bodyText.match(/haustiere[:\s]*(erlaubt|nicht erlaubt|nach absprache|ja|nein)/i);
    if (petMatch) details.haustiere = petMatch[0].trim();
  }

  const smokeMatch = bodyText.match(/rauch(en|er|verbot)[:\s]*(erlaubt|nicht erlaubt|ja|nein)?/i);
  if (smokeMatch) details.rauchen = smokeMatch[0].trim();

  // WBS detection (Wohnberechtigungsschein requirement)
  const wbsMatch = bodyText.match(/wohnberechtigungsschein|wbs[- ]?(erforderlich|nötig|notwendig|schein)/i);
  if (wbsMatch) details.wbs = 'Erforderlich';

  // Raw text fallback (capped at 8000 chars)
  details.rawText = bodyText.substring(0, 8000);

  console.log('[IS24] Extracted listing details:', Object.keys(details).join(', '));
  return details;
}

// ============================================================================
// CAPTCHA HANDLING
// ============================================================================

async function detectCaptcha(): Promise<CaptchaDetectResult> {
  // Look for captcha modal
  const captchaImg = document.querySelector('.captcha-image-container img, img[src*="captcha"]');
  const captchaHeading = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span')).find((el) =>
    (el.textContent || '').includes('Sicherheitsabfrage'),
  );

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
    console.error('[IS24] Error converting captcha image:', e);
    return { hasCaptcha: true, imageBase64: null, error: (e as Error).message };
  }
}

async function fillCaptchaAndSubmit(text: string): Promise<CaptchaSubmitResult> {
  if (!text) return { success: false, error: 'No captcha text provided' };

  try {
    // Find captcha input
    const captchaInput = document.querySelector(
      'input#userAnswer, input[data-testid="userAnswer"], input[name="captcha"]',
    ) as HTMLInputElement | null;
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

    console.log(
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

      // Check if message was sent (captcha solved → original form submitted)
      const messageSent =
        document.querySelector('[class*="status-confirm"], [class*="StatusMessage_status-confirm"]') ||
        Array.from(document.querySelectorAll('div, span, h4')).find((el) =>
          (el.textContent || '').includes('Nachricht gesendet'),
        );
      if (messageSent) {
        console.log('[IS24] Captcha solved — message sent successfully');
        return { success: true, messageSent: true };
      }

      // Check if captcha disappeared (modal closed)
      const stillVisible =
        document.querySelector('.captcha-image-container img, img[src*="captcha"]') ||
        Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span')).find((el) =>
          (el.textContent || '').includes('Sicherheitsabfrage'),
        );
      if (!stillVisible) {
        return { success: true };
      }
    }

    return { success: false, error: 'Captcha modal still visible after submission' };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ============================================================================
// FORM FIELD FILLING
// ============================================================================

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

async function fillFormFields(formValues: FormValues = {}): Promise<number> {
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

// ============================================================================
// MESSAGE SENDING
// ============================================================================

async function sendMessageToLandlord(
  message: string,
  formValues: FormValues = {},
  autoSend: boolean = true,
): Promise<SendMessageResult> {
  const log: string[] = [];
  const addLog = (msg: string): void => {
    log.push(msg);
    console.log('[IS24]', msg);
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

        // Click contact button to open form
        const contactSelectors = [
          'button[data-testid="contact-button"]',
          'button[data-qa="sendButton"]:not([type="submit"])',
          'button[class*="Button_button-primary"]:not([type="submit"])',
        ];

        contactBtn = findElement(contactSelectors);

        // Fallback: find by text (standard + tenant-network listings)
        if (!contactBtn) {
          contactBtn =
            Array.from(document.querySelectorAll('button, a')).find((btn) => {
              if ((btn as HTMLButtonElement).type === 'submit') return false;
              const text = (btn.textContent || '').toLowerCase();
              return (
                text.includes('nachricht schreiben') ||
                text.includes('nachricht senden') ||
                text.includes('kontaktieren') ||
                text.includes('anfrage senden') ||
                text.includes('interesse bekunden')
              );
            }) || null;
        }
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
    const textareaSelectors = [
      'textarea[name="message"]',
      'textarea[id="message"]',
      'textarea[data-testid="message"]',
      'textarea[class*="TextArea"]',
      'form textarea',
      'textarea',
    ];

    textarea = findElement(textareaSelectors) as HTMLTextAreaElement | null;

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
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(textarea, message);
    } catch (_e) {
      /* ignore */
    }

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

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

      const submitSelectors = [
        'button[type="submit"][class*="Button_button-primary"]',
        'button[type="submit"]',
        'form button[type="submit"]',
      ];

      submitBtn = findElement(submitSelectors);

      // Fallback: find by text (standard + tenant-network forms)
      if (!submitBtn) {
        submitBtn =
          Array.from(document.querySelectorAll('button')).find((btn) => {
            const text = (btn.textContent || '').toLowerCase();
            return (
              text.includes('abschicken') ||
              text.includes('senden') ||
              text.includes('absenden') ||
              text.includes('interesse bekunden') ||
              text.includes('bewerbung') ||
              text.includes('anfrage')
            );
          }) || null;
      }
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
      const captchaVisible =
        document.querySelector('.captcha-image-container img, img[src*="captcha"]') ||
        Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span')).find((el) =>
          (el.textContent || '').includes('Sicherheitsabfrage'),
        );
      if (captchaVisible) {
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
        const captchaAfter =
          document.querySelector('.captcha-image-container img, img[src*="captcha"]') ||
          Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span')).find((el) =>
            (el.textContent || '').includes('Sicherheitsabfrage'),
          );
        if (captchaAfter) {
          addLog('🔒 CAPTCHA detected after form disappeared — message not sent');
          return { success: false, error: 'Captcha appeared after submit', captchaBlocked: true, log };
        }
        addLog('🎉 SUCCESS: Message sent!');
        return { success: true, messageSent: message, log };
      }
    }

    // Timeout: check one last time for captcha before giving up
    const captchaFinal =
      document.querySelector('.captcha-image-container img, img[src*="captcha"]') ||
      Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span')).find((el) =>
        (el.textContent || '').includes('Sicherheitsabfrage'),
      );
    if (captchaFinal) {
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

// ============================================================================
// PAGINATION DETECTION
// ============================================================================

function extractPaginationInfo(): PaginationInfo {
  // Primary: IS24 pagination nav with page buttons
  const pageButtons = document.querySelectorAll('nav[aria-label="pagination"] button[page]');
  if (pageButtons.length > 0) {
    let maxPage = 1;
    let currentPage = 1;
    pageButtons.forEach((btn) => {
      const page = parseInt(btn.getAttribute('page') || '0', 10);
      if (page > maxPage) maxPage = page;
      if (btn.getAttribute('aria-current') === 'true') currentPage = page;
    });
    return { currentPage, totalPages: maxPage };
  }

  // Fallback: pagination links with pagenumber in URL
  const pageLinks = document.querySelectorAll('a[href*="pagenumber="]');
  if (pageLinks.length > 0) {
    let maxPage = 1;
    pageLinks.forEach((link) => {
      const match = (link as HTMLAnchorElement).href?.match(/pagenumber=(\d+)/);
      const page = parseInt(match?.[1] || '0', 10);
      if (page > maxPage) maxPage = page;
    });
    return { currentPage: 1, totalPages: maxPage };
  }

  // Fallback: next button existence
  const nextBtn = document.querySelector('button[aria-label*="nächste"], a[aria-label*="next"]');
  return { currentPage: 1, totalPages: nextBtn ? 2 : 1 };
}

// ============================================================================
// CONVERSATION REPLY
// ============================================================================

async function fillConversationReply(message: string): Promise<FillReplyResult> {
  if (!message) return { success: false, error: 'No message provided' };

  // Check we're on a messenger page
  if (!location.href.includes('/messenger/')) {
    return { success: false, error: 'Not on a messenger page' };
  }

  console.log('[IS24] Filling conversation reply...');

  // Try multiple selectors for the reply input
  const textareaSelectors = [
    'textarea[data-testid="message-input"]',
    'textarea[name="message"]',
    'textarea[placeholder*="Nachricht"]',
    'textarea[placeholder*="nachricht"]',
    'textarea[placeholder*="message"]',
    '[contenteditable="true"]',
    'textarea',
  ];

  let input: HTMLElement | null = null;
  // Retry a few times in case the page is still loading
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const selector of textareaSelectors) {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        input = el;
        break;
      }
    }
    if (input) break;
    await new Promise((r) => setTimeout(r, 1000));
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
      await new Promise((r) => setTimeout(r, 30 + Math.floor(Math.random() * 40)));
    }

    // Ensure React state is updated via prototype setter
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(textareaInput, message);
    } catch (_e) {
      /* ignore */
    }

    textareaInput.dispatchEvent(new Event('input', { bubbles: true }));
    textareaInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  console.log(`[IS24] Reply filled (${message.length} chars). Tab left open for user to review and send.`);
  return { success: true, filled: true, charsFilled: message.length };
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

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
        (async () => {
          try {
            if (!location.href.includes('/messenger/')) {
              sendResponse({ success: false, error: 'Not on a messenger page' });
              return;
            }

            const { response: apptResponse, courtesyMessage } = request;

            // Ensure the conversation detail panel is open.
            // The messenger is a React SPA — navigating to /conversations/{id} loads the
            // list but the detail panel may not slide in automatically. We need to check
            // for the messages section and, if missing, click the conversation in the list.
            const messagesSection = document.querySelector(
              '[data-testid="messages-section"], [data-testid="messages"]',
            );
            if (!messagesSection) {
              console.log('[IS24] Messages panel not visible, looking for conversation in sidebar list...');

              // Wait for the conversation list to render
              await new Promise((resolve) => setTimeout(resolve, 2000));

              // Try to find and click the conversation item in the sidebar.
              // The conversation ID is in the URL — find a matching link or list item.
              const convId = location.pathname.split('/conversations/')[1]?.split('/')[0]?.split('?')[0];
              let clicked = false;
              if (convId) {
                // Look for links containing the conversation ID
                const convLinks = document.querySelectorAll(`a[href*="${convId}"], [data-testid*="conversation"]`);
                for (const link of convLinks) {
                  if ((link as HTMLAnchorElement).href?.includes(convId) || link.closest(`a[href*="${convId}"]`)) {
                    (link as HTMLElement).click();
                    console.log(`[IS24] Clicked conversation link for ${convId}`);
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
                  if (
                    (item as HTMLAnchorElement).href?.includes(convId || '') ||
                    item.querySelector(`[href*="${convId}"]`)
                  ) {
                    (item as HTMLElement).click();
                    console.log('[IS24] Clicked conversation list item');
                    clicked = true;
                    break;
                  }
                }
              }

              // Wait for the detail panel to slide in
              if (clicked) {
                await new Promise((resolve) => setTimeout(resolve, 3000));
              }
            }

            // Wait for the appointment invitation to render
            let invitationWrapper: Element | null = null;
            for (let attempt = 0; attempt < 10; attempt++) {
              invitationWrapper = document.querySelector('[data-testid^="invitation-msg-id-"]');
              if (invitationWrapper) break;
              console.log(`[IS24] Waiting for appointment invitation to render... (attempt ${attempt + 1})`);
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
            if (!invitationWrapper) {
              sendResponse({ success: false, error: 'No appointment invitation found on page' });
              return;
            }

            // Find the correct button based on response type
            const buttonTextMap: Record<string, string> = {
              accept: 'Zusagen',
              reject: 'Absagen',
              alternative: 'Alternativen Termin',
            };
            const targetText = buttonTextMap[apptResponse || ''];
            if (!targetText) {
              sendResponse({ success: false, error: `Unknown response type: ${apptResponse}` });
              return;
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
              sendResponse({ success: false, error: `Button "${targetText}" not found in appointment card` });
              return;
            }

            // Click the appointment action button
            targetBtn.click();
            console.log(`[IS24] Clicked appointment button: ${targetText}`);

            // Wait for UI to process the button click (may trigger modal, state change, etc.)
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Fill the courtesy message if provided
            let filled = false;
            if (courtesyMessage) {
              const fillResult = await fillConversationReply(courtesyMessage);
              filled = fillResult?.success || false;
            }

            sendResponse({
              success: true,
              buttonClicked: targetText,
              messageFilled: filled,
            } as HandleAppointmentResult);
          } catch (error) {
            sendResponse({ success: false, error: (error as Error).message });
          }
        })();
        return true;

      case 'checkMessageSent':
        // Check if the current page shows a "message sent" confirmation
        {
          const successEl =
            document.querySelector('[class*="status-confirm"], [class*="StatusMessage_status-confirm"]') ||
            Array.from(document.querySelectorAll('div, span, h1, h2, h3, h4, p')).find(
              (el) =>
                (el.textContent || '').includes('Nachricht gesendet') ||
                (el.textContent || '').includes('Nachricht wurde gesendet'),
            );
          const contactForm = document.querySelector('textarea[name="message"], form[data-testid="contact-form"]');
          const captchaEl =
            document.querySelector('.captcha-image-container img, img[src*="captcha"]') ||
            Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span')).find((el) =>
              (el.textContent || '').includes('Sicherheitsabfrage'),
            );
          sendResponse({
            messageSent: !!successEl,
            hasContactForm: !!contactForm,
            hasCaptcha: !!captchaEl,
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
