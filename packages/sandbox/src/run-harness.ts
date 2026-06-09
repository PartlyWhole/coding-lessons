// packages/sandbox/src/run-harness.ts
// The per-run Python harness shared by the real Pyodide worker (pyodide-worker.ts) and
// the offline CPython twin (local-cpython.ts, Task 10). Single source of truth. Extracted
// VERBATIM from the original inline worker harness — do not alter its behavior.
export const RUN_HARNESS = `
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
