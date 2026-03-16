// CSS selectors and keyword constants used across content script modules

// --- Captcha selectors ---
export const CAPTCHA_IMAGE_SELECTORS = '.captcha-image-container img, img[src*="captcha"]';
export const CAPTCHA_HEADING_KEYWORDS = 'Sicherheitsabfrage';
export const CAPTCHA_INPUT_SELECTORS = 'input#userAnswer, input[data-testid="userAnswer"], input[name="captcha"]';

// --- Contact form selectors ---
export const TEXTAREA_SELECTORS = [
  'textarea[name="message"]',
  'textarea[id="message"]',
  'textarea[data-testid="message"]',
  'textarea[class*="TextArea"]',
  'form textarea',
  'textarea',
];

export const CONTACT_BUTTON_SELECTORS = [
  'button[data-testid="contact-button"]',
  'button[data-testid="tenant-network-express-interest-cta"]',
  'button[data-qa="sendButton"]:not([type="submit"])',
  'button[class*="Button_button-primary"]:not([type="submit"])',
];

// Selector for the "Interesse bekunden" CTA on tenant-recommendation listings
export const TENANT_NETWORK_CTA_SELECTOR = 'button[data-testid="tenant-network-express-interest-cta"]';

export const SUBMIT_BUTTON_SELECTORS = [
  'button[type="submit"][class*="Button_button-primary"]',
  'button[type="submit"]',
  'form button[type="submit"]',
];

// --- Button text keywords ---
export const CONTACT_BUTTON_KEYWORDS = [
  'nachricht schreiben',
  'nachricht senden',
  'kontaktieren',
  'anfrage senden',
  'interesse bekunden',
];

export const SUBMIT_BUTTON_KEYWORDS = [
  'abschicken',
  'senden',
  'absenden',
  'interesse bekunden',
  'bewerbung',
  'anfrage',
];

// --- Listing extraction selectors ---
export const LISTING_CARD_SELECTORS = '[data-obid]';
export const LISTING_FALLBACK_SELECTORS = 'a[data-exp-id]';
export const LISTING_LINK_SELECTOR = 'a[href*="/expose/"]';

// --- Landlord name selectors ---
export const LANDLORD_NAME_SELECTORS = [
  '.is24qa-offerer-name',
  '[data-qa="contactName"]',
  '.contact-box__name',
  '.contact-name',
  '.realtor-title',
  '[class*="contact"] [class*="name"]',
];

// --- Listing detail selectors ---
export const ADDRESS_SELECTORS = [
  '.address-block',
  '[data-qa="expose-address"]',
  '[data-qa="is24-expose-address"]',
  '.address-link',
];

// --- Tenant network selectors ---
export const TENANT_NETWORK_SELECTORS = [
  '.tenant-network-listing',
  '#is24-tenant-listing-description-section',
  '.newTenancyAvailability',
  '[class*="privateDetailsBox"]',
];

export const CONTACT_FORM_DETECT_SELECTORS =
  'button[data-testid="contact-button"], textarea[name="message"], form[data-testid="contact-form"]';

// --- Message sent / success selectors ---
export const MESSAGE_SENT_SELECTORS = '[class*="status-confirm"], [class*="StatusMessage_status-confirm"]';
export const MESSAGE_SENT_TEXT = 'Nachricht gesendet';
export const MESSAGE_SENT_TEXT_ALT = 'Nachricht wurde gesendet';

// --- Pagination selectors ---
export const PAGINATION_NAV_BUTTONS = 'nav[aria-label="pagination"] button[page]';
export const PAGINATION_LINKS = 'a[href*="pagenumber="]';

// --- Messenger selectors ---
export const REPLY_TEXTAREA_SELECTORS = [
  'textarea[data-testid="message-input"]',
  'textarea[name="message"]',
  'textarea[placeholder*="Nachricht"]',
  'textarea[placeholder*="nachricht"]',
  'textarea[placeholder*="message"]',
  '[contenteditable="true"]',
  'textarea',
];

export const APPOINTMENT_INVITATION_SELECTOR = '[data-testid^="invitation-msg-id-"]';
export const MESSAGES_SECTION_SELECTORS = '[data-testid="messages-section"], [data-testid="messages"]';
