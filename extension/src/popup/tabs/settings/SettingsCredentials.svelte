<script lang="ts">
import { PROVIDERS } from '../../../shared/ai-router';
import { LITELLM_DEFAULT_MODEL } from '../../../shared/constants';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import * as Select from '$lib/components/ui/select';
import type { PopupSettings } from '../../lib/storage';
import { getSettingsContext } from './settings-context';

let {
  settings = $bindable(),
}: {
  settings: PopupSettings;
} = $props();

const ctx = getSettingsContext();

let showApiKey = $state(false);
let showClientSecret = $state(false);
let litellmModels: string[] = $state([]);
let litellmModelsLoading = $state(false);

let isLitellm = $derived(settings.aiProvider === 'litellm');
let activeProvider = $derived(PROVIDERS[settings.aiProvider] ?? PROVIDERS.gemini);
let currentApiKey = $derived(settings.aiProvider === 'gemini' ? settings.aiApiKeyGemini : settings.aiApiKeyOpenai);

function setApiKey(val: string) {
  if (settings.aiProvider === 'gemini') settings.aiApiKeyGemini = val;
  else settings.aiApiKeyOpenai = val;
}

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
        ctx.autoSaveImmediate();
      }
    }
  } catch {
    /* server unreachable or timeout */
  } finally {
    clearTimeout(timeout);
    litellmModelsLoading = false;
  }
}
</script>

{#if isLitellm}
  <div class="space-y-1.5 mb-3">
    <Label for="litellmModel">Model</Label>
    <div class="flex items-stretch gap-1.5">
      <Select.Root type="single" bind:value={settings.aiLitellmModel} onValueChange={ctx.autoSaveImmediate}>
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
      oninput={ctx.autoSave}
      onblur={ctx.autoSaveImmediate}
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
      oninput={ctx.autoSave}
      onblur={ctx.autoSaveImmediate}
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
      oninput={ctx.autoSave}
      onblur={ctx.autoSaveImmediate}
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
        oninput={ctx.autoSave}
        onblur={ctx.autoSaveImmediate}
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
        oninput={(e) => { setApiKey((e.target as HTMLInputElement).value); ctx.autoSave(); }}
        onblur={() => { ctx.autoSaveImmediate(); ctx.checkHealth(); }}
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
      <Button variant="link" size="xs" class="h-auto p-0 text-primary underline" onclick={() => ctx.onNavigate('help')}>
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
      oninput={ctx.autoSave}
      onblur={() => { ctx.autoSaveImmediate(); ctx.checkHealth(); }}
      placeholder="http://localhost:3456"
    />
  </div>
{/if}
