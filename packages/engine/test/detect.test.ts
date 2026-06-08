import { describe, it, expect } from "vitest";
import { evalSignature, specificityRank, detect } from "../src/detect.js";
import type { Signature, RawSignals } from "@trellis/schema";
import { bundle, recognizeStep } from "./fixtures.js";

const noSignals: RawSignals = { ran: false, wallMs: 0 };

describe("evalSignature — leaf forms", () => {
  it("astTag matches against signals.astTags", () => {
    const sig: Signature = { astTag: "uses_random_name" };
    expect(evalSignature(sig, { signals: { ran: true, wallMs: 1, astTags: ["uses_random_name"] } })).toBe(true);
    expect(evalSignature(sig, { signals: noSignals })).toBe(false);
  });

  it("runError matches the run error type", () => {
    const sig: Signature = { runError: "runtime" };
    expect(evalSignature(sig, { signals: { ran: false, wallMs: 1, runError: { type: "runtime", message: "x" } } })).toBe(true);
    expect(evalSignature(sig, { signals: { ran: false, wallMs: 1, runError: { type: "syntax", message: "x" } } })).toBe(false);
  });

  it("choice and recallEquals match the DetectContext submission", () => {
    expect(evalSignature({ choice: "b" }, { signals: noSignals, choiceId: "b" })).toBe(true);
    expect(evalSignature({ choice: "b" }, { signals: noSignals, choiceId: "a" })).toBe(false);
    expect(evalSignature({ recallEquals: "Use Random.randint" }, { signals: noSignals, recallText: "use random.randint" })).toBe(true);
  });

  it("timedOut matches signals.timedOut", () => {
    expect(evalSignature({ timedOut: true }, { signals: { ran: false, wallMs: 1, timedOut: true } })).toBe(true);
    expect(evalSignature({ timedOut: true }, { signals: noSignals })).toBe(false);
  });

  it("testFailure matches by caseIndex with the failed-count guard", () => {
    const sig: Signature = { testFailure: { caseIndex: 0 } };
    const signals: RawSignals = { ran: true, wallMs: 1, tests: { passed: 1, failed: 1, failures: [{ caseIndex: 0, got: 57 }] } };
    expect(evalSignature(sig, { signals })).toBe(true);
    expect(evalSignature(sig, { signals: { ran: true, wallMs: 1, tests: { passed: 2, failed: 0, failures: [] } } })).toBe(false);
  });
});

describe("evalSignature — combinators", () => {
  it("all/any/not compose", () => {
    const sig: Signature = { all: [{ astTag: "uses_random_name" }, { not: { astTag: "has_random_import" } }] };
    expect(evalSignature(sig, { signals: { ran: true, wallMs: 1, astTags: ["uses_random_name"] } })).toBe(true);
    expect(evalSignature(sig, { signals: { ran: true, wallMs: 1, astTags: ["uses_random_name", "has_random_import"] } })).toBe(false);
  });
});

describe("specificityRank", () => {
  it("ranks structural/direct (0) above behavioral (1) above generic errors (2)", () => {
    expect(specificityRank({ astTag: "x" })).toBe(0);
    expect(specificityRank({ choice: "b" })).toBe(0);
    expect(specificityRank({ testFailure: {} })).toBe(1);
    expect(specificityRank({ runError: "runtime" })).toBe(2);
    expect(specificityRank({ any: [{ runError: "runtime" }, { choice: "b" }] })).toBe(0);
  });
});

describe("detect", () => {
  it("returns the no_import misconception for choice b on the recognize step", () => {
    expect(detect(recognizeStep, { signals: noSignals, choiceId: "b" }, bundle)).toBe("mis.random.no_import");
  });

  it("returns the off_by_one misconception for choice c", () => {
    expect(detect(recognizeStep, { signals: noSignals, choiceId: "c" }, bundle)).toBe("mis.random.range_off_by_one");
  });

  it("returns null when nothing matches (unclassified choice d)", () => {
    expect(detect(recognizeStep, { signals: noSignals, choiceId: "d" }, bundle)).toBeNull();
  });
});
