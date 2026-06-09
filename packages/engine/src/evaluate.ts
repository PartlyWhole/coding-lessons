import type { BuildStep, Step, Bundle, Diagnosis, RawSignals, Attribution } from "@trellis/schema";
import type { BuildSandbox, BuildSubmission } from "./buildSandbox.js";
import { DEFAULT_CONFIG, type EngineConfig } from "./config.js";
import { detect, type DetectContext } from "./detect.js";
import {
  computeDeltas,
  diagnoseNonBuild,
  type NonBuildSubmission,
  type DiagnoseEffects,
} from "./diagnose.js";
import { runTests } from "./testRunner.js";
import { runProperty } from "./propertyRunner.js";

export type Submission = BuildSubmission | NonBuildSubmission;

// Assemble RawSignals for a build submission. ORDER MATTERS: compute AST tags FIRST
// (parseAndMatch only ast.parse-s, never executes the learner code, so it cannot hang on
// an infinite loop), THEN the bare run (which may time out on a runaway program and
// short-circuit) — so astTags survive a short-circuit. AST tags are advisory: they never
// gate pass/fail (§6.4); detect consumes them. Mirrors harness.py (tags computed always).
export async function assembleBuildSignals(
  step: BuildStep,
  code: string,
  sandbox: BuildSandbox,
): Promise<RawSignals> {
  const ev = step.evaluator;
  const signals: RawSignals = { ran: true, wallMs: 0 };

  // 1. AST tags first (never executes the submission; safe on infinite loops).
  if (ev.ast && ev.ast.queries.length > 0) {
    signals.astTags = await sandbox.parseAndMatch(code, ev.ast.queries);
  }

  // 2. Bare run to detect a syntax error / module-load fault / runaway (timeout). NO
  //    entrypoint: a no-arg entrypoint() call is meaningless (the corpus entrypoints take
  //    args). We only consume `ran`/`timedOut`/syntax here; per-case faults come from tests.
  const bare = await sandbox.run({ code, timeoutMs: ev.run.timeoutMs, memoryMb: ev.run.memoryMb });
  signals.wallMs = bare.wallMs;
  if (!bare.ran) {
    signals.ran = false;
    if (bare.timedOut) signals.timedOut = true;
    if (bare.error) {
      signals.runError = {
        type: bare.error.type,
        message: bare.error.message,
        ...(bare.error.line !== undefined ? { line: bare.error.line } : {}),
      };
    }
    // ast.parse also fails on a syntax error → astTags already []; short-circuit.
    return signals;
  }
  if (bare.timedOut) signals.timedOut = true;

  // 3. Tests.
  if (ev.tests) {
    const t = await runTests(step, code, sandbox);
    signals.tests = { passed: t.passed, failed: t.failed, failures: t.failures };
    if (t.runError) signals.runError = { type: t.runError.type, message: t.runError.type };
  }

  // 4. Property — only when tests didn't fail and nothing errored, and an entrypoint exists.
  const testsFailed = (signals.tests?.failed ?? 0) > 0;
  if (ev.property && !testsFailed && !signals.runError && ev.run.entrypoint) {
    const p = await runProperty(ev.property, ev.run.entrypoint, code, sandbox);
    signals.property = {
      passed: p.passed,
      ...(p.counterexample !== undefined ? { counterexample: p.counterexample } : {}),
    };
  }

  return signals;
}

// §12.1 evaluate. Build path runs the ladder + §8 diagnosis (reusing detect/computeDeltas);
// non-build delegates to the M2 sync path. Total + deterministic given (step, code, seed).
export async function evaluate(
  step: Step,
  submission: Submission,
  sandbox: BuildSandbox,
  bundle: Bundle,
  fx: DiagnoseEffects,
  cfg: EngineConfig = DEFAULT_CONFIG,
): Promise<Diagnosis> {
  if (step.kind !== "build") {
    if (submission.kind === "build") throw new Error("build submission on a non-build step");
    return diagnoseNonBuild(step, submission, bundle, fx, cfg);
  }
  if (submission.kind !== "build") throw new Error("non-build submission on a build step");

  const signals = await assembleBuildSignals(step, submission.code, sandbox);
  const ctx: DetectContext = { signals };

  let correct: boolean;
  let attribution: Attribution;
  let mid: string | undefined;

  if (!signals.ran) {
    // §7 routing (verification escalation 1): a run the watchdog killed — or that faulted
    // at module level — must still reach detect(), or a re-keyed { timedOut: true } /
    // { runError } signature can never surface through the live ladder. Misconception
    // wins; otherwise fall back to the error-type attribution.
    correct = false;
    mid = detect(step, ctx, bundle) ?? undefined;
    attribution =
      mid !== undefined
        ? "misconception"
        : ((signals.runError?.type ?? "runtime") as Attribution);
  } else if ((signals.tests?.failed ?? 0) > 0) {
    correct = false;
    mid = detect(step, ctx, bundle) ?? undefined;
    attribution = mid !== undefined ? "misconception" : "mismatch";
  } else if (signals.property && signals.property.passed === false) {
    correct = false;
    mid = detect(step, ctx, bundle) ?? undefined;
    attribution = mid !== undefined ? "misconception" : "mismatch";
  } else {
    correct = true;
    attribution = "pass";
    // Pass-compatible style detection is a no-op for the v1 corpus (no acceptedVariants,
    // no pass-compatible misconceptions): every corpus signature pairs each astTag with a
    // behavioral testFailure, so a passing solution never matches. mid stays undefined.
    mid = undefined;
  }

  const skillDeltas = computeDeltas(step, correct, mid, bundle, cfg);
  const diag: Diagnosis = {
    id: fx.id,
    learnerId: fx.learnerId,
    stepId: step.id,
    contentVersion: bundle.contentVersion,
    submittedAt: fx.now,
    correct,
    attribution,
    signals,
    skillDeltas,
    seed: step.evaluator.property?.seed ?? 0,
  };
  if (mid !== undefined) diag.misconceptionId = mid;
  return diag;
}
