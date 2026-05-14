<script lang="ts">
import { onMount } from 'svelte';
import Play from '@lucide/svelte/icons/play';
import Square from '@lucide/svelte/icons/square';
import { PROVIDERS } from '../shared/ai-router';
import { ALARM_NAME } from '../shared/constants';
import type { ActivityLogEntry, ConversationEntry, PendingApprovalItem, QueueItem } from '../shared/types';
import UpdateBanner from './components/UpdateBanner.svelte';
import { checkAiHealth } from './lib/ai-health';
import { getPendingApprovalListings, getStatus, startMonitoring, stopMonitoring } from './lib/messages';
import type { PopupSettings } from './lib/storage';
import { Button } from '$lib/components/ui/button';
import { Badge } from '$lib/components/ui/badge';
import { cn } from '$lib/utils';
import {
  loadActivityLog as loadActivityLogStorage,
  loadAllSettings,
  loadConversations as loadConvStorage,
  loadQueue,
  saveAllSettings,
} from './lib/storage';
import ActivityTab from './tabs/ActivityTab.svelte';
import ConversationsTab from './tabs/ConversationsTab.svelte';
import HelpTab from './tabs/HelpTab.svelte';
import ProfileTab from './tabs/ProfileTab.svelte';
import SettingsTab from './tabs/SettingsTab.svelte';

