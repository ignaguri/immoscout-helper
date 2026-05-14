// Print page: renders a listing snapshot and fires window.print().
// Two input modes:
//   ?key=K → session stash with { details, landlord, imageUrls, ... }; images
//            re-fetched from the CDN (extension has host permission).
//   ?id=X  → saved snapshot; images read as blobs from IndexedDB.

import * as C from '../shared/constants';
import { buildSelfContainedHtml, type HtmlImageRef } from '../shared/export-html';
import { idbGet, openSnapshotDB } from '../shared/idb-snapshots';
import type { SavedImage, SavedSnapshotMeta } from '../shared/types';

interface SessionStash {
  details: any;
  landlord: any;
  imageUrls: string[];
  sourceUrl: string;
  savedAt: number;
}
interface PrintData {
  details: any;
  landlord: any;
  images: HtmlImageRef[];
  sourceUrl: string;
  savedAt: number;
}

function waitForImages(root: ParentNode, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve) => {
    const imgs = Array.from(root.querySelectorAll('img'));
    if (imgs.length === 0) return resolve();
    let remaining = imgs.length;
    const done = () => {
      if (--remaining <= 0) resolve();
    };
    setTimeout(resolve, timeoutMs);
    for (const img of imgs) {
      if (img.complete) {
        done();
        continue;
      }
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
}

async function loadFromSession(key: string): Promise<PrintData | null> {
  const stored = await chrome.storage.session.get([key]);
  const stash = stored[key] as SessionStash | undefined;
  if (!stash) return null;
  await chrome.storage.session.remove(key).catch(() => {});
  return {
    details: stash.details,
    landlord: stash.landlord,
    images: (stash.imageUrls || []).map((url, i) => ({ src: url, alt: `Image ${i + 1}` })),
    sourceUrl: stash.sourceUrl,
    savedAt: stash.savedAt,
  };
}

async function loadFromIdb(listingId: string, blobUrls: string[]): Promise<PrintData | null> {
  const { [C.SAVED_SNAPSHOTS_KEY]: indexRaw } = await chrome.storage.local.get([C.SAVED_SNAPSHOTS_KEY]);
  const meta = ((indexRaw || {}) as Record<string, SavedSnapshotMeta>)[listingId];
  if (!meta) return null;

  const db = await openSnapshotDB();
  const [imagesRec, textRec] = await Promise.all([
    idbGet<{ listingId: string; images: SavedImage[] }>(db, C.SAVED_SNAPSHOTS_IDB_IMAGES_STORE, listingId),
    idbGet<{ listingId: string; details: any; landlord: any }>(db, C.SAVED_SNAPSHOTS_IDB_FULLTEXT_STORE, listingId),
  ]);
  if (!textRec) return null;
  const refs: HtmlImageRef[] = (imagesRec?.images || []).map((img, i) => {
    const url = URL.createObjectURL(img.blob);
    blobUrls.push(url);
    return { src: url, alt: `Image ${i + 1}` };
  });
  return {
    details: textRec.details,
    landlord: textRec.landlord,
    images: refs,
    sourceUrl: meta.url,
    savedAt: meta.savedAt,
  };
}

async function render(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const key = params.get('key');
  const id = params.get('id');
  const blobUrls: string[] = [];

  const data = key
    ? await loadFromSession(key)
    : id
      ? await loadFromIdb(id, blobUrls)
      : null;

  if (!data) {
    document.getElementById('print-root')!.textContent = 'No print data found.';
    return;
  }

  window.addEventListener('pagehide', () => blobUrls.forEach((u) => URL.revokeObjectURL(u)), { once: true });

  const html = buildSelfContainedHtml({ ...data, printMode: true });
  document.open();
  document.write(html);
  document.close();

  await waitForImages(document);
  window.print();
}

render().catch((e) => {
  const root = document.getElementById('print-root');
  if (root) root.textContent = `Failed to prepare print: ${e?.message || e}`;
});
