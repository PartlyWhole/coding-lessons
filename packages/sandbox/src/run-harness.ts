// packages/sandbox/src/run-harness.ts
// The per-run Python harness shared by the real Pyodide worker (pyodide-worker.ts) and
// the offline CPython twin (local-cpython.ts, Task 10). Single source of truth.
//
// js-FFI hardening (Stream J, escalation 3 / Debt-1 finding A): learner code must not
// be able to reach the Pyodide JS bridge (`js`, `pyodide_js`, `pyodide.code.run_js`, or
// anything registered via registerJsModule). Around the learner exec/entrypoint call we:
//   1. compute a blocklist = static roots {js, pyodide_js, pyodide, _pyodide}
//      ∪ sys.modules entries that are JsProxy objects (dynamic sweep)
//      ∪ names registered on any meta_path finder with a `jsproxies` registry
//      (Pyodide's JsFinder — i.e. every registerJsModule target);
//   2. pop those names (incl. submodules) from sys.modules (the import system consults
//      sys.modules BEFORE meta_path, so cached bridge modules must go);
//   3. remove the `jsproxies`-bearing finders from sys.meta_path so no bridge name is
//      resolvable at all;
//   4. arm a meta_path[0] blocker so the learner gets a clean, honest
//      ImportError("module '<name>' is not available in the Trellis sandbox");
//   5. in `finally`, disarm + restore finders and modules — host machinery (stdout
//      capture, result marshalling, parseAndMatch's ast program, package loading
//      between runs) and the NEXT run on a reused warm worker are untouched.
// Under the plain-CPython twin the dynamic sweep no-ops and the static roots make
// `import js` fail with the SAME error, so the semantics are TDD-able offline.
//
// HONEST SCOPE: this closes the import surface. In-process CPython cannot be made
// adversarially escape-proof (e.g. sys._getframe/gc introspection can dig out saved
// references); the hard enclosure remains the worker boundary — structured-clone-only
// messages, no shared state, watchdog terminate().
export const RUN_HARNESS = `
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
