<script lang="ts">
import { onMount } from 'svelte';
import { UPDATE_AVAILABLE_KEY, UPDATE_DISMISSED_KEY } from '../../shared/constants';
import type { UpdateInfo } from '../../shared/types';

let updateInfo: UpdateInfo | null = $state(null);
let dismissed = $state(false);

function applyState(info: UpdateInfo | undefined, dismissedVersion: string | undefined) {
  if (info && info.version) {
    updateInfo = info;
    dismissed = dismissedVersion === info.version;
  } else {
    updateInfo = null;
  }
}

onMount(() => {
  chrome.storage.local.get([UPDATE_AVAILABLE_KEY, UPDATE_DISMISSED_KEY], (result) => {
    applyState(result[UPDATE_AVAILABLE_KEY], result[UPDATE_DISMISSED_KEY]);
  });

  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (!(UPDATE_AVAILABLE_KEY in changes) && !(UPDATE_DISMISSED_KEY in changes)) return;

    const newInfo = UPDATE_AVAILABLE_KEY in changes
      ? changes[UPDATE_AVAILABLE_KEY].newValue as UpdateInfo | undefined
      : updateInfo ?? undefined;
    const newDismissed = UPDATE_DISMISSED_KEY in changes
      ? changes[UPDATE_DISMISSED_KEY].newValue as string | undefined
      : dismissed ? updateInfo?.version : undefined;

    applyState(newInfo, newDismissed);
  };
  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
});

function dismiss() {
  if (updateInfo) {
    chrome.storage.local.set({ [UPDATE_DISMISSED_KEY]: updateInfo.version });
    dismissed = true;
  }
}

function openRelease() {
  if (!updateInfo) return;
  try {
    const parsed = new URL(updateInfo.url);
    if (parsed.protocol !== 'https:') return;
  } catch {
    return;
  }
  chrome.tabs.create({ url: updateInfo.url });
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
