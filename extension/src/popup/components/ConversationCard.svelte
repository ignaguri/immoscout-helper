<script lang="ts">
import {
  generateDocuments,
  markConversationRead,
  regenerateDraft,
  respondToAppointment,
  sendConversationReply,
} from '../lib/messages';

let {
  conversation,
  isExpanded = false,
  onToggle,
  onBadgeDecrement,
}: {
  conversation: any;
  isExpanded?: boolean;
  onToggle: (id: string) => void;
  onBadgeDecrement: () => void;
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
let hasUnread = $state(false);
let apptBtnsDisabled = $state(false);
let apptResultText = $state('');
let apptResultStyle = $state('');

// Sync from conversation prop
$effect(() => {
  hasUnread = conversation.hasUnreadReply;
});
$effect(() => {
  draftText = conversation.draftReply || '';
  regenBtnText = conversation.draftReply ? 'Regenerate' : 'Generate';
});

// Default move-in date to 1st of next month
const nextMonth = new Date();
nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
let moveInDate = $state(nextMonth.toISOString().split('T')[0]);
let apptUserContext = $state('');

// (draft text sync handled above)

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleHeaderClick() {
  const wasCollapsed = !isExpanded;
  onToggle(conversation.conversationId);

  if (wasCollapsed && hasUnread) {
    markConversationRead(conversation.conversationId);
    hasUnread = false;
    conversation.hasUnreadReply = false;
    onBadgeDecrement();
  }
}

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
    url: `https://www.immobilienscout24.de/messenger/conversations/${conversation.conversationId}`,
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

async function handleAppointmentResponse(response: string, _btnLabel: string) {
  const appt = conversation.appointment;
  const apptDate = appt?.date || appt?.startDate || '';
  const apptTime = appt?.time || appt?.startTime || '';
  const apptLocation = appt?.location || appt?.address || '';

  apptBtnsDisabled = true;
  apptResultText = 'Processing...';
  apptResultStyle = '';
  try {
    const result = await respondToAppointment(conversation.conversationId, response, apptUserContext.trim(), {
      date: apptDate,
      time: apptTime,
      location: apptLocation,
    });
    if (result.success) {
      apptResultText = 'Tab opened - review & send';
      apptResultStyle = 'background: #e6fff5; color: #1a1a1a;';
    } else {
      apptResultText = `Failed: ${result.error || 'unknown'}`;
      apptResultStyle = 'background: #fff5f5; color: #c00;';
    }
  } catch (e: any) {
    apptResultText = `Error: ${e.message}`;
    apptResultStyle = 'background: #fff5f5; color: #c00;';
  }
  setTimeout(() => {
    apptBtnsDisabled = false;
    apptResultText = '';
    apptResultStyle = '';
  }, 5000);
}

// Computed values
let lastMsg = $derived(
  conversation.lastMessagePreview ||
    (conversation.messages.length > 0 ? conversation.messages[conversation.messages.length - 1].text : ''),
);
let preview = $derived(lastMsg.substring(0, 80) + (lastMsg.length > 80 ? '...' : ''));
let timeStr = $derived(
  conversation.lastUpdateDateTime
    ? new Date(conversation.lastUpdateDateTime).toLocaleDateString('de-DE', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
);

let apptDate = $derived(conversation.appointment?.date || conversation.appointment?.startDate || '');
let apptTime = $derived(conversation.appointment?.time || conversation.appointment?.startTime || '');
let apptDuration = $derived(conversation.appointment?.duration || '');
let apptLocation = $derived(conversation.appointment?.location || conversation.appointment?.address || '');
</script>

<div class="conv-card" class:unread={hasUnread}>
  <!-- Header (always visible) -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="conv-header" onclick={handleHeaderClick} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleHeaderClick(); } }} role="button" tabindex="0">
    {#if hasUnread}
      <span class="unread-dot"></span>
    {/if}
    <div class="conv-header-content">
      <div class="conv-landlord">{conversation.landlordName || 'Unknown'}</div>
      <div class="conv-listing">{conversation.listingTitle || conversation.referenceId || ''}</div>
      <div class="conv-preview">{preview}</div>
    </div>
    <div class="conv-time">{timeStr}</div>
  </div>

  <!-- Body (expanded) -->
  {#if isExpanded}
    <div class="conv-body">
      <!-- Messages thread -->
      {#if conversation.messages.length > 0}
        <div class="conv-thread">
          {#each conversation.messages as msg}
            <div class="bubble" class:user-bubble={msg.role === 'user'} class:landlord-bubble={msg.role !== 'user'}>
              {msg.text}
              {#if msg.timestamp}
                <div class="bubble-time">{new Date(msg.timestamp).toLocaleString('de-DE')}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Appointment section -->
      {#if conversation.appointment && conversation.appointmentStatus === 'pending'}
        <div class="appt-section">
          <div class="appt-header">Besichtigungstermin</div>
          <div class="appt-details">
            {#if apptDate}Datum: {apptDate}<br>{/if}
            {#if apptTime}Zeit: {apptTime}{#if apptDuration} ({apptDuration}){/if}<br>{/if}
            {#if apptLocation}Ort: {apptLocation}{/if}
            {#if !apptDate && !apptTime && !apptLocation}Termindetails nicht verfügbar{/if}
          </div>
          <textarea
            class="appt-context"
            placeholder='Optional: Add context for the AI, e.g. "reject because move-in is too soon"'
            bind:value={apptUserContext}
          ></textarea>
          <div class="appt-buttons">
            <button
              class="appt-btn accept"
              disabled={apptBtnsDisabled}
              onclick={() => handleAppointmentResponse('accept', 'Accept')}
            >Accept</button>
            <button
              class="appt-btn reject"
              disabled={apptBtnsDisabled}
              onclick={() => handleAppointmentResponse('reject', 'Reject')}
            >Reject</button>
            <button
              class="appt-btn alternative"
              disabled={apptBtnsDisabled}
              onclick={() => handleAppointmentResponse('alternative', 'Alternative')}
            >Alternative</button>
          </div>
          {#if apptResultText}
            <div class="appt-result" style={apptResultStyle}>{apptResultText}</div>
          {/if}
        </div>
      {:else if conversation.appointment && conversation.appointmentStatus && conversation.appointmentStatus !== 'pending'}
        {@const statusLabels: Record<string, string> = { accepted: 'Accepted', rejected: 'Rejected', alternative_requested: 'Alternative requested' }}
        {@const statusColors: Record<string, string> = { accepted: '#d4edda', rejected: '#f8d7da', alternative_requested: '#fff3cd' }}
        <div class="appt-status" style="background: {statusColors[conversation.appointmentStatus] || '#f0f0f0'};">
          Appointment: {statusLabels[conversation.appointmentStatus] || conversation.appointmentStatus}
        </div>
      {/if}

      <!-- Draft reply section -->
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
    </div>
  {/if}
</div>

<style>
  .conv-card {
    border: 1px solid #dee2e6;
    border-radius: 8px;
    background: white;
    overflow: hidden;
  }

  .conv-card.unread {
    border-left-color: #e74c3c;
    border-left-width: 3px;
  }

  .conv-header {
    padding: 10px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .conv-header:hover {
    background: #fafafa;
  }

  .unread-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #e74c3c;
    flex-shrink: 0;
  }

  .conv-header-content {
    flex: 1;
    min-width: 0;
  }

  .conv-landlord {
    font-size: 12px;
    font-weight: 600;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conv-listing {
    font-size: 11px;
    color: #888;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conv-preview {
    font-size: 10px;
    color: #aaa;
    margin-top: 2px;
  }

  .conv-time {
    font-size: 10px;
    color: #bbb;
    flex-shrink: 0;
  }

  .conv-body {
    border-top: 1px solid #eee;
    padding: 10px 12px;
  }

  .conv-thread {
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 10px;
  }

  .bubble {
    padding: 8px 10px;
    border-radius: 8px;
    margin-bottom: 6px;
    font-size: 11px;
    line-height: 1.4;
    max-width: 85%;
    word-wrap: break-word;
  }

  .user-bubble {
    background: #e8f8f4;
    margin-left: auto;
    text-align: right;
    border-bottom-right-radius: 2px;
  }

  .landlord-bubble {
    background: #f0f0f0;
    margin-right: auto;
    border-bottom-left-radius: 2px;
  }

  .bubble-time {
    font-size: 9px;
    color: #bbb;
    margin-top: 3px;
  }

  .appt-section {
    margin-top: 8px;
    padding: 10px;
    background: #f8f9ff;
    border: 1px solid #d0d5ff;
    border-radius: 8px;
  }

  .appt-header {
    font-size: 11px;
    font-weight: 600;
    color: #333;
    margin-bottom: 6px;
  }

  .appt-details {
    font-size: 11px;
    color: #555;
    margin-bottom: 8px;
    line-height: 1.5;
  }

  .appt-context {
    width: 100%;
    min-height: 40px;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 11px;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 8px;
  }

  .appt-buttons {
    display: flex;
    gap: 6px;
  }

  .appt-btn {
    flex: 1;
    padding: 8px 6px;
    border: none;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .appt-btn.accept { background: #d4edda; color: #1a5c2a; }
  .appt-btn.reject { background: #f8d7da; color: #721c24; }
  .appt-btn.alternative { background: #f0f0f0; color: #333; }
  .appt-btn:disabled { opacity: 0.6; }

  .appt-result {
    margin-top: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 11px;
  }

  .appt-status {
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 11px;
    color: #555;
  }

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
