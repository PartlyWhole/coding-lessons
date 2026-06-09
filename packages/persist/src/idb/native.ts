import type {
  IdbConnection,
  IdbDriver,
  IdbIndexHandle,
  IdbStoreHandle,
  IdbTxnHandle,
  KeyRange,
  Mode,
  StoreSpec,
} from "./types.js";

// Wrap a single IDBRequest as a promise.
function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IDBRequest error"));
  });
}

function toIDBKeyRange(range: KeyRange): IDBKeyRange {
  if ("only" in range) return IDBKeyRange.only(range.only);
  if (range.lower !== undefined && range.upper !== undefined)
    return IDBKeyRange.bound(range.lower, range.upper, range.lowerOpen ?? false, range.upperOpen ?? false);
  if (range.lower !== undefined) return IDBKeyRange.lowerBound(range.lower, range.lowerOpen ?? false);
  if (range.upper !== undefined) return IDBKeyRange.upperBound(range.upper, range.upperOpen ?? false);
  throw new Error("nativeDriver: empty KeyRange");
}

/**
 * Production driver over the browser's IndexedDB. NOTE: there is no real IndexedDB under Node, so
 * this is typecheck/build-verified offline but its runtime behavior is verified only in a browser
 * (same deferral posture as M3a/M3b real-Pyodide). The memory driver proves the persist logic.
 */
export function nativeDriver(indexedDB: IDBFactory = globalThis.indexedDB): IdbDriver {
  return {
    open(name: string, version: number, specs: readonly StoreSpec[]): Promise<IdbConnection> {
      return new Promise((resolve, reject) => {
        const openReq = indexedDB.open(name, version);
        openReq.onupgradeneeded = () => {
          const db = openReq.result;
          for (const spec of specs) {
            if (db.objectStoreNames.contains(spec.name)) continue;
            const store = db.createObjectStore(spec.name, { keyPath: spec.keyPath });
            for (const ix of spec.indexes ?? []) store.createIndex(ix.name, ix.keyPath);
          }
        };
        openReq.onsuccess = () => resolve(makeConnection(openReq.result));
        openReq.onerror = () => reject(openReq.error ?? new Error("indexedDB.open failed"));
      });
    },
  };
}

function makeConnection(db: IDBDatabase): IdbConnection {
  return {
    close: () => db.close(),
    tx<T>(stores: readonly string[], mode: Mode, body: (tx: IdbTxnHandle) => Promise<T>): Promise<T> {
      const transaction = db.transaction(stores as string[], mode);
      const wrapStore = (name: string): IdbStoreHandle => {
        const os = transaction.objectStore(name);
        return {
          put: (value: unknown) => req(os.put(value)).then(() => undefined),
          get: (key: IDBValidKey) => req(os.get(key) as IDBRequest<unknown>),
          getAll: () => req(os.getAll() as IDBRequest<unknown[]>),
          delete: (key: IDBValidKey) => req(os.delete(key)).then(() => undefined),
          index: (indexName: string): IdbIndexHandle => {
            const ix = os.index(indexName);
            return { getAll: (range?: KeyRange) => req(ix.getAll(range ? toIDBKeyRange(range) : undefined) as IDBRequest<unknown[]>) };
          },
        };
      };
      const txnHandle: IdbTxnHandle = { store: wrapStore };
      // Run the body (issuing requests on the live txn), then await the native commit/abort.
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error("transaction aborted"));
        transaction.onerror = () => reject(transaction.error ?? new Error("transaction error"));
      });
      return body(txnHandle).then(
        async (result) => {
          await done; // wait for the real commit
          return result;
        },
        (err: unknown) => {
          try {
            transaction.abort();
          } catch {
            /* already aborting */
          }
          throw err;
        },
      );
    },
  };
}
