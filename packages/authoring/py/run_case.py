#!/usr/bin/env python3
"""Run one build test case, mirroring content/verify/harness.py's per-case logic.
stdin: JSON {code, mode:"entrypoint"|"stdin", entry?, args?, expected, seed?, stdin?}
stdout: JSON {ran: bool, errType: "syntax"|"runtime"|null, ok: bool}
- entrypoint mode: seed PRNG as the grader does (import random as _sd; _sd.seed(seed)) WITHOUT
  binding `random` in the learner namespace; compare repr(entry(*args)) == repr(expected).
- stdin mode: feed stdin, compare stdout == expected.
Executes in a child python so an infinite loop is killed by a 5s timeout (-> runtime)."""
import json, subprocess, sys

spec = json.loads(sys.stdin.read())

def run(code, stdin):
    try:
        p = subprocess.run([sys.executable, "-c", code], input=stdin,
                           capture_output=True, text=True, timeout=5)
    except subprocess.TimeoutExpired:
        # harness.py lockstep: the watchdog kill is a distinct "timeout" sentinel that
        # build_signals maps to signals["timedOut"], never a runError.
        return "", {"type": "timeout"}
    err = None
    if p.returncode != 0:
        kind = "syntax" if ("SyntaxError" in p.stderr or "IndentationError" in p.stderr) else "runtime"
        err = {"type": kind}
    return p.stdout, err

code = spec["code"]
if spec["mode"] == "entrypoint":
    seed = spec.get("seed")
    seeding = f"\nimport random as _sd\n_sd.seed({seed})" if seed is not None else ""
    args = spec.get("args") or []
    driver = code + seeding + "\nprint(repr(" + spec["entry"] + "(" + \
        ", ".join(repr(a) for a in args) + ")))"
    out, err = run(driver, "")
    ok = (err is None) and out.strip() == repr(spec["expected"])
else:  # stdin
    stdin = spec.get("stdin")
    stdin = "" if stdin is None else (stdin if isinstance(stdin, str) else str(stdin))
    out, err = run(code, stdin)
    ok = (err is None) and out == spec["expected"]

ran = not (err and err["type"] == "syntax")
print(json.dumps({"ran": ran, "errType": (err["type"] if err else None), "ok": ok}))
