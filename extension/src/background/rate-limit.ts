import * as C from '../shared/constants';
import { log } from '../shared/logger';
import type { RateLimitResult } from '../shared/types';
import {
  lastMessageTime,
  messageCount,
  messageCountResetTime,
  rateStateRestored,
  setMessageCount,
  setMessageCountResetTime,
} from './state';

export async function checkRateLimit(): Promise<RateLimitResult> {
  await rateStateRestored;
  const now = Date.now();

  if (now >= messageCountResetTime) {
    setMessageCount(0);
    setMessageCountResetTime(now + 3600000);
    await chrome.storage.local.set({
      [C.RATE_MESSAGE_COUNT_KEY]: 0,
      [C.RATE_COUNT_RESET_TIME_KEY]: messageCountResetTime,
    });
  }

  const stored: Record<string, any> = await chrome.storage.local.get([C.RATE_LIMIT_KEY, C.MIN_DELAY_KEY]);
  const rateLimitValue = stored[C.RATE_LIMIT_KEY] || 10;
  const minDelay = (stored[C.MIN_DELAY_KEY] || 30) * 1000;

  if (messageCount >= rateLimitValue) {
    const waitTime = messageCountResetTime - now;
    log(
      `Rate limit reached (${messageCount}/${rateLimitValue} messages). Waiting ${Math.ceil(waitTime / 1000)} seconds...`,
    );
    return { allowed: false, waitTime };
  }

  const timeSinceLastMessage = now - lastMessageTime;
  if (timeSinceLastMessage < minDelay) {
    const waitTime = minDelay - timeSinceLastMessage;
    log(`Rate limiting: Waiting ${Math.ceil(waitTime / 1000)} seconds before next message...`);
    return { allowed: false, waitTime };
  }

  return { allowed: true };
}
