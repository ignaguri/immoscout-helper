// Shared constants and utilities for ImmoScout24 Apartment Messenger

// Storage keys
const STORAGE_KEY = 'seenListings';
const SEARCH_URL_KEY = 'searchUrl';
const MESSAGE_TEMPLATE_KEY = 'messageTemplate';
const CHECK_INTERVAL_KEY = 'checkInterval';
const RATE_LIMIT_KEY = 'rateLimit';
const MIN_DELAY_KEY = 'minDelay';
const MONITORING_STATE_KEY = 'isMonitoring';
const ALARM_NAME = 'checkListings';

// Form field keys
const FORM_ADULTS_KEY = 'formAdults';
const FORM_CHILDREN_KEY = 'formChildren';
const FORM_PETS_KEY = 'formPets';
const FORM_SMOKER_KEY = 'formSmoker';
const FORM_INCOME_KEY = 'formIncome';
const FORM_HOUSEHOLD_SIZE_KEY = 'formHouseholdSize';
const FORM_EMPLOYMENT_KEY = 'formEmployment';
const FORM_INCOME_RANGE_KEY = 'formIncomeRange';
const FORM_DOCUMENTS_KEY = 'formDocuments';
const FORM_SALUTATION_KEY = 'formSalutation';
const FORM_PHONE_KEY = 'formPhone';
const AUTO_SEND_MODE_KEY = 'autoSendMode';

// Stats keys
const TOTAL_MESSAGES_SENT_KEY = 'totalMessagesSent';
const LAST_CHECK_TIME_KEY = 'lastCheckTime';

// Rate limit persistence keys
const RATE_LAST_MESSAGE_TIME_KEY = 'rateLastMessageTime';
const RATE_MESSAGE_COUNT_KEY = 'rateMessageCount';
const RATE_COUNT_RESET_TIME_KEY = 'rateCountResetTime';

// AI keys
const AI_ENABLED_KEY = 'aiEnabled';
const AI_API_KEY_KEY = 'aiApiKey';
const AI_SERVER_URL_KEY = 'aiServerUrl';
const AI_MIN_SCORE_KEY = 'aiMinScore';
const AI_ABOUT_ME_KEY = 'aiAboutMe';
const AI_LISTINGS_SCORED_KEY = 'aiListingsScored';
const AI_LISTINGS_SKIPPED_KEY = 'aiListingsSkipped';
const AI_USAGE_PROMPT_TOKENS_KEY = 'aiUsagePromptTokens';
const AI_USAGE_COMPLETION_TOKENS_KEY = 'aiUsageCompletionTokens';

// Profile keys
const PROFILE_NAME_KEY = 'profileName';
const PROFILE_AGE_KEY = 'profileAge';
const PROFILE_OCCUPATION_KEY = 'profileOccupation';
const PROFILE_LANGUAGES_KEY = 'profileLanguages';
const PROFILE_MOVING_REASON_KEY = 'profileMovingReason';
const PROFILE_CURRENT_NEIGHBORHOOD_KEY = 'profileCurrentNeighborhood';
const PROFILE_IDEAL_APARTMENT_KEY = 'profileIdealApartment';
const PROFILE_DEALBREAKERS_KEY = 'profileDealbreakers';
const PROFILE_STRENGTHS_KEY = 'profileStrengths';
const PROFILE_MAX_WARMMIETE_KEY = 'profileMaxWarmmiete';

// Sync keys
const SYNCED_CONTACTED_KEY = 'syncedContactedCount';

// Queue keys
const QUEUE_KEY = 'manualQueue';
const QUEUE_PROCESSING_KEY = 'isQueueProcessing';
const QUEUE_MAX_RETRIES = 3;

// Activity log
const ACTIVITY_LOG_KEY = 'activityLog';
const ACTIVITY_LOG_CAP = 200;

// Conversation keys
const CONVERSATIONS_KEY = 'conversations';
const CONVERSATIONS_LAST_CHECK_KEY = 'convLastCheck';
const CONVERSATIONS_ALARM_NAME = 'checkConversations';
const CONVERSATIONS_CHECK_INTERVAL_KEY = 'convCheckInterval';
const CONV_UNREAD_COUNT_KEY = 'convUnreadCount';
const CONVERSATIONS_CAP = 100;

// Caps
const SEEN_LISTINGS_CAP = 5000;

// Generate personalized message with landlord greeting
function generatePersonalizedMessage(template, landlordTitle, landlordName, isTenantNetwork = false) {
  let message = template || '';

  const hasValidTitle = landlordTitle === 'Frau' || landlordTitle === 'Herr';

  if (message.includes('{name}')) {
    let nameReplacement;
    if (isTenantNetwork && landlordName) {
      nameReplacement = landlordName;
    } else if (hasValidTitle && landlordName) {
      nameReplacement = `${landlordTitle} ${landlordName}`;
    } else {
      nameReplacement = 'Damen und Herren';
    }
    message = message.replace(/{name}/g, nameReplacement);
  }

  if (!template.includes('{name}')) {
    let greeting;
    if (isTenantNetwork && landlordName) {
      greeting = `Hallo ${landlordName},`;
    } else if (landlordTitle === 'Frau' && landlordName) {
      greeting = `Sehr geehrte Frau ${landlordName},`;
    } else if (landlordTitle === 'Herr' && landlordName) {
      greeting = `Sehr geehrter Herr ${landlordName},`;
    } else {
      greeting = 'Sehr geehrte Damen und Herren,';
    }

    const hasGreeting = /^(Sehr\s+geehrte|Liebe|Hallo|Guten\s+Tag)/i.test(message.trim());
    if (!hasGreeting) {
      message = `${greeting}\n\n${message}`;
    }
  }

  return message;
}

// Cap seen listings array to prevent unbounded growth
function capSeenListings(seenList) {
  if (seenList.length > SEEN_LISTINGS_CAP) {
    return seenList.slice(seenList.length - SEEN_LISTINGS_CAP);
  }
  return seenList;
}
