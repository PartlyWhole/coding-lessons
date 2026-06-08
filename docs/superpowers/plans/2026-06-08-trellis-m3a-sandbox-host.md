# Trellis M3a — `@trellis/sandbox` Worker Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@trellis/sandbox`, the host that implements the frozen `Sandbox.run(req): Promise<RunResult>` contract by driving a pinned Pyodide Web Worker, with a host-armed watchdog (`worker.terminate()` on timeout), a warm worker pool, fresh-namespace isolation, and syntax/runtime error reporting.

**Architecture:** The host logic is split from the browser/Pyodide bits so it is fully unit-testable in Node against a **mock worker**. A `WorkerLike` abstraction (matches the browser `Worker` shape: `postMessage`/`terminate`/`onmessage`/`onerror`) is produced by an injectable `WorkerFactory`; tests inject a scripted mock, production injects a real module `Worker`. A `Clock` abstraction makes the watchdog and `wallMs` deterministic. `WorkerHost` manages one worker's lifecycle (warming → ready → running), `WarmPool` keeps N hosts hot and replaces terminated ones, and `createSandbox` ties them together: acquire a warm host, arm the watchdog, race result-vs-timeout, on timeout terminate + discard (spawn a replacement) and return `{ ran:false, timedOut:true }`. The real Pyodide worker entry and the browser worker factory are written but **cannot be verified in this no-network environment** (Pyodide/pygame wheels can't be fetched) — that verification is explicitly DEFERRED.

**Tech Stack:** TypeScript (ESM, `verbatimModuleSyntax`, `.js` import specifiers), `@trellis/schema` (frozen `Sandbox`/`RunRequest`/`RunResult`), `@sinclair/typebox` (`Value.Check` for contract conformance), Vitest, Pyodide (pinned CDN, deferred), pnpm workspace + turbo.

---

## ⚠️ Environment caveat (carry into the done report)

This environment has **no network**, so the pinned Pyodide runtime and the `pygame-ce` wheel cannot be fetched. Everything in Tasks 1–7 and 9 is fully built and verified here against a **mock worker**. Task 8 (the real Pyodide worker entry + browser worker factory) is written and typechecked but its **real-Pyodide behavior is DEFERRED to a networked environment**. Do not claim end-to-end sandbox verification that was not run. The gate's "with network" clauses are deferred; the "without network" clause (mock-worker proof of host/watchdog/warm-pool) is the bar met here.

## File structure

```
packages/sandbox/
├── package.json            # @trellis/sandbox; deps: @trellis/schema, @sinclair/typebox; dev: vitest
├── tsconfig.json           # extends ../../tsconfig.base.json
├── vitest.config.ts
└── src/
    ├── index.ts            # public surface: createSandbox, types, pinned constants
    ├── clock.ts            # Clock abstraction + realClock (injectable timers + now)
    ├── protocol.ts         # WorkerLike, WorkerFactory, host↔worker message types
    ├── worker-host.ts      # WorkerHost: one worker's lifecycle (warming/ready/running/dead)
    ├── warm-pool.ts        # WarmPool: keep N hosts hot; acquire/release/discard; status
    ├── sandbox.ts          # createSandbox: watchdog race, timeout→terminate→replace
    ├── pinned.ts           # PYODIDE_VERSION + PINNED_PYODIDE_URL (single source of truth)
    ├── pyodide-worker.ts   # DEFERRED: real Web Worker entry (loadPyodide, harness, run)
    └── browser-worker.ts   # DEFERRED: WorkerFactory that constructs a real module Worker
└── test/
    ├── mock-worker.ts      # scripted WorkerLike test double + FakeClock
    ├── clock.test.ts
    ├── protocol.test.ts    # RunResult structured-clone/contract conformance (Value.Check)
    ├── worker-host.test.ts
    ├── warm-pool.test.ts
    └── sandbox.test.ts     # the gate behaviors against the mock worker
```

**Design decisions locked here (do not re-litigate):**
- `ran` semantics: `ran:false` for **syntax** errors and **timeouts** (the program never executed / was killed); `ran:true` for **runtime** errors (it executed, then raised). Recorded in `RunResult.error.type`.
- `wallMs` returned by `Sandbox.run` is the **end-to-end** wall time measured by the host (`clock.now()` delta), so it includes IPC, not just interpreter exec.
- **Isolation lives in the Python harness:** each run execs the learner code into a fresh local dict (`ns = {}`), so reusing a warm worker across runs cannot bleed globals. A worker is reused after a normal run; it is **only** terminated+replaced on timeout (or crash).
- **Memory:** `memoryMb` is passed to worker init. Warm-pool workers are built with `config.memoryMb`. A request whose `memoryMb` exceeds the pool's cap runs on a **dedicated** (non-pooled) worker that is terminated after the run. Hard per-instance WASM memory capping in Pyodide is limited; OOM surfaces as a `runtime` error (`MemoryError`). This nuance is documented and deferred for real-Pyodide tuning.
- The frozen `Sandbox` interface is `{ run }` only. The concrete object additionally exposes `warmup()`/`status()`/`dispose()` via a `ManagedSandbox extends Sandbox` type — this **extends**, never changes, the contract.

---

### Task 1: Scaffold the `@trellis/sandbox` package

**Files:**
- Create: `packages/sandbox/package.json`
- Create: `packages/sandbox/tsconfig.json`
- Create: `packages/sandbox/vitest.config.ts`
- Create: `packages/sandbox/src/index.ts`

- [ ] **Step 1: Create `package.json`** (mirrors `packages/schema/package.json`; adds the schema + typebox deps)

```json
{
  "name": "@trellis/sandbox",
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

- [ ] **Step 2: Create `tsconfig.json`** (identical pattern to schema's)

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

- [ ] **Step 4: Create a placeholder `src/index.ts`** (filled in by later tasks)

```ts
// @trellis/sandbox — Pyodide Web Worker grader host (M3a).
// Implements the frozen @trellis/schema `Sandbox` contract (§6.1).
export {};
```

- [ ] **Step 5: Install so the workspace links the new package**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm install`
Expected: completes; `@trellis/sandbox` resolves `@trellis/schema` via `workspace:*` (no network needed — both are local).

- [ ] **Step 6: Verify the package is wired into the toolchain**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox typecheck && pnpm --filter @trellis/sandbox test && pnpm --filter @trellis/sandbox lint`
Expected: typecheck passes; test passes (0 tests, `passWithNoTests`); lint passes.

- [ ] **Step 7: Commit**

```bash
git add packages/sandbox pnpm-lock.yaml
git -c user.name='m3a-sandbox' -c user.email='noreply@anthropic.com' commit -m "feat(sandbox): scaffold @trellis/sandbox package"
```

---

### Task 2: `Clock` abstraction (deterministic time + timers)

**Files:**
- Create: `packages/sandbox/src/clock.ts`
- Test: `packages/sandbox/test/clock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { realClock, type Clock } from "../src/clock.js";

