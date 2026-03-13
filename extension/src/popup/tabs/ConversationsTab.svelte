<script lang="ts">
import ConversationCard from '../components/ConversationCard.svelte';
import { checkRepliesNow } from '../lib/messages';
import { loadConversations as loadConvStorage } from '../lib/storage';

let {
  conversations = $bindable(),
  lastCheckTime = $bindable(),
  unreadCount = $bindable(),
}: {
  conversations: any[];
  lastCheckTime: string | null;
  unreadCount: number;
} = $props();

let checkBtnText = $state('Check Now');
let checkBtnDisabled = $state(false);
let expandedConvId = $state<string | null>(null);

// Filter to relevant conversations
let relevantConversations = $derived(
  conversations
    .filter(
      (c) =>
        c.hasUnreadReply ||
        c.messages.length > 0 ||
        c.draftReply ||
        (c.appointment && !['accepted', 'rejected'].includes(c.appointmentStatus)),
    )
    .sort((a, b) => {
      if (a.hasUnreadReply && !b.hasUnreadReply) return -1;
      if (!a.hasUnreadReply && b.hasUnreadReply) return 1;
      return (b.lastUpdateDateTime || '').localeCompare(a.lastUpdateDateTime || '');
    }),
);

let lastCheckStr = $derived(lastCheckTime ? `Last check: ${new Date(lastCheckTime).toLocaleTimeString()}` : '');

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
    console.error('Error checking replies:', e);
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

<div class="conv-controls">
  <button class="btn btn-test" disabled={checkBtnDisabled} onclick={handleCheckNow}>
    {checkBtnText}
  </button>
  {#if lastCheckStr}
    <span class="last-check">{lastCheckStr}</span>
  {/if}
</div>

{#if relevantConversations.length === 0}
  <div class="empty-state">
    No conversations with replies yet. Start monitoring to send messages, then replies will appear here.
  </div>
{:else}
  <div class="conv-list">
    {#each relevantConversations as conv (conv.conversationId)}
      <ConversationCard
        conversation={conv}
        isExpanded={expandedConvId === conv.conversationId}
        onToggle={handleToggle}
        onBadgeDecrement={handleBadgeDecrement}
      />
    {/each}
  </div>
{/if}

<style>
  .conv-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .conv-controls .btn {
    width: auto;
    padding: 8px 16px;
    margin-top: 0;
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

  .conv-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
