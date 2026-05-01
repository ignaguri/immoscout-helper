<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  let {
    title,
    actions,
    children,
    class: className = '',
  }: {
    title: string;
    actions?: Snippet;
    children: Snippet;
    class?: string;
  } = $props();
</script>

<section class={cn('mt-4 first:mt-0', className)}>
  <header class="mb-2 flex items-baseline justify-between gap-2 pt-3 first:pt-0 border-t first:border-t-0 border-border">
    <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground m-0">
      {title}
    </h3>
    {#if actions}
      <div class="flex items-center gap-2">{@render actions()}</div>
    {/if}
  </header>
  <div>{@render children()}</div>
</section>
