<script lang="ts">
import { PROVIDERS } from '../../shared/ai-router';
import { CAPTCHA_SYSTEM_PROMPT, CAPTCHA_USER_PROMPT } from '../../shared/prompts';
import { generatePersonalizedMessage } from '../../shared/utils';
import ActivityLogEntry from '../components/ActivityLogEntry.svelte';
import AnalyzeSection from '../components/AnalyzeSection.svelte';
import type { PopupSettings } from '../lib/storage';
import { clearActivityLog, saveAllSettings, trackTokenUsage } from '../lib/storage';

let {
  settings = $bindable(),
  settingsLoaded = false,
  activityLog = $bindable(),
  testResultVisible = $bindable(false),
  testResultContent = $bindable(''),
  testResultIsError = $bindable(false),
  analyzeResult = $bindable<any>(null),
  lastAnalyzeContext = $bindable<any>(null),
}: {
  settings: PopupSettings;
  settingsLoaded: boolean;
  activityLog: any[];
  testResultVisible: boolean;
  testResultContent: string;
  testResultIsError: boolean;
  analyzeResult: any;
  lastAnalyzeContext: any;
} = $props();

let sendCurrentBtnText = $state('Send Template Message');
let sendCurrentBtnDisabled = $state(false);
let logBoxEl: HTMLDivElement | undefined = $state();

// Auto-scroll activity log when entries change
$effect(() => {
  if (activityLog.length && logBoxEl) {
    logBoxEl.scrollTop = logBoxEl.scrollHeight;
  }
});

async function autoSave() {
  if (!settingsLoaded) return;
  await saveAllSettings(settings);
}

async function handleCheckIntervalChange() {
  await autoSave();
  // If monitoring, update the alarm interval
  try {
    const status = await chrome.runtime.sendMessage({ action: 'getStatus' });
    if (status.isMonitoring) {
      await chrome.runtime.sendMessage({
        action: 'updateInterval',
        interval: settings.checkInterval || 60,
      });
    }
  } catch {
    /* ignore */
  }
}

function showTestResult(content: string, isError = false) {
  testResultVisible = true;
  testResultContent = content;
  testResultIsError = isError;
}

function appendToResult(line: string) {
  testResultVisible = true;
  testResultContent += `\n${line}`;
}

function getFormValues() {
  return {
    salutation: settings.formSalutation || 'Frau',
    phone: settings.formPhone || '',
    adults: settings.formAdults || 2,
    children: settings.formChildren || 0,
    pets: settings.formPets || 'Nein',
    smoker: settings.formSmoker || 'Nein',
    income: settings.formIncome || 2000,
    householdSize: settings.formHouseholdSize || 'Einpersonenhaushalt',
    employmentType: settings.formEmployment || 'Angestellte:r',
    incomeRange: settings.formIncomeRange || '1.500 - 2.000',
    documents: settings.formDocuments || 'Vorhanden',
  };
}

