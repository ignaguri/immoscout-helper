<script lang="ts">
import { Button } from '$lib/components/ui/button';
import { clearSeenListings } from '../../lib/messages';

let {
  stats,
}: {
  stats: { sentHour: number; sentTotal: number; seenCount: number; syncedCount: number };
} = $props();

let fileInput: HTMLInputElement | undefined = $state();

async function handleClearSeen() {
  if (
    !confirm(
      'Are you sure you want to clear all seen listings?\n\nThis will cause all current listings to be treated as new on the next scan.',
    )
  ) {
    return;
  }
  try {
    const response = await clearSeenListings();
    if (response?.success) {
      alert('Seen listings cleared successfully.');
    } else {
      alert(`Error: ${response?.error || 'Unknown error'}`);
    }
  } catch (error: any) {
    alert(`Error: ${error.message}`);
  }
}

const EXCLUDED_KEYS = new Set([
  'conversations',
  'convLastCheck',
  'convUnreadCount',
  'rateLastMessageTime',
  'rateMessageCount',
  'rateCountResetTime',
  'lastCheckTime',
]);

async function handleExport() {
  try {
    const data = await chrome.storage.local.get(null);
    for (const key of EXCLUDED_KEYS) {
      delete data[key];
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `immoscout-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e: any) {
    alert(`Export failed: ${e.message}`);
  }
}

const ALLOWED_IMPORT_KEYS = new Set([
  'searchUrl', 'searchUrls', 'messageTemplate', 'checkInterval', 'rateLimit', 'minDelay', 'isMonitoring', 'autoSendMode',
  'formAdults', 'formChildren', 'formPets', 'formSmoker', 'formIncome', 'formHouseholdSize', 'formEmployment',
  'formIncomeRange', 'formDocuments', 'formSalutation', 'formPhone',
  'aiMode', 'aiProvider', 'aiEnabled', 'aiApiKeyGemini', 'aiApiKeyOpenai',
  'aiLitellmClientId', 'aiLitellmClientSecret', 'aiLitellmTokenUrl', 'aiLitellmBaseUrl', 'aiLitellmModel',
  'aiServerUrl', 'aiMinScore', 'aiAboutMe', 'aiCustomScoringPrompt', 'aiCustomMessagePrompt',
  'aiListingsScored', 'aiListingsSkipped', 'aiUsagePromptTokens', 'aiUsageCompletionTokens',
  'profileName', 'profileAge', 'profileOccupation', 'profileLanguages', 'profileMovingReason',
  'profileCurrentNeighborhood', 'profileIdealApartment', 'profileDealbreakers', 'profileStrengths',
  'profileMaxWarmmiete', 'profileBirthDate', 'profileMaritalStatus', 'profileCurrentAddress', 'profileEmail',
  'profileEmployer', 'profileEmployedSince', 'profileNetIncome', 'profileCurrentLandlord',
  'profileLandlordPhone', 'profileLandlordEmail',
  'seenListings', 'manualQueue', 'blacklistedListings', 'contactedLandlords', 'activityLog',
  'convCheckInterval', 'syncedContactedCount', 'totalMessagesSent', 'notificationPrefs',
]);

async function handleImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Invalid backup format');
    if (!confirm('This will merge the backup into your current data. Existing values will be overwritten. Continue?'))
      return;
    const filtered: Record<string, unknown> = {};
    let skipped = 0;
    for (const [key, value] of Object.entries(data)) {
      if (ALLOWED_IMPORT_KEYS.has(key)) {
        filtered[key] = value;
      } else {
        skipped++;
      }
    }
    if (Object.keys(filtered).length === 0) throw new Error('No recognized keys found in backup');
    await chrome.storage.local.set(filtered);
    const msg =
      skipped > 0
        ? `Backup restored (${skipped} unrecognized key${skipped > 1 ? 's' : ''} skipped). Reload the extension to apply all changes.`
        : 'Backup restored. Reload the extension to apply all changes.';
    alert(msg);
  } catch (err: any) {
    alert(`Import failed: ${err.message}`);
  } finally {
    input.value = '';
  }
}
</script>

<div class="space-y-3">
  <div>
    <h4 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Seen Listings</h4>
    <Button variant="ghost" class="text-destructive hover:bg-destructive/10" onclick={handleClearSeen}>
      Clear Seen Listings ({stats.seenCount})
    </Button>
  </div>

  <div class="pt-3 border-t border-border">
    <h4 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Backup &amp; Restore</h4>
    <div class="mb-2 flex gap-2">
      <Button class="flex-1" onclick={handleExport}>Export All Data</Button>
      <Button class="flex-1" onclick={() => fileInput?.click()}>Import Data</Button>
      <input
        type="file"
        accept=".json"
        bind:this={fileInput}
        onchange={handleImport}
        class="hidden"
      />
    </div>
    <p class="text-xs text-muted-foreground m-0">
      Export downloads a JSON backup of all settings, profile, and seen listings. Import merges the backup into current storage.
    </p>
  </div>
</div>
