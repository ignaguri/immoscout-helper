<script lang="ts">
import {
  DEFAULT_MESSAGE_TEMPLATE,
  DEFAULT_SCORING_TEMPLATE,
  MESSAGE_PLACEHOLDERS,
  type PlaceholderInfo,
  SCORING_PLACEHOLDERS,
  validateTemplate,
} from '../../../shared/prompts';
import { Button } from '$lib/components/ui/button';
import { Textarea } from '$lib/components/ui/textarea';
import { Label } from '$lib/components/ui/label';
import * as Alert from '$lib/components/ui/alert';
import Section from '$lib/components/Section.svelte';
import { cn } from '$lib/utils';
import type { PopupSettings } from '../../lib/storage';
import { getSettingsContext } from './settings-context';

let {
  settings = $bindable(),
}: {
  settings: PopupSettings;
} = $props();

const ctx = getSettingsContext();

type CustomPromptField = 'aiCustomScoringPrompt' | 'aiCustomMessagePrompt';
function setCustomPrompt(field: CustomPromptField, value: string) {
  settings[field] = value;
  ctx.autoSaveImmediate();
}

let activePlaceholder = $state<PlaceholderInfo | null>(null);
function togglePlaceholder(ph: PlaceholderInfo) {
  activePlaceholder = activePlaceholder?.name === ph.name ? null : ph;
}

let scoringUnknown = $derived(validateTemplate(settings.aiCustomScoringPrompt || '', SCORING_PLACEHOLDERS).unknown);
let messageUnknown = $derived(validateTemplate(settings.aiCustomMessagePrompt || '', MESSAGE_PLACEHOLDERS).unknown);
</script>

<Section title="Style guide">
  <div class="space-y-3">
    <div class="space-y-1.5">
      <Label for="aiAboutMe">About Me (for AI context)</Label>
      <Textarea
        id="aiAboutMe"
        bind:value={settings.aiAboutMe}
        oninput={ctx.autoSave}
        onblur={ctx.autoSaveImmediate}
        placeholder="Tell the AI about yourself…"
        class="min-h-15"
      />
    </div>

    <div class="space-y-1.5">
      <Label for="messageTemplate">Message Template</Label>
      <Textarea
        id="messageTemplate"
        bind:value={settings.messageTemplate}
        oninput={ctx.autoSave}
        onblur={ctx.autoSaveImmediate}
        placeholder={`Sehr geehrte(r) {name},\n\nich interessiere mich…`}
        class="min-h-20"
      />
      <p class="text-xs text-muted-foreground m-0">
        Write a sample message to guide the AI's tone. Use {'{name}'} for landlord greeting.
      </p>
    </div>
  </div>
</Section>

<Section title="Advanced prompts">
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
          oninput={ctx.autoSave}
          onblur={ctx.autoSaveImmediate}
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
              class={cn(
                'rounded border px-1.5 py-0.5 font-mono text-[10px]',
                activePlaceholder?.name === ph.name
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-muted',
              )}
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
</Section>
