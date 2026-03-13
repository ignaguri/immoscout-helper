import {
  ACTIVITY_LOG_KEY,
  AI_ABOUT_ME_KEY,
  AI_API_KEY_KEY,
  AI_MIN_SCORE_KEY,
  AI_MODE_KEY,
  AI_SERVER_URL_KEY,
  AI_USAGE_COMPLETION_TOKENS_KEY,
  AI_USAGE_PROMPT_TOKENS_KEY,
  AUTO_SEND_MODE_KEY,
  CHECK_INTERVAL_KEY,
  CONV_UNREAD_COUNT_KEY,
  CONVERSATIONS_KEY,
  CONVERSATIONS_LAST_CHECK_KEY,
  FORM_ADULTS_KEY,
  FORM_CHILDREN_KEY,
  FORM_DOCUMENTS_KEY,
  FORM_EMPLOYMENT_KEY,
  FORM_HOUSEHOLD_SIZE_KEY,
  FORM_INCOME_KEY,
  FORM_INCOME_RANGE_KEY,
  FORM_PETS_KEY,
  FORM_PHONE_KEY,
  FORM_SALUTATION_KEY,
  FORM_SMOKER_KEY,
  MESSAGE_TEMPLATE_KEY,
  MIN_DELAY_KEY,
  PROFILE_AGE_KEY,
  PROFILE_BIRTH_DATE_KEY,
  PROFILE_CURRENT_ADDRESS_KEY,
  PROFILE_CURRENT_LANDLORD_KEY,
  PROFILE_CURRENT_NEIGHBORHOOD_KEY,
  PROFILE_DEALBREAKERS_KEY,
  PROFILE_EMAIL_KEY,
  PROFILE_EMPLOYED_SINCE_KEY,
  PROFILE_EMPLOYER_KEY,
  PROFILE_IDEAL_APARTMENT_KEY,
  PROFILE_LANDLORD_EMAIL_KEY,
  PROFILE_LANDLORD_PHONE_KEY,
  PROFILE_LANGUAGES_KEY,
  PROFILE_MARITAL_STATUS_KEY,
  PROFILE_MAX_WARMMIETE_KEY,
  PROFILE_MOVING_REASON_KEY,
  PROFILE_NAME_KEY,
  PROFILE_NET_INCOME_KEY,
  PROFILE_OCCUPATION_KEY,
  PROFILE_STRENGTHS_KEY,
  QUEUE_KEY,
  RATE_LIMIT_KEY,
  SEARCH_URL_KEY,
} from '../../shared/constants';

export async function storageGet(keys: string | string[]): Promise<Record<string, any>> {
  return chrome.storage.local.get(keys);
}

export async function storageSave(data: Record<string, any>): Promise<void> {
  await chrome.storage.local.set(data);
}

export interface PopupSettings {
  // Activity
  searchUrl: string;
  messageTemplate: string;
  autoSendMode: string;
  // Monitoring
  checkInterval: number;
  rateLimit: number;
  minDelay: number;
  // Profile
  profileName: string;
  profileAge: string;
  profileOccupation: string;
  profileLanguages: string;
  profileMovingReason: string;
  profileCurrentNeighborhood: string;
  profileIdealApartment: string;
  profileDealbreakers: string;
  profileStrengths: string;
  profileMaxWarmmiete: string;
  // Document profile
  profileBirthDate: string;
  profileMaritalStatus: string;
  profileCurrentAddress: string;
  profileEmail: string;
  profileEmployer: string;
  profileEmployedSince: string;
  profileNetIncome: string;
  profileCurrentLandlord: string;
  profileLandlordPhone: string;
  profileLandlordEmail: string;
  // Form fields
  formSalutation: string;
  formPhone: string;
  formAdults: number;
  formChildren: number;
  formPets: string;
  formSmoker: string;
  formIncome: number;
  formHouseholdSize: string;
  formEmployment: string;
  formIncomeRange: string;
  formDocuments: string;
  // AI
  aiMode: 'direct' | 'server';
  aiApiKey: string;
  aiServerUrl: string;
  aiMinScore: number;
  aiAboutMe: string;
}

