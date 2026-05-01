<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Component } from 'svelte';

  let {
    icon: Icon,
    title,
    sub,
    action,
  }: {
    icon?: Component;
    title: string;
    sub?: string;
    action?: Snippet;
  } = $props();
</script>

<div class="rounded-md border border-dashed border-border bg-muted/40 px-4 py-5 text-center">
  {#if Icon}
    <div class="mb-2 flex justify-center text-muted-foreground">
      <Icon aria-hidden="true" />
    </div>
  {/if}
  <p class="text-sm font-medium text-muted-foreground m-0">{title}</p>
  {#if sub}
    <p class="text-xs text-muted-foreground/80 mt-1 m-0">{sub}</p>
  {/if}
  {#if action}
    <div class="mt-3 flex justify-center">{@render action()}</div>
  {/if}
</div>
