<script lang="ts">
import { onMount } from 'svelte';
import { UPDATE_AVAILABLE_KEY, UPDATE_DISMISSED_KEY } from '../../shared/constants';

interface UpdateInfo {
  version: string;
  url: string;
  checkedAt: number;
}

let updateInfo: UpdateInfo | null = $state(null);
let dismissed = $state(false);

onMount(() => {
  chrome.storage.local.get([UPDATE_AVAILABLE_KEY, UPDATE_DISMISSED_KEY], (result) => {
    const info = result[UPDATE_AVAILABLE_KEY] as UpdateInfo | undefined;
    const dismissedVersion = result[UPDATE_DISMISSED_KEY] as string | undefined;
    if (info && info.version) {
      if (dismissedVersion === info.version) {
        dismissed = true;
      }
      updateInfo = info;
    }
  });
});

function dismiss() {
  if (updateInfo) {
    chrome.storage.local.set({ [UPDATE_DISMISSED_KEY]: updateInfo.version });
    dismissed = true;
  }
}

function openRelease() {
  if (updateInfo) {
    window.open(updateInfo.url, '_blank');
  }
}
</script>

{#if updateInfo && !dismissed}
  <div class="update-banner">
    <span class="update-text">
      v{updateInfo.version} available!
      <button class="update-link" onclick={openRelease}>Download update</button>
    </span>
    <button class="update-dismiss" onclick={dismiss} title="Dismiss">&times;</button>
  </div>
{/if}

<style>
  .update-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: #fef3c7;
    border-bottom: 1px solid #f59e0b;
    font-size: 12px;
    color: #92400e;
  }

  .update-text {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .update-link {
    background: none;
    border: none;
    color: #d97706;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    width: auto;
  }

  .update-link:hover {
    color: #92400e;
  }

  .update-dismiss {
    background: none;
    border: none;
    font-size: 16px;
    color: #92400e;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    opacity: 0.6;
    width: auto;
  }

  .update-dismiss:hover {
    opacity: 1;
  }
</style>
