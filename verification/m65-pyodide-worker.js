// packages/sandbox/src/run-harness.ts
var RUN_HARNESS = `
import io, sys, json

_TRELLIS_BLOCK_ROOTS = ("js", "pyodide_js", "pyodide", "_pyodide")
_TRELLIS_BLOCK_MSG = "module '{}' is not available in the Trellis sandbox"

class _TrellisBlockFinder:
    armed = False
    blocked = frozenset(_TRELLIS_BLOCK_ROOTS)
    def find_spec(self, fullname, path=None, target=None):
        if _TrellisBlockFinder.armed and fullname.split(".", 1)[0] in _TrellisBlockFinder.blocked:
            raise ImportError(_TRELLIS_BLOCK_MSG.format(fullname))
        return None

if not any(type(f).__name__ == "_TrellisBlockFinder" for f in sys.meta_path):
    sys.meta_path.insert(0, _TrellisBlockFinder())

def _trellis_block_names():
    names = set(_TRELLIS_BLOCK_ROOTS)
    for name, mod in list(sys.modules.items()):
        t = type(mod)
        if "JsProxy" in t.__name__ or t.__module__.split(".", 1)[0] in ("pyodide", "_pyodide"):
            names.add(name.split(".", 1)[0])
    for f in list(sys.meta_path):
        reg = getattr(f, "jsproxies", None)
        if isinstance(reg, dict):
            for k in reg:
                names.add(k.split(".", 1)[0])
    return names

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
    blocked = _trellis_block_names()
    saved_mods = {}
    for name in list(sys.modules):
        if name.split(".", 1)[0] in blocked:
            saved_mods[name] = sys.modules.pop(name)
    saved_finders = [(i, f) for i, f in enumerate(sys.meta_path)
                     if isinstance(getattr(f, "jsproxies", None), dict)]
    for _, f in saved_finders:
        sys.meta_path.remove(f)
    _TrellisBlockFinder.blocked = frozenset(blocked)
    _TrellisBlockFinder.armed = True
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
        _TrellisBlockFinder.armed = False
        for i, f in saved_finders:
            if f not in sys.meta_path:
                sys.meta_path.insert(min(i, len(sys.meta_path)), f)
        sys.modules.update(saved_mods)
        sys.stdout = old_out
        sys.stdin = old_in
    result = {"ran": True, "stdout": out.getvalue(), "wallMs": 0, "timedOut": False}
    if called:
        # Only surface returnValue when an entrypoint actually ran, so a top-level
        # program (no entrypoint) omits the key rather than reporting null.
        result["returnValue"] = return_value
    return json.dumps(result, default=str)
`;

// packages/sandbox/src/pyodide-worker.ts
var ctx = globalThis;
var now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
var MB = 1024 * 1024;
var WASM_PAGE_BYTES = 65536;
var pyodide = null;
var loadedPackages = /* @__PURE__ */ new Set();
var runCapBytes = 0;
var capHit = false;
var growGuardInstalled = false;
function heapBytes() {
  return pyodide?._module?.HEAPU8?.length ?? 0;
}
function installGrowGuard() {
  const proto = globalThis.WebAssembly?.Memory?.prototype;
  if (!proto || typeof proto.grow !== "function") return false;
  const realGrow = proto.grow;
  proto.grow = function(delta) {
    const nextBytes = this.buffer.byteLength + delta * WASM_PAGE_BYTES;
    if (runCapBytes > 0 && nextBytes > runCapBytes) {
      capHit = true;
      throw new RangeError(
        `Trellis memory cap: refusing wasm heap growth to ${Math.ceil(nextBytes / MB)} MB (cap ${Math.ceil(runCapBytes / MB)} MB)`
      );
    }
    return realGrow.call(this, delta);
  };
  return true;
}
async function init(memoryMb, pyodideUrl) {
  const mod = await import(
    /* @vite-ignore */
    `${pyodideUrl}pyodide.mjs`
  );
  const py = await mod.loadPyodide({ indexURL: pyodideUrl });
  await py.runPythonAsync(RUN_HARNESS);
  growGuardInstalled = installGrowGuard();
  if (!growGuardInstalled) {
    console.warn(
      "Trellis sandbox: wasmMemory grow-guard unavailable; memoryMb enforced by post-run watermark only"
    );
  }
  void memoryMb;
  pyodide = py;
}
function capFailure(wallMs, reqMb, used, preemptive) {
  return {
    ran: false,
    stdout: "",
    wallMs,
    timedOut: false,
    error: {
      type: "runtime",
      message: `memory limit exceeded: the run needed more than memoryMb=${reqMb} (wasm heap ${Math.ceil(used / MB)} MB, ${preemptive ? "heap growth refused by the cap guard" : "post-run watermark over cap"}); the worker will be recycled`
    }
  };
}
async function runOne(id, req) {
  if (!pyodide) {
    ctx.postMessage({
      kind: "result",
      id,
      result: {
        ran: false,
        stdout: "",
        wallMs: 0,
        timedOut: false,
        error: { type: "runtime", message: "pyodide not initialized" }
      }
    });
    return;
  }
  const t0 = now();
  for (const name of req.packages ?? []) {
    if (loadedPackages.has(name)) continue;
    try {
      await pyodide.loadPackage(name);
      loadedPackages.add(name);
    } catch (e) {
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
            message: `failed to load package ${name}: ${e instanceof Error ? e.message : String(e)}`
          }
        }
      });
      return;
    }
  }
  capHit = false;
  const startHeap = heapBytes();
  runCapBytes = Math.max(req.memoryMb * MB, startHeap);
  let result;
  try {
    pyodide.globals.set("_code", req.code);
    pyodide.globals.set("_entry", req.entrypoint);
    pyodide.globals.set("_stdin", req.stdin);
    const json = await pyodide.runPythonAsync("__trellis_run(_code, _entry, _stdin)");
    result = { ...JSON.parse(json), wallMs: now() - t0 };
  } catch (e) {
    result = {
      ran: false,
      stdout: "",
      wallMs: now() - t0,
      timedOut: false,
      error: { type: "runtime", message: e instanceof Error ? e.message : String(e) }
    };
  }
  const used = heapBytes();
  const overCap = used > runCapBytes;
  runCapBytes = 0;
  if (capHit || overCap) {
    ctx.postMessage({
      kind: "result",
      id,
      result: capFailure(result.wallMs, req.memoryMb, used, capHit),
      recycle: true
    });
    return;
  }
  ctx.postMessage({ kind: "result", id, result });
}
ctx.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.kind === "init") {
    init(msg.memoryMb, msg.pyodideUrl).then(() => ctx.postMessage({ kind: "ready" })).catch(
      (e) => ctx.postMessage({
        kind: "init-error",
        message: e instanceof Error ? e.message : String(e)
      })
    );
    return;
  }
  void runOne(msg.id, msg.req);
};
