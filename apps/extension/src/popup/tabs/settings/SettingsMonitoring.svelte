<script lang="ts">
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import type { PopupSettings } from '../../lib/storage';
import { getSettingsContext } from './settings-context';

let {
  settings = $bindable(),
}: {
  settings: PopupSettings;
} = $props();

const ctx = getSettingsContext();

async function handleCheckIntervalChange() {
  await ctx.autoSaveImmediate();
  try {
    const status = await chrome.runtime.sendMessage({ action: 'getStatus' });
    if (status.isMonitoring) {
      await chrome.runtime.sendMessage({
        action: 'updateInterval',
        interval: settings.checkInterval || 60,
      });
    }
  } catch {
    /* ignore */
  }
}
</script>

<div class="grid grid-cols-2 gap-3">
  <div class="space-y-1.5">
    <Label for="checkInterval">Check Interval (s)</Label>
    <Input
      type="number"
      id="checkInterval"
      bind:value={settings.checkInterval}
      onchange={handleCheckIntervalChange}
      onblur={ctx.autoSaveImmediate}
      min={60}
      max={3600}
    />
  </div>
  <div class="space-y-1.5">
    <Label for="rateLimit">Rate Limit (per hour)</Label>
    <Input
      type="number"
      id="rateLimit"
      bind:value={settings.rateLimit}
      oninput={ctx.autoSave}
      onblur={ctx.autoSaveImmediate}
      min={1}
      max={50}
    />
  </div>
</div>

<div class="mt-3 grid grid-cols-2 gap-3">
  <div class="space-y-1.5">
    <Label for="minDelay">Min Delay (s)</Label>
    <Input
      type="number"
      id="minDelay"
      bind:value={settings.minDelay}
      oninput={ctx.autoSave}
      onblur={ctx.autoSaveImmediate}
      min={10}
      max={300}
    />
  </div>
  <div class="space-y-1.5">
    <Label for="aiMinScore">Min Score (1-10)</Label>
    <Input
      type="number"
      id="aiMinScore"
      bind:value={settings.aiMinScore}
      oninput={ctx.autoSave}
      onblur={ctx.autoSaveImmediate}
      min={1}
      max={10}
    />
    <p class="text-xs text-muted-foreground m-0">Listings scoring below this will be skipped</p>
  </div>
</div>

<label class="mt-3 flex cursor-pointer items-center gap-2 text-xs text-foreground">
  <input
    type="checkbox"
    class="size-4 cursor-pointer accent-primary"
    bind:checked={settings.premiumAccount}
    onchange={ctx.autoSaveImmediate}
  />
  ImmoScout24 Premium account
</label>
<p class="mt-1 text-xs text-muted-foreground m-0">
  Premium users can message "coming soon" listings — enable to skip the automatic deferral
</p>
