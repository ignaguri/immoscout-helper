// Popup script for ImmoScout24 Auto Reloader
// Note: shared.js is loaded before this file (provides constants + generatePersonalizedMessage)

// ============================================================================
// DOM ELEMENTS
// ============================================================================

// Main controls
const toggleBtn = document.getElementById('toggleBtn');
const toggleIcon = document.getElementById('toggleIcon');
const toggleText = document.getElementById('toggleText');
const statusBadge = document.getElementById('statusBadge');

// Settings inputs
const searchUrlInput = document.getElementById('searchUrl');
const messageTemplateInput = document.getElementById('messageTemplate');
const autoSendModeInput = document.getElementById('autoSendMode');
const checkIntervalInput = document.getElementById('checkInterval');
const rateLimitInput = document.getElementById('rateLimit');
const minDelayInput = document.getElementById('minDelay');

// Profile inputs
const profileNameInput = document.getElementById('profileName');
const profileAgeInput = document.getElementById('profileAge');
const profileOccupationInput = document.getElementById('profileOccupation');
const profileLanguagesInput = document.getElementById('profileLanguages');
const profileMovingReasonInput = document.getElementById('profileMovingReason');
const profileCurrentNeighborhoodInput = document.getElementById('profileCurrentNeighborhood');
const profileIdealApartmentInput = document.getElementById('profileIdealApartment');
const profileDealbreakersInput = document.getElementById('profileDealbreakers');
const profileStrengthsInput = document.getElementById('profileStrengths');
const profileMaxWarmmieteInput = document.getElementById('profileMaxWarmmiete');

// Form field inputs
const formSalutationInput = document.getElementById('formSalutation');
const formPhoneInput = document.getElementById('formPhone');
const formAdultsInput = document.getElementById('formAdults');
const formChildrenInput = document.getElementById('formChildren');
const formPetsInput = document.getElementById('formPets');
const formSmokerInput = document.getElementById('formSmoker');
const formIncomeInput = document.getElementById('formIncome');
const formHouseholdSizeInput = document.getElementById('formHouseholdSize');
const formEmploymentInput = document.getElementById('formEmployment');
const formIncomeRangeInput = document.getElementById('formIncomeRange');
const formDocumentsInput = document.getElementById('formDocuments');

// AI inputs
const aiEnabledInput = document.getElementById('aiEnabled');
const aiApiKeyInput = document.getElementById('aiApiKey');
const aiServerUrlInput = document.getElementById('aiServerUrl');
const aiMinScoreInput = document.getElementById('aiMinScore');
const aiAboutMeInput = document.getElementById('aiAboutMe');
const aiSettingsGroup = document.getElementById('aiSettingsGroup');
const aiStatsScored = document.getElementById('aiStatsScored');
const aiStatsSkipped = document.getElementById('aiStatsSkipped');
const aiServerStatus = document.getElementById('aiServerStatus');
const aiServerStatusText = document.getElementById('aiServerStatusText');
const setupInstructions = document.getElementById('setupInstructions');
const aiUsagePromptTokens = document.getElementById('aiUsagePromptTokens');
const aiUsageCompletionTokens = document.getElementById('aiUsageCompletionTokens');
const aiUsageCost = document.getElementById('aiUsageCost');
const resetUsageBtn = document.getElementById('resetUsageBtn');
const apiKeyToggle = document.getElementById('apiKeyToggle');
const copySetupCmd = document.getElementById('copySetupCmd');

// Other buttons
const sendCurrentBtn = document.getElementById('sendCurrentBtn');
const clearSeenBtn = document.getElementById('clearSeenBtn');
const testResultDiv = document.getElementById('testResult');
const testResultContent = document.getElementById('testResultContent');

// Activity log elements
const activityLogBox = document.getElementById('activityLogBox');
const clearActivityBtn = document.getElementById('clearActivityBtn');

// Conversation elements
const convBadge = document.getElementById('convBadge');
const checkRepliesBtn = document.getElementById('checkRepliesBtn');
const convLastCheck = document.getElementById('convLastCheck');
const convList = document.getElementById('convList');
const convEmptyState = document.getElementById('convEmptyState');

// Queue elements
const captureBtn = document.getElementById('captureBtn');
const captureStatus = document.getElementById('captureStatus');
const queueSummary = document.getElementById('queueSummary');
const queueListContent = document.getElementById('queueListContent');
const processBtn = document.getElementById('processBtn');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const queueProgressBox = document.getElementById('queueProgressBox');

// Analyze elements
const analyzeNotes = document.getElementById('analyzeNotes');
const analyzeBtn = document.getElementById('analyzeBtn');
const analyzeResult = document.getElementById('analyzeResult');
const analyzeScoreBadge = document.getElementById('analyzeScoreBadge');
const analyzeTitle = document.getElementById('analyzeTitle');
const analyzeReason = document.getElementById('analyzeReason');
const analyzeMsgSection = document.getElementById('analyzeMsgSection');
const analyzeMessage = document.getElementById('analyzeMessage');
const sendAnalyzedBtn = document.getElementById('sendAnalyzedBtn');
const copyAnalyzedBtn = document.getElementById('copyAnalyzedBtn');
const analyzeSummary = document.getElementById('analyzeSummary');
const toggleDetailsBtn = document.getElementById('toggleDetailsBtn');
const analyzeDetailsContent = document.getElementById('analyzeDetailsContent');

// Stats elements
const statsSentHour = document.getElementById('statsSentHour');
const statsSentTotal = document.getElementById('statsSentTotal');
const statsSeenCount = document.getElementById('statsSeenCount');
const statsSyncedCount = document.getElementById('statsSyncedCount');
const statsNextCheck = document.getElementById('statsNextCheck');

// Tabs
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// ============================================================================
// TAB NAVIGATION
// ============================================================================

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `tab-${targetTab}`) {
        content.classList.add('active');
      }
    });
  });
});

// ============================================================================
// COLLAPSIBLE SECTIONS
// ============================================================================

document.querySelectorAll('.collapsible-header').forEach(header => {
  header.addEventListener('click', () => {
    const targetId = header.dataset.target;
    const body = document.getElementById(targetId);
    if (body) {
      header.classList.toggle('open');
      body.classList.toggle('open');
    }
  });
});

// ============================================================================
// API KEY SHOW/HIDE
// ============================================================================

if (apiKeyToggle && aiApiKeyInput) {
  apiKeyToggle.addEventListener('click', () => {
    const isPassword = aiApiKeyInput.type === 'password';
    aiApiKeyInput.type = isPassword ? 'text' : 'password';
    apiKeyToggle.textContent = isPassword ? 'hide' : 'show';
  });
}

// ============================================================================
// COPY SETUP COMMAND
// ============================================================================

