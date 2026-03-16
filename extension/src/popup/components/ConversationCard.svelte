<script lang="ts">
import type { ConversationEntry } from '../../shared/types';
import { markConversationRead } from '../lib/messages';
import AppointmentSection from './AppointmentSection.svelte';
import ConversationMessages from './ConversationMessages.svelte';
import DraftReplySection from './DraftReplySection.svelte';

let {
  conversation,
  isExpanded = false,
  onToggle,
  onBadgeDecrement,
  aiMode = 'direct',
}: {
  conversation: ConversationEntry;
  isExpanded?: boolean;
  onToggle: (id: string) => void;
  onBadgeDecrement: () => void;
  aiMode?: string;
} = $props();

let hasUnread = $state(false);

// Sync from conversation prop
$effect(() => {
  hasUnread = conversation.hasUnreadReply;
});

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
      {#if conversation.referenceId}
        <a class="conv-listing" href="https://www.immobilienscout24.de/expose/{conversation.referenceId}" target="_blank" onclick={(e) => e.stopPropagation()}>
          {conversation.listingTitle || `Expose ${conversation.referenceId}`}
        </a>
      {:else if conversation.listingTitle}
        <div class="conv-listing">{conversation.listingTitle}</div>
      {/if}
      {#if conversation.appointment && conversation.appointmentStatus}
        {@const apptStartRaw = conversation.appointment.start ? new Date(conversation.appointment.start) : null}
        {@const apptStart = apptStartRaw && !isNaN(apptStartRaw.getTime()) ? apptStartRaw : null}
        {@const isPast = apptStart ? apptStart < new Date() : false}
        {@const apptBadgeLabels: Record<string, string> = {
          pending: '📅 Viewing pending',
          accepted: isPast ? '✓ Visit done' : '📅 Visit upcoming',
          rejected: '✗ Visit rejected',
          alternative_requested: '↺ Alternative requested',
        }}
        {@const apptBadgeColors: Record<string, string> = {
          pending: '#e8eaff',
          accepted: isPast ? '#e0e0e0' : '#d4edda',
          rejected: '#f8d7da',
          alternative_requested: '#fff3cd',
        }}
        <span class="appt-badge" style="background: {apptBadgeColors[conversation.appointmentStatus] || '#f0f0f0'}; {isPast && conversation.appointmentStatus === 'accepted' ? 'color: #888;' : ''}">
          {apptBadgeLabels[conversation.appointmentStatus] || conversation.appointmentStatus}
        </span>
      {/if}
      <div class="conv-preview">{preview}</div>
    </div>
    <div class="conv-time">{timeStr}</div>
  </div>

  <!-- Body (expanded) -->
  {#if isExpanded}
    <div class="conv-body">
      <ConversationMessages messages={conversation.messages} />
      <AppointmentSection {conversation} />
      <DraftReplySection {conversation} {aiMode} />
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
    text-decoration: none;
    display: block;
  }

  a.conv-listing:hover {
    color: #3dbda8;
    text-decoration: underline;
  }

  .appt-badge {
    display: inline-block;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    margin-top: 3px;
    color: #333;
    font-weight: 500;
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
</style>
