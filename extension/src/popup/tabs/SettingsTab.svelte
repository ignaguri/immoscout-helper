<script lang="ts">
import { PROVIDERS } from '../../shared/ai-router';
import {
  DEFAULT_NOTIFICATION_PREFS,
  LITELLM_DEFAULT_MODEL,
  NOTIFICATION_LABELS,
  NOTIFICATION_PREFS_KEY,
  type NotificationEvent,
} from '../../shared/constants';
import {
  DEFAULT_MESSAGE_TEMPLATE,
  DEFAULT_SCORING_TEMPLATE,
  MESSAGE_PLACEHOLDERS,
  type PlaceholderInfo,
  SCORING_PLACEHOLDERS,
  validateTemplate,
} from '../../shared/prompts';
import { checkAiHealth } from '../lib/ai-health';
import { clearSeenListings } from '../lib/messages';
import type { PopupSettings } from '../lib/storage';
import { resetAiUsage, saveAllSettings } from '../lib/storage';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Textarea } from '$lib/components/ui/textarea';
import { Label } from '$lib/components/ui/label';
import * as Select from '$lib/components/ui/select';
import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
import * as Alert from '$lib/components/ui/alert';
import StatusPill from '$lib/components/StatusPill.svelte';
import Section from '$lib/components/Section.svelte';

let {
  settings = $bindable(),
  settingsLoaded = false,
  stats,
  aiServerConnected = $bindable(),
  aiStatsScored = $bindable(),
  aiStatsSkipped = $bindable(),
  aiPromptTokens = $bindable(),
  aiCompletionTokens = $bindable(),
  onNavigate = (_tab: string) => {},
}: {
  settings: PopupSettings;
  settingsLoaded: boolean;
  stats: { sentHour: number; sentTotal: number; seenCount: number; syncedCount: number };
  aiServerConnected: boolean;
  aiStatsScored: number;
  aiStatsSkipped: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
  onNavigate?: (tab: string) => void;
} = $props();

let showApiKey = $state(false);
let copySetupText = $state('Copy command');
let fileInput: HTMLInputElement | undefined = $state();

let notifPrefs: Record<NotificationEvent, boolean> = $state({ ...DEFAULT_NOTIFICATION_PREFS });
let notifPrefsLoaded = $state(false);

let stylePromptOpen = $state(true);
let advancedPromptsOpen = $state(false);
let notificationsOpen = $state(false);

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

let activeProvider = $derived(PROVIDERS[settings.aiProvider] ?? PROVIDERS.gemini);
let isLitellm = $derived(settings.aiProvider === 'litellm');
let currentApiKey = $derived(settings.aiProvider === 'gemini' ? settings.aiApiKeyGemini : settings.aiApiKeyOpenai);
function setApiKey(val: string) {
  if (settings.aiProvider === 'gemini') settings.aiApiKeyGemini = val;
  else settings.aiApiKeyOpenai = val;
}

let showClientSecret = $state(false);
let litellmModels: string[] = $state([]);
let litellmModelsLoading = $state(false);

async function fetchLitellmModels() {
  const serverUrl = settings.aiServerUrl || 'http://localhost:3456';
  if (
    !settings.aiLitellmTokenUrl ||
    !settings.aiLitellmBaseUrl ||
    !settings.aiLitellmClientId ||
    !settings.aiLitellmClientSecret
  ) {
    return;
  }
  litellmModelsLoading = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${serverUrl}/litellm/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        litellmTokenUrl: settings.aiLitellmTokenUrl,
        litellmBaseUrl: settings.aiLitellmBaseUrl,
        litellmClientId: settings.aiLitellmClientId,
        litellmClientSecret: settings.aiLitellmClientSecret,
      }),
      signal: controller.signal,
    });
    if (response.ok) {
      const data = await response.json();
      litellmModels = data.models || [];
      if (litellmModels.length > 0 && !litellmModels.includes(settings.aiLitellmModel)) {
        settings.aiLitellmModel = litellmModels[0];
        autoSaveImmediate();
      }
    }
  } catch {
    /* server unreachable or timeout */
  } finally {
    clearTimeout(timeout);
    litellmModelsLoading = false;
  }
}

