/**
 * Tiny IndexedDB store for the last-uploaded sales CSV.
 *
 * Why IndexedDB and not localStorage: a POS export is several MB, well past
 * localStorage's ~5MB ceiling, and IndexedDB stores it without blocking the UI.
 * The data lives only in THIS browser on THIS machine — it is never uploaded,
 * which is the whole point of the no-server design.
 *
 * We store the raw CSV text (not the parsed summary) so that when the Phase-3
 * grouping rules change, reopening the app re-aggregates with the new rules
 * rather than replaying a stale precomputed result.
 */

const DB_NAME = 'mpt-omniportal';
const STORE = 'kv';
const KEY = 'sales-csv';

export interface StoredCsv {
  text: string;
  fileName: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCsv(text: string, fileName: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ text, fileName, savedAt: Date.now() } as StoredCsv, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadCsv(): Promise<StoredCsv | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null; // private mode / storage blocked — behave as "no saved data"
  }
  try {
    return await new Promise<StoredCsv | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as StoredCsv) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function clearCsv(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
