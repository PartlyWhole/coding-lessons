/**
 * Real Web Worker entry for the Pyodide grader.
 *
 * ⚠️ DEFERRED VERIFICATION: this module requires network access (it loads the pinned
 * Pyodide build from a CDN). It cannot be behavior-tested in the offline build/CI
 * environment — it is written against the verified Pyodide API and typechecked only.
 * The host/watchdog/warm-pool layers (worker-host.ts, warm-pool.ts, sandbox.ts) ARE
 * fully verified against a mock worker; this file is the piece that runs real Python.
 *
 * Isolation (§6.1): each run execs learner code into a FRESH local dict inside the
 * Python harness, so a reused warm worker cannot leak globals between runs. The worker
 * never imports the `js` FFI, has no DOM/network reach, and the boundary is
 * structured-clone only — we ship a JSON string out of Python and JSON.parse it here.
 *
 * Intended to be the entry of a module Worker (`new Worker(url, { type: "module" })`).
 * It is framework-free so a bundler can emit it as a standalone worker chunk; the
 * wiring of the bundled URL is the app's concern (see browser-worker.ts).
 */
import type { HostToWorker, RunResultData, WireRunRequest, WorkerToHost } from "./protocol.js";
import { RUN_HARNESS } from "./run-harness.js";

// Minimal shape of the Pyodide object we use (avoids a dependency on @types/pyodide,
// which isn't installable offline). Verified against the Pyodide docs API.
interface PyodideLike {
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void };
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

let pyodide: PyodideLike | null = null;

async function init(memoryMb: number, pyodideUrl: string): Promise<void> {
  // Dynamic import of the pinned CDN ESM build. The specifier is non-literal so the
  // bundler/TS won't try to resolve it at build time (network-only; deferred).
  const mod = (await import(/* @vite-ignore */ `${pyodideUrl}pyodide.mjs`)) as {
    loadPyodide: (opts: { indexURL: string }) => Promise<PyodideLike>;
  };
  const py = await mod.loadPyodide({ indexURL: pyodideUrl });
  await py.runPythonAsync(RUN_HARNESS);
  pyodide = py;
  // `memoryMb` is accepted for forward-compat. A hard per-instance WASM cap needs a
  // custom WebAssembly.Memory at module instantiation (emscripten-build dependent);
  // for now OOM surfaces as a MemoryError (runtime) from the harness. To be tuned under
  // real-Pyodide verification.
  void memoryMb;
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
    const result = { ...(JSON.parse(json) as RunResultData), wallMs: now() - t0 };
    ctx.postMessage({ kind: "result", id, result });
  } catch (e: unknown) {
    ctx.postMessage({
      kind: "result",
      id,
      result: {
        ran: false,
        stdout: "",
        wallMs: now() - t0,
        timedOut: false,
        error: { type: "runtime", message: e instanceof Error ? e.message : String(e) },
      },
    });
  }
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
