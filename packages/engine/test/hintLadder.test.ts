import { describe, it, expect } from "vitest";
import type { Bundle, Diagnosis, Hint } from "@trellis/schema";
import {
  initialHintState,
  ladderKeyFor,
  ladderFor,
  syncLadder,
  pullHint,
  visibleHints,
  GENERIC_LADDERS,
  type HintState,
} from "../src/hintLadder.js";

// A minimal Diagnosis factory (only the fields the ladder reads).
function diag(attribution: Diagnosis["attribution"], misconceptionId?: string): Diagnosis {
  const d = {
    id: "d",
    learnerId: "L",
    stepId: "s",
    contentVersion: "v1",
    submittedAt: "2026-06-08T00:00:00.000Z",
    correct: attribution === "pass",
    attribution,
    signals: { ran: true, wallMs: 0 },
    skillDeltas: [],
    seed: 0,
  } as Diagnosis;
  if (misconceptionId !== undefined) d.misconceptionId = misconceptionId;
  return d;
}

const LADDER: Hint[] = [
  { level: 1, body: "nudge" },
  { level: 2, body: "sharper" },
  { level: 3, body: "worked example" },
  { level: 4, body: "Solution:", revealCode: "answer = 42" },
];

// A Bundle carrying just one misconception with the 4-level ladder above.
const bundle = {
  contentVersion: "v1",
  skills: {},
  nodes: {},
  cells: {},
  misconceptions: {
    "mis.x": { id: "mis.x", skill: "skill.x", title: "X", signature: { runError: "runtime" }, hintLadder: LADDER, feedback: "fb" },
  },
  producers: {},
  requirements: {},
} as unknown as Bundle;

describe("ladderKeyFor — §9.2 selection", () => {
  it("misconception → the misconception id", () => {
    expect(ladderKeyFor(diag("misconception", "mis.x"))).toBe("mis.x");
  });
  it("pass → empty key (no ladder)", () => {
    expect(ladderKeyFor(diag("pass"))).toBe("");
  });
  it("mismatch/syntax/runtime → attribution-keyed generic ladder", () => {
    expect(ladderKeyFor(diag("mismatch"))).toBe("generic:mismatch");
    expect(ladderKeyFor(diag("syntax"))).toBe("generic:syntax");
    expect(ladderKeyFor(diag("runtime"))).toBe("generic:runtime");
  });
  it("misconception with no id (defensive) falls back to generic", () => {
    expect(ladderKeyFor(diag("misconception"))).toBe("generic:misconception");
  });
});

describe("ladderFor — ladder data for a key", () => {
  it("misconception key → the authored ladder", () => {
    expect(ladderFor("mis.x", bundle)).toEqual(LADDER);
  });
  it("generic key → the engine default generic ladder for that attribution", () => {
    expect(ladderFor("generic:syntax", bundle)).toEqual(GENERIC_LADDERS.syntax);
    expect(ladderFor("generic:runtime", bundle)).toEqual(GENERIC_LADDERS.runtime);
    expect(ladderFor("generic:mismatch", bundle)).toEqual(GENERIC_LADDERS.mismatch);
  });
  it("empty key → empty ladder", () => {
    expect(ladderFor("", bundle)).toEqual([]);
  });
  it("unknown misconception id → empty ladder (referential integrity is the compiler's gate)", () => {
    expect(ladderFor("mis.absent", bundle)).toEqual([]);
  });
  it("every generic ladder has exactly levels 1..4 in order", () => {
    for (const k of ["syntax", "runtime", "mismatch"] as const) {
      expect(GENERIC_LADDERS[k].map((h) => h.level)).toEqual([1, 2, 3, 4]);
    }
  });
});

