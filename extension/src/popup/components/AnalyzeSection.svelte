<script lang="ts">
import { geminiGenerateText, geminiGenerateWithImage } from '../../shared/gemini';
import {
  buildScoringPrompt,
  buildMessagePrompt,
  formatListingForPrompt,
  parseScoreJSON,
  CAPTCHA_SYSTEM_PROMPT,
  CAPTCHA_USER_PROMPT,
} from '../../shared/prompts';
import type { PopupSettings } from '../lib/storage';
import { trackTokenUsage } from '../lib/storage';

let {
  settings,
  testResultVisible = $bindable(false),
  testResultContent = $bindable(''),
  testResultIsError = $bindable(false),
  analyzeResult = $bindable<any>(null),
  lastAnalyzeContext = $bindable<any>(null),
  appendToResult,
  showTestResult,
}: {
  settings: PopupSettings;
  testResultVisible: boolean;
  testResultContent: string;
  testResultIsError: boolean;
  analyzeResult: any;
  lastAnalyzeContext: any;
  appendToResult: (line: string) => void;
  showTestResult: (content: string, isError?: boolean) => void;
} = $props();

let analyzeNotes = $state('');
let analyzeBtnText = $state('Analyze Current Listing');
let analyzeBtnDisabled = $state(false);
let sendAnalyzedBtnText = $state('Send This Message');
let sendAnalyzedBtnDisabled = $state(false);
let copyBtnText = $state('Copy');
let showExtractedData = $state(false);
let extractedDataText = $state('');
let analyzeMessageText = $state('');

$effect(() => {
  if (analyzeResult?.message) {
    analyzeMessageText = analyzeResult.message;
  }
});

function buildProfileFromSettings() {
  const parseList = (val: string) =>
    val
      ? val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  return {
    name: settings.profileName || undefined,
    age: settings.profileAge ? parseInt(settings.profileAge, 10) : undefined,
    occupation: settings.profileOccupation || undefined,
    languages: parseList(settings.profileLanguages),
    movingReason: settings.profileMovingReason || undefined,
    currentNeighborhood: settings.profileCurrentNeighborhood || undefined,
    idealApartment: settings.profileIdealApartment || undefined,
    dealbreakers: parseList(settings.profileDealbreakers),
    strengths: parseList(settings.profileStrengths),
    maxWarmmiete: settings.profileMaxWarmmiete ? parseInt(settings.profileMaxWarmmiete, 10) : undefined,
  };
}

function getScoreColor(score: number): string {
  if (score >= 8) return '#28a745';
  if (score >= 6) return '#5cb85c';
  if (score >= 4) return '#f0ad4e';
  return '#dc3545';
}

function getFormValues() {
  return {
    salutation: settings.formSalutation || 'Frau',
    phone: settings.formPhone || '',
    adults: settings.formAdults || 2,
    children: settings.formChildren || 0,
    pets: settings.formPets || 'Nein',
    smoker: settings.formSmoker || 'Nein',
    income: settings.formIncome || 2000,
    householdSize: settings.formHouseholdSize || 'Einpersonenhaushalt',
    employmentType: settings.formEmployment || 'Angestellte:r',
    incomeRange: settings.formIncomeRange || '1.500 - 2.000',
    documents: settings.formDocuments || 'Vorhanden',
  };
}

