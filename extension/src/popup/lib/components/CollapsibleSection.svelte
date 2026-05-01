<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import * as Collapsible from '$lib/components/ui/collapsible';

  let {
    title,
    open = $bindable(false),
    actions,
    children,
  }: {
    title: string;
    open?: boolean;
    actions?: Snippet;
    children: Snippet;
  } = $props();
</script>

<Collapsible.Root bind:open class="mt-4 border-t border-border pt-3">
  <div class="flex items-center justify-between gap-2">
    <Collapsible.Trigger class="group flex flex-1 items-center justify-between gap-2 px-2 py-1.5 -mx-2 text-left rounded-sm hover:bg-muted/50 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      <ChevronRight class={`text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
    </Collapsible.Trigger>
    {#if actions}
      <div class="flex items-center gap-2">{@render actions()}</div>
    {/if}
  </div>
  <Collapsible.Content class="pt-2">
    {@render children()}
  </Collapsible.Content>
</Collapsible.Root>
