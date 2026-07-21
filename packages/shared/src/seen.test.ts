import { describe, expect, it } from 'vitest';
import { capSeenListings, SEEN_LISTINGS_CAP } from './seen';

describe('SEEN_LISTINGS_CAP', () => {
  it('is 5000', () => {
    expect(SEEN_LISTINGS_CAP).toBe(5000);
  });
});

describe('capSeenListings', () => {
  it('returns the list unchanged when under the cap', () => {
    expect(capSeenListings(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns the list unchanged when exactly at the cap', () => {
    const list = Array.from({ length: SEEN_LISTINGS_CAP }, (_, i) => String(i));
    const result = capSeenListings(list);
    expect(result).toHaveLength(SEEN_LISTINGS_CAP);
    expect(result[0]).toBe('0');
    expect(result[result.length - 1]).toBe(String(SEEN_LISTINGS_CAP - 1));
  });

  it('keeps only the last SEEN_LISTINGS_CAP entries when over the cap, dropping the oldest', () => {
    const list = Array.from({ length: SEEN_LISTINGS_CAP + 3 }, (_, i) => String(i));
    const result = capSeenListings(list);
    expect(result).toHaveLength(SEEN_LISTINGS_CAP);
    expect(result[0]).toBe('3');
    expect(result[result.length - 1]).toBe(String(SEEN_LISTINGS_CAP + 2));
  });
});
