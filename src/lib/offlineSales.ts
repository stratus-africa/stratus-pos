/**
 * Offline sale queue.
 *
 * When the till loses connectivity, completed sales are written to IndexedDB
 * with a client-generated sale id (the idempotency key) and replayed once the
 * browser is back online. Because the sale id is minted offline, a replay can
 * never create a duplicate: the flush checks for the row first and skips it.
 */

export interface QueuedSale {
  /** Client-generated sales.id — the idempotency key. */
  id: string;
  createdAt: string;
  sale: Record<string, unknown>;
  items: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  adjustments: Record<string, unknown>[];
  bankTransaction: Record<string, unknown> | null;
  /** Product id -> quantity sold, applied to inventory on sync. */
  inventoryDeltas: { product_id: string; location_id: string; quantity: number }[];
}

const DB_NAME = "stratus_pos_offline";
const STORE = "sales";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function enqueueSale(sale: QueuedSale): Promise<void> {
  await tx("readwrite", (s) => s.put(sale) as unknown as IDBRequest<IDBValidKey>);
}

export async function listQueuedSales(): Promise<QueuedSale[]> {
  try {
    const rows = await tx<QueuedSale[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedSale[]>);
    return rows ?? [];
  } catch {
    return [];
  }
}

export async function countQueuedSales(): Promise<number> {
  return (await listQueuedSales()).length;
}

export async function removeQueuedSale(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