if (copySetupCmd) {
  copySetupCmd.addEventListener('click', () => {
    navigator.clipboard.writeText('cd server && npm install && npm start').then(() => {
      copySetupCmd.textContent = 'Copied!';
      setTimeout(() => { copySetupCmd.textContent = 'Copy command'; }, 1500);
    });
  });
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

let isMonitoring = false;

function buildProfileFromInputs() {
  const parseList = (val) => val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
  return {
    name: profileNameInput.value.trim() || undefined,
    age: profileAgeInput.value ? parseInt(profileAgeInput.value) : undefined,
    occupation: profileOccupationInput.value.trim() || undefined,
    languages: parseList(profileLanguagesInput.value),
    movingReason: profileMovingReasonInput.value.trim() || undefined,
    currentNeighborhood: profileCurrentNeighborhoodInput.value.trim() || undefined,
    idealApartment: profileIdealApartmentInput.value.trim() || undefined,
    dealbreakers: parseList(profileDealbreakersInput.value),
    strengths: parseList(profileStrengthsInput.value),
    maxWarmmiete: profileMaxWarmmieteInput.value ? parseInt(profileMaxWarmmieteInput.value) : undefined
  };
}

async function loadSettings() {
  const result = await chrome.storage.local.get([
    SEARCH_URL_KEY, MESSAGE_TEMPLATE_KEY, AUTO_SEND_MODE_KEY, CHECK_INTERVAL_KEY,
    RATE_LIMIT_KEY, MIN_DELAY_KEY, FORM_SALUTATION_KEY, FORM_PHONE_KEY,
    FORM_ADULTS_KEY, FORM_CHILDREN_KEY, FORM_PETS_KEY, FORM_SMOKER_KEY,
    FORM_INCOME_KEY, FORM_HOUSEHOLD_SIZE_KEY, FORM_EMPLOYMENT_KEY,
    FORM_INCOME_RANGE_KEY, FORM_DOCUMENTS_KEY,
    AI_ENABLED_KEY, AI_API_KEY_KEY, AI_SERVER_URL_KEY, AI_MIN_SCORE_KEY, AI_ABOUT_ME_KEY,
    PROFILE_NAME_KEY, PROFILE_AGE_KEY, PROFILE_OCCUPATION_KEY,
    PROFILE_LANGUAGES_KEY, PROFILE_MOVING_REASON_KEY,
    PROFILE_CURRENT_NEIGHBORHOOD_KEY, PROFILE_IDEAL_APARTMENT_KEY,
    PROFILE_DEALBREAKERS_KEY, PROFILE_STRENGTHS_KEY, PROFILE_MAX_WARMMIETE_KEY
  ]);

  if (result[SEARCH_URL_KEY]) searchUrlInput.value = result[SEARCH_URL_KEY];
  if (result[MESSAGE_TEMPLATE_KEY]) messageTemplateInput.value = result[MESSAGE_TEMPLATE_KEY];
  if (result[AUTO_SEND_MODE_KEY]) autoSendModeInput.value = result[AUTO_SEND_MODE_KEY];
  if (result[CHECK_INTERVAL_KEY] !== undefined) checkIntervalInput.value = result[CHECK_INTERVAL_KEY];
  if (result[RATE_LIMIT_KEY] !== undefined) rateLimitInput.value = result[RATE_LIMIT_KEY];
  if (result[MIN_DELAY_KEY] !== undefined) minDelayInput.value = result[MIN_DELAY_KEY];

  // Profile fields
  if (result[PROFILE_NAME_KEY]) profileNameInput.value = result[PROFILE_NAME_KEY];
  if (result[PROFILE_AGE_KEY] !== undefined) profileAgeInput.value = result[PROFILE_AGE_KEY];
  if (result[PROFILE_OCCUPATION_KEY]) profileOccupationInput.value = result[PROFILE_OCCUPATION_KEY];
  if (result[PROFILE_LANGUAGES_KEY]) profileLanguagesInput.value = result[PROFILE_LANGUAGES_KEY];
  if (result[PROFILE_MOVING_REASON_KEY]) profileMovingReasonInput.value = result[PROFILE_MOVING_REASON_KEY];
  if (result[PROFILE_CURRENT_NEIGHBORHOOD_KEY]) profileCurrentNeighborhoodInput.value = result[PROFILE_CURRENT_NEIGHBORHOOD_KEY];
  if (result[PROFILE_IDEAL_APARTMENT_KEY]) profileIdealApartmentInput.value = result[PROFILE_IDEAL_APARTMENT_KEY];
  if (result[PROFILE_DEALBREAKERS_KEY]) profileDealbreakersInput.value = result[PROFILE_DEALBREAKERS_KEY];
  if (result[PROFILE_STRENGTHS_KEY]) profileStrengthsInput.value = result[PROFILE_STRENGTHS_KEY];
  if (result[PROFILE_MAX_WARMMIETE_KEY] !== undefined) profileMaxWarmmieteInput.value = result[PROFILE_MAX_WARMMIETE_KEY];

  // Form fields
  if (result[FORM_SALUTATION_KEY]) formSalutationInput.value = result[FORM_SALUTATION_KEY];
  if (result[FORM_PHONE_KEY] !== undefined) formPhoneInput.value = result[FORM_PHONE_KEY];
  if (result[FORM_ADULTS_KEY] !== undefined) formAdultsInput.value = result[FORM_ADULTS_KEY];
  if (result[FORM_CHILDREN_KEY] !== undefined) formChildrenInput.value = result[FORM_CHILDREN_KEY];
  if (result[FORM_PETS_KEY]) formPetsInput.value = result[FORM_PETS_KEY];
  if (result[FORM_SMOKER_KEY]) formSmokerInput.value = result[FORM_SMOKER_KEY];
  if (result[FORM_INCOME_KEY] !== undefined) formIncomeInput.value = result[FORM_INCOME_KEY];
  if (result[FORM_HOUSEHOLD_SIZE_KEY]) formHouseholdSizeInput.value = result[FORM_HOUSEHOLD_SIZE_KEY];
  if (result[FORM_EMPLOYMENT_KEY]) formEmploymentInput.value = result[FORM_EMPLOYMENT_KEY];
  if (result[FORM_INCOME_RANGE_KEY]) formIncomeRangeInput.value = result[FORM_INCOME_RANGE_KEY];
  if (result[FORM_DOCUMENTS_KEY]) formDocumentsInput.value = result[FORM_DOCUMENTS_KEY];

  // AI settings
  aiEnabledInput.checked = result[AI_ENABLED_KEY] || false;
  if (result[AI_API_KEY_KEY]) aiApiKeyInput.value = result[AI_API_KEY_KEY];
  if (result[AI_SERVER_URL_KEY]) aiServerUrlInput.value = result[AI_SERVER_URL_KEY];
  if (result[AI_MIN_SCORE_KEY] !== undefined) aiMinScoreInput.value = result[AI_MIN_SCORE_KEY];
  if (result[AI_ABOUT_ME_KEY] !== undefined) aiAboutMeInput.value = result[AI_ABOUT_ME_KEY];
  toggleAiSettings(aiEnabledInput.checked);

  const statusResult = await chrome.runtime.sendMessage({ action: 'getStatus' });
  updateStatus(statusResult.isMonitoring);
  await updateStats();
}

async function saveSettings() {
  await chrome.storage.local.set({
    [SEARCH_URL_KEY]: searchUrlInput.value.trim(),
    [MESSAGE_TEMPLATE_KEY]: messageTemplateInput.value,
    [AUTO_SEND_MODE_KEY]: autoSendModeInput.value || 'auto',
    [CHECK_INTERVAL_KEY]: Math.max(60, Math.min(3600, parseInt(checkIntervalInput.value) || 60)),
    [RATE_LIMIT_KEY]: Math.max(1, Math.min(50, parseInt(rateLimitInput.value) || 10)),
    [MIN_DELAY_KEY]: Math.max(10, Math.min(300, parseInt(minDelayInput.value) || 30)),
    // Profile
    [PROFILE_NAME_KEY]: profileNameInput.value.trim() || '',
    [PROFILE_AGE_KEY]: profileAgeInput.value || '',
    [PROFILE_OCCUPATION_KEY]: profileOccupationInput.value.trim() || '',
    [PROFILE_LANGUAGES_KEY]: profileLanguagesInput.value.trim() || '',
    [PROFILE_MOVING_REASON_KEY]: profileMovingReasonInput.value.trim() || '',
    [PROFILE_CURRENT_NEIGHBORHOOD_KEY]: profileCurrentNeighborhoodInput.value.trim() || '',
    [PROFILE_IDEAL_APARTMENT_KEY]: profileIdealApartmentInput.value.trim() || '',
    [PROFILE_DEALBREAKERS_KEY]: profileDealbreakersInput.value.trim() || '',
    [PROFILE_STRENGTHS_KEY]: profileStrengthsInput.value.trim() || '',
    [PROFILE_MAX_WARMMIETE_KEY]: profileMaxWarmmieteInput.value || '',
    // Form
    [FORM_SALUTATION_KEY]: formSalutationInput.value || 'Frau',
    [FORM_PHONE_KEY]: formPhoneInput.value || '',
    [FORM_ADULTS_KEY]: Math.max(1, Math.min(10, parseInt(formAdultsInput.value) || 1)),
    [FORM_CHILDREN_KEY]: Math.max(0, Math.min(10, parseInt(formChildrenInput.value) || 0)),
    [FORM_PETS_KEY]: formPetsInput.value || 'Nein',
    [FORM_SMOKER_KEY]: formSmokerInput.value || 'Nein',
    [FORM_INCOME_KEY]: Math.max(0, Math.min(50000, parseInt(formIncomeInput.value) || 2000)),
    [FORM_HOUSEHOLD_SIZE_KEY]: formHouseholdSizeInput.value || 'Einpersonenhaushalt',
    [FORM_EMPLOYMENT_KEY]: formEmploymentInput.value || 'Angestellte:r',
    [FORM_INCOME_RANGE_KEY]: formIncomeRangeInput.value || '1.500 - 2.000',
    [FORM_DOCUMENTS_KEY]: formDocumentsInput.value || 'Vorhanden',
    // AI
    [AI_ENABLED_KEY]: aiEnabledInput.checked,
    [AI_API_KEY_KEY]: aiApiKeyInput.value.trim() || '',
    [AI_SERVER_URL_KEY]: aiServerUrlInput.value.trim() || 'http://localhost:3456',
    [AI_MIN_SCORE_KEY]: Math.max(1, Math.min(10, parseInt(aiMinScoreInput.value) || 5)),
    [AI_ABOUT_ME_KEY]: aiAboutMeInput.value || ''
  });
}

function updateStatus(monitoring) {
  isMonitoring = monitoring;

  if (monitoring) {
    statusBadge.textContent = 'Active';
    statusBadge.className = 'status-badge active';
    toggleBtn.className = 'toggle-btn stop';
    toggleIcon.textContent = '\u23F9';
    toggleText.textContent = 'Stop';
  } else {
    statusBadge.textContent = 'Stopped';
    statusBadge.className = 'status-badge inactive';
    toggleBtn.className = 'toggle-btn start';
    toggleIcon.textContent = '\u25B6';
    toggleText.textContent = 'Start';
  }
}

// ============================================================================
// STATS DISPLAY
// ============================================================================

let nextAlarmTime = null;
let queueNextActionTime = null;

async function updateStats() {
  try {
    const status = await chrome.runtime.sendMessage({ action: 'getStatus' });
    if (statsSentHour) statsSentHour.textContent = status.messagesThisHour || 0;
    if (statsSentTotal) statsSentTotal.textContent = status.totalMessagesSent || 0;
    if (statsSeenCount) statsSeenCount.textContent = status.seenListingsCount || 0;
    if (statsSyncedCount) statsSyncedCount.textContent = status.syncedContacted || 0;

    // Fetch next alarm time
    if (status.isMonitoring) {
      try {
        const alarm = await chrome.alarms.get(ALARM_NAME);
        nextAlarmTime = alarm ? alarm.scheduledTime : null;
      } catch { nextAlarmTime = null; }
    } else {
      nextAlarmTime = null;
    }
    updateCountdown();
  } catch (e) {
    // Service worker might be sleeping, ignore
  }
}

function updateCountdown() {
  if (!statsNextCheck) return;
  // Use queue next action time if queue is processing, otherwise alarm time
  const targetTime = isQueueProcessing ? queueNextActionTime : (isMonitoring ? nextAlarmTime : null);
  if (!targetTime) {
    statsNextCheck.textContent = '--';
    return;
  }
  const remaining = Math.max(0, Math.round((targetTime - Date.now()) / 1000));
  if (remaining <= 0) {
    statsNextCheck.textContent = isQueueProcessing ? 'processing' : 'now';
  } else if (remaining < 60) {
    statsNextCheck.textContent = `${remaining}s`;
  } else {
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    statsNextCheck.textContent = `${min}m${sec < 10 ? '0' : ''}${sec}s`;
  }
}

// ============================================================================
// EVENT LISTENERS - AUTO-SAVE
// ============================================================================

const allInputs = [
  searchUrlInput, messageTemplateInput, autoSendModeInput, checkIntervalInput, rateLimitInput, minDelayInput,
  profileNameInput, profileAgeInput, profileOccupationInput, profileLanguagesInput,
  profileMovingReasonInput, profileCurrentNeighborhoodInput, profileIdealApartmentInput,
  profileDealbreakersInput, profileStrengthsInput, profileMaxWarmmieteInput,
  formSalutationInput, formPhoneInput, formAdultsInput, formChildrenInput, formPetsInput, formSmokerInput,
  formIncomeInput, formHouseholdSizeInput, formEmploymentInput, formIncomeRangeInput, formDocumentsInput,
  aiEnabledInput, aiApiKeyInput, aiServerUrlInput, aiMinScoreInput, aiAboutMeInput
];

allInputs.forEach(input => {
  if (input) {
    input.addEventListener('change', saveSettings);
    input.addEventListener('blur', saveSettings);
    input.addEventListener('input', saveSettings);
  }
});

// Update interval while monitoring
checkIntervalInput.addEventListener('change', async () => {
  await saveSettings();
  if (isMonitoring) {
    await chrome.runtime.sendMessage({
      action: 'updateInterval',
      interval: parseInt(checkIntervalInput.value) || 60
    });
  }
});

// ============================================================================
// TOGGLE BUTTON (START/STOP)
// ============================================================================

toggleBtn.addEventListener('click', async () => {
  if (isMonitoring) {
    const response = await chrome.runtime.sendMessage({ action: 'stopMonitoring' });
    if (response?.success) {
      updateStatus(false);
    }
  } else {
    if (!searchUrlInput.value.trim()) {
      alert('Please enter a search URL');
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="profile"]').classList.add('active');
      tabContents.forEach(c => c.classList.remove('active'));
      document.getElementById('tab-profile').classList.add('active');
      searchUrlInput.focus();
      return;
    }

    if (!messageTemplateInput.value.trim()) {
      alert('Please enter a message');
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="profile"]').classList.add('active');
      tabContents.forEach(c => c.classList.remove('active'));
      document.getElementById('tab-profile').classList.add('active');
      messageTemplateInput.focus();
      return;
    }

    await saveSettings();

    try {
      const response = await chrome.runtime.sendMessage({ action: 'startMonitoring' });
      if (response?.success) {
        updateStatus(true);
      } else {
        alert(`Error: ${response?.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  }
});

// ============================================================================
// CLEAR SEEN LISTINGS
// ============================================================================

clearSeenBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear all seen listings?\n\nThis will cause all current listings to be treated as new on the next scan.')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'clearSeenListings' });
    if (response?.success) {
      alert('Seen listings cleared successfully.');
      await updateStats();
    } else {
      alert(`Error: ${response?.error || 'Unknown error'}`);
    }
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
});

resetUsageBtn.addEventListener('click', async () => {
  if (!confirm('Reset AI token usage stats to zero?')) return;
  await chrome.storage.local.set({
    [AI_USAGE_PROMPT_TOKENS_KEY]: 0,
    [AI_USAGE_COMPLETION_TOKENS_KEY]: 0
  });
  await updateAiStats();
});

// ============================================================================
// CAPTCHA SOLVING (shared by test tab send flows)
// ============================================================================

async function trySolveCaptchaFromPopup(tabId) {
  const serverUrl = aiServerUrlInput.value.trim() || 'http://localhost:3456';
  const apiKey = aiApiKeyInput.value.trim() || undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    appendToResult(`Captcha detected - solving (attempt ${attempt}/2)...`);

    let detection;
    try {
      detection = await chrome.tabs.sendMessage(tabId, { action: 'detectCaptcha' });
    } catch (e) {
      appendToResult(`Captcha detection failed: ${e.message}`);
      return { solved: false };
    }

    if (!detection?.hasCaptcha) {
      appendToResult('No captcha present');
      return { solved: true, messageSent: false };
    }

    if (!detection.imageBase64) {
      appendToResult(`Captcha found but no image: ${detection.error}`);
      return { solved: false };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${serverUrl}/captcha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: detection.imageBase64, apiKey }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const result = await response.json();

      if (!result.text) {
        appendToResult(`Server could not solve captcha: ${result.error}`);
        return { solved: false };
      }

      appendToResult(`Solution: "${result.text}", submitting...`);

      const solveResult = await chrome.tabs.sendMessage(tabId, {
        action: 'solveCaptcha',
        text: result.text
      });

      if (solveResult?.success) {
        if (solveResult.messageSent) {
          appendToResult('Captcha solved - message sent!');
          return { solved: true, messageSent: true };
        }
        appendToResult('Captcha solved');
        return { solved: true, messageSent: false };
      }

      appendToResult(`Attempt ${attempt} failed: ${solveResult?.error}`);
    } catch (e) {
      appendToResult(`Captcha attempt ${attempt} error: ${e.message}`);
    }
  }

  appendToResult('All captcha attempts failed');
  return { solved: false };
}

// ============================================================================
// TEST FEATURE
// ============================================================================

function showTestResult(content, isError = false) {
  testResultDiv.style.display = 'block';
  testResultContent.textContent = content;
  testResultDiv.style.borderColor = isError ? '#dc3545' : '#28a745';
  testResultDiv.style.background = isError ? '#fff5f5' : '#f0fff4';
}

function appendToResult(line) {
  testResultDiv.style.display = 'block';
  testResultContent.textContent += '\n' + line;
  testResultDiv.scrollTop = testResultDiv.scrollHeight;
}

// Listen for real-time progress updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'progressUpdate') {
    appendToResult(request.message);
  } else if (request.action === 'activityLog') {
    renderActivityEntry(request);
  } else if (request.action === 'conversationUpdate') {
    loadConversations();
  } else if (request.action === 'queueProgress') {
    if (request.nextActionTime) {
      queueNextActionTime = request.nextActionTime;
    }
    if (request.done) {
      appendQueueProgress('Queue processing complete.', 'header');
      updateQueueButtons(false);
      queueNextActionTime = null;
      chrome.storage.local.get([QUEUE_KEY]).then(stored => renderQueue(stored[QUEUE_KEY] || []));
    } else if (request.current) {
      const id = request.current.id;
      const title = request.current.title || id;
      const url = request.current.url || `https://www.immobilienscout24.de/expose/${id}`;
      const link = `<a href="${url}" target="_blank" style="color:#888; text-decoration:none;">(${id})</a>`;
      appendQueueProgressHtml(`▸ ${link} ${escapeHtml(title)} (${request.remaining} remaining)`, 'header');
    }
    if (request.message) {
      const isAnalysis = request.message.includes('AI Score:') || request.message.includes('Reason:') || request.message.includes('Summary:');
      const isWait = request.message.includes('Rate limit') || request.message.includes('waiting');
      appendQueueProgress(request.message, isAnalysis ? 'analysis' : isWait ? 'wait' : 'info');
    }
    if (request.lastResult) {
      let icon, type, label;
      if (request.lastResult === 'success') {
        icon = '\u2713'; type = 'result-success'; label = 'Sent';
      } else if (request.lastResult === 'skipped') {
        icon = '\u2192'; type = 'wait'; label = 'Skipped';
      } else {
        icon = '\u2717'; type = 'result-failed'; label = 'Failed';
      }
      const lid = request.lastId;
      const lurl = `https://www.immobilienscout24.de/expose/${lid}`;
      const llink = `<a href="${lurl}" target="_blank" style="color:inherit; text-decoration:none;">(${lid})</a>`;
      appendQueueProgressHtml(`${icon} ${label}: ${llink} ${escapeHtml(request.lastTitle || '')}`, type);
      chrome.storage.local.get([QUEUE_KEY]).then(stored => renderQueue(stored[QUEUE_KEY] || []));
    }
  }
});

sendCurrentBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url?.includes('immobilienscout24.de/expose/')) {
      showTestResult('Please open a listing on ImmoScout24 first!\n\nURL should contain "/expose/"', true);
      return;
    }

    const template = messageTemplateInput.value.trim();
    if (!template) {
      showTestResult('Please enter a message first!', true);
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="profile"]').classList.add('active');
      tabContents.forEach(c => c.classList.remove('active'));
      document.getElementById('tab-profile').classList.add('active');
      messageTemplateInput.focus();
      return;
    }

    await saveSettings();

    sendCurrentBtn.disabled = true;
    sendCurrentBtn.textContent = 'Sending...';
    showTestResult('Starting message send...\n---', false);

    const formValues = getFormValues();

    let landlordTitle = null, landlordName = null;
    try {
      const nameResponse = await chrome.tabs.sendMessage(tab.id, { action: 'extractLandlordName' });
      if (nameResponse) {
        landlordTitle = nameResponse.title;
        landlordName = nameResponse.name;
      }
    } catch (e) { /* ignore */ }

    // Uses generatePersonalizedMessage from shared.js
    const personalizedMessage = generatePersonalizedMessage(template, landlordTitle, landlordName);

    let sendResult = await chrome.tabs.sendMessage(tab.id, {
      action: 'sendMessage',
      message: personalizedMessage,
      formValues: formValues
    });

    // Handle captcha if it appeared after submit
    if (sendResult && !sendResult.success && sendResult.captchaBlocked) {
      const captchaResult = await trySolveCaptchaFromPopup(tab.id);
      if (captchaResult.messageSent) {
        sendResult = { success: true, messageSent: personalizedMessage };
      } else if (captchaResult.solved) {
        try {
          sendResult = await chrome.tabs.sendMessage(tab.id, {
            action: 'sendMessage',
            message: personalizedMessage,
            formValues: formValues
          });
        } catch (e) {
          appendToResult(`Retry failed: ${e.message}`);
        }
      }
    }

    sendCurrentBtn.disabled = false;
    sendCurrentBtn.textContent = 'Send Template Message';

    const landlordInfo = landlordTitle && landlordName ? `${landlordTitle} ${landlordName}` : landlordName || 'Unknown';

    if (sendResult?.success) {
      appendToResult('\n---');
      appendToResult(`\nDONE!\n\nLandlord: ${landlordInfo}\n\nMessage:\n${sendResult.messageSent || personalizedMessage}`);
      testResultDiv.style.borderColor = '#28a745';
      testResultDiv.style.background = '#f0fff4';
    } else {
      appendToResult('\n---');
      appendToResult(`\nERROR: ${sendResult?.error || 'Unknown'}\n\nLandlord: ${landlordInfo}\n\nMake sure you're logged in to ImmoScout24`);
      testResultDiv.style.borderColor = '#dc3545';
      testResultDiv.style.background = '#fff5f5';
    }

  } catch (error) {
    sendCurrentBtn.disabled = false;
    sendCurrentBtn.textContent = 'Send Template Message';

    let errorMsg = `Error: ${error.message}`;
    if (error.message.includes('Receiving end does not exist')) {
      errorMsg += '\n\nPlease REFRESH the listing page and try again';
    }
    showTestResult(errorMsg, true);
  }
});