const ALL_SETTINGS_KEYS = [
  SEARCH_URL_KEY,
  MESSAGE_TEMPLATE_KEY,
  AUTO_SEND_MODE_KEY,
  CHECK_INTERVAL_KEY,
  RATE_LIMIT_KEY,
  MIN_DELAY_KEY,
  FORM_SALUTATION_KEY,
  FORM_PHONE_KEY,
  FORM_ADULTS_KEY,
  FORM_CHILDREN_KEY,
  FORM_PETS_KEY,
  FORM_SMOKER_KEY,
  FORM_INCOME_KEY,
  FORM_HOUSEHOLD_SIZE_KEY,
  FORM_EMPLOYMENT_KEY,
  FORM_INCOME_RANGE_KEY,
  FORM_DOCUMENTS_KEY,
  AI_MODE_KEY,
  AI_API_KEY_KEY,
  AI_SERVER_URL_KEY,
  AI_MIN_SCORE_KEY,
  AI_ABOUT_ME_KEY,
  PROFILE_NAME_KEY,
  PROFILE_AGE_KEY,
  PROFILE_OCCUPATION_KEY,
  PROFILE_LANGUAGES_KEY,
  PROFILE_MOVING_REASON_KEY,
  PROFILE_CURRENT_NEIGHBORHOOD_KEY,
  PROFILE_IDEAL_APARTMENT_KEY,
  PROFILE_DEALBREAKERS_KEY,
  PROFILE_STRENGTHS_KEY,
  PROFILE_MAX_WARMMIETE_KEY,
  PROFILE_BIRTH_DATE_KEY,
  PROFILE_MARITAL_STATUS_KEY,
  PROFILE_CURRENT_ADDRESS_KEY,
  PROFILE_EMAIL_KEY,
  PROFILE_EMPLOYER_KEY,
  PROFILE_EMPLOYED_SINCE_KEY,
  PROFILE_NET_INCOME_KEY,
  PROFILE_CURRENT_LANDLORD_KEY,
  PROFILE_LANDLORD_PHONE_KEY,
  PROFILE_LANDLORD_EMAIL_KEY,
];

export async function loadAllSettings(): Promise<PopupSettings> {
  const result = await chrome.storage.local.get(ALL_SETTINGS_KEYS);
  return {
    searchUrl: result[SEARCH_URL_KEY] || '',
    messageTemplate: result[MESSAGE_TEMPLATE_KEY] || '',
    autoSendMode: result[AUTO_SEND_MODE_KEY] || 'auto',
    checkInterval: result[CHECK_INTERVAL_KEY] ?? 60,
    rateLimit: result[RATE_LIMIT_KEY] ?? 10,
    minDelay: result[MIN_DELAY_KEY] ?? 30,
    profileName: result[PROFILE_NAME_KEY] || '',
    profileAge: result[PROFILE_AGE_KEY] ?? '',
    profileOccupation: result[PROFILE_OCCUPATION_KEY] || '',
    profileLanguages: result[PROFILE_LANGUAGES_KEY] || '',
    profileMovingReason: result[PROFILE_MOVING_REASON_KEY] || '',
    profileCurrentNeighborhood: result[PROFILE_CURRENT_NEIGHBORHOOD_KEY] || '',
    profileIdealApartment: result[PROFILE_IDEAL_APARTMENT_KEY] || '',
    profileDealbreakers: result[PROFILE_DEALBREAKERS_KEY] || '',
    profileStrengths: result[PROFILE_STRENGTHS_KEY] || '',
    profileMaxWarmmiete: result[PROFILE_MAX_WARMMIETE_KEY] ?? '',
    profileBirthDate: result[PROFILE_BIRTH_DATE_KEY] || '',
    profileMaritalStatus: result[PROFILE_MARITAL_STATUS_KEY] || '',
    profileCurrentAddress: result[PROFILE_CURRENT_ADDRESS_KEY] || '',
    profileEmail: result[PROFILE_EMAIL_KEY] || '',
    profileEmployer: result[PROFILE_EMPLOYER_KEY] || '',
    profileEmployedSince: result[PROFILE_EMPLOYED_SINCE_KEY] || '',
    profileNetIncome: result[PROFILE_NET_INCOME_KEY] || '',
    profileCurrentLandlord: result[PROFILE_CURRENT_LANDLORD_KEY] || '',
    profileLandlordPhone: result[PROFILE_LANDLORD_PHONE_KEY] || '',
    profileLandlordEmail: result[PROFILE_LANDLORD_EMAIL_KEY] || '',
    formSalutation: result[FORM_SALUTATION_KEY] || 'Frau',
    formPhone: result[FORM_PHONE_KEY] || '',
    formAdults: result[FORM_ADULTS_KEY] ?? 1,
    formChildren: result[FORM_CHILDREN_KEY] ?? 0,
    formPets: result[FORM_PETS_KEY] || 'Nein',
    formSmoker: result[FORM_SMOKER_KEY] || 'Nein',
    formIncome: result[FORM_INCOME_KEY] ?? 2000,
    formHouseholdSize: result[FORM_HOUSEHOLD_SIZE_KEY] || 'Einpersonenhaushalt',
    formEmployment: result[FORM_EMPLOYMENT_KEY] || 'Angestellte:r',
    formIncomeRange: result[FORM_INCOME_RANGE_KEY] || '1.500 - 2.000',
    formDocuments: result[FORM_DOCUMENTS_KEY] || 'Vorhanden',
    aiMode: result[AI_MODE_KEY] || 'direct',
    aiApiKey: result[AI_API_KEY_KEY] || '',
    aiServerUrl: result[AI_SERVER_URL_KEY] || 'http://localhost:3456',
    aiMinScore: result[AI_MIN_SCORE_KEY] ?? 5,
    aiAboutMe: result[AI_ABOUT_ME_KEY] || '',
  };
}

