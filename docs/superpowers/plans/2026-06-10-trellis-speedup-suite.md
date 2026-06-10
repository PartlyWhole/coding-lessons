# Trellis Test-Suite Speedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the CPython spawn overhead that dominates the offline twin and the authoring exec gates (items 2–4 of the rev-2 analysis), then pin a *measured* turbo concurrency cap (item 1), without changing any observable run semantics — the two differential suites are the self-proving acceptance gates.

**Architecture:** (a) `packages/sandbox/src/local-cpython.ts` becomes a warm-server twin: one long-lived `python3` child running the unmodified `RUN_HARNESS`, length-prefixed JSON requests on stdin / replies on a dup'd stdout, async spawn, Node-side per-request watchdog with kill→respawn→`timedOut:true`, RSS-watermark recycle mirroring the warm pool. (b) `packages/authoring/src/ast/python.ts` grows `runCases(specs[])` — ONE `python3` invocation per batch, in-process exec with fresh `ns={}` per case and a per-case SIGALRM timeout; gate 5 (via a `signals.ts` collect/finish split) and gate 6 batch their whole corpus into ≤3 invocations. (c) A content-hash-keyed disk cache under `node_modules/.cache/` memoizes per-case results (pure memo; cold run identical). (d) A repeated-runs concurrency sweep pins the root test script *last*, because items (a)–(c) change the landscape the cap would be tuned to.

**Tech Stack:** Node `child_process` (async `spawn`; `spawnSync` only for the batch bridge), CPython 3.9.6 (`/usr/bin/python3`), vitest, turbo. No new dependencies; `pnpm-lock.yaml` untouched.

**Plan of record:** `docs/design-notes/2026-06-10-test-suite-runtime-analysis.md` (rev 2). Contract: `START-HERE.md` in this worktree. Write set per START-HERE §3 — **plus one flagged addition** (see "Write-set flag" below).

---

## Re-baselined measurements (main @ `76d7781`, workspace 649 tests)

Measured 2026-06-10 on the same machine as the analysis (Darwin arm64, 8 logical / 4 performance cores, Python 3.9.6). All runs FOREGROUND, sequential, captured to files (never piped). The analysis baseline was `750a0c9` (workspace 534); the corpus and workspace have grown since (E-14..E-18, M6 telemetry, M6.5 runtime — `content/` on main now has 21 misconceptions / 98 fixtures (49 build) / 12 oracle properties / 37 test cases).

| Run | Wall (this HEAD) | Analysis @534 |
|---|---|---|
| `pnpm test -- --force` (default concurrency), run 1 | **2m14.2s** (turbo-reported) | 3m11.8s |
| `pnpm test -- --force` (default), run 2 (back-to-back repeat) | **3m26.1s** | — |
| `pnpm test -- --force --concurrency=2` | **2m47.7s** | 2m11.6s |
| `vitest run test/m4-concat-e2e.test.ts` solo (integration-tests) | **5.5s** | 5.7s |
| `vitest run test/differential.test.ts` solo (integration-tests) | **72.4s** | — (inside 101.9s pkg @ c2) |
| `vitest run test/gate-fixtures.test.ts` solo (authoring, gate 5) | **26.7s** | 8.5s |
| `vitest run test/cli.test.ts` solo (authoring, full gates ×3 runs) | **69.0s** | 102.5s (default contention) |
| `vitest run test/gate-fixtures.differential.test.ts` solo | **50.3s** | — |

Microbenchmarks (idle):

| Operation | Cost |
|---|---|
| `python3 -c "pass"` spawn round trip | ~25ms |
| `run_case.py` round trip (spawn + its per-case child) | ~53ms |
| `python3 -c "import pygame"` spawn | ~258ms |

Per-package vitest durations at this HEAD (forced, run 1 default / c2):

| Package | default | c2 |
|---|---|---|
| integration-tests | 115.2s | 119.4s |
| authoring | 89.7s | 79.4s |
| client | 87.6s | 77.0s |
| sandbox | 6.8s | 3.7s |
| engine | 4.8s | 2.2s |
| others (schema/persist/runtime/telemetry) | ≤3.2s | ≤1.6s |

**Two findings that amend the rev-2 picture (flagged to the orchestrator in the Phase-1 report):**

