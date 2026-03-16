<script lang="ts">
import { PROVIDERS } from '../../shared/ai-router';
import { CAPTCHA_SYSTEM_PROMPT, CAPTCHA_USER_PROMPT } from '../../shared/prompts';
import { generatePersonalizedMessage } from '../../shared/utils';
import ActivityLogEntry from '../components/ActivityLogEntry.svelte';
import AnalyzeSection from '../components/AnalyzeSection.svelte';
import CollapsibleSection from '../components/CollapsibleSection.svelte';
import { approvePendingListing, captureQueueItems, skipPendingListing, startQueueProcessing, stopQueueProcessing } from '../lib/messages';
import type { PopupSettings } from '../lib/storage';
import type { PendingApprovalItem } from '../../shared/types';
import { clearActivityLog, clearQueue, loadQueue, saveAllSettings, trackTokenUsage } from '../lib/storage';

let {
  settings = $bindable(),
  settingsLoaded = false,
  activityLog = $bindable(),
  testResultVisible = $bindable(false),
  testResultContent = $bindable(''),
  testResultIsError = $bindable(false),
  analyzeResult = $bindable<any>(null),
  lastAnalyzeContext = $bindable<any>(null),
  queue = $bindable(),
  isQueueProcessing = $bindable(),
  queueProgressLines = $bindable(),
  pendingApproval = $bindable<PendingApprovalItem[]>([]),
  isMonitoring = false,
}: {
  settings: PopupSettings;
  settingsLoaded: boolean;
  activityLog: any[];
  testResultVisible: boolean;
  testResultContent: string;
  testResultIsError: boolean;
  analyzeResult: any;
  lastAnalyzeContext: any;
  queue: any[];
  isQueueProcessing: boolean;
  queueProgressLines: Array<{ text: string; type: string }>;
  pendingApproval: PendingApprovalItem[];
  isMonitoring: boolean;
} = $props();

let sendCurrentBtnText = $state('Send Template Message');
let sendCurrentBtnDisabled = $state(false);
let logBoxEl: HTMLDivElement | undefined = $state();

// Queue state
let captureStatus = $state('');
let captureStatusColor = $state('');
let captureBtnText = $state('Capture');
let captureBtnDisabled = $state(false);
let queueOpen = $derived(queue.length > 0);
let queueTitle = $derived(`Queue (${queue.length} pending)`);
let newUrlInput = $state('');

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

function addSearchUrl() {
  const url = newUrlInput.trim();
  if (!url) return;
  if (!settings.searchUrls.includes(url)) {
    settings.searchUrls = [...settings.searchUrls, url];
    autoSave();
  }
  newUrlInput = '';
}

function removeSearchUrl(index: number) {
  settings.searchUrls = settings.searchUrls.filter((_: string, i: number) => i !== index);
  autoSave();
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

async function handleApprove(item: PendingApprovalItem) {
  await approvePendingListing(item);
  pendingApproval = pendingApproval.filter((p) => p.id !== item.id);
}

async function handleSkipPending(id: string) {
  await skipPendingListing(id);
  pendingApproval = pendingApproval.filter((p) => p.id !== id);
}

async function handleCapture() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url?.includes('immobilienscout24.de')) {
      captureStatus = 'Please open an ImmoScout24 search page first.';
      captureStatusColor = '#dc3545';
      return;
    }

    captureBtnDisabled = true;
    captureBtnText = 'Capturing...';
    captureStatus = '';

    let listings: any[];
    try {
      const result = await chrome.tabs.sendMessage(tab.id!, { action: 'extractListings' });
      listings = result?.listings || [];
    } catch {
      captureStatus = 'Could not read listings. Refresh the page and try again.';
      captureStatusColor = '#dc3545';
      captureBtnDisabled = false;
      captureBtnText = 'Capture';
      return;
    }

    if (listings.length === 0) {
      captureStatus = 'No listings found on this page.';
      captureStatusColor = '#888';
      captureBtnDisabled = false;
      captureBtnText = 'Capture';
      return;
    }

    const response = await captureQueueItems(listings);
    captureBtnDisabled = isQueueProcessing;
    captureBtnText = 'Capture';

    if (response?.success) {
      captureStatus = `Added ${response.added} listing${response.added !== 1 ? 's' : ''} (${response.total} total in queue)`;
      captureStatusColor = '#28a745';
      queue = await loadQueue();
    } else {
      captureStatus = `Error: ${response?.error || 'Unknown'}`;
      captureStatusColor = '#dc3545';
    }
  } catch (error: any) {
    captureBtnDisabled = isQueueProcessing;
    captureBtnText = 'Capture';
    captureStatus = `Error: ${error.message}`;
    captureStatusColor = '#dc3545';
  }
}