export async function saveAllSettings(s: PopupSettings): Promise<void> {
  await chrome.storage.local.set({
    [SEARCH_URL_KEY]: s.searchUrl.trim(),
    [MESSAGE_TEMPLATE_KEY]: s.messageTemplate,
    [AUTO_SEND_MODE_KEY]: s.autoSendMode || 'auto',
    [CHECK_INTERVAL_KEY]: Math.max(60, Math.min(3600, s.checkInterval || 60)),
    [RATE_LIMIT_KEY]: Math.max(1, Math.min(50, s.rateLimit || 10)),
    [MIN_DELAY_KEY]: Math.max(10, Math.min(300, s.minDelay || 30)),
    [PROFILE_NAME_KEY]: s.profileName.trim(),
    [PROFILE_AGE_KEY]: s.profileAge,
    [PROFILE_OCCUPATION_KEY]: s.profileOccupation.trim(),
    [PROFILE_LANGUAGES_KEY]: s.profileLanguages.trim(),
    [PROFILE_MOVING_REASON_KEY]: s.profileMovingReason.trim(),
    [PROFILE_CURRENT_NEIGHBORHOOD_KEY]: s.profileCurrentNeighborhood.trim(),
    [PROFILE_IDEAL_APARTMENT_KEY]: s.profileIdealApartment.trim(),
    [PROFILE_DEALBREAKERS_KEY]: s.profileDealbreakers.trim(),
    [PROFILE_STRENGTHS_KEY]: s.profileStrengths.trim(),
    [PROFILE_MAX_WARMMIETE_KEY]: s.profileMaxWarmmiete,
    [PROFILE_BIRTH_DATE_KEY]: String(s.profileBirthDate || '').trim(),
    [PROFILE_MARITAL_STATUS_KEY]: String(s.profileMaritalStatus || '').trim(),
    [PROFILE_CURRENT_ADDRESS_KEY]: String(s.profileCurrentAddress || '').trim(),
    [PROFILE_EMAIL_KEY]: String(s.profileEmail || '').trim(),
    [PROFILE_EMPLOYER_KEY]: String(s.profileEmployer || '').trim(),
    [PROFILE_EMPLOYED_SINCE_KEY]: String(s.profileEmployedSince || '').trim(),
    [PROFILE_NET_INCOME_KEY]: String(s.profileNetIncome || '').trim(),
    [PROFILE_CURRENT_LANDLORD_KEY]: String(s.profileCurrentLandlord || '').trim(),
    [PROFILE_LANDLORD_PHONE_KEY]: String(s.profileLandlordPhone || '').trim(),
    [PROFILE_LANDLORD_EMAIL_KEY]: String(s.profileLandlordEmail || '').trim(),
    [FORM_SALUTATION_KEY]: s.formSalutation || 'Frau',
    [FORM_PHONE_KEY]: s.formPhone,
    [FORM_ADULTS_KEY]: Math.max(1, Math.min(10, s.formAdults || 1)),
    [FORM_CHILDREN_KEY]: Math.max(0, Math.min(10, s.formChildren || 0)),
    [FORM_PETS_KEY]: s.formPets || 'Nein',
    [FORM_SMOKER_KEY]: s.formSmoker || 'Nein',
    [FORM_INCOME_KEY]: Math.max(0, Math.min(50000, s.formIncome || 2000)),
    [FORM_HOUSEHOLD_SIZE_KEY]: s.formHouseholdSize || 'Einpersonenhaushalt',
    [FORM_EMPLOYMENT_KEY]: s.formEmployment || 'Angestellte:r',
    [FORM_INCOME_RANGE_KEY]: s.formIncomeRange || '1.500 - 2.000',
    [FORM_DOCUMENTS_KEY]: s.formDocuments || 'Vorhanden',
    [AI_MODE_KEY]: s.aiMode || 'direct',
    [AI_API_KEY_KEY]: s.aiApiKey.trim(),
    [AI_SERVER_URL_KEY]: s.aiServerUrl.trim() || 'http://localhost:3456',
    [AI_MIN_SCORE_KEY]: Math.max(1, Math.min(10, s.aiMinScore || 5)),
    [AI_ABOUT_ME_KEY]: s.aiAboutMe,
  });
}

