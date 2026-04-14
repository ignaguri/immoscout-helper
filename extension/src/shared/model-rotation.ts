// Smart model rotation with exponential backoff cooldowns.
// When a model returns a rate-limit/overload error, we mark it on cooldown
// and try the next model in the fallback chain.

import type { ProviderId } from './ai-provider';
import * as C from './constants';

export interface FallbackModel {
  provider: ProviderId;
  model: string;
}

/** Hardcoded fallback chain — Gemini models first, OpenAI as last resort. */
export const FALLBACK_CHAIN: FallbackModel[] = [
  { provider: 'gemini', model: 'gemini-2.5-flash' },
  { provider: 'gemini', model: 'gemini-2.0-flash' },
  { provider: 'gemini', model: 'gemini-2.0-flash-lite' },
  { provider: 'gemini', model: 'gemini-1.5-flash' },
  { provider: 'openai', model: 'gpt-4o-mini' },
];

// In-memory cooldown map: modelName → { expiresAt, hits }
const cooldowns = new Map<string, { expiresAt: number; hits: number }>();

const RATE_LIMIT_PATTERN =
  /\b(429|503|rate.?limit|quota|high.?demand|too many requests|resource.?exhausted|overloaded|currently experiencing)\b/i;

/** Returns true if the error indicates a rate-limit or overload condition. */
export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RATE_LIMIT_PATTERN.test(msg);
}

/** Mark a model on cooldown with exponential backoff (1m → 2m → 4m → ... → 15m). */
export function markModelCooldown(model: string): void {
  const prev = cooldowns.get(model);
  const hits = (prev?.hits ?? 0) + 1;
  const duration = Math.min(C.AI_MODEL_COOLDOWN_BASE_MS * 2 ** (hits - 1), C.AI_MODEL_COOLDOWN_MAX_MS);
  cooldowns.set(model, { expiresAt: Date.now() + duration, hits });
}

function isOnCooldown(model: string): boolean {
  const entry = cooldowns.get(model);
  if (!entry) return false;
  if (Date.now() >= entry.expiresAt) {
    cooldowns.delete(model);
    return false;
  }
  return true;
}

/**
 * Returns available fallback models in chain order, filtering out those
 * on cooldown or whose provider lacks an API key.
 */
export function getAvailableFallbacks(
  allApiKeys: Record<string, string>,
): FallbackModel[] {
  return FALLBACK_CHAIN.filter(
    (fb) => fb.provider !== 'litellm' && !!allApiKeys[fb.provider] && !isOnCooldown(fb.model),
  );
}
