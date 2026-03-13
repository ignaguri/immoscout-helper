import * as C from '../shared/constants';

// Batched storage initialization — single read, single write
export async function initializeStorage(): Promise<void> {
  const defaults: Record<string, any> = {
    [C.STORAGE_KEY]: [],
    [C.SEARCH_URL_KEY]: 'https://www.immobilienscout24.de/Suche/de/wohnung-mieten',
    [C.MESSAGE_TEMPLATE_KEY]:
      'Sehr geehrte Damen und Herren,\n\nich interessiere mich für diese Wohnung und würde gerne mehr Informationen erhalten.\n\nMit freundlichen Grüßen',
    [C.CHECK_INTERVAL_KEY]: 60,
    [C.RATE_LIMIT_KEY]: 10,
    [C.MIN_DELAY_KEY]: 30,
    [C.FORM_ADULTS_KEY]: 2,
    [C.FORM_CHILDREN_KEY]: 0,
    [C.FORM_PETS_KEY]: 'Nein',
    [C.FORM_SMOKER_KEY]: 'Nein',
    [C.FORM_INCOME_KEY]: 2000,
    [C.FORM_HOUSEHOLD_SIZE_KEY]: 'Einpersonenhaushalt',
    [C.FORM_EMPLOYMENT_KEY]: 'Angestellte:r',
    [C.FORM_INCOME_RANGE_KEY]: '1.500 - 2.000',
    [C.FORM_DOCUMENTS_KEY]: 'Vorhanden',
    [C.FORM_SALUTATION_KEY]: 'Frau',
    [C.FORM_PHONE_KEY]: '',
    [C.AUTO_SEND_MODE_KEY]: 'auto',
    [C.TOTAL_MESSAGES_SENT_KEY]: 0,
    [C.LAST_CHECK_TIME_KEY]: null,
    [C.AI_ENABLED_KEY]: false,
    [C.AI_SERVER_URL_KEY]: 'http://localhost:3456',
    [C.AI_MIN_SCORE_KEY]: 5,
    [C.AI_ABOUT_ME_KEY]: '',
    [C.AI_LISTINGS_SCORED_KEY]: 0,
    [C.AI_LISTINGS_SKIPPED_KEY]: 0,
    [C.SYNCED_CONTACTED_KEY]: 0,
  };

  const keys = Object.keys(defaults);
  const result: Record<string, any> = await chrome.storage.local.get(keys);

  const toSet: Record<string, any> = {};
  for (const key of keys) {
    if (result[key] === undefined || result[key] === null) {
      toSet[key] = defaults[key];
    }
  }

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }
}
