// Listing detail extraction, landlord name, and listing type detection

import * as C from '../shared/constants';
import { log } from '../shared/logger';
import type { LandlordInfo, ListingDetails, ListingType } from '../shared/types';
import { findButtonByKeywords, findElement } from './dom-helpers';
import * as S from './selectors';

export function detectListingType(): ListingType {
  // Tenant-network listings (Nachvermietung): posted by the current tenant,
  // not the landlord. These have no contact form — only a tenant info box.
  const isTenantNetwork = S.TENANT_NETWORK_SELECTORS.some((sel) => !!document.querySelector(sel));

  // Check if a contact button or form exists
  const hasContactForm = !!document.querySelector(S.CONTACT_FORM_DETECT_SELECTORS);
  // Fallback: button with contact-related text
  const hasContactButton = hasContactForm || !!findButtonByKeywords(S.CONTACT_BUTTON_KEYWORDS, { skipSubmit: true });

  return {
    isTenantNetwork,
    hasContactForm: hasContactButton,
    type: isTenantNetwork ? 'tenant-network' : 'standard',
  };
}

export function extractLandlordName(): LandlordInfo {
  let nameEl: Element | null = findElement(S.LANDLORD_NAME_SELECTORS);

  // Fallback: search contact sections
  if (!nameEl) {
    for (const section of document.querySelectorAll('[class*="contact"], .contact-box')) {
      for (const heading of section.querySelectorAll('h1, h2, h3, h4, strong')) {
        const text = (heading.textContent || '').trim();
        if (text.length > 2 && text.length < 50 && /^[A-ZÄÖÜ]/.test(text)) {
          nameEl = heading;
          break;
        }
      }
      if (nameEl) break;
    }
  }

  // Detect if listing is from a private person or commercial agent
  const isPrivate =
    !!document.querySelector('[class*="private-offer-logo"], [class*="PrivateOfferLogo"]') ||
    document.body.innerText.includes('von privat');

  if (!nameEl) return { title: null, name: null, isPrivate };

  const text = (nameEl.textContent || '').trim().split('\n')[0].split(',')[0].trim();

  const frauMatch = text.match(/^Frau\s+(.+)/i);
  if (frauMatch) return { title: 'Frau', name: frauMatch[1].trim(), isPrivate };

  const herrMatch = text.match(/^Herr\s+(.+)/i);
  if (herrMatch) return { title: 'Herr', name: herrMatch[1].trim(), isPrivate };

  return { title: null, name: text || null, isPrivate };
}