describe("realClock", () => {
  it("now() is monotonic-ish and returns a number", () => {
    const a = realClock.now();
    expect(typeof a).toBe("number");
    expect(realClock.now()).toBeGreaterThanOrEqual(a);
  });

  it("setTimer fires after the delay and clearTimer cancels it", async () => {
    let fired = false;
    const t = realClock.setTimer(() => { fired = true; }, 5);
    await new Promise((r) => setTimeout(r, 20));
    expect(fired).toBe(true);

    let fired2 = false;
    const t2 = realClock.setTimer(() => { fired2 = true; }, 5);
    realClock.clearTimer(t2);
    await new Promise((r) => setTimeout(r, 20));
    expect(fired2).toBe(false);
    void t;
  });

  it("satisfies the Clock interface", () => {
    const c: Clock = realClock;
    expect(typeof c.now).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test clock`
Expected: FAIL — cannot resolve `../src/clock.js`.

- [ ] **Step 3: Implement `src/clock.ts`**

```ts
// An injectable clock so the watchdog and wallMs are deterministic under test.
// Tests inject a FakeClock (test/mock-worker.ts); production uses realClock.

export type Timer = { readonly __timer: unique symbol } | object;

export interface Clock {
  now(): number;
  setTimer(fn: () => void, ms: number): Timer;
  clearTimer(t: Timer): void;
}

export const realClock: Clock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as Timer,
  clearTimer: (t) => clearTimeout(t as unknown as ReturnType<typeof setTimeout>),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test clock`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/sandbox/src/clock.ts packages/sandbox/test/clock.test.ts
git -c user.name='m3a-sandbox' -c user.email='noreply@anthropic.com' commit -m "feat(sandbox): injectable Clock abstraction"
```

---

### Task 3: Worker protocol + `WorkerLike`/`WorkerFactory` + contract conformance

**Files:**
- Create: `packages/sandbox/src/protocol.ts`
- Test: `packages/sandbox/test/protocol.test.ts`

The protocol fixes the structured-clone-only message shapes crossing the worker boundary and asserts that a `RunResult` produced host-side conforms to the frozen `@trellis/schema` schema (using TypeBox `Value.Check`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Value } from "@sinclair/typebox/value";
import { RunResult } from "@trellis/schema";
import {
  isResultMessage,
  isReadyMessage,
  type WorkerToHost,
  type RunResultData,
} from "../src/protocol.js";

describe("protocol message guards", () => {
  it("discriminates ready and result messages", () => {
    const ready: WorkerToHost = { kind: "ready" };
    const result: WorkerToHost = {
      kind: "result",
      id: 1,
      result: { ran: true, stdout: "hi\n", wallMs: 3, timedOut: false },
    };
    expect(isReadyMessage(ready)).toBe(true);
    expect(isResultMessage(ready)).toBe(false);
    expect(isResultMessage(result)).toBe(true);
  });
});

describe("RunResult conformance to the frozen contract", () => {
  const samples: RunResultData[] = [
    { ran: true, stdout: "42\n", returnValue: 42, wallMs: 5, timedOut: false },
    { ran: false, stdout: "", wallMs: 0, timedOut: true },
    { ran: false, stdout: "", wallMs: 1, timedOut: false,
      error: { type: "syntax", message: "invalid syntax", line: 2 } },
    { ran: true, stdout: "partial", wallMs: 2, timedOut: false,
      error: { type: "runtime", message: "ZeroDivisionError: division by zero", line: 3 } },
  ];
  it("every host-built RunResult passes Value.Check against @trellis/schema", () => {
    for (const s of samples) {
      expect(Value.Check(RunResult, s)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test protocol`
Expected: FAIL — cannot resolve `../src/protocol.js`.

- [ ] **Step 3: Implement `src/protocol.ts`**

```ts
import type { RunResult, RunRequest } from "@trellis/schema";

// RunResult is the frozen contract type (the worker emits it; the host re-stamps wallMs).
export type RunResultData = RunResult;

// Structured-clone-safe subset of RunRequest that crosses to the worker.
export interface WireRunRequest {
  code: string;
  entrypoint?: string;
  stdin?: string;
  timeoutMs: number;
  memoryMb: number;
}

// ---- host → worker ----
export interface InitMessage {
  kind: "init";
  memoryMb: number;
  pyodideUrl: string;
}
export interface RunMessage {
  kind: "run";
  id: number;
  req: WireRunRequest;
}
export type HostToWorker = InitMessage | RunMessage;

// ---- worker → host ----
export interface ReadyMessage { kind: "ready"; }
export interface InitErrorMessage { kind: "init-error"; message: string; }
export interface ResultMessage { kind: "result"; id: number; result: RunResultData; }
export type WorkerToHost = ReadyMessage | InitErrorMessage | ResultMessage;

export const isReadyMessage = (m: WorkerToHost): m is ReadyMessage => m.kind === "ready";
export const isInitErrorMessage = (m: WorkerToHost): m is InitErrorMessage =>
  m.kind === "init-error";
export const isResultMessage = (m: WorkerToHost): m is ResultMessage => m.kind === "result";

// The browser `Worker` shape, narrowed to what the host uses. The mock implements this.
export interface WorkerLike {
  postMessage(msg: HostToWorker): void;
  terminate(): void;
  onmessage: ((ev: { data: WorkerToHost }) => void) | null;
  onerror: ((ev: { message: string }) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

// Re-export for convenience at the package boundary.
export type { RunRequest };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test protocol`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/sandbox/src/protocol.ts packages/sandbox/test/protocol.test.ts
git -c user.name='m3a-sandbox' -c user.email='noreply@anthropic.com' commit -m "feat(sandbox): worker protocol + RunResult contract conformance"
```

---

### Task 4: Mock worker test double + `FakeClock`

**Files:**
- Create: `packages/sandbox/test/mock-worker.ts`

This is test infrastructure (no production code). It provides a scripted `WorkerLike` and a `FakeClock`. No standalone test file — it is exercised by Tasks 5–7. To keep TDD honest, add a tiny self-test at the bottom is **not** done; instead `worker-host.test.ts` (Task 5) is the first consumer and proves it.

- [ ] **Step 1: Implement `test/mock-worker.ts`**

```ts
import type { Clock, Timer } from "../src/clock.js";
import type {
  HostToWorker,
  WorkerLike,
  WorkerToHost,
  WireRunRequest,
  RunResultData,
} from "../src/protocol.js";

// A deterministic clock: tests call advance(ms) to fire due timers and move now().
export class FakeClock implements Clock {
  private t = 0;
  private timers: { at: number; fn: () => void; id: Timer }[] = [];

  now(): number {
    return this.t;
  }

  setTimer(fn: () => void, ms: number): Timer {
    const id: Timer = {};
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  }

  clearTimer(id: Timer): void {
    this.timers = this.timers.filter((x) => x.id !== id);
  }

  // Advance time; fire all timers whose deadline has passed, in chronological order.
  advance(ms: number): void {
    this.t += ms;
    const due = this.timers.filter((x) => x.at <= this.t).sort((a, b) => a.at - b.at);
    this.timers = this.timers.filter((x) => x.at > this.t);
    for (const d of due) d.fn();
  }
}

// Flush the microtask queue so message handlers (dispatched via queueMicrotask) run.
export const flush = (): Promise<void> => new Promise<void>((r) => queueMicrotask(r));

export type RunOutcome = RunResultData | "hang";

export interface MockBehavior {
  // "immediate" (default): post ready in a microtask. "never": never become ready.
  ready?: "immediate" | "never";
  // Per-run outcome. Default: a trivial success. "hang" never replies (infinite loop).
  onRun?: (req: WireRunRequest) => RunOutcome;
}

export interface MockWorker extends WorkerLike {
  readonly terminated: boolean;
  readonly initMemoryMb: number | null;
  readonly runCount: number;
}

// Factory that records every worker it makes, so tests can inspect the pool.
export function makeMockFactory(behavior: MockBehavior = {}): {
  factory: () => MockWorker;
  workers: MockWorker[];
} {
  const workers: MockWorker[] = [];
  const factory = (): MockWorker => {
    let terminated = false;
    let initMemoryMb: number | null = null;
    let runCount = 0;
    const self: MockWorker = {
      onmessage: null,
      onerror: null,
      get terminated() {
        return terminated;
      },
      get initMemoryMb() {
        return initMemoryMb;
      },
      get runCount() {
        return runCount;
      },
      postMessage(msg: HostToWorker) {
        if (terminated) return;
        if (msg.kind === "init") {
          initMemoryMb = msg.memoryMb;
          if ((behavior.ready ?? "immediate") === "immediate") {
            queueMicrotask(() => {
              if (!terminated) self.onmessage?.({ data: { kind: "ready" } as WorkerToHost });
            });
          }
          return;
        }
        // kind === "run"
        runCount += 1;
        const outcome = (behavior.onRun ?? defaultRun)(msg.req);
        if (outcome === "hang") return; // never replies → watchdog must fire
        queueMicrotask(() => {
          if (!terminated) {
            self.onmessage?.({ data: { kind: "result", id: msg.id, result: outcome } });
          }
        });
      },
      terminate() {
        terminated = true;
      },
    };
    workers.push(self);
    return self;
  };
  return { factory, workers };
}

const defaultRun = (req: WireRunRequest): RunResultData => ({
  ran: true,
  stdout: "",
  returnValue: null,
  wallMs: 1,
  timedOut: false,
});
```

- [ ] **Step 2: Typecheck the test util compiles**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox typecheck`
Expected: PASS (no errors). It is exercised by Task 5's tests.

- [ ] **Step 3: Commit**

```bash
git add packages/sandbox/test/mock-worker.ts
git -c user.name='m3a-sandbox' -c user.email='noreply@anthropic.com' commit -m "test(sandbox): mock worker double + FakeClock"
```

---

### Task 5: `WorkerHost` — single worker lifecycle

**Files:**
- Create: `packages/sandbox/src/worker-host.ts`
- Test: `packages/sandbox/test/worker-host.test.ts`

`WorkerHost` owns one worker: it posts `init` on construction, resolves `ready()` on the `ready` message (or rejects on `init-error`/`onerror`/warmup-timeout), correlates one in-flight `run` by id, and `terminate()`s (rejecting any pending run). Run-level watchdog is NOT here — that's the sandbox's job (Task 7). The host only times out its own *warmup*.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { WorkerHost } from "../src/worker-host.js";
import { makeMockFactory, FakeClock, flush } from "./mock-worker.js";
import { PINNED_PYODIDE_URL } from "../src/pinned.js";

const cfg = (clock: FakeClock) => ({
  memoryMb: 256,
  pyodideUrl: PINNED_PYODIDE_URL,
  clock,
  warmupTimeoutMs: 30_000,
});

describe("WorkerHost", () => {
  it("posts init with memoryMb and becomes ready", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory();
    const host = new WorkerHost(factory, cfg(clock));
    expect(host.state).toBe("warming");
    await host.ready();
    expect(host.state).toBe("ready");
    expect(workers[0]?.initMemoryMb).toBe(256);
  });

  it("runs and resolves with the worker's RunResult, returning to ready", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({
      onRun: () => ({ ran: true, stdout: "ok\n", returnValue: 7, wallMs: 2, timedOut: false }),
    });
    const host = new WorkerHost(factory, cfg(clock));
    await host.ready();
    const res = await host.run({ code: "print('ok')", timeoutMs: 1000, memoryMb: 256 });
    expect(res.returnValue).toBe(7);
    expect(host.state).toBe("ready");
  });

  it("rejects ready() and goes dead if warmup exceeds the timeout", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory({ ready: "never" });
    const host = new WorkerHost(factory, cfg(clock));
    const p = host.ready();
    clock.advance(30_000);
    await expect(p).rejects.toThrow(/warmup/i);
    expect(host.state).toBe("dead");
    expect(workers[0]?.terminated).toBe(true);
  });

  it("terminate() rejects an in-flight run and marks the worker terminated", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory({ onRun: () => "hang" });
    const host = new WorkerHost(factory, cfg(clock));
    await host.ready();
    const runP = host.run({ code: "while True: pass", timeoutMs: 1000, memoryMb: 256 });
    host.terminate();
    await expect(runP).rejects.toThrow(/terminated/i);
    expect(workers[0]?.terminated).toBe(true);
    expect(host.state).toBe("dead");
  });

  it("rejects ready() on init-error", async () => {
    const clock = new FakeClock();
    const factory = () => {
      const w = {
        onmessage: null as null | ((ev: { data: unknown }) => void),
        onerror: null,
        postMessage() {
          queueMicrotask(() =>
            w.onmessage?.({ data: { kind: "init-error", message: "boom" } }),
          );
        },
        terminate() {},
      };
      return w as never;
    };
    const host = new WorkerHost(factory, cfg(clock));
    await expect(host.ready()).rejects.toThrow(/boom/);
    expect(host.state).toBe("dead");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test worker-host`
Expected: FAIL — cannot resolve `../src/worker-host.js` (and `../src/pinned.js`).

- [ ] **Step 3: Create `src/pinned.ts`** (needed by the test import; full content also used in Task 8)

```ts
// Single source of truth for the pinned Pyodide runtime. The exact version must be
// confirmed/bumped against the CDN in a NETWORKED environment, and checked for
// pygame-ce >= 0.26 compatibility (§17.1). Pinned (not "latest") for determinism.
export const PYODIDE_VERSION = "0.27.2";
export const PINNED_PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
```

- [ ] **Step 4: Implement `src/worker-host.ts`**

```ts
import type { RunRequest, RunResult } from "@trellis/schema";
import type { Clock, Timer } from "./clock.js";
import {
  isInitErrorMessage,
  isReadyMessage,
  isResultMessage,
  type WorkerFactory,
  type WorkerLike,
} from "./protocol.js";

export type HostState = "warming" | "ready" | "running" | "dead";

export interface WorkerHostConfig {
  memoryMb: number;
  pyodideUrl: string;
  clock: Clock;
  warmupTimeoutMs: number;
}

interface Pending {
  id: number;
  resolve: (r: RunResult) => void;
  reject: (e: Error) => void;
}

export class WorkerHost {
  private readonly worker: WorkerLike;
  private readonly clock: Clock;
  private state_: HostState = "warming";
  private nextId = 1;
  private pending: Pending | null = null;
  private readyResolve!: () => void;
  private readyReject!: (e: Error) => void;
  private readonly readyPromise: Promise<void>;
  private warmupTimer: Timer | null = null;

  constructor(factory: WorkerFactory, private readonly config: WorkerHostConfig) {
    this.clock = config.clock;
    this.worker = factory();
    this.worker.onmessage = (ev) => this.onMessage(ev.data);
    this.worker.onerror = (ev) => this.fail(new Error(`worker error: ${ev.message}`));
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    // Catch warmup hangs: terminate and reject if not ready in time.
    this.warmupTimer = this.clock.setTimer(() => {
      if (this.state_ === "warming") this.fail(new Error("warmup timed out"));
    }, config.warmupTimeoutMs);
    this.worker.postMessage({
      kind: "init",
      memoryMb: config.memoryMb,
      pyodideUrl: config.pyodideUrl,
    });
  }

  get state(): HostState {
    return this.state_;
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  run(req: RunRequest): Promise<RunResult> {
    if (this.state_ === "dead") return Promise.reject(new Error("worker is dead"));
    if (this.state_ !== "ready") return Promise.reject(new Error(`cannot run while ${this.state_}`));
    const id = this.nextId++;
    this.state_ = "running";
    return new Promise<RunResult>((resolve, reject) => {
      this.pending = { id, resolve, reject };
      this.worker.postMessage({
        kind: "run",
        id,
        req: {
          code: req.code,
          ...(req.entrypoint !== undefined ? { entrypoint: req.entrypoint } : {}),
          ...(req.stdin !== undefined ? { stdin: req.stdin } : {}),
          timeoutMs: req.timeoutMs,
          memoryMb: req.memoryMb,
        },
      });
    });
  }

  terminate(): void {
    if (this.state_ === "dead") return;
    this.clearWarmup();
    this.state_ = "dead";
    this.worker.terminate();
    if (this.pending) {
      this.pending.reject(new Error("worker terminated"));
      this.pending = null;
    }
  }

  private clearWarmup(): void {
    if (this.warmupTimer !== null) {
      this.clock.clearTimer(this.warmupTimer);
      this.warmupTimer = null;
    }
  }

  private fail(err: Error): void {
    if (this.state_ === "dead") return;
    const wasWarming = this.state_ === "warming";
    this.clearWarmup();
    this.state_ = "dead";
    this.worker.terminate();
    if (wasWarming) this.readyReject(err);
    if (this.pending) {
      this.pending.reject(err);
      this.pending = null;
    }
  }

  private onMessage(msg: import("./protocol.js").WorkerToHost): void {
    if (this.state_ === "dead") return;
    if (isReadyMessage(msg)) {
      this.clearWarmup();
      this.state_ = "ready";
      this.readyResolve();
      return;
    }
    if (isInitErrorMessage(msg)) {
      this.fail(new Error(msg.message));
      return;
    }
    if (isResultMessage(msg)) {
      if (this.pending && this.pending.id === msg.id) {
        const { resolve } = this.pending;
        this.pending = null;
        this.state_ = "ready";
        resolve(msg.result);
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test worker-host`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/sandbox/src/worker-host.ts packages/sandbox/src/pinned.ts packages/sandbox/test/worker-host.test.ts
git -c user.name='m3a-sandbox' -c user.email='noreply@anthropic.com' commit -m "feat(sandbox): WorkerHost single-worker lifecycle + pinned Pyodide constants"
```

---

### Task 6: `WarmPool` — keep N hosts hot, replace terminated ones

**Files:**
- Create: `packages/sandbox/src/warm-pool.ts`
- Test: `packages/sandbox/test/warm-pool.test.ts`

The pool spawns `poolSize` hosts, hands a ready host to `acquire()` (waiting if none ready), takes a host back on `release()`, and on `discard()` removes a dead host and spawns a replacement so the warm count self-heals. `status()` exposes warming/ready/running counts for the runner's "warming…" UI.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { WarmPool } from "../src/warm-pool.js";
import { makeMockFactory, FakeClock, flush } from "./mock-worker.js";
import { PINNED_PYODIDE_URL } from "../src/pinned.js";

const cfg = (clock: FakeClock, poolSize = 2) => ({
  poolSize,
  memoryMb: 256,
  pyodideUrl: PINNED_PYODIDE_URL,
  clock,
  warmupTimeoutMs: 30_000,
});

describe("WarmPool", () => {
  it("warms up to poolSize and reports status", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory();
    const pool = new WarmPool(factory, cfg(clock, 2));
    pool.start();
    expect(pool.status().warming).toBe(2);
    await pool.warmup();
    await flush();
    expect(workers.length).toBe(2);
    expect(pool.status().ready).toBeGreaterThanOrEqual(1);
  });

  it("acquire returns a ready host; release returns it to the pool", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory();
    const pool = new WarmPool(factory, cfg(clock, 1));
    pool.start();
    await pool.warmup();
    const h = await pool.acquire();
    expect(h.state).toBe("ready");
    expect(pool.status().ready).toBe(0);
    pool.release(h);
    expect(pool.status().ready).toBe(1);
  });

  it("acquire waits when none are ready, then resolves once one warms", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({ ready: "never" });
    const pool = new WarmPool(factory, cfg(clock, 1));
    pool.start();
    let acquired = false;
    const p = pool.acquire().then((h) => { acquired = true; return h; });
    await flush();
    expect(acquired).toBe(false); // still warming (mock never auto-readies)
    // Swap in a ready replacement by discarding the stuck host:
    // (covered more directly in the discard test) — here just assert it pends.
    expect(pool.status().warming).toBe(1);
    void p;
  });

  it("discard removes a host and spawns a replacement (self-heals warm count)", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory();
    const pool = new WarmPool(factory, cfg(clock, 1));
    pool.start();
    await pool.warmup();
    const h = await pool.acquire();
    h.terminate();
    pool.discard(h);
    await pool.warmup();
    await flush();
    expect(workers.length).toBe(2); // original + replacement
    expect(pool.status().ready).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test warm-pool`
Expected: FAIL — cannot resolve `../src/warm-pool.js`.

- [ ] **Step 3: Implement `src/warm-pool.ts`**

```ts
import type { Clock } from "./clock.js";
import type { WorkerFactory } from "./protocol.js";
import { WorkerHost } from "./worker-host.js";

export interface WarmPoolConfig {
  poolSize: number;
  memoryMb: number;
  pyodideUrl: string;
  clock: Clock;
  warmupTimeoutMs: number;
}

export interface PoolStatus {
  warming: number;
  ready: number;
  running: number;
  total: number;
}

export class WarmPool {
  private readonly all = new Set<WorkerHost>();
  private readonly available: WorkerHost[] = [];
  private readonly waiters: Array<(h: WorkerHost) => void> = [];
  private started = false;

  constructor(
    private readonly factory: WorkerFactory,
    private readonly config: WarmPoolConfig,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    for (let i = 0; i < this.config.poolSize; i++) this.spawn();
  }

  private spawn(): void {
    const host = new WorkerHost(this.factory, {
      memoryMb: this.config.memoryMb,
      pyodideUrl: this.config.pyodideUrl,
      clock: this.config.clock,
      warmupTimeoutMs: this.config.warmupTimeoutMs,
    });
    this.all.add(host);
    host
      .ready()
      .then(() => this.makeAvailable(host))
      .catch(() => this.discard(host));
  }

  private makeAvailable(host: WorkerHost): void {
    if (!this.all.has(host) || host.state === "dead") return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(host); // handed straight to a waiter; stays "checked out"
    } else {
      this.available.push(host);
    }
  }

  acquire(): Promise<WorkerHost> {
    const h = this.available.pop();
    if (h) return Promise.resolve(h);
    return new Promise<WorkerHost>((resolve) => this.waiters.push(resolve));
  }

  // Return a reusable host (after a normal run) to the available set.
  release(host: WorkerHost): void {
    if (host.state === "ready") this.makeAvailable(host);
    else this.discard(host);
  }

  // A host is dead/terminated: drop it and spawn a replacement to keep warm count.
  discard(host: WorkerHost): void {
    const idx = this.available.indexOf(host);
    if (idx >= 0) this.available.splice(idx, 1);
    if (this.all.delete(host)) {
      host.terminate();
      if (this.started) this.spawn();
    }
  }

  // Resolves when at least one host is ready (or already available).
  async warmup(): Promise<void> {
    if (this.available.length > 0) return;
    const h = await this.acquire();
    this.available.push(h); // put it back; warmup only observes readiness
    // de-dupe if a waiter race left it absent
    if (this.available.indexOf(h) !== this.available.lastIndexOf(h)) this.available.pop();
  }

  status(): PoolStatus {
    let warming = 0;
    let ready = 0;
    let running = 0;
    for (const h of this.all) {
      if (h.state === "warming") warming++;
      else if (h.state === "running") running++;
      else if (h.state === "ready") ready++;
    }
    // `ready` counts ready hosts; only those in `available` are acquirable.
    return { warming, ready: this.available.length, running, total: this.all.size };
  }

  drain(): void {
    for (const h of [...this.all]) {
      this.all.delete(h);
      h.terminate();
    }
    this.available.length = 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test warm-pool`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/sandbox/src/warm-pool.ts packages/sandbox/test/warm-pool.test.ts
git -c user.name='m3a-sandbox' -c user.email='noreply@anthropic.com' commit -m "feat(sandbox): WarmPool with self-healing replacement"
```

---

### Task 7: `createSandbox` — watchdog race, timeout→terminate→replace (the gate)

**Files:**
- Create: `packages/sandbox/src/sandbox.ts`
- Modify: `packages/sandbox/src/index.ts`
- Test: `packages/sandbox/test/sandbox.test.ts`

This is the milestone gate. `run(req)` acquires a warm host, arms the host-side watchdog for `req.timeoutMs`, and races result vs. timeout. On timeout it terminates the host, discards it (pool spawns a replacement), and returns `{ ran:false, timedOut:true }`. Normal completion re-stamps `wallMs` (end-to-end) and releases the host. Requests whose `memoryMb` exceeds the pool cap run on a dedicated worker.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createSandbox } from "../src/sandbox.js";
import { makeMockFactory, FakeClock, flush } from "./mock-worker.js";

const base = { code: "print('hi')", timeoutMs: 1000, memoryMb: 256 };

describe("createSandbox (gate behaviors)", () => {
  it("a warm trivial run completes within budget", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({
      onRun: () => ({ ran: true, stdout: "hi\n", returnValue: null, wallMs: 1, timedOut: false }),
    });
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1 });
    await sb.warmup();
    const res = await sb.run({ ...base });
    expect(res.ran).toBe(true);
    expect(res.timedOut).toBe(false);
    expect(res.stdout).toBe("hi\n");
    expect(res.wallMs).toBeGreaterThanOrEqual(0);
    sb.dispose();
  });

  it("an infinite-loop submission is killed by the watchdog → timedOut:true, not a hang", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory({ onRun: () => "hang" });
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1 });
    await sb.warmup();
    const p = sb.run({ ...base, code: "while True: pass", timeoutMs: 2000 });
    await flush();
    clock.advance(2000); // watchdog fires
    const res = await p;
    expect(res.timedOut).toBe(true);
    expect(res.ran).toBe(false);
    expect(workers[0]?.terminated).toBe(true); // killed
    // a replacement was spun up to restore the warm pool
    await sb.warmup();
    await flush();
    expect(workers.length).toBe(2);
    sb.dispose();
  });

  it("reports a syntax error with type + line", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({
      onRun: () => ({
        ran: false, stdout: "", wallMs: 0, timedOut: false,
        error: { type: "syntax", message: "invalid syntax", line: 1 },
      }),
    });
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1 });
    await sb.warmup();
    const res = await sb.run({ ...base, code: "def f(:" });
    expect(res.ran).toBe(false);
    expect(res.error?.type).toBe("syntax");
    expect(res.error?.line).toBe(1);
    sb.dispose();
  });

  it("reports a runtime error with type + line (ran stays true)", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory({
      onRun: () => ({
        ran: true, stdout: "", wallMs: 1, timedOut: false,
        error: { type: "runtime", message: "ZeroDivisionError: division by zero", line: 2 },
      }),
    });
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1 });
    await sb.warmup();
    const res = await sb.run({ ...base, code: "x=1\nprint(1/0)" });
    expect(res.ran).toBe(true);
    expect(res.error?.type).toBe("runtime");
    expect(res.error?.line).toBe(2);
    sb.dispose();
  });

  it("cold warm-up state is observable via status()", async () => {
    const clock = new FakeClock();
    const { factory } = makeMockFactory();
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 2 });
    expect(sb.status().warming).toBe(2);
    expect(sb.status().ready).toBe(0);
    await sb.warmup();
    await flush();
    expect(sb.status().ready).toBeGreaterThanOrEqual(1);
    sb.dispose();
  });

  it("a request exceeding the pool memory cap runs on a dedicated worker", async () => {
    const clock = new FakeClock();
    const { factory, workers } = makeMockFactory();
    const sb = createSandbox({ workerFactory: factory, clock, poolSize: 1, memoryMb: 128 });
    await sb.warmup();
    const res = await sb.run({ ...base, memoryMb: 512 });
    expect(res.ran).toBe(true);
    // dedicated worker created with the larger cap, then terminated
    const dedicated = workers.find((w) => w.initMemoryMb === 512);
    expect(dedicated).toBeDefined();
    expect(dedicated?.terminated).toBe(true);
    sb.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test sandbox`
Expected: FAIL — cannot resolve `../src/sandbox.js`.

- [ ] **Step 3: Implement `src/sandbox.ts`**

```ts
import type { RunRequest, RunResult, Sandbox } from "@trellis/schema";
import { realClock, type Clock } from "./clock.js";
import { PINNED_PYODIDE_URL } from "./pinned.js";
import type { WorkerFactory } from "./protocol.js";
import { WorkerHost } from "./worker-host.js";
import { WarmPool, type PoolStatus } from "./warm-pool.js";

export interface SandboxConfig {
  workerFactory: WorkerFactory;
  poolSize?: number; // default 2
  memoryMb?: number; // warm-pool worker cap; default 256
  pyodideUrl?: string; // default PINNED_PYODIDE_URL
  clock?: Clock; // default realClock
  warmupTimeoutMs?: number; // default 30_000
}

// The concrete sandbox extends the frozen `Sandbox` with lifecycle observability.
// This adds methods; it does NOT change the frozen contract (still `{ run }`).
export interface ManagedSandbox extends Sandbox {
  warmup(): Promise<void>;
  status(): PoolStatus;
  dispose(): void;
}

export function createSandbox(config: SandboxConfig): ManagedSandbox {
  const clock = config.clock ?? realClock;
  const memoryMb = config.memoryMb ?? 256;
  const pyodideUrl = config.pyodideUrl ?? PINNED_PYODIDE_URL;
  const warmupTimeoutMs = config.warmupTimeoutMs ?? 30_000;
  const poolSize = config.poolSize ?? 2;

  const pool = new WarmPool(config.workerFactory, {
    poolSize,
    memoryMb,
    pyodideUrl,
    clock,
    warmupTimeoutMs,
  });
  pool.start();

  // Run on a one-off worker (not from the pool); terminate it when done.
  async function runDedicated(req: RunRequest): Promise<RunResult> {
    const host = new WorkerHost(config.workerFactory, {
      memoryMb: req.memoryMb,
      pyodideUrl,
      clock,
      warmupTimeoutMs,
    });
    const start = clock.now();
    try {
      await host.ready();
      return await raceRun(host, req, start, () => host.terminate());
    } finally {
      host.terminate();
    }
  }

  // Race the worker's result against the host-armed watchdog.
  async function raceRun(
    host: WorkerHost,
    req: RunRequest,
    start: number,
    onTimeoutKill: () => void,
  ): Promise<RunResult> {
    let timedOut = false;
    const timer = clock.setTimer(() => {
      timedOut = true;
      onTimeoutKill();
    }, req.timeoutMs);
    try {
      const result = await host.run(req);
      clock.clearTimer(timer);
      return { ...result, wallMs: clock.now() - start };
    } catch (err) {
      clock.clearTimer(timer);
      if (timedOut) {
        return { ran: false, stdout: "", wallMs: clock.now() - start, timedOut: true };
      }
      // Unexpected worker death (crash) → surface as a runtime error.
      return {
        ran: false,
        stdout: "",
        wallMs: clock.now() - start,
        timedOut: false,
        error: { type: "runtime", message: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  async function run(req: RunRequest): Promise<RunResult> {
    if (req.memoryMb > memoryMb) return runDedicated(req);
    const host = await pool.acquire();
    const start = clock.now();
    const result = await raceRun(host, req, start, () => host.terminate());
    if (result.timedOut || host.state === "dead") pool.discard(host);
    else pool.release(host);
    return result;
  }

  return {
    run,
    warmup: () => pool.warmup(),
    status: () => pool.status(),
    dispose: () => pool.drain(),
  };
}
```

- [ ] **Step 4: Update `src/index.ts` to export the public surface**

```ts
// @trellis/sandbox — Pyodide Web Worker grader host (M3a).
// Implements the frozen @trellis/schema `Sandbox` contract (§6.1).
export { createSandbox } from "./sandbox.js";
export type { SandboxConfig, ManagedSandbox } from "./sandbox.js";
export type { PoolStatus } from "./warm-pool.js";
export { realClock } from "./clock.js";
export type { Clock, Timer } from "./clock.js";
export type { WorkerLike, WorkerFactory } from "./protocol.js";
export { PYODIDE_VERSION, PINNED_PYODIDE_URL } from "./pinned.js";
export { browserWorkerFactory } from "./browser-worker.js";
```

> Note: `./browser-worker.js` is created in Task 8. If executing strictly in order, temporarily omit that last export line until Task 8 lands, then add it. (Subagent-driven execution: include it when Task 8 is done.)

- [ ] **Step 5: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test sandbox`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/sandbox/src/sandbox.ts packages/sandbox/src/index.ts packages/sandbox/test/sandbox.test.ts
git -c user.name='m3a-sandbox' -c user.email='noreply@anthropic.com' commit -m "feat(sandbox): createSandbox watchdog race + warm-pool integration (gate)"
```

---

### Task 8: Real Pyodide worker entry + browser worker factory (DEFERRED verification)

**Files:**
- Create: `packages/sandbox/src/pyodide-worker.ts`
- Create: `packages/sandbox/src/browser-worker.ts`

This is the production code that actually loads Pyodide and runs Python. It **cannot be behavior-verified here** (no network → no Pyodide/pygame wheels). It is written carefully against the verified Pyodide API and must **typecheck**; its real behavior is DEFERRED to a networked environment. No unit test asserts its runtime behavior (a mock can't load WASM); the gate's real-Pyodide clauses are deferred.

Verified Pyodide API used (via context7 `/pyodide/pyodide`): `loadPyodide({ indexURL })` from `<url>pyodide.mjs`; `runPythonAsync(code, { globals })`; fresh namespace via `pyodide.globals.get("dict")()`; error introspection done **inside Python** (compile→`SyntaxError.lineno`; `traceback` for runtime line) and returned as a JSON string for structured-clone safety.

- [ ] **Step 1: Implement `src/pyodide-worker.ts`**

```ts
/**
 * Real Web Worker entry for the Pyodide grader. DEFERRED VERIFICATION:
 * requires network (pinned Pyodide CDN); cannot run in this environment.
 *
 * Isolation (§6.1): each run execs learner code into a FRESH local dict inside the
 * Python harness, so a reused warm worker cannot leak globals between runs. The worker
 * never imports the `js` FFI, has no DOM/network, and the boundary is structured-clone
 * only (we ship a JSON string out of Python and JSON.parse it here).
 *
 * This module is meant to be the entry of a module Worker. It references `self` as a
 * DedicatedWorkerGlobalScope. It is intentionally framework-free so a bundler can emit
 * it as a standalone worker chunk (wiring is M3b/app concern).
 */
import type { HostToWorker, RunResultData } from "./protocol.js";

// The Python harness, loaded once. Per run it builds a fresh namespace, captures stdout,
// classifies syntax (compile) vs runtime (exec) errors with a line number, and returns a
// JSON-serializable dict so the result survives structured clone.
const HARNESS = `
import io, sys, json, traceback

def __trellis_run(code, entrypoint, stdin_text):
    ns = {}
    out = io.StringIO()
    try:
        compiled = compile(code, "<submission>", "exec")
    except SyntaxError as e:
        return json.dumps({
            "ran": False, "stdout": "", "wallMs": 0, "timedOut": False,
            "error": {"type": "syntax", "message": (e.msg or "syntax error"), "line": e.lineno},
        })
    old_out, old_in = sys.stdout, sys.stdin
    sys.stdout = out
    if stdin_text is not None:
        sys.stdin = io.StringIO(stdin_text)
    return_value = None
    try:
        exec(compiled, ns)
        if entrypoint and entrypoint in ns and callable(ns[entrypoint]):
            return_value = ns[entrypoint]()
    except BaseException as e:
        tb = e.__traceback__
        line = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == "<submission>":
                line = tb.tb_lineno
            tb = tb.tb_next
        return json.dumps({
            "ran": True, "stdout": out.getvalue(), "wallMs": 0, "timedOut": False,
            "error": {"type": "runtime", "message": f"{type(e).__name__}: {e}", "line": line},
        })
    finally:
        sys.stdout = old_out
        sys.stdin = old_in
    return json.dumps({
        "ran": True, "stdout": out.getvalue(), "wallMs": 0, "timedOut": False,
        "returnValue": return_value,
    }, default=str)
`;

interface PyodideLike {
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void };
}

declare const self: {
  onmessage: ((ev: { data: HostToWorker }) => void) | null;
  postMessage(msg: unknown): void;
};

let pyodide: PyodideLike | null = null;

async function init(memoryMb: number, pyodideUrl: string): Promise<void> {
  // Dynamic import of the pinned CDN ESM build (network-only; deferred verification).
  const mod: { loadPyodide: (opts: { indexURL: string }) => Promise<PyodideLike> } =
    await import(/* @vite-ignore */ `${pyodideUrl}pyodide.mjs`);
  const py = await mod.loadPyodide({ indexURL: pyodideUrl });
  await py.runPythonAsync(HARNESS);
  pyodide = py;
  // NOTE: `memoryMb` is accepted for forward-compat. A hard per-instance WASM cap needs
  // a custom WebAssembly.Memory at module instantiation (advanced/emscripten-build
  // dependent); for now OOM surfaces as a MemoryError (runtime) from the harness. To be
  // tuned under real-Pyodide verification.
  void memoryMb;
}

async function runOne(id: number, req: HostToWorker extends infer _ ? never : never): Promise<void> {
  // (placeholder type guard removed below; see real handler)
  void id;
  void req;
}

self.onmessage = (ev: { data: HostToWorker }): void => {
  const msg = ev.data;
  if (msg.kind === "init") {
    init(msg.memoryMb, msg.pyodideUrl)
      .then(() => self.postMessage({ kind: "ready" }))
      .catch((e: unknown) =>
        self.postMessage({
          kind: "init-error",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    return;
  }
  // msg.kind === "run"
  const { id, req } = msg;
  void runOne; // keep import-shape stable; actual work inline below
  (async (): Promise<void> => {
    if (!pyodide) {
      self.postMessage({
        kind: "result",
        id,
        result: {
          ran: false, stdout: "", wallMs: 0, timedOut: false,
          error: { type: "runtime", message: "pyodide not initialized" },
        } satisfies RunResultData,
      });
      return;
    }
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      pyodide.globals.set("_code", req.code);
      pyodide.globals.set("_entry", req.entrypoint ?? null);
      pyodide.globals.set("_stdin", req.stdin ?? null);
      const json = (await pyodide.runPythonAsync(
        "__trellis_run(_code, _entry, _stdin)",
      )) as string;
      const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
      const result = { ...(JSON.parse(json) as RunResultData), wallMs: t1 - t0 };
      self.postMessage({ kind: "result", id, result } satisfies {
        kind: "result";
        id: number;
        result: RunResultData;
      });
    } catch (e: unknown) {
      const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
      self.postMessage({
        kind: "result",
        id,
        result: {
          ran: false, stdout: "", wallMs: t1 - t0, timedOut: false,
          error: { type: "runtime", message: e instanceof Error ? e.message : String(e) },
        } satisfies RunResultData,
      });
    }
  })();
};
```

> When implementing, DELETE the dead `runOne` stub — it exists in the draft above only to flag that the run handler is inline. The engineer should remove `runOne` and its `void runOne;` line; keep the inline async run handler. (Left visible here so you don't reintroduce a worker-side abstraction that isn't needed.)

- [ ] **Step 2: Implement `src/browser-worker.ts`**

```ts
/**
 * Production WorkerFactory: constructs a real module Worker from a bundled worker URL.
 * DEFERRED VERIFICATION: exercising a real Worker requires a browser + network.
 *
 * The app/bundler is responsible for producing `workerUrl` from src/pyodide-worker.ts,
 * e.g. `new URL("./pyodide-worker.js", import.meta.url)`. That wiring is M3b/app-level.
 */
import type { WorkerFactory, WorkerLike } from "./protocol.js";

export function browserWorkerFactory(workerUrl: string | URL): WorkerFactory {
  return () => new Worker(workerUrl, { type: "module" }) as unknown as WorkerLike;
}
```

- [ ] **Step 3: Typecheck (the only verification possible here)**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox typecheck`
Expected: PASS. (If `Worker` is unresolved, confirm `tsconfig.base.json` includes the `DOM` lib — it does.)

- [ ] **Step 4: Re-run the full test suite (worker entry must not break existing tests)**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox test`
Expected: PASS (all prior tests still green; no new tests for the deferred worker).

- [ ] **Step 5: Add the `browserWorkerFactory` export to `src/index.ts`** (if it was omitted in Task 7 Step 4, add it now)

Ensure `src/index.ts` contains:
```ts
export { browserWorkerFactory } from "./browser-worker.js";
```

- [ ] **Step 6: Commit**

```bash
git add packages/sandbox/src/pyodide-worker.ts packages/sandbox/src/browser-worker.ts packages/sandbox/src/index.ts
git -c user.name='m3a-sandbox' -c user.email='noreply@anthropic.com' commit -m "feat(sandbox): real Pyodide worker entry + browser factory (verification deferred: no network)"
```

---

### Task 9: Full gate verification + ESM build smoke + done report

**Files:**
- (no new source) — verification only

- [ ] **Step 1: Run the full per-package gate**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox typecheck && pnpm --filter @trellis/sandbox lint && pnpm --filter @trellis/sandbox test && pnpm --filter @trellis/sandbox build`
Expected: all four green. Capture the real output.

- [ ] **Step 2: Native-ESM import smoke test (the §5 "ESM/build trap" guard)**

Verify the built output imports under native ESM (catches module-cycle deadlocks that pass under Vitest):

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && node -e "import('./packages/sandbox/dist/src/index.js').then(m => { if (typeof m.createSandbox !== 'function') throw new Error('createSandbox missing'); console.log('ESM import OK:', Object.keys(m).sort().join(',')); })"`
Expected: prints `ESM import OK: ...createSandbox...PINNED_PYODIDE_URL...` and exits 0, no hang.

> Note: `dist/` build resolves `@trellis/schema` from its `src` entry. If the build emits to `dist/src/index.js` per the schema package's `outDir` pattern, the path above is correct; if `dist/index.js`, adjust. Confirm the emitted path with `ls packages/sandbox/dist` first.

- [ ] **Step 3: Confirm the frozen contract was not edited** (guardrail check)

Run: `git -C /Users/alan/Desktop/trellis-m3a diff --name-only main -- packages/schema docs TECHNICAL_DESIGN.md turbo.json .eslintrc.cjs pnpm-workspace.yaml`
Expected: **empty** (we only touched `packages/sandbox/**`, plus `pnpm-lock.yaml` which the orchestrator reconciles). If anything else appears, STOP and escalate.

- [ ] **Step 4: Write the done report** (paste into the final summary, not a file)

Must state, with real command output:
- ✅ Mock-worker proof of host/watchdog/warm-pool (Tasks 1–7): trivial warm run within budget; infinite loop → `timedOut:true` + worker terminated + replacement spawned; syntax & runtime errors with type+line; cold warm-up observable via `status()`.
- ✅ Contract conformance: host-built `RunResult`s pass `Value.Check(RunResult, …)`.
- ✅ `typecheck + lint + test + build + native-ESM import` all green.
- ⛔ DEFERRED (no network here): real Pyodide load + `runPythonAsync`, actual `worker.terminate()` of a real WASM interpreter, real syntax/runtime line extraction, memory cap, pygame-ce ≥0.26 compat, and confirming/bumping `PYODIDE_VERSION`. These must be verified in a networked browser environment before M3a is integration-complete. Do NOT claim end-to-end sandbox verification.

- [ ] **Step 5: Finish the branch**

Use `superpowers:finishing-a-development-branch` (merge target: `main`). Present merge/PR options; do not self-merge without the user's choice.

---

## Self-review notes (author check against the gate)

- **Gate "warm trivial run within budget"** → Task 7 test 1. ✅
- **Gate "infinite loop killed → timedOut, not a hung tab"** → Task 7 test 2 (watchdog fires, worker terminated, replacement spawned). ✅
- **Gate "syntax & runtime errors with type+line"** → Task 7 tests 3–4. ✅
- **Gate "cold warm-up observable"** → Task 7 test 5 (`status()`), `warmup()`. ✅
- **Isolation (fresh namespace, no js FFI, structured-clone-only)** → Task 8 harness (`ns={}`, JSON across boundary, no `js` import). Real-Pyodide verification DEFERRED. ✅(design)
- **Kill switch = terminate + warm pool (no SAB/interrupt buffer)** → Tasks 5–7; no `setInterruptBuffer` used. ✅
- **Frozen contract implemented, not changed** → `createSandbox` returns `ManagedSandbox extends Sandbox`; schema untouched (Task 9 step 3). ✅
- **No placeholders:** every code/test step has real content. The two annotated "draft" notes (index.ts export ordering; `runOne` stub removal) are explicit cleanup instructions, not TBDs. ✅
- **Type consistency:** `WorkerLike`, `WorkerFactory`, `RunResultData`, `HostState`, `PoolStatus`, `ManagedSandbox`, `Clock`/`Timer`, `FakeClock`, `makeMockFactory` names are used identically across tasks. ✅
