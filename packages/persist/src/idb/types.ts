// Narrow, Promise-based IndexedDB surface. Deliberately tiny: only what @trellis/persist
// needs. nativeDriver adapts the DOM event API to this; memoryDriver implements it directly.

export type Mode = "readonly" | "readwrite";

// Portable key-range (native maps to IDBKeyRange; memory filters via src/idb/keys.ts).
export type KeyRange =
  | { only: IDBValidKey }
  | { lower?: IDBValidKey; upper?: IDBValidKey; lowerOpen?: boolean; upperOpen?: boolean };

export interface IdbIndexHandle {
  /** All values whose index key falls in `range` (or all, if omitted), in ascending key order. */
  getAll(range?: KeyRange): Promise<unknown[]>;
}

export interface IdbStoreHandle {
  put(value: unknown): Promise<void>;
  get(key: IDBValidKey): Promise<unknown>;
  getAll(): Promise<unknown[]>;
  delete(key: IDBValidKey): Promise<void>;
  index(name: string): IdbIndexHandle;
}

export interface IdbTxnHandle {
  store(name: string): IdbStoreHandle;
}

export interface IdbConnection {
  /**
   * Run `body` inside ONE transaction over `stores`. Resolves with the body's value when the
   * txn commits. If `body` throws OR any operation errors, the txn ABORTS and all writes in it
   * are discarded (all-or-nothing), and the returned promise rejects with that error.
   */
  tx<T>(stores: readonly string[], mode: Mode, body: (tx: IdbTxnHandle) => Promise<T>): Promise<T>;
  close(): void;
}

export interface IndexSpec {
  name: string;
  keyPath: string | string[];
}

export interface StoreSpec {
  name: string;
  keyPath: string;
  indexes?: IndexSpec[];
}

export interface IdbDriver {
  /** Open (creating/upgrading to) the DB at `version` with exactly `stores`. */
  open(name: string, version: number, stores: readonly StoreSpec[]): Promise<IdbConnection>;
}
