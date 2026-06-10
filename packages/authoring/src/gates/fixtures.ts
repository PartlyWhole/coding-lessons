// Ports content/verify/harness.py's gate-5 loop in ATTRIBUTION mode (E-16, matching the
// harness since the D3 re-key a4fb601): BUILD fixtures assert §7 attribution — the
// misconception must WIN (trigger) or NOT WIN (notTrigger) the specificity-ranked
// first-match among all candidate misconceptions of the step's skills (detectWinner
// mirrors engine detect()). Non-build fixtures stay isolated signature matches
// (choice ids are step-local).
//
// Speedup (two-phase corpus batching): build fixtures are PLANNED first (AST tags +
// the exec specs they would need), then ALL bare runs execute in ONE python3 batch,
// then ALL surviving per-case runs in a second batch (the bare run's timeout short-
// circuits the cases — E-15 lockstep, phase-ordered exactly as buildSignals). The
// per-fixture verdict logic is unchanged.
import type { Loaded, RawFixture, RawStep } from "../raw-types.js";
import {
  signalsFor,
  buildFixtureContext,
  planBuildSignals,
  finishBuildSignals,
  type BuildExecPlan,
} from "../signals.js";
import { runCases, type CaseSpec } from "../ast/python.js";
import { sigMatch, type Signals } from "../signature.js";
import { detectWinner } from "../detect.js";
import type { GateIssue } from "./types.js";

const G = "5-fixtures";

export function gateFixtures(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  interface Row {
    mid: string;
    label: "triggers" | "notTriggers";
    want: boolean;
    fix: RawFixture;
    signals?: Signals & { _error?: string; _step?: RawStep };
    plan?: BuildExecPlan;
    bareIdx?: number;
    caseIdx?: [start: number, count: number];
  }
  const rows: Row[] = [];
  for (const mid of Object.keys(loaded.miscons).sort()) {
    const m = loaded.miscons[mid]!;
    for (const [label, want] of [["triggers", true], ["notTriggers", false]] as const) {
      for (const fix of m[label] ?? []) rows.push({ mid, label, want, fix });
    }
  }

  // Phase A: plan all build fixtures; collect bare specs. Non-build fixtures and
  // _error cases resolve exactly as signalsFor does today (no exec work).
  const bareSpecs: CaseSpec[] = [];
  for (const row of rows) {
    const m = loaded.miscons[row.mid]!;
    if (row.fix.stepKind !== "build") {
      row.signals = signalsFor(row.fix, m, loaded);
      continue;
    }
    const { step, needs } = buildFixtureContext(m, loaded);
    if (step === null) {
      row.signals = { _error: `no build step certifies ${m._skill ?? m.skill}` };
      continue;
    }
    const { signals, plan } = planBuildSignals(row.fix.code ?? "", step, needs);
    row.signals = signals;
    row.signals._step = step;
    row.plan = plan;
    if (plan.needsExec) row.bareIdx = bareSpecs.push(plan.bareSpec!) - 1;
  }
  const bares = runCases(bareSpecs); // ONE invocation for every bare run

  // Phase B: case specs for fixtures whose bare run didn't time out (E-15: a bare
  // timeout short-circuits before the test runner, so its cases never execute).
  const caseSpecs: CaseSpec[] = [];
  for (const row of rows) {
    if (row.bareIdx === undefined || bares[row.bareIdx]!.errType === "timeout") continue;
    row.caseIdx = [caseSpecs.length, row.plan!.caseSpecs!.length];
    caseSpecs.push(...row.plan!.caseSpecs!);
  }
  const caseResults = runCases(caseSpecs); // ONE invocation for every per-case run

  // Phase C: finish signals + judge (detectWinner / sigMatch exactly as before).
  for (const row of rows) {
    const m = loaded.miscons[row.mid]!;
    const sig = m.signature as Record<string, unknown>;
    const s = row.signals!;
    if (s._error) {
      issues.push({ gate: G, level: "error", message: `${row.mid}: ${s._error}` });
      continue;
    }
    if (row.bareIdx !== undefined) {
      const slice = row.caseIdx
        ? caseResults.slice(row.caseIdx[0], row.caseIdx[0] + row.caseIdx[1])
        : [];
      finishBuildSignals(s, bares[row.bareIdx]!, slice); // mutates s in place (_step kept)
    }
    const step = s._step;
    const got = step !== undefined ? detectWinner(loaded, step, s) === row.mid : sigMatch(sig, s);
    if (got !== row.want) {
      const what = row.fix.code ?? row.fix.choice ?? row.fix.input;
      issues.push({
        gate: G,
        level: "error",
        message: `${row.mid}: ${row.label} ${JSON.stringify(what)} want=${row.want} got=${got}`,
      });
    }
  }
  return issues;
}
