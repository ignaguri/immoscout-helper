// Engine constants — defined in @repo/core-engine/constants; re-exported here so
// existing `C.*` references in app code keep resolving.
export {
  ACTIVITY_LOG_CAP,
  ACTIVITY_LOG_KEY,
  ALARM_NAME,
  CHECK_INTERVAL_KEY,
  DEFAULT_NOTIFICATION_PREFS,
  MIN_DELAY_KEY,
  MONITORING_STATE_KEY,
  NOTIFICATION_LABELS,
  NOTIFICATION_PREFS_KEY,
  type NotificationEvent,
  RATE_COUNT_RESET_TIME_KEY,
  RATE_LAST_MESSAGE_TIME_KEY,
  RATE_LIMIT_KEY,
  RATE_MESSAGE_COUNT_KEY,
  SEARCH_URL_KEY,
  SEARCH_URLS_KEY,
  STORAGE_KEY,
  UPDATE_AVAILABLE_KEY,
  UPDATE_CHECK_ALARM,
  UPDATE_CHECK_INTERVAL_HOURS,
} from '@repo/core-engine/constants';

// Storage keys
export const MESSAGE_TEMPLATE_KEY = 'messageTemplate' as const;

// Form field keys
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

// Stats keys
export const TOTAL_MESSAGES_SENT_KEY = 'totalMessagesSent' as const;
export const LAST_CHECK_TIME_KEY = 'lastCheckTime' as const;

// AI keys — defined in @repo/ai/constants; re-exported here so existing `C.AI_*`,
// C.LITELLM_DEFAULT_MODEL, and C.AI_MODEL_COOLDOWN_* references keep resolving.
export {
  AI_ABOUT_ME_KEY,
  AI_API_KEY_GEMINI_KEY,
  AI_API_KEY_OPENAI_KEY,
  AI_CUSTOM_MESSAGE_PROMPT_KEY,
  AI_CUSTOM_SCORING_PROMPT_KEY,
  AI_ENABLED_KEY,
  AI_LISTINGS_SCORED_KEY,
  AI_LISTINGS_SKIPPED_KEY,
  AI_LITELLM_BASE_URL_KEY,
  AI_LITELLM_CLIENT_ID_KEY,
  AI_LITELLM_CLIENT_SECRET_KEY,
  AI_LITELLM_MODEL_KEY,
  AI_LITELLM_TOKEN_URL_KEY,
  AI_MIN_SCORE_KEY,
  AI_MODE_KEY,
  AI_MODEL_COOLDOWN_BASE_MS,
  AI_MODEL_COOLDOWN_MAX_MS,
  AI_PROVIDER_KEY,
  AI_SERVER_URL_KEY,
  AI_USAGE_COMPLETION_TOKENS_KEY,
  AI_USAGE_PROMPT_TOKENS_KEY,
  LITELLM_DEFAULT_MODEL,
} from '@repo/ai/constants';

// Profile keys
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

// Document profile keys (for Selbstauskunft generation)
export const PROFILE_BIRTH_DATE_KEY = 'profileBirthDate' as const;
export const PROFILE_MARITAL_STATUS_KEY = 'profileMaritalStatus' as const;
export const PROFILE_CURRENT_ADDRESS_KEY = 'profileCurrentAddress' as const;
export const PROFILE_EMAIL_KEY = 'profileEmail' as const;
export const PROFILE_EMPLOYER_KEY = 'profileEmployer' as const;
export const PROFILE_EMPLOYED_SINCE_KEY = 'profileEmployedSince' as const;
export const PROFILE_NET_INCOME_KEY = 'profileNetIncome' as const;
export const PROFILE_CURRENT_LANDLORD_KEY = 'profileCurrentLandlord' as const;
export const PROFILE_LANDLORD_PHONE_KEY = 'profileLandlordPhone' as const;
export const PROFILE_LANDLORD_EMAIL_KEY = 'profileLandlordEmail' as const;

// Sync keys
export const SYNCED_CONTACTED_KEY = 'syncedContactedCount' as const;

// Landlord tracking
export const CONTACTED_LANDLORDS_KEY = 'contactedLandlords' as const;
export const DUPLICATE_LANDLORD_TIMEOUT_MS = 300000; // 5 minutes (popup buttons provide reliable interaction)
export const PENDING_DUPLICATE_DECISION_KEY = 'pendingDuplicateDecision' as const;

