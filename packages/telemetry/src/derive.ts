// §11.2 SignalDeriver — PURE derived signals. No clock, no randomness, no I/O:
// same events in, same signals out (defining property; tested).
import type { BehavioralEvent } from "@trellis/schema";

/** The privacy-preserving editor-buffer fingerprint (E2 payload; §11.4 — never raw text). */
export interface EditorSnapshot {
  length: number;
  hash: string;
}

// D4 pinned proxy: exact edit distance is impossible under captureEditorText:false (by
// design — only length+hash exist). Equal hash → 0; else |Δlength|, a LOWER BOUND on the
// true edit distance (same-length rewrites floor to 0 — documented, deterministic).
export function editDistanceProxy(a: EditorSnapshot, b: EditorSnapshot): number {
  if (a.hash === b.hash) return 0;
  return Math.abs(a.length - b.length);
}

/** Consecutive trailing wrong submissions (oldest-first correctness list); resets on a correct. */
export function trailingFailStreak(correctness: readonly boolean[]): number {
  let n = 0;
  for (let i = correctness.length - 1; i >= 0 && correctness[i] === false; i--) n++;
  return n;
}

function payloadOf(e: BehavioralEvent): Record<string, unknown> {
  return typeof e.payload === "object" && e.payload !== null && !Array.isArray(e.payload)
    ? (e.payload as Record<string, unknown>)
    : {};
}

// §11.3 rule 1 evidence (predict→run correlation, D4): over a NEWEST-FIRST row list, the
// most recent outcome row (a correct submission or a run) directly follows — ignoring
// non-outcome rows — a wrong predict submission.
export function wrongPredictThenCorrect(rowsNewestFirst: readonly BehavioralEvent[]): boolean {
  const outcomes = rowsNewestFirst.filter((e) => e.type === "submission" || e.type === "run");
  const [latest, prior] = [outcomes[0], outcomes[1]];
  if (latest === undefined || prior === undefined) return false;
  const latestCorrect = latest.type === "run" || payloadOf(latest)["correct"] === true;
  if (!latestCorrect) return false;
  const p = payloadOf(prior);
  return prior.type === "submission" && p["stepKind"] === "predict" && p["correct"] === false;
}
