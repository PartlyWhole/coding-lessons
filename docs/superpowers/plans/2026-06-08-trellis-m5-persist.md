# Trellis M5-persist (`@trellis/persist`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@trellis/persist`, the browser-local IndexedDB data layer for Trellis — the atomic `commitSubmission` transaction, learner-model read-back, the `behavioral_event` telemetry seam (`appendEvents`/`recentEvents`), and the `contentVersion`-keyed bundle cache — all over a zero-new-dependency IndexedDB abstraction.

**Architecture:** A narrow Promise-based IndexedDB driver interface (`IdbDriver`/`IdbConnection`) with **two implementations**: a thin `nativeDriver` wrapping `globalThis.indexedDB` (production; verify-deferred — no real IndexedDB under Node), and a faithful in-memory `memoryDriver` with real transaction staging/rollback and cross-`close()`/`open()` persistence (tests + the offline gates). All persist logic (`commitSubmission`, `loadLearnerModel`, `appendEvents`/`recentEvents`, `loadBundle`) is written once against the narrow interface, so the same code runs in the browser and under Vitest. The package is a leaf: it imports `@trellis/schema` + `@sinclair/typebox` only — never the engine or client.

**Tech Stack:** TypeScript (ESM, `moduleResolution: Bundler`, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`), Vitest, `@sinclair/typebox` (already in the offline store). **No `idb`, no `fake-indexeddb`** — both are absent from the offline pnpm store (`ERR_PNPM_NO_OFFLINE_META`); the two drivers are the sanctioned fallback (START-HERE §"Dependency pre-flight"). No `pnpm-lock.yaml` change → zero conflict with Stream E.

---

## Dependency pre-flight result (decided, do not re-litigate)

Ran in this worktree before planning:

```
$ pnpm add -w idb --offline
 ERR_PNPM_NO_OFFLINE_META  Failed to resolve idb@latest in package mirror .../idb.json
$ pnpm add -w -D fake-indexeddb --offline
 ERR_PNPM_NO_OFFLINE_META  Failed to resolve fake-indexeddb@latest ...
```

Neither resolves offline; there is no network. Per START-HERE we do **not** hand-fabricate the lockfile. Decision: **zero new deps** — hand-roll the small IndexedDB surface (`nativeDriver`) and an in-memory fake (`memoryDriver`). This is strictly better for parallel safety: `pnpm-lock.yaml` is untouched, so there is nothing for the orchestrator to reconcile against Stream E.

**Deferred (documented, same posture as M3a/M3b real-Pyodide):** `nativeDriver` runs against real browser IndexedDB only; offline it is typecheck/build-verified but not executed. The three defining gates (atomicity, reload survival, content cache) are proven against `memoryDriver`, which models the same transaction semantics. Real-IndexedDB execution of `nativeDriver` is verify-deferred to a browser env.

---

## Contract consumed from `@trellis/schema` (frozen — read only)

From `packages/schema/src/runtime.ts` and `bundle.ts` (verified present on this branch):

- `SkillState` = `{ mastery, attempts, passes, pKnown?, lastSeen, misconceptionCounts }` — **no `skillId` field**; the store adds it (see `StoredSkillState`).
- `LearnerModel` = `{ learnerId, skills: Record<SkillId, SkillState>, contentVersion }`.
- `Diagnosis` = `{ id, learnerId, stepId, contentVersion, submittedAt, correct, attribution, misconceptionId?, signals, skillDeltas, seed }`.
- `BehavioralEvent` = `{ id, learnerId, sessionId, seq, stepId, ts, type, payload }`.
- `Bundle` = `{ contentVersion, skills, nodes, cells, misconceptions, producers, requirements }`.
- `SkillId`, `StepId`, `ContentVersion` are all `Type.String()` (plain `string`).
- Helpers: `assertValid(schema, value)` (throws on mismatch) from `validate.ts`.

We **persist** the engine's already-computed outputs (§10.2 note: "you persist its outputs, you don't compute them"). `commitSubmission` does no mastery math.

---

## Design decisions locked in

1. **`commitSubmission` is write-only inside the transaction.** The caller passes fully-computed `StoredSkillState[]` + the `Diagnosis` + the `BehavioralEvent[]`. No read-modify-write inside the txn ⇒ the native IndexedDB transaction never spans a foreign `await` and so cannot auto-commit early (the classic `idb` footgun). All three stores are written in one `readwrite` txn; any request error aborts the whole txn (all-or-nothing).

2. **Narrow Promise interface, not the DOM IDB event API.** `memoryDriver` implements *my* small interface (≈5 methods), not the sprawling `IDBRequest`/event spec — keeping the fake small and correct. `nativeDriver` adapts the DOM event API to the same interface.

3. **One learner per browser profile** (§3.10). `learnerId` is generated once via an injected `idGen` (default `crypto.randomUUID`) and stored in `meta`. Tests inject a deterministic `idGen`.

4. **Stores** (§3.10 + the START-HERE `content_cache`): `learner_skill`, `diagnosis`, `behavioral_event`, `meta`, `content_cache`. Schema version `1`.

5. **Fault injection for the atomicity gate** is a test-only `FaultController` passed to `memoryDriver({ faults })` — it makes a chosen store's next `put` reject, simulating a mid-transaction IndexedDB request error, exercising the *real* `commitSubmission` rollback path.

---

## File structure

```
packages/persist/
├── package.json            # @trellis/persist; deps: @trellis/schema, @sinclair/typebox; dev: vitest
├── tsconfig.json           # extends ../../tsconfig.base.json; outDir dist; include src+test
├── vitest.config.ts        # mirror sandbox
├── src/
│   ├── index.ts            # barrel — SERIALIZED, wired last (Task 8)
│   ├── idb/
│   │   ├── types.ts        # IdbDriver/IdbConnection/IdbTxnHandle/IdbStoreHandle/IdbIndexHandle, StoreSpec, KeyRange
│   │   ├── keys.ts         # compareKeys + inRange (IDB-style key ordering for the memory driver)
│   │   ├── memory.ts       # memoryDriver(): in-memory, atomic staging, persists across close/open; FaultController
│   │   └── native.ts       # nativeDriver(indexedDB?): thin DOM-IDB adapter (production; verify-deferred)
│   ├── schema.ts           # DB_NAME/DB_VERSION/STORES/STORE_SPECS + StoredSkillState/MetaRecord/ContentCacheRecord
│   ├── db.ts               # openTrellisDb(driver, opts) -> TrellisDb; learnerId bootstrap; meta get/set
│   ├── commitSubmission.ts # THE atomic txn across learner_skill + diagnosis + behavioral_event
│   ├── learnerModel.ts     # loadLearnerModel(db) -> LearnerModel; readDiagnoses(db)
│   ├── events.ts           # appendEvents / recentEvents over behavioral_event
│   └── contentCache.ts     # loadBundle(): fetch + cache by contentVersion (cache-bust on change)
└── test/
    ├── memory-idb.test.ts
    ├── db.test.ts
    ├── commitSubmission.test.ts
    ├── learnerModel.test.ts
    ├── reload.test.ts
    ├── events.test.ts
    └── contentCache.test.ts
```

**Acyclic module graph:** `index.ts` → {`commitSubmission`,`learnerModel`,`events`,`contentCache`,`db`} → {`schema`,`idb/*`} → `idb/types`. No cycles. `idb/memory` and `idb/native` both depend only on `idb/types` + `idb/keys`. `commitSubmission`/`db`/`learnerModel`/`events`/`contentCache` never import each other except `db` (the open helper) which the others receive a `TrellisDb` from at call time (passed in, not imported cyclically).

---

## Task 1: Package scaffold

**Files:**
- Create: `packages/persist/package.json`
- Create: `packages/persist/tsconfig.json`
- Create: `packages/persist/vitest.config.ts`
- Create: `packages/persist/src/index.ts` (temporary placeholder)

- [ ] **Step 1: Create `package.json`** (mirrors `@trellis/sandbox`, minus the engine devDep)

```json
{
  "name": "@trellis/persist",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint src test --ext .ts"
  },
  "dependencies": {
    "@trellis/schema": "workspace:*",
    "@sinclair/typebox": "^0.34.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (identical pattern to sandbox)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 4: Create placeholder `src/index.ts`** (replaced in Task 8)

```ts
// Barrel is wired in Task 8 (serialized). Placeholder keeps the package importable.
export {};
```

- [ ] **Step 5: Install offline and verify the empty package wires into the workspace**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm install --offline
pnpm --filter @trellis/persist typecheck && pnpm --filter @trellis/persist test
```
Expected: install resolves from store with **no downloads**; typecheck passes; `test` exits 0 ("No test files found" is OK via `passWithNoTests`). If `pnpm install` reports a lockfile change for `@trellis/persist`, that is the expected new-workspace-project entry (deps already in store) — **do not** add `idb`/`fake-indexeddb`.

- [ ] **Step 6: Commit**

```bash
git add packages/persist/package.json packages/persist/tsconfig.json packages/persist/vitest.config.ts packages/persist/src/index.ts pnpm-lock.yaml
git -c user.name='Stream F — M5 persist' -c user.email='noreply@anthropic.com' commit \
  -m "feat(persist): scaffold @trellis/persist package (no new npm deps)"
```

---

## Task 2: Narrow IDB interface + key ordering + in-memory driver

This is the foundation. `memoryDriver` must model real IndexedDB transaction semantics: writes stage into a per-txn overlay, commit atomically when the body resolves, and **discard on any error/abort** (all-or-nothing); data lives in a factory-held store that survives `close()`/re-`open()` (reload survival).

**Files:**
- Create: `packages/persist/src/idb/types.ts`
- Create: `packages/persist/src/idb/keys.ts`
- Create: `packages/persist/src/idb/memory.ts`
- Test: `packages/persist/test/memory-idb.test.ts`

- [ ] **Step 1: Write `src/idb/types.ts`** (the contract both drivers implement)

```ts
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
```

- [ ] **Step 2: Write `src/idb/keys.ts`** (IDB-style key ordering — only the cases persist uses: number, string, and arrays thereof)

```ts
import type { KeyRange } from "./types.js";

// IndexedDB key ordering (subset): number < string < array; arrays compared elementwise,
// shorter is smaller on a common prefix. Sufficient for our keys (string ids, [stepId, ts]).
export function compareKeys(a: IDBValidKey, b: IDBValidKey): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const c = compareKeys(a[i] as IDBValidKey, b[i] as IDBValidKey);
      if (c !== 0) return c;
    }
    return a.length - b.length;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  // strings (and Dates coerced away — unused here): lexical
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function rank(k: IDBValidKey): number {
  if (typeof k === "number") return 0;
  if (typeof k === "string") return 1;
  if (Array.isArray(k)) return 2;
  return 3; // unsupported types sort last; not used by our stores
}

export function inRange(key: IDBValidKey, range: KeyRange): boolean {
  if ("only" in range) return compareKeys(key, range.only) === 0;
  if (range.lower !== undefined) {
    const c = compareKeys(key, range.lower);
    if (c < 0 || (c === 0 && range.lowerOpen)) return false;
  }
  if (range.upper !== undefined) {
    const c = compareKeys(key, range.upper);
    if (c > 0 || (c === 0 && range.upperOpen)) return false;
  }
  return true;
}
```

- [ ] **Step 3: Write the failing test `test/memory-idb.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { memoryDriver, FaultController } from "../src/idb/memory.js";
import type { StoreSpec } from "../src/idb/types.js";

const SPECS: StoreSpec[] = [
  { name: "a", keyPath: "id" },
  { name: "b", keyPath: "id" },
  { name: "evt", keyPath: "id", indexes: [{ name: "by_step_ts", keyPath: ["stepId", "ts"] }] },
];

describe("memoryDriver", () => {
  it("commits a write-only transaction across multiple stores", async () => {
    const driver = memoryDriver();
    const db = await driver.open("trellis", 1, SPECS);
    await db.tx(["a", "b"], "readwrite", async (tx) => {
      await tx.store("a").put({ id: "1", v: "x" });
      await tx.store("b").put({ id: "2", v: "y" });
    });
    const got = await db.tx(["a"], "readonly", async (tx) => tx.store("a").get("1"));
    expect(got).toEqual({ id: "1", v: "x" });
  });

  it("rolls back ALL stores when the body throws (all-or-nothing)", async () => {
    const driver = memoryDriver();
    const db = await driver.open("trellis", 1, SPECS);
    await expect(
      db.tx(["a", "b"], "readwrite", async (tx) => {
        await tx.store("a").put({ id: "1", v: "x" });
        await tx.store("b").put({ id: "2", v: "y" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const a = await db.tx(["a", "b"], "readonly", async (tx) => [
      await tx.store("a").getAll(),
      await tx.store("b").getAll(),
    ]);
    expect(a).toEqual([[], []]);
  });

  it("rolls back when an injected fault makes a put reject mid-transaction", async () => {
    const faults = new FaultController();
    const driver = memoryDriver({ faults });
    const db = await driver.open("trellis", 1, SPECS);
    faults.failPut("b"); // arm: next put to store "b" rejects
    await expect(
      db.tx(["a", "b"], "readwrite", async (tx) => {
        await tx.store("a").put({ id: "1", v: "x" });
        await tx.store("b").put({ id: "2", v: "y" });
      }),
    ).rejects.toThrow(/injected fault/i);
    const a = await db.tx(["a"], "readonly", async (tx) => tx.store("a").getAll());
    expect(a).toEqual([]); // store "a" rolled back too
  });

  it("persists data across close() and re-open() (reload survival)", async () => {
    const driver = memoryDriver();
    const db1 = await driver.open("trellis", 1, SPECS);
    await db1.tx(["a"], "readwrite", async (tx) => tx.store("a").put({ id: "1", v: "keep" }));
    db1.close();
    const db2 = await driver.open("trellis", 1, SPECS);
    const got = await db2.tx(["a"], "readonly", async (tx) => tx.store("a").get("1"));
    expect(got).toEqual({ id: "1", v: "keep" });
  });

  it("queries a compound index by range in ascending key order", async () => {
    const driver = memoryDriver();
    const db = await driver.open("trellis", 1, SPECS);
    await db.tx(["evt"], "readwrite", async (tx) => {
      await tx.store("evt").put({ id: "e2", stepId: "s1", ts: "2026-01-01T00:00:02Z" });
      await tx.store("evt").put({ id: "e1", stepId: "s1", ts: "2026-01-01T00:00:01Z" });
      await tx.store("evt").put({ id: "e3", stepId: "s2", ts: "2026-01-01T00:00:03Z" });
    });
    const s1 = await db.tx(["evt"], "readonly", async (tx) =>
      tx.store("evt").index("by_step_ts").getAll({ lower: ["s1"], upper: ["s1", "￿"] }),
    );
    expect((s1 as { id: string }[]).map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @trellis/persist test`
Expected: FAIL — `memory.js` does not exist / `memoryDriver` is not a function.

- [ ] **Step 5: Write `src/idb/memory.ts`**

```ts
import type {
  IdbConnection,
  IdbDriver,
  IdbIndexHandle,
  IdbStoreHandle,
  IdbTxnHandle,
  IndexSpec,
  KeyRange,
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
  const get = (p: string): IDBValidKey =>
    (value as Record<string, IDBValidKey>)[p];
  if (Array.isArray(keyPath)) return keyPath.map(get);
  const k = get(keyPath);
  if (k === undefined) throw new Error(`memoryDriver: missing keyPath "${keyPath}"`);
  return k;
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
    async tx<T>(stores, mode, body: (tx: IdbTxnHandle) => Promise<T>): Promise<T> {
      if (!open) throw new Error("memoryDriver: connection is closed");
      // Overlay = staged writes/deletes per store, applied to base only on successful commit.
      const overlay = new Map<string, Map<string, unknown | typeof TOMBSTONE>>();
      const stage = (name: string): Map<string, unknown | typeof TOMBSTONE> => {
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
          const readRow = (keyStr: string): unknown | undefined => {
            const ov = overlay.get(name)?.get(keyStr);
            if (ov !== undefined) return ov === TOMBSTONE ? undefined : ov;
            return sd.rows.get(keyStr);
          };
          const liveRows = (): unknown[] => {
            const merged = new Map(sd.rows);
            for (const [k, v] of overlay.get(name) ?? []) {
              if (v === TOMBSTONE) merged.delete(k);
              else merged.set(k, v);
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
        const sd = db.stores.get(name)!;
        for (const [keyStr, v] of ops) {
          if (v === TOMBSTONE) sd.rows.delete(keyStr);
          else sd.rows.set(keyStr, v);
        }
      }
      return result;
    },
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @trellis/persist test`
Expected: PASS — all 5 `memoryDriver` cases green.

- [ ] **Step 7: Lint + typecheck**

Run: `pnpm --filter @trellis/persist lint && pnpm --filter @trellis/persist typecheck`
Expected: clean (no errors). If `verbatimModuleSyntax` flags a value-vs-type import, split it into `import type { … }` for types and `import { … }` for values.

- [ ] **Step 8: Commit**

```bash
git add packages/persist/src/idb packages/persist/test/memory-idb.test.ts
git -c user.name='Stream F — M5 persist' -c user.email='noreply@anthropic.com' commit \
  -m "feat(persist): narrow IDB interface + in-memory driver with atomic txn + reload survival"
```

---

## Task 3: Store schema + `openTrellisDb` (learnerId bootstrap, meta get/set)

**Files:**
- Create: `packages/persist/src/schema.ts`
- Create: `packages/persist/src/db.ts`
- Test: `packages/persist/test/db.test.ts`

- [ ] **Step 1: Write `src/schema.ts`** (store names, specs, record types)

```ts
import type { SkillState, ContentVersion, Bundle, SkillId } from "@trellis/schema";
import type { StoreSpec } from "./idb/types.js";

export const DB_NAME = "trellis";
export const DB_VERSION = 1;

export const STORES = {
  learnerSkill: "learner_skill",
  diagnosis: "diagnosis",
  behavioralEvent: "behavioral_event",
  meta: "meta",
  contentCache: "content_cache",
} as const;

// §3.10 object stores + the START-HERE content_cache.
export const STORE_SPECS: StoreSpec[] = [
  { name: STORES.learnerSkill, keyPath: "skillId", indexes: [{ name: "by_lastSeen", keyPath: "lastSeen" }] },
  { name: STORES.diagnosis, keyPath: "id", indexes: [{ name: "by_submittedAt", keyPath: "submittedAt" }] },
  { name: STORES.behavioralEvent, keyPath: "id", indexes: [{ name: "by_step_ts", keyPath: ["stepId", "ts"] }] },
  { name: STORES.meta, keyPath: "key" },
  { name: STORES.contentCache, keyPath: "contentVersion" },
];

// learner_skill value = SkillState plus its key (§3.10: "SkillState (+ skillId)").
export type StoredSkillState = SkillState & { skillId: SkillId };

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface ContentCacheRecord {
  contentVersion: ContentVersion;
  bundle: Bundle;
}

export const META_KEYS = {
  learnerId: "learnerId",
  contentVersion: "contentVersion",
} as const;
```

- [ ] **Step 2: Write the failing test `test/db.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { memoryDriver } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";

describe("openTrellisDb", () => {
  it("bootstraps a learnerId via the injected idGen and persists it", async () => {
    const driver = memoryDriver();
    const ids = ["learner-fixed"];
    const idGen = () => ids.shift() ?? "unexpected";
    const db1 = await openTrellisDb(driver, { idGen });
    expect(db1.learnerId).toBe("learner-fixed");
    db1.close();
    // Reopen: learnerId is read back, not regenerated (idGen would now return "unexpected").
    const db2 = await openTrellisDb(driver, { idGen });
    expect(db2.learnerId).toBe("learner-fixed");
  });

  it("round-trips meta values", async () => {
    const driver = memoryDriver();
    const db = await openTrellisDb(driver, { idGen: () => "L" });
    await db.setMeta("contentVersion", "v1");
    expect(await db.getMeta("contentVersion")).toBe("v1");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @trellis/persist test db.test`
Expected: FAIL — `../src/db.js` not found.

- [ ] **Step 4: Write `src/db.ts`**

```ts
import type { IdbConnection, IdbDriver } from "./idb/types.js";
import { DB_NAME, DB_VERSION, STORE_SPECS, STORES, META_KEYS } from "./schema.js";
import type { MetaRecord } from "./schema.js";

export interface OpenOptions {
  /** uuid source for learnerId bootstrap; defaults to crypto.randomUUID. */
  idGen?: () => string;
}