async function trySolveCaptchaFromPopup(tabId: number): Promise<{ solved: boolean; messageSent?: boolean }> {
  const isDirect = settings.aiMode === 'direct' && !!settings.aiApiKey;
  const serverUrl = settings.aiServerUrl || 'http://localhost:3456';
  const apiKey = settings.aiApiKey || undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    appendToResult(`Captcha detected - solving (attempt ${attempt}/2)...`);
    let detection: any;
    try {
      detection = await chrome.tabs.sendMessage(tabId, { action: 'detectCaptcha' });
    } catch (e: any) {
      appendToResult(`Captcha detection failed: ${e.message}`);
      return { solved: false };
    }
    if (!detection?.hasCaptcha) {
      appendToResult('No captcha present');
      return { solved: true, messageSent: false };
    }
    if (!detection.imageBase64) {
      appendToResult(`Captcha found but no image: ${detection.error}`);
      return { solved: false };
    }
    try {
      let captchaText: string | null = null;

      if (isDirect && apiKey) {
        // Direct Gemini mode
        const match = detection.imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) {
          appendToResult('Invalid captcha image format');
          return { solved: false };
        }
        const result = await geminiGenerateWithImage(
          apiKey, CAPTCHA_SYSTEM_PROMPT, match[2], match[1], CAPTCHA_USER_PROMPT,
          { maxTokens: 32, thinkingBudget: 0 },
        );
        const answer = result.text.trim().replace(/[^a-zA-Z0-9]/g, '');
        captchaText = answer && answer.length >= 4 ? answer : null;
        await trackTokenUsage(result.usage.promptTokens, result.usage.completionTokens);
        if (!captchaText) {
          appendToResult(`AI could not solve captcha (raw: "${result.text.trim()}")`);
          return { solved: false };
        }
      } else {
        // Server mode
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${serverUrl}/captcha`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: detection.imageBase64, apiKey }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const result = await response.json();
        captchaText = result.text || null;
        if (result.usage) {
          await trackTokenUsage(result.usage.promptTokens || 0, result.usage.completionTokens || 0);
        }
        if (!captchaText) {
          appendToResult(`Server could not solve captcha: ${result.error}`);
          return { solved: false };
        }
      }

      appendToResult(`Solution: "${captchaText}", submitting...`);
      const solveResult = await chrome.tabs.sendMessage(tabId, {
        action: 'solveCaptcha',
        text: captchaText,
      });
      if (solveResult?.success) {
        if (solveResult.messageSent) {
          appendToResult('Captcha solved - message sent!');
          return { solved: true, messageSent: true };
        }
        appendToResult('Captcha solved');
        return { solved: true, messageSent: false };
      }
      appendToResult(`Attempt ${attempt} failed: ${solveResult?.error}`);
    } catch (e: any) {
      appendToResult(`Captcha attempt ${attempt} error: ${e.message}`);
    }
  }
  appendToResult('All captcha attempts failed');
  return { solved: false };
}

async function handleAnalyze() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url?.includes('immobilienscout24.de/expose/')) {
      showTestResult('Please open a listing on ImmoScout24 first!\n\nURL should contain "/expose/"', true);
      return;
    }
    const serverUrl = settings.aiServerUrl || 'http://localhost:3456';
    const apiKey = settings.aiApiKey || undefined;
    const profile = buildProfileFromSettings();

    analyzeBtnDisabled = true;
    analyzeBtnText = 'Analyzing...';
    analyzeResult = null;
    testResultVisible = false;

    let listingDetails: any, landlordInfo: any;
    try {
      listingDetails = await chrome.tabs.sendMessage(tab.id!, { action: 'extractListingDetails' });
      const nameResponse = await chrome.tabs.sendMessage(tab.id!, { action: 'extractLandlordName' });
      landlordInfo = {
        title: nameResponse?.title || null,
        name: nameResponse?.name || null,
        isPrivate: nameResponse?.isPrivate || false,
      };
    } catch {
      analyzeBtnDisabled = false;
      analyzeBtnText = 'Analyze Current Listing';
      showTestResult('Could not read listing. Please refresh the page and try again.', true);
      return;
    }
    if (!listingDetails) {
      analyzeBtnDisabled = false;
      analyzeBtnText = 'Analyze Current Listing';
      showTestResult('No listing data found on this page.', true);
      return;
    }

    const formValues = getFormValues();
    const aboutMe = settings.aiAboutMe || '';
    const notes = analyzeNotes.trim();
    const isDirect = settings.aiMode === 'direct' && !!apiKey;

    let result: any;
    try {
      if (isDirect) {
        // Direct Gemini mode — build prompts locally
        const userProfile = { ...formValues, aboutMe };
        const listingText = formatListingForPrompt(listingDetails);
        let totalPromptTokens = 0, totalCompletionTokens = 0;

        // Score
        const scoringPrompt = buildScoringPrompt(userProfile, profile);
        const userPrompt = notes
          ? `Bewerte dieses Inserat:\n\n${listingText}\n\nNotizen: ${notes}`
          : `Bewerte dieses Inserat:\n\n${listingText}`;
        const scoreResult = await geminiGenerateText(apiKey!, scoringPrompt, userPrompt, { maxTokens: 1024, thinkingBudget: 0 });
        totalPromptTokens += scoreResult.usage.promptTokens;
        totalCompletionTokens += scoreResult.usage.completionTokens;

        const parsed = parseScoreJSON(scoreResult.text);
        const score = parsed?.score ?? 5;
        const reason = parsed?.reason ?? 'Score konnte nicht ermittelt werden';
        const summary = parsed?.summary;
        const flags = parsed?.flags || [];

        // Generate message (always, since minScore=0 for popup analyze)
        let message: string | undefined;
        try {
          const msgPrompt = buildMessagePrompt(userProfile, landlordInfo, settings.messageTemplate || '', profile);
          const msgResult = await geminiGenerateText(apiKey!, msgPrompt, `Schreibe eine Bewerbungsnachricht für dieses Inserat:\n\n${listingText}`, { maxTokens: 4096 });
          message = msgResult.text.trim() || undefined;
          totalPromptTokens += msgResult.usage.promptTokens;
          totalCompletionTokens += msgResult.usage.completionTokens;
        } catch (e: any) {
          console.error('[Analyze/Direct] Message generation failed:', e.message);
        }

        await trackTokenUsage(totalPromptTokens, totalCompletionTokens);
        result = { score, reason, summary, flags, message, skip: false, usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens } };
      } else {
        // Server mode
        const payload = {
          listingDetails,
          landlordInfo,
          userProfile: { ...formValues, aboutMe },
          messageTemplate: settings.messageTemplate || '',
          minScore: 0,
          userNotes: notes || undefined,
          apiKey,
          profile,
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(`${serverUrl}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        result = await response.json();

        if (result.usage) {
          await trackTokenUsage(result.usage.promptTokens || 0, result.usage.completionTokens || 0);
        }
      }
    } catch (e: any) {
      analyzeBtnDisabled = false;
      analyzeBtnText = 'Analyze Current Listing';
      const msg = e.name === 'AbortError' ? 'Request timed out (30s)' : e.message;
      const hint = isDirect ? 'Check your API key in Settings.' : `Make sure the server is running at ${serverUrl}`;
      showTestResult(`AI error: ${msg}\n\n${hint}`, true);
      return;
    }

    analyzeBtnDisabled = false;
    analyzeBtnText = 'Analyze Current Listing';

    const score = result.score || 0;
    const exposeMatch = tab.url!.match(/\/expose\/(\d+)/);
    lastAnalyzeContext = {
      listingId: exposeMatch ? exposeMatch[1] : 'unknown',
      title: listingDetails.title || 'Untitled',
      address: listingDetails.address || '',
      url: tab.url,
      score,
      reason: result.reason || '',
      landlord: landlordInfo.name || '',
    };

    // Build extracted data text
    extractedDataText = Object.entries(listingDetails)
      .filter(([k, v]) => k !== 'rawText' && v)
      .map(([k, v]) => {
        if (typeof v === 'object') return `${k}: ${JSON.stringify(v)}`;
        const str = String(v);
        return `${k}: ${str.length > 80 ? `${str.substring(0, 80)}...` : str}`;
      })
      .join('\n');

    analyzeResult = { ...result, score, listingTitle: listingDetails.title || 'Untitled listing' };
    if (result.message) analyzeMessageText = result.message;
  } catch (error: any) {
    analyzeBtnDisabled = false;
    analyzeBtnText = 'Analyze Current Listing';
    let errorMsg = `Error: ${error.message}`;
    if (error.message.includes('Receiving end does not exist')) {
      errorMsg += '\n\nPlease refresh the listing page and try again.';
    }
    showTestResult(errorMsg, true);
  }
}

