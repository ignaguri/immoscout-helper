<script lang="ts">
import { captureQueueItems, startQueueProcessing, stopQueueProcessing } from '../lib/messages';
import { clearQueue, loadQueue } from '../lib/storage';

let {
  queue = $bindable(),
  isQueueProcessing = $bindable(),
  queueProgressLines = $bindable(),
}: {
  queue: any[];
  isQueueProcessing: boolean;
  queueProgressLines: Array<{ text: string; type: string }>;
} = $props();

let captureStatus = $state('');
let captureStatusColor = $state('');
let captureBtnText = $state('+ Capture from Current Page');
let captureBtnDisabled = $state(false);
let progressBoxEl: HTMLDivElement | undefined = $state();

$effect(() => {
  if (queueProgressLines.length && progressBoxEl) {
    progressBoxEl.scrollTop = progressBoxEl.scrollHeight;
  }
});

let queueSummary = $derived(`${queue.length} listing${queue.length === 1 ? '' : 's'} queued`);

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
      captureBtnText = '+ Capture from Current Page';
      return;
    }

    if (listings.length === 0) {
      captureStatus = 'No listings found on this page.';
      captureStatusColor = '#888';
      captureBtnDisabled = false;
      captureBtnText = '+ Capture from Current Page';
      return;
    }

    const response = await captureQueueItems(listings);
    captureBtnDisabled = isQueueProcessing;
    captureBtnText = '+ Capture from Current Page';

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
    captureBtnText = '+ Capture from Current Page';
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

async function handleClear() {
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

function getLineStyle(type: string): string {
  switch (type) {
    case 'header':
      return 'border-top: 1px solid #ccc; margin-top: 6px; padding-top: 6px; font-weight: 600; color: #333;';
    case 'analysis':
      return 'margin: 4px 0 2px 8px; padding: 4px 8px; background: #eef6ff; border-left: 3px solid #4a9eff; border-radius: 3px; color: #444; white-space: pre-wrap;';
    case 'result-success':
      return 'margin: 4px 0 2px 8px; color: #2d8a56; font-weight: 600;';
    case 'result-failed':
      return 'margin: 4px 0 2px 8px; color: #c0392b; font-weight: 600;';
    case 'wait':
      return 'margin: 2px 0 2px 8px; color: #888; font-style: italic;';
    default:
      return 'margin: 2px 0 2px 8px; color: #555;';
  }
}
</script>

<button
  class="btn btn-test"
  disabled={captureBtnDisabled || isQueueProcessing}
  onclick={handleCapture}
>
  {captureBtnText}
</button>

{#if captureStatus}
  <div class="capture-status" style="color: {captureStatusColor};">{captureStatus}</div>
{/if}

<div class="section-title">{queueSummary}</div>

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
        <a href={url} target="_blank" style="color:#888; text-decoration:none;" title="Open listing">({id})</a>
        {' '}{title}
      </div>
    {/each}
  {/if}
</div>

<div class="queue-actions">
  <button
    class="btn {isQueueProcessing ? 'btn-secondary' : 'btn-test'}"
    onclick={handleProcess}
  >
    {isQueueProcessing ? '\u23F9 Stop Processing' : '\u25B6 Process Queue'}
  </button>
  <button class="btn btn-secondary" onclick={handleClear}>Clear Queue</button>
</div>

<div class="section-title">Progress</div>

<div class="queue-progress" bind:this={progressBoxEl}>
  {#if queueProgressLines.length === 0}
    Ready.
  {:else}
    {#each queueProgressLines as line}
      <div style={getLineStyle(line.type)}>{line.text}</div>
    {/each}
  {/if}
</div>

<style>
  .capture-status {
    font-size: 12px;
    margin-top: 6px;
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
    padding: 10px;
    max-height: 200px;
    overflow-y: auto;
    font-size: 11px;
  }
</style>
