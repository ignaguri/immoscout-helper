/** Maximum number of seen-listing IDs retained in storage. */
export const SEEN_LISTINGS_CAP = 5000;

/** Trim the seen-listings list to the most recent SEEN_LISTINGS_CAP entries, dropping the oldest. */
export function capSeenListings(seenList: string[]): string[] {
  if (seenList.length > SEEN_LISTINGS_CAP) {
    return seenList.slice(seenList.length - SEEN_LISTINGS_CAP);
  }
  return seenList;
}