// ============================================================================
// ANALYZE FEATURE
// ============================================================================

// Store last analyze result for logging when sending
let lastAnalyzeContext = null;

function getScoreColor(score) {
  if (score >= 8) return '#28a745';
  if (score >= 6) return '#5cb85c';
  if (score >= 4) return '#f0ad4e';
  return '#dc3545';
}

function getFormValues() {
  return {
    salutation: formSalutationInput.value || 'Frau',
    phone: formPhoneInput.value || '',
    adults: parseInt(formAdultsInput.value) || 2,
    children: parseInt(formChildrenInput.value) || 0,
    pets: formPetsInput.value || 'Nein',
    smoker: formSmokerInput.value || 'Nein',
    income: parseInt(formIncomeInput.value) || 2000,
    householdSize: formHouseholdSizeInput.value || 'Einpersonenhaushalt',
    employmentType: formEmploymentInput.value || 'Angestellte:r',
    incomeRange: formIncomeRangeInput.value || '1.500 - 2.000',
    documents: formDocumentsInput.value || 'Vorhanden'
  };
}

analyzeBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url?.includes('immobilienscout24.de/expose/')) {
      showTestResult('Please open a listing on ImmoScout24 first!\n\nURL should contain "/expose/"', true);
      return;
    }

    const serverUrl = aiServerUrlInput.value.trim() || 'http://localhost:3456';
    const apiKey = aiApiKeyInput.value.trim() || undefined;
    const profile = buildProfileFromInputs();

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing...';
    analyzeResult.style.display = 'none';
    testResultDiv.style.display = 'none';

    // Extract listing details + landlord info from the page
    let listingDetails, landlordInfo;
    try {
      listingDetails = await chrome.tabs.sendMessage(tab.id, { action: 'extractListingDetails' });
      const nameResponse = await chrome.tabs.sendMessage(tab.id, { action: 'extractLandlordName' });
      landlordInfo = { title: nameResponse?.title || null, name: nameResponse?.name || null, isPrivate: nameResponse?.isPrivate || false };
    } catch (e) {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = 'Analyze Current Listing';
      showTestResult('Could not read listing. Please refresh the page and try again.', true);
      return;
    }

    if (!listingDetails) {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = 'Analyze Current Listing';
      showTestResult('No listing data found on this page.', true);
      return;
    }

    // Build payload (same structure as background.js tryAIAnalysis)
    const formValues = getFormValues();
    const aboutMe = aiAboutMeInput.value || '';
    const notes = analyzeNotes.value.trim();
    const payload = {
      listingDetails,
      landlordInfo,
      userProfile: { ...formValues, aboutMe },
      messageTemplate: messageTemplateInput.value || '',
      minScore: 0,  // Always return score + message for manual analysis
      userNotes: notes || undefined,
      apiKey,
      profile
    };

    // Call AI server
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let result;
    try {
      const response = await fetch(`${serverUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      result = await response.json();

      // Track token usage from popup-initiated analyze
      if (result.usage) {
        const usageStats = await chrome.storage.local.get([AI_USAGE_PROMPT_TOKENS_KEY, AI_USAGE_COMPLETION_TOKENS_KEY]);
        await chrome.storage.local.set({
          [AI_USAGE_PROMPT_TOKENS_KEY]: (usageStats[AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (result.usage.promptTokens || 0),
          [AI_USAGE_COMPLETION_TOKENS_KEY]: (usageStats[AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (result.usage.completionTokens || 0)
        });
        await updateAiStats();
      }
    } catch (e) {
      clearTimeout(timeout);
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = 'Analyze Current Listing';
      const msg = e.name === 'AbortError' ? 'Request timed out (30s)' : e.message;
      showTestResult(`AI server error: ${msg}\n\nMake sure the server is running at ${serverUrl}`, true);
      return;
    }

    // Display results
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze Current Listing';
    analyzeResult.style.display = 'block';

    const score = result.score || 0;
    const exposeMatch = tab.url.match(/\/expose\/(\d+)/);
    lastAnalyzeContext = {
      listingId: exposeMatch ? exposeMatch[1] : 'unknown',
      title: listingDetails.title || 'Untitled',
      address: listingDetails.address || '',
      url: tab.url,
      score: score,
      reason: result.reason || '',
      landlord: landlordInfo.name || ''
    };

    analyzeScoreBadge.textContent = score;
    analyzeScoreBadge.style.background = getScoreColor(score);
    analyzeTitle.textContent = listingDetails.title || 'Untitled listing';
    analyzeReason.textContent = result.reason || '';

    // Display summary
    if (result.summary) {
      analyzeSummary.textContent = result.summary;
      analyzeSummary.style.display = 'block';
    } else {
      analyzeSummary.style.display = 'none';
    }

    // Display flags/warnings
    const flagsContainer = document.getElementById('analyzeFlagsContainer');
    if (flagsContainer) {
      if (result.flags && result.flags.length > 0) {
        const flagLabels = {
          'abl\u00f6se-risk': 'Abl\u00f6se Risk',
          'swap-only': 'Swap Only',
          'suspicious-price': 'Suspicious Price',
          'wbs-required': 'WBS Required',
          'befristet': 'Fixed-Term',
          'indexmiete': 'Index-Linked Rent',
          'high-energy-costs': 'High Energy Costs',
          'unrenovated': 'Unrenovated',
        };
        flagsContainer.innerHTML = result.flags.map(f => {
          const label = flagLabels[f] || f;
          const isWarning = ['abl\u00f6se-risk', 'swap-only', 'suspicious-price'].includes(f);
          const bg = isWarning ? '#dc3545' : '#f0ad4e';
          return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;color:white;background:${bg};margin-right:4px;margin-top:4px;">${label}</span>`;
        }).join('');
        flagsContainer.style.display = 'block';
      } else {
        flagsContainer.style.display = 'none';
        flagsContainer.innerHTML = '';
      }
    }

    if (result.message) {
      analyzeMsgSection.style.display = 'block';
      analyzeMessage.value = result.message;
    } else {
      analyzeMsgSection.style.display = 'none';
    }

    // Show extracted data in collapsible section
    const detailsSummary = Object.entries(listingDetails)
      .filter(([k, v]) => k !== 'rawText' && v)
      .map(([k, v]) => {
        if (typeof v === 'object') return `${k}: ${JSON.stringify(v)}`;
        const str = String(v);
        return `${k}: ${str.length > 80 ? str.substring(0, 80) + '...' : str}`;
      })
      .join('\n');
    analyzeDetailsContent.textContent = detailsSummary;
    analyzeDetailsContent.style.display = 'none';
    toggleDetailsBtn.textContent = 'Show extracted data';

  } catch (error) {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze Current Listing';
    let errorMsg = `Error: ${error.message}`;
    if (error.message.includes('Receiving end does not exist')) {
      errorMsg += '\n\nPlease refresh the listing page and try again.';
    }
    showTestResult(errorMsg, true);
  }
});

