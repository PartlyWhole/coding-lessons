import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { JsonNode } from "./json-ast.js";

// Locate packages/authoring/py from this module. Under Vitest the module is
// src/ast/python.ts (py is 2 levels up); built it is dist/src/ast/python.js
// (py is 4 levels up, since the scripts are NOT copied into dist). Walk up from
// the module dir until a py/ast_dump.py is found so both layouts resolve to the
// same packages/authoring/py.
function findPyDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "py");
    if (existsSync(join(candidate, "ast_dump.py"))) return candidate;
    dir = join(dir, "..");
  }
  throw new Error("could not locate packages/authoring/py (ast_dump.py)");
}

const PY_DIR = findPyDir();

function python(script: string, input: string): string {
  const r = spawnSync("python3", [script], { input, encoding: "utf8", maxBuffer: 1 << 24, timeout: 30000 });
  if (r.error) throw new Error(`python3 not runnable: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`python3 ${script} failed (${r.status}): ${r.stderr}`);
  return r.stdout;
}

export type Parsed = { syntaxError: true } | { syntaxError: false; ast: JsonNode };

/** ast.parse(code) -> JSON AST (or a syntax-error marker). */
export function parsePython(code: string): Parsed {
  const out = JSON.parse(python(join(PY_DIR, "ast_dump.py"), code)) as JsonNode & { _syntaxError?: boolean };
  return out._syntaxError ? { syntaxError: true } : { syntaxError: false, ast: out };
}

export interface CaseSpec {
  code: string;
  mode: "entrypoint" | "stdin" | "bare"; // "bare" = E-15 input-free engine bare run
  entry?: string;
  args?: unknown[];
  expected?: unknown;
  seed?: number;
  stdin?: string | null;
  timeoutSec?: number; // default 5 (run_case.py parity); tests use 1 for runaways
}
export interface CaseResult { ran: boolean; errType: "syntax" | "runtime" | "timeout" | null; ok: boolean; }

// In-process batch driver: ONE spawn for N cases. Mirrors py/run_case.py's per-case
// semantics (see the classification table in the speedup plan) with fresh ns per case
// and SIGALRM per-case timeouts. Embedded here (not py/) so the bridge stays in this
// module's write set; py/run_case.py remains the single-case reference implementation.
//
// Classification lockstep with run_case.py's child-stderr heuristics:
//   compile() SyntaxError/IndentationError -> "syntax"; a *runtime*-raised SyntaxError
//   (e.g. compile('bad(')) also printed "SyntaxError" to the child's stderr -> caught at
//   exec time -> "syntax"; SIGALRM _Timeout -> "timeout"; SystemExit code in (None, 0)
//   -> no error (output compared); SystemExit nonzero / any other BaseException ->
//   "runtime"; ran = errType != "syntax" (a timeout IS a run).
//
// Accepted semantic deltas vs the subprocess-per-case reference (trusted authored
// content; the uncached harness.py differential is the backstop):
//   (a) sys.modules persists across cases within a batch (warm-worker semantics; per-
//       case PRNG seeding is per-driver so seeded determinism is unchanged);
//   (b) a C-level busy loop is not SIGALRM-interruptible — the outer spawnSync budget
//       (30s + 5s*cases) fails the BATCH as an infra error (today a C busy loop burns
//       the full 30s per-spawn timeout anyway).
//
// fd hygiene (same trick as the sandbox twin): the result writer is a dup of fd 1 taken
// at startup, then fd 1 is parked on /dev/null — a stray C-level print inside a case
// cannot pollute the JSON result stream. spawnSync captures the dup'd pipe.
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

/** Execute a batch of specs (no cache): ONE python3 spawn for N cases. */
function execBatch(specs: CaseSpec[]): CaseResult[] {
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

// --- Disk cache for case results (pure memo; speedup plan Task 5). ---------------
// Key = sha256(canonicalJson({v, py: `python3 -V`, driver: sha256(BATCH_DRIVER), spec})):
// any driver edit or interpreter change reissues every key — invalidation is structural,
// never manual. A result is only pure if the case is deterministic; seeded/property
// fixtures are, and an unseeded-entropy fixture was never deterministic to begin with —
// the cache freezes one observation, and the cold-run identity test plus the gate-5
// differential (harness.py runs UNCACHED) bound the risk. Kill switch:
// TRELLIS_GATE_CACHE=0 bypasses read AND write.
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
  return JSON.stringify(o, (_k, v: unknown) =>
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
// PY_DIR = packages/authoring/py -> repo root is 3 up; node_modules/ is git-ignored, so
// the cache needs no .gitignore entry. Exported for the path-resolution unit test.
export const DEFAULT_CACHE_DIR = join(PY_DIR, "../../..", "node_modules/.cache/trellis-gate-exec");

/** Run MANY build test cases in ONE python3 invocation (gate 5/6 batching), memoized
 * on disk per case. A cold run reproduces identical results by construction (the cache
 * stores exactly what execBatch returned for the same key). */
export function runCases(specs: CaseSpec[], opts: { cacheDir?: string } = {}): CaseResult[] {
  if (specs.length === 0) return [];
  const enabled = process.env["TRELLIS_GATE_CACHE"] !== "0";
  const dir = opts.cacheDir ?? DEFAULT_CACHE_DIR;
  const out: (CaseResult | undefined)[] = new Array<CaseResult | undefined>(specs.length);
  const missIdx: number[] = [];
  if (enabled) {
    for (let i = 0; i < specs.length; i++) {
      const f = join(dir, cacheKey(specs[i]!) + ".json");
      if (existsSync(f)) out[i] = JSON.parse(readFileSync(f, "utf8")) as CaseResult;
      else missIdx.push(i);
    }
  } else {
    for (let i = 0; i < specs.length; i++) missIdx.push(i);
  }
  if (missIdx.length > 0) {
    const fresh = execBatch(missIdx.map((i) => specs[i]!));
    if (enabled) mkdirSync(dir, { recursive: true });
    missIdx.forEach((i, j) => {
      out[i] = fresh[j]!;
      if (enabled) writeFileSync(join(dir, cacheKey(specs[i]!) + ".json"), JSON.stringify(fresh[j]!));
    });
  }
  return out as CaseResult[];
}

/** Run one build test case. Now delegates to the batch driver (one code path);
 * py/run_case.py stays as the single-case reference implementation (runtime-dead). */
export function runCase(spec: CaseSpec): CaseResult {
  return runCases([spec])[0]!;
}
