<script lang="ts">
import { error } from '../../shared/logger';
import type { ConversationEntry, ExportFormat, SavedSnapshotMeta } from '../../shared/types';
import {
  markConversationRead,
  deleteSnapshot as rpcDeleteSnapshot,
  exportSnapshot as rpcExportSnapshot,
  saveSnapshot as rpcSaveSnapshot,
} from '../lib/messages';
import AppointmentSection from './AppointmentSection.svelte';
import ConversationMessages from './ConversationMessages.svelte';
import DraftReplySection from './DraftReplySection.svelte';

let {
  conversation,
  isExpanded = false,
  onToggle,
  onBadgeDecrement,
  snapshot = null,
  aiMode = 'direct',
}: {
  conversation: ConversationEntry;
  isExpanded?: boolean;
  onToggle: (id: string) => void;
  onBadgeDecrement: () => void;
  snapshot?: SavedSnapshotMeta | null;
  aiMode?: string;
} = $props();

let saveBusy = $state(false);
let saveStatus = $state<string | null>(null);
let exportBusy = $state(false);
let deleteBusy = $state(false);

function snapshotDateStr(meta: SavedSnapshotMeta): string {
  return new Date(meta.savedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

async function handleSaveSnapshot(e: Event) {
  e.stopPropagation();
  if (!conversation.referenceId || saveBusy) return;
  saveBusy = true;
  saveStatus = 'Saving…';
  try {
    const url = `https://www.immobilienscout24.de/expose/${conversation.referenceId}`;
    const result = await rpcSaveSnapshot(conversation.referenceId, url);
    if (result.success) {
      const imgPart = result.imageCount != null ? ` (${result.imageCount} images)` : '';
      saveStatus = `Saved${imgPart}`;
    } else {
      saveStatus = result.error || 'Failed';
    }
  } catch (e) {
    error('[ConversationCard] save snapshot failed:', e);
    saveStatus = 'Failed';
  }
  setTimeout(() => {
    saveStatus = null;
  }, 2500);
  saveBusy = false;
}

function handleView(e: Event) {
  e.stopPropagation();
  if (!snapshot) return;
  const url = chrome.runtime.getURL(`viewer.html?id=${encodeURIComponent(snapshot.listingId)}`);
  void chrome.tabs.create({ url });
}

async function handleExport(e: Event, format: ExportFormat) {
  e.stopPropagation();
  if (!snapshot || exportBusy) return;
  exportBusy = true;
  try {
    const result = await rpcExportSnapshot(snapshot.listingId, format);
    if (!result.success) saveStatus = result.error || 'Export failed';
  } catch (e) {
    error('[ConversationCard] export failed:', e);
    saveStatus = 'Export failed';
  }
  setTimeout(() => {
    saveStatus = null;
  }, 2500);
  exportBusy = false;
}

async function handleDelete(e: Event) {
  e.stopPropagation();
  if (!snapshot || deleteBusy) return;
  if (!confirm('Delete this snapshot? The archive will be removed locally.')) return;
  deleteBusy = true;
  try {
    await rpcDeleteSnapshot(snapshot.listingId);
  } catch (e) {
    error('[ConversationCard] delete failed:', e);
  }
  deleteBusy = false;
}

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
        <a class="conv-listing" href="https://www.immobilienscout24.de/expose/{conversation.referenceId}" target="_blank" rel="noopener noreferrer" onclick={(e) => e.stopPropagation()}>
          {conversation.listingTitle || `Expose ${conversation.referenceId}`}
        </a>
      {:else if conversation.listingTitle}
        <div class="conv-listing">{conversation.listingTitle}</div>
      {/if}
      {#if snapshot}
        <span class="snap-badge" title="Saved {snapshotDateStr(snapshot)} ({snapshot.imageCount} images)">📦 Saved</span>
      {/if}
      {#if conversation.appointment && conversation.appointmentStatus}
        {@const apptStartRaw = conversation.appointment.start ? new Date(conversation.appointment.start) : null}
        {@const apptStart = apptStartRaw && !Number.isNaN(apptStartRaw.getTime()) ? apptStartRaw : null}
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
      {#if conversation.referenceId}
        <div class="snap-row">
          {#if snapshot}
            <span class="snap-summary">📦 {snapshot.imageCount} images · {snapshotDateStr(snapshot)}</span>
            <button class="snap-btn" onclick={handleView}>View</button>
            <button class="snap-btn" disabled={exportBusy} onclick={(e) => handleExport(e, 'html')}>HTML</button>
            <button class="snap-btn" disabled={exportBusy} onclick={(e) => handleExport(e, 'pdf')}>PDF</button>
            <button class="snap-btn" disabled={exportBusy} onclick={(e) => handleExport(e, 'zip')}>ZIP</button>
            <button class="snap-btn snap-delete" disabled={deleteBusy} onclick={handleDelete} title="Delete snapshot">🗑</button>
          {:else}
            <button class="snap-btn snap-save" disabled={saveBusy} onclick={handleSaveSnapshot}>
              {saveBusy ? 'Saving…' : '📦 Save snapshot'}
            </button>
          {/if}
          {#if saveStatus}
            <span class="snap-status">{saveStatus}</span>
          {/if}
        </div>
      {/if}
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

  .snap-badge {
    display: inline-block;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    margin-top: 3px;
    margin-left: 4px;
    color: #22533c;
    background: #d6f5e6;
    font-weight: 500;
  }

  .snap-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px;
    margin-bottom: 8px;
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 6px;
  }

  .snap-summary {
    font-size: 11px;
    color: #555;
    margin-right: 4px;
  }

  .snap-btn {
    border: 1px solid #ddd;
    background: white;
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
    color: #333;
  }

  .snap-btn:hover:not(:disabled) {
    background: #f0f0f0;
  }

  .snap-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .snap-btn.snap-save {
    background: #3dbda8;
    color: white;
    border-color: #3dbda8;
  }

  .snap-btn.snap-save:hover:not(:disabled) {
    background: #34a690;
  }

  .snap-btn.snap-delete {
    color: #c0392b;
  }

  .snap-status {
    font-size: 11px;
    color: #3dbda8;
    margin-left: auto;
  }
</style>
