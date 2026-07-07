// IndexedDB helpers for user-uploaded document attachments (CV, payslips, Schufa,
// etc.) that get appended after the filled Selbstauskunft form.
//
// Two-store schema: `attachmentMeta` holds {id, filename, addedAt} and is read for
// the list UI; `attachmentBlobs` holds {id, bytes} and is read only at generation
// time. This keeps the popup from deserializing every PDF's bytes just to render
// filenames. The two stores share the id assigned by the meta store.

import * as C from './constants';

export interface AttachmentMeta {
  id: number;
  filename: string;
  addedAt: number;
}

interface AttachmentBlob {
  id: number;
  bytes: ArrayBuffer;
}

function openAttachmentsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(C.ATTACHMENTS_IDB_NAME, C.ATTACHMENTS_IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 stored everything (incl. bytes) in a single `attachments` store. Drop
      // it; the attachments feature is new and unreleased, so there's no data to
      // migrate.
      if (db.objectStoreNames.contains('attachments')) {
        db.deleteObjectStore('attachments');
      }
      if (!db.objectStoreNames.contains(C.ATTACHMENTS_META_STORE)) {
        db.createObjectStore(C.ATTACHMENTS_META_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(C.ATTACHMENTS_BLOBS_STORE)) {
        db.createObjectStore(C.ATTACHMENTS_BLOBS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addAttachment(filename: string, bytes: ArrayBuffer): Promise<number> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([C.ATTACHMENTS_META_STORE, C.ATTACHMENTS_BLOBS_STORE], 'readwrite');
    // Let the meta store assign the auto-increment id, then reuse it for the blob.
    const metaReq = tx.objectStore(C.ATTACHMENTS_META_STORE).add({ filename, addedAt: Date.now() });
    metaReq.onsuccess = () => {
      const id = metaReq.result as number;
      tx.objectStore(C.ATTACHMENTS_BLOBS_STORE).put({ id, bytes });
    };
    tx.oncomplete = () => resolve(metaReq.result as number);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listAttachments(): Promise<AttachmentMeta[]> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(C.ATTACHMENTS_META_STORE, 'readonly');
    const req = tx.objectStore(C.ATTACHMENTS_META_STORE).getAll();
    req.onsuccess = () => {
      const records = (req.result as AttachmentMeta[]) || [];
      records.sort((a, b) => a.id - b.id);
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

// Reads every attachment's bytes in insertion (id) order. Used only at PDF
// generation time.
export async function getAttachmentBlobs(): Promise<ArrayBuffer[]> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(C.ATTACHMENTS_BLOBS_STORE, 'readonly');
    const req = tx.objectStore(C.ATTACHMENTS_BLOBS_STORE).getAll();
    req.onsuccess = () => {
      const records = (req.result as AttachmentBlob[]) || [];
      records.sort((a, b) => a.id - b.id);
      resolve(records.map((r) => r.bytes));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAttachment(id: number): Promise<void> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([C.ATTACHMENTS_META_STORE, C.ATTACHMENTS_BLOBS_STORE], 'readwrite');
    tx.objectStore(C.ATTACHMENTS_META_STORE).delete(id);
    tx.objectStore(C.ATTACHMENTS_BLOBS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
