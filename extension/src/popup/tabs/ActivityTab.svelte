<script lang="ts">
import { onMount } from 'svelte';
import type {
  ActivityLogEntry as ActivityLogEntryType,
  ManualReviewData,
  PendingApprovalItem,
  QueueItem,
} from '../../shared/types';
import ActivityLogEntry from '../components/ActivityLogEntry.svelte';
import AnalyzeSection from '../components/AnalyzeSection.svelte';
import CollapsibleSection from '../components/CollapsibleSection.svelte';
import ManualReviewPanel from '../components/ManualReviewPanel.svelte';
import {
  approvePendingListing,
  captureQueueItems,
  getManualReview,
  skipPendingListing,
  startQueueProcessing,
  stopQueueProcessing,
} from '../lib/messages';
import type { PopupSettings } from '../lib/storage';
import { clearActivityLog, clearQueue, loadQueue, saveAllSettings } from '../lib/storage';

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
  activityLog: ActivityLogEntryType[];
  testResultVisible: boolean;
  testResultContent: string;
  testResultIsError: boolean;
  analyzeResult: any;
  lastAnalyzeContext: any;
  queue: QueueItem[];
  isQueueProcessing: boolean;
  queueProgressLines: Array<{ text: string; type: string }>;
  pendingApproval: PendingApprovalItem[];
  isMonitoring: boolean;
} = $props();

const STICK_TO_BOTTOM_PX = 10;

let logBoxEl: HTMLDivElement | undefined = $state();
let manualReview = $state<ManualReviewData | null>(null);

// Load manual review data on mount and poll for changes
onMount(() => {
  getManualReview()
    .then((r) => {
      manualReview = r;
    })
    .catch(() => {});
  const interval = setInterval(() => {
    getManualReview()
      .then((r) => {
        manualReview = r;
      })
      .catch(() => {});
  }, 3000);
  return () => clearInterval(interval);
});

// Queue state
type StatusKind = '' | 'error' | 'success' | 'muted';
let captureStatus = $state('');
let captureStatusKind: StatusKind = $state('');
let captureBtnText = $state('Capture');
let captureBtnDisabled = $state(false);
let queueOpen = $derived(queue.length > 0);
let queueTitle = $derived(`Queue (${queue.length} pending)`);
let newUrlInput = $state('');

// Auto-scroll activity log when entries change, but only if user is already at the bottom.
// If they've scrolled up to read older entries, leave them alone.
let stickToBottom = true;
$effect(() => {
  // Track entry count so this effect re-runs on append.
  void activityLog.length;
  if (logBoxEl && stickToBottom) {
    logBoxEl.scrollTop = logBoxEl.scrollHeight;
  }
});

function handleLogScroll() {
  if (!logBoxEl) return;
  stickToBottom = logBoxEl.scrollTop + logBoxEl.clientHeight >= logBoxEl.scrollHeight - STICK_TO_BOTTOM_PX;
}

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

async function handleApprove(item: PendingApprovalItem) {
  const res = await approvePendingListing(item);
  if (res?.success) {
    pendingApproval = pendingApproval.filter((p) => p.id !== item.id);
  }
}

async function handleSkipPending(id: string) {
  const res = await skipPendingListing(id);
  if (res?.success) {
    pendingApproval = pendingApproval.filter((p) => p.id !== id);
  }
}