async function handleProcess() {
  if (isQueueProcessing) {
    try {
      await stopQueueProcessing();
      queueProgressLines = [
        ...queueProgressLines,
        { text: 'Stop requested \u2014 finishing current listing...', type: 'wait' },
      ];
      isQueueProcessing = false;
    } catch (e: any) {
      queueProgressLines = [...queueProgressLines, { text: `Stop error: ${e.message}`, type: 'result-failed' }];
    }
    return;
  }

  try {
    queueProgressLines = [];
    const response = await startQueueProcessing();
    if (response?.success) {
      isQueueProcessing = true;
      queueProgressLines = [{ text: 'Queue processing started...', type: 'header' }];
    } else {
      queueProgressLines = [{ text: `Could not start: ${response?.error || 'Unknown error'}`, type: 'result-failed' }];
    }
  } catch (error: any) {
    queueProgressLines = [{ text: `Error: ${error.message}`, type: 'result-failed' }];
  }
}

async function handleClearQueue() {
  if (isQueueProcessing) {
    if (!confirm('Queue is currently processing. Stop and clear?')) return;
    await stopQueueProcessing();
  }
  if (!confirm('Clear all queued listings?')) return;
  await clearQueue();
  queue = [];
  queueProgressLines = [{ text: 'Queue cleared.', type: 'info' }];
  captureStatus = '';
  isQueueProcessing = false;
}

async function handleClearActivity() {
  await clearActivityLog();
  activityLog = [];
}
</script>

