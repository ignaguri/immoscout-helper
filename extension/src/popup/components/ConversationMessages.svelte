<script lang="ts">
import type { ConversationMessage } from '../../shared/types';

let {
  messages,
}: {
  messages: ConversationMessage[];
} = $props();
</script>

{#if messages.length > 0}
  <div class="conv-thread">
    {#each messages as msg}
      <div class="bubble" class:user-bubble={msg.role === 'user'} class:landlord-bubble={msg.role !== 'user'}>
        {msg.text}
        {#if msg.timestamp}
          <div class="bubble-time">{new Date(msg.timestamp).toLocaleString('de-DE')}</div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
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
</style>
