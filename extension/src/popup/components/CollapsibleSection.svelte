<script lang="ts">
import type { Snippet } from 'svelte';

let {
  title,
  open = false,
  children,
}: {
  title: string;
  open?: boolean;
  children: Snippet;
} = $props();

let isOpen = $state(false);

// Sync from prop on mount
$effect(() => {
  isOpen = open;
});

function toggle() {
  isOpen = !isOpen;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggle();
  }
}
</script>

<div class="collapsible-section">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="collapsible-header"
    class:open={isOpen}
    onclick={toggle}
    onkeydown={handleKeydown}
    role="button"
    tabindex="0"
  >
    <span class="section-title" style="margin:0; padding:0; border:none;">{title}</span>
    <span class="chevron">{isOpen ? '\u25BE' : '\u25B8'}</span>
  </div>
  {#if isOpen}
    <div class="collapsible-body open">
      {@render children()}
    </div>
  {/if}
</div>
