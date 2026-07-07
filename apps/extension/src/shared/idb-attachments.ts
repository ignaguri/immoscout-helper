// IndexedDB helpers for user-uploaded document attachments (CV, payslips, Schufa,
// etc.) that get appended after the filled Selbstauskunft form. Mirrors the
// idb-snapshots.ts pattern but uses an auto-increment key since attachments are
// not tied to a listingId.

import * as C from './constants';

export interface AttachmentRecord {
  id: number;
  filename: string;
  bytes: ArrayBuffer;
  addedAt: number;
}

function openAttachmentsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(C.ATTACHMENTS_IDB_NAME, C.ATTACHMENTS_IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(C.ATTACHMENTS_IDB_STORE)) {
        db.createObjectStore(C.ATTACHMENTS_IDB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addAttachment(filename: string, bytes: ArrayBuffer): Promise<number> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(C.ATTACHMENTS_IDB_STORE, 'readwrite');
    // id is auto-assigned by the store; omit it from the written record.
    const record = { filename, bytes, addedAt: Date.now() };
    const req = tx.objectStore(C.ATTACHMENTS_IDB_STORE).add(record);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function listAttachments(): Promise<AttachmentRecord[]> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(C.ATTACHMENTS_IDB_STORE, 'readonly');
    const req = tx.objectStore(C.ATTACHMENTS_IDB_STORE).getAll();
    req.onsuccess = () => {
      const records = (req.result as AttachmentRecord[]) || [];
      records.sort((a, b) => a.id - b.id);
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAttachment(id: number): Promise<void> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(C.ATTACHMENTS_IDB_STORE, 'readwrite');
    const req = tx.objectStore(C.ATTACHMENTS_IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
