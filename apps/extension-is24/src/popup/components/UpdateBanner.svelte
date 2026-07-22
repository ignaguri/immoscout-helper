<script lang="ts">
import X from '@lucide/svelte/icons/x';
import type { UpdateInfo } from '@repo/shared';
import { onMount } from 'svelte';
import { Button } from '$lib/components/ui/button';
import { UPDATE_AVAILABLE_KEY, UPDATE_DISMISSED_KEY } from '../../shared/constants';

let updateInfo: UpdateInfo | null = $state(null);
let dismissed = $state(false);

function applyState(info: UpdateInfo | undefined, dismissedVersion: string | undefined) {
  if (info?.version) {
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

    const newInfo =
      UPDATE_AVAILABLE_KEY in changes
        ? (changes[UPDATE_AVAILABLE_KEY].newValue as UpdateInfo | undefined)
        : (updateInfo ?? undefined);
    const newDismissed =
      UPDATE_DISMISSED_KEY in changes
        ? (changes[UPDATE_DISMISSED_KEY].newValue as string | undefined)
        : dismissed
          ? updateInfo?.version
          : undefined;

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
  <div
    class="flex items-center justify-between gap-2 border-b border-warning/40 bg-warning/15 px-4 py-2 text-xs text-warning"
    role="status"
  >
    <span class="flex flex-wrap items-center gap-1.5">
      v{updateInfo.version} available!
      <Button
        variant="link"
        size="xs"
        class="h-auto p-0 font-semibold underline"
        onclick={openRelease}
      >
        Download update
      </Button>
    </span>
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Dismiss update notification"
      onclick={dismiss}
    >
      <X aria-hidden="true" />
    </Button>
  </div>
{/if}
