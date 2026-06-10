/**
 * Real Web Worker entry for the Pyodide grader.
 *
 * ⚠️ NETWORK-DEPENDENT: this module loads the pinned Pyodide build from a CDN, so it is
 * typechecked offline and behavior-verified in a real headless browser (see
 * verification/debt1.js — checks 5 and 11 cover the two hardening behaviors below).
 * The host/watchdog/warm-pool layers (worker-host.ts, warm-pool.ts, sandbox.ts) ARE
 * fully verified against a mock worker; this file is the piece that runs real Python.
 *
 * Isolation (§6.1): each run execs learner code into a FRESH local dict inside the
 * Python harness, so a reused warm worker cannot leak globals between runs. The
 * boundary is structured-clone only — we ship a JSON string out of Python and
 * JSON.parse it here. The js FFI (`js`, `pyodide_js`, registerJsModule targets, and the
 * `pyodide` package whose code.run_js is a JS escape) is made unimportable from learner
 * code by the RUN_HARNESS import blocker (see run-harness.ts) — a learner `import js`
 * raises a clean ImportError, and the bridge modules are restored for the host
 * machinery after every run.
 *
 * Memory cap (§6.1 memoryMb): Pyodide 0.27.2's loadPyodide does not accept a
 * pre-allocated WebAssembly.Memory, so a true hard pre-cap is impossible without a
 * custom emscripten build. We enforce the strongest honest cap available:
 *   1. PREEMPTIVE grow-guard — emscripten's resize path calls `wasmMemory.grow(pages)`
 *      as a METHOD call, and 0.27.2 does not expose wasmMemory on `pyodide._module`
 *      (probed in a real browser: `_module.wasmMemory` is undefined; `growMemory` is a
 *      closure-captured internal that cannot be swapped via Module). So we patch
 *      `WebAssembly.Memory.prototype.grow` INSIDE this worker scope (the worker exists
 *      solely to run Pyodide — the only Memory here is the Python heap) and refuse
 *      growth past the current run's memoryMb. The refusal makes emscripten's resize
 *      fail → malloc fails → Python raises MemoryError inside the run (visible,
 *      in-run failure — the oversized allocation never succeeds).
 *   2. POST-RUN WATERMARK — after every run we check HEAPU8.length against the cap
 *      (covers the case where the guard could not be installed).
 *   If either trips, the result is forced to a structured runtime error ("memory limit
 *   exceeded …") and the worker asks the host to RECYCLE it (wire flag; the wasm heap
 *   never shrinks, so a capped worker must be replaced, not reused). The warm pool
 *   spawns a fresh replacement — self-healing, like the watchdog path.
 *   Honest limits: the cap binds heap GROWTH; a per-run cap below the already-grown
 *   heap cannot retroactively shrink it (pool admission keeps pooled runs ≤ the init
 *   cap, and a capped worker is recycled rather than reused).
 *
 * Intended to be the entry of a module Worker (`new Worker(url, { type: "module" })`).
 * It is framework-free so a bundler can emit it as a standalone worker chunk; the
 * wiring of the bundled URL is the app's concern (see browser-worker.ts).
 */
import type { HostToWorker, RunResultData, WireRunRequest, WorkerToHost } from "./protocol.js";
import { RUN_HARNESS } from "./run-harness.js";

// Minimal shape of the Pyodide object we use (avoids a dependency on @types/pyodide,
// which isn't installable offline). Verified against the Pyodide docs API.
// `_module` is the emscripten Module — internal but stable across 0.27.x; we feature-
// detect HEAPU8 before use (watermark check) and the guard never depends on it.
interface PyodideLike {
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void };
  loadPackage(name: string): Promise<void>;
  _module?: {
    HEAPU8?: { length: number };
  };
}

