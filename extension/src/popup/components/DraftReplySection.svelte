<script lang="ts">
import { getMessengerUrl } from '../../shared/constants';
import type { ConversationEntry } from '../../shared/types';
import { generateDocuments, regenerateDraft, sendConversationReply } from '../lib/messages';

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
let sendBtnStyle = $state('');
let regenBtnText = $state('Generate');
let regenBtnDisabled = $state(false);

// Refine state
let refineInput = $state('');
let showRefineInput = $state(false);
let refineBtnDisabled = $state(false);
let refineBtnText = $state('Apply');

// Docs form state
let showDocsForm = $state(false);
let docsAddress = $state('');
let docsBtnText = $state('Generate');
let docsBtnDisabled = $state(false);
let docsStatus = $state<'idle' | 'success' | 'error'>('idle');

// Default move-in date to 1st of next month
const nextMonth = new Date();
nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
let moveInDate = $state(nextMonth.toISOString().split('T')[0]);

// Sync draft text from conversation prop
$effect(() => {
  draftText = conversation.draftReply || '';
  regenBtnText = conversation.draftReply ? 'Regenerate' : 'Generate';
  showRefineInput = false;
  refineInput = '';
});

// Pre-fill docs address when the form is opened (tracked by conversationId to avoid overwriting edits)
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
  sendBtnText = 'Opening...';
  try {
    const result = await sendConversationReply(conversation.conversationId, replyText);
    if (result.success) {
      sendBtnText = 'Tab opened - review & send';
      sendBtnStyle = 'background: #e6fff5;';
    } else {
      sendBtnText = `Failed: ${result.error || 'unknown'}`;
      sendBtnStyle = 'background: #fff5f5;';
    }
  } catch (e: any) {
    sendBtnText = `Error: ${e.message}`;
    sendBtnStyle = 'background: #fff5f5;';
  }
  setTimeout(() => {
    sendBtnDisabled = false;
    sendBtnText = 'Send Reply';
    sendBtnStyle = '';
  }, 5000);
}

