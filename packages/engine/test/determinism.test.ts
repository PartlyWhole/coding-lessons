import { describe, it, expect } from "vitest";
import type { Diagnosis } from "@trellis/schema";
import { diagnoseNonBuild, detect, canonicalDiagnosis } from "../src/index.js";
import { bundle, recognizeStep } from "./fixtures.js";

describe("determinism", () => {
  const fx = { id: "d", learnerId: "L1", now: "2026-06-08T12:00:00.000Z" };

  it("same (step, submission, effects) → byte-identical Diagnosis (modulo wallMs)", () => {
    const a = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" }, bundle, fx);
    const b = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" }, bundle, fx);
    expect(canonicalDiagnosis(a)).toEqual(canonicalDiagnosis(b));
    expect(JSON.stringify(canonicalDiagnosis(a))).toBe(JSON.stringify(canonicalDiagnosis(b)));
  });

  it("detect is a pure function of its inputs", () => {
    const ctx = { signals: { ran: false, wallMs: 0 }, choiceId: "c" };
    expect(detect(recognizeStep, ctx, bundle)).toBe(detect(recognizeStep, ctx, bundle));
  });
});

// The 2026-06-09 determinism decision (docs/design-notes/2026-06-09-wallms-determinism.md):
// the contract is "byte-identical Diagnosis MODULO signals.wallMs". canonicalDiagnosis
// mechanically encodes the carve-out so byte-identity assertions never depend on the
// local twin pinning wallMs: 0 — they must pass against a real-time sandbox too.
describe("canonicalDiagnosis — wallMs carve-out (escalation 5)", () => {
  const mkDiag = (wallMs: number, over: Partial<Diagnosis> = {}): Diagnosis => ({
    id: "d",
    learnerId: "L1",
    stepId: "cell.x#1",
    contentVersion: "test@1",
    submittedAt: "2026-06-09T00:00:00.000Z",
    correct: false,
    attribution: "misconception",
    misconceptionId: "mis.loop.infinite_true",
    signals: { ran: false, timedOut: true, wallMs },
    skillDeltas: [{ skill: "skill.loop", kind: "misconception", weight: 0.4 }],
    seed: 0,
    ...over,
  });

  it("two Diagnoses differing ONLY in signals.wallMs are canonically byte-identical", () => {
    // Real-Pyodide evidence (debt2.json): repeated runs stamp e.g. 2001.7 vs 2000.8.
    const a = mkDiag(2001.7);
    const b = mkDiag(2000.8);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b)); // naive comparison differs…
    expect(JSON.stringify(canonicalDiagnosis(a))).toBe(JSON.stringify(canonicalDiagnosis(b)));
  });

  it("a difference in ANY other field still breaks canonical byte-identity", () => {
    const a = mkDiag(100);
    expect(JSON.stringify(canonicalDiagnosis(a))).not.toBe(
      JSON.stringify(canonicalDiagnosis(mkDiag(100, { correct: true }))),
    );
    expect(JSON.stringify(canonicalDiagnosis(a))).not.toBe(
      JSON.stringify(canonicalDiagnosis(mkDiag(100, { misconceptionId: "mis.loop.no_update" }))),
    );
    const semanticSignalDiff = mkDiag(100);
    semanticSignalDiff.signals.timedOut = false;
    expect(JSON.stringify(canonicalDiagnosis(a))).not.toBe(
      JSON.stringify(canonicalDiagnosis(semanticSignalDiff)),
    );
  });

  it("returns a copy with signals.wallMs zeroed; does NOT mutate its input", () => {
    const a = mkDiag(1234);
    const c = canonicalDiagnosis(a);
    expect(c).not.toBe(a);
    expect(c.signals).not.toBe(a.signals);
    expect(c.signals.wallMs).toBe(0);
    expect(a.signals.wallMs).toBe(1234); // input untouched
    // Shape unchanged: same keys, everything else equal.
    expect(Object.keys(c).sort()).toEqual(Object.keys(a).sort());
    expect({ ...c, signals: { ...c.signals, wallMs: a.signals.wallMs } }).toEqual(a);
  });
});
