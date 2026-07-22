// Draft SiteDescriptor seam (Phase 3). The background service worker (via
// @repo/core-engine's createEngine) is parameterized by a SiteDescriptor the
// per-site app constructs. Interfaces are a DRAFT shaped from IS24 until Phase 6.
// The content-realm half (SiteContentAdapter, createContentDispatcher via
// @repo/site-adapter/content, DOM toolkit via ./dom) is added in Phase 4.

import type { LandlordInfo, ListingDetails } from '@repo/shared';

/** Opt-in behaviors. `false` means the engine skips the corresponding branch. */
export interface SiteCapabilities {
  messenger: boolean; // in-platform conversation thread + sync API
  captcha: boolean;
  tenantRecommendations: boolean; // IS24-only
  comingSoon: boolean; // IS24-only
  duplicateLandlordDetection: boolean; // only meaningful with named private landlords
  documentGeneration: boolean; // Selbstauskunft (DE)
  requiresLogin: boolean; // OpenRent
}

/**
 * Site-specific in-platform messenger integration. Present only when
 * `capabilities.messenger` is true. The engine calls the core-loop methods;
 * conversation-thread methods (draft/appointment) are added in Phase 3 Task 3.5
 * when message-handler moves into the engine.
 */
export interface MessengerClient {
  syncContacted(): Promise<number>;
  checkListingAlreadyContacted(listingId: string): Promise<boolean>;
  checkForNewReplies(): Promise<void>;
}

/** Minimal in Phase 3; market-parameterized prompt builders are added in Phase 5. */
export interface MarketProfile {
  locale: string; // 'de-DE' | 'en-GB'
}

/** The object the engine holds. Constructed by the per-site app. */
export interface SiteDescriptor {
  id: string; // 'immoscout24' | 'openrent'
  // Optional until Phase 4's content-routing seam consumes them; the engine does
  // not reference them yet. IS24 supplies both.
  isListingUrl?(u: string): boolean;
  buildListingUrl?(id: string): string;
  // Used by the engine's pagination (listings.ts).
  buildSearchPageUrl(searchUrl: string, page: number): string;
  defaultSearchUrl: string;
  updateRepo: string; // GitHub repo for the update checker
  capabilities: SiteCapabilities;
  market: MarketProfile;
  messenger?: MessengerClient;
}

// ── Content realm ──
// Cross-realm content-script types (DOM query/action results + the message
// request shape). Moved here in Phase 4 so both the dispatcher (./content) and
// the background engine can reference them. Re-exported from the app's
// shared/types.ts so existing `../shared/types` call sites are unchanged.

/** A search-result listing card. */
export interface Listing {
  id: string;
  url: string;
  title: string;
  index: number;
}

/** Discriminated result of classifying a listing detail page. */
export interface ListingType {
  isTenantNetwork: boolean;
  hasContactForm: boolean;
  hasTenantCTA: boolean;
  type: 'tenant-recommendation' | 'tenant-network' | 'coming-soon' | 'standard';
}

/** Values filled into a site's contact/enquiry form. */
export interface FormValues {
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

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
}

/** Overlay state applied to search-result cards. */
export interface OverlayData {
  seenIds: string[];
  queuedIds: string[];
  blacklistedIds: string[];
}

export interface CaptchaDetectResult {
  hasCaptcha: boolean;
  imageBase64?: string | null;
  error?: string;
}

export interface CaptchaSubmitResult {
  success: boolean;
  messageSent?: boolean;
  error?: string;
}

export interface SendMessageResult {
  success: boolean;
  error?: string;
  messageSent?: string | boolean;
  manualMode?: boolean;
  captchaBlocked?: boolean;
  messageTooLong?: boolean;
  maxLength?: number | null;
  log: string[];
}

export interface FillReplyResult {
  success: boolean;
  error?: string;
  filled?: boolean;
  charsFilled?: number;
}

export interface HandleAppointmentResult {
  success: boolean;
  error?: string;
  buttonClicked?: string;
  messageFilled?: boolean;
}

export interface CheckMessageSentResult {
  messageSent: boolean;
  hasContactForm: boolean;
  hasCaptcha: boolean;
  pageTitle: string;
  url: string;
}

/** Payload the content script returns when archiving a listing. */
export interface ExtractForArchiveResult {
  listingId: string | null;
  url: string;
  details: ListingDetails;
  landlord: LandlordInfo;
  imageUrls: string[];
}

/** Message sent from background to the content script. */
export interface ContentRequest {
  action: string;
  message?: string;
  text?: string;
  formValues?: FormValues;
  autoSend?: boolean;
  response?: string;
  courtesyMessage?: string;
}

/**
 * The content-realm half of the seam. The per-site app implements this against
 * its DOM; `createContentDispatcher` (@repo/site-adapter/content) maps
 * chrome.runtime messages onto these methods. Optional members are `undefined`
 * when the site lacks that capability; the dispatcher replies "unsupported".
 */
export interface SiteContentAdapter {
  // search results page
  extractListings(): Listing[];
  extractPaginationInfo(): PaginationInfo;
  applyOverlay(data: OverlayData): { applied: number };
  // listing detail page
  detectListingType(): ListingType;
  extractLandlordInfo(): LandlordInfo;
  extractListingDetails(): ListingDetails;
  extractForArchive(): ExtractForArchiveResult;
  // contact
  sendContactMessage(message: string, formValues: FormValues, autoSend: boolean): Promise<SendMessageResult>;
  refillMessage(message: string): Promise<SendMessageResult>;
  checkMessageSent(): CheckMessageSentResult;
  // optional — search-page human-engagement scroll before extraction
  simulateHumanEngagement?(): Promise<void>;
  // optional capabilities — undefined ⇒ site does not have them
  captcha?: {
    detect(): Promise<CaptchaDetectResult>;
    solveAndSubmit(text: string): Promise<CaptchaSubmitResult>;
  };
  conversation?: {
    fillReply(message: string): Promise<FillReplyResult>;
    handleAppointment(response: string | undefined, courtesyMessage?: string): Promise<HandleAppointmentResult>;
  };
}
