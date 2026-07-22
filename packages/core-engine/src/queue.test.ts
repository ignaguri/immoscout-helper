import { beforeEach, describe, expect, it, vi } from 'vitest';

// queue.ts pulls in state.ts/rate-limit.ts which touch chrome.storage at module
// load, so stub chrome before importing. get() must accept a single key or an
// array (getPendingApprovalListings passes a bare string).
const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of arr) {
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
  runtime: {
    sendMessage: () => Promise.resolve(),
  },
});

const { enqueueListings } = await import('./queue');

describe('enqueueListings', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) {
      delete store[k];
    }
  });

  it('adds new listings to the queue (ids normalized) and returns the count', async () => {
    const added = await enqueueListings(
      [
        { id: 'A1', url: 'https://x/a1', title: 'A1' },
        { id: 'B2', url: 'https://x/b2', title: 'B2' },
      ],
      'auto',
    );
    expect(added).toBe(2);
    expect((store.manualQueue as { id: string }[]).map((q) => q.id)).toEqual(['a1', 'b2']);
  });

  it('deduplicates by id within a single call (case-insensitive)', async () => {
    const added = await enqueueListings(
      [
        { id: 'A1', url: 'https://x/a1', title: 'first' },
        { id: 'a1', url: 'https://x/a1-dup', title: 'dup' },
      ],
      'auto',
    );
    expect(added).toBe(1);
    expect((store.manualQueue as unknown[]).length).toBe(1);
  });

  it('filters listings already seen, queued, blacklisted, or pending approval', async () => {
    store.seenListings = ['seen1'];
    store.manualQueue = [{ id: 'queued1', url: 'u', title: '', source: 'auto', addedAt: 0, retries: 0 }];
    store.blacklistedListings = ['black1'];
    store.pendingApprovalListings = [{ id: 'pending1', url: 'u', addedAt: 0 }];

    const added = await enqueueListings(
      [
        { id: 'seen1', url: 'https://x/1', title: '' },
        { id: 'queued1', url: 'https://x/2', title: '' },
        { id: 'black1', url: 'https://x/3', title: '' },
        { id: 'pending1', url: 'https://x/4', title: '' },
        { id: 'new1', url: 'https://x/5', title: '' },
      ],
      'auto',
    );
    expect(added).toBe(1);
    const ids = (store.manualQueue as { id: string }[]).map((q) => q.id);
    expect(ids).toContain('new1');
    expect(ids).not.toContain('seen1');
  });

  it('skips listings missing an id or url', async () => {
    const added = await enqueueListings(
      [{ id: 'nourl' } as unknown as { id: string; url: string }, { url: 'https://x/noid' } as never],
      'auto',
    );
    expect(added).toBe(0);
  });
});
