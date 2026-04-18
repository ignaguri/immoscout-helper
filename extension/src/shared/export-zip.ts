// ZIP export for a saved listing snapshot.
// Produces: index.html (relative image refs), images/NN.ext, data.json, README.txt

import type { LandlordInfo, ListingDetails } from '@repo/shared-types';
import JSZip from 'jszip';
import { buildSelfContainedHtml } from './export-html';
import type { SavedImage } from './types';

function extFromMime(mime: string): string {
  if (/webp/i.test(mime)) return 'webp';
  if (/jpe?g/i.test(mime)) return 'jpg';
  if (/png/i.test(mime)) return 'png';
  if (/gif/i.test(mime)) return 'gif';
  return 'bin';
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

export async function buildZip(opts: {
  details: ListingDetails;
  landlord: LandlordInfo;
  images: SavedImage[];
  sourceUrl: string;
  savedAt: number;
  listingId: string;
}): Promise<Blob> {
  const { details, landlord, images, sourceUrl, savedAt, listingId } = opts;
  const zip = new JSZip();
  const imagesFolder = zip.folder('images');

  const imageRefs: { src: string; alt?: string }[] = [];
  images.forEach((img, i) => {
    const ext = extFromMime(img.mimeType);
    const filename = `${pad(i + 1)}.${ext}`;
    imagesFolder?.file(filename, img.blob);
    imageRefs.push({ src: `images/${filename}`, alt: `Bild ${i + 1}` });
  });

  const html = buildSelfContainedHtml({
    details,
    landlord,
    images: imageRefs,
    sourceUrl,
    savedAt,
  });
  zip.file('index.html', html);

  zip.file(
    'data.json',
    JSON.stringify(
      {
        listingId,
        sourceUrl,
        savedAt,
        savedAtIso: new Date(savedAt).toISOString(),
        details,
        landlord,
        imageFiles: imageRefs.map((r) => r.src),
      },
      null,
      2,
    ),
  );

  zip.file(
    'README.txt',
    [
      'ImmoScout24 listing snapshot',
      `Source: ${sourceUrl}`,
      `Saved: ${new Date(savedAt).toLocaleString()}`,
      '',
      'Open index.html in any browser to view the archive offline.',
      'data.json contains the full structured data.',
      `Images (${images.length}): see ./images/`,
    ].join('\n'),
  );

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } });
}