// Toggle extracted data details
toggleDetailsBtn.addEventListener('click', () => {
  const isHidden = analyzeDetailsContent.style.display === 'none';
  analyzeDetailsContent.style.display = isHidden ? 'block' : 'none';
  toggleDetailsBtn.textContent = isHidden ? 'Hide extracted data' : 'Show extracted data';
});

// Copy AI message to clipboard
copyAnalyzedBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(analyzeMessage.value).then(() => {
    copyAnalyzedBtn.textContent = '\u2713';
    setTimeout(() => { copyAnalyzedBtn.textContent = 'Copy'; }, 1500);
  });
});

// Send the analyzed message
sendAnalyzedBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url?.includes('immobilienscout24.de/expose/')) {
      showTestResult('Please open a listing on ImmoScout24 first!', true);
      return;
    }

    const message = analyzeMessage.value.trim();
    if (!message) {
      showTestResult('No message to send.', true);
      return;
    }

    sendAnalyzedBtn.disabled = true;
    sendAnalyzedBtn.textContent = 'Sending...';
    showTestResult('Sending AI message...\n---', false);

    const formValues = getFormValues();
    const isAutoSend = autoSendModeInput.value !== 'manual';

    let sendResult = await chrome.tabs.sendMessage(tab.id, {
      action: 'sendMessage',
      message: message,
      formValues: formValues,
      autoSend: isAutoSend
    });

    // Handle captcha if it appeared after submit
    if (sendResult && !sendResult.success && sendResult.captchaBlocked) {
      const captchaResult = await trySolveCaptchaFromPopup(tab.id);
      if (captchaResult.messageSent) {
        sendResult = { success: true, messageSent: message };
      } else if (captchaResult.solved) {
        // Captcha solved but message not confirmed — retry send
        try {
          sendResult = await chrome.tabs.sendMessage(tab.id, {
            action: 'sendMessage',
            message: message,
            formValues: formValues,
            autoSend: isAutoSend
          });
        } catch (e) {
          appendToResult(`Retry failed: ${e.message}`);
        }
      }
    }

    sendAnalyzedBtn.disabled = false;
    sendAnalyzedBtn.textContent = 'Send This Message';

    if (sendResult?.success) {
      appendToResult('\nMessage sent successfully!');
      testResultDiv.style.borderColor = '#28a745';
      testResultDiv.style.background = '#f0fff4';

      // Log to activity log
      if (lastAnalyzeContext) {
        const serverUrl = aiServerUrlInput.value.trim() || 'http://localhost:3456';
        try {
          await fetch(`${serverUrl}/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...lastAnalyzeContext, action: 'sent' })
          });
        } catch (e) { /* logging is best-effort */ }
      }
    } else {
      appendToResult(`\n${sendResult?.error || 'Unknown error'}`);
      testResultDiv.style.borderColor = '#dc3545';
      testResultDiv.style.background = '#fff5f5';
    }
  } catch (error) {
    sendAnalyzedBtn.disabled = false;
    sendAnalyzedBtn.textContent = 'Send This Message';
    let errorMsg = `Error: ${error.message}`;
    if (error.message.includes('Receiving end does not exist')) {
      errorMsg += '\n\nPlease refresh the listing page and try again.';
    }
    showTestResult(errorMsg, true);
  }
});

// ============================================================================
// AI SETTINGS
// ============================================================================

function toggleAiSettings(enabled) {
  if (aiSettingsGroup) {
    aiSettingsGroup.classList.toggle('disabled', !enabled);
  }
}

aiEnabledInput.addEventListener('change', () => {
  toggleAiSettings(aiEnabledInput.checked);
  saveSettings();
  checkAiServerHealth();
});

async function checkAiServerHealth() {
  const url = aiServerUrlInput.value.trim() || 'http://localhost:3456';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await response.json();
    if (data.status === 'ok') {
      aiServerStatus.className = 'ai-status connected';
      aiServerStatusText.textContent = 'Connected';
      if (setupInstructions) setupInstructions.style.display = 'none';
    } else {
      aiServerStatus.className = 'ai-status disconnected';
      aiServerStatusText.textContent = 'Unreachable';
      if (setupInstructions && aiEnabledInput.checked) setupInstructions.style.display = 'block';
    }
  } catch (e) {
    aiServerStatus.className = 'ai-status disconnected';
    aiServerStatusText.textContent = 'Unreachable';
    if (setupInstructions && aiEnabledInput.checked) setupInstructions.style.display = 'block';
  }
}

async function updateAiStats() {
  try {
    const status = await chrome.runtime.sendMessage({ action: 'getStatus' });
    if (aiStatsScored) aiStatsScored.textContent = status.aiScored || 0;
    if (aiStatsSkipped) aiStatsSkipped.textContent = status.aiSkipped || 0;

    const promptTok = status.aiPromptTokens || 0;
    const completionTok = status.aiCompletionTokens || 0;
    if (aiUsagePromptTokens) aiUsagePromptTokens.textContent = promptTok.toLocaleString();
    if (aiUsageCompletionTokens) aiUsageCompletionTokens.textContent = completionTok.toLocaleString();
    if (aiUsageCost) {
      // Gemini 2.5 Flash pricing: $0.15/1M input, $0.60/1M output (non-thinking)
      const cost = (promptTok * 0.15 / 1_000_000) + (completionTok * 0.60 / 1_000_000);
      aiUsageCost.textContent = '$' + cost.toFixed(4);
    }
  } catch (e) { /* ignore */ }
}

// ============================================================================
// MANUAL QUEUE
// ============================================================================

let isQueueProcessing = false;

function renderQueue(queue) {
  const count = queue ? queue.length : 0;
  queueSummary.textContent = `${count} listing${count === 1 ? '' : 's'} queued`;

  if (!count) {
    queueListContent.innerHTML = '<span style="color:#999;">No listings in queue.</span>';
    return;
  }

  queueListContent.style.color = '#333';
  queueListContent.innerHTML = queue.map((item, i) => {
    const title = item.title ? (item.title.length > 45 ? item.title.substring(0, 45) + '...' : item.title) : 'Untitled';
    const id = item.id || '?';
    const url = item.url || `https://www.immobilienscout24.de/expose/${id}`;
    return `<div style="padding:3px 0;${i < queue.length - 1 ? 'border-bottom:1px solid #eee;' : ''}">${i + 1}. <a href="${url}" target="_blank" style="color:#888; text-decoration:none;" title="Open listing">(${id})</a> ${title}</div>`;
  }).join('');
}

function updateQueueButtons(processing) {
  isQueueProcessing = processing;
  if (!processing) {
    queueNextActionTime = null;
  }
  if (processing) {
    processBtn.textContent = '\u23F9 Stop Processing';
    processBtn.className = 'btn btn-secondary';
    captureBtn.disabled = true;
  } else {
    processBtn.textContent = '\u25B6 Process Queue';
    processBtn.className = 'btn btn-test';
    captureBtn.disabled = false;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function appendQueueProgress(line, type = 'info') {
  if (queueProgressBox.textContent === 'Ready.') {
    queueProgressBox.innerHTML = '';
  }
  const el = document.createElement('div');
  if (type === 'header') {
    el.style.cssText = 'border-top: 1px solid #ccc; margin-top: 6px; padding-top: 6px; font-weight: 600; color: #333;';
  } else if (type === 'analysis') {
    el.style.cssText = 'margin: 4px 0 2px 8px; padding: 4px 8px; background: #eef6ff; border-left: 3px solid #4a9eff; border-radius: 3px; color: #444; white-space: pre-wrap;';
  } else if (type === 'result-success') {
    el.style.cssText = 'margin: 4px 0 2px 8px; color: #2d8a56; font-weight: 600;';
  } else if (type === 'result-failed') {
    el.style.cssText = 'margin: 4px 0 2px 8px; color: #c0392b; font-weight: 600;';
  } else if (type === 'wait') {
    el.style.cssText = 'margin: 2px 0 2px 8px; color: #888; font-style: italic;';
  } else {
    el.style.cssText = 'margin: 2px 0 2px 8px; color: #555;';
  }
  el.innerHTML = escapeHtml(line);
  queueProgressBox.appendChild(el);
  queueProgressBox.scrollTop = queueProgressBox.scrollHeight;
}

function appendQueueProgressHtml(html, type = 'info') {
  if (queueProgressBox.textContent === 'Ready.') {
    queueProgressBox.innerHTML = '';
  }
  const el = document.createElement('div');
  if (type === 'header') {
    el.style.cssText = 'border-top: 1px solid #ccc; margin-top: 6px; padding-top: 6px; font-weight: 600; color: #333;';
  } else if (type === 'result-success') {
    el.style.cssText = 'margin: 4px 0 2px 8px; color: #2d8a56; font-weight: 600;';
  } else if (type === 'result-failed') {
    el.style.cssText = 'margin: 4px 0 2px 8px; color: #c0392b; font-weight: 600;';
  } else if (type === 'wait') {
    el.style.cssText = 'margin: 2px 0 2px 8px; color: #888; font-style: italic;';
  } else {
    el.style.cssText = 'margin: 2px 0 2px 8px; color: #555;';
  }
  el.innerHTML = html;
  queueProgressBox.appendChild(el);
  queueProgressBox.scrollTop = queueProgressBox.scrollHeight;
}

// ============================================================================
// ACTIVITY LOG (auto-monitoring)
// ============================================================================

function applyLogStyle(el, type) {
  if (type === 'header') {
    el.style.cssText = 'border-top: 1px solid #ccc; margin-top: 6px; padding-top: 6px; font-weight: 600; color: #333;';
  } else if (type === 'analysis') {
    el.style.cssText = 'margin: 4px 0 2px 8px; padding: 4px 8px; background: #eef6ff; border-left: 3px solid #4a9eff; border-radius: 3px; color: #444; white-space: pre-wrap;';
  } else if (type === 'result-success') {
    el.style.cssText = 'margin: 4px 0 2px 8px; color: #2d8a56; font-weight: 600;';
  } else if (type === 'result-failed') {
    el.style.cssText = 'margin: 4px 0 2px 8px; color: #c0392b; font-weight: 600;';
  } else if (type === 'wait') {
    el.style.cssText = 'margin: 2px 0 2px 8px; color: #888; font-style: italic;';
  } else {
    el.style.cssText = 'margin: 2px 0 2px 8px; color: #555;';
  }
}

function appendActivityLog(line, type = 'info') {
  if (activityLogBox.textContent === 'No activity yet.') {
    activityLogBox.innerHTML = '';
  }
  const el = document.createElement('div');
  applyLogStyle(el, type);
  el.innerHTML = escapeHtml(line);
  activityLogBox.appendChild(el);
  activityLogBox.scrollTop = activityLogBox.scrollHeight;
}

function appendActivityLogHtml(html, type = 'info') {
  if (activityLogBox.textContent === 'No activity yet.') {
    activityLogBox.innerHTML = '';
  }
  const el = document.createElement('div');
  applyLogStyle(el, type);
  el.innerHTML = html;
  activityLogBox.appendChild(el);
  activityLogBox.scrollTop = activityLogBox.scrollHeight;
}

function renderActivityEntry(entry) {
  if (entry.current) {
    const id = entry.current.id;
    const title = entry.current.title || id;
    const url = entry.current.url || `https://www.immobilienscout24.de/expose/${id}`;
    const link = `<a href="${url}" target="_blank" style="color:#888; text-decoration:none;">(${id})</a>`;
    appendActivityLogHtml(`▸ ${link} ${escapeHtml(title)}`, 'header');
  }
  if (entry.message) {
    const isAnalysis = entry.type === 'analysis' || entry.message.includes('AI Score:');
    const isWait = entry.type === 'wait' || entry.message.includes('Rate limit') || entry.message.includes('waiting');
    appendActivityLog(entry.message, isAnalysis ? 'analysis' : isWait ? 'wait' : 'info');
  }
  if (entry.lastResult) {
    let icon, type, label;
    if (entry.lastResult === 'success') {
      icon = '\u2713'; type = 'result-success'; label = 'Sent';
    } else if (entry.lastResult === 'skipped') {
      icon = '\u2192'; type = 'wait'; label = 'Skipped';
    } else {
      icon = '\u2717'; type = 'result-failed'; label = 'Failed';
    }
    const lid = entry.lastId;
    const lurl = `https://www.immobilienscout24.de/expose/${lid}`;
    const llink = `<a href="${lurl}" target="_blank" style="color:inherit; text-decoration:none;">(${lid})</a>`;
    appendActivityLogHtml(`${icon} ${label}: ${llink} ${escapeHtml(entry.lastTitle || '')}`, type);
  }
}

async function loadActivityLog() {
  try {
    const stored = await chrome.storage.local.get([ACTIVITY_LOG_KEY]);
    const log = stored[ACTIVITY_LOG_KEY] || [];
    if (log.length > 0) {
      activityLogBox.innerHTML = '';
      for (const entry of log) {
        renderActivityEntry(entry);
      }
    }
  } catch (e) { /* ignore */ }
}

clearActivityBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ [ACTIVITY_LOG_KEY]: [] });
  activityLogBox.innerHTML = '<span style="color:#999;">No activity yet.</span>';
});

