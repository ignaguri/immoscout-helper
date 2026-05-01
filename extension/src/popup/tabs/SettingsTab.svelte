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
import CollapsibleSection from '../components/CollapsibleSection.svelte';
import { clearSeenListings } from '../lib/messages';
import type { PopupSettings } from '../lib/storage';
import { resetAiUsage, saveAllSettings } from '../lib/storage';

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

// Notification preferences
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

// Load notification prefs on mount
loadNotifPrefs();

// Active provider metadata (reactive to settings.aiProvider)
let activeProvider = $derived(PROVIDERS[settings.aiProvider] ?? PROVIDERS.gemini);

// Per-provider key accessors (litellm uses separate OIDC credentials, not a simple API key)
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

// Cost calculation using the active provider's pricing
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
  if (settings.aiMode === 'direct') {
    // Direct mode: validate API key via the active provider
    if (!currentApiKey) {
      aiServerConnected = false;
      return;
    }
    try {
      aiServerConnected = await activeProvider.validateKey(currentApiKey);
    } catch {
      aiServerConnected = false;
    }
  } else {
    // Server mode: check /health endpoint
    const url = settings.aiServerUrl || 'http://localhost:3456';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`${url}/health`, { signal: controller.signal });
      const data = await response.json();
      aiServerConnected = data.status === 'ok';
    } catch {
      aiServerConnected = false;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function handleAiModeChange() {
  await autoSaveImmediate();
  checkHealth();
}

async function handleProviderChange() {
  // LiteLLM forces server mode
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

function toggleApiKey() {
  showApiKey = !showApiKey;
}

// Keys excluded from export/import — transient state that gets re-derived at runtime
const EXCLUDED_KEYS = new Set([
  'conversations', // re-synced from ImmoScout messenger
  'convLastCheck', // transient sync timestamp
  'convUnreadCount', // transient unread counter
  'rateLastMessageTime', // session rate-limit state
  'rateMessageCount', // session rate-limit state
  'rateCountResetTime', // session rate-limit state
  'lastCheckTime', // transient monitoring timestamp
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

// Known storage keys that are safe to import
const ALLOWED_IMPORT_KEYS = new Set([
  // Settings
  'searchUrl',
  'searchUrls',
  'messageTemplate',
  'checkInterval',
  'rateLimit',
  'minDelay',
  'isMonitoring',
  'autoSendMode',
  // Form fields
  'formAdults',
  'formChildren',
  'formPets',
  'formSmoker',
  'formIncome',
  'formHouseholdSize',
  'formEmployment',
  'formIncomeRange',
  'formDocuments',
  'formSalutation',
  'formPhone',
  // AI settings
  'aiMode',
  'aiProvider',
  'aiEnabled',
  'aiApiKeyGemini',
  'aiApiKeyOpenai',
  'aiLitellmClientId',
  'aiLitellmClientSecret',
  'aiLitellmTokenUrl',
  'aiLitellmBaseUrl',
  'aiLitellmModel',
  'aiServerUrl',
  'aiMinScore',
  'aiAboutMe',
  'aiCustomScoringPrompt',
  'aiCustomMessagePrompt',
  'aiListingsScored',
  'aiListingsSkipped',
  'aiUsagePromptTokens',
  'aiUsageCompletionTokens',
  // Profile
  'profileName',
  'profileAge',
  'profileOccupation',
  'profileLanguages',
  'profileMovingReason',
  'profileCurrentNeighborhood',
  'profileIdealApartment',
  'profileDealbreakers',
  'profileStrengths',
  'profileMaxWarmmiete',
  'profileBirthDate',
  'profileMaritalStatus',
  'profileCurrentAddress',
  'profileEmail',
  'profileEmployer',
  'profileEmployedSince',
  'profileNetIncome',
  'profileCurrentLandlord',
  'profileLandlordPhone',
  'profileLandlordEmail',
  // Data
  'seenListings',
  'manualQueue',
  'blacklistedListings',
  'contactedLandlords',
  'activityLog',
  'convCheckInterval',
  'syncedContactedCount',
  // Stats
  'totalMessagesSent',
  // Notification preferences
  'notificationPrefs',
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
    // Filter to known keys only to prevent storage pollution
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

<div class="section-title" style="margin-top:0; padding-top:0; border-top:none;">Monitoring</div>

<div class="grid-2">
  <div class="field">
    <label for="checkInterval">Check Interval (seconds)</label>
    <input type="number" id="checkInterval" bind:value={settings.checkInterval} onchange={handleCheckIntervalChange} onblur={autoSaveImmediate} min="60" max="3600" />
  </div>
  <div class="field">
    <label for="rateLimit">Rate Limit (per hour)</label>
    <input type="number" id="rateLimit" bind:value={settings.rateLimit} oninput={autoSave} onblur={autoSaveImmediate} min="1" max="50" />
  </div>
</div>

<div class="grid-2">
  <div class="field">
    <label for="minDelay">Min Delay Between Messages (seconds)</label>
    <input type="number" id="minDelay" bind:value={settings.minDelay} oninput={autoSave} onblur={autoSaveImmediate} min="10" max="300" />
  </div>
  <div class="field">
    <label for="aiMinScore">Min Score (1-10)</label>
    <input type="number" id="aiMinScore" bind:value={settings.aiMinScore} oninput={autoSave} onblur={autoSaveImmediate} min="1" max="10" />
    <div class="hint">Listings scoring below this will be skipped</div>
  </div>
</div>

<label class="toggle-label" style="margin-top: 8px;">
  <input type="checkbox" bind:checked={settings.premiumAccount} onchange={autoSaveImmediate} />
  ImmoScout24 Premium account
</label>
<div class="hint">Premium users can message "coming soon" listings — enable to skip the automatic deferral</div>

<div class="section-title">AI Configuration</div>

<div class="ai-settings-group">
  <div class="ai-status" class:connected={aiServerConnected} class:disconnected={!aiServerConnected}>
    <span class="dot"></span>
    <span>{aiServerConnected ? 'Connected' : 'Disconnected'}</span>
  </div>
  {#if !aiServerConnected}
    <div class="ai-status-reason">{aiDisconnectReason}</div>
  {/if}

  {#if !aiServerConnected && settings.aiMode === 'server'}
    <div class="setup-box">
      <strong>Setup Instructions</strong>
      The AI server needs to be running locally.
      <code>cd server && npm install && npm start</code>
      <button class="copy-cmd" onclick={handleCopySetup}>{copySetupText}</button>
    </div>
  {/if}

  <div class="field">
    <label for="aiMode">AI Mode</label>
    <select id="aiMode" bind:value={settings.aiMode} onchange={handleAiModeChange} disabled={isLitellm}>
      <option value="direct">Direct (API key)</option>
      <option value="server">Server (local)</option>
    </select>
    <div class="hint">{aiModeHint}</div>
  </div>

  <div class="field">
    <label for="aiProvider">AI Provider</label>
    <select id="aiProvider" bind:value={settings.aiProvider} onchange={handleProviderChange}>
      {#each Object.values(PROVIDERS) as provider}
        <option value={provider.id}>{provider.label}</option>
      {/each}
    </select>
  </div>

  {#if isLitellm}
    <div class="field">
      <label for="litellmModel">Model</label>
      <div class="model-picker">
        <select id="litellmModel" bind:value={settings.aiLitellmModel} onchange={autoSaveImmediate} class="model-select">
          {#if litellmModels.length > 0}
            {#each litellmModels as m}
              <option value={m}>{m}</option>
            {/each}
          {:else}
            <option value={settings.aiLitellmModel}>{settings.aiLitellmModel || LITELLM_DEFAULT_MODEL}</option>
          {/if}
        </select>
        <button class="btn btn-secondary" onclick={fetchLitellmModels} disabled={litellmModelsLoading}>
          {litellmModelsLoading ? 'Loading...' : 'Fetch Models'}
        </button>
      </div>
    </div>

    <!-- LiteLLM OIDC configuration -->
    <div class="field">
      <label for="litellmTokenUrl">OIDC Token URL</label>
      <input type="url" id="litellmTokenUrl" bind:value={settings.aiLitellmTokenUrl} oninput={autoSave} onblur={autoSaveImmediate} placeholder="https://auth.example.com/realms/.../token" />
      <div class="hint">OAuth2 client_credentials token endpoint</div>
    </div>

    <div class="field">
      <label for="litellmBaseUrl">LiteLLM Base URL</label>
      <input type="url" id="litellmBaseUrl" bind:value={settings.aiLitellmBaseUrl} oninput={autoSave} onblur={autoSaveImmediate} placeholder="https://litellm.example.com/v1" />
      <div class="hint">OpenAI-compatible API base URL</div>
    </div>

    <div class="field">
      <label for="litellmClientId">Client ID</label>
      <input type="text" id="litellmClientId" bind:value={settings.aiLitellmClientId} oninput={autoSave} onblur={autoSaveImmediate} placeholder="your-client-id" />
    </div>

    <div class="field">
      <label for="litellmClientSecret">Client Secret</label>
      <div class="password-field">
        <input
          type={showClientSecret ? 'text' : 'password'}
          id="litellmClientSecret"
          bind:value={settings.aiLitellmClientSecret}
          oninput={autoSave}
          onblur={autoSaveImmediate}
          placeholder="your-client-secret"
        />
        <button class="password-toggle" onclick={() => showClientSecret = !showClientSecret}>
          {showClientSecret ? 'hide' : 'show'}
        </button>
      </div>
    </div>
  {:else}
    <div class="field">
      <label for="aiApiKey">{settings.aiMode === 'direct' ? `${activeProvider.label} API Key` : 'API Key (optional)'}</label>
      <div class="password-field">
        <input
          type={showApiKey ? 'text' : 'password'}
          id="aiApiKey"
          value={currentApiKey}
          oninput={(e) => { setApiKey((e.target as HTMLInputElement).value); autoSave(); }}
          onblur={() => { autoSaveImmediate(); checkHealth(); }}
          placeholder={settings.aiMode === 'direct' ? `Paste your ${activeProvider.label} API key` : 'Optional — passed to server'}
        />
        <button class="password-toggle" onclick={toggleApiKey}>
          {showApiKey ? 'hide' : 'show'}
        </button>
      </div>
      {#if settings.aiMode === 'direct'}
        <div class="hint">
          <button type="button" class="internal-link" onclick={() => onNavigate('help')}>How do I get an API key?</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if settings.aiMode === 'server'}
    <div class="field">
      <label for="aiServerUrl">Server URL</label>
      <input type="url" id="aiServerUrl" bind:value={settings.aiServerUrl} oninput={autoSave} onblur={() => { autoSaveImmediate(); checkHealth(); }} placeholder="http://localhost:3456" />
    </div>
  {/if}

  <CollapsibleSection title="Message Style Guide" open={true}>
    <div class="field">
      <label for="aiAboutMe">About Me (for AI context)</label>
      <textarea
        id="aiAboutMe"
        bind:value={settings.aiAboutMe}
        oninput={autoSave}
        onblur={autoSaveImmediate}
        placeholder="Tell the AI about yourself..."
        style="min-height:60px;"
      ></textarea>
    </div>

    <div class="field">
      <label for="messageTemplate">Message Template</label>
      <textarea
        id="messageTemplate"
        bind:value={settings.messageTemplate}
        oninput={autoSave}
        onblur={autoSaveImmediate}
        placeholder="Sehr geehrte(r) {'{name}'},&#10;&#10;ich interessiere mich..."
        style="min-height:80px;"
      ></textarea>
      <div class="hint">Write a sample message to guide the AI's tone and style. The AI uses this as inspiration, not as the actual message. Use {'{name}'} for landlord greeting.</div>
    </div>
  </CollapsibleSection>

  <CollapsibleSection title="AI Prompts (advanced)" open={false}>
    <div class="prompt-warning">
      ⚠ Editing these can break AI behavior. Leave empty to use the built-in default. Use <code>{'{{variableName}}'}</code> placeholders from the legend below — values are interpolated at runtime.
    </div>

    <div class="field">
      <label for="customScoringPrompt">Scoring system prompt</label>
      <div class="hint">System prompt the AI sees when scoring a listing 1–10.</div>
      <textarea
        id="customScoringPrompt"
        class="prompt-textarea"
        bind:value={settings.aiCustomScoringPrompt}
        oninput={autoSave}
        onblur={autoSaveImmediate}
        placeholder="(empty = use default — click Load default to edit)"
      ></textarea>
      <div class="prompt-toolbar">
        <button type="button" class="btn btn-secondary" onclick={() => setCustomPrompt('aiCustomScoringPrompt', DEFAULT_SCORING_TEMPLATE)}>Load default</button>
        <button type="button" class="btn btn-secondary" onclick={() => setCustomPrompt('aiCustomScoringPrompt', '')} disabled={!settings.aiCustomScoringPrompt}>Reset</button>
      </div>
      <div class="placeholder-legend">
        <span class="legend-label">Available variables:</span>
        {#each SCORING_PLACEHOLDERS as ph}
          <button type="button" class="placeholder-chip" class:active={activePlaceholder?.name === ph.name} title={ph.description} onclick={() => togglePlaceholder(ph)}>{`{{${ph.name}}}`}</button>
        {/each}
      </div>
      <div class="placeholder-caption">These tokens get replaced at runtime. Click any to see what it stands for.</div>
      {#if activePlaceholder && SCORING_PLACEHOLDERS.some((p) => p.name === activePlaceholder?.name)}
        <div class="placeholder-help">
          <div><code>{`{{${activePlaceholder.name}}}`}</code> — {activePlaceholder.description}</div>
          <div class="placeholder-source">Source: {activePlaceholder.source}</div>
        </div>
      {/if}
      {#if scoringUnknown.length}
        <div class="prompt-warning prompt-error">
          Unknown variables: {scoringUnknown.map((n) => `{{${n}}}`).join(', ')} — these will appear literally in the prompt sent to the AI.
        </div>
      {/if}
    </div>

    <div class="field">
      <label for="customMessagePrompt">Message system prompt</label>
      <div class="hint">System prompt the AI sees when composing the outreach message to landlords.</div>
      <textarea
        id="customMessagePrompt"
        class="prompt-textarea"
        bind:value={settings.aiCustomMessagePrompt}
        oninput={autoSave}
        onblur={autoSaveImmediate}
        placeholder="(empty = use default — click Load default to edit)"
      ></textarea>
      <div class="prompt-toolbar">
        <button type="button" class="btn btn-secondary" onclick={() => setCustomPrompt('aiCustomMessagePrompt', DEFAULT_MESSAGE_TEMPLATE)}>Load default</button>
        <button type="button" class="btn btn-secondary" onclick={() => setCustomPrompt('aiCustomMessagePrompt', '')} disabled={!settings.aiCustomMessagePrompt}>Reset</button>
      </div>
      <div class="placeholder-legend">
        <span class="legend-label">Available variables:</span>
        {#each MESSAGE_PLACEHOLDERS as ph}
          <button type="button" class="placeholder-chip" class:active={activePlaceholder?.name === ph.name} title={ph.description} onclick={() => togglePlaceholder(ph)}>{`{{${ph.name}}}`}</button>
        {/each}
      </div>
      <div class="placeholder-caption">These tokens get replaced at runtime. Click any to see what it stands for.</div>
      {#if activePlaceholder && MESSAGE_PLACEHOLDERS.some((p) => p.name === activePlaceholder?.name)}
        <div class="placeholder-help">
          <div><code>{`{{${activePlaceholder.name}}}`}</code> — {activePlaceholder.description}</div>
          <div class="placeholder-source">Source: {activePlaceholder.source}</div>
        </div>
      {/if}
      {#if messageUnknown.length}
        <div class="prompt-warning prompt-error">
          Unknown variables: {messageUnknown.map((n) => `{{${n}}}`).join(', ')} — these will appear literally in the prompt sent to the AI.
        </div>
      {/if}
    </div>
  </CollapsibleSection>

  <div class="section-title">AI Usage</div>

  <div class="ai-stats-grid">
    <div class="ai-stat">
      <span class="ai-stat-label">Scored</span>
      <span class="ai-stat-value">{aiStatsScored}</span>
    </div>
    <div class="ai-stat">
      <span class="ai-stat-label">Skipped</span>
      <span class="ai-stat-value">{aiStatsSkipped}</span>
    </div>
  </div>

  <div class="ai-tokens">
    <div>Prompt tokens: <strong>{aiPromptTokens.toLocaleString()}</strong></div>
    <div>Completion tokens: <strong>{aiCompletionTokens.toLocaleString()}</strong></div>
    <div>Estimated cost: <strong>{aiCost}</strong></div>
  </div>

  <button class="btn btn-secondary" onclick={handleResetUsage} style="font-size:11px;">Reset Usage Stats</button>
</div>

<CollapsibleSection title="Notifications" open={false}>
  <div class="notif-prefs">
    {#each Object.entries(NOTIFICATION_LABELS) as [event, label]}
      <label class="toggle-label">
        <input
          type="checkbox"
          checked={notifPrefs[event as NotificationEvent]}
          onchange={() => handleNotifToggle(event as NotificationEvent)}
          disabled={!notifPrefsLoaded}
        />
        <span>{label}</span>
      </label>
    {/each}
  </div>
</CollapsibleSection>

<div class="section-title">Data</div>

<button class="btn btn-danger" onclick={handleClearSeen}>
  Clear Seen Listings ({stats.seenCount})
</button>

<div class="section-title">Backup & Restore</div>

<div style="display:flex; gap:8px; margin-bottom:8px;">
  <button class="btn btn-test" onclick={handleExport}>Export All Data</button>
  <button class="btn btn-test" onclick={() => fileInput?.click()}>Import Data</button>
  <input type="file" accept=".json" bind:this={fileInput} onchange={handleImport} style="display:none;" />
</div>
<div class="hint">Export downloads a JSON backup of all settings, profile, and seen listings. Import merges the backup into current storage.</div>

<style>
  .ai-stats-grid {
    display: flex;
    gap: 16px;
    margin-bottom: 8px;
  }

  .ai-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .ai-stat-label {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
  }

  .ai-stat-value {
    font-size: 18px;
    font-weight: 600;
    color: #333;
  }

  .ai-tokens {
    font-size: 11px;
    color: #555;
    margin-bottom: 8px;
    line-height: 1.6;
  }

  .internal-link {
    all: unset;
    color: #3dbda8;
    cursor: pointer;
    text-decoration: underline;
    font-size: 11px;
    font-family: inherit;
  }

  .internal-link:hover {
    color: #2a9d8f;
  }

  .notif-prefs {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #333;
    cursor: pointer;
  }

  .toggle-label input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .model-picker {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }

  .model-select {
    flex: 2;
    min-width: 0;
  }

  .model-picker :global(.btn) {
    flex: 1;
    flex-shrink: 0;
    font-size: 11px;
    white-space: nowrap;
    width: auto;
    margin-top: 0;
  }

  .prompt-textarea {
    min-height: 160px;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 11px;
  }

  .prompt-warning {
    font-size: var(--text-xs);
    color: var(--color-warning-fg);
    background: var(--color-warning-bg);
    border: 1px solid #f0d97c;
    border-left: 3px solid #d4a017;
    border-radius: var(--radius-sm);
    padding: var(--space-2) 10px;
    margin-bottom: var(--space-2);
    line-height: 1.4;
  }

  .prompt-warning code {
    background: rgba(0, 0, 0, 0.05);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .prompt-error {
    color: #842029;
    background: #f8d7da;
    border-color: #f1aeb5;
    margin-top: 6px;
    margin-bottom: 0;
  }

  .prompt-toolbar {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }

  .prompt-toolbar :global(.btn) {
    flex: 0 0 auto;
    width: auto;
    font-size: 11px;
    margin-top: 0;
    padding: 4px 10px;
  }

  .placeholder-legend {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    font-size: 11px;
    color: #555;
  }

  .legend-label {
    font-weight: 600;
    color: #444;
    margin-right: 4px;
  }

  .placeholder-chip {
    background: #eef3f6;
    border: 1px solid #d4dde3;
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 10px;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    color: inherit;
    cursor: help;
  }

  .placeholder-chip:hover {
    background: #dfeaf1;
  }

  .placeholder-chip.active {
    background: #4a90e2;
    border-color: #357abd;
    color: #fff;
  }

  .placeholder-help {
    margin-top: 6px;
    padding: 6px 8px;
    background: #f4f8fb;
    border: 1px solid #d4dde3;
    border-radius: 4px;
    font-size: 11px;
    line-height: 1.4;
    color: #333;
  }

  .placeholder-help code {
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 10px;
  }

  .placeholder-source {
    margin-top: 4px;
    font-size: 10px;
    color: #666;
    font-style: italic;
  }

  .placeholder-caption {
    margin-top: 4px;
    font-size: 10px;
    color: var(--color-text-subtle);
  }
</style>
