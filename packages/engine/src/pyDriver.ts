import type { Json } from "@trellis/schema";

// Marker separating any learner stdout from the driver's JSON result. The \x00 bytes
// make accidental collision with learner text effectively impossible.
export const SENTINEL = "\x00__TRELLIS_RESULT__\x00";

export interface EntrypointDriver {
  code: string;
  entrypoint: string;
  args: Json[];
  seed?: number;
}

function toBase64Json(value: unknown): string {
  // Buffer is a Node global; the engine's runtime here is Node (tests) and the bundler
  // for the browser provides Buffer or we swap to btoa at M5. ASCII base64 only.
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64");
}

// Build a self-contained program: learner code, optional PRNG seeding, then call
// entrypoint(*args) and print SENTINEL + {"v": result}. Mirrors harness.py build_signals.
export function entrypointDriver(d: EntrypointDriver): string {
  const seeding = d.seed !== undefined ? `\nimport random as _sd\n_sd.seed(${d.seed})` : "";
  const argsB64 = toBase64Json(d.args);
  return (
    d.code +
    seeding +
    `\nimport json as _t_json, base64 as _t_b64, sys as _t_sys` +
    `\n_t_args = _t_json.loads(_t_b64.b64decode("${argsB64}").decode("utf-8"))` +
    `\n_t_res = ${d.entrypoint}(*_t_args)` +
    `\n_t_sys.stdout.write("${SENTINEL}" + _t_json.dumps({"v": _t_res}, default=str))`
  );
}

export type DriverResult = { ok: true; value: Json } | { ok: false };

export function parseDriverStdout(stdout: string): DriverResult {
  const idx = stdout.lastIndexOf(SENTINEL);
  if (idx === -1) return { ok: false };
  const tail = stdout.slice(idx + SENTINEL.length);
  try {
    const wrapped = JSON.parse(tail) as { v: Json };
    return { ok: true, value: wrapped.v };
  } catch {
    return { ok: false };
  }
}