let scoringUnknown = $derived(validateTemplate(settings.aiCustomScoringPrompt || '', SCORING_PLACEHOLDERS).unknown);
let messageUnknown = $derived(validateTemplate(settings.aiCustomMessagePrompt || '', MESSAGE_PLACEHOLDERS).unknown);

let aiDisconnectReason = $derived.by(() => {
  if (settings.aiMode !== 'direct') return 'Server unreachable — check the URL or start the local server.';
  return currentApiKey ? 'Invalid API key or provider unreachable.' : 'Paste your API key to get started.';
});

let aiModeHint = $derived.by(() => {
  if (isLitellm) return 'LiteLLM requires server mode (OIDC token exchange)';
  return settings.aiMode === 'direct'
    ? 'Calls the AI provider directly — no server needed'
    : 'Uses local Express server for AI calls';
});

type CustomPromptField = 'aiCustomScoringPrompt' | 'aiCustomMessagePrompt';
function setCustomPrompt(field: CustomPromptField, value: string) {
  settings[field] = value;
  autoSaveImmediate();
}

let activePlaceholder = $state<PlaceholderInfo | null>(null);
function togglePlaceholder(ph: PlaceholderInfo) {
  activePlaceholder = activePlaceholder?.name === ph.name ? null : ph;
}

let aiCost = $derived(
  isLitellm
    ? 'Managed by proxy'
    : `$${((aiPromptTokens * activeProvider.pricing.input) / 1_000_000 + (aiCompletionTokens * activeProvider.pricing.output) / 1_000_000).toFixed(4)}`,
);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
$effect(() => () => clearTimeout(saveTimer));

function autoSave() {
  if (!settingsLoaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveAllSettings(settings).catch(() => {});
  }, 400);
}

async function autoSaveImmediate() {
  if (!settingsLoaded) return;
  clearTimeout(saveTimer);
  await saveAllSettings(settings);
}