// State
let settings: PopupSettings = $state({
  searchUrl: '',
  searchUrls: [],
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
  premiumAccount: false,
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
  aiApiKeyGemini: '',
  aiApiKeyOpenai: '',
  aiLitellmClientId: '',
  aiLitellmClientSecret: '',
  aiLitellmTokenUrl: '',
  aiLitellmBaseUrl: '',
  aiLitellmModel: '',
  aiServerUrl: 'http://localhost:3456',
  aiMinScore: 5,
  aiAboutMe: '',
  aiCustomScoringPrompt: '',
  aiCustomMessagePrompt: '',
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

// Activity-log-derived stats
let actSent = $state(0);
let actFilled = $state(0);
let actSkipped = $state(0);
let actFailed = $state(0);

// AI
let aiServerConnected = $state(false);
let aiStatsScored = $state(0);
let aiStatsSkipped = $state(0);
let aiPromptTokens = $state(0);
let aiCompletionTokens = $state(0);

// Activity
let activityLog: ActivityLogEntry[] = $state([]);
let testResultVisible = $state(false);
let testResultContent = $state('');
let testResultIsError = $state(false);
let analyzeResult: any = $state(null);
let lastAnalyzeContext: any = $state(null);

// Queue
let queue: QueueItem[] = $state([]);
let isQueueProcessing = $state(false);
let queueProgressLines: Array<{ text: string; type: string }> = $state([]);

// Pending Approval
let pendingApproval: PendingApprovalItem[] = $state([]);

// Conversations
let conversations: ConversationEntry[] = $state([]);
let convLastCheckTime: string | null = $state(null);
let convUnreadCount = $state(0);

// Tabs definition
const tabs = [
  { id: 'activity', label: 'Activity' },
  { id: 'profile', label: 'Profile' },
  { id: 'replies', label: 'Replies' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' },
];

// Status badge
let statusText = $derived(isMonitoring ? 'Active' : 'Stopped');
let statusVariant = $derived<'success' | 'secondary'>(isMonitoring ? 'success' : 'secondary');

async function updateStats() {
  try {
    const status = await getStatus();
    statsSentHour = status.messagesThisHour || 0;
    statsSentTotal = status.totalMessagesSent || 0;
    statsSeenCount = status.seenListingsCount || 0;
    statsSyncedCount = status.syncedContacted || 0;
    actSent = status.activitySent || 0;
    actFilled = status.activityFilled || 0;
    actSkipped = status.activitySkipped || 0;
    actFailed = status.activityFailed || 0;

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
  aiServerConnected = await checkAiHealth(settings);
}

async function handleToggle() {
  if (isMonitoring) {
    const response = await stopMonitoring();
    if (response?.success) {
      isMonitoring = false;
    }
  } else {
    if (!settings.searchUrls.some((u) => u.trim())) {
      alert('Please enter a search URL');
      activeTab = 'activity';
      return;
    }
    const currentApiKey = settings.aiProvider === 'gemini' ? settings.aiApiKeyGemini : settings.aiApiKeyOpenai;
    const needsKey = settings.aiMode === 'direct' && !currentApiKey;
    const needsServer = settings.aiMode === 'server' && !settings.aiServerUrl;
    if (needsKey || needsServer) {
      const providerLabel = (PROVIDERS[settings.aiProvider] ?? PROVIDERS.gemini).label;
      alert(
        needsKey
          ? `Please configure your ${providerLabel} API key in Settings`
          : 'Please configure your AI server URL in Settings',
      );
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

async function loadPendingApproval() {
  try {
    pendingApproval = await getPendingApprovalListings();
  } catch {
    pendingApproval = [];
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
  loadPendingApproval();
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
      // Deduplicate: skip if an entry with the same _id already exists (race between storage load and runtime message)
      if (request._id && activityLog.some((e) => e._id === request._id)) {
        // already loaded from storage — skip
      } else {
        activityLog = [...activityLog, request];
      }
      // Refresh pending approval when activity updates
      loadPendingApproval();
      // Mirror into queue progress live feed while queue is running
      if (isQueueProcessing) {
        if (request.lastResult) {
          const label = request.lastTitle || request.lastId || '?';
          const map: Record<string, { text: string; type: string }> = {
            success: { text: `✓ Sent: ${label}`, type: 'result-success' },
            skipped: { text: `→ Skipped: ${label}`, type: 'wait' },
            failed: { text: `✗ Failed: ${label}`, type: 'result-failed' },
          };
          const line = map[request.lastResult];
          if (line) appendQueueProgress(line.text, line.type);
        } else if (request.message && request.type) {
          appendQueueProgress(request.message, request.type);
        }
      }
      // Refresh queue list when items are processed
      if (request.lastResult || request.message?.includes('Queue empty')) {
        loadQueue().then((q) => {
          queue = q;
        });
      }
    } else if (request.action === 'duplicateDecisionResolved') {
      const outcomeLabel =
        request.outcome === 'send'
          ? 'User chose: Send Anyway'
          : request.outcome === 'skip'
            ? 'User chose: Skip'
            : 'No response — deferred to end of queue';
      activityLog = activityLog.map((e) =>
        e.duplicateDecisionId === request.decisionId
          ? {
              ...e,
              duplicateDecisionId: undefined,
              message: `"${e.duplicateLandlordName || 'Duplicate landlord'}": ${outcomeLabel}`,
            }
          : e,
      );
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

<div class="flex h-screen flex-col overflow-hidden">
  <!-- Header -->
  <div
    class="flex items-center justify-between px-5 py-4 text-foreground"
    style="background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary-deep)) 100%);"
  >
    <div class="flex flex-col">
      <h1 class="text-base font-semibold m-0">Apartment Messenger</h1>
      <span class="text-[11px] opacity-70 mt-0.5">ImmoScout24 Auto-Sender</span>
    </div>
    <Badge variant={statusVariant} class="bg-background/60">{statusText}</Badge>
  </div>

  <UpdateBanner />

  <!-- Toggle Button -->
  <div class="px-5 pt-4 pb-1">
    <Button
      class="w-full h-12 text-[15px] font-semibold"
      variant={isMonitoring ? 'destructive' : 'default'}
      onclick={handleToggle}
      disabled={!isMonitoring && !aiServerConnected}
      title={!isMonitoring && !aiServerConnected ? 'AI connection not available — check Settings' : ''}
    >
    {#if isMonitoring}
      <Square aria-hidden="true" />
      Stop
    {:else}
      <Play aria-hidden="true" />
      Start
    {/if}
    </Button>
  </div>
  {#if !isMonitoring && !aiServerConnected}
    <div class="mx-5 mb-3 text-center text-[11px] text-warning">
      AI not connected — open Settings to configure.
    </div>
  {/if}

  <!-- Stats Bar -->
  <div class="flex justify-around bg-background px-5 pt-3 pb-2">
    <div class="flex flex-col items-center">
      <span class="text-sm font-semibold text-foreground">{statsSentHour}</span>
      <span class="text-[11px] text-muted-foreground">/hour</span>
    </div>
    <div class="flex flex-col items-center">
      <span class="text-sm font-semibold text-foreground">{actSent}</span>
      <span class="text-[11px] text-muted-foreground">Sent</span>
    </div>
    <div class="flex flex-col items-center">
      <span class="text-sm font-semibold text-foreground">{actSkipped}</span>
      <span class="text-[11px] text-muted-foreground">Skipped</span>
    </div>
    <div class="flex flex-col items-center">
      <span class="text-sm font-semibold text-foreground">{actFailed}</span>
      <span class="text-[11px] text-muted-foreground">Failed</span>
    </div>
  </div>
  <div class="flex justify-center gap-3 border-b border-border bg-background px-5 pb-2">
    <span class="text-[11px] text-muted-foreground">{statsSeenCount} seen</span>
    {#if actFilled > 0}<span class="text-[11px] text-muted-foreground">{actFilled} pending review</span>{/if}
    <span class="text-[11px] text-muted-foreground">Next: {statsNextCheck}</span>
  </div>

  <!-- Tabs -->
  <div class="flex border-b border-border bg-background">
    {#each tabs as tab}
      <button
        type="button"
        class={cn(
          'flex-1 cursor-pointer border-0 border-b-2 bg-transparent px-2 py-3 text-xs font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
          activeTab === tab.id
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        )}
        onclick={() => activeTab = tab.id}
      >
        {tab.label}
        {#if tab.id === 'replies' && convUnreadCount > 0}
          <span class="ml-1 inline-block rounded-full bg-destructive px-1.5 py-0 align-top text-[9px] font-semibold text-destructive-foreground">
            {convUnreadCount}
          </span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Tab Content -->
  <div class="flex-1 overflow-hidden">
    {#if activeTab === 'activity'}
      <div class="h-full overflow-y-auto bg-background px-5 py-4">
        <ActivityTab
          bind:settings
          {settingsLoaded}
          bind:activityLog
          bind:testResultVisible
          bind:testResultContent
          bind:testResultIsError
          bind:analyzeResult
          bind:lastAnalyzeContext
          bind:queue
          bind:isQueueProcessing
          bind:queueProgressLines
          bind:pendingApproval
          {isMonitoring}
        />
      </div>
    {:else if activeTab === 'profile'}
      <div class="h-full overflow-y-auto bg-background px-5 py-4">
        <ProfileTab bind:settings {settingsLoaded} />
      </div>
    {:else if activeTab === 'replies'}
      <div class="h-full overflow-y-auto bg-background px-5 py-4">
        <ConversationsTab
          bind:conversations
          bind:lastCheckTime={convLastCheckTime}
          bind:unreadCount={convUnreadCount}
          aiMode={settings.aiMode}
        />
      </div>
    {:else if activeTab === 'settings'}
      <div class="h-full overflow-y-auto bg-background px-5 py-4">
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
      <div class="h-full overflow-y-auto bg-background px-5 py-4">
        <HelpTab />
      </div>
    {/if}
  </div>
</div>
