// Popup script for ImmoScout24 Auto Reloader

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

// Other buttons
const sendCurrentBtn = document.getElementById('sendCurrentBtn');
const testResultDiv = document.getElementById('testResult');
const testResultContent = document.getElementById('testResultContent');

// Tabs
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// ============================================================================
// TAB NAVIGATION
// ============================================================================

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    
    // Update tab buttons
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update tab content
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `tab-${targetTab}`) {
        content.classList.add('active');
      }
    });
  });
});

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

let isMonitoring = false;

async function loadSettings() {
  const result = await chrome.storage.local.get([
    'searchUrl', 'messageTemplate', 'autoSendMode', 'checkInterval', 'rateLimit', 'minDelay',
    'formSalutation', 'formPhone', 'formAdults', 'formChildren', 'formPets', 'formSmoker', 'formIncome',
    'formHouseholdSize', 'formEmployment', 'formIncomeRange', 'formDocuments'
  ]);
  
  if (result.searchUrl) searchUrlInput.value = result.searchUrl;
  if (result.messageTemplate) messageTemplateInput.value = result.messageTemplate;
  if (result.autoSendMode) autoSendModeInput.value = result.autoSendMode;
  if (result.checkInterval !== undefined) checkIntervalInput.value = result.checkInterval;
  if (result.rateLimit !== undefined) rateLimitInput.value = result.rateLimit;
  if (result.minDelay !== undefined) minDelayInput.value = result.minDelay;
  
  if (result.formSalutation) formSalutationInput.value = result.formSalutation;
  if (result.formPhone !== undefined) formPhoneInput.value = result.formPhone;
  if (result.formAdults !== undefined) formAdultsInput.value = result.formAdults;
  if (result.formChildren !== undefined) formChildrenInput.value = result.formChildren;
  if (result.formPets) formPetsInput.value = result.formPets;
  if (result.formSmoker) formSmokerInput.value = result.formSmoker;
  if (result.formIncome !== undefined) formIncomeInput.value = result.formIncome;
  if (result.formHouseholdSize) formHouseholdSizeInput.value = result.formHouseholdSize;
  if (result.formEmployment) formEmploymentInput.value = result.formEmployment;
  if (result.formIncomeRange) formIncomeRangeInput.value = result.formIncomeRange;
  if (result.formDocuments) formDocumentsInput.value = result.formDocuments;
  
  const statusResult = await chrome.runtime.sendMessage({ action: 'getStatus' });
  updateStatus(statusResult.isMonitoring);
}

async function saveSettings() {
  await chrome.storage.local.set({
    searchUrl: searchUrlInput.value.trim(),
    messageTemplate: messageTemplateInput.value,
    autoSendMode: autoSendModeInput.value || 'auto',
    checkInterval: Math.max(60, Math.min(3600, parseInt(checkIntervalInput.value) || 60)),
    rateLimit: Math.max(1, Math.min(50, parseInt(rateLimitInput.value) || 10)),
    minDelay: Math.max(10, Math.min(300, parseInt(minDelayInput.value) || 30)),
    formSalutation: formSalutationInput.value || 'Frau',
    formPhone: formPhoneInput.value || '',
    formAdults: Math.max(1, Math.min(10, parseInt(formAdultsInput.value) || 1)),
    formChildren: Math.max(0, Math.min(10, parseInt(formChildrenInput.value) || 0)),
    formPets: formPetsInput.value || 'Nein',
    formSmoker: formSmokerInput.value || 'Nein',
    formIncome: Math.max(0, Math.min(50000, parseInt(formIncomeInput.value) || 2000)),
    formHouseholdSize: formHouseholdSizeInput.value || 'Einpersonenhaushalt',
    formEmployment: formEmploymentInput.value || 'Angestellte:r',
    formIncomeRange: formIncomeRangeInput.value || '1.500 - 2.000',
    formDocuments: formDocumentsInput.value || 'Vorhanden'
  });
}

function updateStatus(monitoring) {
  isMonitoring = monitoring;
  
  if (monitoring) {
    statusBadge.textContent = 'Active';
    statusBadge.className = 'status-badge active';
    toggleBtn.className = 'toggle-btn stop';
    toggleIcon.textContent = '⏹';
    toggleText.textContent = 'Stop';
  } else {
    statusBadge.textContent = 'Stopped';
    statusBadge.className = 'status-badge inactive';
    toggleBtn.className = 'toggle-btn start';
    toggleIcon.textContent = '▶';
    toggleText.textContent = 'Start';
  }
}

// ============================================================================
// EVENT LISTENERS - AUTO-SAVE
// ============================================================================

const allInputs = [
  searchUrlInput, messageTemplateInput, autoSendModeInput, checkIntervalInput, rateLimitInput, minDelayInput,
  formSalutationInput, formPhoneInput, formAdultsInput, formChildrenInput, formPetsInput, formSmokerInput,
  formIncomeInput, formHouseholdSizeInput, formEmploymentInput, formIncomeRangeInput, formDocumentsInput
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
    // Stop monitoring
    const response = await chrome.runtime.sendMessage({ action: 'stopMonitoring' });
    if (response?.success) {
      updateStatus(false);
    }
  } else {
    // Start monitoring
    if (!searchUrlInput.value.trim()) {
      alert('Please enter a search URL');
      // Switch to main tab
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="main"]').classList.add('active');
      tabContents.forEach(c => c.classList.remove('active'));
      document.getElementById('tab-main').classList.add('active');
      searchUrlInput.focus();
      return;
    }
    
    if (!messageTemplateInput.value.trim()) {
      alert('Please enter a message');
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="main"]').classList.add('active');
      tabContents.forEach(c => c.classList.remove('active'));
      document.getElementById('tab-main').classList.add('active');
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
  }
});

