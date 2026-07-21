// Extract full-resolution gallery image URLs from an ImmoScout24 listing page.
// Strategy: scan the raw HTML for every `pictures.immobilienscout24.de/listings/{uuid}-{id}.jpg`
// base and derive one max-quality URL per unique base. Verified on a live listing
// that all ~N gallery images are present in the initial HTML (no lazy "show all" modal needed).

const PIC_BASE = /https:\/\/pictures\.immobilienscout24\.de\/listings\/([a-f0-9-]+-\d+)\.jpg/gi;
const FULLRES_SUFFIX = '/ORIG/resize/2560x1920%3E/format/webp/quality/95';

export function collectGalleryImageUrls(): string[] {
  const html = document.documentElement.outerHTML;
  const bases = new Set<string>();
  for (const m of html.matchAll(PIC_BASE)) {
    bases.add(`https://pictures.immobilienscout24.de/listings/${m[1]}.jpg`);
  }
  return Array.from(bases).map((b) => b + FULLRES_SUFFIX);
}

/** Parse listing id out of an `/expose/<id>` URL. Returns null if not a listing page. */
export function getListingIdFromUrl(href: string = location.href): string | null {
  const match = href.match(/\/expose\/(\d+)/);
  return match ? match[1] : null;
}