describe("syncLadder — reset-on-new-misconception + autoEscalate-on-repeat", () => {
  it("first diagnosis: sets the key, revealedThrough 0", () => {
    const s = syncLadder(initialHintState(), diag("misconception", "mis.x"));
    expect(s).toEqual({ ladderKey: "mis.x", revealedThrough: 0 });
  });
  it("changing misconception resets to the new ladder at level 0", () => {
    const prev: HintState = { ladderKey: "mis.x", revealedThrough: 3 };
    expect(syncLadder(prev, diag("misconception", "mis.y"))).toEqual({ ladderKey: "mis.y", revealedThrough: 0 });
  });
  it("same misconception, no autoEscalate: state unchanged", () => {
    const prev: HintState = { ladderKey: "mis.x", revealedThrough: 1 };
    expect(syncLadder(prev, diag("misconception", "mis.x"))).toEqual(prev);
  });
  it("same misconception + autoEscalate: bumps the floor by one (so level 1 isn't re-read)", () => {
    const prev: HintState = { ladderKey: "mis.x", revealedThrough: 1 };
    expect(syncLadder(prev, diag("misconception", "mis.x"), { autoEscalate: true })).toEqual({ ladderKey: "mis.x", revealedThrough: 2 });
  });
  it("autoEscalate never auto-reveals the solution (caps the floor at 3)", () => {
    const prev: HintState = { ladderKey: "mis.x", revealedThrough: 3 };
    expect(syncLadder(prev, diag("misconception", "mis.x"), { autoEscalate: true })).toEqual({ ladderKey: "mis.x", revealedThrough: 3 });
  });
  it("autoEscalate is a no-op before the first pull (floor stays 0)", () => {
    const prev: HintState = { ladderKey: "mis.x", revealedThrough: 0 };
    expect(syncLadder(prev, diag("misconception", "mis.x"), { autoEscalate: true })).toEqual({ ladderKey: "mis.x", revealedThrough: 0 });
  });
});

describe("pullHint — one level per press, level-4 behind a confirm", () => {
  it("each press reveals exactly one more level", () => {
    let s: HintState = { ladderKey: "mis.x", revealedThrough: 0 };
    s = pullHint(s, LADDER);
    expect(s.revealedThrough).toBe(1);
    s = pullHint(s, LADDER);
    expect(s.revealedThrough).toBe(2);
    s = pullHint(s, LADDER);
    expect(s.revealedThrough).toBe(3);
  });
  it("a plain pull stops at level 3 (level 4 needs a confirm)", () => {
    const s: HintState = { ladderKey: "mis.x", revealedThrough: 3 };
    expect(pullHint(s, LADDER).revealedThrough).toBe(3);
  });
  it("a confirmed pull from 3 reveals level 4", () => {
    const s: HintState = { ladderKey: "mis.x", revealedThrough: 3 };
    expect(pullHint(s, LADDER, { confirmRevealCode: true }).revealedThrough).toBe(4);
  });
  it("never exceeds the ladder length", () => {
    const short: Hint[] = [{ level: 1, body: "only one" }];
    const s: HintState = { ladderKey: "mis.x", revealedThrough: 1 };
    expect(pullHint(s, short, { confirmRevealCode: true }).revealedThrough).toBe(1);
  });
  it("a pull on an empty ladder is a no-op", () => {
    const s: HintState = { ladderKey: "", revealedThrough: 0 };
    expect(pullHint(s, []).revealedThrough).toBe(0);
  });
});

describe("visibleHints — levels 1..revealedThrough", () => {
  it("reveals the prefix of the ladder", () => {
    expect(visibleHints({ ladderKey: "mis.x", revealedThrough: 0 }, LADDER)).toEqual([]);
    expect(visibleHints({ ladderKey: "mis.x", revealedThrough: 2 }, LADDER)).toEqual([LADDER[0], LADDER[1]]);
    expect(visibleHints({ ladderKey: "mis.x", revealedThrough: 4 }, LADDER)).toEqual(LADDER);
  });
  it("level 4 (revealCode) is only visible at revealedThrough 4", () => {
    const v3 = visibleHints({ ladderKey: "mis.x", revealedThrough: 3 }, LADDER);
    expect(v3.some((h) => h.revealCode !== undefined)).toBe(false);
    const v4 = visibleHints({ ladderKey: "mis.x", revealedThrough: 4 }, LADDER);
    expect(v4.some((h) => h.revealCode !== undefined)).toBe(true);
  });
});

describe("determinism", () => {
  it("the same (state, ladder, opts) always yields byte-identical results", () => {
    const s: HintState = { ladderKey: "mis.x", revealedThrough: 1 };
    expect(JSON.stringify(pullHint(s, LADDER))).toBe(JSON.stringify(pullHint(s, LADDER)));
    expect(JSON.stringify(visibleHints(s, LADDER))).toBe(JSON.stringify(visibleHints(s, LADDER)));
  });
});
