import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import type { RunResult, RunRequest, AstQuery } from "@trellis/schema";
import { RUN_HARNESS } from "./run-harness.js";
import { parseAndMatch as runParseAndMatch, type RunFn } from "./parse-and-match.js";

// OFFLINE VERIFICATION ONLY. A faithful subprocess twin of the deferred Pyodide worker:
// it executes the SAME RUN_HARNESS Python via local CPython, so the differential and the
// ladder can be proven without network. The PRODUCTION path is Pyodide (sandbox.ts); the
// live ladder on real Pyodide-in-WASM is DEFERRED to a networked browser.
export interface LocalSandboxConfig {
  python?: string; // default "python3"
}

export interface LocalSandbox {
  run(req: RunRequest): Promise<RunResult>;
  parseAndMatch(code: string, queries: { tag: string; query: AstQuery }[]): Promise<string[]>;
}

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin);
}

function isTimeout(proc: SpawnSyncReturns<string>): boolean {
  // Real @types/node types `error` as `Error` (no `.code`); narrow to ErrnoException to read it.
  const code = (proc.error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ETIMEDOUT" || code === "ENOBUFS") return true;
  if (proc.signal === "SIGTERM") return true;
  if (proc.status === null && proc.signal != null) return true;
  return false;
}

export function createLocalSandbox(config: LocalSandboxConfig = {}): LocalSandbox {
  const python = config.python ?? "python3";

  const run = async (req: RunRequest): Promise<RunResult> => {
    // Drive __trellis_run exactly as the worker does; pass code/entry/stdin via base64 so
    // arbitrary learner source can't break the -c string. Print its JSON to real stdout.
    const driver =
      RUN_HARNESS +
      `\nimport base64 as _b64\n` +
      `_code = _b64.b64decode("${b64(req.code)}").decode("utf-8")\n` +
      `_entry = ${req.entrypoint !== undefined ? `_b64.b64decode("${b64(req.entrypoint)}").decode("utf-8")` : "None"}\n` +
      `_stdin = ${req.stdin !== undefined ? `_b64.b64decode("${b64(req.stdin)}").decode("utf-8")` : "None"}\n` +
      `print(__trellis_run(_code, _entry, _stdin))`;
    const proc = spawnSync(python, ["-c", driver], {
      input: "",
      encoding: "utf-8",
      timeout: req.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (isTimeout(proc)) {
      return { ran: false, stdout: "", wallMs: 0, timedOut: true };
    }
    if (proc.status !== 0 || !proc.stdout) {
      // RUN_HARNESS always returns valid JSON via print; a nonzero status is an infra fault.
      const stderrLines = (proc.stderr || "twin failure").trim().split("\n");
      const msg = stderrLines[stderrLines.length - 1] ?? "twin failure";
      return { ran: false, stdout: "", wallMs: 0, timedOut: false, error: { type: "runtime", message: msg } };
    }
    try {
      const parsed = JSON.parse(proc.stdout.trim()) as RunResult;
      // Keep the harness's deterministic wallMs (0); do NOT stamp Date.now (determinism).
      return parsed;
    } catch {
      return { ran: false, stdout: proc.stdout, wallMs: 0, timedOut: false, error: { type: "runtime", message: "unparseable harness output" } };
    }
  };

  const runFn: RunFn = run;
  return {
    run,
    parseAndMatch: (code, queries) => runParseAndMatch(runFn, code, queries),
  };
}