async function loadQueueState() {
  try {
    const status = await chrome.runtime.sendMessage({ action: 'getQueueStatus' });
    renderQueue(status.queue);
    updateQueueButtons(status.isProcessing);
    if (status.isProcessing) {
      appendQueueProgress('Processing in progress \u2014 ' + (status.queue || []).length + ' listings remaining...', 'header');
    }
  } catch (e) {
    const stored = await chrome.storage.local.get([QUEUE_KEY]);
    renderQueue(stored[QUEUE_KEY] || []);
    updateQueueButtons(false);
  }
}

captureBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url?.includes('immobilienscout24.de')) {
      captureStatus.textContent = 'Please open an ImmoScout24 search page first.';
      captureStatus.style.color = '#dc3545';
      return;
    }

    captureBtn.disabled = true;
    captureBtn.textContent = 'Capturing...';
    captureStatus.textContent = '';

    let listings;
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { action: 'extractListings' });
      listings = result?.listings || [];
    } catch (e) {
      captureStatus.textContent = 'Could not read listings. Refresh the page and try again.';
      captureStatus.style.color = '#dc3545';
      captureBtn.disabled = false;
      captureBtn.textContent = '+ Capture from Current Page';
      return;
    }

    if (listings.length === 0) {
      captureStatus.textContent = 'No listings found on this page.';
      captureStatus.style.color = '#888';
      captureBtn.disabled = false;
      captureBtn.textContent = '+ Capture from Current Page';
      return;
    }

    const response = await chrome.runtime.sendMessage({
      action: 'captureQueueItems',
      listings
    });

    captureBtn.disabled = isQueueProcessing;
    captureBtn.textContent = '+ Capture from Current Page';

    if (response?.success) {
      captureStatus.textContent = `Added ${response.added} listing${response.added !== 1 ? 's' : ''} (${response.total} total in queue)`;
      captureStatus.style.color = '#28a745';
      const stored = await chrome.storage.local.get([QUEUE_KEY]);
      renderQueue(stored[QUEUE_KEY] || []);
    } else {
      captureStatus.textContent = `Error: ${response?.error || 'Unknown'}`;
      captureStatus.style.color = '#dc3545';
    }
  } catch (error) {
    captureBtn.disabled = isQueueProcessing;
    captureBtn.textContent = '+ Capture from Current Page';
    captureStatus.textContent = `Error: ${error.message}`;
    captureStatus.style.color = '#dc3545';
  }
});