async function handleCapture() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url?.includes('immobilienscout24.de')) {
      captureStatus = 'Please open an ImmoScout24 search page first.';
      captureStatusKind = 'error';
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
      captureStatusKind = 'error';
      captureBtnDisabled = false;
      captureBtnText = 'Capture';
      return;
    }

    if (listings.length === 0) {
      captureStatus = 'No listings found on this page.';
      captureStatusKind = 'muted';
      captureBtnDisabled = false;
      captureBtnText = 'Capture';
      return;
    }

    const response = await captureQueueItems(listings);
    captureBtnDisabled = isQueueProcessing;
    captureBtnText = 'Capture';

    if (response?.success) {
      captureStatus = `Added ${response.added} listing${response.added !== 1 ? 's' : ''} (${response.total} total in queue)`;
      captureStatusKind = 'success';
      queue = await loadQueue();
    } else {
      captureStatus = `Error: ${response?.error || 'Unknown'}`;
      captureStatusKind = 'error';
    }
  } catch (error: any) {
    captureBtnDisabled = isQueueProcessing;
    captureBtnText = 'Capture';
    captureStatus = `Error: ${error.message}`;
    captureStatusKind = 'error';
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

<!-- Manual Review Panel -->
{#if manualReview}
  <ManualReviewPanel review={manualReview} onDismiss={() => { manualReview = null; }} />
{/if}

<!-- Pending Approval Section -->
{#if pendingApproval.length > 0}
<CollapsibleSection title={`Needs Approval (${pendingApproval.length})`} open={true}>
  <div class="pending-list">
    {#each pendingApproval as item}
      {@const url = item.url || `https://www.immobilienscout24.de/expose/${item.id}`}
      <div class="pending-item">
        <div class="pending-title">
          <a href={url} target="_blank" rel="noopener noreferrer" class="pending-id" title="Open listing">#{item.id}</a>
          {item.title || '—'}
        </div>
        <div class="pending-actions">
          <button class="btn-approve" onclick={() => handleApprove(item)}>Approve</button>
          <button class="btn-skip" onclick={() => handleSkipPending(item.id)}>Skip</button>
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
      aria-busy={captureBtnDisabled || isQueueProcessing}
      onclick={handleCapture}
    >
      + {captureBtnText}
    </button>
  </div>

  {#if captureStatus}
    <div class="capture-status capture-status-{captureStatusKind}">{captureStatus}</div>
  {/if}

  {#if queue.length === 0}
    <div class="empty-state">
      <div class="empty-state-headline">Queue is empty</div>
      <div class="empty-state-sub">Capture listings from a search page to add them here.</div>
    </div>
  {:else}
    <div class="queue-list">
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
    </div>
  {/if}

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

{#if activityLog.length === 0}
  <div class="empty-state">
    <div class="empty-state-headline">No activity yet</div>
    <div class="empty-state-sub">Listings the extension processes will show up here.</div>
  </div>
{:else}
  <div class="activity-log-box" bind:this={logBoxEl} onscroll={handleLogScroll}>
    {#each activityLog as entry}
      <ActivityLogEntry {entry} />
    {/each}
  </div>
{/if}

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
    <div class="test-result" class:test-result-error={testResultIsError} class:test-result-success={!testResultIsError}>
      <pre class="test-result-content">{testResultContent}</pre>
    </div>
  {/if}
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
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-subtle);
    max-height: 200px;
    overflow-y: auto;
  }

  .test-result-error {
    border-color: var(--color-danger-fg);
    background: var(--color-danger-bg);
  }

  .test-result-success {
    border-color: var(--color-success-fg);
    background: var(--color-success-bg);
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
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }

  .capture-status-error { color: var(--color-danger-fg); }
  .capture-status-success { color: var(--color-success-fg); }
  .capture-status-muted { color: var(--color-text-muted); }

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

  .pending-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .pending-item {
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
  }

  .pending-title {
    font-size: var(--text-sm);
    line-height: 1.4;
    color: var(--color-text);
    margin-bottom: var(--space-2);
    word-break: break-word;
  }

  .pending-id {
    color: var(--color-text-subtle);
    text-decoration: none;
    margin-right: 4px;
  }

  .pending-id:hover {
    text-decoration: underline;
  }

  .pending-actions {
    display: flex;
    gap: var(--space-2);
    align-items: stretch;
  }

  .btn-approve {
    flex: 1;
    background: var(--color-brand);
    color: var(--color-text);
    border: none;
    border-radius: var(--radius-md);
    padding: 10px;
    font-size: var(--text-base);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .btn-approve:hover {
    background: var(--color-brand-hover);
  }

  .btn-skip {
    background: none;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 10px var(--space-4);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .btn-skip:hover {
    background: var(--color-bg-subtle);
  }
</style>
