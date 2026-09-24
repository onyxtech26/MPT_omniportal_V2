/**
 * Offline outbox for repair intake — the one moment a dropped connection is
 * visible to a customer standing at the counter with their watch.
 *
 * This is deliberately NOT full offline sync (no read caching, no conflict
 * resolution, no background service worker). It solves exactly one problem:
 * "the network drops right as I press Save on a new job." See
 * docs/REPAIR_MODULE_SPEC.md §9 for why that scope line was drawn where it
 * was — full sync (PowerSync et al.) is a recurring cost to solve something
 * that happens a few times a month; this is a few hundred lines that solves
 * the one moment that actually matters.
 *
 * A completely separate IndexedDB database from lib/csvStore.ts on purpose —
 * different data, different lifetime, no reason for the two to ever share a
 * schema or a version number.
 */

import { createRepairJob, type CreateJobInput, type RepairJob } from './repairs';

const DB_NAME = 'mpt-repairs-outbox';
const STORE = 'pending';

export type OutboxEntry = {
  // Keyed by the job's own job_no (generated once at intake — see
  // CreateJobInput.jobNo) rather than a separate id, so there is exactly one
  // number for this job from the moment the counter presses Save, through
  // however many retries it takes to sync, to what's printed on the slip.
  input: CreateJobInput;
  queuedAt: number;
  lastError?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'input.jobNo' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueJob(input: CreateJobInput): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ input, queuedAt: Date.now() } satisfies OutboxEntry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listQueued(): Promise<OutboxEntry[]> {
  const db = await openDb();
  const entries = await new Promise<OutboxEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as OutboxEntry[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return entries.sort((a, b) => a.queuedAt - b.queuedAt);
}

async function removeQueued(jobNo: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(jobNo);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function markFailed(jobNo: string, message: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(jobNo);
    getReq.onsuccess = () => {
      const entry = getReq.result as OutboxEntry | undefined;
      if (entry) store.put({ ...entry, lastError: message });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * Retries every queued job. A job that fails because the network is still
 * down stays queued (not an error the user needs to see again); a job that
 * fails because the SERVER rejected it (e.g. a duplicate job_no, which
 * should never happen but the UNIQUE constraint is the real backstop) is
 * marked so the banner can surface it rather than retrying forever.
 */
export async function flushOutbox(): Promise<{ synced: RepairJob[]; stillQueued: number }> {
  const entries = await listQueued();
  const synced: RepairJob[] = [];
  for (const entry of entries) {
    try {
      const job = await createRepairJob(entry.input);
      await removeQueued(entry.input.jobNo);
      synced.push(job);
    } catch (err) {
      await markFailed(entry.input.jobNo, err instanceof Error ? err.message : String(err));
    }
  }
  const remaining = await listQueued();
  return { synced, stillQueued: remaining.length };
}
