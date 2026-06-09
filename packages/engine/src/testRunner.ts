import type { BuildStep, Json } from "@trellis/schema";
import type { BuildSandbox } from "./buildSandbox.js";
import { compareValues, type Comparator } from "./compare.js";
import { entrypointDriver, parseDriverStdout } from "./pyDriver.js";

export interface TestRunResult {
  passed: number;
  failed: number;
  failures: { caseIndex: number; got: Json }[];
  runError?: { type: "syntax" | "runtime" };
}

// §6.2 test runner. Mirrors harness.py build_signals so the offline differential agrees:
// a case fails on a run error OR a comparator mismatch; the first runtime error sets
// runError (a per-case entrypoint exception surfaces as runError: "runtime").
export async function runTests(
  step: BuildStep,
  code: string,
  sandbox: BuildSandbox,
): Promise<TestRunResult> {
  const ev = step.evaluator;
  const cases = ev.tests?.cases ?? [];
  const comparator = ev.tests?.comparator as Comparator | undefined;
  const entrypoint = ev.run.entrypoint;
  const seed = ev.property?.seed;
  const failures: { caseIndex: number; got: Json }[] = [];
  let runError: { type: "syntax" | "runtime" } | undefined;
  let passed = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    let got: Json = null;
    let errored = false;
    let ok = false;

    if (entrypoint) {
      const args = Array.isArray(c.input) ? (c.input as Json[]) : [c.input as Json];
      const driver = entrypointDriver(seed !== undefined ? { code, entrypoint, args, seed } : { code, entrypoint, args });
      const res = await sandbox.run({ code: driver, timeoutMs: ev.run.timeoutMs, memoryMb: ev.run.memoryMb });
      if (res.error || res.timedOut || !res.ran) {
        errored = true;
        if (res.error?.type === "runtime" || res.timedOut) runError ??= { type: "runtime" };
        else if (res.error?.type === "syntax") runError ??= { type: "syntax" };
      } else {
        const parsed = parseDriverStdout(res.stdout);
        if (parsed.ok) {
          got = parsed.value;
          ok = compareValues(comparator, got, c.expected as Json);
        } else {
          errored = true;
        }
      }
    } else {
      const stdin = c.input === undefined || c.input === null ? "" : String(c.input);
      const res = await sandbox.run({ code, stdin, timeoutMs: ev.run.timeoutMs, memoryMb: ev.run.memoryMb });
      if (res.error || res.timedOut || !res.ran) {
        errored = true;
        if (res.error?.type === "runtime" || res.timedOut) runError ??= { type: "runtime" };
        else if (res.error?.type === "syntax") runError ??= { type: "syntax" };
      } else {
        got = res.stdout;
        ok = compareValues(comparator, got, c.expected as Json);
      }
    }

    if (ok) passed++;
    else failures.push({ caseIndex: i, got: errored ? null : got });
  }

  return { passed, failed: failures.length, failures, ...(runError ? { runError } : {}) };
}
