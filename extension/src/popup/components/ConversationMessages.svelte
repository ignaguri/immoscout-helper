<script lang="ts">
import type { ConversationMessage } from '../../shared/types';

let {
  messages,
}: {
  messages: ConversationMessage[];
} = $props();
</script>

{#if messages.length > 0}
  <div class="mb-2.5 max-h-48 overflow-y-auto">
    {#each messages as msg}
      <div
        class={`mb-1.5 max-w-[85%] rounded-lg px-2.5 py-2 text-[11px] leading-snug break-words ${
          msg.role === 'user'
            ? 'ml-auto rounded-br-sm bg-primary/15 text-right'
            : 'mr-auto rounded-bl-sm bg-muted'
        }`}
      >
        {msg.text}
        {#if msg.timestamp}
          <div class="mt-0.5 text-[9px] text-muted-foreground/70">
            {new Date(msg.timestamp).toLocaleString('de-DE')}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
