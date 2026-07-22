import type { SiteDescriptor } from '@repo/site-adapter';
import { is24Messenger } from './messenger-client';

// The concrete IS24 SiteDescriptor. Draft (all IS24 behaviors on) until Phase 6.
// createEngine (Task 3.5) consumes this; for now the app entry sets it directly.
export const is24Descriptor: SiteDescriptor = {
  id: 'immoscout24',
  isListingUrl: (u) => u.includes('immobilienscout24.de/expose/'),
  buildListingUrl: (id) => `https://www.immobilienscout24.de/expose/${id}`,
  buildSearchPageUrl: (searchUrl, page) => {
    const url = new URL(searchUrl);
    url.searchParams.set('pagenumber', String(page));
    return url.toString();
  },
  defaultSearchUrl: 'https://www.immobilienscout24.de/Suche/de/wohnung-mieten',
  updateRepo: 'ignaguri/immoscout-helper',
  capabilities: {
    messenger: true,
    captcha: true,
    tenantRecommendations: true,
    comingSoon: true,
    duplicateLandlordDetection: true,
    documentGeneration: true,
    requiresLogin: false,
  },
  market: { locale: 'de-DE' },
  messenger: is24Messenger,
};