<div class="field">
  <label for="newSearchUrl">Search URLs</label>
  {#if settings.searchUrls.length > 0}
    <div class="search-url-list">
      {#each settings.searchUrls as url, i}
        <div class="search-url-item">
          <span class="search-url-text" title={url}>{url.length > 50 ? url.substring(0, 50) + '...' : url}</span>
          <button class="search-url-remove" onclick={() => removeSearchUrl(i)} title="Remove">&times;</button>
        </div>
      {/each}
    </div>
  {/if}
  <div class="search-url-add">
    <input
      type="url"
      id="newSearchUrl"
      bind:value={newUrlInput}
      placeholder="https://www.immobilienscout24.de/Suche/..."
      onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') addSearchUrl(); }}
    />
    <button class="btn btn-test" onclick={addSearchUrl} disabled={!newUrlInput.trim()}>Add</button>
  </div>
  <div class="hint">Add one or more ImmoScout24 search URLs. Monitoring cycles through them round-robin.</div>
</div>

<div class="field">
  <label for="autoSendMode">Send Mode</label>
  <select id="autoSendMode" bind:value={settings.autoSendMode} onchange={autoSave}>
    <option value="auto">Auto (fill + submit)</option>
    <option value="manual">Manual (fill only)</option>
  </select>
</div>

<!-- Pending Approval Section -->
{#if pendingApproval.length > 0}
<CollapsibleSection title={`Needs Approval (${pendingApproval.length})`} open={true}>
  <div class="queue-list">
    {#each pendingApproval as item, i}
      {@const url = item.url || `https://www.immobilienscout24.de/expose/${item.id}`}
      <div class="queue-item" class:bordered={i < pendingApproval.length - 1}>
        <a href={url} target="_blank" rel="noopener noreferrer" style="color:#888; text-decoration:none;" title="Open listing">({item.id})</a>
        {' '}{item.title || '—'}
        <div class="pending-actions">
          <button class="btn btn-test btn-pending-sm" onclick={() => handleApprove(item)}>Approve</button>
          <button class="btn btn-secondary btn-pending-sm" onclick={() => handleSkipPending(item.id)}>Skip</button>
        </div>
      </div>
    {/each}
  </div>
</CollapsibleSection>
{/if}

<!-- Queue Section -->
<CollapsibleSection title={queueTitle} open={queueOpen}>
  <div class="queue-controls">
    <button
      class="btn btn-test btn-capture"
      disabled={captureBtnDisabled || isQueueProcessing}
      onclick={handleCapture}
    >
      + {captureBtnText}
    </button>
  </div>

  {#if captureStatus}
    <div class="capture-status" style="color: {captureStatusColor};">{captureStatus}</div>
  {/if}

  <div class="queue-list">
    {#if queue.length === 0}
      <span style="color:#999;">No listings in queue.</span>
    {:else}
      {#each queue as item, i}
        {@const title = item.title ? (item.title.length > 45 ? item.title.substring(0, 45) + '...' : item.title) : 'Untitled'}
        {@const id = item.id || '?'}
        {@const url = item.url || `https://www.immobilienscout24.de/expose/${id}`}
        <div class="queue-item" class:bordered={i < queue.length - 1}>
          {i + 1}.
          <a href={url} target="_blank" rel="noopener noreferrer" style="color:#888; text-decoration:none;" title="Open listing">({id})</a>
          {' '}{title}
          {#if item.source}
            <span class="queue-source">({item.source})</span>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  {#if queueProgressLines.length > 0}
    <div class="queue-progress">
      {#each queueProgressLines as line}
        <div class="queue-progress-line {line.type}">{line.text}</div>
      {/each}
    </div>
  {/if}

  <div class="queue-actions">
    {#if !isMonitoring}
      <button
        class="btn {isQueueProcessing ? 'btn-secondary' : 'btn-test'}"
        onclick={handleProcess}
      >
        {isQueueProcessing ? '\u23F9 Stop Processing' : '\u25B6 Process Queue'}
      </button>
    {/if}
    <button class="btn btn-secondary" onclick={handleClearQueue}>Clear</button>
  </div>
</CollapsibleSection>

<!-- Activity Log -->
<div class="section-title" style="display:flex; justify-content:space-between; align-items:center;">
  <span>Activity Log</span>
  <button class="btn-clear-log" onclick={handleClearActivity}>Clear</button>
</div>

<div class="activity-log-box" bind:this={logBoxEl}>
  {#if activityLog.length === 0}
    <span style="color:#999;">No activity yet.</span>
  {:else}
    {#each activityLog as entry}
      <ActivityLogEntry {entry} />
    {/each}
  {/if}
</div>

<!-- Analyze Current Listing -->
<CollapsibleSection title="Analyze Current Listing">
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
</CollapsibleSection>

<!-- Send Template Message -->
<CollapsibleSection title="Send Template Message">
  <button class="btn btn-test" disabled={sendCurrentBtnDisabled} onclick={handleSendTemplate}>
    {sendCurrentBtnText}
  </button>
</CollapsibleSection>

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

  /* Queue styles */
  .queue-controls {
    margin-bottom: 8px;
  }

  .btn-capture {
    width: auto;
    padding: 6px 14px;
    font-size: 12px;
    margin-top: 0;
  }

  .capture-status {
    font-size: 12px;
    margin-bottom: 8px;
  }

  .queue-list {
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 6px;
    padding: 8px 10px;
    max-height: 200px;
    overflow-y: auto;
    font-size: 11px;
    margin-bottom: 8px;
  }

  .queue-item {
    padding: 3px 0;
  }

  .queue-item.bordered {
    border-bottom: 1px solid #eee;
  }

  .queue-source {
    color: #aaa;
    font-size: 10px;
    font-style: italic;
  }

  .queue-actions {
    display: flex;
    gap: 8px;
  }

  .queue-actions .btn {
    flex: 1;
  }

  .queue-progress {
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 6px;
    padding: 8px 10px;
    max-height: 120px;
    overflow-y: auto;
    font-size: 11px;
    margin-bottom: 8px;
  }

  .queue-progress-line {
    padding: 2px 0;
    color: #555;
  }

  .queue-progress-line.header {
    font-weight: 600;
    color: #333;
  }

  .queue-progress-line.result-success {
    color: #28a745;
  }

  .queue-progress-line.result-failed {
    color: #dc3545;
  }

  .queue-progress-line.wait {
    color: #888;
    font-style: italic;
  }

  .btn-clear-log {
    background: none;
    border: none;
    color: #999;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 6px;
  }

  .btn-clear-log:hover {
    color: #666;
  }

  /* Multi-URL styles */
  .search-url-list {
    margin-bottom: 6px;
  }

  .search-url-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    background: #f5f5f5;
    border-radius: 4px;
    margin-bottom: 4px;
    font-size: 11px;
  }

  .search-url-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    color: #555;
  }

  .search-url-remove {
    background: none;
    border: none;
    color: #999;
    font-size: 16px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    flex-shrink: 0;
  }

  .search-url-remove:hover {
    color: #e53e3e;
  }

  .search-url-add {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }

  .search-url-add input {
    flex: 1;
    min-width: 0;
  }

  .search-url-add :global(.btn) {
    flex-shrink: 0;
    width: auto;
    margin-top: 0;
  }

  .pending-actions {
    margin-top: 4px;
    display: flex;
    gap: 6px;
  }

  .btn-pending-sm {
    width: auto;
    padding: 3px 10px;
    font-size: 11px;
    margin-top: 0;
  }
</style>