1. **The c2 headline no longer holds at this HEAD.** Default (2m14.2s) beat c2 (2m47.7s) in single runs, *and* a back-to-back default repeat took 3m26.1s — ±35% run-to-run noise on this loaded desktop. Cause of the reversal: the three heavy packages each grew to ~80–120s and at `--concurrency=2` they can no longer all overlap (serialization cost now rivals the contention saving rev 2 measured when client was 31s). Cause of the noise: ambient desktop load **plus leaked runaway grandchildren** (observed: an orphaned `python3 -c <guessing-game fixture>` at 97% CPU minutes after its suite run ended — `run_case.py` killed mid-`subprocess.run` orphans its child). Consequence: the sweep (Task 7) uses repeated runs + medians + straggler hygiene, runs LAST, and only pins a cap if the median win exceeds the noise band.
2. **Gate cost compounding confirmed:** gate-5 solo grew 8.5s → 26.7s with the corpus (rev-2's prediction). The batch+cache fixes are the levers that matter for the content track.

Estimated landing zone after Tasks 1–6 (estimates, to be re-measured in Task 8): differential solo 72s → ~10–20s; gate-fixtures solo 26.7s → ~2–4s first run, sub-second warm-cache; cli solo 69s → ~10s; m4 solo 5.5s → ~1.5s; forced suite floor set by client (~80–90s, out of scope).

---

## Write-set flag (resolve with orchestrator before Task 4)

START-HERE §3 lists `packages/authoring/src/ast/python.ts` and `packages/authoring/src/gates/**` as writable, but the actual gate-5 exec call site is **`packages/authoring/src/signals.ts`** (`buildSignals`/`signalsFor` issue every `runCase`). The mission text (§1.3: "`python.ts` **+ its exec-gate call sites**") clearly intends it; the §3 list omits it. Task 4 needs a collect/finish split in `signals.ts`. **Get explicit orchestrator sign-off on adding `signals.ts` to the write set before starting Task 4; Tasks 1–3 and 5 do not need it.** If denied, Tasks 4's batching happens only at the `runCases` + cache layer (gate 5 still drops to ~2 cached spawns per fixture instead of 2 total) — degraded but compliant.

`packages/authoring/py/**` is also not in the write set; therefore the batch driver is an **embedded Python string in `python.ts`** (same pattern as `RUN_HARNESS` in the sandbox). `run_case.py`/`ast_dump.py` stay untouched.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `packages/sandbox/src/local-cpython.ts` | Rewrite internals (public API preserved + optional `dispose()`) | Warm-server twin: server driver string, framing codec, request queue, watchdog, recycle |
| `packages/sandbox/test/local-cpython.test.ts` | Keep green unchanged | The existing behavioral spec (16 tests) — MUST pass against the new twin |
| `packages/sandbox/test/local-cpython-server.test.ts` | Create | Server-specific behaviors: respawn after timeout, crash recovery, C-level stdout junk, recycle watermark, serialization |
| `packages/authoring/src/ast/python.ts` | Extend | `BATCH_DRIVER` string, `runCases()`, `runCase()` delegating to it, `parsePython` memo, disk cache |
| `packages/authoring/src/signals.ts` | Modify (pending write-set sign-off) | Split `buildSignals` into `planBuildSignals` (collect specs) + `finishBuildSignals` (pure assembly) |
| `packages/authoring/src/gates/fixtures.ts` | Modify | Two-phase corpus-wide batching (bares, then cases), then detect |
| `packages/authoring/src/gates/oracle.ts` | Modify | One batch for all property oracles |
| `packages/authoring/test/ast-python.test.ts` | Extend | Batch parity matrix, runaway isolation, SystemExit/eval-SyntaxError lockstep, cache identity tests |
| Root `package.json` | Scripts only, Task 7 | Pinned `--concurrency=N` if the sweep justifies it |
| Per-package `vitest.config.ts` (authoring / integration-tests / client) | Only if the sweep proves it | `maxForks` caps |

NOT touched (per §3): `run-harness.ts`, `worker.ts`, `packages/schema/**`, `content/**`, `turbo.json`, `.github/**`, `verification/**`, `docs/coordination/**`. The twin/bridge are not in the browser path, so the full battery runs WITHOUT `--browser`.

---

### Task 1: Warm-server twin — failing tests first

**Files:**
- Create: `packages/sandbox/test/local-cpython-server.test.ts`

The existing `local-cpython.test.ts` is the behavioral spec and stays byte-identical. The new file pins the *server-specific* contract before the rewrite. Several of these fail against the current `spawnSync` twin only via timing assertions; the semantic ones (junk-on-fd1, crash recovery, post-timeout health) must pass both before AND after — they are regression armor, written first to be sure they fail/pass for the right reasons.

- [ ] **Step 1: Write the server contract tests**

```typescript
// packages/sandbox/test/local-cpython-server.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { createLocalSandbox } from "../src/local-cpython.js";

const sb = createLocalSandbox();
afterAll(() => sb.dispose?.());

describe("warm-server twin: performance contract", () => {
  it("amortizes interpreter startup: 20 runs well under 20x spawn cost", async () => {
    await sb.run({ code: "pass", timeoutMs: 5000, memoryMb: 256 }); // warm it
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) {
      const r = await sb.run({ code: `print(${i})`, timeoutMs: 5000, memoryMb: 256 });
      expect(r.stdout).toBe(`${i}\n`);
    }
    // 20 spawnSync round trips cost ~600ms+ (~31ms each measured); the warm server
    // must do 20 requests in < 400ms even on a loaded machine.
    expect(Date.now() - t0).toBeLessThan(400);
  });
});

describe("warm-server twin: watchdog and lifecycle", () => {
  it("timeout -> timedOut:true, and the NEXT run works (kill + respawn)", async () => {
    const t = await sb.run({ code: "while True:\n    pass", timeoutMs: 500, memoryMb: 256 });
    expect(t.timedOut).toBe(true);
    expect(t.ran).toBe(false);
    expect(t.wallMs).toBe(0); // determinism: never Date.now
    const ok = await sb.run({ code: "print('alive')", timeoutMs: 5000, memoryMb: 256 });
    expect(ok.ran).toBe(true);
    expect(ok.stdout).toBe("alive\n");
  });

  it("learner os._exit kills the server -> infra runtime error, next run works", async () => {
    const r = await sb.run({ code: "import os\nos._exit(7)", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(false);
    expect(r.timedOut).toBe(false);
    expect(r.error?.type).toBe("runtime");
    const ok = await sb.run({ code: "print('back')", timeoutMs: 5000, memoryMb: 256 });
    expect(ok.stdout).toBe("back\n");
  });

  it("C-level writes to fd 1 cannot corrupt the reply framing", async () => {
    // print() is captured by the harness; os.write(1, ...) bypasses Python-level
    // capture and would land in the protocol stream unless fd 1 is parked on devnull.
    const r = await sb.run({
      code: "import os\nos.write(1, b'JUNKJUNKJUNK')\nprint('clean')",
      timeoutMs: 5000,
      memoryMb: 256,
    });
    expect(r.ran).toBe(true);
    expect(r.stdout).toBe("clean\n"); // junk neither in stdout nor able to break framing
    const next = await sb.run({ code: "print('still ok')", timeoutMs: 5000, memoryMb: 256 });
    expect(next.stdout).toBe("still ok\n");
  });

  it("input() with no stdin gets EOFError, same as the spawnSync twin", async () => {
    // The server's real stdin is the protocol pipe; learner reads must NOT consume it.
    const r = await sb.run({ code: "input()", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(true);
    expect(r.error?.type).toBe("runtime");
    expect(r.error?.message).toContain("EOFError");
  });

  it("recycles on the memory watermark and stays correct", async () => {
    // Allocate ~80MB inside a run; with a 64MB watermark the server must self-retire
    // AFTER replying (mirroring worker-host recycle) and the next run respawns fresh.
    const small = createLocalSandbox({ recycleRssMb: 64 });
    try {
      await small.run({ code: "pass", timeoutMs: 5000, memoryMb: 256 }); // warm
      const pidBefore = small.serverPid?.();
      expect(pidBefore).toBeTypeOf("number");
      const big = await small.run({
        code: "x = bytearray(80 * 1024 * 1024)\nprint(len(x) > 0)",
        timeoutMs: 10000,
        memoryMb: 256,
      });
      expect(big.stdout).toBe("True\n"); // recycle happens AFTER the reply is served
      const after = await small.run({ code: "print('fresh')", timeoutMs: 5000, memoryMb: 256 });
      expect(after.stdout).toBe("fresh\n");
      expect(small.serverPid?.()).toBeTypeOf("number");
      expect(small.serverPid?.()).not.toBe(pidBefore); // a NEW child served it
    } finally {
      small.dispose?.();
    }
  });

  it("warm reuse keeps sys.modules (production warm-worker semantics), fresh ns per run", async () => {
    const a = await sb.run({
      code: "import sys\nmarker = 1\nimport json\nprint('json' in sys.modules)",
      timeoutMs: 5000, memoryMb: 256,
    });
    expect(a.stdout).toBe("True\n");
    // fresh ns: the previous run's top-level binding must NOT leak
    const b = await sb.run({ code: "print('marker' in dir())", timeoutMs: 5000, memoryMb: 256 });
    expect(b.stdout).toBe("False\n");
  });

  it("serializes concurrent callers (one in-flight request at a time)", async () => {
    const rs = await Promise.all(
      [..."abcde"].map((c) => sb.run({ code: `print('${c}')`, timeoutMs: 5000, memoryMb: 256 })),
    );
    expect(rs.map((r) => r.stdout)).toEqual(["a\n", "b\n", "c\n", "d\n", "e\n"]);
  });
});
```

- [ ] **Step 2: Run the new file; record which tests fail against the spawnSync twin**

Run: `cd packages/sandbox && npx vitest run test/local-cpython-server.test.ts`
Expected: FAIL — `dispose`/`serverPid`/`recycleRssMb` don't exist; the 20-runs perf test exceeds 400ms; junk/EOF/timeout tests may pass (spawnSync already isolates fds). Paste the actual matrix into the work log.

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/sandbox/test/local-cpython-server.test.ts
git -c user.name='Speedup' -c user.email='noreply@anthropic.com' commit -m "test(sandbox): warm-server twin contract (failing-first)"
```

---

### Task 2: Warm-server twin — implementation

**Files:**
- Modify: `packages/sandbox/src/local-cpython.ts` (full rewrite of internals; exported names preserved)

**Wire protocol (the design of record):**

- *Transport:* child stdin (host→server) and a **dup of child stdout** (server→host). At startup the server dups fd 1 to a private binary writer, then points fd 1 at `/dev/null` — stray C-level stdout (pygame banner, `os.write(1,...)`) can never corrupt framing. Real stdin is likewise dup'd for the protocol reader and fd 0 parked on `/dev/null`, with `sys.stdin` set to it, so learner `input()` raises `EOFError` exactly like the spawnSync twin (which passed `input: ""`). stderr stays a passthrough pipe, ring-buffered host-side for infra error messages.
- *Framing (both directions):* 4-byte big-endian u32 byte length, then exactly that many bytes of UTF-8 JSON. No base64 needed — JSON string escaping carries arbitrary learner source (the old `b64()` helper is deleted).
- *Request:* `{"id": <int>, "code": <str>, "entrypoint": <str|null>, "stdin": <str|null>}`. `timeoutMs` is NOT sent — the watchdog is host-side, mirroring how `spawnSync`'s `timeout` option was host-side.
- *Reply:* `{"id": <int>, "harness": "<the exact JSON string __trellis_run returned>", "rssMb": <float>}`. The host `JSON.parse`s `harness` into `RunResult` — byte-identical to today's parse of the printed harness output, so `wallMs: 0` determinism is untouched. `rssMb` = `ru_maxrss` normalized (bytes on darwin, KiB on linux).
- *Timeout / recycle state machine* (single in-flight request, enforced by a promise queue):

```
        spawn (lazy, on first run)
IDLE ──────────────────────────────▶ READY
READY ── write frame, arm timer ──▶ BUSY
BUSY ── reply(id match) ───────────▶ disarm; rssMb > watermark ? KILL+null (RECYCLED) : READY
BUSY ── watchdog fires ────────────▶ SIGKILL child; resolve {ran:false, stdout:"", wallMs:0, timedOut:true}; null (DEAD)
BUSY ── child exit/EOF unexpected ─▶ resolve {ran:false, ..., error:{type:"runtime", message:<last stderr line || "twin failure">}}; null (DEAD)
DEAD/RECYCLED ── next run() ───────▶ respawn fresh (back to READY)
host process stdin-EOF (parent exits) ─▶ server reads EOF and exits itself (orphan hygiene)
```

- *Fidelity argument (from rev 2):* `RUN_HARNESS` is explicitly designed for reused warm workers (fresh `ns={}` per call, blocklist armed/disarmed per run, "the NEXT run on a reused warm worker" in its contract comments). A long-lived CPython process calling `__trellis_run` per request is MORE production-faithful than process-per-run. `RUN_HARNESS` itself is **not edited** — the server loop is appended to it in the driver string, exactly as the old driver appended the `print(...)` call.

- [ ] **Step 1: Replace the module internals**

```typescript
// packages/sandbox/src/local-cpython.ts
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { RunResult, RunRequest, AstQuery } from "@trellis/schema";
import { RUN_HARNESS } from "./run-harness.js";
import { parseAndMatch as runParseAndMatch, type RunFn } from "./parse-and-match.js";

// OFFLINE VERIFICATION ONLY. A faithful WARM-SERVER twin of the deferred Pyodide worker:
// one long-lived CPython child executes the SAME RUN_HARNESS per request (fresh ns per
// call, modules persist across runs — the documented warm-worker contract), so the
// differential and the ladder can be proven without network and without paying ~30ms
// interpreter startup per run. PRODUCTION path is Pyodide (sandbox.ts).
export interface LocalSandboxConfig {
  python?: string; // default "python3"
  recycleRssMb?: number; // default 512: self-retire watermark, mirroring the warm pool's mem cap
}

export interface LocalSandbox {
  run(req: RunRequest): Promise<RunResult>;
  parseAndMatch(code: string, queries: { tag: string; query: AstQuery }[]): Promise<string[]>;
  dispose?(): void; // kill the warm child (tests / explicit teardown)
  serverPid?(): number | undefined; // observability for recycle tests
}

// Appended to RUN_HARNESS: the server loop. Mirrors the worker host's role — it drives
// __trellis_run per request; it never touches the harness's semantics.
const SERVER_LOOP = `
import os as _os, sys as _sys, json as _json, struct as _struct, resource as _resource

_proto_out = _os.fdopen(_os.dup(1), "wb", buffering=0)
_proto_in = _os.fdopen(_os.dup(0), "rb", buffering=0)
_devnull_w = _os.open(_os.devnull, _os.O_WRONLY)
_devnull_r = _os.open(_os.devnull, _os.O_RDONLY)
_os.dup2(_devnull_w, 1)   # stray C-level stdout can't corrupt framing
_os.dup2(_devnull_r, 0)   # learner C-level stdin reads see EOF
_sys.stdin = open(_os.devnull, "r")  # learner input() -> EOFError (spawnSync twin parity)

def _read_exact(n):
    buf = b""
    while len(buf) < n:
        chunk = _proto_in.read(n - len(buf))
        if not chunk:
            _sys.exit(0)  # parent gone: exit, never orphan
        buf += chunk
    return buf

while True:
    hdr = _proto_in.read(4)
    if not hdr or len(hdr) < 4:
        _sys.exit(0)
    (_n,) = _struct.unpack(">I", hdr)
    _req = _json.loads(_read_exact(_n).decode("utf-8"))
    _harness = __trellis_run(_req["code"], _req.get("entrypoint"), _req.get("stdin"))
    _ru = _resource.getrusage(_resource.RUSAGE_SELF).ru_maxrss
    _rss_mb = _ru / (1048576 if _sys.platform == "darwin" else 1024)
    _reply = _json.dumps({"id": _req["id"], "harness": _harness, "rssMb": _rss_mb}).encode("utf-8")
    _proto_out.write(_struct.pack(">I", len(_reply)) + _reply)
`;

const DRIVER = RUN_HARNESS + SERVER_LOOP;

export function createLocalSandbox(config: LocalSandboxConfig = {}): LocalSandbox {
  const python = config.python ?? "python3";
  const recycleRssMb = config.recycleRssMb ?? 512;

  let child: ChildProcessWithoutNullStreams | null = null;
  let stdoutBuf = Buffer.alloc(0);
  let stderrTail = "";
  let nextId = 1;
  let queue: Promise<unknown> = Promise.resolve(); // serializes requests
  let pending: {
    id: number;
    resolve: (r: RunResult) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  const infra = (message: string): RunResult => ({
    ran: false, stdout: "", wallMs: 0, timedOut: false,
    error: { type: "runtime", message },
  });

  function killChild(): void {
    if (child) {
      child.removeAllListeners();
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.kill("SIGKILL");
      child = null;
    }
    stdoutBuf = Buffer.alloc(0);
  }

  function onChildDown(): void {
    // Unexpected death (crash / os._exit / spawn failure) with a request in flight.
    if (pending) {
      clearTimeout(pending.timer);
      const lines = stderrTail.trim().split("\n");
      const msg = lines[lines.length - 1] || "twin failure";
      const { resolve } = pending;
      pending = null;
      killChild();
      resolve(infra(msg));
    } else {
      killChild();
    }
  }

  function onData(chunk: Buffer): void {
    stdoutBuf = Buffer.concat([stdoutBuf, chunk]);
    while (stdoutBuf.length >= 4) {
      const len = stdoutBuf.readUInt32BE(0);
      if (stdoutBuf.length < 4 + len) return;
      const body = stdoutBuf.subarray(4, 4 + len).toString("utf-8");
      stdoutBuf = stdoutBuf.subarray(4 + len);
      const reply = JSON.parse(body) as { id: number; harness: string; rssMb: number };
      if (!pending || reply.id !== pending.id) continue; // stale reply after a respawn
      clearTimeout(pending.timer);
      const { resolve } = pending;
      pending = null;
      if (reply.rssMb > recycleRssMb) killChild(); // self-retire AFTER serving (worker-host recycle)
      let result: RunResult;
      try {
        result = JSON.parse(reply.harness) as RunResult; // harness wallMs stays 0 (determinism)
      } catch {
        result = { ran: false, stdout: reply.harness, wallMs: 0, timedOut: false,
          error: { type: "runtime", message: "unparseable harness output" } };
      }
      resolve(result);
    }
  }

  function ensureChild(): ChildProcessWithoutNullStreams {
    if (child) return child;
    stderrTail = "";
    child = spawn(python, ["-c", DRIVER], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.on("data", onData);
    child.stderr.on("data", (b: Buffer) => {
      stderrTail = (stderrTail + b.toString("utf-8")).slice(-4096);
    });
    child.on("exit", onChildDown);
    child.on("error", onChildDown);
    return child;
  }

  function dispatch(req: RunRequest): Promise<RunResult> {
    return new Promise<RunResult>((resolve) => {
      const c = ensureChild();
      const id = nextId++;
      const timer = setTimeout(() => {
        // Watchdog: deterministic timedOut:true, kill + respawn lazily (spawnSync parity).
        if (pending?.id !== id) return;
        pending = null;
        killChild();
        resolve({ ran: false, stdout: "", wallMs: 0, timedOut: true });
      }, req.timeoutMs);
      pending = { id, resolve, timer };
      const body = Buffer.from(
        JSON.stringify({
          id,
          code: req.code,
          entrypoint: req.entrypoint ?? null,
          stdin: req.stdin ?? null,
        }),
        "utf-8",
      );
      const frame = Buffer.alloc(4 + body.length);
      frame.writeUInt32BE(body.length, 0);
      body.copy(frame, 4);
      c.stdin.write(frame);
    });
  }

  const run = (req: RunRequest): Promise<RunResult> => {
    const p = queue.then(() => dispatch(req));
    queue = p.then(() => undefined, () => undefined);
    return p;
  };

  const runFn: RunFn = run;
  return {
    run,
    parseAndMatch: (code, queries) => runParseAndMatch(runFn, code, queries),
    dispose: () => killChild(),
    serverPid: () => child?.pid,
  };
}
```

- [ ] **Step 2: Typecheck + run BOTH sandbox twin suites foreground**

Run: `cd packages/sandbox && npx tsc -p tsconfig.json --noEmit && npx vitest run test/local-cpython.test.ts test/local-cpython-server.test.ts`
Expected: PASS, all tests (16 existing + new). The existing file is the spec — any red there is a semantics regression: STOP, fix the twin, never the test.

- [ ] **Step 3: Run the twin-fidelity differential gates (defining gates, FOREGROUND, no pipes)**

Run, sequentially:
1. `cd packages/integration-tests && npx vitest run test/differential.test.ts`
2. `cd packages/integration-tests && npx vitest run test/m4-concat-e2e.test.ts`
3. `cd packages/integration-tests && npx vitest run test/m65-pygame-e2e.test.ts`
4. `cd packages/authoring && npx vitest run test/gate-fixtures.differential.test.ts`

Expected: ALL PASS. If the differential disagrees: hold-and-escalate (START-HERE §6), never adjust a fixture.

- [ ] **Step 4: Solo re-timing (the headline win)**

Run: `cd packages/integration-tests && npx vitest run test/m4-concat-e2e.test.ts` and `npx vitest run test/differential.test.ts`, capture walls.
Expected: m4 ~5.5s → ≤2s; differential 72.4s → materially down (est. 10–25s). Paste actuals.

- [ ] **Step 5: Commit**

```bash
git add packages/sandbox/src/local-cpython.ts packages/sandbox/test/local-cpython-server.test.ts
git -c user.name='Speedup' -c user.email='noreply@anthropic.com' commit -m "perf(sandbox): warm-server CPython twin (length-prefixed JSON protocol, watchdog respawn, RSS recycle)"
```

---

### Task 3: Batched gate bridge — `runCases` in `python.ts` (test-first)

**Files:**
- Modify: `packages/authoring/src/ast/python.ts`
- Extend: `packages/authoring/test/ast-python.test.ts`

**Batch driver design:** an embedded Python string (`BATCH_DRIVER`) executed as `python3 -c`, reading a JSON ARRAY of `CaseSpec` on stdin, writing a JSON array of `CaseResult` on stdout (same dup-fd hygiene as the twin so stray C-level prints can't pollute the result). Each case: fresh `ns={}`, per-case stdout capture, per-case `signal.setitimer(ITIMER_REAL, timeoutSec)` (default 5 — `run_case.py` parity) so ONE runaway fixture yields `errType:"timeout"` for THAT case and the batch continues. Classification is lockstep with `run_case.py`'s stderr heuristics, translated to exception types:

| run_case.py (child stderr/exit) | BATCH_DRIVER (in-process) |
|---|---|
| `SyntaxError`/`IndentationError` in stderr → `syntax` | `compile()` raises `SyntaxError` (IndentationError is a subclass) → `syntax`; a *runtime*-raised `SyntaxError` (e.g. `eval("bad(")`) also printed "SyntaxError" to stderr → catch `SyntaxError` at exec time → `syntax` |
| `TimeoutExpired` → `timeout` | SIGALRM-raised `_Timeout` → `timeout` |
| nonzero exit, other → `runtime` | any other `BaseException` → `runtime` |
| `sys.exit(0)` → exit 0 → no error (output compared) | `SystemExit` with `code in (None, 0)` → no error |
| `sys.exit(n!=0)` → `runtime` | `SystemExit` nonzero → `runtime` |

Known, accepted semantic deltas (trusted authored content, differential-gate backstopped): (a) `sys.modules` persists across cases within a batch (warm-worker semantics; per-case PRNG seeding is per-driver so seeded determinism is unchanged); (b) a C-level busy loop is not SIGALRM-interruptible — the outer `spawnSync` timeout (30s + 5s×cases backstop) fails the batch as an infra error (today a C busy loop burns the full 30s per-spawn timeout anyway).

- [ ] **Step 1: Write the failing tests**

Append to `packages/authoring/test/ast-python.test.ts`:

```typescript
import { runCases } from "../src/ast/python.js"; // new export — fails to compile first

describe("runCases (batched bridge)", () => {
  it("matches runCase semantics across the mode/error matrix in ONE invocation", () => {
    const rs = runCases([
      { code: "x = 1", mode: "bare" },
      { code: "def f(:", mode: "bare" }, // syntax
      { code: "1/0", mode: "bare" }, // runtime
      { code: "def sol(a, b):\n    return a + b", mode: "entrypoint", entry: "sol", args: [2, 3], expected: 5 },
      { code: "def sol(a, b):\n    return a - b", mode: "entrypoint", entry: "sol", args: [2, 3], expected: 5 }, // ok:false
      { code: "print('Hi ' + input() + '!')", mode: "stdin", stdin: "Alan\n", expected: "Hi Alan!\n" },
      { code: "import random as r\nrandom = __import__('random')\nrandom.seed(99)", mode: "bare" },
    ]);
    expect(rs.map((r) => [r.ran, r.errType, r.ok])).toEqual([
      [true, null, true],
      [false, "syntax", false],
      [true, "runtime", false],
      [true, null, true],
      [true, null, false],
      [true, null, true],
      [true, null, true],
    ]);
  });

  it("seeded entrypoint cases reproduce run_case exactly (PRNG isolation per case)", () => {
    const spec = {
      code: "def sol(n):\n    import random\n    return random.randint(1, n)",
      mode: "entrypoint" as const, entry: "sol", args: [100], seed: 42,
      expected: JSON.parse(JSON.stringify(82)), // pin to whatever runCase returns below
    };
    const single = runCase({ ...spec });
    // Two copies in one batch: both must agree with the subprocess result —
    // proves per-case seeding isn't polluted by a shared interpreter.
    const [a, b] = runCases([spec, spec]);
    expect(a).toEqual(single);
    expect(b).toEqual(single);
  });

  it("a deliberate runaway fails ITS case only; neighbors complete", () => {
    const rs = runCases([
      { code: "print('before')", mode: "bare" },
      { code: "while True:\n    pass", mode: "bare", timeoutSec: 1 },
      { code: "print('after')", mode: "bare" },
    ]);
    expect(rs[0]).toEqual({ ran: true, errType: null, ok: true });
    expect(rs[1]!.errType).toBe("timeout");
    expect(rs[1]!.ran).toBe(true); // run_case parity: timeout is a run, not a syntax fail
    expect(rs[2]).toEqual({ ran: true, errType: null, ok: true });
  });

  it("sys.exit(0) vs sys.exit(3) lockstep with run_case", () => {
    const batch = runCases([
      { code: "import sys\nprint('done')\nsys.exit(0)", mode: "stdin", stdin: "", expected: "done\n" },
      { code: "import sys\nsys.exit(3)", mode: "bare" },
    ]);
    const singles = [
      runCase({ code: "import sys\nprint('done')\nsys.exit(0)", mode: "stdin", stdin: "", expected: "done\n" }),
      runCase({ code: "import sys\nsys.exit(3)", mode: "bare" }),
    ];
    expect(batch).toEqual(singles);
  });

  it("runtime-raised SyntaxError classifies as syntax (run_case stderr-heuristic lockstep)", () => {
    const code = "compile('def f(:', '<x>', 'exec')";
    expect(runCases([{ code, mode: "bare" }])[0]).toEqual(runCase({ code, mode: "bare" }));
  });

  it("empty batch is a no-op (no spawn)", () => {
    expect(runCases([])).toEqual([]);
  });
});
```

Note on the `ran` value for timeouts: assert against ACTUAL `runCase` behavior (`ran = not syntax` → `true` for timeout) — the table above and `signals.ts` (`bare.errType === "timeout"`) rely on it.

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/authoring && npx vitest run test/ast-python.test.ts`
Expected: FAIL — `runCases` is not exported.

- [ ] **Step 3: Implement `BATCH_DRIVER` + `runCases` in `python.ts`**

```typescript
// appended/edited in packages/authoring/src/ast/python.ts
export interface CaseSpec {
  code: string;
  mode: "entrypoint" | "stdin" | "bare";
  entry?: string;
  args?: unknown[];
  expected?: unknown;
  seed?: number;
  stdin?: string | null;
  timeoutSec?: number; // default 5 (run_case.py parity); tests use 1 for runaways
}

// In-process batch driver: ONE spawn for N cases. Mirrors py/run_case.py's per-case
// semantics (see the classification table in the speedup plan) with fresh ns per case
// and SIGALRM per-case timeouts. Embedded here (not py/) so the bridge stays in this
// module's write set; py/run_case.py remains the single-case reference implementation.
const BATCH_DRIVER = `
import io, json, os, signal, sys

_proto_out = os.fdopen(os.dup(1), "wb", buffering=0)
os.dup2(os.open(os.devnull, os.O_WRONLY), 1)

class _Timeout(Exception):
    pass

def _on_alarm(signum, frame):
    raise _Timeout()

signal.signal(signal.SIGALRM, _on_alarm)

def _drive(spec):
    code = spec["code"]
    if spec["mode"] == "entrypoint":
        seed = spec.get("seed")
        seeding = "\\nimport random as _sd\\n_sd.seed(%r)" % (seed,) if seed is not None else ""
        args = spec.get("args") or []
        code = code + seeding + "\\nprint(repr(" + spec["entry"] + "(" + \\
            ", ".join(repr(a) for a in args) + ")))"
    return code

def _run_one(spec):
    code = _drive(spec)
    try:
        compiled = compile(code, "<case>", "exec")
    except SyntaxError:
        return {"ran": False, "errType": "syntax", "ok": False}
    stdin_text = spec.get("stdin")
    stdin_text = "" if stdin_text is None else (stdin_text if isinstance(stdin_text, str) else str(stdin_text))
    ns = {}
    out = io.StringIO()
    old_out, old_in = sys.stdout, sys.stdin
    sys.stdout, sys.stdin = out, io.StringIO(stdin_text if spec["mode"] == "stdin" else "")
    err = None
    signal.setitimer(signal.ITIMER_REAL, spec.get("timeoutSec", 5))
    try:
        exec(compiled, ns)
    except _Timeout:
        err = "timeout"
    except SyntaxError:
        err = "syntax"   # runtime-raised SyntaxError prints "SyntaxError" in run_case's stderr
    except SystemExit as e:
        if e.code not in (None, 0):
            err = "runtime"
    except BaseException:
        err = "runtime"
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        sys.stdout, sys.stdin = old_out, old_in
    ran = err != "syntax"
    if err is not None:
        ok = False
    elif spec["mode"] == "entrypoint":
        ok = out.getvalue().strip() == repr(spec.get("expected"))
    elif spec["mode"] == "stdin":
        ok = out.getvalue() == spec.get("expected")
    else:
        ok = True
    return {"ran": ran, "errType": err, "ok": ok}

specs = json.loads(sys.stdin.read())
results = json.dumps([_run_one(s) for s in specs]).encode("utf-8")
_proto_out.write(results)
`;

/** Run MANY build test cases in ONE python3 invocation (gate 5/6 batching). */
export function runCases(specs: CaseSpec[]): CaseResult[] {
  if (specs.length === 0) return [];
  const budgetMs = 30000 + specs.reduce((a, s) => a + (s.timeoutSec ?? 5), 0) * 1000;
  const r = spawnSync("python3", ["-c", BATCH_DRIVER], {
    input: JSON.stringify(specs),
    encoding: "utf8",
    maxBuffer: 1 << 24,
    timeout: budgetMs,
  });
  if (r.error) throw new Error(`python3 batch not runnable: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`python3 batch failed (${r.status}): ${r.stderr}`);
  return JSON.parse(r.stdout) as CaseResult[];
}

/** Run one build test case. Now delegates to the batch driver (one code path). */
export function runCase(spec: CaseSpec): CaseResult {
  return runCases([spec])[0]!;
}
```

Wait — careful with `_proto_out` here: `spawnSync` reads the child's fd-1 pipe, and the driver writes the result to the dup BEFORE fd 1 was redirected, so the dup IS the pipe `spawnSync` captures; stray case prints go to devnull. (Identical trick to the twin; verified by the matrix test, which includes printing cases.)

Note the seeded-PRNG test (Step 1) pins `expected` from the live `runCase` value — when writing it, run `runCase` once and inline the actual number.

- [ ] **Step 4: Run the tests**

Run: `cd packages/authoring && npx vitest run test/ast-python.test.ts`
Expected: PASS (all old `runCase`/`parsePython` tests too — `runCase` now routes through the batch driver, so the whole legacy matrix re-proves single-case parity).

- [ ] **Step 5: Run gate-5 differential + signals/gate suites foreground**

Run sequentially: `npx vitest run test/signals.test.ts`, `npx vitest run test/gate-fixtures.test.ts`, `npx vitest run test/gate-oracle.test.ts`, `npx vitest run test/gate-fixtures.differential.test.ts`, `npx vitest run test/e15-crashed-run.differential.test.ts`, `npx vitest run test/e16-goldens.test.ts`
Expected: ALL PASS — `runCase`'s observable contract is unchanged. Differential disagreement = hold-and-escalate.

- [ ] **Step 6: Commit**

```bash
git add packages/authoring/src/ast/python.ts packages/authoring/test/ast-python.test.ts
git -c user.name='Speedup' -c user.email='noreply@anthropic.com' commit -m "perf(authoring): batched in-process case driver (runCases) with per-case SIGALRM isolation"
```

---

### Task 4: Two-phase corpus batching in gates 5/6 (REQUIRES the signals.ts write-set sign-off)

**Files:**
- Modify: `packages/authoring/src/signals.ts`
- Modify: `packages/authoring/src/gates/fixtures.ts`
- Modify: `packages/authoring/src/gates/oracle.ts`
- Extend: `packages/authoring/test/signals.test.ts`

Why two phases: `buildSignals` is sequential-with-dependencies — the bare run's `timeout` short-circuits the per-case runs (E-15 lockstep). So "collect all specs → one invocation" is per PHASE: one batch of all bare specs, then one batch of all surviving case specs. Gate 5 goes from ~2 spawns × 49 build fixtures (~100+ spawns × 53ms ≈ 5–8s of pure overhead, plus per-case grandchildren) to **2 spawns total**; gate 6 from 12 to **1**.

- [ ] **Step 1: Failing test — spec/finish split is pure and batched gate equals looped gate**

Append to `packages/authoring/test/signals.test.ts` (uses the same fixtures the file already loads):

```typescript
import { planBuildSignals, finishBuildSignals } from "../src/signals.js"; // new exports

describe("planBuildSignals / finishBuildSignals (two-phase split)", () => {
  it("plan emits no exec work when the signature needs none", () => {
    const step = { kind: "build", evaluator: { ast: { queries: [] } } } as any;
    const { signals, plan } = planBuildSignals("x = 1", step, new Set(["astTags"]));
    expect(plan.needsExec).toBe(false);
    expect(signals.ran).toBe(true);
  });
  it("plan + runCases + finish === buildSignals for an exec-needing step", () => {
    const step = {
      kind: "build",
      evaluator: { run: { entrypoint: "sol" }, tests: { cases: [{ input: [2], expected: 4 }] }, ast: { queries: [] } },
    } as any;
    const code = "def sol(x):\n    return x * 2";
    const needs = new Set(["testFailure", "runError"]);
    const direct = buildSignals(code, step, needs);
    const { signals, plan } = planBuildSignals(code, step, needs);
    expect(plan.needsExec).toBe(true);
    const bare = runCases([plan.bareSpec!])[0]!;
    const caseResults = runCases(plan.caseSpecs!);
    expect(finishBuildSignals(signals, bare, caseResults)).toEqual(direct);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/signals.test.ts` → FAIL (no such exports).

- [ ] **Step 3: Implement the split in `signals.ts`**

`buildSignals` keeps its exact signature and becomes `plan → execute → finish`; the new exports expose the phases:

```typescript
export interface BuildExecPlan {
  needsExec: boolean;
  bareSpec?: CaseSpec;
  caseSpecs?: CaseSpec[];
}

/** Phase A of buildSignals: AST tags + the exec work this fixture WOULD need. Pure. */
export function planBuildSignals(
  code: string, step: RawStep, needs: Set<string>,
): { signals: Signals; plan: BuildExecPlan } {
  const ev = step["evaluator"] as Evaluator;
  const queries = ev.ast?.queries ?? [];
  const tags = evalTags(code, queries);
  const signals: Signals = { astTags: tags ?? new Set(), ran: tags !== null, runError: null, tests: null };
  if (tags === null) {
    signals.runError = { type: "syntax" };
    return { signals, plan: { needsExec: false } };
  }
  const needsExec = ["runError", "testFailure", "propertyFailed", "timedOut"].some((k) => needs.has(k));
  if (!needsExec) return { signals, plan: { needsExec: false } };
  const cases = ev.tests?.cases ?? [];
  const entry = ev.run?.entrypoint;
  const seed = ev.property?.seed;
  const caseSpecs: CaseSpec[] = cases.map((c) => {
    if (entry !== undefined) {
      const inp = c.input;
      const args = Array.isArray(inp) ? inp : [inp];
      return { code, mode: "entrypoint", entry, args, expected: c.expected, ...(seed !== undefined ? { seed } : {}) };
    }
    const inp = c.input;
    const stdin = inp == null ? null : typeof inp === "string" ? inp : String(inp);
    return { code, mode: "stdin", expected: c.expected, stdin };
  });
  return { signals, plan: { needsExec: true, bareSpec: { code, mode: "bare" }, caseSpecs } };
}

/** Phase B: assemble final signals from executed results. Pure — E-15 lockstep preserved
 * verbatim (bare timeout short-circuits; per-case timeout maps to runtime runError). */
export function finishBuildSignals(
  signals: Signals, bare: CaseResult, caseResults: CaseResult[],
): Signals {
  if (bare.errType === "timeout") {
    return { ...signals, ran: false, timedOut: true };
  }
  const failures: number[] = [];
  let runtimeErr: { type: "runtime" } | null = null;
  caseResults.forEach((r, i) => {
    if (r.errType === "runtime") runtimeErr = { type: "runtime" };
    if (r.errType === "timeout") runtimeErr = runtimeErr ?? { type: "runtime" };
    if (!r.ok) failures.push(i);
  });
  return { ...signals, ...(runtimeErr ? { runError: runtimeErr } : {}), tests: { failed: failures.length, failures } };
}

/** Unchanged public contract; now phase-structured. */
export function buildSignals(code: string, step: RawStep, needs: Set<string>): Signals {
  const { signals, plan } = planBuildSignals(code, step, needs);
  if (!plan.needsExec) return signals;
  const bare = runCases([plan.bareSpec!])[0]!;
  if (bare.errType === "timeout") return finishBuildSignals(signals, bare, []);
  return finishBuildSignals(signals, bare, runCases(plan.caseSpecs!));
}
```

(`signalsFor` is untouched — it calls `buildSignals`. Delete the now-inlined loop from the old `buildSignals`; keep every E-15 comment with the moved code.)

- [ ] **Step 4: Batch `gateFixtures` corpus-wide**

Rewrite the loop in `packages/authoring/src/gates/fixtures.ts` (signalsFor's non-build and `_error` behavior preserved; build fixtures go through the planner):

```typescript
import { planBuildSignals, type BuildExecPlan } from "../signals.js";
import { runCases, type CaseSpec, type CaseResult } from "../ast/python.js";
// ...existing imports; replicate pickStep/needs-union from signalsFor by exporting a
// helper from signals.ts: export function buildFixtureContext(fix, mis, loaded):
//   { step: RawStep | null; needs: Set<string> }  (extracted verbatim from signalsFor)

export function gateFixtures(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  interface Row {
    mid: string; label: "triggers" | "notTriggers"; want: boolean; fix: RawFixture;
    signals?: Signals & { _step?: RawStep }; plan?: BuildExecPlan; bareIdx?: number; caseIdx?: [number, number];
  }
  const rows: Row[] = [];
  for (const mid of Object.keys(loaded.miscons).sort()) {
    const m = loaded.miscons[mid]!;
    for (const [label, want] of [["triggers", true], ["notTriggers", false]] as const) {
      for (const fix of m[label] ?? []) rows.push({ mid, label, want, fix });
    }
  }
  // Phase A: plan all build fixtures; collect bare specs.
  const bareSpecs: CaseSpec[] = [];
  for (const row of rows) {
    /* non-build fixtures + _error cases: identical to signalsFor today */
    /* build fixtures: const { step, needs } = buildFixtureContext(row.fix, m, loaded);
       row.signals/plan = planBuildSignals(fix.code ?? "", step, needs); if plan.needsExec:
       row.bareIdx = bareSpecs.push(plan.bareSpec!) - 1; */
  }
  const bares = runCases(bareSpecs); // ONE invocation
  // Phase B: case specs for fixtures whose bare didn't time out.
  const caseSpecs: CaseSpec[] = [];
  for (const row of rows) {
    if (row.bareIdx === undefined || bares[row.bareIdx]!.errType === "timeout") continue;
    row.caseIdx = [caseSpecs.length, row.plan!.caseSpecs!.length];
    caseSpecs.push(...row.plan!.caseSpecs!);
  }
  const caseResults = runCases(caseSpecs); // ONE invocation
  // Phase C: finish + judge (detectWinner / sigMatch exactly as today).
  for (const row of rows) {
    /* finishBuildSignals(row.signals, bares[row.bareIdx], slice of caseResults) ;
       then the existing want/got issue logic verbatim */
  }
  return issues;
}
```

(The executor writes the full pass-through code — the three `/* */` blocks are existing logic moved, not new logic. `signalsFor` stays for other callers and tests.)

And `gates/oracle.ts` — collect-then-batch:

```typescript
const pending: { st: RawStep; spec: CaseSpec }[] = [];
// ...inside the existing loops, replace the runCase call with:
pending.push({ st, spec: { code: prop.referenceImpl, mode: "entrypoint", entry: "sol", args, expected: null } });
// ...after the loops:
const results = runCases(pending.map((p) => p.spec));
results.forEach((r, i) => {
  if (r.errType !== null) {
    issues.push({ gate: G, level: "error", message: `${pending[i]!.st.id}: oracle ${r.errType} error on sampled generators` });
  }
});
```

- [ ] **Step 5: Run the full authoring suite + differential foreground**

Run: `cd packages/authoring && npx vitest run` then `npx vitest run test/gate-fixtures.differential.test.ts` (the differential re-run is the corpus-level proof the batch didn't shift ANY verdict).
Expected: ALL PASS, and `gate-fixtures.test.ts` solo drops from 26.7s to single digits.

- [ ] **Step 6: Commit**

```bash
git add packages/authoring/src/signals.ts packages/authoring/src/gates/fixtures.ts packages/authoring/src/gates/oracle.ts packages/authoring/test/signals.test.ts
git -c user.name='Speedup' -c user.email='noreply@anthropic.com' commit -m "perf(authoring): two-phase corpus batching for exec gates 5/6 (2+1 spawns total)"
```

---

### Task 5: Fixture-level gate-result disk cache (pure memo)

**Files:**
- Modify: `packages/authoring/src/ast/python.ts` (cache inside `runCases`)
- Extend: `packages/authoring/test/ast-python.test.ts`

**Key derivation:** `sha256(canonicalJson({ v: 1, py: <python3 -V output>, driver: sha256(BATCH_DRIVER), spec }))` per case. `canonicalJson` = JSON.stringify with sorted keys (tiny local helper — spec objects are flat). The python version is captured once per process (`spawnSync("python3", ["-V"])`). Any driver edit or interpreter change reissues every key — invalidation is structural, never manual. **Location:** `node_modules/.cache/trellis-gate-exec/<key>.json` (one `CaseResult` per file) — already git-ignored via `node_modules/`, so NO `.gitignore` change is needed. **Kill switch:** `TRELLIS_GATE_CACHE=0` bypasses read AND write. **Honesty caveat (documented in code):** a result is only pure if the case is deterministic; seeded/property fixtures are, and an unseeded-entropy fixture was never deterministic to begin with — the cache freezes one observation, and the cold-run identity gate plus the differential (which runs harness.py UNCACHED) bound the risk. If item 4 destabilizes 1–3 in any way: STOP after Task 4 and report (START-HERE §1.4 — splitting it out is the orchestrator's call).

- [ ] **Step 1: Failing tests**

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("runCases disk cache", () => {
  const specs = [
    { code: "def sol(a):\n    return a * 3", mode: "entrypoint" as const, entry: "sol", args: [7], expected: 21 },
    { code: "1/0", mode: "bare" as const },
  ];
  it("cold run == warm run == re-cold run (pure memo)", () => {
    const dir = mkdtempSync(join(tmpdir(), "trellis-cache-"));
    const cold = runCases(specs, { cacheDir: dir });
    const warm = runCases(specs, { cacheDir: dir });
    rmSync(dir, { recursive: true, force: true });
    const recold = runCases(specs, { cacheDir: mkdtempSync(join(tmpdir(), "trellis-cache-")) });
    expect(warm).toEqual(cold);
    expect(recold).toEqual(cold);
  });
  it("warm hits skip python entirely (mixed batch only spawns for misses)", () => {
    const dir = mkdtempSync(join(tmpdir(), "trellis-cache-"));
    runCases(specs, { cacheDir: dir });
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) runCases(specs, { cacheDir: dir });
    expect(Date.now() - t0).toBeLessThan(100); // 10 fully-cached batches: no spawns
  });
  it("TRELLIS_GATE_CACHE=0 bypasses", () => {
    const dir = mkdtempSync(join(tmpdir(), "trellis-cache-"));
    process.env.TRELLIS_GATE_CACHE = "0";
    try {
      runCases(specs, { cacheDir: dir });
      // bypass leaves the cache dir empty
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      delete process.env.TRELLIS_GATE_CACHE;
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `runCases` takes no options arg yet → compile FAIL.

- [ ] **Step 3: Implement**

```typescript
// python.ts additions
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync as fexists } from "node:fs";

let pyVersion: string | null = null;
function pythonVersion(): string {
  if (pyVersion === null) {
    const r = spawnSync("python3", ["-V"], { encoding: "utf8" });
    pyVersion = (r.stdout + r.stderr).trim();
  }
  return pyVersion;
}
const DRIVER_HASH = createHash("sha256").update(BATCH_DRIVER).digest("hex");
function canonicalJson(o: unknown): string {
  return JSON.stringify(o, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}
function cacheKey(spec: CaseSpec): string {
  return createHash("sha256")
    .update(canonicalJson({ v: 1, py: pythonVersion(), driver: DRIVER_HASH, spec }))
    .digest("hex");
}
const DEFAULT_CACHE_DIR = join(PY_DIR, "../../..", "node_modules/.cache/trellis-gate-exec");

export function runCases(specs: CaseSpec[], opts: { cacheDir?: string } = {}): CaseResult[] {
  if (specs.length === 0) return [];
  const enabled = process.env.TRELLIS_GATE_CACHE !== "0";
  const dir = opts.cacheDir ?? DEFAULT_CACHE_DIR;
  const out: (CaseResult | undefined)[] = new Array(specs.length);
  const missIdx: number[] = [];
  if (enabled) {
    for (let i = 0; i < specs.length; i++) {
      const f = join(dir, cacheKey(specs[i]!) + ".json");
      if (fexists(f)) out[i] = JSON.parse(readFileSync(f, "utf8")) as CaseResult;
      else missIdx.push(i);
    }
  } else {
    for (let i = 0; i < specs.length; i++) missIdx.push(i);
  }
  if (missIdx.length > 0) {
    const fresh = execBatch(missIdx.map((i) => specs[i]!)); // the Task-3 spawnSync body, renamed
    if (enabled) mkdirSync(dir, { recursive: true });
    missIdx.forEach((i, j) => {
      out[i] = fresh[j]!;
      if (enabled) writeFileSync(join(dir, cacheKey(specs[i]!) + ".json"), JSON.stringify(fresh[j]!));
    });
  }
  return out as CaseResult[];
}
```

(`DEFAULT_CACHE_DIR` resolves from `PY_DIR` → repo root; verify the relative depth against `findPyDir`'s resolution in both src and dist layouts — add a `console.assert(fexists(join(DEFAULT_CACHE_DIR, "../..")))`-free unit test instead: assert the dir path ends with `node_modules/.cache/trellis-gate-exec` and its repo root contains `pnpm-workspace.yaml`.)

- [ ] **Step 4: Tests + full authoring suite + BOTH differentials foreground**

Run: `cd packages/authoring && npx vitest run` then `npx vitest run test/gate-fixtures.differential.test.ts`; then `cd ../integration-tests && npx vitest run test/differential.test.ts`.
Expected: ALL PASS. The gate-5 differential after a cached run is the live cold-vs-warm identity proof (harness.py never caches).

- [ ] **Step 5: Commit**

```bash
git add packages/authoring/src/ast/python.ts packages/authoring/test/ast-python.test.ts
git -c user.name='Speedup' -c user.email='noreply@anthropic.com' commit -m "perf(authoring): content-hash disk cache for batched case results (pure memo, TRELLIS_GATE_CACHE=0 kill switch)"
```

---

### Task 6: `parsePython` in-process memo (small, zero-risk companion)

**Files:**
- Modify: `packages/authoring/src/ast/python.ts`
- Extend: `packages/authoring/test/ast-python.test.ts`

`evalTags` calls `parsePython` per fixture per gate pass; `cli.test.ts` runs the gates ~3×, re-parsing identical code (~25ms each). A `Map<string, Parsed>` keyed on the source string is a pure memo (CPython `ast.parse` is deterministic for a fixed interpreter; the process dies with the interpreter pinned). NOTE: `ast_dump.py` batching would be the bigger lever but `py/**` and `matcher.ts` are outside the write set — flagged as a follow-on for the orchestrator, NOT done here.

- [ ] **Step 1: Write the failing test**

```typescript
describe("parsePython memo", () => {
  it("repeat parse of identical source is a cache hit (fast and equal)", () => {
    const src = "def f(x):\n    return x + 1";
    const first = parsePython(src);
    const t0 = Date.now();
    for (let i = 0; i < 50; i++) expect(parsePython(src)).toEqual(first);
    expect(Date.now() - t0).toBeLessThan(50); // 50 spawns would cost >1s
  });
  it("distinct sources still parse distinctly", () => {
    expect(parsePython("x = 1").syntaxError).toBe(false);
    expect(parsePython("x = (").syntaxError).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/ast-python.test.ts`: the 50-hit loop exceeds 50ms (spawn per call). FAIL.
- [ ] **Step 3: Implement**

```typescript
// python.ts: callers (matcher.ts) walk the AST read-only — never mutate; the memo
// returns the SAME object by contract. ast.parse is deterministic per interpreter.
const parseMemo = new Map<string, Parsed>();
export function parsePython(code: string): Parsed {
  const hit = parseMemo.get(code);
  if (hit) return hit;
  const out = JSON.parse(python(join(PY_DIR, "ast_dump.py"), code)) as JsonNode & { _syntaxError?: boolean };
  const parsed: Parsed = out._syntaxError ? { syntaxError: true } : { syntaxError: false, ast: out };
  parseMemo.set(code, parsed);
  return parsed;
}
```

- [ ] **Step 4: Run `npx vitest run test/ast-python.test.ts test/matcher.test.ts test/matcher-field.test.ts`** — PASS.
- [ ] **Step 5: Commit** — `git add packages/authoring/src/ast/python.ts packages/authoring/test/ast-python.test.ts && git -c user.name='Speedup' -c user.email='noreply@anthropic.com' commit -m "perf(authoring): memoize parsePython per process"`.

---

### Task 7: Concurrency sweep + pin (LAST — after the landscape changed)

**Files:**
- Modify: root `package.json` (scripts only)
- Modify (only if measured necessary): `packages/{authoring,integration-tests,client}/vitest.config.ts`

Method (designed for the ±35% noise measured in the re-baseline):

- [ ] **Step 1: Hygiene preamble** — before EVERY timed run: `ps -ax -o pid,pcpu,command | grep -E "[p]ython3 -c"` and kill any straggler; close nothing else (measure the machine as it actually is, but record the load).
- [ ] **Step 2: Sweep** — for each `C` in {1, 2, 3, 4, default}: run `pnpm test -- --force --concurrency=C` **3 times**, FOREGROUND, sequentially, output to `/tmp/sweep-cC-runN.log`; record turbo-reported `Time:`; take the median. (~45–60 min total; this is the price of an honest pin.) Note: `TRELLIS_GATE_CACHE` stays ON (that's the suite users run); record one default run with `TRELLIS_GATE_CACHE=0` for the cold-cache datum.
- [ ] **Step 3: Decision rule** — pin `--concurrency=N` in the root `test` script ONLY if median(N) beats median(default) by more than the max-minus-min spread of the default runs. Otherwise leave the script alone and record "default wins / inconclusive at this HEAD" in the report. Same rule for any per-package `maxForks` variant (try `maxForks: 4` on the heavy three only if the cross-package cap was inconclusive).
- [ ] **Step 4: If pinning:** `"test": "turbo run test --concurrency=N"` — one-line diff, called out for line-by-line orchestrator review. **Do NOT touch `.github/**`** — CI runners have different core counts; the report RECOMMENDS re-running this sweep on a CI runner and (orchestrator-applied) restoring an actions cache for `node_modules/.cache/trellis-gate-exec` keyed on `(driver hash, python -V)`.
- [ ] **Step 5: Commit** (if changed) — `perf(test): pin turbo --concurrency=N (median of 3×5 sweep, see plan)`.

---

### Task 8: Full battery + final before/after table

- [ ] **Step 1: Rebase onto current `main`** — `git fetch && git rebase origin/main` (resolve nothing silently; conflicts in non-write-set files = STOP).
- [ ] **Step 2: Full battery, FOREGROUND, from repo root:** `./verification/run-all-gates.sh` (NO `--browser` — the twin and gate bridge are not in the browser path; the worker/client code was not touched). Expected: exit 0, `=== ALL GATES GREEN ===`, 649 baseline tests + the new ones.
- [ ] **Step 3: Re-time the headline rows** (same methodology as the re-baseline: forced suite, m4 solo, differential solo, gate-fixtures solo, cli solo, gate-5-differential solo — each captured to a file) and paste the before/after table into the final report.
- [ ] **Step 4: Timeout-semantics spot checks** — re-run the three semantics suites one last time at the final SHA: `local-cpython-server.test.ts` (watchdog), `ast-python.test.ts` (runaway isolation + cache identity), both differentials.
- [ ] **Step 5: Final commit + report** to the orchestrator with: per-task SHAs, the table, the pin decision + CI recommendation, and explicit confirmation nothing outside the write set changed (`git diff origin/main --stat`).

---

## Test list (failing-first, consolidated)

| # | Test | Proves | Task |
|---|---|---|---|
| 1 | 20 warm runs < 400ms | spawn overhead actually gone | 1 |
| 2 | timeout → `timedOut:true` → next run healthy | watchdog kill/respawn determinism | 1 |
| 3 | `os._exit` → infra runtime error → next run healthy | crash recovery | 1 |
| 4 | `os.write(1, junk)` can't corrupt framing | fd-dup protocol hygiene | 1 |
| 5 | `input()` → EOFError | stdin parity with spawnSync twin | 1 |
| 6 | RSS watermark → new pid serves next run | recycle mirrors warm pool | 1 |
| 7 | modules persist / ns fresh across runs | warm-worker contract | 1 |
| 8 | 5 concurrent callers serialized in order | single in-flight invariant | 1 |
| 9 | batch matrix == runCase matrix | single/batch parity | 3 |
| 10 | seeded PRNG case ×2 in one batch == subprocess result | per-case seeding isolation | 3 |
| 11 | deliberate runaway fails its case only | SIGALRM per-case isolation | 3 |
| 12 | `sys.exit(0/3)`, runtime `SyntaxError` lockstep | classification-table parity | 3 |
| 13 | plan+exec+finish == buildSignals | two-phase split is pure | 4 |
| 14 | cold == warm == re-cold cache runs | pure memo | 5 |
| 15 | warm batch does no spawns; `TRELLIS_GATE_CACHE=0` bypasses | cache mechanics | 5 |
| 16 | parsePython memo returns equal results | parse memo | 6 |
| — | `differential.test.ts` + `gate-fixtures.differential.test.ts` after EVERY twin/bridge task | the self-proving acceptance | all |

## Risks

1. **Differential divergence** (any cause) → hold-and-escalate, never adjust fixtures (START-HERE §6).
2. **In-process batch semantic deltas** — shared `sys.modules`, module-attr leaks between cases. Trusted authored content + differential backstop; the classification table pins the known edges (SystemExit, runtime SyntaxError) with tests.
3. **C-level busy loop immune to SIGALRM** — batch fails on the outer budget as an infra error. Documented; no worse than today's 30s per-spawn burn, and gate authors see which batch died.
4. **Cache freezing a nondeterministic fixture's result** — bounded by the uncached harness.py differential; kill switch for diagnosis. If destabilizing: STOP after Task 4 per §1.4.
5. **Sweep inconclusive in noise** — decision rule defaults to "no pin"; that is a valid, reportable outcome (and at this HEAD the rev-2 c2 win has already reversed).
6. **Timeout starts at request-write, not process-spawn** — the warm twin is slightly MORE generous than `spawnSync`'s timer (no ~30ms startup inside the window). `wallMs` stays 0 either way; no fixture encodes spawn latency. Noted for the record.
7. **vitest fork teardown** — the warm child exits on stdin EOF when its parent dies (server loop), so no orphan accumulation across test forks; `dispose()` exists for explicit teardown. (Contrast: today's `run_case.py` DOES orphan grandchildren — observed in the re-baseline; Tasks 3–4 remove those grandchildren entirely.)

## Explicitly out of scope (escalate, don't improvise)

- Any edit to `run-harness.ts`, `worker.ts`, `content/verify/harness.py`, `RunResult` shape, `turbo.json`, `.github/**`, `verification/**`.
- `ast_dump.py` batching / `matcher.ts` (outside write set — flagged as follow-on).
- CI concurrency + CI cache restore (recommendation only; orchestrator applies).
- The browser path (`--browser` battery) — untouched by design; not run, and the report says so.