async function handleCheckIntervalChange() {
  await autoSaveImmediate();
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

async function checkHealth() {
  aiServerConnected = await checkAiHealth(settings);
}

async function handleAiModeChange() {
  await autoSaveImmediate();
  checkHealth();
}

async function handleProviderChange() {
  if (settings.aiProvider === 'litellm' && settings.aiMode !== 'server') {
    settings.aiMode = 'server';
  }
  await autoSaveImmediate();
  if ((settings.aiMode === 'direct' && currentApiKey) || settings.aiMode === 'server') {
    checkHealth();
  } else {
    aiServerConnected = false;
  }
}

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

async function handleResetUsage() {
  if (!confirm('Reset AI token usage stats to zero?')) return;
  await resetAiUsage();
  aiPromptTokens = 0;
  aiCompletionTokens = 0;
}

function handleCopySetup() {
  navigator.clipboard.writeText('cd server && npm install && npm start').then(() => {
    copySetupText = 'Copied!';
    setTimeout(() => {
      copySetupText = 'Copy command';
    }, 1500);
  });
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

const aiModeOptions = [
  { value: 'direct', label: 'Direct (API key)' },
  { value: 'server', label: 'Server (local)' },
];
const providerOptions = Object.values(PROVIDERS).map((p) => ({ value: p.id, label: p.label }));
</script>

<Section title="Monitoring">
  <div class="grid grid-cols-2 gap-3">
    <div class="space-y-1.5">
      <Label for="checkInterval">Check Interval (s)</Label>
      <Input
        type="number"
        id="checkInterval"
        bind:value={settings.checkInterval}
        onchange={handleCheckIntervalChange}
        onblur={autoSaveImmediate}
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
        oninput={autoSave}
        onblur={autoSaveImmediate}
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
        oninput={autoSave}
        onblur={autoSaveImmediate}
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
        oninput={autoSave}
        onblur={autoSaveImmediate}
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
      onchange={autoSaveImmediate}
    />
    ImmoScout24 Premium account
  </label>
  <p class="mt-1 text-xs text-muted-foreground m-0">
    Premium users can message "coming soon" listings — enable to skip the automatic deferral
  </p>
</Section>

<Section title="AI Configuration">
  <StatusPill
    state={aiServerConnected ? 'connected' : 'disconnected'}
    reason={!aiServerConnected ? aiDisconnectReason : undefined}
  />

  {#if !aiServerConnected && settings.aiMode === 'server'}
    <Alert.Root class="mb-3 border-info/40 bg-info/10">
      <Alert.Title>Setup Instructions</Alert.Title>
      <Alert.Description>
        The AI server needs to be running locally.
        <code class="block my-1.5 rounded bg-muted px-2 py-1.5 font-mono text-[11px] break-all">cd server && npm install && npm start</code>
        <Button variant="link" size="xs" class="h-auto p-0 underline" onclick={handleCopySetup}>
          {copySetupText}
        </Button>
      </Alert.Description>
    </Alert.Root>
  {/if}

  <div class="space-y-1.5 mb-3">
    <Label for="aiMode">AI Mode</Label>
    <Select.Root type="single" bind:value={settings.aiMode} onValueChange={handleAiModeChange} disabled={isLitellm}>
      <Select.Trigger id="aiMode" class="w-full">
        {aiModeOptions.find((o) => o.value === settings.aiMode)?.label ?? 'Direct (API key)'}
      </Select.Trigger>
      <Select.Content>
        {#each aiModeOptions as opt}
          <Select.Item value={opt.value}>{opt.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    <p class="text-xs text-muted-foreground m-0">{aiModeHint}</p>
  </div>

  <div class="space-y-1.5 mb-3">
    <Label for="aiProvider">AI Provider</Label>
    <Select.Root type="single" bind:value={settings.aiProvider} onValueChange={handleProviderChange}>
      <Select.Trigger id="aiProvider" class="w-full">
        {providerOptions.find((o) => o.value === settings.aiProvider)?.label ?? 'Gemini'}
      </Select.Trigger>
      <Select.Content>
        {#each providerOptions as opt}
          <Select.Item value={opt.value}>{opt.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  {#if isLitellm}
    <div class="space-y-1.5 mb-3">
      <Label for="litellmModel">Model</Label>
      <div class="flex items-stretch gap-1.5">
        <Select.Root type="single" bind:value={settings.aiLitellmModel} onValueChange={autoSaveImmediate}>
          <Select.Trigger id="litellmModel" class="flex-[2] min-w-0">
            {settings.aiLitellmModel || LITELLM_DEFAULT_MODEL}
          </Select.Trigger>
          <Select.Content>
            {#if litellmModels.length > 0}
              {#each litellmModels as m}
                <Select.Item value={m}>{m}</Select.Item>
              {/each}
            {:else}
              <Select.Item value={settings.aiLitellmModel || LITELLM_DEFAULT_MODEL}>
                {settings.aiLitellmModel || LITELLM_DEFAULT_MODEL}
              </Select.Item>
            {/if}
          </Select.Content>
        </Select.Root>
        <Button variant="secondary" size="sm" loading={litellmModelsLoading} disabled={litellmModelsLoading} onclick={fetchLitellmModels}>
          {litellmModelsLoading ? 'Loading…' : 'Fetch Models'}
        </Button>
      </div>
    </div>

    <div class="space-y-1.5 mb-3">
      <Label for="litellmTokenUrl">OIDC Token URL</Label>
      <Input
        type="url"
        id="litellmTokenUrl"
        bind:value={settings.aiLitellmTokenUrl}
        oninput={autoSave}
        onblur={autoSaveImmediate}
        placeholder="https://auth.example.com/realms/.../token"
      />
      <p class="text-xs text-muted-foreground m-0">OAuth2 client_credentials token endpoint</p>
    </div>

    <div class="space-y-1.5 mb-3">
      <Label for="litellmBaseUrl">LiteLLM Base URL</Label>
      <Input
        type="url"
        id="litellmBaseUrl"
        bind:value={settings.aiLitellmBaseUrl}
        oninput={autoSave}
        onblur={autoSaveImmediate}
        placeholder="https://litellm.example.com/v1"
      />
      <p class="text-xs text-muted-foreground m-0">OpenAI-compatible API base URL</p>
    </div>

    <div class="space-y-1.5 mb-3">
      <Label for="litellmClientId">Client ID</Label>
      <Input
        type="text"
        id="litellmClientId"
        bind:value={settings.aiLitellmClientId}
        oninput={autoSave}
        onblur={autoSaveImmediate}
        placeholder="your-client-id"
      />
    </div>

    <div class="space-y-1.5 mb-3">
      <Label for="litellmClientSecret">Client Secret</Label>
      <div class="relative">
        <Input
          type={showClientSecret ? 'text' : 'password'}
          id="litellmClientSecret"
          bind:value={settings.aiLitellmClientSecret}
          oninput={autoSave}
          onblur={autoSaveImmediate}
          placeholder="your-client-secret"
          class="pr-14"
        />
        <Button
          variant="ghost"
          size="xs"
          class="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
          onclick={() => showClientSecret = !showClientSecret}
        >
          {showClientSecret ? 'hide' : 'show'}
        </Button>
      </div>
    </div>
  {:else}
    <div class="space-y-1.5 mb-3">
      <Label for="aiApiKey">{settings.aiMode === 'direct' ? `${activeProvider.label} API Key` : 'API Key (optional)'}</Label>
      <div class="relative">
        <Input
          type={showApiKey ? 'text' : 'password'}
          id="aiApiKey"
          value={currentApiKey}
          oninput={(e) => { setApiKey((e.target as HTMLInputElement).value); autoSave(); }}
          onblur={() => { autoSaveImmediate(); checkHealth(); }}
          placeholder={settings.aiMode === 'direct' ? `Paste your ${activeProvider.label} API key` : 'Optional — passed to server'}
          class="pr-14"
        />
        <Button
          variant="ghost"
          size="xs"
          class="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
          onclick={() => showApiKey = !showApiKey}
        >
          {showApiKey ? 'hide' : 'show'}
        </Button>
      </div>
      {#if settings.aiMode === 'direct'}
        <Button variant="link" size="xs" class="h-auto p-0 text-primary underline" onclick={() => onNavigate('help')}>
          How do I get an API key?
        </Button>
      {/if}
    </div>
  {/if}

  {#if settings.aiMode === 'server'}
    <div class="space-y-1.5 mb-3">
      <Label for="aiServerUrl">Server URL</Label>
      <Input
        type="url"
        id="aiServerUrl"
        bind:value={settings.aiServerUrl}
        oninput={autoSave}
        onblur={() => { autoSaveImmediate(); checkHealth(); }}
        placeholder="http://localhost:3456"
      />
    </div>
  {/if}

  <CollapsibleSection title="Message Style Guide" bind:open={stylePromptOpen}>
    <div class="space-y-3">
      <div class="space-y-1.5">
        <Label for="aiAboutMe">About Me (for AI context)</Label>
        <Textarea
          id="aiAboutMe"
          bind:value={settings.aiAboutMe}
          oninput={autoSave}
          onblur={autoSaveImmediate}
          placeholder="Tell the AI about yourself…"
          class="min-h-15"
        />
      </div>

      <div class="space-y-1.5">
        <Label for="messageTemplate">Message Template</Label>
        <Textarea
          id="messageTemplate"
          bind:value={settings.messageTemplate}
          oninput={autoSave}
          onblur={autoSaveImmediate}
          placeholder={`Sehr geehrte(r) {name},\n\nich interessiere mich…`}
          class="min-h-20"
        />
        <p class="text-xs text-muted-foreground m-0">
          Write a sample message to guide the AI's tone. Use {'{name}'} for landlord greeting.
        </p>
      </div>
    </div>
  </CollapsibleSection>

  <CollapsibleSection title="AI Prompts (advanced)" bind:open={advancedPromptsOpen}>
    <div class="space-y-3">
      <Alert.Root class="border-warning/40 bg-warning/15 text-warning border-l-[3px]">
        <Alert.Description class="text-warning">
          ⚠ Editing these can break AI behavior. Leave empty to use the built-in default. Use
          <code class="rounded bg-black/5 px-1 py-0.5">{'{{variableName}}'}</code> placeholders from the legend below — values are interpolated at runtime.
        </Alert.Description>
      </Alert.Root>

      {#each [
        { id: 'customScoringPrompt', label: 'Scoring system prompt', hint: 'System prompt the AI sees when scoring a listing 1–10.', field: 'aiCustomScoringPrompt' as CustomPromptField, placeholders: SCORING_PLACEHOLDERS, defaultTpl: DEFAULT_SCORING_TEMPLATE, unknown: scoringUnknown },
        { id: 'customMessagePrompt', label: 'Message system prompt', hint: 'System prompt the AI sees when composing the outreach message.', field: 'aiCustomMessagePrompt' as CustomPromptField, placeholders: MESSAGE_PLACEHOLDERS, defaultTpl: DEFAULT_MESSAGE_TEMPLATE, unknown: messageUnknown },
      ] as group}
        <div class="space-y-1.5">
          <Label for={group.id}>{group.label}</Label>
          <p class="text-xs text-muted-foreground m-0">{group.hint}</p>
          <Textarea
            id={group.id}
            bind:value={settings[group.field]}
            oninput={autoSave}
            onblur={autoSaveImmediate}
            placeholder="(empty = use default — click Load default to edit)"
            class="min-h-40 font-mono text-[11px]"
          />
          <div class="flex gap-1.5">
            <Button variant="secondary" size="xs" onclick={() => setCustomPrompt(group.field, group.defaultTpl)}>
              Load default
            </Button>
            <Button variant="secondary" size="xs" disabled={!settings[group.field]} onclick={() => setCustomPrompt(group.field, '')}>
              Reset
            </Button>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            <span class="mr-1 font-semibold text-foreground/80">Available variables:</span>
            {#each group.placeholders as ph}
              <button
                type="button"
                class={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${activePlaceholder?.name === ph.name ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted'}`}
                title={ph.description}
                onclick={() => togglePlaceholder(ph)}
              >
                {`{{${ph.name}}}`}
              </button>
            {/each}
          </div>
          <p class="text-[10px] text-muted-foreground m-0">These tokens get replaced at runtime. Click any to see what it stands for.</p>
          {#if activePlaceholder && group.placeholders.some((p) => p.name === activePlaceholder?.name)}
            <div class="mt-1.5 rounded border border-border bg-muted/40 px-2 py-1.5 text-[11px]">
              <div><code class="rounded bg-black/5 px-1 py-0.5 text-[10px]">{`{{${activePlaceholder.name}}}`}</code> — {activePlaceholder.description}</div>
              <div class="mt-1 text-[10px] italic text-muted-foreground">Source: {activePlaceholder.source}</div>
            </div>
          {/if}
          {#if group.unknown.length}
            <Alert.Root class="border-destructive/40 bg-destructive/10 text-destructive border-l-[3px]">
              <Alert.Description class="text-destructive">
                Unknown variables: {group.unknown.map((n: string) => `{{${n}}}`).join(', ')} — these will appear literally in the prompt sent to the AI.
              </Alert.Description>
            </Alert.Root>
          {/if}
        </div>
      {/each}
    </div>
  </CollapsibleSection>
</Section>

<Section title="AI Usage">
  <div class="mb-2 flex gap-4">
    <div class="flex flex-col items-center">
      <span class="text-[10px] uppercase text-muted-foreground">Scored</span>
      <span class="text-lg font-semibold text-foreground">{aiStatsScored}</span>
    </div>
    <div class="flex flex-col items-center">
      <span class="text-[10px] uppercase text-muted-foreground">Skipped</span>
      <span class="text-lg font-semibold text-foreground">{aiStatsSkipped}</span>
    </div>
  </div>
  <div class="mb-2 text-[11px] leading-relaxed text-foreground/70">
    <div>Prompt tokens: <strong>{aiPromptTokens.toLocaleString()}</strong></div>
    <div>Completion tokens: <strong>{aiCompletionTokens.toLocaleString()}</strong></div>
    <div>Estimated cost: <strong>{aiCost}</strong></div>
  </div>
  <Button variant="secondary" size="xs" onclick={handleResetUsage}>Reset Usage Stats</Button>
</Section>

<CollapsibleSection title="Notifications" bind:open={notificationsOpen}>
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
</CollapsibleSection>

<Section title="Data">
  <Button variant="ghost" class="text-destructive hover:bg-destructive/10" onclick={handleClearSeen}>
    Clear Seen Listings ({stats.seenCount})
  </Button>
</Section>

<Section title="Backup & Restore">
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
</Section>
