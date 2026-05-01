<script lang="ts">
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_LABELS,
  NOTIFICATION_PREFS_KEY,
  type NotificationEvent,
} from '../../../shared/constants';

let notifPrefs: Record<NotificationEvent, boolean> = $state({ ...DEFAULT_NOTIFICATION_PREFS });
let notifPrefsLoaded = $state(false);

async function loadNotifPrefs() {
  const stored = await chrome.storage.local.get([NOTIFICATION_PREFS_KEY]);
  if (stored[NOTIFICATION_PREFS_KEY]) {
    notifPrefs = { ...DEFAULT_NOTIFICATION_PREFS, ...stored[NOTIFICATION_PREFS_KEY] };
  }
  notifPrefsLoaded = true;
}

async function saveNotifPrefs() {
  await chrome.storage.local.set({ [NOTIFICATION_PREFS_KEY]: { ...notifPrefs } });
}

function handleNotifToggle(event: NotificationEvent) {
  notifPrefs[event] = !notifPrefs[event];
  saveNotifPrefs();
}

loadNotifPrefs();
</script>

<div class="flex flex-col gap-1.5">
  {#each Object.entries(NOTIFICATION_LABELS) as [event, label]}
    <label class="flex cursor-pointer items-center gap-2 text-xs text-foreground">
      <input
        type="checkbox"
        class="size-4 cursor-pointer accent-primary"
        checked={notifPrefs[event as NotificationEvent]}
        onchange={() => handleNotifToggle(event as NotificationEvent)}
        disabled={!notifPrefsLoaded}
      />
      <span>{label}</span>
    </label>
  {/each}
</div>