// Minimal dedicated-worker global shape. We reach it via globalThis rather than
// redeclaring `self` (which would clash with the DOM lib's `self`), and we don't pull
// in the "WebWorker" lib just for this single deferred module.
interface DedicatedWorkerScope {
  onmessage: ((ev: { data: HostToWorker }) => void) | null;
  postMessage(msg: WorkerToHost): void;
}
const ctx = globalThis as unknown as DedicatedWorkerScope;

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

const MB = 1024 * 1024;
const WASM_PAGE_BYTES = 65536;

let pyodide: PyodideLike | null = null;
// M6.5: packages already loaded into THIS worker (warm-pool reuse never re-downloads).
const loadedPackages = new Set<string>();
let runCapBytes = 0; // effective cap for the CURRENT run; 0 = no run in flight
let capHit = false; // set by the grow-guard when it refuses growth
let growGuardInstalled = false;

function heapBytes(): number {
  return pyodide?._module?.HEAPU8?.length ?? 0;
}

// Patch WebAssembly.Memory.prototype.grow inside THIS worker scope with a cap check.
// Emscripten's resize path invokes `wasmMemory.grow(pages)` as a method call, so the
// prototype patch intercepts every heap growth attempt; the cap is only armed while a
// run is in flight (runCapBytes > 0), so Pyodide bootstrap/package loading between
// runs is unaffected. The worker's only WebAssembly.Memory is the Python heap.
function installGrowGuard(): boolean {
  const proto = (globalThis as { WebAssembly?: { Memory?: { prototype?: { grow?: unknown } } } })
    .WebAssembly?.Memory?.prototype;
  if (!proto || typeof proto.grow !== "function") return false;
  const realGrow = proto.grow as (this: WebAssembly.Memory, delta: number) => number;
  (proto as { grow: unknown }).grow = function (this: WebAssembly.Memory, delta: number): number {
    const nextBytes = this.buffer.byteLength + delta * WASM_PAGE_BYTES;
    if (runCapBytes > 0 && nextBytes > runCapBytes) {
      capHit = true;
      // Refusing growth → emscripten's resize fails → Python raises MemoryError.
      throw new RangeError(
        `Trellis memory cap: refusing wasm heap growth to ${Math.ceil(nextBytes / MB)} MB ` +
          `(cap ${Math.ceil(runCapBytes / MB)} MB)`,
      );
    }
    return realGrow.call(this, delta);
  };
  return true;
}

async function init(memoryMb: number, pyodideUrl: string): Promise<void> {
  // Dynamic import of the pinned CDN ESM build. The specifier is non-literal so the
  // bundler/TS won't try to resolve it at build time (network-only; deferred).
  const mod = (await import(/* @vite-ignore */ `${pyodideUrl}pyodide.mjs`)) as {
    loadPyodide: (opts: { indexURL: string }) => Promise<PyodideLike>;
  };
  const py = await mod.loadPyodide({ indexURL: pyodideUrl });
  await py.runPythonAsync(RUN_HARNESS);
  growGuardInstalled = installGrowGuard();
  if (!growGuardInstalled) {
    // Surfaces in the page console (captured by the verification runner): enforcement
    // degrades to the post-run watermark + recycle, never to a silent no-op.
    console.warn(
      "Trellis sandbox: wasmMemory grow-guard unavailable; memoryMb enforced by post-run watermark only",
    );
  }
  // `memoryMb` (init) is the pool-level cap; enforcement is per run (req.memoryMb,
  // which pool admission keeps ≤ the init cap — larger requests go to a dedicated
  // worker initialized at their own cap).
  void memoryMb;
  pyodide = py;
}

function capFailure(wallMs: number, reqMb: number, used: number, preemptive: boolean): RunResultData {
  return {
    ran: false,
    stdout: "",
    wallMs,
    timedOut: false,
    error: {
      type: "runtime",
      message:
        `memory limit exceeded: the run needed more than memoryMb=${reqMb} ` +
        `(wasm heap ${Math.ceil(used / MB)} MB, ` +
        `${preemptive ? "heap growth refused by the cap guard" : "post-run watermark over cap"}); ` +
        `the worker will be recycled`,
    },
  };
}

