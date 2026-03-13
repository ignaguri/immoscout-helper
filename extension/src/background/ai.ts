import * as C from '../shared/constants';
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
    const aiSettings: Record<string, any> = await chrome.storage.local.get([
      C.AI_ENABLED_KEY,
      C.AI_API_KEY_KEY,
      C.AI_SERVER_URL_KEY,
      C.AI_MIN_SCORE_KEY,
      C.AI_ABOUT_ME_KEY,
    ]);

    if (!aiSettings[C.AI_ENABLED_KEY]) return null;

    const serverUrl: string = aiSettings[C.AI_SERVER_URL_KEY] || 'http://localhost:3456';
    const minScore: number = aiSettings[C.AI_MIN_SCORE_KEY] || 5;
    const apiKey: string | undefined = aiSettings[C.AI_API_KEY_KEY] || undefined;
    const profile = await getProfile();

    // Extract listing details from the page
    let listingDetails: any;
    try {
      listingDetails = await chrome.tabs.sendMessage(tabId, { action: 'extractListingDetails' });
    } catch (e: any) {
      console.error('[AI] Failed to extract listing details:', e.message);
      return null;
    }

    if (!listingDetails) return null;

    const payload = {
      listingDetails,
      landlordInfo: { title: landlordTitle, name: landlordName, isPrivate: isPrivateLandlord, isTenantNetwork },
      userProfile: {
        ...formValues,
        aboutMe: aiSettings[C.AI_ABOUT_ME_KEY] || '',
      },
      messageTemplate,
      minScore,
      apiKey,
      profile,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), C.AI_ANALYSIS_TIMEOUT_MS);

    try {
      const response = await fetch(`${serverUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[AI] Server returned ${response.status}`);
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

      console.log(`[AI] Score: ${result.score}/10, Skip: ${result.skip}, Message: ${result.message ? 'yes' : 'no'}`);
      return result;
    } catch (e: any) {
      clearTimeout(timeout);
      console.error('[AI] Fetch error:', e.message);
      return null;
    }
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
  let sentSolution = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`[Captcha] Attempt ${attempt}/2 — detecting...`);

    // If we sent a solution on the previous attempt and got "channel closed",
    // the page likely navigated after successful captcha → wait for it to load
    if (sentSolution) {
      console.log('[Captcha] Previous attempt sent solution — waiting for page to settle...');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Try to ping the content script — page may have reloaded
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      } catch (_e) {
        // Content script not ready — wait for tab to finish loading
        await waitForTabLoad(tabId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    let detection: any;
    try {
      detection = await chrome.tabs.sendMessage(tabId, { action: 'detectCaptcha' });
    } catch (e: any) {
      if (sentSolution) {
        // Sent a solution and now can't talk to page — wait for it to load and verify
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
        // Captcha is gone after we sent a solution — but was the message actually sent?
        // Check the page for confirmation instead of blindly assuming success
        console.log('[Captcha] Captcha gone after sending solution — verifying message delivery...');
        try {
          const pageCheck: any = await chrome.tabs.sendMessage(tabId, { action: 'checkMessageSent' });
          if (pageCheck?.messageSent) {
            console.log('[Captcha] Confirmed: message was sent');
            return { solved: true, messageSent: true };
          }
          if (pageCheck?.hasCaptcha) {
            console.log('[Captcha] New captcha appeared — previous solution was wrong');
            // Continue the loop to try again (but we're likely out of attempts)
            sentSolution = false;
            continue;
          }
          if (pageCheck?.hasContactForm) {
            console.log('[Captcha] Contact form still present — captcha solved but message not sent yet');
            return { solved: true, messageSent: false };
          }
          // No confirmation, no form, no captcha — page likely reloaded (wrong captcha)
          console.warn('[Captcha] No confirmation found on page — captcha likely failed. Page:', pageCheck?.url);
          return { solved: false, messageSent: false };
        } catch (e) {
          // Can't talk to page at all — it navigated away completely
          console.warn('[Captcha] Cannot verify page state:', (e as any).message);
          // Could be success (navigated to confirmation) or failure (page reloaded)
          // Be conservative: report as unverified
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

    console.log('[Captcha] Captcha detected, sending to AI server...');

    try {
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

      if (result.usage) {
        const usageStats: Record<string, any> = await chrome.storage.local.get([
          C.AI_USAGE_PROMPT_TOKENS_KEY,
          C.AI_USAGE_COMPLETION_TOKENS_KEY,
        ]);
        await chrome.storage.local.set({
          [C.AI_USAGE_PROMPT_TOKENS_KEY]:
            (usageStats[C.AI_USAGE_PROMPT_TOKENS_KEY] || 0) + (result.usage.promptTokens || 0),
          [C.AI_USAGE_COMPLETION_TOKENS_KEY]:
            (usageStats[C.AI_USAGE_COMPLETION_TOKENS_KEY] || 0) + (result.usage.completionTokens || 0),
        });
      }

      if (!result.text) {
        console.error('[Captcha] Server could not solve:', result.error);
        return false;
      }

      console.log(`[Captcha] Solution: "${result.text}", filling...`);
      sentSolution = true;

      const solveResult: any = await chrome.tabs.sendMessage(tabId, {
        action: 'solveCaptcha',
        text: result.text,
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
      // If we just sent a solution and got channel closed, loop will handle it
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.error('[Captcha] All attempts failed');
  return false;
}