async function handleSendAnalyzed() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url?.includes('immobilienscout24.de/expose/')) {
      showTestResult('Please open a listing on ImmoScout24 first!', true);
      return;
    }
    const message = analyzeMessageText.trim();
    if (!message) {
      showTestResult('No message to send.', true);
      return;
    }

    sendAnalyzedBtnDisabled = true;
    sendAnalyzedBtnText = 'Sending...';
    showTestResult('Sending AI message...\n---', false);

    const formValues = getFormValues();
    const isAutoSend = settings.autoSendMode !== 'manual';
    let sendResult = await chrome.tabs.sendMessage(tab.id!, {
      action: 'sendMessage',
      message,
      formValues,
      autoSend: isAutoSend,
    });

    if (sendResult && !sendResult.success && sendResult.captchaBlocked) {
      const captchaResult = await trySolveCaptchaFromPopup(tab.id!);
      if (captchaResult.messageSent) {
        sendResult = { success: true, messageSent: message };
      } else if (captchaResult.solved) {
        try {
          sendResult = await chrome.tabs.sendMessage(tab.id!, {
            action: 'sendMessage',
            message,
            formValues,
            autoSend: isAutoSend,
          });
        } catch (e: any) {
          appendToResult(`Retry failed: ${e.message}`);
        }
      }
    }

    sendAnalyzedBtnDisabled = false;
    sendAnalyzedBtnText = 'Send This Message';

    if (sendResult?.success) {
      appendToResult('\nMessage sent successfully!');
      testResultIsError = false;
      // Activity logging is handled via chrome.storage.local in background
    } else {
      appendToResult(`\n${sendResult?.error || 'Unknown error'}`);
      testResultIsError = true;
    }
  } catch (error: any) {
    sendAnalyzedBtnDisabled = false;
    sendAnalyzedBtnText = 'Send This Message';
    let errorMsg = `Error: ${error.message}`;
    if (error.message.includes('Receiving end does not exist')) {
      errorMsg += '\n\nPlease refresh the listing page and try again.';
    }
    showTestResult(errorMsg, true);
  }
}

