import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
  mode: "entrypoint" | "stdin";
  entry?: string;
  args?: unknown[];
  expected: unknown;
  seed?: number;
  stdin?: string | null;
}
export interface CaseResult { ran: boolean; errType: "syntax" | "runtime" | null; ok: boolean; }

/** Run one build test case via py/run_case.py (CPython execution + repr comparison). */
export function runCase(spec: CaseSpec): CaseResult {
  return JSON.parse(python(join(PY_DIR, "run_case.py"), JSON.stringify(spec))) as CaseResult;
}
