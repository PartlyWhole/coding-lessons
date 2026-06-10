import { describe, it, expect } from "vitest";
import type { BehavioralEvent } from "@trellis/schema";
import { createRecorder } from "../src/recorder.js";
import { DEFAULT_CAPTURE_POLICY, hashText } from "../src/policy.js";
import { FakeClock, seqIds } from "./helpers/fake.js";

function harness(): { rows: BehavioralEvent[]; rec: ReturnType<typeof createRecorder>; clock: FakeClock } {
  const rows: BehavioralEvent[] = [];
  const clock = new FakeClock();
  const rec = createRecorder({
    learnerId: "L",
    sessionId: "sess-1",
    clock,
    ids: seqIds(),
    policy: DEFAULT_CAPTURE_POLICY,
    emitRow: (r) => rows.push(r),
  });
  return { rows, rec, clock };
}

describe("Recorder (§11.2 — UiEvent → BehavioralEvent, D3 mapping)", () => {
  it("maps the full D3 table row-by-row (types, payloads, sentinel, fold, renames)", () => {
    const { rows, rec } = harness();
    rec.onUiEvent({ t: "session_start" });
    rec.onUiEvent({ t: "step_enter", stepId: "s1", kind: "predict" });
    rec.onUiEvent({ t: "editor_change", stepId: "s1", length: 5, hash: "abcd0123" });
    rec.onUiEvent({ t: "run", stepId: "s1" });
    rec.onUiEvent({ t: "hint_request", stepId: "s1", level: 2 });
    rec.onUiEvent({ t: "peek_back", stepId: "s1" });
    rec.onUiEvent({ t: "focus", stepId: "s1", focused: false });
    rec.onUiEvent({ t: "step_release", stepId: "s1" });

    expect(rows.map((r) => r.type)).toEqual([
      "session_start",
      "step_enter",
      "editor_change",
      "run",
      "hint_requested", // renamed from UiEvent t:"hint_request" — deliberate (§3.9 literal)
      "peek_back",
      "focus_change", // renamed from UiEvent t:"focus"
      "step_release",
    ]);
    expect(rows[0]!.stepId).toBe(""); // session_start sentinel (no active step yet)
    expect(rows[0]!.payload).toEqual({});
    expect(rows[1]!.payload).toEqual({ kind: "predict" });
    expect(rows[2]!.payload).toEqual({ length: 5, hash: "abcd0123" });
    expect(rows[3]!.payload).toEqual({});
    expect(rows[4]!.payload).toEqual({ level: 2 });
    expect(rows[6]!.payload).toEqual({ focused: false });
    expect(rows[7]!.payload).toEqual({});
  });

  it("predict_answer maps to ZERO rows (E4 fold): predict outcome lives on the submission row", () => {
    const { rows, rec } = harness();
    rec.onUiEvent({ t: "step_enter", stepId: "p1", kind: "predict" });
    rec.onUiEvent({
      t: "submission",
      stepId: "p1",
      diagnosis: { correct: false, attribution: "misconception", misconceptionId: "mis.x" } as never,
    });
    rec.onUiEvent({ t: "predict_answer", stepId: "p1", correct: false });
    const subs = rows.filter((r) => r.type === "submission");
    expect(rows).toHaveLength(2); // step_enter + submission; predict_answer added nothing
    const p = subs[0]!.payload as Record<string, unknown>;
    expect(p["stepKind"]).toBe("predict");
    expect(p["correct"]).toBe(false);
    expect(p["attribution"]).toBe("misconception");
    expect(p["misconceptionId"]).toBe("mis.x");
  });

  it("stamps sessionId, learnerId, ISO ts, and gap-free seq 0..n across a 10-event script", () => {
    const { rows, rec, clock } = harness();
    clock.tick(1_700_000_000_000);
    rec.onUiEvent({ t: "session_start" });
    rec.onUiEvent({ t: "step_enter", stepId: "s1", kind: "build" });
    for (let i = 0; i < 6; i++) rec.onUiEvent({ t: "editor_change", stepId: "s1", length: i, hash: `h${i}` });
    rec.onUiEvent({ t: "run", stepId: "s1" });
    rec.onUiEvent({ t: "step_release", stepId: "s1" });
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // gap-free, row-creation order
    expect(new Set(rows.map((r) => r.sessionId))).toEqual(new Set(["sess-1"]));
    expect(new Set(rows.map((r) => r.learnerId))).toEqual(new Set(["L"]));
    expect(rows[0]!.ts).toBe(new Date(1_700_000_000_000).toISOString());
    expect(new Set(rows.map((r) => r.id)).size).toBe(10); // unique ids
  });

  it("submission payload: failStreak counts trailing wrongs per step and resets on correct/step_enter", () => {
    const { rows, rec } = harness();
    rec.onUiEvent({ t: "step_enter", stepId: "s1", kind: "build" });
    const wrong = { correct: false, attribution: "slip" } as never;
    const right = { correct: true, attribution: "correct" } as never;
    rec.onUiEvent({ t: "submission", stepId: "s1", diagnosis: wrong });
    rec.onUiEvent({ t: "submission", stepId: "s1", diagnosis: wrong });
    rec.onUiEvent({ t: "submission", stepId: "s1", diagnosis: right });
    rec.onUiEvent({ t: "submission", stepId: "s1", diagnosis: wrong });
    const streaks = rows.filter((r) => r.type === "submission").map((r) => (r.payload as Record<string, unknown>)["failStreak"]);
    expect(streaks).toEqual([1, 2, 0, 1]);
    // re-entering the step resets the streak
    rec.onUiEvent({ t: "step_enter", stepId: "s1", kind: "build" });
    rec.onUiEvent({ t: "submission", stepId: "s1", diagnosis: wrong });
    expect((rows.at(-1)!.payload as Record<string, unknown>)["failStreak"]).toBe(1);
  });

  it("submission payload: editor snapshot + editDistanceProxy across consecutive submissions + msSinceLastSubmission", () => {
    const { rows, rec, clock } = harness();
    const wrong = { correct: false, attribution: "slip" } as never;
    rec.onUiEvent({ t: "step_enter", stepId: "s1", kind: "build" });
    rec.onUiEvent({ t: "editor_change", stepId: "s1", length: 10, hash: hashText("0123456789") });
    rec.onUiEvent({ t: "submission", stepId: "s1", diagnosis: wrong });
    const p1 = rows.at(-1)!.payload as Record<string, unknown>;
    expect(p1["editLength"]).toBe(10);
    expect(p1["editHash"]).toBe(hashText("0123456789"));
    expect(p1["editDistanceProxy"]).toBeUndefined(); // first submission: no prior buffer
    expect(p1["msSinceLastSubmission"]).toBeUndefined();

    clock.tick(19_000);
    rec.onUiEvent({ t: "editor_change", stepId: "s1", length: 13, hash: hashText("0123456789abc") });
    rec.onUiEvent({ t: "submission", stepId: "s1", diagnosis: wrong });
    const p2 = rows.at(-1)!.payload as Record<string, unknown>;
    expect(p2["editDistanceProxy"]).toBe(3); // |13-10|, hashes differ
    expect(p2["msSinceLastSubmission"]).toBe(19_000);

    clock.tick(5_000);
    rec.onUiEvent({ t: "submission", stepId: "s1", diagnosis: wrong }); // no edit between
    const p3 = rows.at(-1)!.payload as Record<string, unknown>;
    expect(p3["editDistanceProxy"]).toBe(0); // same snapshot both sides → equal hash → 0
    expect(p3["msSinceLastSubmission"]).toBe(5_000);
  });

  it("never persists raw editor text and never persists the diagnosis signals blob (privacy §11.4)", () => {
    const { rows, rec } = harness();
    const SECRET = "print('SECRET_SOURCE_TEXT')";
    rec.onUiEvent({ t: "step_enter", stepId: "s1", kind: "build" });
    rec.onUiEvent({ t: "editor_change", stepId: "s1", length: SECRET.length, hash: hashText(SECRET) });
    rec.onUiEvent({
      t: "submission",
      stepId: "s1",
      diagnosis: {
        correct: false,
        attribution: "slip",
        signals: { ran: true, stdout: SECRET, wallMs: 1 },
      } as never,
    });
    const all = JSON.stringify(rows);
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain("SECRET_SOURCE_TEXT");
    expect(all).not.toContain("stdout");
  });

  it("emitInternal stamps idle/dwell rows through the same seq/ts pipeline", () => {
    const { rows, rec, clock } = harness();
    rec.onUiEvent({ t: "step_enter", stepId: "s1", kind: "build" });
    clock.tick(90_000);
    rec.emitInternal("idle", "s1", { durationMs: 90_000 });
    expect(rows.at(-1)!.type).toBe("idle");
    expect(rows.at(-1)!.payload).toEqual({ durationMs: 90_000 });
    expect(rows.map((r) => r.seq)).toEqual([0, 1]);
  });
});