processBtn.addEventListener('click', async () => {
  if (isQueueProcessing) {
    try {
      await chrome.runtime.sendMessage({ action: 'stopQueueProcessing' });
      appendQueueProgress('Stop requested \u2014 finishing current listing...', 'wait');
      updateQueueButtons(false);
    } catch (e) {
      appendQueueProgress(`Stop error: ${e.message}`, 'result-failed');
    }
    return;
  }

  try {
    queueProgressBox.textContent = '';
    const response = await chrome.runtime.sendMessage({ action: 'startQueueProcessing' });
    if (response?.success) {
      updateQueueButtons(true);
      appendQueueProgress('Queue processing started...', 'header');
    } else {
      appendQueueProgress(`Could not start: ${response?.error || 'Unknown error'}`, 'result-failed');
    }
  } catch (error) {
    appendQueueProgress(`Error: ${error.message}`, 'result-failed');
  }
});

clearQueueBtn.addEventListener('click', async () => {
  if (isQueueProcessing) {
    if (!confirm('Queue is currently processing. Stop and clear?')) return;
    await chrome.runtime.sendMessage({ action: 'stopQueueProcessing' });
  }
  if (!confirm('Clear all queued listings?')) return;
  await chrome.storage.local.set({ [QUEUE_KEY]: [] });
  renderQueue([]);
  queueProgressBox.textContent = 'Queue cleared.';
  captureStatus.textContent = '';
  updateQueueButtons(false);
});

