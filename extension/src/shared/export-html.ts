// Pure functions for building a self-contained HTML snapshot of a listing.
// Designed to work in both the service worker (data-URL images) and the
// in-extension viewer page (Blob URL images) by accepting pre-resolved image
// src strings from the caller.

import type { LandlordInfo, ListingDetails } from '@repo/shared-types';

export interface HtmlImageRef {
  /** src attribute — can be a data: URL, blob: URL, or any resolvable URL. */
  src: string;
  alt?: string;
}

export interface BuildHtmlOptions {
  details: ListingDetails;
  landlord: LandlordInfo;
  /** Image srcs, already resolved to strings suitable for inline HTML. */
  images: HtmlImageRef[];
  /** Original listing URL. */
  sourceUrl: string;
  /** Timestamp (ms) when the snapshot was taken. */
  savedAt: number;
  /** If true, emits print-friendly CSS tweaks. Used by the PDF flow. */
  printMode?: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function renderKeyValueRows(details: ListingDetails): string {
  const HIDDEN = new Set(['rawText', 'description', 'amenities']);
  const rows: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (HIDDEN.has(key)) continue;
    if (value == null || value === '') continue;
    const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
    rows.push(`<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(display)}</td></tr>`);
  }
  return rows.length ? `<table class="kv">${rows.join('')}</table>` : '';
}

function renderAmenities(details: ListingDetails): string {
  if (!Array.isArray(details.amenities) || details.amenities.length === 0) return '';
  const items = details.amenities
    .filter((a) => a && typeof a === 'string')
    .map((a) => `<li>${escapeHtml(a)}</li>`)
    .join('');
  if (!items) return '';
  return `<section><h2>Amenities</h2><ul class="amenities">${items}</ul></section>`;
}

function renderDescription(details: ListingDetails): string {
  if (!details.description) return '';
  const paragraphs = String(details.description)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  if (!paragraphs) return '';
  return `<section><h2>Description</h2>${paragraphs}</section>`;
}

function renderLandlord(landlord: LandlordInfo): string {
  if (!landlord?.name) return '';
  const parts: string[] = [];
  if (landlord.title) parts.push(escapeHtml(landlord.title));
  parts.push(escapeHtml(landlord.name));
  const line = parts.join(' ');
  const badge = landlord.isPrivate ? ' <span class="badge">Private</span>' : '';
  return `<section class="landlord"><h2>Landlord</h2><p>${line}${badge}</p></section>`;
}

function renderGallery(images: HtmlImageRef[]): string {
  if (images.length === 0) return '<section><h2>Images</h2><p><em>No images saved.</em></p></section>';
  const figures = images
    .map((img, i) => {
      const alt = escapeAttr(img.alt || `Image ${i + 1}`);
      return `<figure><img src="${escapeAttr(img.src)}" alt="${alt}" loading="lazy"></figure>`;
    })
    .join('');
  return `<section><h2>Images (${images.length})</h2><div class="gallery">${figures}</div></section>`;
}

function styles(printMode: boolean): string {
  return `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #222; line-height: 1.5; margin: 0; padding: 24px; background: #fafafa; }
    main { max-width: 980px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    h2 { font-size: 16px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
    .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
    .meta a { color: #3dbda8; text-decoration: none; }
    table.kv { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    table.kv th { text-align: left; width: 40%; padding: 6px 10px; background: #f5f5f5; font-weight: 500; color: #444; border: 1px solid #eee; vertical-align: top; }
    table.kv td { padding: 6px 10px; border: 1px solid #eee; }
    ul.amenities { columns: 2; margin: 8px 0 0; padding-left: 20px; font-size: 13px; }
    ul.amenities li { margin-bottom: 2px; break-inside: avoid; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; margin-top: 8px; }
    .gallery figure { margin: 0; }
    .gallery img { width: 100%; height: 220px; object-fit: cover; border-radius: 6px; display: block; background: #eee; }
    .badge { display: inline-block; padding: 1px 6px; background: #e8eaff; color: #333; border-radius: 4px; font-size: 11px; vertical-align: middle; }
    section p { margin: 4px 0; }
    ${
      printMode
        ? `
    @page { margin: 1.5cm; }
    @media print {
      body { background: white; padding: 0; }
      main { box-shadow: none; padding: 0; max-width: none; margin: 0; }
      .gallery img { height: 180px; }
      section { break-inside: avoid; }
    }
    `
        : ''
    }
  `;
}

export function buildSelfContainedHtml(opts: BuildHtmlOptions): string {
  const { details, landlord, images, sourceUrl, savedAt, printMode = false } = opts;
  const title = (details as any).title || 'ImmoScout24 Snapshot';
  const address = (details as any).address || '';
  const savedDate = new Date(savedAt).toLocaleString();
  const bodyInner = [
    `<h1>${escapeHtml(title)}</h1>`,
    address ? `<p class="meta">${escapeHtml(address)}</p>` : '',
    `<p class="meta">Saved on ${escapeHtml(savedDate)} · <a href="${escapeAttr(sourceUrl)}">Original listing</a></p>`,
    renderGallery(images),
    renderKeyValueRows(details),
    renderDescription(details),
    renderAmenities(details),
    renderLandlord(landlord),
  ]
    .filter(Boolean)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${styles(printMode)}</style>
</head>
<body>
<main>
${bodyInner}
</main>
</body>
</html>`;
}

/** Returns a filename-safe slug from the listing's address (fallback: listingId). */
export function slugForFilename(details: ListingDetails, listingId: string): string {
  const source = (details as any).address || (details as any).title || listingId;
  const slug = String(source)
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' })[c] ?? c)
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || listingId;
}
