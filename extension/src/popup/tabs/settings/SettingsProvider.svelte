<script lang="ts">
import { PROVIDERS } from '../../../shared/ai-router';
import { Button } from '$lib/components/ui/button';
import { Label } from '$lib/components/ui/label';
import * as Select from '$lib/components/ui/select';
import * as Alert from '$lib/components/ui/alert';
import StatusPill from '$lib/components/StatusPill.svelte';
import type { PopupSettings } from '../../lib/storage';
import { getSettingsContext } from './settings-context';

let {
  settings = $bindable(),
  aiServerConnected,
}: {
  settings: PopupSettings;
  aiServerConnected: boolean;
} = $props();

const ctx = getSettingsContext();
let copySetupText = $state('Copy command');

let isLitellm = $derived(settings.aiProvider === 'litellm');
let currentApiKey = $derived(settings.aiProvider === 'gemini' ? settings.aiApiKeyGemini : settings.aiApiKeyOpenai);

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

const aiModeOptions = [
  { value: 'direct', label: 'Direct (API key)' },
  { value: 'server', label: 'Server (local)' },
];
const providerOptions = Object.values(PROVIDERS).map((p) => ({ value: p.id, label: p.label }));

async function handleAiModeChange() {
  await ctx.autoSaveImmediate();
  ctx.checkHealth();
}

async function handleProviderChange() {
  if (settings.aiProvider === 'litellm' && settings.aiMode !== 'server') {
    settings.aiMode = 'server';
  }
  await ctx.autoSaveImmediate();
  ctx.checkHealth();
}

function handleCopySetup() {
  navigator.clipboard.writeText('cd server && npm install && npm start').then(() => {
    copySetupText = 'Copied!';
    setTimeout(() => {
      copySetupText = 'Copy command';
    }, 1500);
  });
}
</script>

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