// ============================================================================
// CONVERSATIONS
// ============================================================================

async function loadConversations() {
  const stored = await chrome.storage.local.get([CONVERSATIONS_KEY, CONVERSATIONS_LAST_CHECK_KEY, CONV_UNREAD_COUNT_KEY]);
  const conversations = stored[CONVERSATIONS_KEY] || [];
  const lastCheck = stored[CONVERSATIONS_LAST_CHECK_KEY];
  const unreadCount = stored[CONV_UNREAD_COUNT_KEY] || 0;

  // Update badge on tab
  if (unreadCount > 0) {
    convBadge.textContent = unreadCount;
    convBadge.style.display = 'block';
  } else {
    convBadge.style.display = 'none';
  }

  // Update last check time
  if (lastCheck) {
    const d = new Date(lastCheck);
    convLastCheck.textContent = `Last check: ${d.toLocaleTimeString()}`;
  }

  // Filter to conversations with messages or unread replies
  const relevant = conversations.filter(c => c.hasUnreadReply || c.messages.length > 0 || c.draftReply);

  if (relevant.length === 0) {
    convEmptyState.style.display = 'block';
    // Remove all cards but keep empty state
    Array.from(convList.children).forEach(child => {
      if (child !== convEmptyState) child.remove();
    });
    return;
  }

  convEmptyState.style.display = 'none';

  // Sort by most recent first, unread first
  relevant.sort((a, b) => {
    if (a.hasUnreadReply && !b.hasUnreadReply) return -1;
    if (!a.hasUnreadReply && b.hasUnreadReply) return 1;
    return (b.lastUpdateDateTime || '').localeCompare(a.lastUpdateDateTime || '');
  });

  // Clear existing cards (except empty state)
  Array.from(convList.children).forEach(child => {
    if (child !== convEmptyState) child.remove();
  });

  for (const conv of relevant) {
    convList.appendChild(renderConversationCard(conv));
  }
}

