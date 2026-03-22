<script lang="ts">
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

    // Extension & browser info
    const manifest = chrome.runtime.getManifest();
    const ua = navigator.userAgent;

    // Settings (sanitized)
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

    // Stats
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

    // Queue
    const queue = allData.manualQueue ?? [];
    const pendingApproval = allData.pendingApprovalListings ?? [];
    const blacklisted = allData.blacklistedListings ?? [];

    // Activity log (last 30 entries)
    const activityLog: any[] = allData.activityLog ?? [];
    const recentLog = activityLog.slice(-30);

    // Conversations metadata (no message content)
    const conversations: any[] = allData.conversations ?? [];
    const convSummary = {
      total: conversations.length,
      unreadCount: allData.convUnreadCount ?? 0,
      lastCheck: allData.convLastCheck ? new Date(allData.convLastCheck).toISOString() : 'never',
    };

    // Rate limit state
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
</script>

<div class="help-tab">
  <div class="section-title" style="margin-top:0; padding-top:0; border-top:none;">Quick Start</div>

  <div class="help-steps">
    <div class="help-step">
      <span class="step-num">1</span>
      <div>
        <strong>Set up AI</strong>
        <p>Go to <strong>Settings</strong> &rarr; pick your AI provider &rarr; paste your API key. Check the status dot turns green. Use <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Gemini</a> (free) or <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI</a>.</p>
      </div>
    </div>
    <div class="help-step">
      <span class="step-num">2</span>
      <div>
        <strong>Paste a search URL</strong>
        <p>Open <a href="https://www.immobilienscout24.de" target="_blank" rel="noopener">ImmoScout24</a>, set your filters, copy the URL and paste it in the <strong>Activity</strong> tab.</p>
      </div>
    </div>
    <div class="help-step">
      <span class="step-num">3</span>
      <div>
        <strong>Customize your style (optional)</strong>
        <p>Open <strong>Settings</strong> &rarr; <strong>Message Style Guide</strong> to write a sample message. The AI uses it as tone inspiration. Use <code>{'{name}'}</code> for landlord greeting.</p>
      </div>
    </div>
    <div class="help-step">
      <span class="step-num">4</span>
      <div>
        <strong>Fill your profile</strong>
        <p>Go to <strong>Profile</strong> and fill in your details. The AI uses this to write better messages and score listings for you.</p>
      </div>
    </div>
    <div class="help-step">
      <span class="step-num">5</span>
      <div>
        <strong>Press Start</strong>
        <p>Hit the big green button. The extension will scan for new listings, score them with AI, and send messages automatically.</p>
      </div>
    </div>
  </div>

  <div class="section-title" id="api-key-guide">Getting Your API Key</div>

  <p>The extension uses AI to score listings, write messages, solve captchas, and draft replies. Choose your preferred provider in Settings.</p>

  <div class="mode-box" style="margin-top: 10px; margin-bottom: 12px;">
    <div class="mode">
      <strong>Gemini (Google) &mdash; Recommended</strong>
      <p>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com/app/apikey</a>, sign in, click <strong>"Create API key"</strong>. Your key looks like <code>AIza...</code>. Free tier is very generous.</p>
    </div>
    <div class="mode">
      <strong>OpenAI (GPT-4o)</strong>
      <p>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a>, click <strong>"Create new secret key"</strong>. Your key looks like <code>sk-...</code>. Requires a paid account with credits.</p>
    </div>
  </div>

  <div class="help-steps" style="margin-top: 10px;">
    <div class="help-step">
      <span class="step-num">1</span>
      <div>
        <strong>Pick a provider</strong>
        <p>Go to <strong>Settings</strong> &rarr; <strong>AI Provider</strong> and select Gemini or OpenAI.</p>
      </div>
    </div>
    <div class="help-step">
      <span class="step-num">2</span>
      <div>
        <strong>Get your API key</strong>
        <p>Follow the provider link above to create a key. Copy it to your clipboard.</p>
      </div>
    </div>
    <div class="help-step">
      <span class="step-num">3</span>
      <div>
        <strong>Paste it in Settings</strong>
        <p>Go to <strong>Settings</strong> &rarr; paste the key in the API Key field. The green dot confirms it works.</p>
      </div>
    </div>
  </div>

  <div class="info-box" style="margin-top: 12px;">
    <strong>Cost?</strong>
    <p>Both providers are very affordable. <strong>Gemini 2.5 Flash</strong> has a free tier; typical usage costs fractions of a cent. <strong>GPT-4o-mini</strong> is also very cheap but requires a paid OpenAI account. Check your usage in Settings &rarr; AI Usage.</p>
  </div>

  <div class="section-title">AI Modes</div>

  <div class="mode-box">
    <div class="mode">
      <strong>Direct (Gemini API)</strong>
      <p>Calls Google's Gemini API directly from the extension. Only needs an API key &mdash; no server, no setup. <strong>Recommended for most users.</strong></p>
    </div>
    <div class="mode">
      <strong>Server (local)</strong>
      <p>Routes AI calls through a local Express server. For developers who want to customize prompts or use the server's PDF generation features.</p>
    </div>
  </div>

  <div class="section-title">Tips</div>

  <ul class="tips-list">
    <li>The extension runs as a <strong>side panel</strong> &mdash; click the extension icon to open it alongside any page.</li>
    <li>Use <strong>Send Mode: Manual</strong> to fill forms without auto-submitting (good for reviewing messages first).</li>
    <li>Set a higher <strong>Min Score</strong> (7-8) if you only want the AI to contact top matches.</li>
    <li>The <strong>About Me</strong> field in Settings gives the AI extra context &mdash; mention deal-breakers, must-haves, or your situation.</li>
    <li><strong>Rate limiting</strong> protects you from sending too many messages. Default: 10/hour with 30s delay between sends.</li>
    <li>If a captcha appears, the AI will try to solve it automatically (up to 2 attempts).</li>
    <li>Check the <strong>Activity</strong> log to see what the extension is doing in real time.</li>
  </ul>

  <div class="section-title">Features</div>

  <div class="feature-list">
    <div class="feature">
      <span class="feature-icon">&#x1F50D;</span>
      <div>
        <strong>Auto-Monitoring</strong>
        <p>Periodically scans your ImmoScout24 search for new listings. Configurable interval (default: 60s). Runs in the background via service worker.</p>
      </div>
    </div>

    <div class="feature">
      <span class="feature-icon">&#x1F916;</span>
      <div>
        <strong>AI Scoring</strong>
        <p>Each listing is scored 1-10 based on your profile and preferences. Listings below your minimum score are skipped. Saves time and API calls.</p>
      </div>
    </div>

    <div class="feature">
      <span class="feature-icon">&#x2709;</span>
      <div>
        <strong>Auto-Messaging</strong>
        <p>Fills the contact form with your message, personalizes the greeting with the landlord's name, and submits automatically. Handles captchas with AI.</p>
      </div>
    </div>

    <div class="feature">
      <span class="feature-icon">&#x1F4AC;</span>
      <div>
        <strong>Conversation Replies</strong>
        <p>Tracks your ImmoScout24 conversations. Detects unread landlord replies and drafts AI-powered responses. Handles appointment scheduling.</p>
      </div>
    </div>

    <div class="feature">
      <span class="feature-icon">&#x1F4CB;</span>
      <div>
        <strong>Manual Queue</strong>
        <p>Browse listings yourself, add them to a queue, and process them in batch. Great for cherry-picking specific apartments.</p>
      </div>
    </div>

    <div class="feature">
      <span class="feature-icon">&#x1F464;</span>
      <div>
        <strong>Profile</strong>
        <p>Your personal details (name, job, income, etc.) are used by the AI to write compelling, personalized messages that stand out.</p>
      </div>
    </div>

    <div class="feature">
      <span class="feature-icon">&#x1F4C4;</span>
      <div>
        <strong>Document Generation</strong>
        <p>Generates a Selbstauskunft (tenant self-disclosure) PDF with your profile data pre-filled. Available only in <strong>Server mode</strong> &mdash; requires the local AI server running. Find it in conversation cards via the "Generate Docs" button.</p>
      </div>
    </div>
  </div>

  <div class="section-title">Report a Bug</div>

  <p>Something not working? Copy a bug report with your current settings, stats, and recent activity log to share with the developer. <strong>API keys are masked</strong> and no personal messages are included.</p>

  <button class="btn btn-test bug-report-btn" onclick={generateBugReport} disabled={bugReportGenerating}>
    {copyBugText}
  </button>

  <div class="version-info">Apartment Messenger v{version}</div>