export async function loadActivityLog(): Promise<any[]> {
  const stored = await chrome.storage.local.get([ACTIVITY_LOG_KEY]);
  return stored[ACTIVITY_LOG_KEY] || [];
}

export async function clearActivityLog(): Promise<void> {
  await chrome.storage.local.set({ [ACTIVITY_LOG_KEY]: [] });
}

export async function loadQueue(): Promise<any[]> {
  const stored = await chrome.storage.local.get([QUEUE_KEY]);
  return stored[QUEUE_KEY] || [];
}

export async function clearQueue(): Promise<void> {
  await chrome.storage.local.set({ [QUEUE_KEY]: [] });
}

export async function loadConversations(): Promise<{
  conversations: any[];
  lastCheck: string | null;
  unreadCount: number;
}> {
  const stored = await chrome.storage.local.get([
    CONVERSATIONS_KEY,
    CONVERSATIONS_LAST_CHECK_KEY,
    CONV_UNREAD_COUNT_KEY,
  ]);
  return {
    conversations: stored[CONVERSATIONS_KEY] || [],
    lastCheck: stored[CONVERSATIONS_LAST_CHECK_KEY] || null,
    unreadCount: stored[CONV_UNREAD_COUNT_KEY] || 0,
  };
}

export async function resetAiUsage(): Promise<void> {
  await chrome.storage.local.set({
    [AI_USAGE_PROMPT_TOKENS_KEY]: 0,
    [AI_USAGE_COMPLETION_TOKENS_KEY]: 0,
  });
}

export async function trackTokenUsage(promptTokens: number, completionTokens: number): Promise<void> {
  const stats = await chrome.storage.local.get([AI_USAGE_PROMPT_TOKENS_KEY, AI_USAGE_COMPLETION_TOKENS_KEY]);
  await chrome.storage.local.set({
    [AI_USAGE_PROMPT_TOKENS_KEY]: (stats[AI_USAGE_PROMPT_TOKENS_KEY] || 0) + promptTokens,
    [AI_USAGE_COMPLETION_TOKENS_KEY]: (stats[AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + completionTokens,
  });
}
