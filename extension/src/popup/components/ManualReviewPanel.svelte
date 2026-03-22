<script lang="ts">
import type { ManualReviewData } from '../../shared/types';
import { dismissManualReview, refineManualMessage } from '../lib/messages';

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

<div class="review-panel">
  <div class="review-header">
    <div class="review-title">Message Ready for Review</div>
    <button class="review-dismiss" onclick={handleDismiss} title="Dismiss">×</button>
  </div>
  <div class="review-meta">
    <span class="review-landlord">{review.landlordTitle} {review.landlordName}</span>
    {#if review.aiScore}
      <span class="review-score">Score: {review.aiScore}/10</span>
    {/if}
  </div>
  {#if review.listingTitle}
    <div class="review-listing">{review.listingTitle}</div>
  {/if}
  <textarea
    class="review-message"
    readonly
    value={messageText}
    rows="4"
  ></textarea>
  <div class="review-buttons">
    <button class="review-btn focus" onclick={handleFocusTab}>Show Tab</button>
    <button
      class="review-btn refine-toggle"
      onclick={() => { showRefine = !showRefine; }}
    >{showRefine ? 'Cancel' : 'Refine'}</button>
  </div>
  {#if showRefine}
    <div class="refine-area">
      <textarea
        class="refine-textarea"
        bind:value={refineInput}
        placeholder="e.g., use Sie form, be more formal, shorter, mention my dog..."
        rows="2"
      ></textarea>
      <button
        class="review-btn refine-apply"
        disabled={refineBtnDisabled || !refineInput.trim()}
        onclick={handleRefine}
      >{refineBtnText}</button>
    </div>
  {/if}
</div>

<style>
  .review-panel {
    background: #fffbe6;
    border: 1px solid #ffe066;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 10px;
  }

  .review-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .review-title {
    font-size: 11px;
    font-weight: 700;
    color: #996600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .review-dismiss {
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #999;
    padding: 0 4px;
    line-height: 1;
  }

  .review-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 4px;
  }

  .review-landlord {
    font-size: 11px;
    font-weight: 600;
    color: #333;
  }

  .review-score {
    font-size: 10px;
    color: #666;
    background: #f0f0f0;
    padding: 1px 6px;
    border-radius: 10px;
  }

  .review-listing {
    font-size: 10px;
    color: #888;
    margin-bottom: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .review-message {
    width: 100%;
    padding: 8px;
    border: 1px solid #e0d9c0;
    border-radius: 6px;
    font-size: 11px;
    font-family: inherit;
    resize: vertical;
    background: #fff;
    color: #333;
  }

  .review-buttons {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }

  .review-btn {
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .review-btn.focus {
    background: #f0f0f0;
    color: #333;
  }

  .review-btn.refine-toggle {
    background: #83F1DC;
    color: #1a1a1a;
    flex: 1;
  }

  .review-btn:disabled { opacity: 0.6; }

  .refine-area {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .refine-textarea {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 11px;
    font-family: inherit;
    resize: vertical;
  }

  .review-btn.refine-apply {
    background: #83F1DC;
    color: #1a1a1a;
    align-self: flex-end;
    padding: 6px 16px;
  }
</style>
