<script lang="ts">
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
}: {
  settings: PopupSettings;
  settingsLoaded: boolean;
  stats: { sentHour: number; sentTotal: number; seenCount: number; syncedCount: number };
  aiServerConnected: boolean;
  aiStatsScored: number;
  aiStatsSkipped: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
} = $props();

let showApiKey = $state(false);
let copySetupText = $state('Copy command');

// Cost calculation: Gemini 2.5 Flash pricing: $0.15/1M input, $0.60/1M output
let aiCost = $derived(`$${((aiPromptTokens * 0.15) / 1_000_000 + (aiCompletionTokens * 0.6) / 1_000_000).toFixed(4)}`);

async function autoSave() {
  if (!settingsLoaded) return;
  await saveAllSettings(settings);
}

async function handleAiEnabledChange() {
  await autoSave();
  checkHealth();
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
  const url = settings.aiServerUrl || 'http://localhost:3456';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await response.json();
    aiServerConnected = data.status === 'ok';
  } catch {
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

<div class="toggle-row">
  <input type="checkbox" id="aiEnabled" bind:checked={settings.aiEnabled} onchange={handleAiEnabledChange} />
  <label for="aiEnabled">Enable AI Analysis</label>
</div>

<div class="ai-settings-group" class:disabled={!settings.aiEnabled}>
  <div class="field">
    <label for="aiApiKey">API Key (optional)</label>
    <div class="password-field">
      <input
        type={showApiKey ? 'text' : 'password'}
        id="aiApiKey"
        bind:value={settings.aiApiKey}
        oninput={autoSave}
        onblur={autoSave}
        placeholder="Your Gemini API key"
      />
      <button class="password-toggle" onclick={toggleApiKey}>
        {showApiKey ? 'hide' : 'show'}
      </button>
    </div>
  </div>

  <div class="field">
    <label for="aiServerUrl">Server URL</label>
    <input type="url" id="aiServerUrl" bind:value={settings.aiServerUrl} oninput={autoSave} onblur={autoSave} placeholder="http://localhost:3456" />
  </div>

  <div class="field">
    <label for="aiMinScore">Min Score (1-10)</label>
    <input type="number" id="aiMinScore" bind:value={settings.aiMinScore} oninput={autoSave} onblur={autoSave} min="1" max="10" />
    <div class="hint">Listings scoring below this will be skipped</div>
  </div>

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

  <div class="ai-status" class:connected={aiServerConnected} class:disconnected={!aiServerConnected}>
    <span class="dot"></span>
    <span>{aiServerConnected ? 'Connected' : 'Unreachable'}</span>
  </div>

  {#if !aiServerConnected && settings.aiEnabled}
    <div class="setup-box">
      <strong>Setup Instructions</strong>
      The AI server needs to be running locally.
      <code>cd server && npm install && npm start</code>
      <button class="copy-cmd" onclick={handleCopySetup}>{copySetupText}</button>
    </div>
  {/if}

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
</style>
