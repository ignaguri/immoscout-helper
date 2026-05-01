<script lang="ts">
import { onMount } from 'svelte';
import { SAVED_SNAPSHOTS_KEY } from '../../shared/constants';
import { error } from '../../shared/logger';
import type { ConversationEntry, SavedSnapshotMeta } from '../../shared/types';
import ConversationCard from '../components/ConversationCard.svelte';
import { checkRepliesNow } from '../lib/messages';
import { loadConversations as loadConvStorage, loadSavedSnapshots } from '../lib/storage';

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

// Sort and optionally filter conversations
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

<div class="search-wrap">
  <input
    type="text"
    class="search-input"
    placeholder="Search by name or address..."
    bind:value={searchQuery}
    oninput={() => { displayLimit = PAGE_SIZE; }}
  />
  {#if searchQuery}
    <button class="search-clear" aria-label="Clear search" title="Clear search" onclick={() => { searchQuery = ''; displayLimit = PAGE_SIZE; }}>×</button>
  {/if}
</div>

<div class="conv-controls">
  <button class="btn btn-test" disabled={checkBtnDisabled} onclick={handleCheckNow}>
    {checkBtnText}
  </button>
  <button
    class="btn-filter"
    class:active={unreadOnly}
    onclick={() => { unreadOnly = !unreadOnly; displayLimit = PAGE_SIZE; }}
    title="Show only unread conversations"
  >
    {#if unreadOnly}<span class="filter-check">✓</span>{/if}Unread{#if unreadFilterCount > 0} ({unreadFilterCount}){/if}
  </button>
  <button
    class="btn-filter"
    class:active={repliedOnly}
    onclick={() => { repliedOnly = !repliedOnly; displayLimit = PAGE_SIZE; }}
    title="Show only conversations where the landlord replied"
  >
    {#if repliedOnly}<span class="filter-check">✓</span>{/if}Replied{#if repliedFilterCount > 0} ({repliedFilterCount}){/if}
  </button>
  <button
    class="btn-filter"
    class:active={appointmentsOnly}
    onclick={() => { appointmentsOnly = !appointmentsOnly; displayLimit = PAGE_SIZE; }}
    title="Show only conversations with appointments"
  >
    {#if appointmentsOnly}<span class="filter-check">✓</span>{/if}📅{#if appointmentCount > 0} ({appointmentCount}){/if}
  </button>
  {#if lastCheckStr}
    <span class="last-check">{lastCheckStr}</span>
  {/if}
</div>

{#if relevantConversations.length === 0}
  <div class="empty-state">
    {#if searchQuery.trim()}
      No conversations match your search.
    {:else if unreadOnly || repliedOnly || appointmentsOnly}
      No conversations match the active filters.
    {:else}
      No conversations yet. Start monitoring to send messages, then they will appear here.
    {/if}
  </div>
{:else}
  {#if relevantConversations.length > PAGE_SIZE}
    <div class="showing-count">
      Showing {visibleConversations.length} of {relevantConversations.length} conversations
    </div>
  {/if}
  <div class="conv-list">
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
    <button class="btn btn-secondary load-more" onclick={() => { displayLimit += PAGE_SIZE; }}>
      Load more
    </button>
  {/if}
{/if}

<style>
  .conv-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .conv-controls .btn {
    width: auto;
    padding: 8px 16px;
    margin-top: 0;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-filter {
    padding: 6px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: #fff;
    font-size: var(--text-sm);
    cursor: pointer;
    color: var(--color-text-muted);
    white-space: nowrap;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .btn-filter.active {
    background: var(--color-brand);
    border-color: var(--color-brand-strong);
    color: var(--color-text);
    font-weight: 600;
  }

  .btn-filter:hover {
    background: var(--color-bg-subtle);
  }

  .btn-filter.active:hover {
    background: var(--color-brand-hover);
  }

  .filter-check {
    margin-right: 4px;
    font-weight: 700;
  }

  .last-check {
    font-size: 11px;
    color: #888;
  }

  .empty-state {
    text-align: center;
    padding: 30px 20px;
    color: #999;
    font-size: 12px;
  }

  .showing-count {
    font-size: 11px;
    color: #888;
    margin-bottom: 8px;
  }

  .conv-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .load-more {
    margin-top: 12px;
  }

  .search-wrap {
    position: relative;
    margin-bottom: 12px;
  }

  .search-input {
    width: 100%;
    padding: 7px 28px 7px 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
    color: #333;
  }

  .search-input:focus {
    outline: none;
    border-color: #83F1DC;
  }

  .search-input::placeholder {
    color: #aaa;
  }

  .search-clear {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    font-size: 16px;
    color: #999;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .search-clear:hover {
    color: #555;
  }
</style>
