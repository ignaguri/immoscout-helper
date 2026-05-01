<script lang="ts">
import { onMount } from 'svelte';
import X from '@lucide/svelte/icons/x';
import Inbox from '@lucide/svelte/icons/inbox';
import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
import type {
  ActivityLogEntry as ActivityLogEntryType,
  ManualReviewData,
  PendingApprovalItem,
  QueueItem,
} from '../../shared/types';
import ActivityLogEntry from '../components/ActivityLogEntry.svelte';
import AnalyzeSection from '../components/AnalyzeSection.svelte';
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
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import * as Select from '$lib/components/ui/select';
import EmptyState from '$lib/components/EmptyState.svelte';
import Section from '$lib/components/Section.svelte';

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

type StatusKind = '' | 'error' | 'success' | 'muted';
let captureStatus = $state('');
let captureStatusKind = $state<StatusKind>('');
let captureBtnText = $state('Capture');
let captureBtnDisabled = $state(false);

let queueOpen = $state(false);
let pendingOpen = $state(true);
let analyzeOpen = $state(false);

let queueAutoOpened = false;
$effect(() => {
  if (!queueAutoOpened && queue.length > 0) {
    queueOpen = true;
    queueAutoOpened = true;
  }
});

let newUrlInput = $state('');

let stickToBottom = true;
$effect(() => {
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
    captureBtnText = 'Capturing…';
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
        { text: 'Stop requested — finishing current listing…', type: 'wait' },
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
      queueProgressLines = [{ text: 'Queue processing started…', type: 'header' }];
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

const captureStatusClass = $derived(
  captureStatusKind === 'error'
    ? 'text-destructive'
    : captureStatusKind === 'success'
      ? 'text-success'
      : 'text-muted-foreground',
);

const sendModeOptions = [
  { value: 'auto', label: 'Auto (fill + submit)' },
  { value: 'manual', label: 'Manual (fill only)' },
];
</script>

<div class="space-y-3">
  <div class="space-y-1.5">
    <Label for="newSearchUrl">Search URLs</Label>
    {#if settings.searchUrls.length > 0}
      <div class="space-y-1">
        {#each settings.searchUrls as url, i}
          <div class="flex items-center justify-between gap-1.5 rounded bg-muted px-2 py-1 text-[11px]">
            <span class="flex-1 truncate text-foreground/70" title={url}>
              {url.length > 50 ? url.substring(0, 50) + '…' : url}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              class="text-muted-foreground hover:text-destructive"
              aria-label="Remove URL"
              onclick={() => removeSearchUrl(i)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        {/each}
      </div>
    {/if}
    <div class="flex items-stretch gap-1.5">
      <Input
        type="url"
        id="newSearchUrl"
        bind:value={newUrlInput}
        placeholder="https://www.immobilienscout24.de/Suche/…"
        class="flex-1"
        onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') addSearchUrl(); }}
      />
      <Button onclick={addSearchUrl} disabled={!newUrlInput.trim()}>Add</Button>
    </div>
    <p class="text-xs text-muted-foreground m-0">Add one or more ImmoScout24 search URLs. Monitoring cycles through them round-robin.</p>
  </div>

  <div class="space-y-1.5">
    <Label for="autoSendMode">Send Mode</Label>
    <Select.Root type="single" bind:value={settings.autoSendMode} onValueChange={autoSave}>
      <Select.Trigger id="autoSendMode" class="w-full">
        {sendModeOptions.find((o) => o.value === settings.autoSendMode)?.label ?? 'Auto (fill + submit)'}
      </Select.Trigger>
      <Select.Content>
        {#each sendModeOptions as opt}
          <Select.Item value={opt.value}>{opt.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
</div>

{#if manualReview}
  <ManualReviewPanel review={manualReview} onDismiss={() => { manualReview = null; }} />
{/if}

{#if pendingApproval.length > 0}
  <CollapsibleSection title="Needs Approval ({pendingApproval.length})" bind:open={pendingOpen}>
      <div class="flex flex-col gap-2">
        {#each pendingApproval as item}
          {@const url = item.url || `https://www.immobilienscout24.de/expose/${item.id}`}
          <div class="rounded-md border border-border bg-background p-3">
            <div class="mb-2 text-xs leading-snug text-foreground break-words">
              <a href={url} target="_blank" rel="noopener noreferrer" class="mr-1 text-muted-foreground no-underline hover:underline" title="Open listing">#{item.id}</a>
              {item.title || '—'}
            </div>
            <div class="flex items-stretch gap-2">
              <Button class="flex-1" onclick={() => handleApprove(item)}>Approve</Button>
              <Button variant="outline" onclick={() => handleSkipPending(item.id)}>Skip</Button>
            </div>
          </div>
        {/each}
      </div>
  </CollapsibleSection>
{/if}

<CollapsibleSection title="Queue ({queue.length} pending)" bind:open={queueOpen}>
  <div class="space-y-2">
    <div>
      <Button
        size="sm"
        loading={captureBtnDisabled || isQueueProcessing}
        disabled={captureBtnDisabled || isQueueProcessing}
        onclick={handleCapture}
      >
        + {captureBtnText}
      </Button>
    </div>

    {#if captureStatus}
      <div class={`text-xs ${captureStatusClass}`} role="status">{captureStatus}</div>
    {/if}

    {#if queue.length === 0}
      <EmptyState
        icon={Inbox}
        title="Queue is empty"
        sub="Capture listings from a search page to add them here."
      />
    {:else}
      <div class="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11px]">
        {#each queue as item, i}
          {@const title = item.title ? (item.title.length > 45 ? item.title.substring(0, 45) + '…' : item.title) : 'Untitled'}
          {@const id = item.id || '?'}
          {@const url = item.url || `https://www.immobilienscout24.de/expose/${id}`}
          <div class={`py-0.5 ${i < queue.length - 1 ? 'border-b border-border' : ''}`}>
            {i + 1}.
            <a href={url} target="_blank" rel="noopener noreferrer" class="text-muted-foreground no-underline hover:underline" title="Open listing">({id})</a>
            {' '}{title}
            {#if item.source}
              <span class="text-[10px] italic text-muted-foreground/70">({item.source})</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if queueProgressLines.length > 0}
      <div class="max-h-32 overflow-y-auto rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11px]">
        {#each queueProgressLines as line}
          {@const cls =
            line.type === 'header'
              ? 'font-semibold text-foreground'
              : line.type === 'result-success'
                ? 'text-success'
                : line.type === 'result-failed'
                  ? 'text-destructive'
                  : line.type === 'wait'
                    ? 'italic text-muted-foreground'
                    : 'text-foreground/70'}
          <div class={`py-0.5 ${cls}`}>{line.text}</div>
        {/each}
      </div>
    {/if}

    <div class="flex gap-2">
      {#if !isMonitoring}
        <Button
          class="flex-1"
          variant={isQueueProcessing ? 'secondary' : 'default'}
          onclick={handleProcess}
        >
          {isQueueProcessing ? '⏹ Stop Processing' : '▶ Process Queue'}
        </Button>
      {/if}
      <Button class="flex-1" variant="secondary" onclick={handleClearQueue}>Clear</Button>
    </div>
  </div>
</CollapsibleSection>

<Section title="Activity Log">
  {#snippet actions()}
    <Button variant="ghost" size="xs" class="text-muted-foreground" onclick={handleClearActivity}>
      Clear
    </Button>
  {/snippet}

  {#if activityLog.length === 0}
    <EmptyState
      title="No activity yet"
      sub="Listings the extension processes will show up here."
    />
  {:else}
    <div
      class="max-h-52 overflow-y-auto rounded-md border border-border bg-muted/40 p-2.5 text-[11px]"
      bind:this={logBoxEl}
      onscroll={handleLogScroll}
      aria-live="polite"
      aria-relevant="additions"
    >
      {#each activityLog as entry}
        <ActivityLogEntry {entry} />
      {/each}
    </div>
  {/if}
</Section>

<CollapsibleSection title="Analyze Current Listing" bind:open={analyzeOpen}>
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
        class={`mt-3 max-h-48 overflow-y-auto rounded-md border p-3 ${
          testResultIsError
            ? 'border-destructive/40 bg-destructive/10'
            : 'border-success/40 bg-success/10'
        }`}
      >
        <pre class="m-0 whitespace-pre-wrap break-words font-mono text-[11px]">{testResultContent}</pre>
      </div>
    {/if}
</CollapsibleSection>