export interface TrellisDb {
  readonly conn: IdbConnection;
  readonly learnerId: string;
  getMeta(key: string): Promise<unknown>;
  setMeta(key: string, value: unknown): Promise<void>;
  close(): void;
}

function defaultIdGen(): string {
  return crypto.randomUUID();
}

export async function openTrellisDb(driver: IdbDriver, opts: OpenOptions = {}): Promise<TrellisDb> {
  const idGen = opts.idGen ?? defaultIdGen;
  const conn = await driver.open(DB_NAME, DB_VERSION, STORE_SPECS);

  const getMeta = async (key: string): Promise<unknown> => {
    const rec = (await conn.tx([STORES.meta], "readonly", async (tx) =>
      tx.store(STORES.meta).get(key),
    )) as MetaRecord | undefined;
    return rec?.value;
  };
  const setMeta = async (key: string, value: unknown): Promise<void> => {
    await conn.tx([STORES.meta], "readwrite", async (tx) => {
      await tx.store(STORES.meta).put({ key, value } satisfies MetaRecord);
    });
  };

  // Bootstrap learnerId once (one learner per browser profile, §3.10).
  let learnerId = (await getMeta(META_KEYS.learnerId)) as string | undefined;
  if (learnerId === undefined) {
    learnerId = idGen();
    await setMeta(META_KEYS.learnerId, learnerId);
  }

  return {
    conn,
    learnerId,
    getMeta,
    setMeta,
    close: () => conn.close(),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @trellis/persist test db.test`
Expected: PASS — both cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/persist/src/schema.ts packages/persist/src/db.ts packages/persist/test/db.test.ts
git -c user.name='Stream F — M5 persist' -c user.email='noreply@anthropic.com' commit \
  -m "feat(persist): store schema + openTrellisDb with learnerId bootstrap and meta"
```

---

## Task 4: `commitSubmission` — THE atomic transaction (defining gate)

**Files:**
- Create: `packages/persist/src/commitSubmission.ts`
- Test: `packages/persist/test/commitSubmission.test.ts`

- [ ] **Step 1: Write the failing test `test/commitSubmission.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { memoryDriver, FaultController } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";
import { commitSubmission } from "../src/commitSubmission.js";
import { STORES } from "../src/schema.js";
import type { StoredSkillState } from "../src/schema.js";
import type { Diagnosis, BehavioralEvent } from "@trellis/schema";

function fixture() {
  const skillUpdates: StoredSkillState[] = [
    { skillId: "skill.output.print_literal", mastery: 0.6, attempts: 1, passes: 1, lastSeen: "2026-06-08T00:00:00Z", misconceptionCounts: {} },
  ];
  const diagnosis: Diagnosis = {
    id: "diag-1", learnerId: "L", stepId: "step-1", contentVersion: "v1",
    submittedAt: "2026-06-08T00:00:00Z", correct: true, attribution: "pass",
    signals: { ran: true, wallMs: 5 }, skillDeltas: [], seed: 0,
  };
  const events: BehavioralEvent[] = [
    { id: "evt-1", learnerId: "L", sessionId: "sess-1", seq: 0, stepId: "step-1", ts: "2026-06-08T00:00:00Z", type: "submission", payload: {} },
  ];
  return { skillUpdates, diagnosis, events };
}

describe("commitSubmission", () => {
  it("writes skill + diagnosis + events in one transaction", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const { skillUpdates, diagnosis, events } = fixture();
    await commitSubmission(db, { skillUpdates, diagnosis, events });

    const [skills, diags, evts] = await db.conn.tx(
      [STORES.learnerSkill, STORES.diagnosis, STORES.behavioralEvent],
      "readonly",
      async (tx) => [
        await tx.store(STORES.learnerSkill).getAll(),
        await tx.store(STORES.diagnosis).getAll(),
        await tx.store(STORES.behavioralEvent).getAll(),
      ],
    );
    expect(skills).toHaveLength(1);
    expect(diags).toHaveLength(1);
    expect(evts).toHaveLength(1);
  });

  it("rolls back ALL THREE stores when a write fails mid-transaction (atomicity gate)", async () => {
    const faults = new FaultController();
    const db = await openTrellisDb(memoryDriver({ faults }), { idGen: () => "L" });
    const { skillUpdates, diagnosis, events } = fixture();
    faults.failPut(STORES.diagnosis); // force the diagnosis write to error inside the txn

    await expect(commitSubmission(db, { skillUpdates, diagnosis, events })).rejects.toThrow(/injected fault/i);

    const [skills, diags, evts] = await db.conn.tx(
      [STORES.learnerSkill, STORES.diagnosis, STORES.behavioralEvent],
      "readonly",
      async (tx) => [
        await tx.store(STORES.learnerSkill).getAll(),
        await tx.store(STORES.diagnosis).getAll(),
        await tx.store(STORES.behavioralEvent).getAll(),
      ],
    );
    expect(skills).toEqual([]); // no partial write — skill rolled back too
    expect(diags).toEqual([]);
    expect(evts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @trellis/persist test commitSubmission`
Expected: FAIL — `commitSubmission` not found.

- [ ] **Step 3: Write `src/commitSubmission.ts`**

```ts
import type { Diagnosis, BehavioralEvent } from "@trellis/schema";
import type { TrellisDb } from "./db.js";
import { STORES } from "./schema.js";
import type { StoredSkillState } from "./schema.js";

export interface SubmissionWrite {
  /** Engine-computed new SkillState records (§10.2 outputs — persist does not compute mastery). */
  skillUpdates: StoredSkillState[];
  diagnosis: Diagnosis;
  events: BehavioralEvent[];
}

/**
 * Persist one submission's outcome in a SINGLE readwrite transaction spanning learner_skill +
 * diagnosis + behavioral_event (§3.10). All-or-nothing: any write error aborts the whole txn and
 * nothing is persisted. Write-only — no read-modify-write — so the (native) txn never spans a
 * foreign await and cannot auto-commit early.
 */
export async function commitSubmission(db: TrellisDb, write: SubmissionWrite): Promise<void> {
  await db.conn.tx(
    [STORES.learnerSkill, STORES.diagnosis, STORES.behavioralEvent],
    "readwrite",
    async (tx) => {
      for (const s of write.skillUpdates) await tx.store(STORES.learnerSkill).put(s);
      await tx.store(STORES.diagnosis).put(write.diagnosis);
      for (const e of write.events) await tx.store(STORES.behavioralEvent).put(e);
    },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trellis/persist test commitSubmission`
Expected: PASS — both cases green (write-through + atomic rollback across all three stores).

- [ ] **Step 5: Commit**

```bash
git add packages/persist/src/commitSubmission.ts packages/persist/test/commitSubmission.test.ts
git -c user.name='Stream F — M5 persist' -c user.email='noreply@anthropic.com' commit \
  -m "feat(persist): atomic commitSubmission across learner_skill+diagnosis+behavioral_event"
```

---

## Task 5: `loadLearnerModel` + diagnosis history + reload-survival gate

**Files:**
- Create: `packages/persist/src/learnerModel.ts`
- Test: `packages/persist/test/learnerModel.test.ts`
- Test: `packages/persist/test/reload.test.ts`

- [ ] **Step 1: Write the failing test `test/learnerModel.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { memoryDriver } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";
import { commitSubmission } from "../src/commitSubmission.js";
import { loadLearnerModel, readDiagnoses } from "../src/learnerModel.js";
import type { StoredSkillState } from "../src/schema.js";
import type { Diagnosis } from "@trellis/schema";

describe("loadLearnerModel", () => {
  it("reconstructs LearnerModel from learner_skill rows, keyed by skillId without the skillId field", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const skillUpdates: StoredSkillState[] = [
      { skillId: "skill.a", mastery: 0.5, attempts: 2, passes: 1, lastSeen: "t1", misconceptionCounts: {} },
      { skillId: "skill.b", mastery: 0.9, attempts: 3, passes: 3, lastSeen: "t2", misconceptionCounts: {} },
    ];
    const diagnosis: Diagnosis = {
      id: "d1", learnerId: "L", stepId: "s1", contentVersion: "v1", submittedAt: "t1",
      correct: true, attribution: "pass", signals: { ran: true, wallMs: 1 }, skillDeltas: [], seed: 0,
    };
    await commitSubmission(db, { skillUpdates, diagnosis, events: [] });

    const model = await loadLearnerModel(db, "v1");
    expect(model.learnerId).toBe("L");
    expect(model.contentVersion).toBe("v1");
    expect(model.skills["skill.a"]).toEqual({ mastery: 0.5, attempts: 2, passes: 1, lastSeen: "t1", misconceptionCounts: {} });
    expect(model.skills["skill.b"]?.mastery).toBe(0.9);
    expect((model.skills["skill.a"] as Record<string, unknown>)["skillId"]).toBeUndefined();
  });

  it("reads diagnosis history ordered by submittedAt", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const mk = (id: string, at: string): Diagnosis => ({
      id, learnerId: "L", stepId: "s1", contentVersion: "v1", submittedAt: at,
      correct: true, attribution: "pass", signals: { ran: true, wallMs: 1 }, skillDeltas: [], seed: 0,
    });
    await commitSubmission(db, { skillUpdates: [], diagnosis: mk("d2", "2026-06-08T00:00:02Z"), events: [] });
    await commitSubmission(db, { skillUpdates: [], diagnosis: mk("d1", "2026-06-08T00:00:01Z"), events: [] });
    const history = await readDiagnoses(db);
    expect(history.map((d) => d.id)).toEqual(["d1", "d2"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @trellis/persist test learnerModel`
Expected: FAIL — `learnerModel.js` not found.

- [ ] **Step 3: Write `src/learnerModel.ts`**

```ts
// NOTE: @trellis/schema exports SkillId/StepId/ContentVersion as TypeBox VALUES (Type.String()),
// not TS types — so we use `string` (their exact Static<> resolution) for those positions.
import type { LearnerModel, SkillState, Diagnosis } from "@trellis/schema";
import type { TrellisDb } from "./db.js";
import { STORES } from "./schema.js";
import type { StoredSkillState } from "./schema.js";

/** Read all learner_skill rows into a LearnerModel for `contentVersion` (§3.8/§4.3 gating input). */
export async function loadLearnerModel(db: TrellisDb, contentVersion: string): Promise<LearnerModel> {
  const rows = (await db.conn.tx([STORES.learnerSkill], "readonly", async (tx) =>
    tx.store(STORES.learnerSkill).getAll(),
  )) as StoredSkillState[];

  const skills: Record<string, SkillState> = {};
  for (const row of rows) {
    const { skillId, ...state } = row;
    skills[skillId] = state;
  }
  return { learnerId: db.learnerId, skills, contentVersion };
}

/** Diagnosis history, ascending by submittedAt (the by_submittedAt index, §3.10). */
export async function readDiagnoses(db: TrellisDb): Promise<Diagnosis[]> {
  const rows = (await db.conn.tx([STORES.diagnosis], "readonly", async (tx) =>
    tx.store(STORES.diagnosis).index("by_submittedAt").getAll(),
  )) as Diagnosis[];
  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trellis/persist test learnerModel`
Expected: PASS.

- [ ] **Step 5: Write the reload-survival gate `test/reload.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { memoryDriver } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";
import { commitSubmission } from "../src/commitSubmission.js";
import { loadLearnerModel, readDiagnoses } from "../src/learnerModel.js";
import type { StoredSkillState } from "../src/schema.js";
import type { Diagnosis, BehavioralEvent } from "@trellis/schema";

describe("reload survival (close + reopen the DB)", () => {
  it("mastery + diagnosis history round-trip identically across a simulated reload", async () => {
    const driver = memoryDriver(); // one factory instance = the persistent origin store
    const skillUpdates: StoredSkillState[] = [
      { skillId: "skill.a", mastery: 0.72, attempts: 4, passes: 3, lastSeen: "t9", misconceptionCounts: { "mis.concat.str_num": 1 } },
    ];
    const diagnosis: Diagnosis = {
      id: "d1", learnerId: "L", stepId: "s1", contentVersion: "v1", submittedAt: "t9",
      correct: false, attribution: "misconception", misconceptionId: "mis.concat.str_num",
      signals: { ran: true, wallMs: 3 }, skillDeltas: [], seed: 7,
    };
    const events: BehavioralEvent[] = [
      { id: "e1", learnerId: "L", sessionId: "s", seq: 0, stepId: "s1", ts: "t9", type: "submission", payload: {} },
    ];

    const db1 = await openTrellisDb(driver, { idGen: () => "L" });
    await commitSubmission(db1, { skillUpdates, diagnosis, events });
    const modelBefore = await loadLearnerModel(db1, "v1");
    const historyBefore = await readDiagnoses(db1);
    db1.close();

    const db2 = await openTrellisDb(driver, { idGen: () => "SHOULD-NOT-BE-USED" });
    const modelAfter = await loadLearnerModel(db2, "v1");
    const historyAfter = await readDiagnoses(db2);

    expect(db2.learnerId).toBe("L");           // learnerId survived
    expect(modelAfter).toEqual(modelBefore);    // mastery survived, identical
    expect(historyAfter).toEqual(historyBefore); // diagnosis history survived, identical
  });
});
```

- [ ] **Step 6: Run the reload test to verify it passes**

Run: `pnpm --filter @trellis/persist test reload`
Expected: PASS — reload survival gate green.

- [ ] **Step 7: Commit**

```bash
git add packages/persist/src/learnerModel.ts packages/persist/test/learnerModel.test.ts packages/persist/test/reload.test.ts
git -c user.name='Stream F — M5 persist' -c user.email='noreply@anthropic.com' commit \
  -m "feat(persist): loadLearnerModel + diagnosis history + reload-survival gate"
```

---

## Task 6: `appendEvents` / `recentEvents` (the M6 telemetry seam)

The store exists and is written now even though M6 telemetry isn't built (§6 out-of-scope seams). `appendEvents` is the outbound seam the future `EventBuffer` flushes through; `recentEvents` is what the future `ProactiveScaffolder` reads back.

**Files:**
- Create: `packages/persist/src/events.ts`
- Test: `packages/persist/test/events.test.ts`

- [ ] **Step 1: Write the failing test `test/events.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { memoryDriver } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";
import { appendEvents, recentEvents } from "../src/events.js";
import type { BehavioralEvent } from "@trellis/schema";

function ev(id: string, stepId: string, ts: string, seq: number): BehavioralEvent {
  return { id, learnerId: "L", sessionId: "s", seq, stepId, ts, type: "editor_change", payload: {} };
}

describe("appendEvents / recentEvents", () => {
  it("appends events durably in one transaction", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    await appendEvents(db, [ev("e1", "s1", "2026-06-08T00:00:01Z", 0), ev("e2", "s1", "2026-06-08T00:00:02Z", 1)]);
    const all = await recentEvents(db, {});
    expect(all.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("returns the most recent events first, limited", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    await appendEvents(db, [
      ev("e1", "s1", "2026-06-08T00:00:01Z", 0),
      ev("e2", "s1", "2026-06-08T00:00:02Z", 1),
      ev("e3", "s1", "2026-06-08T00:00:03Z", 2),
    ]);
    const recent = await recentEvents(db, { limit: 2 });
    expect(recent.map((e) => e.id)).toEqual(["e3", "e2"]); // newest-first
  });

  it("filters by stepId via the by_step_ts index", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    await appendEvents(db, [
      ev("e1", "s1", "2026-06-08T00:00:01Z", 0),
      ev("e2", "s2", "2026-06-08T00:00:02Z", 1),
      ev("e3", "s1", "2026-06-08T00:00:03Z", 2),
    ]);
    const s1 = await recentEvents(db, { stepId: "s1" });
    expect(s1.map((e) => e.id)).toEqual(["e3", "e1"]); // s1 only, newest-first
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @trellis/persist test events`
Expected: FAIL — `events.js` not found.

- [ ] **Step 3: Write `src/events.ts`**

```ts
// StepId is a TypeBox value in @trellis/schema, not a TS type → use `string`.
import type { BehavioralEvent } from "@trellis/schema";
import type { TrellisDb } from "./db.js";
import { STORES } from "./schema.js";

/** Outbound telemetry seam (§11.1): batch-append behavioral events in one readwrite txn. */
export async function appendEvents(db: TrellisDb, events: BehavioralEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db.conn.tx([STORES.behavioralEvent], "readwrite", async (tx) => {
    for (const e of events) await tx.store(STORES.behavioralEvent).put(e);
  });
}

export interface RecentEventsQuery {
  /** Restrict to one step (per-step trigger evaluation, §11). */
  stepId?: string;
  /** Max events to return; default 50. */
  limit?: number;
}

/**
 * Recent behavioral events, newest-first (read-back seam for the future ProactiveScaffolder, §11.3).
 * When `stepId` is given, scans the by_step_ts index range for that step; otherwise reads all.
 */
export async function recentEvents(db: TrellisDb, query: RecentEventsQuery): Promise<BehavioralEvent[]> {
  const limit = query.limit ?? 50;
  const rows = (await db.conn.tx([STORES.behavioralEvent], "readonly", async (tx) => {
    const store = tx.store(STORES.behavioralEvent);
    if (query.stepId !== undefined) {
      // Compound key [stepId, ts]: bound to this stepId across all timestamps.
      return store.index("by_step_ts").getAll({ lower: [query.stepId], upper: [query.stepId, "￿"] });
    }
    return store.getAll();
  })) as BehavioralEvent[];

  // Newest-first by (ts, seq). ts is ISO-8601 so lexical compare = chronological.
  rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : b.seq - a.seq));
  return rows.slice(0, limit);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trellis/persist test events`
Expected: PASS — all three cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/persist/src/events.ts packages/persist/test/events.test.ts
git -c user.name='Stream F — M5 persist' -c user.email='noreply@anthropic.com' commit \
  -m "feat(persist): appendEvents/recentEvents telemetry seam over behavioral_event"
```

---

## Task 7: `loadBundle` — static fetch + `contentVersion` cache

**Files:**
- Create: `packages/persist/src/contentCache.ts`
- Test: `packages/persist/test/contentCache.test.ts`

- [ ] **Step 1: Write the failing test `test/contentCache.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { memoryDriver } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";
import { loadBundle } from "../src/contentCache.js";
import type { Bundle } from "@trellis/schema";

function bundle(version: string): Bundle {
  return {
    contentVersion: version,
    skills: {}, nodes: {}, cells: {}, misconceptions: {},
    producers: {}, requirements: {},
  };
}

function countingFetch(body: Bundle) {
  let calls = 0;
  const fetchImpl = ((_url: string) => {
    calls += 1;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

describe("loadBundle", () => {
  it("fetches once, then serves from cache when contentVersion is unchanged", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const f = countingFetch(bundle("v1"));
    const first = await loadBundle(db, { url: "/content/v1.json", contentVersion: "v1", fetchImpl: f.fetchImpl });
    const second = await loadBundle(db, { url: "/content/v1.json", contentVersion: "v1", fetchImpl: f.fetchImpl });
    expect(first.contentVersion).toBe("v1");
    expect(second).toEqual(first);
    expect(f.calls()).toBe(1); // second load was a cache hit
  });

  it("re-fetches when contentVersion changes (cache-bust)", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const f1 = countingFetch(bundle("v1"));
    await loadBundle(db, { url: "/content/v1.json", contentVersion: "v1", fetchImpl: f1.fetchImpl });
    const f2 = countingFetch(bundle("v2"));
    const v2 = await loadBundle(db, { url: "/content/v2.json", contentVersion: "v2", fetchImpl: f2.fetchImpl });
    expect(v2.contentVersion).toBe("v2");
    expect(f2.calls()).toBe(1); // new version forced a fetch
  });

  it("survives reload: a cached bundle is served without fetching after reopen", async () => {
    const driver = memoryDriver();
    const db1 = await openTrellisDb(driver, { idGen: () => "L" });
    const f1 = countingFetch(bundle("v1"));
    await loadBundle(db1, { url: "/content/v1.json", contentVersion: "v1", fetchImpl: f1.fetchImpl });
    db1.close();

    const db2 = await openTrellisDb(driver, { idGen: () => "L" });
    const f2 = countingFetch(bundle("v1"));
    const got = await loadBundle(db2, { url: "/content/v1.json", contentVersion: "v1", fetchImpl: f2.fetchImpl });
    expect(got.contentVersion).toBe("v1");
    expect(f2.calls()).toBe(0); // served from the persisted content_cache
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @trellis/persist test contentCache`
Expected: FAIL — `contentCache.js` not found.

- [ ] **Step 3: Write `src/contentCache.ts`**

```ts
// ContentVersion is a TypeBox value in @trellis/schema, not a TS type → use `string`.
// Bundle is exported BOTH as a type and as a TypeBox schema value; import the value as BundleSchema.
import type { Bundle } from "@trellis/schema";
import { assertValid, Bundle as BundleSchema } from "@trellis/schema";
import type { TrellisDb } from "./db.js";
import { STORES, META_KEYS } from "./schema.js";
import type { ContentCacheRecord } from "./schema.js";

export interface LoadBundleOptions {
  /** Immutable static URL for this contentVersion's compiled bundle. */
  url: string;
  /** The version we expect; the cache is keyed by it (immutable URL → cache-forever, §3.10). */
  contentVersion: string;
  /** Injectable fetch (defaults to globalThis.fetch) — lets tests avoid the network. */
  fetchImpl?: typeof fetch;
}

/**
 * Load the compiled Bundle for `contentVersion`, serving from the content_cache store when present
 * and re-fetching only when the version is absent (cache-bust on change, §3.10). On a miss it does a
 * plain static `fetch`, validates against the frozen Bundle schema, caches it, and updates the meta
 * contentVersion pointer.
 */
export async function loadBundle(db: TrellisDb, opts: LoadBundleOptions): Promise<Bundle> {
  const cached = (await db.conn.tx([STORES.contentCache], "readonly", async (tx) =>
    tx.store(STORES.contentCache).get(opts.contentVersion),
  )) as ContentCacheRecord | undefined;

  if (cached !== undefined && cached.contentVersion === opts.contentVersion) {
    return cached.bundle;
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(opts.url);
  if (!res.ok) throw new Error(`loadBundle: fetch ${opts.url} failed (${res.status})`);
  const json: unknown = await res.json();
  const bundle = assertValid(BundleSchema, json);
  if (bundle.contentVersion !== opts.contentVersion) {
    throw new Error(`loadBundle: version mismatch — asked ${opts.contentVersion}, got ${bundle.contentVersion}`);
  }

  await db.conn.tx([STORES.contentCache, STORES.meta], "readwrite", async (tx) => {
    await tx.store(STORES.contentCache).put({ contentVersion: opts.contentVersion, bundle } satisfies ContentCacheRecord);
    await tx.store(STORES.meta).put({ key: META_KEYS.contentVersion, value: opts.contentVersion });
  });

  return bundle;
}
```

> **API note (verified):** `@trellis/schema` exports both the `Bundle` *type* and the `Bundle` *TypeBox schema value* (`bundle.ts:55-56`), and `assertValid(schema, value)` from `validate.ts`. Import the schema value under an alias (`Bundle as BundleSchema`) to avoid colliding with the type import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trellis/persist test contentCache`
Expected: PASS — cache hit, cache-bust, and reload-survival-of-cache all green.

- [ ] **Step 5: Commit**

```bash
git add packages/persist/src/contentCache.ts packages/persist/test/contentCache.test.ts
git -c user.name='Stream F — M5 persist' -c user.email='noreply@anthropic.com' commit \
  -m "feat(persist): loadBundle static fetch + contentVersion cache (cache-bust)"
```

---

## Task 8: Native driver (production; verify-deferred) + barrel + full gate

This task wires the serialized `index.ts` barrel last, adds the production `nativeDriver`, and runs the whole gate including the native-ESM acyclicity check.

**Files:**
- Create: `packages/persist/src/idb/native.ts`
- Modify: `packages/persist/src/index.ts` (replace placeholder)

- [ ] **Step 1: Write `src/idb/native.ts`** (thin DOM-IDB adapter — typecheck/build-verified offline, executed only in a browser)

```ts
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
          put: (value) => req(os.put(value)).then(() => undefined),
          get: (key) => req(os.get(key)),
          getAll: () => req(os.getAll()),
          delete: (key) => req(os.delete(key)).then(() => undefined),
          index: (indexName): IdbIndexHandle => {
            const ix = os.index(indexName);
            return { getAll: (range?: KeyRange) => req(ix.getAll(range ? toIDBKeyRange(range) : undefined)) };
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
```

> **API note (verified against the DOM `lib`):** `IDBFactory.open(name, version)`, `IDBObjectStore.{put,get,getAll,delete,createIndex,index}`, `IDBIndex.getAll(query?)`, and `IDBKeyRange.{only,bound,lowerBound,upperBound}` are the standard signatures (TS `lib.dom.d.ts`, which `tsconfig.base.json` includes via `"lib": ["ES2022","DOM"]`). The known auto-commit footgun is avoided because every `tx` body in this package is write-only or single-read — it never awaits a non-IDB promise mid-transaction.

- [ ] **Step 2: Write the serialized barrel `src/index.ts`** (replace the placeholder — public API surface)

```ts
// Public API of @trellis/persist (the browser-local data layer).

// Drivers — production (browser) and in-memory (tests / offline gates).
export { nativeDriver } from "./idb/native.js";
export { memoryDriver, FaultController } from "./idb/memory.js";
export type {
  IdbDriver,
  IdbConnection,
  IdbTxnHandle,
  IdbStoreHandle,
  IdbIndexHandle,
  StoreSpec,
  IndexSpec,
  KeyRange,
  Mode,
} from "./idb/types.js";

// Schema / store metadata.
export {
  DB_NAME,
  DB_VERSION,
  STORES,
  STORE_SPECS,
  META_KEYS,
} from "./schema.js";
export type { StoredSkillState, MetaRecord, ContentCacheRecord } from "./schema.js";

// Open + high-level operations.
export { openTrellisDb } from "./db.js";
export type { TrellisDb, OpenOptions } from "./db.js";
export { commitSubmission } from "./commitSubmission.js";
export type { SubmissionWrite } from "./commitSubmission.js";
export { loadLearnerModel, readDiagnoses } from "./learnerModel.js";
export { appendEvents, recentEvents } from "./events.js";
export type { RecentEventsQuery } from "./events.js";
export { loadBundle } from "./contentCache.js";
export type { LoadBundleOptions } from "./contentCache.js";
```

- [ ] **Step 3: Run the FULL package gate**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/persist typecheck \
  && pnpm --filter @trellis/persist lint \
  && pnpm --filter @trellis/persist test \
  && pnpm --filter @trellis/persist build
```
Expected: all four green. Every test file passes; `build` emits `packages/persist/dist/src/**`.

- [ ] **Step 4: Verify the built ESM is acyclic and importable (the ESM build-cycle trap)**

Run:
```bash
node -e "import('./packages/persist/dist/src/index.js').then(m => { \
  const need = ['openTrellisDb','commitSubmission','loadLearnerModel','appendEvents','recentEvents','loadBundle','memoryDriver','nativeDriver']; \
  const missing = need.filter(n => typeof m[n] !== 'function'); \
  if (missing.length) { console.error('MISSING', missing); process.exit(1); } \
  console.log('persist dist import OK — all exports present, no cycle deadlock'); \
})"
```
Expected: prints `persist dist import OK …`, exit 0. (If it hangs, there is an import cycle — break it; the graph in §"File structure" is acyclic by construction.)

- [ ] **Step 5: Commit**

```bash
git add packages/persist/src/idb/native.ts packages/persist/src/index.ts
git -c user.name='Stream F — M5 persist' -c user.email='noreply@anthropic.com' commit \
  -m "feat(persist): native IDB driver (verify-deferred) + public barrel; full gate green"
```

---

## Final verification (whole-package, before reporting to the orchestrator)

- [ ] **Step 1: Run the complete gate from a clean state and capture real output**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/persist typecheck && \
pnpm --filter @trellis/persist lint && \
pnpm --filter @trellis/persist test && \
pnpm --filter @trellis/persist build && \
node -e "import('./packages/persist/dist/src/index.js').then(()=>console.log('dist import OK'))"
```
Expected: typecheck/lint clean; **all 7 test files pass** (memory-idb, db, commitSubmission, learnerModel, reload, events, contentCache); build emits dist; dist import OK.

- [ ] **Step 2: Confirm the three defining gates are individually demonstrable**
  - **Atomicity:** `test/commitSubmission.test.ts` → "rolls back ALL THREE stores when a write fails mid-transaction".
  - **Reload survival:** `test/reload.test.ts` → mastery + diagnosis history `toEqual` across close/reopen.
  - **Content cache:** `test/contentCache.test.ts` → fetch-once/cache-hit + cache-bust + survives-reload.

- [ ] **Step 3: Confirm no stray dependency / lockfile drift**

Run: `git diff --stat main -- pnpm-lock.yaml package.json`
Expected: the only change is the new `@trellis/persist` workspace project entry (no `idb`, no `fake-indexeddb`). If anything else changed, STOP and reconcile before reporting.

- [ ] **Step 4: Report status to the orchestrator** with the real captured output, noting the documented deferral (native driver executed in-browser only) and that `@trellis/schema` was **not** changed.

---

## Self-review checklist (completed during authoring)

- **Spec coverage:** stores `learner_skill`/`diagnosis`/`behavioral_event`/`meta`/`content_cache` (§3.10) → Task 3; atomic `commitSubmission` across the three (§3.10) → Task 4; `appendEvents`/`recentEvents` telemetry seam (§6, §11.1) → Task 6; static-fetch + `contentVersion` cache (§3.10) → Task 7; reload survival (M5 gate) → Task 5; persist outputs not compute (§10.2) → `commitSubmission` is write-only of caller-supplied `StoredSkillState[]`.
- **Placeholder scan:** none — every code step has complete, runnable code.
- **Type consistency:** `StoredSkillState` (`SkillState & {skillId}`), `TrellisDb`, `SubmissionWrite`, `IdbConnection.tx`, `STORES.*`, `META_KEYS.*`, `KeyRange`, `FaultController.failPut` are used identically across all tasks. `loadBundle` imports the `Bundle` schema value as `BundleSchema` to avoid the type/value name clash.
- **Dependency reality:** zero new npm deps; `idb`/`fake-indexeddb` confirmed unavailable offline; `pnpm-lock.yaml` carries only the new-project entry.
