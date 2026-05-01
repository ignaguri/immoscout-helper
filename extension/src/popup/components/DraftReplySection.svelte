<script lang="ts">
import { getMessengerUrl } from '../../shared/constants';
import type { ConversationEntry } from '../../shared/types';
import {
  dismissDraftError,
  generateDocuments,
  regenerateDraft,
  sendConversationReply,
} from '../lib/messages';
import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
import ExternalLink from '@lucide/svelte/icons/external-link';
import FileText from '@lucide/svelte/icons/file-text';
import { Button } from '$lib/components/ui/button';
import { Textarea } from '$lib/components/ui/textarea';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

const DRAFT_WATCHDOG_MS = 90_000;

let {
  conversation,
  aiMode = 'direct',
}: {
  conversation: ConversationEntry;
  aiMode?: string;
} = $props();

let draftText = $state('');
let sendBtnText = $state('Send Reply');
let sendBtnDisabled = $state(false);
let sendBtnTone = $state<'default' | 'success' | 'destructive'>('default');
let regenBtnText = $state('Generate');
let regenBtnDisabled = $state(false);
let localDraftError = $state<string | null>(null);
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

let refineInput = $state('');
let showRefineInput = $state(false);
let refineBtnDisabled = $state(false);
let refineBtnText = $state('Apply');

let showDocsForm = $state(false);
let docsAddress = $state('');
let docsBtnText = $state('Generate');
let docsBtnDisabled = $state(false);
let docsStatus = $state<'idle' | 'success' | 'error'>('idle');

const nextMonth = new Date();
nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
let moveInDate = $state(nextMonth.toISOString().split('T')[0]);

$effect(() => {
  draftText = conversation.draftReply || '';
  regenBtnText = conversation.draftReply ? 'Regenerate' : 'Generate';
  showRefineInput = false;
  refineInput = '';
});

$effect(() => {
  if (conversation.draftStatus === 'generating') {
    if (!watchdogTimer) startWatchdog();
  } else {
    clearWatchdog();
    if (conversation.draftStatus === 'ready') {
      localDraftError = null;
    }
  }
  return clearWatchdog;
});

let lastPrefilledId = $state('');
$effect(() => {
  if (showDocsForm && conversation.conversationId !== lastPrefilledId) {
    docsAddress = conversation.listingTitle || '';
    lastPrefilledId = conversation.conversationId;
  }
});

async function handleSendReply() {
  const replyText = draftText.trim();
  if (!replyText) {
    alert('Please enter a reply.');
    return;
  }
  sendBtnDisabled = true;
  sendBtnText = 'Opening…';
  sendBtnTone = 'default';
  try {
    const result = await sendConversationReply(conversation.conversationId, replyText);
    if (result.success) {
      sendBtnText = 'Tab opened — review & send';
      sendBtnTone = 'success';
    } else {
      sendBtnText = `Failed: ${result.error || 'unknown'}`;
      sendBtnTone = 'destructive';
    }
  } catch (e: any) {
    sendBtnText = `Error: ${e.message}`;
    sendBtnTone = 'destructive';
  }
  setTimeout(() => {
    sendBtnDisabled = false;
    sendBtnText = 'Send Reply';
    sendBtnTone = 'default';
  }, 5000);
}

function clearWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

function startWatchdog() {
  clearWatchdog();
  watchdogTimer = setTimeout(() => {
    if (conversation.draftStatus === 'generating') {
      localDraftError = 'Draft generation timed out. Try again.';
    }
  }, DRAFT_WATCHDOG_MS);
}

async function handleRegenerate() {
  regenBtnDisabled = true;
  regenBtnText = 'Generating…';
  draftText = '';
  localDraftError = null;
  try {
    const result = await regenerateDraft(conversation.conversationId, '');
    if (!result?.success) {
      localDraftError = result?.error || 'Failed to generate draft.';
      regenBtnText = 'Error';
    }
  } catch (e: any) {
    localDraftError = e?.message || 'Failed to generate draft.';
    regenBtnText = 'Error';
  }
  setTimeout(() => {
    regenBtnDisabled = false;
    regenBtnText = conversation.draftReply ? 'Regenerate' : 'Generate';
  }, 3000);
}

async function handleRefine() {
  if (!refineInput.trim()) return;
  refineBtnDisabled = true;
  refineBtnText = 'Applying…';
  const userContext = `CURRENT DRAFT:\n${draftText}\n\nREFINEMENT INSTRUCTIONS:\n${refineInput.trim()}`;
  draftText = '';
  localDraftError = null;
  try {
    const result = await regenerateDraft(conversation.conversationId, userContext);
    if (!result?.success) {
      localDraftError = result?.error || 'Failed to refine draft.';
      refineBtnText = 'Error';
    }
  } catch (e: any) {
    localDraftError = e?.message || 'Failed to refine draft.';
    refineBtnText = 'Error';
  }
  refineInput = '';
  showRefineInput = false;
  setTimeout(() => {
    refineBtnDisabled = false;
    refineBtnText = 'Apply';
  }, 3000);
}

async function handleDismissError() {
  localDraftError = null;
  try {
    await dismissDraftError(conversation.conversationId);
  } catch {}
}

function handleOpen() {
  chrome.tabs.create({
    url: getMessengerUrl(conversation.conversationId),
    active: true,
  });
}

