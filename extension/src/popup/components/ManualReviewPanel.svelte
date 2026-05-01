<script lang="ts">
import X from '@lucide/svelte/icons/x';
import type { ManualReviewData } from '../../shared/types';
import { dismissManualReview, refineManualMessage } from '../lib/messages';
import { Button } from '$lib/components/ui/button';
import { Textarea } from '$lib/components/ui/textarea';
import { Badge } from '$lib/components/ui/badge';

let {
  review,
  onDismiss,
}: {
  review: ManualReviewData;
  onDismiss: () => void;
} = $props();

let refineInput = $state('');
let refineBtnText = $state('Apply');
let refineBtnDisabled = $state(false);
let messageText = $state('');
let showRefine = $state(false);

$effect(() => {
  messageText = review.message;
});

async function handleRefine() {
  if (!refineInput.trim()) return;
  refineBtnDisabled = true;
  refineBtnText = 'Refining...';
  try {
    const result = await refineManualMessage(refineInput.trim());
    if (result.success && result.message) {
      messageText = result.message;
      refineInput = '';
      showRefine = false;
      refineBtnText = 'Applied!';
    } else {
      refineBtnText = result.error || 'Error';
    }
  } catch (e: any) {
    refineBtnText = `Error: ${e.message}`;
  }
  setTimeout(() => {
    refineBtnDisabled = false;
    refineBtnText = 'Apply';
  }, 3000);
}

async function handleDismiss() {
  await dismissManualReview();
  onDismiss();
}

function handleFocusTab() {
  chrome.tabs.update(review.tabId, { active: true });
}
</script>

<div class="mb-2.5 rounded-lg border border-warning/40 bg-warning/10 p-2.5" role="region" aria-label="Manual review">
  <div class="mb-1.5 flex items-center justify-between">
    <h3 class="m-0 text-[11px] font-bold uppercase tracking-wider text-warning">Message Ready for Review</h3>
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Dismiss review"
      onclick={handleDismiss}
    >
      <X aria-hidden="true" />
    </Button>
  </div>

  <div class="mb-1 flex items-center gap-2">
    <span class="text-[11px] font-semibold text-foreground">{review.landlordTitle} {review.landlordName}</span>
    {#if review.aiScore}
      <Badge variant="secondary" class="text-[10px]">Score: {review.aiScore}/10</Badge>
    {/if}
  </div>

  {#if review.listingTitle}
    <div class="mb-1.5 truncate text-[10px] text-muted-foreground">{review.listingTitle}</div>
  {/if}

  <Textarea readonly value={messageText} rows={4} class="text-[11px]" />

  <div class="mt-1.5 flex gap-1.5">
    <Button variant="secondary" size="sm" onclick={handleFocusTab}>Show Tab</Button>
    <Button
      size="sm"
      class="flex-1"
      aria-expanded={showRefine}
      onclick={() => { showRefine = !showRefine; }}
    >
      {showRefine ? 'Cancel' : 'Refine'}
    </Button>
  </div>

  {#if showRefine}
    <div class="mt-1.5 flex flex-col gap-1.5">
      <Textarea
        bind:value={refineInput}
        placeholder="e.g., use Sie form, be more formal, shorter, mention my dog..."
        rows={2}
        class="text-[11px]"
      />
      <Button
        size="sm"
        class="self-end"
        loading={refineBtnDisabled}
        disabled={refineBtnDisabled || !refineInput.trim()}
        onclick={handleRefine}
      >
        {refineBtnText}
      </Button>
    </div>
  {/if}
</div>
