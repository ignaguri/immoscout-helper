// Engine-generic constants (storage keys, caps, notification prefs) used by
// @repo/core-engine. Re-exported by the app's constants.ts for `C.*` back-compat.
// More engine constants migrate here as further background modules move (Phase 3).

// Search / monitoring
export const SEARCH_URL_KEY = 'searchUrl' as const; // legacy single URL
export const SEARCH_URLS_KEY = 'searchUrls' as const; // multi-URL array
export const RATE_LIMIT_KEY = 'rateLimit' as const;
export const MIN_DELAY_KEY = 'minDelay' as const;
export const ALARM_NAME = 'checkListings' as const;

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