async function runOne(id: number, req: WireRunRequest): Promise<void> {
  if (!pyodide) {
    ctx.postMessage({
      kind: "result",
      id,
      result: {
        ran: false,
        stdout: "",
        wallMs: 0,
        timedOut: false,
        error: { type: "runtime", message: "pyodide not initialized" },
      },
    });
    return;
  }
  const t0 = now();
  // M6.5 §17.5 — lazy per-run package loads (e.g. pygame-ce on graphical grading
  // runs; absent on every non-graphical run). BEFORE the cap is armed: the wheel
  // load is host machinery, not learner allocation. Cached per worker, so warm-pool
  // reuse never re-downloads; a load failure is a structured runtime error.
  for (const name of req.packages ?? []) {
    if (loadedPackages.has(name)) continue;
    try {
      await pyodide.loadPackage(name);
      loadedPackages.add(name);
    } catch (e: unknown) {
      ctx.postMessage({
        kind: "result",
        id,
        result: {
          ran: false,
          stdout: "",
          wallMs: now() - t0,
          timedOut: false,
          error: {
            type: "runtime",
            message: `failed to load package ${name}: ${e instanceof Error ? e.message : String(e)}`,
          },
        },
      });
      return;
    }
  }
  capHit = false;
  // Effective cap for this run. The cap binds heap GROWTH: the wasm heap cannot
  // shrink, so a req cap below the already-grown baseline cannot be enforced
  // retroactively — we clamp to the current heap (meaning: this run may not grow the
  // heap AT ALL) and enforcement stays honest about what it can bind.
  const startHeap = heapBytes();
  runCapBytes = Math.max(req.memoryMb * MB, startHeap);
  let result: RunResultData;
  try {
    // NOTE: when absent these are `undefined`, NOT `null`. In pinned Pyodide (0.27+) JS
    // `null` maps to the `pyodide.ffi.jsnull` sentinel, while JS `undefined` maps to
    // Python `None` — which is what the harness's `is not None` / truthiness checks
    // expect. `req.entrypoint`/`req.stdin` are already `string | undefined`, so pass them
    // through directly; do not coerce to null.
    pyodide.globals.set("_code", req.code);
    pyodide.globals.set("_entry", req.entrypoint);
    pyodide.globals.set("_stdin", req.stdin);
    const json = (await pyodide.runPythonAsync("__trellis_run(_code, _entry, _stdin)")) as string;
    result = { ...(JSON.parse(json) as RunResultData), wallMs: now() - t0 };
  } catch (e: unknown) {
    result = {
      ran: false,
      stdout: "",
      wallMs: now() - t0,
      timedOut: false,
      error: { type: "runtime", message: e instanceof Error ? e.message : String(e) },
    };
  }
  const used = heapBytes();
  const overCap = used > runCapBytes;
  runCapBytes = 0;
  if (capHit || overCap) {
    // Cap enforcement: fail the run visibly (frozen shape: error.type "runtime") and
    // retire this worker — the wasm heap cannot shrink, so reuse would be dishonest.
    ctx.postMessage({
      kind: "result",
      id,
      result: capFailure(result.wallMs, req.memoryMb, used, capHit),
      recycle: true,
    });
    return;
  }
  ctx.postMessage({ kind: "result", id, result });
}

ctx.onmessage = (ev: { data: HostToWorker }): void => {
  const msg = ev.data;
  if (msg.kind === "init") {
    init(msg.memoryMb, msg.pyodideUrl)
      .then(() => ctx.postMessage({ kind: "ready" }))
      .catch((e: unknown) =>
        ctx.postMessage({
          kind: "init-error",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    return;
  }
  // msg.kind === "run"
  void runOne(msg.id, msg.req);
};