</div>

<style>
  .help-tab {
    font-size: 12px;
    color: #444;
    line-height: 1.5;
  }

  .help-tab p {
    margin: 2px 0 0 0;
    color: #666;
  }

  .help-tab a {
    color: #3dbda8;
    text-decoration: none;
  }

  .help-tab a:hover {
    text-decoration: underline;
  }

  .help-tab code {
    background: #f0f0f0;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 11px;
    font-family: 'SF Mono', Monaco, monospace;
  }

  .help-steps {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .help-step {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #83F1DC;
    color: #1a1a1a;
    font-weight: 700;
    font-size: 12px;
    margin-top: 1px;
  }

  .feature-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .feature {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .feature-icon {
    font-size: 18px;
    min-width: 24px;
    text-align: center;
    margin-top: 1px;
  }

  .tips-list {
    margin: 0;
    padding-left: 18px;
  }

  .tips-list li {
    margin-bottom: 6px;
    color: #555;
  }

  .mode-box {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mode {
    padding: 10px 12px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #eee;
  }

  .mode p {
    margin: 2px 0 0 0;
  }

  .info-box {
    padding: 10px 12px;
    background: #f0f7ff;
    border: 1px solid #c8dff5;
    border-radius: 6px;
  }

  .info-box strong {
    display: block;
    margin-bottom: 2px;
  }

  .bug-report-btn {
    width: 100%;
    margin-top: 8px;
  }

  .version-info {
    margin-top: 20px;
    text-align: center;
    font-size: 10px;
    color: #bbb;
  }
</style>
