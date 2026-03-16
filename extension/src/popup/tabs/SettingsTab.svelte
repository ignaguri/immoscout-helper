<script lang="ts">
import { PROVIDERS } from '../../shared/ai-router';
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

// Active provider metadata (reactive to settings.aiProvider)
let activeProvider = $derived(PROVIDERS[settings.aiProvider] ?? PROVIDERS.gemini);

// Per-provider key accessors
let currentApiKey = $derived(settings.aiProvider === 'gemini' ? settings.aiApiKeyGemini : settings.aiApiKeyOpenai);
function setApiKey(val: string) {
  if (settings.aiProvider === 'gemini') settings.aiApiKeyGemini = val;
  else settings.aiApiKeyOpenai = val;
}

// Cost calculation using the active provider's pricing
let aiCost = $derived(
  `$${((aiPromptTokens * activeProvider.pricing.input) / 1_000_000 + (aiCompletionTokens * activeProvider.pricing.output) / 1_000_000).toFixed(4)}`,
);

async function autoSave() {
  if (!settingsLoaded) return;
  await saveAllSettings(settings);
}

async function handleCheckIntervalChange() {
  await autoSave();
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
  await autoSave();
  checkHealth();
}

async function handleProviderChange() {
  await autoSave();
  if (settings.aiMode === 'direct' && currentApiKey) {
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

async function handleExport() {
  try {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `immoscout-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    alert(`Export failed: ${e.message}`);
  }
}

async function handleImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (typeof data !== 'object' || data === null) throw new Error('Invalid backup format');
    if (!confirm('This will merge the backup into your current data. Existing values will be overwritten. Continue?'))
      return;
    await chrome.storage.local.set(data);
    alert('Backup restored. Reload the extension to apply all changes.');
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
    <input type="number" id="checkInterval" bind:value={settings.checkInterval} onchange={handleCheckIntervalChange} onblur={autoSave} min="60" max="3600" />
  </div>
  <div class="field">
    <label for="rateLimit">Rate Limit (per hour)</label>
    <input type="number" id="rateLimit" bind:value={settings.rateLimit} oninput={autoSave} onblur={autoSave} min="1" max="50" />
  </div>
</div>

<div class="field">
  <label for="minDelay">Min Delay Between Messages (seconds)</label>
  <input type="number" id="minDelay" bind:value={settings.minDelay} oninput={autoSave} onblur={autoSave} min="10" max="300" />
</div>

<div class="section-title">AI Scoring</div>

<div class="ai-settings-group">
  <div class="ai-status" class:connected={aiServerConnected} class:disconnected={!aiServerConnected}>
    <span class="dot"></span>
    <span>{aiServerConnected ? 'Connected' : (settings.aiMode === 'direct' ? (currentApiKey ? 'Invalid API key or unreachable' : 'Paste your API key to get started') : 'Server unreachable')}</span>
  </div>

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
    <select id="aiMode" bind:value={settings.aiMode} onchange={handleAiModeChange}>
      <option value="direct">Direct (API key)</option>
      <option value="server">Server (local)</option>
    </select>
    <div class="hint">{settings.aiMode === 'direct' ? 'Calls the AI provider directly — no server needed' : 'Uses local Express server for AI calls'}</div>
  </div>

  <div class="field">
    <label for="aiProvider">AI Provider</label>
    <select id="aiProvider" bind:value={settings.aiProvider} onchange={handleProviderChange}>
      {#each Object.values(PROVIDERS) as provider}
        <option value={provider.id}>{provider.label}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="aiApiKey">{settings.aiMode === 'direct' ? `${activeProvider.label} API Key` : 'API Key (optional)'}</label>
    <div class="password-field">
      <input
        type={showApiKey ? 'text' : 'password'}
        id="aiApiKey"
        value={currentApiKey}
        oninput={(e) => { setApiKey((e.target as HTMLInputElement).value); autoSave(); }}
        onblur={() => { autoSave(); checkHealth(); }}
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

  {#if settings.aiMode === 'server'}
    <div class="field">
      <label for="aiServerUrl">Server URL</label>
      <input type="url" id="aiServerUrl" bind:value={settings.aiServerUrl} oninput={autoSave} onblur={() => { autoSave(); checkHealth(); }} placeholder="http://localhost:3456" />
    </div>
  {/if}

  <div class="field">
    <label for="aiMinScore">Min Score (1-10)</label>
    <input type="number" id="aiMinScore" bind:value={settings.aiMinScore} oninput={autoSave} onblur={autoSave} min="1" max="10" />
    <div class="hint">Listings scoring below this will be skipped</div>
  </div>

  <CollapsibleSection title="Message Style Guide" open={true}>
    <div class="field">
      <label for="aiAboutMe">About Me (for AI context)</label>
      <textarea
        id="aiAboutMe"
        bind:value={settings.aiAboutMe}
        oninput={autoSave}
        onblur={autoSave}
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
        onblur={autoSave}
        placeholder="Sehr geehrte(r) {'{name}'},&#10;&#10;ich interessiere mich..."
        style="min-height:80px;"
      ></textarea>
      <div class="hint">Write a sample message to guide the AI's tone and style. The AI uses this as inspiration, not as the actual message. Use {'{name}'} for landlord greeting.</div>
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
</style>
