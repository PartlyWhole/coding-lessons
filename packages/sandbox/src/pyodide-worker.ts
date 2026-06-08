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

// The Python harness, loaded once at init. Per run it builds a fresh namespace, captures
// stdout, classifies syntax (compile) vs runtime (exec) errors with a line number, and
// returns a JSON-serializable dict so the result survives structured clone.
//   ran=false  → syntax error or never executed
//   ran=true   → executed (possibly raising a runtime error, reported in `error`)
const HARNESS = `
import io, sys, json

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
    called = False
    try:
        exec(compiled, ns)
        if entrypoint and entrypoint in ns and callable(ns[entrypoint]):
            return_value = ns[entrypoint]()
            called = True
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
    result = {"ran": True, "stdout": out.getvalue(), "wallMs": 0, "timedOut": False}
    if called:
        # Only surface returnValue when an entrypoint actually ran, so a top-level
        # program (no entrypoint) omits the key rather than reporting null.
        result["returnValue"] = return_value
    return json.dumps(result, default=str)
`;

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
  await py.runPythonAsync(HARNESS);
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
    // NOTE: pass `undefined`, NOT `null` — in pinned Pyodide (0.27+) JS `null` maps to
    // the `pyodide.ffi.jsnull` sentinel, while JS `undefined` maps to Python `None`,
    // which is what the harness's `is not None` / truthiness checks expect.
    pyodide.globals.set("_code", req.code);
    pyodide.globals.set("_entry", req.entrypoint ?? undefined);
    pyodide.globals.set("_stdin", req.stdin ?? undefined);
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
