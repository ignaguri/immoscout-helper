<script lang="ts">
import type { Snippet } from 'svelte';
import { Label } from '$lib/components/ui/label';

let {
  id,
  label,
  required = false,
  error = null,
  children,
  class: className = '',
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | null;
  children: Snippet;
  class?: string;
} = $props();
</script>

<div class="space-y-1.5 {className}">
  <Label for={id}>
    {label}
    {#if required}<span class="text-destructive ml-0.5" aria-hidden="true">*</span><span class="sr-only">required</span>{/if}
  </Label>
  {@render children()}
  {#if error}
    <p id="{id}-error" class="text-destructive text-xs m-0" role="alert">{error}</p>
  {/if}
</div>
