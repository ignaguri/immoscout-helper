<script lang="ts">
import { PROVIDERS } from '../../../shared/ai-router';
import { Button } from '$lib/components/ui/button';
import { resetAiUsage } from '../../lib/storage';
import type { PopupSettings } from '../../lib/storage';

let {
  settings,
  aiStatsScored = $bindable(),
  aiStatsSkipped = $bindable(),
  aiPromptTokens = $bindable(),
  aiCompletionTokens = $bindable(),
}: {
  settings: PopupSettings;
  aiStatsScored: number;
  aiStatsSkipped: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
} = $props();

let isLitellm = $derived(settings.aiProvider === 'litellm');
let activeProvider = $derived(PROVIDERS[settings.aiProvider] ?? PROVIDERS.gemini);
let aiCost = $derived(
  isLitellm
    ? 'Managed by proxy'
    : `$${((aiPromptTokens * activeProvider.pricing.input) / 1_000_000 + (aiCompletionTokens * activeProvider.pricing.output) / 1_000_000).toFixed(4)}`,
);

async function handleResetUsage() {
  if (!confirm('Reset AI token usage stats to zero?')) return;
  await resetAiUsage();
  aiPromptTokens = 0;
  aiCompletionTokens = 0;
}
</script>

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
