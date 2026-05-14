<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';

  let {
    state,
    reason,
  }: {
    state: 'connected' | 'disconnected';
    reason?: string;
  } = $props();

  const tone = $derived(state === 'connected' ? 'success' : 'destructive');
  const label = $derived(state === 'connected' ? 'Connected' : 'Disconnected');
</script>

<div class="mb-3">
  <Badge variant={tone}>
    <span
      class="mr-1.5 inline-block size-2 rounded-full"
      class:bg-success={state === 'connected'}
      class:bg-destructive={state === 'disconnected'}
      aria-hidden="true"
    ></span>
    {label}
  </Badge>
  {#if reason}
    <p class="mt-1 text-xs text-muted-foreground m-0">{reason}</p>
  {/if}
</div>
