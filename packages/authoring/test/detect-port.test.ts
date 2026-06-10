// E-16: rank parity of the authoring detect-winner port with engine detect.ts (the test
// shapes mirror packages/engine/test/detect-precedence.test.ts) and harness.py.
import { describe, it, expect } from "vitest";
import { staticRank, matchedSpecificity, detectWinner } from "../src/detect.js";
import type { Loaded, RawMiscon, RawStep } from "../src/raw-types.js";
import type { Signals } from "../src/signature.js";

function mkLoaded(miscons: Record<string, RawMiscon>): Loaded {
  const bySkill: Record<string, RawMiscon[]> = {};
  for (const m of Object.values(miscons)) (bySkill[m.skill] ??= []).push(m);
  return {
    nodes: {},
    skills: Object.fromEntries(
      Object.entries(bySkill).map(([sid, ms]) => [
        sid,
        { id: sid, title: "", description: "", misconceptions: ms },
      ]),
    ),
    miscons,
  };
}

function mis(id: string, skill: string, signature: unknown): RawMiscon {
  return { id, skill, title: "", signature: signature as RawMiscon["signature"], hintLadder: [], feedback: "" };
}

const step = { id: "s#1", kind: "build", skills: ["sk"] } as unknown as RawStep;

describe("E-16 detect port: specificity ranks (engine detect.ts parity)", () => {
  it("staticRank: structural 0, behavioral 1, generic 2, composites take min, not passes through", () => {
    expect(staticRank({ astTag: "t" })).toBe(0);
    expect(staticRank({ choice: "b" })).toBe(0);
    expect(staticRank({ recallEquals: "x" })).toBe(0);
    expect(staticRank({ testFailure: {} })).toBe(1);
    expect(staticRank({ propertyFailed: true })).toBe(1);
    expect(staticRank({ runError: "runtime" })).toBe(2);
    expect(staticRank({ timedOut: true })).toBe(2);
    expect(staticRank({ all: [{ runError: "runtime" }, { astTag: "t" }] })).toBe(0);
    expect(staticRank({ any: [{ timedOut: true }, { testFailure: {} }] })).toBe(1);
    expect(staticRank({ not: { astTag: "t" } })).toBe(0);
    expect(staticRank({ all: [] })).toBe(3);
    expect(staticRank({ any: [] })).toBe(3);
  });

  it("matchedSpecificity: Infinity when unmatched; `any` ranks by the branch that FIRED", () => {
    const sig = { any: [{ astTag: "t" }, { timedOut: true }] };
    // matched only via the timedOut branch -> rank 2, NOT the static 0
    expect(matchedSpecificity(sig, { timedOut: true, astTags: new Set() })).toBe(2);
    // matched via the structural branch -> 0
    expect(matchedSpecificity(sig, { astTags: new Set(["t"]) })).toBe(0);
    expect(matchedSpecificity({ astTag: "t" }, { astTags: new Set() })).toBe(Infinity);
  });

  it("matchedSpecificity of a matched `not` is the STATIC rank of the negated signature", () => {
    // signals where {not: {astTag: t}} matches (tag absent): rank = staticRank({astTag}) = 0
    expect(matchedSpecificity({ not: { astTag: "t" } }, { astTags: new Set() })).toBe(0);
    expect(matchedSpecificity({ not: { runError: "runtime" } }, { runError: null })).toBe(2);
  });

  it("detectWinner: structural no_update outranks the bare-timeout branch (the §5 timedOut re-key shape)", () => {
    const loaded = mkLoaded({
      "mis.loop.infinite_true": mis("mis.loop.infinite_true", "sk", {
        any: [{ timedOut: true }, { astTag: "infinite_true_no_break" }, { choice: "b" }],
      }),
      "mis.loop.no_update": mis("mis.loop.no_update", "sk", {
        any: [{ astTag: "while_cond_no_update" }, { choice: "b" }],
      }),
    });
    const signals: Signals = { timedOut: true, astTags: new Set(["while_cond_no_update"]) };
    expect(detectWinner(loaded, step, signals)).toBe("mis.loop.no_update");
    // without the structural tag, the timeout branch wins by being the only match
    expect(detectWinner(loaded, step, { timedOut: true, astTags: new Set() })).toBe(
      "mis.loop.infinite_true",
    );
  });

  it("detectWinner: equal matched + static rank falls to stable id order (harness sorted-key parity)", () => {
    const loaded = mkLoaded({
      "mis.b": mis("mis.b", "sk", { astTag: "x" }),
      "mis.a": mis("mis.a", "sk", { astTag: "y" }),
    });
    expect(detectWinner(loaded, step, { astTags: new Set(["x", "y"]) })).toBe("mis.a");
  });

  it("detectWinner: null when no candidate matches; candidates only from the step's skills", () => {
    const loaded = mkLoaded({
      "mis.other": mis("mis.other", "other.skill", { astTag: "x" }),
    });
    expect(detectWinner(loaded, step, { astTags: new Set(["x"]) })).toBeNull();
  });
});