function handleCopyAnalyzed() {
  navigator.clipboard.writeText(analyzeMessageText).then(() => {
    copyBtnText = '\u2713';
    setTimeout(() => {
      copyBtnText = 'Copy';
    }, 1500);
  });
}

const flagLabels: Record<string, string> = {
  'abl\u00f6se-risk': 'Abl\u00f6se Risk',
  'swap-only': 'Swap Only',
  'suspicious-price': 'Suspicious Price',
  'wbs-required': 'WBS Required',
  befristet: 'Fixed-Term',
  indexmiete: 'Index-Linked Rent',
  'high-energy-costs': 'High Energy Costs',
  unrenovated: 'Unrenovated',
};

function isFlagWarning(f: string): boolean {
  return ['abl\u00f6se-risk', 'swap-only', 'suspicious-price'].includes(f);
}
</script>

<div class="field">
  <label for="analyzeNotes">Notes for AI (optional)</label>
  <input
    type="text"
    id="analyzeNotes"
    bind:value={analyzeNotes}
    placeholder="e.g. I prefer ground floor apartments"
  />
</div>

<button class="btn btn-test" disabled={analyzeBtnDisabled} onclick={handleAnalyze}>
  {analyzeBtnText}
</button>

{#if analyzeResult}
  <div class="analyze-result">
    <div class="analyze-header">
      <span class="score-badge" style="background: {getScoreColor(analyzeResult.score)};">
        {analyzeResult.score}
      </span>
      <span class="analyze-title">{analyzeResult.listingTitle}</span>
    </div>
    <div class="analyze-reason">{analyzeResult.reason || ''}</div>
    {#if analyzeResult.summary}
      <div class="analyze-summary">{analyzeResult.summary}</div>
    {/if}
    {#if analyzeResult.flags && analyzeResult.flags.length > 0}
      <div class="analyze-flags">
        {#each analyzeResult.flags as flag}
          <span class="flag-badge" style="background: {isFlagWarning(flag) ? '#dc3545' : '#f0ad4e'};">
            {flagLabels[flag] || flag}
          </span>
        {/each}
      </div>
    {/if}
    {#if analyzeResult.message}
      <div class="analyze-msg-section">
        <textarea class="analyze-message" bind:value={analyzeMessageText}></textarea>
        <div class="analyze-btn-row">
          <button class="btn btn-test" disabled={sendAnalyzedBtnDisabled} onclick={handleSendAnalyzed}>{sendAnalyzedBtnText}</button>
          <button class="btn btn-secondary" onclick={handleCopyAnalyzed}>{copyBtnText}</button>
        </div>
      </div>
    {/if}
    <button class="btn btn-secondary" style="font-size:11px;" onclick={() => showExtractedData = !showExtractedData}>
      {showExtractedData ? 'Hide extracted data' : 'Show extracted data'}
    </button>
    {#if showExtractedData}
      <pre class="extracted-data">{extractedDataText}</pre>
    {/if}
  </div>
{/if}

<style>
  .analyze-result {
    margin-top: 12px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 1px solid #dee2e6;
  }

  .analyze-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .score-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 700;
    color: white;
  }

  .analyze-title {
    font-size: 13px;
    font-weight: 600;
    color: #333;
  }

  .analyze-reason {
    font-size: 12px;
    color: #555;
    margin-bottom: 6px;
  }

  .analyze-summary {
    font-size: 11px;
    color: #666;
    background: #fff;
    padding: 8px;
    border-radius: 4px;
    margin-bottom: 8px;
    border: 1px solid #eee;
  }

  .analyze-flags {
    margin-bottom: 8px;
  }

  .flag-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    color: white;
    margin-right: 4px;
    margin-top: 4px;
  }

  .analyze-msg-section {
    margin-top: 8px;
  }

  .analyze-message {
    width: 100%;
    min-height: 80px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 6px;
  }

  .analyze-btn-row {
    display: flex;
    gap: 6px;
  }

  .analyze-btn-row .btn {
    flex: 1;
    margin-top: 0;
  }

  .extracted-data {
    font-size: 10px;
    background: #f0f0f0;
    padding: 8px;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 6px;
    max-height: 150px;
    overflow-y: auto;
  }
</style>
