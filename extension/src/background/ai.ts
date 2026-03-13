import * as C from '../shared/constants';
import { getAIConfig, canUseDirect, canUseServer, trackTokenUsage, type AIConfig } from '../shared/ai-router';
import { geminiGenerateText, geminiGenerateWithImage } from '../shared/gemini';
import {
  buildScoringPrompt,
  buildMessagePrompt,
  formatListingForPrompt,
  parseScoreJSON,
  CAPTCHA_SYSTEM_PROMPT,
  CAPTCHA_USER_PROMPT,
} from '../shared/prompts';
import { waitForTabLoad } from './helpers';

export interface UserProfile {
  name?: string;
  age?: number;
  occupation?: string;
  languages?: string[];
  movingReason?: string;
  currentNeighborhood?: string;
  idealApartment?: string;
  dealbreakers?: string[];
  strengths?: string[];
  maxWarmmiete?: number;
}

export async function getProfile(): Promise<UserProfile> {
  const keys = [
    C.PROFILE_NAME_KEY,
    C.PROFILE_AGE_KEY,
    C.PROFILE_OCCUPATION_KEY,
    C.PROFILE_LANGUAGES_KEY,
    C.PROFILE_MOVING_REASON_KEY,
    C.PROFILE_CURRENT_NEIGHBORHOOD_KEY,
    C.PROFILE_IDEAL_APARTMENT_KEY,
    C.PROFILE_DEALBREAKERS_KEY,
    C.PROFILE_STRENGTHS_KEY,
    C.PROFILE_MAX_WARMMIETE_KEY,
  ];
  const stored: Record<string, any> = await chrome.storage.local.get(keys);
  const parseList = (val: string | undefined): string[] =>
    val
      ? val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  return {
    name: stored[C.PROFILE_NAME_KEY] || undefined,
    age: stored[C.PROFILE_AGE_KEY] ? parseInt(stored[C.PROFILE_AGE_KEY], 10) : undefined,
    occupation: stored[C.PROFILE_OCCUPATION_KEY] || undefined,
    languages: parseList(stored[C.PROFILE_LANGUAGES_KEY]),
    movingReason: stored[C.PROFILE_MOVING_REASON_KEY] || undefined,
    currentNeighborhood: stored[C.PROFILE_CURRENT_NEIGHBORHOOD_KEY] || undefined,
    idealApartment: stored[C.PROFILE_IDEAL_APARTMENT_KEY] || undefined,
    dealbreakers: parseList(stored[C.PROFILE_DEALBREAKERS_KEY]),
    strengths: parseList(stored[C.PROFILE_STRENGTHS_KEY]),
    maxWarmmiete: stored[C.PROFILE_MAX_WARMMIETE_KEY] ? parseInt(stored[C.PROFILE_MAX_WARMMIETE_KEY], 10) : undefined,
  };
}

