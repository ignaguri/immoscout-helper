import { describe, expect, it } from 'vitest';
import { getAvailableFallbacks, isRateLimitError, markModelCooldown } from './model-rotation';

describe('isRateLimitError', () => {
  it('detects rate-limit / overload signals', () => {
    for (const msg of [
      '429 Too Many Requests',
      'rate limit exceeded',
      'quota exceeded',
      'model is overloaded',
      'resource exhausted',
      '503 Service Unavailable',
    ]) {
      expect(isRateLimitError(new Error(msg))).toBe(true);
    }
  });

  it('returns false for unrelated errors', () => {
    expect(isRateLimitError(new Error('invalid api key'))).toBe(false);
    expect(isRateLimitError(new Error('network timeout'))).toBe(false);
  });
});

describe('getAvailableFallbacks', () => {
  it('includes only models whose provider has an API key', () => {
    const geminiOnly = getAvailableFallbacks({ gemini: 'key' });
    expect(geminiOnly.length).toBeGreaterThan(0);
    expect(geminiOnly.every((f) => f.provider === 'gemini')).toBe(true);

    const withOpenai = getAvailableFallbacks({ gemini: 'g', openai: 'o' });
    expect(withOpenai.some((f) => f.provider === 'openai')).toBe(true);
  });

  it('excludes a model after it is put on cooldown', () => {
    const model = 'gemini-2.5-flash';
    expect(getAvailableFallbacks({ gemini: 'key' }).some((f) => f.model === model)).toBe(true);
    markModelCooldown(model);
    expect(getAvailableFallbacks({ gemini: 'key' }).some((f) => f.model === model)).toBe(false);
  });
});