async function handleGenerateDocs() {
  docsBtnDisabled = true;
  docsBtnText = 'Generating…';
  docsStatus = 'idle';
  try {
    const result = await generateDocuments(conversation.conversationId, docsAddress || '', moveInDate || '');
    if (result.success) {
      docsBtnText = 'Downloaded!';
      docsStatus = 'success';
    } else {
      docsBtnText = 'Failed';
      docsStatus = 'error';
    }
  } catch {
    docsBtnText = 'Error';
    docsStatus = 'error';
  }
  setTimeout(() => {
    docsBtnDisabled = false;
    docsBtnText = 'Generate';
    docsStatus = 'idle';
  }, 5000);
}

const sendBtnVariant = $derived(
  sendBtnTone === 'success' ? 'outline' : sendBtnTone === 'destructive' ? 'destructive' : 'default',
);
const sendBtnClass = $derived(
  sendBtnTone === 'success' ? 'flex-1 border-success/40 bg-success/15 text-success' : 'flex-1',
);
</script>

<div class="mt-2">
  {#if conversation.draftStatus === 'generating'}
    <div class="text-[11px] italic text-muted-foreground">Generating AI draft…</div>
    {#if localDraftError}
      <div class="mt-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2">
        <div class="mb-1.5 text-[11px] text-destructive break-words">{localDraftError}</div>
        <div class="flex gap-1.5">
          <Button size="sm" variant="secondary" onclick={handleRegenerate}>Try again</Button>
          <Button size="sm" variant="ghost" onclick={handleDismissError}>Write manually</Button>
        </div>
      </div>
    {/if}
  {:else if conversation.draftStatus === 'error'}
    <div class="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2">
      <div class="mb-1.5 text-[11px] text-destructive break-words">
        {conversation.draftError || localDraftError || 'Failed to generate draft.'}
      </div>
      <div class="flex gap-1.5">
        <Button size="sm" variant="secondary" loading={regenBtnDisabled} disabled={regenBtnDisabled} onclick={handleRegenerate}>Try again</Button>
        <Button size="sm" variant="ghost" onclick={handleDismissError}>Write manually</Button>
      </div>
    </div>
  {:else}
    <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {conversation.draftReply ? 'AI Draft Reply' : 'Write Reply'}
    </div>
    <Textarea
      bind:value={draftText}
      placeholder={conversation.draftReply ? 'Edit the draft or send as-is…' : 'Type your reply or click Generate for an AI draft…'}
      class="min-h-20 text-[11px]"
    />
    <div class="mt-1.5 flex flex-wrap items-start gap-1.5">
      <Button size="sm" variant="secondary" loading={regenBtnDisabled} disabled={regenBtnDisabled} onclick={handleRegenerate}>
        {regenBtnText}
      </Button>
      {#if conversation.draftReply}
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={showRefineInput}
          onclick={() => { showRefineInput = !showRefineInput; }}
        >
          Refine
        </Button>
      {/if}
      <Button
        size="sm"
        variant={sendBtnVariant}
        class={sendBtnClass}
        loading={sendBtnDisabled}
        disabled={sendBtnDisabled}
        onclick={handleSendReply}
      >
        {sendBtnText}
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              size="sm"
              variant="ghost"
              aria-label="More draft actions"
              title="More actions"
              {...props}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item onSelect={handleOpen}>
            <ExternalLink aria-hidden="true" />
            Open in messenger
          </DropdownMenu.Item>
          {#if aiMode === 'server'}
            <DropdownMenu.Item onSelect={() => { showDocsForm = true; }}>
              <FileText aria-hidden="true" />
              Generate Docs
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    {#if showRefineInput}
      <div class="mt-1.5 flex items-end gap-1.5">
        <Textarea
          bind:value={refineInput}
          placeholder="e.g., rewrite in Sie form, be more formal, shorter…"
          rows={2}
          class="flex-1 text-[11px]"
        />
        <Button
          size="sm"
          loading={refineBtnDisabled}
          disabled={refineBtnDisabled || !refineInput.trim()}
          onclick={handleRefine}
        >
          {refineBtnText}
        </Button>
      </div>
    {/if}
    {#if aiMode === 'server' && showDocsForm}
        <div class="mt-2 rounded-md border border-border bg-muted/40 p-2.5">
          <div class="mb-2 space-y-1">
            <Label for="docs-address-{conversation.conversationId}" class="text-[10px] uppercase">Address</Label>
            <Input
              id="docs-address-{conversation.conversationId}"
              type="text"
              bind:value={docsAddress}
              placeholder="Listing address…"
              class="text-[11px]"
            />
          </div>
          <div class="mb-2 space-y-1">
            <Label for="docs-movein-{conversation.conversationId}" class="text-[10px] uppercase">Move-in date</Label>
            <Input
              id="docs-movein-{conversation.conversationId}"
              type="date"
              bind:value={moveInDate}
              class="w-36 text-[11px]"
            />
          </div>
          <div class="flex gap-1.5">
            <Button size="sm" class="flex-1" loading={docsBtnDisabled} disabled={docsBtnDisabled} onclick={handleGenerateDocs}>
              {docsBtnText}
            </Button>
            <Button size="sm" variant="secondary" onclick={() => { showDocsForm = false; docsStatus = 'idle'; }}>
              Cancel
            </Button>
          </div>
          {#if docsStatus === 'success'}
            <div class="mt-1.5 rounded bg-success/15 px-2 py-1 text-[11px] text-success" role="status">
              Documents downloaded!
            </div>
          {:else if docsStatus === 'error'}
            <div class="mt-1.5 rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive" role="status">
              Generation failed. Is the server running?
            </div>
          {/if}
        </div>
    {/if}
  {/if}
</div>