async function handleRegenerate() {
  regenBtnDisabled = true;
  regenBtnText = 'Generating...';
  draftText = '';
  try {
    await regenerateDraft(conversation.conversationId, '');
  } catch {
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
  refineBtnText = 'Applying...';
  const userContext = `CURRENT DRAFT:\n${draftText}\n\nREFINEMENT INSTRUCTIONS:\n${refineInput.trim()}`;
  draftText = '';
  try {
    await regenerateDraft(conversation.conversationId, userContext);
  } catch {
    refineBtnText = 'Error';
  }
  refineInput = '';
  showRefineInput = false;
  setTimeout(() => {
    refineBtnDisabled = false;
    refineBtnText = 'Apply';
  }, 3000);
}

function handleOpen() {
  chrome.tabs.create({
    url: getMessengerUrl(conversation.conversationId),
    active: true,
  });
}

async function handleGenerateDocs() {
  docsBtnDisabled = true;
  docsBtnText = 'Generating...';
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
</script>

<div class="draft-section">
  {#if conversation.draftStatus === 'generating'}
    <div class="draft-generating">Generating AI draft...</div>
  {:else}
    <div class="draft-label">
      {conversation.draftReply ? 'AI Draft Reply' : 'Write Reply'}
    </div>
    <textarea
      class="draft-textarea"
      bind:value={draftText}
      placeholder={conversation.draftReply ? 'Edit the draft or send as-is...' : 'Type your reply or click Generate for an AI draft...'}
    ></textarea>
    <div class="draft-buttons">
      <button class="draft-btn open" onclick={handleOpen}>Open</button>
      <button
        class="draft-btn regen"
        disabled={regenBtnDisabled}
        onclick={handleRegenerate}
      >{regenBtnText}</button>
      {#if conversation.draftReply}
        <button
          class="draft-btn refine"
          onclick={() => { showRefineInput = !showRefineInput; }}
        >Refine</button>
      {/if}
      <button
        class="draft-btn send"
        disabled={sendBtnDisabled}
        style={sendBtnStyle}
        onclick={handleSendReply}
      >{sendBtnText}</button>
    </div>
    {#if showRefineInput}
      <div class="refine-area">
        <textarea
          class="refine-textarea"
          bind:value={refineInput}
          placeholder="e.g., rewrite in Sie form, be more formal, shorter..."
          rows="2"
        ></textarea>
        <button
          class="draft-btn refine-apply"
          disabled={refineBtnDisabled || !refineInput.trim()}
          onclick={handleRefine}
        >{refineBtnText}</button>
      </div>
    {/if}
    {#if aiMode === 'server'}
      {#if !showDocsForm}
        <button
          class="draft-btn docs-toggle"
          onclick={() => { showDocsForm = true; }}
          title="Generate Selbstauskunft + supporting documents PDF"
        >Generate Docs</button>
      {:else}
        <div class="docs-form">
          <div class="docs-form-field">
            <label class="docs-label" for="docs-address-{conversation.conversationId}">Address</label>
            <input
              id="docs-address-{conversation.conversationId}"
              type="text"
              class="docs-input"
              bind:value={docsAddress}
              placeholder="Listing address..."
            />
          </div>
          <div class="docs-form-field">
            <label class="docs-label" for="docs-movein-{conversation.conversationId}">Move-in date</label>
            <input
              id="docs-movein-{conversation.conversationId}"
              type="date"
              class="docs-input docs-date"
              bind:value={moveInDate}
            />
          </div>
          <div class="docs-form-actions">
            <button
              class="draft-btn docs-generate"
              disabled={docsBtnDisabled}
              onclick={handleGenerateDocs}
            >{docsBtnText}</button>
            <button
              class="draft-btn docs-cancel"
              onclick={() => { showDocsForm = false; docsStatus = 'idle'; }}
            >Cancel</button>
          </div>
          {#if docsStatus === 'success'}
            <div class="docs-feedback success">Documents downloaded!</div>
          {:else if docsStatus === 'error'}
            <div class="docs-feedback error">Generation failed. Is the server running?</div>
          {/if}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .draft-section {
    margin-top: 8px;
  }

  .draft-generating {
    font-size: 11px;
    color: #888;
    font-style: italic;
  }

  .draft-label {
    font-size: 10px;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .draft-textarea {
    width: 100%;
    min-height: 80px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 11px;
    font-family: inherit;
    resize: vertical;
  }

  .draft-buttons {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    align-items: flex-start;
  }

  .draft-btn {
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .draft-btn.send {
    flex: 1;
    background: #83F1DC;
    color: #1a1a1a;
  }

  .draft-btn.regen,
  .draft-btn.open {
    background: #f0f0f0;
    color: #333;
  }

  .draft-btn.refine {
    background: #f0f0f0;
    color: #333;
  }

  .draft-btn:disabled { opacity: 0.6; }

  /* Refine area */
  .refine-area {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    align-items: flex-end;
  }

  .refine-textarea {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 11px;
    font-family: inherit;
    resize: none;
  }

  .refine-textarea:focus {
    outline: none;
    border-color: #83F1DC;
  }

  .draft-btn.refine-apply {
    background: #83F1DC;
    color: #1a1a1a;
    white-space: nowrap;
  }

  /* Generate Docs toggle button */
  .draft-btn.docs-toggle {
    margin-top: 8px;
    background: #f0f0f0;
    color: #333;
    width: 100%;
  }

  .draft-btn.docs-toggle:hover {
    background: #e4e4e4;
  }

  /* Docs form */
  .docs-form {
    margin-top: 8px;
    padding: 10px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    background: #fafafa;
  }

  .docs-form-field {
    margin-bottom: 8px;
  }

  .docs-label {
    display: block;
    font-size: 10px;
    font-weight: 600;
    color: #888;
    margin-bottom: 3px;
  }

  .docs-input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 11px;
    font-family: inherit;
  }

  .docs-input:focus {
    outline: none;
    border-color: #83F1DC;
  }

  .docs-input.docs-date {
    width: 140px;
  }

  .docs-form-actions {
    display: flex;
    gap: 6px;
  }

  .draft-btn.docs-generate {
    flex: 1;
    background: #83F1DC;
    color: #1a1a1a;
  }

  .draft-btn.docs-cancel {
    background: #f0f0f0;
    color: #333;
  }

  .docs-feedback {
    margin-top: 6px;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .docs-feedback.success {
    background: #e6fff5;
    color: #0d7a4e;
  }

  .docs-feedback.error {
    background: #fff5f5;
    color: #dc3545;
  }
</style>
