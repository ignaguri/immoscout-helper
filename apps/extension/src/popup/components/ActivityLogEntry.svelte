<script lang="ts">
import { onMount } from 'svelte';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import { PENDING_DUPLICATE_DECISION_KEY } from '../../shared/constants';
import type { ActivityLogEntry } from '../../shared/types';
import { sendDuplicateLandlordDecision } from '../lib/messages';
import { Button } from '$lib/components/ui/button';
import { cn } from '$lib/utils';

let { entry }: { entry: ActivityLogEntry } = $props();
let showErrorDetail = $state(false);
let duplicatePending = $state(false);
let decisionSending = $state(false);
let decisionSent = $state(false);

onMount(async () => {
  if (entry.duplicateDecisionId) {
    try {
      const stored = await chrome.storage.local.get(PENDING_DUPLICATE_DECISION_KEY);
      duplicatePending = stored[PENDING_DUPLICATE_DECISION_KEY]?.decisionId === entry.duplicateDecisionId;
    } catch (_e) {
      duplicatePending = false;
    }
  }
});

async function handleDuplicateDecision(decision: 'send' | 'skip') {
  if (!entry.duplicateDecisionId || decisionSent || decisionSending) return;
  decisionSending = true;
  try {
    await sendDuplicateLandlordDecision(entry.duplicateDecisionId, decision);
    decisionSent = true;
  } catch (e) {
    console.error('[Popup] Failed to send duplicate landlord decision:', e);
  } finally {
    decisionSending = false;
  }
}

function logClass(type: string): string {
  switch (type) {
    case 'header':
      return 'mt-1.5 pt-1.5 border-t border-border font-semibold text-foreground';
    case 'analysis':
      return 'mx-2 my-1 px-2 py-1 rounded bg-info/10 border-l-[3px] border-info text-foreground/80 whitespace-pre-wrap';
    case 'result-success':
      return 'mx-2 my-1 font-semibold text-success';
    case 'result-failed':
      return 'mx-2 my-1 font-semibold text-destructive';
    case 'wait':
      return 'mx-2 my-0.5 italic text-muted-foreground';
    default:
      return 'mx-2 my-0.5 text-foreground/70';
  }
}

function getResultInfo(result: string): { icon: string; type: string; label: string } {
  if (result === 'success') return { icon: '✓', type: 'result-success', label: 'Sent' };
  if (result === 'skipped') return { icon: '→', type: 'wait', label: 'Skipped' };
  return { icon: '✗', type: 'result-failed', label: 'Failed' };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
</script>

{#snippet timestamp()}{#if entry.timestamp}<span class="mr-1 text-[11px] font-normal text-muted-foreground/70">{formatTime(entry.timestamp)}</span>{/if}{/snippet}

{#if entry.current}
  {@const id = entry.current.id}
  {@const title = entry.current.title || id}
  {@const url = entry.current.url || `https://www.immobilienscout24.de/expose/${id}`}
  <div class={logClass('header')}>
    {@render timestamp()}
    <span>▸ </span>
    <a href={url} target="_blank" rel="noopener noreferrer" class="text-muted-foreground no-underline hover:underline">({id})</a>
    {' '}{title}
  </div>
{/if}

{#if entry.message}
  {@const isAnalysis = entry.type === 'analysis' || entry.message.includes('AI Score:')}
  {@const isWait = entry.type === 'wait' || entry.message.includes('Rate limit') || entry.message.includes('waiting')}
  <div class={logClass(isAnalysis ? 'analysis' : isWait ? 'wait' : 'info')}>
    {#if !entry.current}{@render timestamp()}{/if}
    {entry.message}
  </div>
  {#if entry.duplicateDecisionId && duplicatePending && !decisionSent}
    <div class="ml-2 my-1.5 flex gap-2">
      <Button
        size="sm"
        onclick={() => handleDuplicateDecision('send')}
        disabled={decisionSending}
      >
        Send Anyway
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={() => handleDuplicateDecision('skip')}
        disabled={decisionSending}
      >
        Skip
      </Button>
    </div>
  {/if}
{/if}

{#if entry.lastResult}
  {@const info = getResultInfo(entry.lastResult)}
  {@const lid = entry.lastId}
  {@const lurl = `https://www.immobilienscout24.de/expose/${lid}`}
  {@const hasError = entry.lastResult === 'failed' && entry.error}
  <div class={logClass(info.type)}>
    {#if !entry.current && !entry.message}{@render timestamp()}{/if}
    {info.icon} {info.label}:
    <a href={lurl} target="_blank" rel="noopener noreferrer" class="text-current no-underline hover:underline">({lid})</a>
    {' '}{entry.lastTitle || ''}
    {#if hasError}
      <Button
        variant="ghost"
        size="xs"
        class="ml-1.5 align-middle text-destructive hover:bg-destructive/10"
        onclick={() => showErrorDetail = !showErrorDetail}
        aria-expanded={showErrorDetail}
      >
        {showErrorDetail ? 'Hide details' : 'Show details'}
        <ChevronRight class={cn('transition-transform', showErrorDetail && 'rotate-90')} aria-hidden="true" />
      </Button>
    {/if}
  </div>
  {#if hasError && showErrorDetail}
    <div class="ml-3 my-1 px-2 py-1.5 rounded bg-destructive/10 border-l-[3px] border-destructive text-[11px] text-destructive whitespace-pre-wrap break-words">
      {entry.error}
    </div>
  {/if}
{/if}
