import { describe, it, expect } from "vitest";
import type { BehavioralEvent } from "@trellis/schema";
import { editDistanceProxy, trailingFailStreak, wrongPredictThenCorrect } from "../src/derive.js";

function row(p: Partial<BehavioralEvent> & { type: BehavioralEvent["type"] }): BehavioralEvent {
  return {
    id: "x",
    learnerId: "L",
    sessionId: "s",
    seq: 0,
    stepId: "step",
    ts: "2026-06-10T00:00:00.000Z",
    payload: {},
    ...p,
  };
}

describe("SignalDeriver (§11.2 — pure: same events in, same signals out)", () => {
  it("editDistanceProxy: equal hash → 0 even when length matches by coincidence", () => {
    expect(editDistanceProxy({ length: 10, hash: "a" }, { length: 10, hash: "a" })).toBe(0);
  });

  it("editDistanceProxy: hash differs → |Δlength| (a lower bound on true edit distance)", () => {
    expect(editDistanceProxy({ length: 10, hash: "a" }, { length: 14, hash: "b" })).toBe(4);
    expect(editDistanceProxy({ length: 14, hash: "a" }, { length: 10, hash: "b" })).toBe(4);
    // same length, different content: proxy is 0-distance-from-length but hash says changed → 0? NO:
    // pinned D4 semantics — equal hash → 0; else |Δlen|. Same length + different hash → 0 is WRONG
    // (it changed); the proxy floors at |Δlen| which can be 0. That is the documented lower bound.
    expect(editDistanceProxy({ length: 10, hash: "a" }, { length: 10, hash: "b" })).toBe(0);
  });

  it("trailingFailStreak counts consecutive trailing wrongs (oldest-first input) and resets on a correct", () => {
    expect(trailingFailStreak([])).toBe(0);
    expect(trailingFailStreak([false])).toBe(1);
    expect(trailingFailStreak([false, false, false])).toBe(3);
    expect(trailingFailStreak([false, true, false, false])).toBe(2);
    expect(trailingFailStreak([false, false, true])).toBe(0);
  });

  it("wrongPredictThenCorrect: fires on wrong predict followed by a correct submission (newest-first input)", () => {
    const rows = [
      row({ type: "submission", seq: 2, payload: { correct: true, stepKind: "build" } }),
      row({ type: "submission", seq: 1, payload: { correct: false, stepKind: "predict" } }),
    ];
    expect(wrongPredictThenCorrect(rows)).toBe(true);
  });

  it("wrongPredictThenCorrect: fires on wrong predict followed by a run", () => {
    const rows = [
      row({ type: "run", seq: 2 }),
      row({ type: "submission", seq: 1, payload: { correct: false, stepKind: "predict" } }),
    ];
    expect(wrongPredictThenCorrect(rows)).toBe(true);
  });

  it("wrongPredictThenCorrect: rejects correct predict, wrong→wrong, and predict-only", () => {
    expect(
      wrongPredictThenCorrect([
        row({ type: "submission", seq: 2, payload: { correct: true, stepKind: "build" } }),
        row({ type: "submission", seq: 1, payload: { correct: true, stepKind: "predict" } }),
      ]),
    ).toBe(false);
    expect(
      wrongPredictThenCorrect([
        row({ type: "submission", seq: 2, payload: { correct: false, stepKind: "build" } }),
        row({ type: "submission", seq: 1, payload: { correct: false, stepKind: "predict" } }),
      ]),
    ).toBe(false);
    expect(
      wrongPredictThenCorrect([row({ type: "submission", seq: 1, payload: { correct: false, stepKind: "predict" } })]),
    ).toBe(false);
    expect(wrongPredictThenCorrect([])).toBe(false);
  });

  it("intervening non-outcome rows (editor_change, focus_change) do not break the predict→outcome adjacency", () => {
    const rows = [
      row({ type: "submission", seq: 4, payload: { correct: true, stepKind: "build" } }),
      row({ type: "editor_change", seq: 3, payload: { length: 3, hash: "h" } }),
      row({ type: "focus_change", seq: 2, payload: { focused: true } }),
      row({ type: "submission", seq: 1, payload: { correct: false, stepKind: "predict" } }),
    ];
    expect(wrongPredictThenCorrect(rows)).toBe(true);
  });

  it("determinism: same list in twice → deep-equal outputs", () => {
    const rows = [
      row({ type: "submission", seq: 2, payload: { correct: true, stepKind: "build" } }),
      row({ type: "submission", seq: 1, payload: { correct: false, stepKind: "predict" } }),
    ];
    expect(wrongPredictThenCorrect(rows)).toBe(wrongPredictThenCorrect(rows));
    expect(trailingFailStreak([false, false])).toBe(trailingFailStreak([false, false]));
  });
});
