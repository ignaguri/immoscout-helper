// Shared IndexedDB helpers for the saved-snapshots DB.
// Used by background/indexeddb.ts (service worker) and by the viewer/print
// extension pages, which run in separate bundles but must open the same DB
// with the same schema.

import * as C from './constants';

export function openSnapshotDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(C.SAVED_SNAPSHOTS_IDB_NAME, C.SAVED_SNAPSHOTS_IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(C.SAVED_SNAPSHOTS_IDB_IMAGES_STORE)) {
        db.createObjectStore(C.SAVED_SNAPSHOTS_IDB_IMAGES_STORE, { keyPath: 'listingId' });
      }
      if (!db.objectStoreNames.contains(C.SAVED_SNAPSHOTS_IDB_FULLTEXT_STORE)) {
        db.createObjectStore(C.SAVED_SNAPSHOTS_IDB_FULLTEXT_STORE, { keyPath: 'listingId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}
