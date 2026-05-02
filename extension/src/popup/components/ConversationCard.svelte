<script lang="ts">
import Trash2 from '@lucide/svelte/icons/trash-2';
import Download from '@lucide/svelte/icons/download';
import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
import Calendar from '@lucide/svelte/icons/calendar';
import { error } from '../../shared/logger';
import type { ConversationEntry, ExportFormat, SavedSnapshotMeta } from '../../shared/types';
import { buildGoogleCalendarUrl, downloadICS } from '../lib/calendar';
import {
  markConversationRead,
  deleteSnapshot as rpcDeleteSnapshot,
  exportSnapshot as rpcExportSnapshot,
  saveSnapshot as rpcSaveSnapshot,
} from '../lib/messages';
import AppointmentSection from './AppointmentSection.svelte';
import ConversationMessages from './ConversationMessages.svelte';
import DraftReplySection from './DraftReplySection.svelte';
import { APPOINTMENT_STATUS_TONES } from '../lib/tone';
import { Button } from '$lib/components/ui/button';
import { Badge } from '$lib/components/ui/badge';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
import { cn } from '$lib/utils';

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

<div
  class={cn(
    'overflow-hidden rounded-lg border bg-background',
    hasUnread
      ? 'border-l-[3px] border-l-destructive border-y-border border-r-border'
      : 'border-border',
  )}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]"
    onclick={handleHeaderClick}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleHeaderClick(); } }}
    role="button"
    tabindex="0"
    aria-expanded={isExpanded}
  >
    {#if hasUnread}
      <span class="size-2 shrink-0 rounded-full bg-destructive" aria-label="Unread"></span>
    {/if}
    <div class="min-w-0 flex-1">
      <div class="truncate text-xs font-semibold text-foreground">{conversation.landlordName || 'Unknown'}</div>
      {#if conversation.referenceId}
        <a
          class="block truncate text-[11px] text-muted-foreground no-underline hover:text-primary hover:underline"
          href="https://www.immobilienscout24.de/expose/{conversation.referenceId}"
          target="_blank"
          rel="noopener noreferrer"
          onclick={(e) => e.stopPropagation()}
        >
          {conversation.listingTitle || `Expose ${conversation.referenceId}`}
        </a>
      {:else if conversation.listingTitle}
        <div class="truncate text-[11px] text-muted-foreground">{conversation.listingTitle}</div>
      {/if}
      <div class="mt-1 flex flex-wrap gap-1">
        {#if snapshot}
          <Badge variant="success" class="text-[10px]" title="Saved {snapshotDateStr(snapshot)} ({snapshot.imageCount} images)">📦 Saved</Badge>
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
          {@const tone = isPast && conversation.appointmentStatus === 'accepted' ? 'secondary' : APPOINTMENT_STATUS_TONES[conversation.appointmentStatus] || 'secondary'}
          <Badge variant={tone} class="text-[10px]">
            {apptBadgeLabels[conversation.appointmentStatus] || conversation.appointmentStatus}
          </Badge>
        {/if}
      </div>
      <div class="mt-1 text-[10px] text-muted-foreground/70">{preview}</div>
    </div>
    <div class="shrink-0 text-[10px] text-muted-foreground/70">{timeStr}</div>
  </div>

  {#if isExpanded}
    <div class="border-t border-border px-3 py-2.5">
      {#if conversation.referenceId}
        <div class="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/40 p-2">
          {#if snapshot}
            <span class="mr-1 text-[11px] text-muted-foreground">📦 {snapshot.imageCount} images · {snapshotDateStr(snapshot)}</span>
            <Button variant="outline" size="xs" onclick={handleView}>View</Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="More snapshot actions"
                    title="More actions"
                    {...props}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item disabled={exportBusy} onSelect={(e: Event) => handleExport(e, 'html')}>
                  <Download aria-hidden="true" />
                  Export HTML
                </DropdownMenu.Item>
                <DropdownMenu.Item disabled={exportBusy} onSelect={(e: Event) => handleExport(e, 'pdf')}>
                  <Download aria-hidden="true" />
                  Export PDF
                </DropdownMenu.Item>
                <DropdownMenu.Item disabled={exportBusy} onSelect={(e: Event) => handleExport(e, 'zip')}>
                  <Download aria-hidden="true" />
                  Export ZIP
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  variant="destructive"
                  disabled={deleteBusy}
                  onSelect={(e: Event) => handleDelete(e)}
                >
                  <Trash2 aria-hidden="true" />
                  Delete snapshot
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {:else}
            <Button size="xs" loading={saveBusy} disabled={saveBusy} onclick={handleSaveSnapshot}>
              {saveBusy ? 'Saving…' : '📦 Save snapshot'}
            </Button>
          {/if}
          {#if conversation.appointmentStatus === 'accepted'}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add to Google Calendar"
              title="Add to Google Calendar"
              onclick={(e: Event) => { e.stopPropagation(); window.open(buildGoogleCalendarUrl(conversation), '_blank', 'noopener,noreferrer'); }}
            >
              <Calendar aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Download .ics file"
              title="Download .ics"
              onclick={(e: Event) => { e.stopPropagation(); downloadICS(conversation); }}
            >
              <Download aria-hidden="true" />
            </Button>
          {/if}
          {#if saveStatus}
            <span class="ml-auto text-[11px] text-primary">{saveStatus}</span>
          {/if}
        </div>
      {/if}
      <ConversationMessages messages={conversation.messages} />
      <AppointmentSection {conversation} />
      <DraftReplySection {conversation} {aiMode} />
    </div>
  {/if}
</div>
