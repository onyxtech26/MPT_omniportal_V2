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

/**
 * Saved-report history (added in DB v2).
 *
 * Metadata and payload are deliberately in SEPARATE stores. A POS export is
 * ~9 MB, so a single store would force the history list to deserialise every
 * saved CSV just to render a few filenames. `META` holds kilobytes and is what
 * the list reads; `DATA` holds the text and is touched only when a report is
 * actually opened.
 */
const META = 'reportMeta';
const DATA = 'reportData';

/** Newest N reports are kept; older ones are evicted on save. */
export const HISTORY_LIMIT = 5;

export interface StoredCsv {
  text: string;
  fileName: string;
  savedAt: number;
}

/** What the history list shows — no CSV text, so it stays cheap to read. */
export interface ReportMeta {
  id: number;
  fileName: string;
  savedAt: number;
  byteSize: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 2);
    // Runs for a brand-new database AND for an existing v1 one, so each store is
    // created only if missing — a v1 user keeps their `kv` entry and simply gains
    // the two history stores.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
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

// ---- Saved-report history ---------------------------------------------------

/** Promise wrapper for a single IDBRequest. */
function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Saved reports, newest first. Reads metadata only — never the CSV text. */
export async function listReports(): Promise<ReportMeta[]> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return []; // private mode / storage blocked — behave as "no history"
  }
  try {
    const all = await done(db.transaction(META, 'readonly').objectStore(META).getAll());
    return (all as ReportMeta[]).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/**
 * Remember a report. Re-saving the same file replaces its entry rather than
 * piling up copies, and only the newest `HISTORY_LIMIT` are kept — at ~9 MB a
 * file, an uncapped history would run into the browser's storage quota.
 *
 * Throws if the write fails (quota, private mode); callers treat history as a
 * convenience and must not let a failure here block loading the data.
 */
export async function saveReport(text: string, fileName: string): Promise<void> {
  const db = await openDb();
  try {
    const existing = (await done(
      db.transaction(META, 'readonly').objectStore(META).getAll(),
    )) as ReportMeta[];

    const byteSize = text.length;
    // Same name and same size = the same file reopened.
    const supersedes = existing.filter((r) => r.fileName === fileName && r.byteSize === byteSize);
    const kept = existing
      .filter((r) => !supersedes.includes(r))
      .sort((a, b) => b.savedAt - a.savedAt);
    const evicted = [...supersedes, ...kept.slice(HISTORY_LIMIT - 1)];

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META, DATA], 'readwrite');
      const meta = tx.objectStore(META);
      const data = tx.objectStore(DATA);
      for (const r of evicted) { meta.delete(r.id); data.delete(r.id); }
      const id = Date.now();
      meta.put({ id, fileName, savedAt: id, byteSize } satisfies ReportMeta);
      data.put(text, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Fetch one saved report in full. Returns null if it has since been removed. */
export async function loadReport(id: number): Promise<StoredCsv | null> {
  const db = await openDb();
  try {
    const tx = db.transaction([META, DATA], 'readonly');
    const meta = (await done(tx.objectStore(META).get(id))) as ReportMeta | undefined;
    const text = (await done(tx.objectStore(DATA).get(id))) as string | undefined;
    if (!meta || text === undefined) return null;
    return { text, fileName: meta.fileName, savedAt: meta.savedAt };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function deleteReport(id: number): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META, DATA], 'readwrite');
      tx.objectStore(META).delete(id);
      tx.objectStore(DATA).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function clearReports(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META, DATA], 'readwrite');
      tx.objectStore(META).clear();
      tx.objectStore(DATA).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
