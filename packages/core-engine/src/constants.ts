// Engine-generic constants (storage keys, caps, notification prefs) used by
// @repo/core-engine. Re-exported by the app's constants.ts for `C.*` back-compat.
// More engine constants migrate here as further background modules move (Phase 3).

// Search / monitoring
export const STORAGE_KEY = 'seenListings' as const;
export const SEARCH_URL_KEY = 'searchUrl' as const; // legacy single URL
export const SEARCH_URLS_KEY = 'searchUrls' as const; // multi-URL array
export const CHECK_INTERVAL_KEY = 'checkInterval' as const;
export const MONITORING_STATE_KEY = 'isMonitoring' as const;
export const RATE_LIMIT_KEY = 'rateLimit' as const;
export const MIN_DELAY_KEY = 'minDelay' as const;
export const ALARM_NAME = 'checkListings' as const;

// Update checker
export const UPDATE_CHECK_ALARM = 'checkForUpdates' as const;
export const UPDATE_CHECK_INTERVAL_HOURS = 12;
export const UPDATE_AVAILABLE_KEY = 'updateAvailable' as const;

// Rate limit persistence keys
export const RATE_LAST_MESSAGE_TIME_KEY = 'rateLastMessageTime' as const;
export const RATE_MESSAGE_COUNT_KEY = 'rateMessageCount' as const;
export const RATE_COUNT_RESET_TIME_KEY = 'rateCountResetTime' as const;

// Activity log
export const ACTIVITY_LOG_KEY = 'activityLog' as const;
export const ACTIVITY_LOG_CAP = 200;

// Notification preferences
export const NOTIFICATION_PREFS_KEY = 'notificationPrefs' as const;

export type NotificationEvent =
  | 'duplicateLandlord'
  | 'listingSkipped'
  | 'messageSent'
  | 'manualReview'
  | 'newReply'
  | 'queueComplete'
  | 'captchaFailed';

export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationEvent, boolean> = {
  duplicateLandlord: true,
  listingSkipped: true,
  messageSent: true,
  manualReview: true,
  newReply: true,
  queueComplete: true,
  captchaFailed: true,
};

export const NOTIFICATION_LABELS: Record<NotificationEvent, string> = {
  duplicateLandlord: 'Duplicate landlord warnings',
  listingSkipped: 'Skipped listings',
  messageSent: 'Messages sent',
  manualReview: 'Manual review alerts',
  newReply: 'New landlord replies',
  queueComplete: 'Queue completion',
  captchaFailed: 'Captcha failures',
};

// ── Listing-processing engine (moved from the app in Phase 3.4) ──
// Storage keys / caps / timings the orchestration cluster (queue, messaging,
// phases, ai, duplicates, pending-approval, listings) reads. Draft note: a few
// carry IS24-flavoured defaults elsewhere (German form values, icon asset), but
// the keys themselves are the engine's own storage schema.

// Message template
export const MESSAGE_TEMPLATE_KEY = 'messageTemplate' as const;

// Contact-form field keys
export const FORM_ADULTS_KEY = 'formAdults' as const;
export const FORM_CHILDREN_KEY = 'formChildren' as const;
export const FORM_PETS_KEY = 'formPets' as const;
export const FORM_SMOKER_KEY = 'formSmoker' as const;
export const FORM_INCOME_KEY = 'formIncome' as const;
export const FORM_HOUSEHOLD_SIZE_KEY = 'formHouseholdSize' as const;
export const FORM_EMPLOYMENT_KEY = 'formEmployment' as const;
export const FORM_INCOME_RANGE_KEY = 'formIncomeRange' as const;
export const FORM_DOCUMENTS_KEY = 'formDocuments' as const;
export const FORM_SALUTATION_KEY = 'formSalutation' as const;
export const FORM_PHONE_KEY = 'formPhone' as const;
export const AUTO_SEND_MODE_KEY = 'autoSendMode' as const;
export const PREMIUM_ACCOUNT_KEY = 'premiumAccount' as const;

