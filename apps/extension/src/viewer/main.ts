// Standalone viewer page for a saved snapshot.
// Loads meta from chrome.storage.local + full data from IndexedDB, then renders
// the export HTML with blob: URLs for images (avoids base64 overhead).

import * as C from '../shared/constants';
import { buildSelfContainedHtml, type HtmlImageRef } from '../shared/export-html';
import { idbGet, openSnapshotDB } from '../shared/idb-snapshots';
import type { SavedImage, SavedSnapshotMeta } from '../shared/types';

interface ImagesRecord {
  listingId: string;
  images: SavedImage[];
}
interface FullTextRecord {
  listingId: string;
  details: any;
  landlord: any;
}

async function render(): Promise<void> {
  const root = document.getElementById('viewer-root')!;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    root.textContent = 'Missing ?id= query parameter.';
    return;
  }

  const { [C.SAVED_SNAPSHOTS_KEY]: indexRaw } = await chrome.storage.local.get([C.SAVED_SNAPSHOTS_KEY]);
  const meta = ((indexRaw || {}) as Record<string, SavedSnapshotMeta>)[id];
  if (!meta) {
    root.textContent = `No snapshot found for ID "${id}".`;
    return;
  }

  const db = await openSnapshotDB();
  const [imagesRec, textRec] = await Promise.all([
    idbGet<ImagesRecord>(db, C.SAVED_SNAPSHOTS_IDB_IMAGES_STORE, id),
    idbGet<FullTextRecord>(db, C.SAVED_SNAPSHOTS_IDB_FULLTEXT_STORE, id),
  ]);
  if (!textRec) {
    root.textContent = `Snapshot "${id}" has no detail data.`;
    return;
  }

  const blobUrls: string[] = [];
  const refs: HtmlImageRef[] = (imagesRec?.images || []).map((img, i) => {
    const url = URL.createObjectURL(img.blob);
    blobUrls.push(url);
    return { src: url, alt: `Image ${i + 1}` };
  });
  window.addEventListener('pagehide', () => blobUrls.forEach((u) => URL.revokeObjectURL(u)), { once: true });

  const html = buildSelfContainedHtml({
    details: textRec.details,
    landlord: textRec.landlord,
    images: refs,
    sourceUrl: meta.url,
    savedAt: meta.savedAt,
  });
  document.open();
  document.write(html);
  document.close();
}

render().catch((e) => {
  const root = document.getElementById('viewer-root');
  if (root) root.textContent = `Failed to load: ${e?.message || e}`;
});
