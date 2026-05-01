<script lang="ts">
import { onMount } from 'svelte';
import Check from '@lucide/svelte/icons/check';
import X from '@lucide/svelte/icons/x';
import { SAVED_SNAPSHOTS_KEY } from '../../shared/constants';
import { error } from '../../shared/logger';
import type { ConversationEntry, SavedSnapshotMeta } from '../../shared/types';
import ConversationCard from '../components/ConversationCard.svelte';
import { checkRepliesNow } from '../lib/messages';
import { loadConversations as loadConvStorage, loadSavedSnapshots } from '../lib/storage';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import EmptyState from '$lib/components/EmptyState.svelte';

let {
  conversations = $bindable(),
  lastCheckTime = $bindable(),
  unreadCount = $bindable(),
  aiMode = 'direct',
}: {
  conversations: ConversationEntry[];
  lastCheckTime: string | null;
  unreadCount: number;
  aiMode?: string;
} = $props();

let snapshots = $state<Record<string, SavedSnapshotMeta>>({});

onMount(() => {
  loadSavedSnapshots()
    .then((s) => {
      snapshots = s;
    })
    .catch(() => {});
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return;
    if (changes[SAVED_SNAPSHOTS_KEY]) {
      snapshots = (changes[SAVED_SNAPSHOTS_KEY].newValue as Record<string, SavedSnapshotMeta>) || {};
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
});

let checkBtnText = $state('Check Now');
let checkBtnDisabled = $state(false);
let expandedConvId = $state<string | null>(null);
let appointmentsOnly = $state(false);
let unreadOnly = $state(false);
let repliedOnly = $state(false);
let searchQuery = $state('');
let displayLimit = $state(10);
const PAGE_SIZE = 10;

let relevantConversations = $derived(
  conversations
    .filter((c) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return c.landlordName?.toLowerCase().includes(q) || c.listingTitle?.toLowerCase().includes(q);
    })
    .filter((c) => !appointmentsOnly || c.appointment != null)
    .filter((c) => !unreadOnly || c.hasUnreadReply)
    .filter((c) => !repliedOnly || c.hasLandlordReply)
    .sort((a, b) => {
      if (a.hasUnreadReply && !b.hasUnreadReply) return -1;
      if (!a.hasUnreadReply && b.hasUnreadReply) return 1;
      return (b.lastUpdateDateTime || '').localeCompare(a.lastUpdateDateTime || '');
    }),
);

let visibleConversations = $derived(relevantConversations.slice(0, displayLimit));
let hasMore = $derived(relevantConversations.length > displayLimit);

let appointmentCount = $derived(conversations.filter((c) => c.appointment != null).length);
let unreadFilterCount = $derived(conversations.filter((c) => c.hasUnreadReply).length);
let repliedFilterCount = $derived(conversations.filter((c) => c.hasLandlordReply).length);

let lastCheckStr = $derived(
  lastCheckTime
    ? `Last check: ${new Date(lastCheckTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '',
);

async function handleCheckNow() {
  checkBtnDisabled = true;
  checkBtnText = 'Checking...';
  try {
    await checkRepliesNow();
    const data = await loadConvStorage();
    conversations = data.conversations;
    lastCheckTime = data.lastCheck;
    unreadCount = data.unreadCount;
  } catch (e) {
    error('Error checking replies:', e);
  }
  checkBtnDisabled = false;
  checkBtnText = 'Check Now';
}

function handleToggle(id: string) {
  expandedConvId = expandedConvId === id ? null : id;
}

function handleBadgeDecrement() {
  if (unreadCount > 0) unreadCount--;
}
</script>

<div class="relative mb-3">
  <Input
    type="text"
    placeholder="Search by name or address…"
    bind:value={searchQuery}
    oninput={() => { displayLimit = PAGE_SIZE; }}
    class="pr-8"
  />
  {#if searchQuery}
    <Button
      variant="ghost"
      size="icon-xs"
      class="absolute right-1 top-1/2 -translate-y-1/2"
      aria-label="Clear search"
      onclick={() => { searchQuery = ''; displayLimit = PAGE_SIZE; }}
    >
      <X aria-hidden="true" />
    </Button>
  {/if}
</div>

<div class="mb-3 flex flex-wrap items-center gap-2">
  <Button size="sm" disabled={checkBtnDisabled} loading={checkBtnDisabled} onclick={handleCheckNow}>
    {checkBtnText}
  </Button>

  <Button
    variant={unreadOnly ? 'default' : 'outline'}
    size="sm"
    aria-pressed={unreadOnly}
    title="Show only unread conversations"
    onclick={() => { unreadOnly = !unreadOnly; displayLimit = PAGE_SIZE; }}
  >
    {#if unreadOnly}<Check aria-hidden="true" />{/if}
    Unread{#if unreadFilterCount > 0} ({unreadFilterCount}){/if}
  </Button>

  <Button
    variant={repliedOnly ? 'default' : 'outline'}
    size="sm"
    aria-pressed={repliedOnly}
    title="Show only conversations where the landlord replied"
    onclick={() => { repliedOnly = !repliedOnly; displayLimit = PAGE_SIZE; }}
  >
    {#if repliedOnly}<Check aria-hidden="true" />{/if}
    Replied{#if repliedFilterCount > 0} ({repliedFilterCount}){/if}
  </Button>

  <Button
    variant={appointmentsOnly ? 'default' : 'outline'}
    size="sm"
    aria-pressed={appointmentsOnly}
    title="Show only conversations with appointments"
    onclick={() => { appointmentsOnly = !appointmentsOnly; displayLimit = PAGE_SIZE; }}
  >
    {#if appointmentsOnly}<Check aria-hidden="true" />{/if}
    📅{#if appointmentCount > 0} ({appointmentCount}){/if}
  </Button>

  {#if lastCheckStr}
    <span class="text-[11px] text-muted-foreground">{lastCheckStr}</span>
  {/if}
</div>

{#if relevantConversations.length === 0}
  {#if searchQuery.trim()}
    <EmptyState title="No matches" sub="No conversations match your search." />
  {:else if unreadOnly || repliedOnly || appointmentsOnly}
    <EmptyState title="No matches" sub="No conversations match the active filters." />
  {:else}
    <EmptyState title="No conversations yet" sub="Start monitoring to send messages — replies will appear here." />
  {/if}
{:else}
  {#if relevantConversations.length > PAGE_SIZE}
    <div class="mb-2 text-[11px] text-muted-foreground">
      Showing {visibleConversations.length} of {relevantConversations.length} conversations
    </div>
  {/if}
  <div class="flex flex-col gap-2">
    {#each visibleConversations as conv (conv.conversationId)}
      <ConversationCard
        conversation={conv}
        isExpanded={expandedConvId === conv.conversationId}
        onToggle={handleToggle}
        onBadgeDecrement={handleBadgeDecrement}
        snapshot={conv.referenceId ? snapshots[conv.referenceId] ?? null : null}
        {aiMode}
      />
    {/each}
  </div>
  {#if hasMore}
    <Button variant="secondary" class="mt-3 w-full" onclick={() => { displayLimit += PAGE_SIZE; }}>
      Load more
    </Button>
  {/if}
{/if}