export interface AIAnalysisResult {
  score: number;
  skip: boolean;
  message?: string;
  reason?: string;
  summary?: string;
  flags?: string[];
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface FormValues {
  adults: number;
  children: number;
  pets: string;
  smoker: string;
  income: number;
  householdSize: string;
  employmentType: string;
  incomeRange: string;
  documents: string;
  salutation: string;
  phone: string;
}

// ── Direct Gemini mode ──

async function tryAIAnalysisDirect(
  config: AIConfig,
  tabId: number,
  landlordTitle: string | null,
  landlordName: string | null,
  isPrivateLandlord: boolean,
  formValues: FormValues,
  messageTemplate: string,
  isTenantNetwork: boolean,
): Promise<AIAnalysisResult | null> {
  const profile = await getProfile();
  const apiKey = config.apiKey!;

  let listingDetails: any;
  try {
    listingDetails = await chrome.tabs.sendMessage(tabId, { action: 'extractListingDetails' });
  } catch (e: any) {
    console.error('[AI/Direct] Failed to extract listing details:', e.message);
    return null;
  }
  if (!listingDetails) return null;

  const listingText = formatListingForPrompt(listingDetails);
  const userProfile = { ...formValues, aboutMe: config.aboutMe };
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  // Step 1: Score
  let score: number | undefined;
  let reason: string | undefined;
  let summary: string | undefined;
  let flags: string[] = [];

  try {
    const scoringPrompt = buildScoringPrompt(userProfile, profile);
    const result = await geminiGenerateText(apiKey, scoringPrompt, `Bewerte dieses Inserat:\n\n${listingText}`, {
      maxTokens: 1024,
      thinkingBudget: 0,
    });
    totalPromptTokens += result.usage.promptTokens;
    totalCompletionTokens += result.usage.completionTokens;

    const parsed = parseScoreJSON(result.text);
    if (parsed) {
      score = parsed.score;
      reason = parsed.reason;
      summary = parsed.summary;
      flags = parsed.flags || [];
    } else {
      console.warn('[AI/Direct] Could not parse score JSON, defaulting to 5');
      score = 5;
      reason = 'Score konnte nicht ermittelt werden';
    }
  } catch (error) {
    console.error('[AI/Direct] Scoring error:', (error as Error).message);
    return null;
  }

  // Update stats
  const statsUpdates: Record<string, number> = {
    [C.AI_LISTINGS_SCORED_KEY]:
      ((await chrome.storage.local.get([C.AI_LISTINGS_SCORED_KEY]))[C.AI_LISTINGS_SCORED_KEY] || 0) + 1,
  };

  // If score below threshold, skip message generation
  if (score < config.minScore) {
    console.log(`[AI/Direct] Score ${score}/${config.minScore} — skipping${flags.length ? ` [flags: ${flags.join(', ')}]` : ''}`);
    statsUpdates[C.AI_LISTINGS_SKIPPED_KEY] =
      ((await chrome.storage.local.get([C.AI_LISTINGS_SKIPPED_KEY]))[C.AI_LISTINGS_SKIPPED_KEY] || 0) + 1;
    await chrome.storage.local.set(statsUpdates);
    await trackTokenUsage(totalPromptTokens, totalCompletionTokens);
    return { score, reason, summary, flags, skip: true, usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens } };
  }

  await chrome.storage.local.set(statsUpdates);

  // Step 2: Generate message
  let message: string | null = null;
  try {
    const landlordInfo = {
      title: landlordTitle || undefined,
      name: landlordName || undefined,
      isPrivate: isPrivateLandlord,
      isTenantNetwork,
    };
    const messagePrompt = buildMessagePrompt(userProfile, landlordInfo, messageTemplate, profile);
    const msgResult = await geminiGenerateText(
      apiKey,
      messagePrompt,
      `Schreibe eine Bewerbungsnachricht für dieses Inserat:\n\n${listingText}`,
      { maxTokens: 4096 },
    );
    message = msgResult.text.trim();
    totalPromptTokens += msgResult.usage.promptTokens;
    totalCompletionTokens += msgResult.usage.completionTokens;
  } catch (error) {
    console.error('[AI/Direct] Message generation error:', (error as Error).message);
  }

  await trackTokenUsage(totalPromptTokens, totalCompletionTokens);
  console.log(`[AI/Direct] Score ${score}/10 — message ${message ? 'generated' : 'fallback'}${flags.length ? ` [flags: ${flags.join(', ')}]` : ''}`);
  return { score, reason, summary, flags, message: message || undefined, skip: false, usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens } };
}

// ── Server mode (existing) ──

