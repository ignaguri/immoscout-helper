<script lang="ts">
  const version = chrome.runtime.getManifest().version;
</script>

<div class="help-tab">
  <div class="section-title" style="margin-top:0; padding-top:0; border-top:none;">Quick Start</div>

  <div class="help-steps">
    <div class="help-step">
      <span class="step-num">1</span>
      <div>
        <strong>Set up AI</strong>
        <p>Go to <strong>Settings</strong> &rarr; enable <strong>AI Analysis</strong> &rarr; paste your <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Gemini API key</a> (free). Check the status dot turns green.</p>
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
        <strong>Write your message</strong>
        <p>Write a template in the <strong>Activity</strong> tab. Use <code>{'{name}'}</code> and the AI will personalize it per landlord.</p>
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

  <p>The extension uses Google's <strong>Gemini AI</strong> to score listings, write messages, solve captchas, and draft replies. You need a free API key to use it.</p>

  <div class="help-steps" style="margin-top: 10px;">
    <div class="help-step">
      <span class="step-num">1</span>
      <div>
        <strong>Open Google AI Studio</strong>
        <p>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com/app/apikey</a>. Sign in with your Google account.</p>
      </div>
    </div>
    <div class="help-step">
      <span class="step-num">2</span>
      <div>
        <strong>Create an API key</strong>
        <p>Click <strong>"Create API key"</strong>. If prompted, select any Google Cloud project (or let it create one for you).</p>
      </div>
    </div>
    <div class="help-step">
      <span class="step-num">3</span>
      <div>
        <strong>Copy the key</strong>
        <p>Your key will look like <code>AIza...</code>. Click the copy button next to it.</p>
      </div>
    </div>
    <div class="help-step">
      <span class="step-num">4</span>
      <div>
        <strong>Paste it in Settings</strong>
        <p>Go to <strong>Settings</strong> &rarr; enable <strong>AI Analysis</strong> &rarr; paste the key in the <strong>Gemini API Key</strong> field. The green dot confirms it works.</p>
      </div>
    </div>
  </div>

  <div class="info-box" style="margin-top: 12px;">
    <strong>Is it free?</strong>
    <p>Yes. Gemini API has a generous free tier. This extension uses the <strong>Gemini 2.5 Flash</strong> model which is very affordable. Typical usage costs fractions of a cent. You can check your usage in the Settings tab under "AI Usage".</p>
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
  </div>

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

  .version-info {
    margin-top: 20px;
    text-align: center;
    font-size: 10px;
    color: #bbb;
  }
</style>