function renderConversationCard(conv) {
  const card = document.createElement('div');
  card.style.cssText = 'border: 1px solid #dee2e6; border-radius: 8px; background: white; overflow: hidden;';
  if (conv.hasUnreadReply) {
    card.style.borderLeftColor = '#e74c3c';
    card.style.borderLeftWidth = '3px';
  }

  // Header (always visible)
  const header = document.createElement('div');
  header.style.cssText = 'padding: 10px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;';
  header.addEventListener('click', () => {
    const body = card.querySelector('.conv-body');
    if (body) {
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    }
    // Mark as read when expanding
    if (conv.hasUnreadReply) {
      chrome.runtime.sendMessage({ action: 'markConversationRead', conversationId: conv.conversationId });
      conv.hasUnreadReply = false;
      card.style.borderLeftColor = '#dee2e6';
      card.style.borderLeftWidth = '1px';
      loadConversations(); // refresh badge
    }
  });

  const unreadDot = conv.hasUnreadReply
    ? '<span style="width:8px;height:8px;border-radius:50%;background:#e74c3c;flex-shrink:0;"></span>'
    : '';

  const lastMsg = conv.lastMessagePreview || (conv.messages.length > 0 ? conv.messages[conv.messages.length - 1].text : '');
  const preview = lastMsg.substring(0, 80) + (lastMsg.length > 80 ? '...' : '');
  const timeStr = conv.lastUpdateDateTime ? new Date(conv.lastUpdateDateTime).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  header.innerHTML = `
    ${unreadDot}
    <div style="flex:1; min-width:0;">
      <div style="font-size:12px; font-weight:600; color:#333; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${escapeHtml(conv.landlordName || 'Unknown')}
      </div>
      <div style="font-size:11px; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${escapeHtml(conv.listingTitle || conv.referenceId || '')}
      </div>
      <div style="font-size:10px; color:#aaa; margin-top:2px;">${escapeHtml(preview)}</div>
    </div>
    <div style="font-size:10px; color:#bbb; flex-shrink:0;">${timeStr}</div>
  `;
  card.appendChild(header);

  // Body (collapsed by default)
  const body = document.createElement('div');
  body.className = 'conv-body';
  body.style.cssText = 'display: none; border-top: 1px solid #eee; padding: 10px 12px;';

  // Messages thread
  if (conv.messages.length > 0) {
    const thread = document.createElement('div');
    thread.style.cssText = 'max-height: 200px; overflow-y: auto; margin-bottom: 10px;';

    for (const msg of conv.messages) {
      const bubble = document.createElement('div');
      const isUser = msg.role === 'user';
      bubble.style.cssText = `
        padding: 8px 10px; border-radius: 8px; margin-bottom: 6px; font-size: 11px; line-height: 1.4;
        max-width: 85%; word-wrap: break-word;
        ${isUser
          ? 'background: #e8f8f4; margin-left: auto; text-align: right; border-bottom-right-radius: 2px;'
          : 'background: #f0f0f0; margin-right: auto; border-bottom-left-radius: 2px;'}
      `;
      bubble.textContent = msg.text;
      if (msg.timestamp) {
        const ts = document.createElement('div');
        ts.style.cssText = 'font-size: 9px; color: #bbb; margin-top: 3px;';
        ts.textContent = new Date(msg.timestamp).toLocaleString('de-DE');
        bubble.appendChild(ts);
      }
      thread.appendChild(bubble);
    }
    body.appendChild(thread);
  }

  // Draft reply section
  const draftSection = document.createElement('div');
  draftSection.style.cssText = 'margin-top: 8px;';

  if (conv.draftStatus === 'generating') {
    draftSection.innerHTML = '<div style="font-size:11px; color:#888; font-style:italic;">Generating AI draft...</div>';
  } else {
    const draftLabel = document.createElement('div');
    draftLabel.style.cssText = 'font-size:10px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;';
    draftLabel.textContent = conv.draftReply ? 'AI Draft Reply' : 'Write Reply';
    draftSection.appendChild(draftLabel);

    const draftTextarea = document.createElement('textarea');
    draftTextarea.style.cssText = 'width:100%; min-height:80px; padding:8px; border:1px solid #ddd; border-radius:6px; font-size:11px; font-family:inherit; resize:vertical;';
    draftTextarea.value = conv.draftReply || '';
    draftTextarea.placeholder = 'Type your reply or wait for AI draft...';
    draftSection.appendChild(draftTextarea);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:6px; margin-top:6px;';

    // Send Reply button
    const sendBtn = document.createElement('button');
    sendBtn.style.cssText = 'flex:1; padding:8px; background:#83F1DC; color:#1a1a1a; border:none; border-radius:6px; font-size:11px; font-weight:500; cursor:pointer;';
    sendBtn.textContent = 'Send Reply';
    sendBtn.addEventListener('click', async () => {
      const replyText = draftTextarea.value.trim();
      if (!replyText) { alert('Please enter a reply.'); return; }
      sendBtn.disabled = true;
      sendBtn.textContent = 'Opening...';
      try {
        const result = await chrome.runtime.sendMessage({
          action: 'sendConversationReply',
          conversationId: conv.conversationId,
          message: replyText
        });
        if (result.success) {
          sendBtn.textContent = 'Tab opened - review & send';
          sendBtn.style.background = '#e6fff5';
        } else {
          sendBtn.textContent = 'Failed: ' + (result.error || 'unknown');
          sendBtn.style.background = '#fff5f5';
        }
      } catch (e) {
        sendBtn.textContent = 'Error: ' + e.message;
        sendBtn.style.background = '#fff5f5';
      }
      setTimeout(() => {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Reply';
        sendBtn.style.background = '#83F1DC';
      }, 5000);
    });
    btnRow.appendChild(sendBtn);

    // Regenerate button
    const regenBtn = document.createElement('button');
    regenBtn.style.cssText = 'padding:8px 12px; background:#f0f0f0; color:#333; border:none; border-radius:6px; font-size:11px; cursor:pointer;';
    regenBtn.textContent = 'Regenerate';
    regenBtn.addEventListener('click', async () => {
      regenBtn.disabled = true;
      regenBtn.textContent = 'Generating...';
      draftTextarea.value = '';
      draftTextarea.placeholder = 'Generating AI draft...';
      try {
        await chrome.runtime.sendMessage({ action: 'regenerateDraft', conversationId: conv.conversationId });
        // Will be updated via conversationUpdate message
      } catch (e) {
        regenBtn.textContent = 'Error';
      }
      setTimeout(() => {
        regenBtn.disabled = false;
        regenBtn.textContent = 'Regenerate';
      }, 3000);
    });
    btnRow.appendChild(regenBtn);

    // Open in browser button
    const openBtn = document.createElement('button');
    openBtn.style.cssText = 'padding:8px 12px; background:#f0f0f0; color:#333; border:none; border-radius:6px; font-size:11px; cursor:pointer;';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: `https://www.immobilienscout24.de/messenger/conversations/${conv.conversationId}`, active: true });
    });
    btnRow.appendChild(openBtn);

    draftSection.appendChild(btnRow);
  }

  body.appendChild(draftSection);
  card.appendChild(body);

  return card;
}

// Check replies button
checkRepliesBtn.addEventListener('click', async () => {
  checkRepliesBtn.disabled = true;
  checkRepliesBtn.textContent = 'Checking...';
  try {
    await chrome.runtime.sendMessage({ action: 'checkRepliesNow' });
    await loadConversations();
  } catch (e) {
    console.error('Error checking replies:', e);
  }
  checkRepliesBtn.disabled = false;
  checkRepliesBtn.textContent = 'Check Now';
});

// ============================================================================
// INITIALIZE
// ============================================================================

loadSettings();
loadQueueState();
loadActivityLog();
loadConversations();
setInterval(updateStats, 5000);
setInterval(updateCountdown, 1000);
setInterval(updateAiStats, 5000);
checkAiServerHealth();
setInterval(checkAiServerHealth, 10000);