async function tryAIAnalysisServer(
  config: AIConfig,
  tabId: number,
  landlordTitle: string | null,
  landlordName: string | null,
  isPrivateLandlord: boolean,
  formValues: FormValues,
  messageTemplate: string,
  isTenantNetwork: boolean,
): Promise<AIAnalysisResult | null> {
  const profile = await getProfile();

  let listingDetails: any;
  try {
    listingDetails = await chrome.tabs.sendMessage(tabId, { action: 'extractListingDetails' });
  } catch (e: any) {
    console.error('[AI/Server] Failed to extract listing details:', e.message);
    return null;
  }
  if (!listingDetails) return null;

  const payload = {
    listingDetails,
    landlordInfo: { title: landlordTitle, name: landlordName, isPrivate: isPrivateLandlord, isTenantNetwork },
    userProfile: { ...formValues, aboutMe: config.aboutMe },
    messageTemplate,
    minScore: config.minScore,
    apiKey: config.apiKey,
    profile,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), C.AI_ANALYSIS_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.serverUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[AI/Server] Server returned ${response.status}`);
      return null;
    }

    const result: AIAnalysisResult = await response.json();

    // Update AI stats
    const stats: Record<string, any> = await chrome.storage.local.get([
      C.AI_LISTINGS_SCORED_KEY,
      C.AI_LISTINGS_SKIPPED_KEY,
      C.AI_USAGE_PROMPT_TOKENS_KEY,
      C.AI_USAGE_COMPLETION_TOKENS_KEY,
    ]);
    const updates: Record<string, number> = {
      [C.AI_LISTINGS_SCORED_KEY]: (stats[C.AI_LISTINGS_SCORED_KEY] || 0) + 1,
    };
    if (result.skip) {
      updates[C.AI_LISTINGS_SKIPPED_KEY] = (stats[C.AI_LISTINGS_SKIPPED_KEY] || 0) + 1;
    }
    if (result.usage) {
      updates[C.AI_USAGE_PROMPT_TOKENS_KEY] =
        (stats[C.AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (result.usage.promptTokens || 0);
      updates[C.AI_USAGE_COMPLETION_TOKENS_KEY] =
        (stats[C.AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (result.usage.completionTokens || 0);
    }
    await chrome.storage.local.set(updates);

    console.log(`[AI/Server] Score: ${result.score}/10, Skip: ${result.skip}, Message: ${result.message ? 'yes' : 'no'}`);
    return result;
  } catch (e: any) {
    clearTimeout(timeout);
    console.error('[AI/Server] Fetch error:', e.message);
    return null;
  }
}

// ── Public API ──

export async function tryAIAnalysis(
  tabId: number,
  landlordTitle: string | null,
  landlordName: string | null,
  isPrivateLandlord: boolean,
  formValues: FormValues,
  messageTemplate: string,
  isTenantNetwork: boolean = false,
): Promise<AIAnalysisResult | null> {
  try {
    const config = await getAIConfig();
    if (!config.enabled) return null;

    if (canUseDirect(config)) {
      return await tryAIAnalysisDirect(config, tabId, landlordTitle, landlordName, isPrivateLandlord, formValues, messageTemplate, isTenantNetwork);
    }
    if (canUseServer(config)) {
      return await tryAIAnalysisServer(config, tabId, landlordTitle, landlordName, isPrivateLandlord, formValues, messageTemplate, isTenantNetwork);
    }

    console.warn('[AI] No valid AI configuration (need API key for direct mode or server URL for server mode)');
    return null;
  } catch (e: any) {
    console.error('[AI] Unexpected error:', e.message);
    return null;
  }
}

export interface CaptchaResult {
  solved: boolean;
  messageSent: boolean;
  unverified?: boolean;
}

export async function trySolveCaptcha(
  tabId: number,
  serverUrl: string,
  apiKey: string | undefined,
): Promise<CaptchaResult | false> {
  // Determine mode from storage
  const config = await getAIConfig();
  let sentSolution = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`[Captcha] Attempt ${attempt}/2 — detecting...`);

    if (sentSolution) {
      console.log('[Captcha] Previous attempt sent solution — waiting for page to settle...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      } catch (_e) {
        await waitForTabLoad(tabId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    let detection: any;
    try {
      detection = await chrome.tabs.sendMessage(tabId, { action: 'detectCaptcha' });
    } catch (e: any) {
      if (sentSolution) {
        console.log('[Captcha] Page unreachable after sending solution — waiting for reload...');
        try {
          await waitForTabLoad(tabId);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const pageCheck: any = await chrome.tabs.sendMessage(tabId, { action: 'checkMessageSent' });
          if (pageCheck?.messageSent) {
            console.log('[Captcha] Confirmed: message was sent after page reload');
            return { solved: true, messageSent: true };
          }
          console.warn('[Captcha] Page reloaded but no confirmation found. Page:', pageCheck?.url);
          return { solved: false, messageSent: false };
        } catch (e2: any) {
          console.warn('[Captcha] Cannot verify after page reload:', e2.message);
          return { solved: true, messageSent: false, unverified: true };
        }
      }
      console.error('[Captcha] Detection failed:', e.message);
      return false;
    }

    if (!detection?.hasCaptcha) {
      if (sentSolution) {
        console.log('[Captcha] Captcha gone after sending solution — verifying message delivery...');
        try {
          const pageCheck: any = await chrome.tabs.sendMessage(tabId, { action: 'checkMessageSent' });
          if (pageCheck?.messageSent) {
            console.log('[Captcha] Confirmed: message was sent');
            return { solved: true, messageSent: true };
          }
          if (pageCheck?.hasCaptcha) {
            console.log('[Captcha] New captcha appeared — previous solution was wrong');
            sentSolution = false;
            continue;
          }
          if (pageCheck?.hasContactForm) {
            console.log('[Captcha] Contact form still present — captcha solved but message not sent yet');
            return { solved: true, messageSent: false };
          }
          console.warn('[Captcha] No confirmation found on page — captcha likely failed. Page:', pageCheck?.url);
          return { solved: false, messageSent: false };
        } catch (e) {
          console.warn('[Captcha] Cannot verify page state:', (e as any).message);
          return { solved: true, messageSent: false, unverified: true };
        }
      }
      console.log('[Captcha] No captcha detected');
      return { solved: true, messageSent: false };
    }

    if (!detection.imageBase64) {
      console.error('[Captcha] Captcha detected but no image:', detection.error);
      return false;
    }

    console.log('[Captcha] Captcha detected, solving...');

    try {
      let captchaText: string | null = null;
      let captchaUsage = { promptTokens: 0, completionTokens: 0 };

      if (canUseDirect(config) && config.apiKey) {
        // Direct mode: call Gemini vision API
        const match = detection.imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) {
          console.error('[Captcha] Invalid base64 image format');
          return false;
        }
        const mimeType = match[1];
        const rawBase64 = match[2];

        const result = await geminiGenerateWithImage(
          config.apiKey,
          CAPTCHA_SYSTEM_PROMPT,
          rawBase64,
          mimeType,
          CAPTCHA_USER_PROMPT,
          { maxTokens: 32, thinkingBudget: 0 },
        );
        const answer = result.text.trim().replace(/[^a-zA-Z0-9]/g, '');
        captchaText = answer && answer.length >= 4 && answer.length <= 7 ? answer : null;
        captchaUsage = result.usage;

        if (!captchaText) {
          console.warn(`[Captcha/Direct] Empty/invalid answer (raw: "${result.text.trim()}")`);
        }
      } else if (canUseServer(config)) {
        // Server mode
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), C.CAPTCHA_SOLVE_TIMEOUT_MS);
        const response = await fetch(`${serverUrl}/captcha`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: detection.imageBase64, apiKey }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const result: any = await response.json();
        captchaText = result.text || null;
        if (result.usage) {
          captchaUsage = { promptTokens: result.usage.promptTokens || 0, completionTokens: result.usage.completionTokens || 0 };
        }
      }

      if (captchaUsage.promptTokens || captchaUsage.completionTokens) {
        await trackTokenUsage(captchaUsage.promptTokens, captchaUsage.completionTokens);
      }

      if (!captchaText) {
        console.error('[Captcha] Could not solve captcha');
        return false;
      }

      console.log(`[Captcha] Solution: "${captchaText}", filling...`);
      sentSolution = true;

      const solveResult: any = await chrome.tabs.sendMessage(tabId, {
        action: 'solveCaptcha',
        text: captchaText,
      });

      if (solveResult?.success) {
        if (solveResult.messageSent) {
          console.log('[Captcha] Solved — message was sent successfully');
          return { solved: true, messageSent: true };
        }
        console.log('[Captcha] Solved successfully');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return { solved: true, messageSent: false };
      }

      console.warn(`[Captcha] Attempt ${attempt} failed:`, solveResult?.error);
    } catch (e: any) {
      console.error(`[Captcha] Attempt ${attempt} error:`, e.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.error('[Captcha] All attempts failed');
  return false;
}
