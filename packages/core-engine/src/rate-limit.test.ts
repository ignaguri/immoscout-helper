import { beforeEach, describe, expect, it, vi } from 'vitest';

// state.ts + rate-limit.ts touch chrome.storage at module load, so stub it before importing.
const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: (keys: string[]) => {
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (k in store) {
            out[k] = store[k];
          }
        }
        return Promise.resolve(out);
      },
      set: (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
        return Promise.resolve();
      },
    },
  },
});

const { checkRateLimit } = await import('./rate-limit');
const { setMessageCount, setLastMessageTime, setMessageCountResetTime } = await import('./state');

describe('checkRateLimit', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) {
      delete store[k];
    }
    setMessageCount(0);
    setLastMessageTime(0);
    setMessageCountResetTime(Date.now() + 3_600_000);
  });

  it('allows when under the message cap and past the min delay', async () => {
    const result = await checkRateLimit();
    expect(result.allowed).toBe(true);
  });

  it('blocks once the message count reaches the rate limit', async () => {
    store.rateLimit = 5;
    setMessageCount(5);
    const result = await checkRateLimit();
    expect(result.allowed).toBe(false);
    expect(result.waitTime).toBeGreaterThan(0);
  });

  it('blocks while the min delay since the last message has not elapsed', async () => {
    store.minDelay = 30; // seconds
    setMessageCount(0);
    setLastMessageTime(Date.now());
    const result = await checkRateLimit();
    expect(result.allowed).toBe(false);
    expect(result.waitTime).toBeGreaterThan(0);
  });
});