export function extractListingDetails(): ListingDetails {
  const details: ListingDetails = {};

  // Title
  const titleEl = document.querySelector('#expose-title');
  if (titleEl) details.title = (titleEl.textContent || '').trim();

  // Address (get full address block, not just first span)
  const addressBlock = findElement(S.ADDRESS_SELECTORS);
  if (addressBlock) details.address = (addressBlock.textContent || '').trim().replace(/\s+/g, ' ');

  // Primary fields via is24qa CSS classes (try multiple variant suffixes)
  const primaryFields: Record<string, string[]> = {
    kaltmiete: ['kaltmiete'],
    warmmiete: ['gesamtmiete', 'warmmiete'],
    nebenkosten: ['nebenkosten'],
    kaution: ['kaution-o-genossenschaftsanteile', 'kaution'],
    wohnflaeche: ['wohnflaeche-ca', 'wohnflaeche'],
    zimmer: ['zimmer', 'zi'],
    etage: ['etage'],
    bezugsfrei: ['bezugsfrei-ab', 'bezugsfrei'],
    baujahr: ['baujahr'],
    objekttyp: ['typ'],
    heizungsart: ['heizungsart'],
    energieverbrauch: ['endenergiebedarf', 'wesentlicher-energieverbrauch'],
    energieeffizienzklasse: ['energieeffizienzklasse'],
    aufzug: ['personenaufzug'],
    garage: ['garage-stellplatz'],
    haustiere: ['haustiere'],
    heizkosten: ['heizkosten'],
    energietraeger: ['wesentliche-energietraeger'],
    objektzustand: ['objektzustand'],
  };

  const matchedKeys = new Set<string>();
  for (const [field, cssKeys] of Object.entries(primaryFields)) {
    for (const cssKey of cssKeys) {
      const el = document.querySelector(`dd.is24qa-${cssKey}`);
      if (el) {
        // Energy efficiency class contains an img with alt text (e.g. "D")
        const img = el.querySelector('img');
        (details as Record<string, unknown>)[field] = img
          ? (img as HTMLImageElement).alt
          : (el.textContent || '').trim();
        matchedKeys.add(cssKey);
        break;
      }
    }
  }

  // Main criteria fallback (the big numbers at the top of the page)
  if (!details.kaltmiete) {
    const el = document.querySelector('.is24qa-kaltmiete-main');
    if (el) details.kaltmiete = (el.textContent || '').trim();
  }
  if (!details.warmmiete) {
    const el = document.querySelector('.is24qa-warmmiete-main');
    if (el) details.warmmiete = (el.textContent || '').trim();
  }
  if (!details.zimmer) {
    const el = document.querySelector('.is24qa-zi-main');
    if (el) details.zimmer = (el.textContent || '').trim();
  }
  if (!details.wohnflaeche) {
    const el = document.querySelector('.is24qa-flaeche-main');
    if (el) details.wohnflaeche = (el.textContent || '').trim();
  }

  // Boolean criteria (Balkon, Keller, Einbauküche, etc.) — spans, not dd elements
  document.querySelectorAll('.criteriagroup.boolean-listing span[class*="is24qa-"]').forEach((span) => {
    const text = (span.textContent || '').trim();
    if (text) {
      const cls = Array.from(span.classList).find((c) => c.startsWith('is24qa-'));
      if (cls) matchedKeys.add(cls.replace('is24qa-', '').replace('-label', ''));
    }
  });

  // Internet speed from media availability widget
  if (!details.internet) {
    const container = document.getElementById('expose-media-availability-container');
    if (container) {
      const speedText = Array.from(container.querySelectorAll('span')).find((s) =>
        /\d+\s*MBit/i.test(s.textContent || ''),
      );
      if (speedText) details.internet = (speedText.textContent || '').trim();
    }
  }

  // Extra attributes: collect any other is24qa-* dd elements not already matched
  const extraAttrs: Record<string, string> = {};
  document.querySelectorAll('dd[class*="is24qa-"]').forEach((dd) => {
    const classes = Array.from(dd.classList);
    const qaClass = classes.find((c) => c.startsWith('is24qa-'));
    if (qaClass) {
      const key = qaClass.replace('is24qa-', '');
      if (!matchedKeys.has(key)) {
        const img = dd.querySelector('img');
        extraAttrs[key] = img ? (img as HTMLImageElement).alt : (dd.textContent || '').trim();
      }
    }
  });
  if (Object.keys(extraAttrs).length > 0) details.extraAttributes = extraAttrs;

  // Collect ALL dt/dd pairs as extra attributes (catches any structured data)
  const allDtDd: Record<string, string> = {};
  document.querySelectorAll('dl').forEach((dl) => {
    const dts = dl.querySelectorAll('dt');
    dts.forEach((dt) => {
      const label = (dt.textContent || '').trim();
      const dd = dt.nextElementSibling;
      if (dd?.tagName === 'DD' && label && label.length < 60) {
        const img = dd.querySelector('img');
        const value = img ? (img as HTMLImageElement).alt : (dd.textContent || '').trim();
        if (value && value.length < 200) {
          allDtDd[label] = value;
        }
      }
    });
  });
  if (Object.keys(allDtDd).length > 0) {
    details.extraAttributes = { ...allDtDd, ...(details.extraAttributes || {}) };
  }

  // Description sections
  const descSections: string[] = [];
  const sectionSelectors = [
    '.is24qa-objektbeschreibung',
    '.is24qa-ausstattung',
    '.is24qa-lage',
    '.is24qa-sonstiges',
    '.is24qa-freitext',
    '[data-qa="objektbeschreibung"]',
    '[data-qa="ausstattung"]',
    '[data-qa="lage"]',
  ];
  for (const sel of sectionSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.textContent || '').trim();
      if (text.length > 10) descSections.push(text);
    }
  }
  if (descSections.length > 0) details.description = descSections.join('\n\n');

  // Amenities: boolean criteria (spans) + list items
  const amenities: string[] = [];
  document.querySelectorAll('.criteriagroup.boolean-listing span[class*="is24qa-"]').forEach((span) => {
    const text = (span.textContent || '').trim();
    if (text && text.length < 100) amenities.push(text);
  });
  document.querySelectorAll('.is24qa-ausstattung li, .criteriagroup li').forEach((li) => {
    const text = (li.textContent || '').trim();
    if (text && text.length < 100) amenities.push(text);
  });
  if (amenities.length > 0) details.amenities = amenities;

  // Pet/smoking restrictions via body text (only if not already extracted)
  const bodyText = document.body.innerText;
  if (!details.haustiere) {
    const petMatch = bodyText.match(/haustiere[:\s]*(erlaubt|nicht erlaubt|nach absprache|ja|nein)/i);
    if (petMatch) details.haustiere = petMatch[0].trim();
  }

  const smokeMatch = bodyText.match(/rauch(en|er|verbot)[:\s]*(erlaubt|nicht erlaubt|ja|nein)?/i);
  if (smokeMatch) details.rauchen = smokeMatch[0].trim();

  // WBS detection (Wohnberechtigungsschein requirement)
  const wbsMatch = bodyText.match(/wohnberechtigungsschein|wbs[- ]?(erforderlich|nötig|notwendig|schein)/i);
  if (wbsMatch) details.wbs = 'Erforderlich';

  // Raw text fallback (capped at 8000 chars)
  details.rawText = bodyText.substring(0, C.RAW_TEXT_CAP);

  log('[IS24] Extracted listing details:', Object.keys(details).join(', '));
  return details;
}
