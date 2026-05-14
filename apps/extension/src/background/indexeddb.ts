// Background-side wrapper around the shared savedSnapshots IDB schema.
// Adds a cached connection and transaction-write helpers on top of the shared
// open/get primitives used by extension pages (viewer, print).

import * as C from '../shared/constants';
import { idbGet, openSnapshotDB } from '../shared/idb-snapshots';
import type { LandlordInfo, ListingDetails, SavedImage } from '../shared/types';

interface ImagesRecord {
  listingId: string;
  images: SavedImage[];
}

interface FullTextRecord {
  listingId: string;
  details: ListingDetails;
  landlord: LandlordInfo;
}

let dbPromise: Promise<IDBDatabase> | null = null;
function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openSnapshotDB();
  return dbPromise;
}

function txPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putImages(listingId: string, images: SavedImage[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(C.SAVED_SNAPSHOTS_IDB_IMAGES_STORE, 'readwrite');
  tx.objectStore(C.SAVED_SNAPSHOTS_IDB_IMAGES_STORE).put({ listingId, images } satisfies ImagesRecord);
  await txPromise(tx);
}

export async function getImages(listingId: string): Promise<SavedImage[]> {
  const db = await getDB();
  const record = await idbGet<ImagesRecord>(db, C.SAVED_SNAPSHOTS_IDB_IMAGES_STORE, listingId);
  return record?.images ?? [];
}

export async function putFullText(listingId: string, details: ListingDetails, landlord: LandlordInfo): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(C.SAVED_SNAPSHOTS_IDB_FULLTEXT_STORE, 'readwrite');
  tx.objectStore(C.SAVED_SNAPSHOTS_IDB_FULLTEXT_STORE).put({
    listingId,
    details,
    landlord,
  } satisfies FullTextRecord);
  await txPromise(tx);
}

export async function getFullText(
  listingId: string,
): Promise<{ details: ListingDetails; landlord: LandlordInfo } | null> {
  const db = await getDB();
  const record = await idbGet<FullTextRecord>(db, C.SAVED_SNAPSHOTS_IDB_FULLTEXT_STORE, listingId);
  if (!record) return null;
  return { details: record.details, landlord: record.landlord };
}

export async function deleteListing(listingId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([C.SAVED_SNAPSHOTS_IDB_IMAGES_STORE, C.SAVED_SNAPSHOTS_IDB_FULLTEXT_STORE], 'readwrite');
  tx.objectStore(C.SAVED_SNAPSHOTS_IDB_IMAGES_STORE).delete(listingId);
  tx.objectStore(C.SAVED_SNAPSHOTS_IDB_FULLTEXT_STORE).delete(listingId);
  await txPromise(tx);
}
