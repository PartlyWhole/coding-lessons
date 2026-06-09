import type {
  IdbConnection,
  IdbDriver,
  IdbIndexHandle,
  IdbStoreHandle,
  IdbTxnHandle,
  IndexSpec,
  KeyRange,
  Mode,
  StoreSpec,
} from "./types.js";
import { compareKeys, inRange } from "./keys.js";

// Sentinel for a staged delete in a transaction overlay (declared first; TDZ-safe).
const TOMBSTONE = Symbol("tombstone");

// Test-only fault injection: arm a store so its NEXT put rejects, simulating a mid-transaction
// IndexedDB request error. Consumed only by tests; production callers never pass one.
export class FaultController {
  private armed = new Set<string>();
  failPut(store: string): void {
    this.armed.add(store);
  }
  consume(store: string): boolean {
    if (this.armed.has(store)) {
      this.armed.delete(store);
      return true;
    }
    return false;
  }
}

interface StoreData {
  spec: StoreSpec;
  rows: Map<string, unknown>; // serialized-key -> deep-cloned value
}

interface DbData {
  version: number;
  stores: Map<string, StoreData>;
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function keyToStr(k: IDBValidKey): string {
  return JSON.stringify(k);
}

function extractKey(value: unknown, keyPath: string | string[]): IDBValidKey {
  const rec = value as Record<string, IDBValidKey | undefined>;
  const get = (p: string): IDBValidKey => {
    const v = rec[p];
    if (v === undefined) throw new Error(`memoryDriver: missing keyPath "${p}"`);
    return v;
  };
  if (Array.isArray(keyPath)) return keyPath.map(get);
  return get(keyPath);
}

// A factory instance holds all databases by name, so close()+open() round-trips data.
export function memoryDriver(opts: { faults?: FaultController } = {}): IdbDriver {
  const dbs = new Map<string, DbData>();

  return {
    open(name: string, version: number, specs: readonly StoreSpec[]): Promise<IdbConnection> {
      let db = dbs.get(name);
      if (!db) {
        db = { version, stores: new Map() };
        dbs.set(name, db);
      }
      // Create any missing stores (upgrade). Existing stores keep their rows (persistence).
      for (const spec of specs) {
        if (!db.stores.has(spec.name)) db.stores.set(spec.name, { spec, rows: new Map() });
      }
      db.version = version;
      return Promise.resolve(makeConnection(db, opts.faults));
    },
  };
}

function makeConnection(db: DbData, faults?: FaultController): IdbConnection {
  let open = true;
  return {
    close() {
      open = false; // data remains in the factory's `dbs` map → survives reopen
    },
    async tx<T>(stores: readonly string[], mode: Mode, body: (tx: IdbTxnHandle) => Promise<T>): Promise<T> {
      if (!open) throw new Error("memoryDriver: connection is closed");
      // Overlay = staged writes/deletes per store, applied to base only on successful commit.
      const overlay = new Map<string, Map<string, unknown>>();
      const stage = (name: string): Map<string, unknown> => {
        let m = overlay.get(name);
        if (!m) {
          m = new Map();
          overlay.set(name, m);
        }
        return m;
      };
      const storeData = (name: string): StoreData => {
        const sd = db.stores.get(name);
        if (!sd) throw new Error(`memoryDriver: no store "${name}"`);
        if (!stores.includes(name)) throw new Error(`memoryDriver: store "${name}" not in txn scope`);
        return sd;
      };

      const txn: IdbTxnHandle = {
        store(name: string): IdbStoreHandle {
          const sd = storeData(name);
          const readRow = (keyStr: string): unknown => {
            const ov = overlay.get(name);
            if (ov !== undefined && ov.has(keyStr)) {
              const v = ov.get(keyStr);
              return v === TOMBSTONE ? undefined : v;
            }
            return sd.rows.get(keyStr);
          };
          const liveRows = (): unknown[] => {
            const merged = new Map(sd.rows);
            const ov = overlay.get(name);
            if (ov) {
              for (const [k, v] of ov) {
                if (v === TOMBSTONE) merged.delete(k);
                else merged.set(k, v);
              }
            }
            return [...merged.values()].map(clone);
          };
          const handle: IdbStoreHandle = {
            put(value: unknown): Promise<void> {
              if (mode !== "readwrite") return Promise.reject(new Error("readonly txn"));
              if (faults?.consume(name)) return Promise.reject(new Error(`injected fault on "${name}"`));
              const key = extractKey(value, sd.spec.keyPath);
              stage(name).set(keyToStr(key), clone(value));
              return Promise.resolve();
            },
            get(key: IDBValidKey): Promise<unknown> {
              const r = readRow(keyToStr(key));
              return Promise.resolve(r === undefined ? undefined : clone(r));
            },
            getAll(): Promise<unknown[]> {
              return Promise.resolve(liveRows());
            },
            delete(key: IDBValidKey): Promise<void> {
              if (mode !== "readwrite") return Promise.reject(new Error("readonly txn"));
              stage(name).set(keyToStr(key), TOMBSTONE);
              return Promise.resolve();
            },
            index(indexName: string): IdbIndexHandle {
              const ix: IndexSpec | undefined = sd.spec.indexes?.find((i) => i.name === indexName);
              if (!ix) throw new Error(`memoryDriver: no index "${indexName}" on "${name}"`);
              return {
                getAll(range?: KeyRange): Promise<unknown[]> {
                  const out = liveRows()
                    .map((row) => ({ row, key: extractKey(row, ix.keyPath) }))
                    .filter(({ key }) => (range ? inRange(key, range) : true))
                    .sort((x, y) => compareKeys(x.key, y.key))
                    .map(({ row }) => row);
                  return Promise.resolve(out);
                },
              };
            },
          };
          return handle;
        },
      };

      // Run the body. On success, atomically apply the overlay; on any throw, discard it.
      const result = await body(txn);
      for (const [name, ops] of overlay) {
        const sd = db.stores.get(name);
        if (!sd) continue;
        for (const [keyStr, v] of ops) {
          if (v === TOMBSTONE) sd.rows.delete(keyStr);
          else sd.rows.set(keyStr, v);
        }
      }
      return result;
    },
  };
}
