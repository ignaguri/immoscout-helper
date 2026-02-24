// Content script for ImmoScout24 Auto Reloader

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function randomDelay(baseMs, varianceMs = 0) {
  const variance = varianceMs > 0 ? Math.floor(Math.random() * varianceMs * 2) - varianceMs : 0;
  return Math.max(100, baseMs + variance);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Set input value with React compatibility
function setInputValue(input, value) {
  if (!input || value === undefined || value === null) return false;
  
  try {
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
  } catch (e) {
    input.value = value;
  }
  
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

// Set select dropdown value
function setSelectValue(select, value) {
  if (!select || !value) return false;
  
  const option = Array.from(select.options || []).find(opt =>
    opt.value.toLowerCase() === value.toLowerCase() ||
    opt.textContent.toLowerCase().includes(value.toLowerCase())
  );
  
  if (option) {
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

// Find element by selectors (returns first match)
function findElement(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

// Find element by label text
function findByLabel(keywords, elementType = 'input') {
  for (const keyword of keywords) {
    // By attribute
    const byAttr = document.querySelector(
      `${elementType}[name*="${keyword}" i], ${elementType}[id*="${keyword}" i], ${elementType}[data-testid*="${keyword}" i]`
    );
    if (byAttr) return byAttr;
    
    // By label
    for (const label of document.querySelectorAll('label')) {
      if (label.textContent.toLowerCase().includes(keyword)) {
        const container = label.closest('div, fieldset, li') || label.parentElement;
        const el = container?.querySelector(elementType) || document.getElementById(label.getAttribute('for'));
        if (el) return el;
      }
    }
  }
  return null;
}

// ============================================================================
// LISTING EXTRACTION
// ============================================================================

function extractListings() {
  const listings = [];
  const selectors = [
    'article[data-item="result"]',
    '[data-go-to-expose-id]',
    'li[data-id]',
    '.result-list-entry',
    'a[href*="/expose/"]'
  ];
  
  let elements = [];
  for (const selector of selectors) {
    elements = document.querySelectorAll(selector);
    if (elements.length > 0) break;
  }
  
  // Fallback: find by expose links
  if (elements.length === 0) {
    const links = Array.from(document.querySelectorAll('a[href*="/expose/"]'))
      .filter(link => link.getAttribute('href')?.match(/\/expose\/\d+/));
    const containers = new Map();
    links.forEach(link => {
      const container = link.closest('article, li, div[class*="result"]') || link;
      if (!containers.has(container)) containers.set(container, link);
    });
    elements = Array.from(containers.keys());
  }
  
  elements.forEach((el, index) => {
    try {
      let exposeId = el.getAttribute('data-go-to-expose-id') || 
                     el.getAttribute('data-id') || 
                     el.getAttribute('data-expose-id');
      
      const link = el.querySelector('a[href*="/expose/"]') || 
                   el.closest('a[href*="/expose/"]') ||
                   (el.tagName === 'A' && el.href?.includes('/expose/') ? el : null);
      
      let url = link?.href?.startsWith('http') ? link.href : 
                link ? `https://www.immobilienscout24.de${link.getAttribute('href')}` : null;
      
      if (!exposeId && url) {
        const match = url.match(/\/expose\/(\d+)/);
        exposeId = match?.[1];
      }
      
      if (exposeId && !url) {
        url = `https://www.immobilienscout24.de/expose/${exposeId}`;
      }
      
      if (exposeId && url) {
        const title = el.querySelector('h2, h3, h4, [class*="title"]')?.textContent?.trim() || 'Unknown';
        listings.push({ id: exposeId.toLowerCase(), url, title, index });
      }
    } catch (e) { /* skip invalid */ }
  });
  
  listings.sort((a, b) => a.index - b.index);
  console.log(`[IS24] Found ${listings.length} listings`);
  return listings;
}

// ============================================================================
// LANDLORD NAME EXTRACTION
// ============================================================================

function extractLandlordName() {
  const selectors = [
    '.is24qa-offerer-name',
    '[data-qa="contactName"]',
    '.contact-box__name',
    '.contact-name',
    '.realtor-title',
    '[class*="contact"] [class*="name"]'
  ];
  
  let nameEl = findElement(selectors);
  
  // Fallback: search contact sections
  if (!nameEl) {
    for (const section of document.querySelectorAll('[class*="contact"], .contact-box')) {
      for (const heading of section.querySelectorAll('h1, h2, h3, h4, strong')) {
        const text = heading.textContent.trim();
        if (text.length > 2 && text.length < 50 && /^[A-ZÄÖÜ]/.test(text)) {
          nameEl = heading;
          break;
        }
      }
      if (nameEl) break;
    }
  }
  
  if (!nameEl) return { title: null, name: null };
  
  const text = nameEl.textContent.trim().split('\n')[0].split(',')[0].trim();
  
  const frauMatch = text.match(/^Frau\s+(.+)/i);
  if (frauMatch) return { title: 'Frau', name: frauMatch[1].trim() };
  
  const herrMatch = text.match(/^Herr\s+(.+)/i);
  if (herrMatch) return { title: 'Herr', name: herrMatch[1].trim() };
  
  return { title: null, name: text || null };
}

// ============================================================================
// FORM FIELD FILLING
// ============================================================================

const DEFAULT_FORM_VALUES = {
  adults: 1,
  children: 0,
  pets: 'Nein',
  income: 2000,
  householdSize: 'Einpersonenhaushalt',
  employmentType: 'Angestellte:r',
  incomeRange: '1.500 - 2.000',
  documents: 'Vorhanden',
  salutation: 'Frau',
  phone: ''
};

async function fillFormFields(formValues = {}) {
  const values = { ...DEFAULT_FORM_VALUES, ...formValues };
  let filled = 0;
  
  // Number/text fields
  const textFields = [
    { keywords: ['erwachsene', 'adults'], value: values.adults },
    { keywords: ['kinder', 'children'], value: values.children },
    { keywords: ['einkommen', 'income', 'gehalt'], value: values.income },
    { keywords: ['telefon', 'phone', 'handy'], value: values.phone }
  ];
  
  for (const field of textFields) {
    if (field.value === '' || field.value === undefined) continue;
    const input = findByLabel(field.keywords, 'input');
    if (input && setInputValue(input, field.value)) {
      filled++;
    }
    await sleep(randomDelay(50, 30));
  }
  
  // Select/dropdown fields
  const selectFields = [
    { keywords: ['anrede'], value: values.salutation },
    { keywords: ['haushaltsgröße', 'haushaltsgroesse'], value: values.householdSize },
    { keywords: ['haustiere'], value: values.pets },
    { keywords: ['beschäftigung', 'beschaeftigung', 'beruf'], value: values.employmentType },
    { keywords: ['einkommen', 'income'], value: values.incomeRange },
    { keywords: ['bewerbungsunterlagen', 'unterlagen'], value: values.documents }
  ];
  
  for (const field of selectFields) {
    // Try select dropdown
    const select = findByLabel(field.keywords, 'select');
    if (select && setSelectValue(select, field.value)) {
      filled++;
      await sleep(randomDelay(50, 30));
      continue;
    }
    
    // Try radio buttons
    for (const keyword of field.keywords) {
      for (const label of document.querySelectorAll('label, span, div')) {
        if (!label.textContent.toLowerCase().includes(keyword)) continue;
        
        const container = label.closest('div, fieldset, li') || label.parentElement;
        if (!container) continue;
        
        // Check for select in container
        const containerSelect = container.querySelector('select');
        if (containerSelect && setSelectValue(containerSelect, field.value)) {
          filled++;
          break;
        }
        
        // Check for radio buttons
        const radio = Array.from(container.querySelectorAll('input[type="radio"]'))
          .find(r => {
            const rLabel = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
            return rLabel?.textContent.toLowerCase().includes(field.value.toLowerCase());
          });
        
        if (radio && !radio.checked) {
          radio.click();
          filled++;
          break;
        }
      }
    }
    await sleep(randomDelay(50, 30));
  }
  
  return filled;
}

// ============================================================================
// MESSAGE SENDING
// ============================================================================

async function sendMessageToLandlord(message, formValues = {}, autoSend = true) {
  const log = [];
  const addLog = (msg) => { 
    log.push(msg); 
    console.log('[IS24]', msg);
    // Send real-time update to popup
    chrome.runtime.sendMessage({ action: 'progressUpdate', message: msg }).catch(() => {});
  };
  
  try {
    addLog(`📝 Starting to send message (${message.length} chars)`);
    await sleep(randomDelay(1500, 500));
    
    // Check if form is already visible
    let textarea = document.querySelector('textarea[name="message"], textarea[id="message"], textarea[data-testid="message"]');
    
    if (!textarea) {
      addLog('🔍 Looking for contact button...');
      
      // Click contact button to open form
      const contactSelectors = [
        'button[data-testid="contact-button"]',
        'button[data-qa="sendButton"]:not([type="submit"])',
        'button[class*="Button_button-primary"]:not([type="submit"])'
      ];
      
      let contactBtn = findElement(contactSelectors);
      
      // Fallback: find by text
      if (!contactBtn) {
        contactBtn = Array.from(document.querySelectorAll('button, a'))
          .find(btn => {
            if (btn.type === 'submit') return false;
            const text = btn.textContent.toLowerCase();
            return text.includes('nachricht') || text.includes('kontakt') || text.includes('anfrage');
          });
      }
      
      if (contactBtn) {
        addLog('✅ Found contact button, opening form...');
        contactBtn.click();
        await sleep(randomDelay(3000, 1000));
        addLog('⏳ Waiting for form to load...');
      } else {
        addLog('⚠️ No contact button found');
      }
    } else {
      addLog('✅ Form already visible');
    }
    
    // Find textarea
    const textareaSelectors = [
      'textarea[name="message"]',
      'textarea[id="message"]',
      'textarea[data-testid="message"]',
      'textarea[class*="TextArea"]',
      'form textarea',
      'textarea'
    ];
    
    textarea = findElement(textareaSelectors);
    
    if (!textarea) {
      addLog('❌ ERROR: Message textarea not found!');
      return { success: false, error: 'Message textarea not found', log };
    }
    
    addLog('✅ Found message textarea');
    
    // Fill message
    textarea.focus();
    textarea.value = '';
    
    // Type message in chunks for React compatibility
    addLog('⌨️ Typing message...');
    const chunkSize = 30;
    for (let i = 0; i < message.length; i += chunkSize) {
      textarea.value += message.slice(i, i + chunkSize);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(randomDelay(30, 20));
    }
    
    // Ensure React state is updated
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(textarea, message);
    } catch (e) { /* ignore */ }
    
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    
    addLog(`✅ Message filled (${textarea.value.length} chars)`);
    
    await sleep(randomDelay(500, 200));
    
    // Fill additional form fields
    addLog('📋 Filling form fields...');
    const fieldsFilled = await fillFormFields(formValues);
    addLog(`✅ Filled ${fieldsFilled} form fields`);
    
    await sleep(randomDelay(500, 200));
    
    // Find submit button
    const submitSelectors = [
      'button[type="submit"][class*="Button_button-primary"]',
      'button[type="submit"]',
      'form button[type="submit"]'
    ];
    
    let submitBtn = findElement(submitSelectors);
    
    if (!submitBtn) {
      submitBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => {
          const text = btn.textContent.toLowerCase();
          return text.includes('abschicken') || text.includes('senden');
        });
    }
    
    if (!submitBtn) {
      addLog('❌ ERROR: Submit button not found!');
      return { success: false, error: 'Submit button not found', log };
    }
    
    addLog('✅ Found submit button');
    
    // If manual mode, don't click submit - just return success (form is filled)
    if (!autoSend) {
      addLog('📋 Form filled - manual mode, waiting for user to review and send');
      return { success: true, messageSent: message, manualMode: true, log };
    }
    
    if (submitBtn.disabled) {
      addLog('⏳ Submit button disabled, waiting...');
      await sleep(1000);
      if (submitBtn.disabled) {
        addLog('❌ ERROR: Submit button still disabled!');
        return { success: false, error: 'Submit button is disabled', log };
      }
    }
    
    // Submit form (single click only)
    addLog('🚀 Submitting form...');
    submitBtn.click();
    
    // Wait for confirmation
    addLog('⏳ Waiting for confirmation...');
    const startTime = Date.now();
    while (Date.now() - startTime < 8000) {
      await sleep(300);
      
      const formGone = !document.querySelector('textarea[name="message"]');
      const success = document.querySelector('[class*="success"], [class*="erfolg"]');
      
      if (formGone || success) {
        addLog('🎉 SUCCESS: Message sent!');
        return { success: true, messageSent: message, log };
      }
    }
    
    addLog('⚠️ Could not confirm (assuming success)');
    return { success: true, messageSent: message, log };
    
  } catch (error) {
    addLog(`❌ ERROR: ${error.message}`);
    return { success: false, error: error.message, log };
  }
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'ping':
      sendResponse({ ready: true });
      break;
      
    case 'extractListings':
      sendResponse({ listings: extractListings() });
      break;
      
    case 'extractLandlordName':
      sendResponse(extractLandlordName());
      break;
      
    case 'sendMessage':
      sendMessageToLandlord(request.message, request.formValues || {}, request.autoSend !== false)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response
  }
  
  return false;
});

console.log('[IS24] Content script loaded');