// Applicant profile keys (used by AI scoring/message prompts)
export const PROFILE_NAME_KEY = 'profileName' as const;
export const PROFILE_AGE_KEY = 'profileAge' as const;
export const PROFILE_OCCUPATION_KEY = 'profileOccupation' as const;
export const PROFILE_LANGUAGES_KEY = 'profileLanguages' as const;
export const PROFILE_MOVING_REASON_KEY = 'profileMovingReason' as const;
export const PROFILE_CURRENT_NEIGHBORHOOD_KEY = 'profileCurrentNeighborhood' as const;
export const PROFILE_IDEAL_APARTMENT_KEY = 'profileIdealApartment' as const;
export const PROFILE_DEALBREAKERS_KEY = 'profileDealbreakers' as const;
export const PROFILE_STRENGTHS_KEY = 'profileStrengths' as const;
export const PROFILE_MAX_WARMMIETE_KEY = 'profileMaxWarmmiete' as const;

// Stats
export const TOTAL_MESSAGES_SENT_KEY = 'totalMessagesSent' as const;
export const LAST_CHECK_TIME_KEY = 'lastCheckTime' as const;

// Landlord tracking / duplicate detection
export const CONTACTED_LANDLORDS_KEY = 'contactedLandlords' as const;
export const DUPLICATE_LANDLORD_TIMEOUT_MS = 300000; // 5 minutes (popup buttons provide reliable interaction)
export const PENDING_DUPLICATE_DECISION_KEY = 'pendingDuplicateDecision' as const;

// Queue
export const QUEUE_KEY = 'manualQueue' as const;
export const QUEUE_PROCESSING_KEY = 'isQueueProcessing' as const;
export const QUEUE_MAX_RETRIES = 3;

// Pending approval (tenant-recommendation listings requiring user confirmation)
export const PENDING_APPROVAL_KEY = 'pendingApprovalListings' as const;

// Pending manual review (message filled in form, waiting for user to review/refine/send)
export const PENDING_MANUAL_REVIEW_KEY = 'pendingManualReview' as const;

// Coming-soon cooldown (premium-restricted listings retried after cooldown expires)
export const COMING_SOON_COOLDOWN_KEY = 'comingSoonCooldown' as const;
export const COMING_SOON_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Blacklist
export const BLACKLIST_KEY = 'blacklistedListings' as const;

// Timing
export const TAB_LOAD_TIMEOUT = 15000;
export const AI_ANALYSIS_TIMEOUT_MS = 30000;
export const CAPTCHA_SOLVE_TIMEOUT_MS = 15000;

// Notification icon asset (draft: IS24-branded asset path rides along in the engine)
export const ICON_PATH = 'icons/icon128.png';

// Conversation reply-check alarm. The messenger conversation storage keys stay in
// the app; only the lifecycle alarm name is owned by createEngine (Phase 3.5).
export const CONVERSATIONS_ALARM_NAME = 'checkConversations' as const;

// Sync stats (seeded by initializeStorage, read by the app messenger)
export const SYNCED_CONTACTED_KEY = 'syncedContactedCount' as const;

// AI stat/prompt/config storage keys live in @repo/ai/constants; re-exported here
// so the moved ai.ts + storage.ts reach them via `C.*` alongside engine constants.
export {
  AI_ABOUT_ME_KEY,
  AI_CUSTOM_MESSAGE_PROMPT_KEY,
  AI_CUSTOM_SCORING_PROMPT_KEY,
  AI_ENABLED_KEY,
  AI_LISTINGS_SCORED_KEY,
  AI_LISTINGS_SKIPPED_KEY,
  AI_MIN_SCORE_KEY,
  AI_SERVER_URL_KEY,
  AI_USAGE_COMPLETION_TOKENS_KEY,
  AI_USAGE_PROMPT_TOKENS_KEY,
} from '@repo/ai/constants';
