// Storage keys
export const STORAGE_KEY = 'seenListings' as const;
export const SEARCH_URL_KEY = 'searchUrl' as const; // legacy single URL
export const SEARCH_URLS_KEY = 'searchUrls' as const; // multi-URL array
export const MESSAGE_TEMPLATE_KEY = 'messageTemplate' as const;
export const CHECK_INTERVAL_KEY = 'checkInterval' as const;
export const RATE_LIMIT_KEY = 'rateLimit' as const;
export const MIN_DELAY_KEY = 'minDelay' as const;
export const MONITORING_STATE_KEY = 'isMonitoring' as const;
export const ALARM_NAME = 'checkListings' as const;

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

// Rate limit persistence keys
export const RATE_LAST_MESSAGE_TIME_KEY = 'rateLastMessageTime' as const;
export const RATE_MESSAGE_COUNT_KEY = 'rateMessageCount' as const;
export const RATE_COUNT_RESET_TIME_KEY = 'rateCountResetTime' as const;

// AI keys
export const AI_MODE_KEY = 'aiMode' as const; // 'direct' | 'server'
export const AI_PROVIDER_KEY = 'aiProvider' as const; // 'gemini' | 'openai'
export const AI_ENABLED_KEY = 'aiEnabled' as const;
export const AI_API_KEY_GEMINI_KEY = 'aiApiKeyGemini' as const;
export const AI_API_KEY_OPENAI_KEY = 'aiApiKeyOpenai' as const;
export const AI_LITELLM_CLIENT_ID_KEY = 'aiLitellmClientId' as const;
export const AI_LITELLM_CLIENT_SECRET_KEY = 'aiLitellmClientSecret' as const;
export const AI_LITELLM_TOKEN_URL_KEY = 'aiLitellmTokenUrl' as const;
export const AI_LITELLM_BASE_URL_KEY = 'aiLitellmBaseUrl' as const;
export const AI_LITELLM_MODEL_KEY = 'aiLitellmModel' as const;
export { LITELLM_DEFAULT_MODEL } from '@repo/shared-types';
export const AI_SERVER_URL_KEY = 'aiServerUrl' as const;
export const AI_MIN_SCORE_KEY = 'aiMinScore' as const;
export const AI_ABOUT_ME_KEY = 'aiAboutMe' as const;
export const AI_LISTINGS_SCORED_KEY = 'aiListingsScored' as const;
export const AI_LISTINGS_SKIPPED_KEY = 'aiListingsSkipped' as const;
export const AI_USAGE_PROMPT_TOKENS_KEY = 'aiUsagePromptTokens' as const;
export const AI_USAGE_COMPLETION_TOKENS_KEY = 'aiUsageCompletionTokens' as const;

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

// Model rotation cooldown (exponential backoff: 1m → 2m → 4m → 8m → 15m cap)
export const AI_MODEL_COOLDOWN_BASE_MS = 60_000; // 1 minute
export const AI_MODEL_COOLDOWN_MAX_MS = 900_000; // 15 minutes cap

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

// Activity log
export const ACTIVITY_LOG_KEY = 'activityLog' as const;
export const ACTIVITY_LOG_CAP = 200;

// Conversation keys
export const CONVERSATIONS_KEY = 'conversations' as const;
export const CONVERSATIONS_LAST_CHECK_KEY = 'convLastCheck' as const;
export const CONVERSATIONS_ALARM_NAME = 'checkConversations' as const;
export const CONVERSATIONS_CHECK_INTERVAL_KEY = 'convCheckInterval' as const;
export const CONV_UNREAD_COUNT_KEY = 'convUnreadCount' as const;
export const CONVERSATIONS_CAP = 200;

// Caps
export const SEEN_LISTINGS_CAP = 5000;

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

// Update checker
export const GITHUB_REPO = 'ignaguri/immoscout-helper';
export const UPDATE_CHECK_ALARM = 'checkForUpdates' as const;
export const UPDATE_CHECK_INTERVAL_HOURS = 12;
export const UPDATE_AVAILABLE_KEY = 'updateAvailable' as const;
export const UPDATE_DISMISSED_KEY = 'updateDismissedVersion' as const;

// Shared paths & URLs
export const ICON_PATH = 'icons/icon128.png';
export const MESSENGER_BASE_URL = 'https://www.immobilienscout24.de/messenger/messages/';

export function getMessengerUrl(conversationId: string): string {
  return `${MESSENGER_BASE_URL}${conversationId}?communicationType=CONVERSATION`;
}
