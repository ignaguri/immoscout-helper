<script lang="ts">
import { onMount } from 'svelte';
import { ALARM_NAME } from '../shared/constants';
import { PROVIDERS } from '../shared/ai-router';
import { getStatus, startMonitoring, stopMonitoring } from './lib/messages';
import type { PopupSettings } from './lib/storage';
import {
  loadActivityLog as loadActivityLogStorage,
  loadAllSettings,
  loadConversations as loadConvStorage,
  loadQueue,
  saveAllSettings,
} from './lib/storage';
import ActivityTab from './tabs/ActivityTab.svelte';
import ConversationsTab from './tabs/ConversationsTab.svelte';
import ProfileTab from './tabs/ProfileTab.svelte';
import QueueTab from './tabs/QueueTab.svelte';
import HelpTab from './tabs/HelpTab.svelte';
import SettingsTab from './tabs/SettingsTab.svelte';

// State
let settings: PopupSettings = $state({
  searchUrl: '',
  messageTemplate: '',
  autoSendMode: 'auto',
  checkInterval: 60,
  rateLimit: 10,
  minDelay: 30,
  profileName: '',
  profileAge: '',
  profileOccupation: '',
  profileLanguages: '',
  profileMovingReason: '',
  profileCurrentNeighborhood: '',
  profileIdealApartment: '',
  profileDealbreakers: '',
  profileStrengths: '',
  profileMaxWarmmiete: '',
  profileBirthDate: '',
  profileMaritalStatus: '',
  profileCurrentAddress: '',
  profileEmail: '',
  profileEmployer: '',
  profileEmployedSince: '',
  profileNetIncome: '',
  profileCurrentLandlord: '',
  profileLandlordPhone: '',
  profileLandlordEmail: '',
  formSalutation: 'Frau',
  formPhone: '',
  formAdults: 1,
  formChildren: 0,
  formPets: 'Nein',
  formSmoker: 'Nein',
  formIncome: 2000,
  formHouseholdSize: 'Einpersonenhaushalt',
  formEmployment: 'Angestellte:r',
  formIncomeRange: '1.500 - 2.000',
  formDocuments: 'Vorhanden',
  aiMode: 'direct',
  aiProvider: 'gemini',
  aiApiKey: '',
  aiServerUrl: 'http://localhost:3456',
  aiMinScore: 5,
  aiAboutMe: '',
});

let settingsLoaded = $state(false);
let isMonitoring = $state(false);
let activeTab = $state('activity');

// Stats
let statsSentHour = $state(0);
let statsSentTotal = $state(0);
let statsSeenCount = $state(0);
let statsSyncedCount = $state(0);
let statsNextCheck = $state('--');
let nextAlarmTime: number | null = $state(null);

// AI
let aiServerConnected = $state(false);
let aiStatsScored = $state(0);
let aiStatsSkipped = $state(0);
let aiPromptTokens = $state(0);
let aiCompletionTokens = $state(0);

// Activity
let activityLog: any[] = $state([]);
let testResultVisible = $state(false);
let testResultContent = $state('');
let testResultIsError = $state(false);
let analyzeResult: any = $state(null);
let lastAnalyzeContext: any = $state(null);

// Queue
let queue: any[] = $state([]);
let isQueueProcessing = $state(false);
let queueProgressLines: Array<{ text: string; type: string }> = $state([]);

// Conversations
let conversations: any[] = $state([]);
let convLastCheckTime: string | null = $state(null);
let convUnreadCount = $state(0);

