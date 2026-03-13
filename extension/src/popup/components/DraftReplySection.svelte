<script lang="ts">
import { MESSENGER_BASE_URL } from '../../shared/constants';
import type { ConversationEntry } from '../../shared/types';
import { generateDocuments, regenerateDraft, sendConversationReply } from '../lib/messages';

let {
  conversation,
}: {
  conversation: ConversationEntry;
} = $props();

let draftText = $state('');
let sendBtnText = $state('Send Reply');
let sendBtnDisabled = $state(false);
let sendBtnStyle = $state('');
let regenBtnText = $state('Generate');
let regenBtnDisabled = $state(false);
let docsBtnText = $state('Docs');
let docsBtnDisabled = $state(false);
let docsBtnStyle = $state('');

// Default move-in date to 1st of next month
const nextMonth = new Date();
nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
let moveInDate = $state(nextMonth.toISOString().split('T')[0]);

// Sync draft text from conversation prop
$effect(() => {
  draftText = conversation.draftReply || '';
  regenBtnText = conversation.draftReply ? 'Regenerate' : 'Generate';
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
  const userContext = draftText.trim();
  draftText = '';
  try {
    await regenerateDraft(conversation.conversationId, userContext);
  } catch {
    regenBtnText = 'Error';
  }
  setTimeout(() => {
    regenBtnDisabled = false;
    regenBtnText = conversation.draftReply ? 'Regenerate' : 'Generate';
  }, 3000);
}

function handleOpen() {
  chrome.tabs.create({
    url: `${MESSENGER_BASE_URL}${conversation.conversationId}`,
    active: true,
  });
}

async function handleGenerateDocs() {
  docsBtnDisabled = true;
  docsBtnText = 'Generating...';
  try {
    const result = await generateDocuments(
      conversation.conversationId,
      conversation.listingTitle || '',
      moveInDate || '',
    );
    if (result.success) {
      docsBtnText = 'Downloaded!';
      docsBtnStyle = 'background: #e6fff5;';
    } else {
      docsBtnText = 'Failed';
      docsBtnStyle = 'background: #fff5f5;';
    }
  } catch {
    docsBtnText = 'Error';
    docsBtnStyle = 'background: #fff5f5;';
  }
  setTimeout(() => {
    docsBtnDisabled = false;
    docsBtnText = 'Docs';
    docsBtnStyle = '';
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
      <button
        class="draft-btn send"
        disabled={sendBtnDisabled}
        style={sendBtnStyle}
        onclick={handleSendReply}
      >{sendBtnText}</button>
      <button
        class="draft-btn regen"
        disabled={regenBtnDisabled}
        onclick={handleRegenerate}
      >{regenBtnText}</button>
      <button class="draft-btn open" onclick={handleOpen}>Open</button>
      <div class="movein-wrap">
        <input type="date" class="movein-input" bind:value={moveInDate} title="Move-in date for Selbstauskunft" />
        <span class="movein-label">Move-in date</span>
      </div>
      <button
        class="draft-btn docs"
        disabled={docsBtnDisabled}
        style={docsBtnStyle}
        title="Generate Selbstauskunft + supporting documents PDF"
        onclick={handleGenerateDocs}
      >{docsBtnText}</button>
    </div>
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
    flex-wrap: wrap;
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
  .draft-btn.open,
  .draft-btn.docs {
    background: #f0f0f0;
    color: #333;
  }

  .draft-btn:disabled { opacity: 0.6; }

  .movein-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .movein-input {
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 11px;
    width: 120px;
  }

  .movein-label {
    font-size: 9px;
    color: #888;
    margin-top: 2px;
    padding-left: 2px;
  }
</style>