/** Generic placeholder names that ImmoScout24 shows instead of real landlord names (lowercased). */
export const GENERIC_LANDLORD_NAMES: ReadonlySet<string> = new Set([
  'privatangebot',
  'anbieter',
  'anbieter:in',
  'anbieter informationen',
  'kein name angegeben',
]);

/** Patterns matching generic landlord name formats (case-insensitive). */
export const GENERIC_LANDLORD_PATTERNS: readonly RegExp[] = [
  /^anbieter(?::in)?\s*\[.*\]$/i, // "Anbieter [Informationen]", "Anbieter:in [Details]"
  /\[informationen\]/i, // anything containing "[Informationen]"
];

// Queue keys
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

// Conversation keys
export const CONVERSATIONS_KEY = 'conversations' as const;
export const CONVERSATIONS_LAST_CHECK_KEY = 'convLastCheck' as const;
export const CONVERSATIONS_ALARM_NAME = 'checkConversations' as const;
export const CONVERSATIONS_CHECK_INTERVAL_KEY = 'convCheckInterval' as const;
export const CONV_UNREAD_COUNT_KEY = 'convUnreadCount' as const;
export const CONVERSATIONS_CAP = 200;

// Saved listing snapshots (conversation-bound local archive)
export const SAVED_SNAPSHOTS_KEY = 'savedSnapshots' as const;
export const SAVED_SNAPSHOTS_CAP = 100;
export const SAVED_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB safety cap per image
export const SAVED_IMAGE_CONCURRENCY = 4;
export const SAVED_SNAPSHOTS_IDB_NAME = 'savedSnapshots' as const;
export const SAVED_SNAPSHOTS_IDB_VERSION = 1;
export const SAVED_SNAPSHOTS_IDB_IMAGES_STORE = 'images' as const;
export const SAVED_SNAPSHOTS_IDB_FULLTEXT_STORE = 'fullText' as const;

export const ATTACHMENTS_IDB_NAME = 'documentAttachments' as const;
export const ATTACHMENTS_IDB_VERSION = 2;
// Split schema: metadata (filename/addedAt) is read for the list UI without
// pulling every PDF's bytes into memory; bytes live in a separate store, read
// only at generation time.
export const ATTACHMENTS_META_STORE = 'attachmentMeta' as const;
export const ATTACHMENTS_BLOBS_STORE = 'attachmentBlobs' as const;

// Timing constants (milliseconds)
export const HUMAN_DELAY_MIN = 1500;
export const HUMAN_DELAY_MAX = 4000;
export const TAB_LOAD_TIMEOUT = 15000;
export const CAPTCHA_WAIT_MS = 3000;
export const CAPTCHA_POLL_TIMEOUT_MS = 8000;
export const FORM_LOAD_WAIT_MS = 3000;
export const REACT_RENDER_WAIT_MS = 3000;
export const AI_ANALYSIS_TIMEOUT_MS = 30000;
export const CAPTCHA_SOLVE_TIMEOUT_MS = 15000;
export const CONTENT_SCRIPT_RETRY_MS = 1000;
export const RAW_TEXT_CAP = 8000;

// Retry / pagination limits
export const MAX_SEARCH_PAGES = 3;
export const MAX_CONVERSATION_PAGES = 2;
export const MAX_CAPTCHA_ATTEMPTS = 2;
export const MAX_CONTACT_RETRIES = 3;
export const MAX_CONVERSATION_SYNC = 2000;
export const TYPING_CHUNK_MIN = 20;
export const TYPING_CHUNK_MAX = 49;

// Popup UI state
export const SETTINGS_ACTIVE_SUBTAB_KEY = 'settingsActiveSubTab' as const;

// Update checker (UPDATE_CHECK_ALARM / UPDATE_CHECK_INTERVAL_HOURS / UPDATE_AVAILABLE_KEY
// live in @repo/core-engine/constants; GITHUB_REPO is now the descriptor's updateRepo)
export const UPDATE_DISMISSED_KEY = 'updateDismissedVersion' as const;

// Shared paths & URLs
export const ICON_PATH = 'icons/icon128.png';
export const MESSENGER_BASE_URL = 'https://www.immobilienscout24.de/messenger/messages/';

export function getMessengerUrl(conversationId: string): string {
  return `${MESSENGER_BASE_URL}${conversationId}?communicationType=CONVERSATION`;
}