// Tabs definition
const tabs = [
  { id: 'activity', label: 'Activity' },
  { id: 'profile', label: 'Profile' },
  { id: 'queue', label: 'Queue' },
  { id: 'replies', label: 'Replies' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' },
];

// Status badge
let statusText = $derived(isMonitoring ? 'Active' : 'Stopped');
let statusClass = $derived(isMonitoring ? 'active' : 'inactive');

async function updateStats() {
  try {
    const status = await getStatus();
    statsSentHour = status.messagesThisHour || 0;
    statsSentTotal = status.totalMessagesSent || 0;
    statsSeenCount = status.seenListingsCount || 0;
    statsSyncedCount = status.syncedContacted || 0;

    if (status.isMonitoring) {
      try {
        const alarm = await chrome.alarms.get(ALARM_NAME);
        nextAlarmTime = alarm ? alarm.scheduledTime : null;
      } catch {
        nextAlarmTime = null;
      }
    } else {
      nextAlarmTime = null;
    }
    updateCountdown();
  } catch {
    /* Service worker might be sleeping */
  }
}

function updateCountdown() {
  const targetTime = isMonitoring ? nextAlarmTime : null;
  if (!targetTime) {
    statsNextCheck = isQueueProcessing ? 'processing' : '--';
    return;
  }
  const remaining = Math.max(0, Math.round((targetTime - Date.now()) / 1000));
  if (remaining <= 0) {
    statsNextCheck = 'now';
  } else if (remaining < 60) {
    statsNextCheck = `${remaining}s`;
  } else {
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    statsNextCheck = `${min}m${sec < 10 ? '0' : ''}${sec}s`;
  }
}

async function updateAiStats() {
  try {
    const status = await getStatus();
    aiStatsScored = status.aiScored || 0;
    aiStatsSkipped = status.aiSkipped || 0;
    aiPromptTokens = status.aiPromptTokens || 0;
    aiCompletionTokens = status.aiCompletionTokens || 0;
  } catch {
    /* ignore */
  }
}

async function checkAiServerHealth() {
  if (settings.aiMode === 'direct') {
    // Direct mode: validate API key via Gemini model metadata endpoint
    if (!settings.aiApiKey) {
      aiServerConnected = false;
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${settings.aiApiKey}`,
        { signal: controller.signal },
      );
      aiServerConnected = response.ok;
    } catch {
      aiServerConnected = false;
    } finally {
      clearTimeout(timeout);
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

async function handleToggle() {
  if (isMonitoring) {
    const response = await stopMonitoring();
    if (response?.success) {
      isMonitoring = false;
    }
  } else {
    if (!settings.searchUrl.trim()) {
      alert('Please enter a search URL');
      activeTab = 'activity';
      return;
    }
    const needsKey = settings.aiMode === 'direct' && !settings.aiApiKey;
    const needsServer = settings.aiMode === 'server' && !settings.aiServerUrl;
    if (needsKey || needsServer) {
      const providerLabel = (PROVIDERS[settings.aiProvider] ?? PROVIDERS.gemini).label;
      alert(needsKey
        ? `Please configure your ${providerLabel} API key in Settings`
        : 'Please configure your AI server URL in Settings');
      activeTab = 'settings';
      return;
    }
    await saveAllSettings(settings);
    try {
      const response = await startMonitoring();
      if (response?.success) {
        isMonitoring = true;
        activeTab = 'activity';
      } else {
        alert(`Error: ${response?.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  }
}

async function loadQueueState() {
  try {
    const status = await chrome.runtime.sendMessage({ action: 'getQueueStatus' });
    queue = status.queue || [];
    isQueueProcessing = status.isProcessing;
    if (status.isProcessing) {
      queueProgressLines = [
        { text: `Processing in progress \u2014 ${queue.length} listings remaining...`, type: 'header' },
      ];
    }
  } catch {
    queue = await loadQueue();
    isQueueProcessing = false;
  }
}

async function loadConversations() {
  const data = await loadConvStorage();
  conversations = data.conversations;
  convLastCheckTime = data.lastCheck;
  convUnreadCount = data.unreadCount;
}

function appendToResult(line: string) {
  testResultVisible = true;
  testResultContent += `\n${line}`;
}

function appendQueueProgress(text: string, type: string) {
  queueProgressLines = [...queueProgressLines, { text, type }];
}

onMount(() => {
  // Load initial data
  loadAllSettings().then((s) => {
    settings = s;
    settingsLoaded = true;
  });
  loadActivityLogStorage().then((log) => {
    activityLog = log;
  });
  loadQueueState();
  loadConversations();
  getStatus().then((status) => {
    isMonitoring = status.isMonitoring;
  });
  updateStats();
  updateAiStats();
  checkAiServerHealth();

  // Set up intervals
  const statsInterval = setInterval(updateStats, 5000);
  const countdownInterval = setInterval(updateCountdown, 1000);
  const aiStatsInterval = setInterval(updateAiStats, 5000);
  const healthInterval = setInterval(checkAiServerHealth, 10000);

  // Listen for messages from background
  const messageListener = (request: any) => {
    if (request.action === 'progressUpdate') {
      appendToResult(request.message);
    } else if (request.action === 'activityLog') {
      activityLog = [...activityLog, request];
      // Refresh queue list when items are processed
      if (request.lastResult || request.message?.includes('Queue empty')) {
        loadQueue().then((q) => {
          queue = q;
        });
      }
    } else if (request.action === 'conversationUpdate') {
      loadConversations();
    } else if (request.action === 'queueDone') {
      appendQueueProgress('Queue processing complete.', 'header');
      isQueueProcessing = false;
      loadQueue().then((q) => {
        queue = q;
      });
    }
  };
  chrome.runtime.onMessage.addListener(messageListener);

  return () => {
    clearInterval(statsInterval);
    clearInterval(countdownInterval);
    clearInterval(aiStatsInterval);
    clearInterval(healthInterval);
    chrome.runtime.onMessage.removeListener(messageListener);
  };
});
</script>

<div class="popup-container">
  <!-- Header -->
  <div class="header">
    <div class="header-title">
      <h1>Apartment Messenger</h1>
      <span class="subtitle">ImmoScout24 Auto-Sender</span>
    </div>
    <span class="status-badge {statusClass}">{statusText}</span>
  </div>

  <!-- Toggle Button -->
  <button
    class="toggle-btn {isMonitoring ? 'stop' : 'start'}"
    onclick={handleToggle}
  >
    <span>{isMonitoring ? '\u23F9' : '\u25B6'}</span>
    <span>{isMonitoring ? 'Stop' : 'Start'}</span>
  </button>

  <!-- Stats Bar -->
  <div class="stats-bar">
    <div class="stat">
      <span class="stat-value">{statsSentHour}</span>
      <span class="stat-label">This hour</span>
    </div>
    <div class="stat">
      <span class="stat-value">{statsSentTotal}</span>
      <span class="stat-label">Total sent</span>
    </div>
    <div class="stat">
      <span class="stat-value">{statsSeenCount}</span>
      <span class="stat-label">Seen</span>
    </div>
    <div class="stat">
      <span class="stat-value">{statsSyncedCount}</span>
      <span class="stat-label">Synced</span>
    </div>
    <div class="stat">
      <span class="stat-value">{statsNextCheck}</span>
      <span class="stat-label">Next check</span>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    {#each tabs as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        onclick={() => activeTab = tab.id}
      >
        {tab.label}
        {#if tab.id === 'replies' && convUnreadCount > 0}
          <span class="tab-badge">{convUnreadCount}</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Tab Content -->
  <div class="tab-content-container">
    {#if activeTab === 'activity'}
      <div class="tab-content active">
        <ActivityTab
          bind:settings
          {settingsLoaded}
          bind:activityLog
          bind:testResultVisible
          bind:testResultContent
          bind:testResultIsError
          bind:analyzeResult
          bind:lastAnalyzeContext
        />
      </div>
    {:else if activeTab === 'profile'}
      <div class="tab-content active">
        <ProfileTab bind:settings {settingsLoaded} />
      </div>
    {:else if activeTab === 'queue'}
      <div class="tab-content active">
        <QueueTab
          bind:queue
          bind:isQueueProcessing
          bind:queueProgressLines
        />
      </div>
    {:else if activeTab === 'replies'}
      <div class="tab-content active">
        <ConversationsTab
          bind:conversations
          bind:lastCheckTime={convLastCheckTime}
          bind:unreadCount={convUnreadCount}
        />
      </div>
    {:else if activeTab === 'settings'}
      <div class="tab-content active">
        <SettingsTab
          bind:settings
          {settingsLoaded}
          stats={{ sentHour: statsSentHour, sentTotal: statsSentTotal, seenCount: statsSeenCount, syncedCount: statsSyncedCount }}
          bind:aiServerConnected
          bind:aiStatsScored
          bind:aiStatsSkipped
          bind:aiPromptTokens
          bind:aiCompletionTokens
          onNavigate={(tab) => activeTab = tab}
        />
      </div>
    {:else if activeTab === 'help'}
      <div class="tab-content active">
        <HelpTab />
      </div>
    {/if}
  </div>
</div>

<style>
  :global(*) { box-sizing: border-box; }

  :global(body) {
    width: 100%;
    min-width: 320px;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    background: #f5f5f5;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .popup-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* Header */
  .header {
    background: linear-gradient(135deg, #83F1DC 0%, #5ce0c8 100%);
    color: #1a1a1a;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-title {
    display: flex;
    flex-direction: column;
  }

  .header h1 {
    font-size: 16px;
    margin: 0;
    font-weight: 600;
  }

  .header .subtitle {
    font-size: 11px;
    opacity: 0.7;
    margin-top: 2px;
  }

  .status-badge {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 12px;
    font-weight: 500;
  }

  .status-badge.active {
    background: rgba(255,255,255,0.5);
    color: #1a1a1a;
  }

  .status-badge.inactive {
    background: rgba(0,0,0,0.15);
    color: #333;
  }

  /* Toggle Button */
  .toggle-btn {
    width: calc(100% - 40px);
    margin: 16px 20px;
    padding: 14px;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .toggle-btn.start {
    background: #83F1DC;
    color: #1a1a1a;
  }

  .toggle-btn.start:hover {
    background: #6de8d0;
  }

  .toggle-btn.stop {
    background: #333;
    color: white;
  }

  .toggle-btn.stop:hover {
    background: #222;
  }

  /* Stats Bar */
  .stats-bar {
    display: flex;
    justify-content: space-around;
    padding: 8px 20px 12px;
    background: white;
    border-bottom: 1px solid #eee;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-value {
    font-size: 14px;
    font-weight: 600;
    color: #333;
  }

  .stat-label {
    font-size: 9px;
    color: #999;
    text-transform: uppercase;
  }

  /* Tabs */
  .tabs {
    display: flex;
    background: white;
    border-bottom: 1px solid #e0e0e0;
  }

  .tab {
    flex: 1;
    padding: 12px 8px;
    border: none;
    background: none;
    font-size: 12px;
    font-weight: 500;
    color: #666;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
    position: relative;
  }

  .tab:hover {
    color: #5ce0c8;
    background: #f0fdfb;
  }

  .tab.active {
    color: #3dbda8;
    border-bottom-color: #83F1DC;
    background: white;
  }

  .tab-badge {
    display: inline-block;
    background: #e74c3c;
    color: white;
    font-size: 9px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 8px;
    margin-left: 4px;
    vertical-align: top;
  }

  /* Tab Content */
  .tab-content-container {
    flex: 1;
    overflow: hidden;
  }

  .tab-content {
    padding: 16px 20px;
    background: white;
    height: 100%;
    overflow-y: auto;
  }

  /* Global form styles for child components */
  :global(.field) {
    margin-bottom: 14px;
  }

  :global(.field:last-child) {
    margin-bottom: 0;
  }

  :global(label) {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #555;
    margin-bottom: 4px;
  }

  :global(input[type="text"]),
  :global(input[type="url"]),
  :global(input[type="number"]),
  :global(input[type="tel"]),
  :global(input[type="email"]),
  :global(input[type="password"]),
  :global(input[type="date"]),
  :global(select),
  :global(textarea) {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.2s;
  }

  :global(input:focus),
  :global(select:focus),
  :global(textarea:focus) {
    outline: none;
    border-color: #83F1DC;
  }

  :global(textarea) {
    min-height: 100px;
    resize: vertical;
  }

  :global(.hint) {
    font-size: 11px;
    color: #888;
    margin-top: 4px;
  }

  :global(.grid-2) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  /* Buttons */
  :global(.btn) {
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    margin-top: 8px;
  }

  :global(.btn-secondary) {
    background: #f0f0f0;
    color: #333;
  }

  :global(.btn-secondary:hover) {
    background: #e0e0e0;
  }

  :global(.btn-test) {
    background: #83F1DC;
    color: #1a1a1a;
  }

  :global(.btn-test:hover) {
    background: #6de8d0;
  }

  :global(.btn-danger) {
    background: none;
    color: #dc3545;
    font-size: 12px;
  }

  :global(.btn-danger:hover) {
    background: #fff5f5;
  }

  :global(.btn:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Section titles */
  :global(.section-title) {
    font-size: 11px;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 16px 0 10px 0;
    padding-top: 12px;
    border-top: 1px solid #eee;
  }

  :global(.section-title:first-child) {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }

  /* Toggle row */
  :global(.toggle-row) {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }

  :global(.toggle-row input[type="checkbox"]) {
    width: 18px;
    height: 18px;
    accent-color: #83F1DC;
  }

  :global(.toggle-row label) {
    margin-bottom: 0;
    font-size: 13px;
    font-weight: 600;
    color: #333;
  }

  /* AI status */
  :global(.ai-status) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 12px;
    margin-bottom: 12px;
  }

  :global(.ai-status.connected) {
    background: #e6fff5;
    color: #0d7a4e;
  }

  :global(.ai-status.disconnected) {
    background: #fff5f5;
    color: #dc3545;
  }

  :global(.ai-status .dot) {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  :global(.ai-status.connected .dot) {
    background: #28a745;
  }

  :global(.ai-status.disconnected .dot) {
    background: #dc3545;
  }

  /* AI settings group */
  :global(.ai-settings-group) {
    transition: opacity 0.2s;
  }

  :global(.ai-settings-group.disabled) {
    opacity: 0.5;
    pointer-events: none;
  }

  /* Collapsible */
  :global(.collapsible-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
    padding: 12px 0;
    border-top: 1px solid #eee;
    margin-top: 16px;
  }

  :global(.collapsible-header .chevron) {
    font-size: 10px;
    color: #999;
  }

  :global(.collapsible-body) {
    padding-top: 8px;
  }

  /* Password field */
  :global(.password-field) {
    position: relative;
  }

  :global(.password-field input) {
    padding-right: 40px;
  }

  :global(.password-toggle) {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    font-size: 12px;
    color: #888;
    cursor: pointer;
    padding: 4px;
    width: auto;
  }

  /* Setup instructions box */
  :global(.setup-box) {
    margin-bottom: 12px;
    padding: 12px;
    background: #f0f7ff;
    border: 1px solid #c8dff5;
    border-radius: 6px;
    font-size: 12px;
    color: #333;
    line-height: 1.6;
  }

  :global(.setup-box strong) {
    display: block;
    margin-bottom: 6px;
    color: #1a1a1a;
  }

  :global(.setup-box code) {
    display: block;
    background: #e8eef5;
    padding: 8px 10px;
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 11px;
    margin: 6px 0;
    word-break: break-all;
  }

  :global(.setup-box .copy-cmd) {
    font-size: 11px;
    color: #3dbda8;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    text-decoration: underline;
    width: auto;
  }
</style>