function generatePersonalizedMessage(template, landlordTitle, landlordName) {
  let message = template || '';
  
  // Only use personalized name if we have a recognized title (Frau/Herr)
  const hasValidTitle = landlordTitle === 'Frau' || landlordTitle === 'Herr';
  
  if (message.includes('{name}')) {
    const nameReplacement = hasValidTitle && landlordName 
      ? `${landlordTitle} ${landlordName}`
      : 'Damen und Herren';
    message = message.replace(/{name}/g, nameReplacement);
  }
  
  if (!template.includes('{name}')) {
    let greeting = 'Sehr geehrte Damen und Herren,';
    if (landlordTitle === 'Frau' && landlordName) {
      greeting = `Sehr geehrte Frau ${landlordName},`;
    } else if (landlordTitle === 'Herr' && landlordName) {
      greeting = `Sehr geehrter Herr ${landlordName},`;
    }
    
    const hasGreeting = /^(Sehr\s+geehrte|Liebe|Hallo|Guten\s+Tag)/i.test(message.trim());
    if (!hasGreeting) {
      message = `${greeting}\n\n${message}`;
    }
  }
  
  return message;
}

sendCurrentBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url?.includes('immobilienscout24.de/expose/')) {
      showTestResult('❌ Please open a listing on ImmoScout24 first!\n\nURL should contain "/expose/"', true);
      return;
    }
    
    const template = messageTemplateInput.value.trim();
    if (!template) {
      showTestResult('❌ Please enter a message first!', true);
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="main"]').classList.add('active');
      tabContents.forEach(c => c.classList.remove('active'));
      document.getElementById('tab-main').classList.add('active');
      messageTemplateInput.focus();
      return;
    }
    
    await saveSettings();
    
    sendCurrentBtn.disabled = true;
    sendCurrentBtn.textContent = '⏳ Sending...';
    showTestResult('🚀 Starting message send...\n───────────', false);
    
    const formValues = {
      salutation: formSalutationInput.value || 'Frau',
      phone: formPhoneInput.value || '',
      adults: parseInt(formAdultsInput.value) || 2,
      children: parseInt(formChildrenInput.value) || 0,
      pets: formPetsInput.value || 'Nein',
      smoker: formSmokerInput.value || 'Nein',
      income: parseInt(formIncomeInput.value) || 4500,
      householdSize: formHouseholdSizeInput.value || 'Zwei Erwachsene',
      employmentType: formEmploymentInput.value || 'Angestellte:r',
      incomeRange: formIncomeRangeInput.value || '4.000 - 5.000',
      documents: formDocumentsInput.value || 'Vorhanden'
    };
    
    let landlordTitle = null, landlordName = null;
    try {
      const nameResponse = await chrome.tabs.sendMessage(tab.id, { action: 'extractLandlordName' });
      if (nameResponse) {
        landlordTitle = nameResponse.title;
        landlordName = nameResponse.name;
      }
    } catch (e) { /* ignore */ }
    
    const personalizedMessage = generatePersonalizedMessage(template, landlordTitle, landlordName);
    
    const sendResult = await chrome.tabs.sendMessage(tab.id, {
      action: 'sendMessage',
      message: personalizedMessage,
      formValues: formValues
    });
    
    sendCurrentBtn.disabled = false;
    sendCurrentBtn.textContent = '📨 Send to Current Listing';
    
    const landlordInfo = landlordTitle && landlordName ? `${landlordTitle} ${landlordName}` : landlordName || 'Unknown';
    
    if (sendResult?.success) {
      appendToResult('\n─────────────────────');
      appendToResult(`\n✅ DONE!\n\n👤 Landlord: ${landlordInfo}\n\n📧 Message:\n${sendResult.messageSent || personalizedMessage}`);
      testResultDiv.style.borderColor = '#28a745';
      testResultDiv.style.background = '#f0fff4';
    } else {
      appendToResult('\n─────────────────────');
      appendToResult(`\n❌ ERROR: ${sendResult?.error || 'Unknown'}\n\n👤 Landlord: ${landlordInfo}\n\n💡 Make sure you're logged in to ImmoScout24`);
      testResultDiv.style.borderColor = '#dc3545';
      testResultDiv.style.background = '#fff5f5';
    }
    
  } catch (error) {
    sendCurrentBtn.disabled = false;
    sendCurrentBtn.textContent = '📨 Send to Current Listing';
    
    let errorMsg = `❌ Error: ${error.message}`;
    if (error.message.includes('Receiving end does not exist')) {
      errorMsg += '\n\n🔄 Please REFRESH the listing page and try again';
    }
    showTestResult(errorMsg, true);
  }
});

// ============================================================================
// INITIALIZE
// ============================================================================

loadSettings();