async function trySolveCaptchaFromPopup(tabId: number): Promise<{ solved: boolean; messageSent?: boolean }> {
  const currentApiKey = settings.aiProvider === 'gemini' ? settings.aiApiKeyGemini : settings.aiApiKeyOpenai;
  const isDirect = settings.aiMode === 'direct' && !!currentApiKey;
  const serverUrl = settings.aiServerUrl || 'http://localhost:3456';
  const apiKey = currentApiKey || undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    appendToResult(`Captcha detected - solving (attempt ${attempt}/2)...`);
    let detection: any;
    try {
      detection = await chrome.tabs.sendMessage(tabId, { action: 'detectCaptcha' });
    } catch (e: any) {
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
      let captchaText: string | null = null;

      if (isDirect && apiKey) {
        const match = detection.imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) {
          appendToResult('Invalid captcha image format');
          return { solved: false };
        }
        const provider = PROVIDERS[settings.aiProvider] ?? PROVIDERS.gemini;
        const result = await provider.generateWithImage(
          apiKey,
          CAPTCHA_SYSTEM_PROMPT,
          match[2],
          match[1],
          CAPTCHA_USER_PROMPT,
          { maxTokens: 32 },
        );
        const answer = result.text.trim().replace(/[^a-zA-Z0-9]/g, '');
        captchaText = answer && answer.length >= 4 && answer.length <= 7 ? answer : null;
        await trackTokenUsage(result.usage.promptTokens, result.usage.completionTokens);
        if (!captchaText) {
          appendToResult(`AI could not solve captcha (raw: "${result.text.trim()}")`);
          return { solved: false };
        }
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${serverUrl}/captcha`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: detection.imageBase64, apiKey, provider: settings.aiProvider }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const result = await response.json();
        captchaText = result.text || null;
        if (result.usage) {
          await trackTokenUsage(result.usage.promptTokens || 0, result.usage.completionTokens || 0);
        }
        if (!captchaText) {
          appendToResult(`Server could not solve captcha: ${result.error}`);
          return { solved: false };
        }
      }

      appendToResult(`Solution: "${captchaText}", submitting...`);
      const solveResult = await chrome.tabs.sendMessage(tabId, {
        action: 'solveCaptcha',
        text: captchaText,
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
    } catch (e: any) {
      appendToResult(`Captcha attempt ${attempt} error: ${e.message}`);
    }
  }
  appendToResult('All captcha attempts failed');
  return { solved: false };
}

async function handleSendTemplate() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url?.includes('immobilienscout24.de/expose/')) {
      showTestResult('Please open a listing on ImmoScout24 first!\n\nURL should contain "/expose/"', true);
      return;
    }
    const template = settings.messageTemplate.trim();
    if (!template) {
      showTestResult('Please enter a message first!', true);
      return;
    }
    await autoSave();

    sendCurrentBtnDisabled = true;
    sendCurrentBtnText = 'Sending...';
    showTestResult('Starting message send...\n---', false);

    const formValues = getFormValues();
    let landlordTitle: string | null = null,
      landlordName: string | null = null;
    try {
      const nameResponse = await chrome.tabs.sendMessage(tab.id!, { action: 'extractLandlordName' });
      if (nameResponse) {
        landlordTitle = nameResponse.title;
        landlordName = nameResponse.name;
      }
    } catch {
      /* ignore */
    }

    const personalizedMessage = generatePersonalizedMessage(template, landlordTitle, landlordName);
    let sendResult = await chrome.tabs.sendMessage(tab.id!, {
      action: 'sendMessage',
      message: personalizedMessage,
      formValues,
    });

    if (sendResult && !sendResult.success && sendResult.captchaBlocked) {
      const captchaResult = await trySolveCaptchaFromPopup(tab.id!);
      if (captchaResult.messageSent) {
        sendResult = { success: true, messageSent: personalizedMessage };
      } else if (captchaResult.solved) {
        try {
          sendResult = await chrome.tabs.sendMessage(tab.id!, {
            action: 'sendMessage',
            message: personalizedMessage,
            formValues,
          });
        } catch (e: any) {
          appendToResult(`Retry failed: ${e.message}`);
        }
      }
    }

    sendCurrentBtnDisabled = false;
    sendCurrentBtnText = 'Send Template Message';
    const landlordInfo = landlordTitle && landlordName ? `${landlordTitle} ${landlordName}` : landlordName || 'Unknown';

    if (sendResult?.success) {
      appendToResult('\n---');
      appendToResult(
        `\nDONE!\n\nLandlord: ${landlordInfo}\n\nMessage:\n${sendResult.messageSent || personalizedMessage}`,
      );
      testResultIsError = false;
    } else {
      appendToResult('\n---');
      appendToResult(
        `\nERROR: ${sendResult?.error || 'Unknown'}\n\nLandlord: ${landlordInfo}\n\nMake sure you're logged in to ImmoScout24`,
      );
      testResultIsError = true;
    }
  } catch (error: any) {
    sendCurrentBtnDisabled = false;
    sendCurrentBtnText = 'Send Template Message';
    let errorMsg = `Error: ${error.message}`;
    if (error.message.includes('Receiving end does not exist')) {
      errorMsg += '\n\nPlease REFRESH the listing page and try again';
    }
    showTestResult(errorMsg, true);
  }
}

async function handleClearActivity() {
  await clearActivityLog();
  activityLog = [];
}
</script>

<div class="field">
  <label for="searchUrl">Search URL</label>
  <input
    type="url"
    id="searchUrl"
    bind:value={settings.searchUrl}
    oninput={autoSave}
    onblur={autoSave}
    placeholder="https://www.immobilienscout24.de/Suche/..."
  />
  <div class="hint">Paste your ImmoScout24 search results URL</div>
</div>

<div class="field">
  <label for="autoSendMode">Send Mode</label>
  <select id="autoSendMode" bind:value={settings.autoSendMode} onchange={autoSave}>
    <option value="auto">Auto (fill + submit)</option>
    <option value="manual">Manual (fill only)</option>
  </select>
</div>

<div class="section-title">Activity Log</div>

<div class="activity-log-box" bind:this={logBoxEl}>
  {#if activityLog.length === 0}
    <span style="color:#999;">No activity yet.</span>
  {:else}
    {#each activityLog as entry}
      <ActivityLogEntry {entry} />
    {/each}
  {/if}
</div>

<button class="btn btn-secondary" onclick={handleClearActivity}>Clear Activity Log</button>

<div class="section-title">Test</div>

<AnalyzeSection
  {settings}
  bind:testResultVisible
  bind:testResultContent
  bind:testResultIsError
  bind:analyzeResult
  bind:lastAnalyzeContext
  {appendToResult}
  {showTestResult}
/>

{#if testResultVisible}
  <div
    class="test-result"
    style="border-color: {testResultIsError ? '#dc3545' : '#28a745'}; background: {testResultIsError ? '#fff5f5' : '#f0fff4'};"
  >
    <pre class="test-result-content">{testResultContent}</pre>
  </div>
{/if}

<button class="btn btn-test" disabled={sendCurrentBtnDisabled} onclick={handleSendTemplate} style="margin-top:8px;">
  {sendCurrentBtnText}
</button>

<style>
  .activity-log-box {
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 6px;
    padding: 10px;
    max-height: 200px;
    overflow-y: auto;
    font-size: 11px;
    margin-bottom: 8px;
  }

  .test-result {
    margin-top: 12px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #dee2e6;
    max-height: 200px;
    overflow-y: auto;
  }

  .test-result-content {
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'SF Mono', Monaco, monospace;
    margin: 0;
  }
</style>
