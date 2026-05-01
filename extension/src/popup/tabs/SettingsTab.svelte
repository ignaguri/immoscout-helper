<script lang="ts">
import { onMount } from 'svelte';
import { SETTINGS_ACTIVE_SUBTAB_KEY } from '../../shared/constants';
import { checkAiHealth } from '../lib/ai-health';
import type { PopupSettings } from '../lib/storage';
import { saveAllSettings } from '../lib/storage';
import * as Tabs from '$lib/components/ui/tabs';
import { setSettingsContext } from './settings/settings-context';
import SettingsProvider from './settings/SettingsProvider.svelte';
import SettingsCredentials from './settings/SettingsCredentials.svelte';
import SettingsPrompts from './settings/SettingsPrompts.svelte';
import SettingsUsage from './settings/SettingsUsage.svelte';
import SettingsNotifications from './settings/SettingsNotifications.svelte';
import SettingsMonitoring from './settings/SettingsMonitoring.svelte';
import SettingsData from './settings/SettingsData.svelte';

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

const SUB_TABS = ['provider', 'credentials', 'prompts', 'usage', 'notifications', 'monitoring', 'data'] as const;
type SubTab = (typeof SUB_TABS)[number];

let activeSubTab = $state<SubTab>('provider');

onMount(async () => {
  const stored = await chrome.storage.local.get([SETTINGS_ACTIVE_SUBTAB_KEY]);
  const v = stored[SETTINGS_ACTIVE_SUBTAB_KEY];
  if (typeof v === 'string' && (SUB_TABS as readonly string[]).includes(v)) {
    activeSubTab = v as SubTab;
  }
});

function handleSubTabChange(v: string) {
  activeSubTab = v as SubTab;
  chrome.storage.local.set({ [SETTINGS_ACTIVE_SUBTAB_KEY]: v }).catch(() => {});
}

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

async function checkHealth() {
  aiServerConnected = await checkAiHealth(settings);
}

setSettingsContext({
  autoSave,
  autoSaveImmediate,
  checkHealth,
  onNavigate: (tab: string) => onNavigate(tab),
});
</script>

<Tabs.Root value={activeSubTab} onValueChange={handleSubTabChange} class="w-full">
  <Tabs.List variant="line" class="w-full overflow-x-auto">
    <Tabs.Trigger value="provider">Provider</Tabs.Trigger>
    <Tabs.Trigger value="credentials">Credentials</Tabs.Trigger>
    <Tabs.Trigger value="prompts">Prompts</Tabs.Trigger>
    <Tabs.Trigger value="usage">Usage</Tabs.Trigger>
    <Tabs.Trigger value="notifications">Notifications</Tabs.Trigger>
    <Tabs.Trigger value="monitoring">Monitoring</Tabs.Trigger>
    <Tabs.Trigger value="data">Data</Tabs.Trigger>
  </Tabs.List>

  <Tabs.Content value="provider" class="mt-4">
    <SettingsProvider bind:settings {aiServerConnected} />
  </Tabs.Content>
  <Tabs.Content value="credentials" class="mt-4">
    <SettingsCredentials bind:settings />
  </Tabs.Content>
  <Tabs.Content value="prompts" class="mt-4">
    <SettingsPrompts bind:settings />
  </Tabs.Content>
  <Tabs.Content value="usage" class="mt-4">
    <SettingsUsage
      {settings}
      bind:aiStatsScored
      bind:aiStatsSkipped
      bind:aiPromptTokens
      bind:aiCompletionTokens
    />
  </Tabs.Content>
  <Tabs.Content value="notifications" class="mt-4">
    <SettingsNotifications />
  </Tabs.Content>
  <Tabs.Content value="monitoring" class="mt-4">
    <SettingsMonitoring bind:settings />
  </Tabs.Content>
  <Tabs.Content value="data" class="mt-4">
    <SettingsData {stats} />
  </Tabs.Content>
</Tabs.Root>
