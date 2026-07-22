// Draft SiteDescriptor seam (Phase 3). The background service worker (via
// @repo/core-engine's createEngine) is parameterized by a SiteDescriptor the
// per-site app constructs. Interfaces are a DRAFT shaped from IS24 until Phase 6.
// The content-realm half (SiteContentAdapter, createContentDispatcher, ./dom)
// is added in Phase 4.

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
