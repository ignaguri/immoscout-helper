<script lang="ts">
import Section from '$lib/components/Section.svelte';
import { Button } from '$lib/components/ui/button';
import * as Alert from '$lib/components/ui/alert';

const version = chrome.runtime.getManifest().version;

let copyBugText = $state('Copy Bug Report to Clipboard');
let bugReportGenerating = $state(false);

function maskKey(key: string | undefined | null): string {
  if (!key) return '(not set)';
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

async function generateBugReport() {
  bugReportGenerating = true;
  try {
    const allData = await chrome.storage.local.get(null);

    const manifest = chrome.runtime.getManifest();
    const ua = navigator.userAgent;

    const settingsSummary = {
      aiMode: allData.aiMode ?? 'direct',
      aiProvider: allData.aiProvider ?? 'gemini',
      aiApiKeyGemini: maskKey(allData.aiApiKeyGemini),
      aiApiKeyOpenai: maskKey(allData.aiApiKeyOpenai),
      aiMinScore: allData.aiMinScore ?? 5,
      aiEnabled: allData.aiEnabled ?? true,
      aiServerUrl: allData.aiServerUrl ?? 'http://localhost:3456',
      checkInterval: allData.checkInterval ?? 60,
      rateLimit: allData.rateLimit ?? 10,
      minDelay: allData.minDelay ?? 30,
      autoSendMode: allData.autoSendMode ?? 'auto',
      searchUrls: allData.searchUrls ?? allData.searchUrl ?? '(not set)',
      convCheckInterval: allData.convCheckInterval ?? 0,
    };

    const stats = {
      totalMessagesSent: allData.totalMessagesSent ?? 0,
      seenListings: Array.isArray(allData.seenListings) ? allData.seenListings.length : 0,
      contactedLandlords: Array.isArray(allData.contactedLandlords) ? allData.contactedLandlords.length : 0,
      syncedContactedCount: allData.syncedContactedCount ?? 0,
      aiListingsScored: allData.aiListingsScored ?? 0,
      aiListingsSkipped: allData.aiListingsSkipped ?? 0,
      aiPromptTokens: allData.aiUsagePromptTokens ?? 0,
      aiCompletionTokens: allData.aiUsageCompletionTokens ?? 0,
      isMonitoring: allData.isMonitoring ?? false,
      isQueueProcessing: allData.isQueueProcessing ?? false,
    };

    const queue = allData.manualQueue ?? [];
    const pendingApproval = allData.pendingApprovalListings ?? [];
    const blacklisted = allData.blacklistedListings ?? [];

    const activityLog: any[] = allData.activityLog ?? [];
    const recentLog = activityLog.slice(-30);

    const conversations: any[] = allData.conversations ?? [];
    const convSummary = {
      total: conversations.length,
      unreadCount: allData.convUnreadCount ?? 0,
      lastCheck: allData.convLastCheck ? new Date(allData.convLastCheck).toISOString() : 'never',
    };

    const rateState = {
      lastMessageTime: allData.rateLastMessageTime ? new Date(allData.rateLastMessageTime).toISOString() : 'none',
      messageCount: allData.rateMessageCount ?? 0,
      countResetTime: allData.rateCountResetTime ? new Date(allData.rateCountResetTime).toISOString() : 'none',
      lastCheckTime: allData.lastCheckTime ? new Date(allData.lastCheckTime).toISOString() : 'none',
    };

    const report = [
      `=== Bug Report — Apartment Messenger v${manifest.version} ===`,
      `Generated: ${new Date().toISOString()}`,
      `User Agent: ${ua}`,
      '',
      '--- Settings ---',
      JSON.stringify(settingsSummary, null, 2),
      '',
      '--- Stats ---',
      JSON.stringify(stats, null, 2),
      '',
      '--- Rate Limit State ---',
      JSON.stringify(rateState, null, 2),
      '',
      '--- Conversations ---',
      JSON.stringify(convSummary, null, 2),
      '',
      `--- Queue (${queue.length} items) ---`,
      queue.length > 0 ? JSON.stringify(queue.slice(-10), null, 2) : '(empty)',
      '',
      `--- Pending Approval (${pendingApproval.length} items) ---`,
      pendingApproval.length > 0 ? JSON.stringify(pendingApproval.slice(-10), null, 2) : '(empty)',
      '',
      `--- Blacklisted (${blacklisted.length} items) ---`,
      blacklisted.length > 0 ? JSON.stringify(blacklisted.slice(-10), null, 2) : '(empty)',
      '',
      `--- Activity Log (last ${recentLog.length} of ${activityLog.length}) ---`,
      ...recentLog.map((e: any) => {
        const ts = e.timestamp ? new Date(e.timestamp).toISOString() : '?';
        return `[${ts}] [${e.type ?? '?'}] ${e.message ?? JSON.stringify(e)}`;
      }),
      '',
      '=== End of Bug Report ===',
    ].join('\n');

    await navigator.clipboard.writeText(report);
    copyBugText = 'Copied!';
    setTimeout(() => {
      copyBugText = 'Copy Bug Report to Clipboard';
    }, 2500);
  } catch (err: any) {
    copyBugText = `Failed: ${err.message}`;
    setTimeout(() => {
      copyBugText = 'Copy Bug Report to Clipboard';
    }, 3000);
  } finally {
    bugReportGenerating = false;
  }
}

const steps1 = [
  {
    title: 'Set up AI',
    body: 'Go to Settings → pick your AI provider → paste your API key. Check the status dot turns green. Use Gemini (free) or OpenAI.',
  },
  {
    title: 'Paste a search URL',
    body: 'Open ImmoScout24, set your filters, copy the URL and paste it in the Activity tab.',
  },
  {
    title: 'Customize your style (optional)',
    body: 'Open Settings → Message Style Guide to write a sample message. The AI uses it as tone inspiration.',
  },
  {
    title: 'Fill your profile',
    body: 'Go to Profile and fill in your details. The AI uses this to write better messages and score listings for you.',
  },
  {
    title: 'Press Start',
    body: 'Hit the big green button. The extension will scan for new listings, score them with AI, and send messages automatically.',
  },
];

const apiSteps = [
  { title: 'Pick a provider', body: 'Go to Settings → AI Provider and select Gemini or OpenAI.' },
  { title: 'Get your API key', body: 'Follow the provider link above to create a key. Copy it to your clipboard.' },
  { title: 'Paste it in Settings', body: 'Go to Settings → paste the key in the API Key field. The green dot confirms it works.' },
];

const features = [
  ['🔍', 'Auto-Monitoring', 'Periodically scans your ImmoScout24 search for new listings. Configurable interval (default: 60s). Runs in the background via service worker.'],
  ['🤖', 'AI Scoring', 'Each listing is scored 1-10 based on your profile and preferences. Listings below your minimum score are skipped.'],
  ['✉', 'Auto-Messaging', 'Fills the contact form with your message, personalizes the greeting with the landlord\'s name, and submits automatically. Handles captchas with AI.'],
  ['💬', 'Conversation Replies', 'Tracks your ImmoScout24 conversations. Detects unread landlord replies and drafts AI-powered responses.'],
  ['📋', 'Manual Queue', 'Browse listings yourself, add them to a queue, and process them in batch.'],
  ['👤', 'Profile', 'Your personal details (name, job, income, etc.) are used by the AI to write compelling, personalized messages.'],
  ['📄', 'Document Generation', 'Generates a Selbstauskunft (tenant self-disclosure) PDF with your profile data pre-filled. Available only in Server mode.'],
  ['📦', 'Save & Export Listings', 'Creates full offline listing snapshots — photos included. Click the 📦 Export control on listing pages or 📦 Save snapshot in conversations.'],
];
</script>

<div class="text-xs leading-relaxed text-foreground/85 space-y-4">
  <Section title="Quick Start">
    <ol class="space-y-3 list-none pl-0 m-0">
      {#each steps1 as step, i}
        <li class="flex items-start gap-2.5">
          <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{i + 1}</span>
          <div>
            <strong>{step.title}</strong>
            <p class="text-muted-foreground mt-0.5 m-0">{step.body}</p>
          </div>
        </li>
      {/each}
    </ol>
  </Section>

  <Section title="Getting Your API Key">
    <p class="text-muted-foreground m-0">The extension uses AI to score listings, write messages, solve captchas, and draft replies.</p>

    <div class="mt-2.5 flex flex-col gap-2.5">
      <div class="rounded-md border border-border bg-muted/40 px-3 py-2.5">
        <strong>Gemini (Google) — Recommended</strong>
        <p class="text-muted-foreground mt-0.5 m-0">
          Go to <a class="text-primary hover:underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com/app/apikey</a>,
          sign in, click "Create API key". Free tier is very generous.
        </p>
      </div>
      <div class="rounded-md border border-border bg-muted/40 px-3 py-2.5">
        <strong>OpenAI (GPT-4o)</strong>
        <p class="text-muted-foreground mt-0.5 m-0">
          Go to <a class="text-primary hover:underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a>,
          click "Create new secret key". Requires a paid account with credits.
        </p>
      </div>
    </div>

    <ol class="mt-3 space-y-3 list-none pl-0 m-0">
      {#each apiSteps as step, i}
        <li class="flex items-start gap-2.5">
          <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{i + 1}</span>
          <div>
            <strong>{step.title}</strong>
            <p class="text-muted-foreground mt-0.5 m-0">{step.body}</p>
          </div>
        </li>
      {/each}
    </ol>

    <Alert.Root class="mt-3 border-info/40 bg-info/10 text-info">
      <Alert.Title>Cost?</Alert.Title>
      <Alert.Description class="text-info/90">
        Both providers are very affordable. Gemini 2.5 Flash has a free tier; typical usage costs fractions of a cent.
        GPT-4o-mini is also very cheap but requires a paid OpenAI account.
      </Alert.Description>
    </Alert.Root>
  </Section>

  <Section title="AI Modes">
    <div class="flex flex-col gap-2.5">
      <div class="rounded-md border border-border bg-muted/40 px-3 py-2.5">
        <strong>Direct (Gemini API)</strong>
        <p class="text-muted-foreground mt-0.5 m-0">
          Calls Google's Gemini API directly from the extension. Only needs an API key — no server, no setup.
          <strong>Recommended for most users.</strong>
        </p>
      </div>
      <div class="rounded-md border border-border bg-muted/40 px-3 py-2.5">
        <strong>Server (local)</strong>
        <p class="text-muted-foreground mt-0.5 m-0">
          Routes AI calls through a local Express server. For developers who want to customize prompts or use the server's PDF generation features.
        </p>
      </div>
    </div>
  </Section>

  <Section title="Tips">
    <ul class="list-disc pl-5 space-y-1.5 m-0 text-muted-foreground">
      <li>The extension runs as a side panel — click the extension icon to open it alongside any page.</li>
      <li>Use <strong>Send Mode: Manual</strong> to fill forms without auto-submitting.</li>
      <li>Set a higher <strong>Min Score</strong> (7-8) if you only want the AI to contact top matches.</li>
      <li>The <strong>About Me</strong> field in Settings gives the AI extra context — mention deal-breakers, must-haves, or your situation.</li>
      <li>Rate limiting protects you from sending too many messages. Default: 10/hour with 30s delay.</li>
      <li>If a captcha appears, the AI will try to solve it automatically (up to 2 attempts).</li>
    </ul>
  </Section>

  <Section title="Features">
    <div class="flex flex-col gap-3">
      {#each features as [icon, title, body]}
        <div class="flex items-start gap-2.5">
          <span class="text-base leading-none w-6 text-center mt-0.5">{icon}</span>
          <div>
            <strong>{title}</strong>
            <p class="text-muted-foreground mt-0.5 m-0">{body}</p>
          </div>
        </div>
      {/each}
    </div>
  </Section>

  <Section title="Report a Bug">
    <p class="text-muted-foreground m-0">
      Something not working? Copy a bug report with your current settings, stats, and recent activity log to share with the developer.
      <strong>API keys are masked</strong> and no personal messages are included.
    </p>
    <Button class="mt-2 w-full" onclick={generateBugReport} loading={bugReportGenerating} disabled={bugReportGenerating}>
      {copyBugText}
    </Button>
  </Section>

  <p class="mt-5 text-center text-[10px] text-muted-foreground/70">Apartment Messenger v{version}</p>
</div>
