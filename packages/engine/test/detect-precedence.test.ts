import { describe, it, expect } from "vitest";
import type { Bundle, RawSignals, Step, Signature } from "@trellis/schema";
import { detect, matchedSpecificity, type DetectContext } from "../src/detect.js";

// Build a tiny bundle: one skill carrying two misconceptions whose signatures we control.
function bundleWith(sigs: Record<string, Signature>): Bundle {
  const misconceptions: Record<string, unknown> = {};
  for (const [id, signature] of Object.entries(sigs)) {
    misconceptions[id] = { id, skill: "skill.loop", title: id, signature, hintLadder: [], feedback: "" };
  }
  return {
    contentVersion: "v1",
    skills: { "skill.loop": { id: "skill.loop", title: "loop", description: "", misconceptions: Object.keys(sigs), upstream: [] } },
    nodes: {},
    cells: {},
    misconceptions,
    producers: {},
    requirements: {},
  } as unknown as Bundle;
}

const step = { id: "s", kind: "build", skills: ["skill.loop"] } as unknown as Step;

// The post-re-key infinite_true signature (timedOut OR astTag OR choice) and no_update (astTag OR choice).
const REKEYED = {
  "mis.loop.infinite_true": { any: [{ timedOut: true }, { astTag: "infinite_true_no_break" }, { choice: "b" }] },
  "mis.loop.no_update": { any: [{ astTag: "while_cond_no_update" }, { choice: "b" }] },
} as Record<string, Signature>;

describe("matchedSpecificity — rank by the branch that actually fired", () => {
  it("an `any` with only its timedOut branch matching ranks at the timedOut leaf (2)", () => {
    const ctx: DetectContext = { signals: { ran: false, wallMs: 0, timedOut: true } };
    expect(matchedSpecificity(REKEYED["mis.loop.infinite_true"]!, ctx)).toBe(2);
  });
  it("an `any` whose astTag branch fires ranks at the astTag leaf (0)", () => {
    const ctx: DetectContext = { signals: { ran: false, wallMs: 0, timedOut: true, astTags: ["infinite_true_no_break"] } };
    expect(matchedSpecificity(REKEYED["mis.loop.infinite_true"]!, ctx)).toBe(0);
  });
  it("a non-matching signature ranks at Infinity", () => {
    const ctx: DetectContext = { signals: { ran: true, wallMs: 0 } };
    expect(matchedSpecificity(REKEYED["mis.loop.no_update"]!, ctx)).toBe(Infinity);
  });
  it("an `all` ranks at its most-specific member (astTag 0 over timedOut 2)", () => {
    const sig: Signature = { all: [{ astTag: "t" }, { timedOut: true }] };
    const ctx: DetectContext = { signals: { ran: false, wallMs: 0, timedOut: true, astTags: ["t"] } };
    expect(matchedSpecificity(sig, ctx)).toBe(0);
  });
  it("a matched `not` ranks at the STATIC specificity of what it negates (not recursive)", () => {
    // `not: {astTag:t}` is TRUE when astTag t did NOT fire; its rank is the static rank
    // of the negated astTag leaf (0), never Infinity.
    const sig: Signature = { not: { astTag: "t" } };
    const ctx: DetectContext = { signals: { ran: true, wallMs: 0 } }; // t absent → not matches
    expect(matchedSpecificity(sig, ctx)).toBe(0);
  });
});

describe("detect — timedOut disambiguation across infinite-loop misconceptions", () => {
  const bundle = bundleWith(REKEYED);

  it("never-updating `while cond:` timeout → no_update (its astTag fired; infinite_true only timed out)", () => {
    const signals: RawSignals = { ran: false, wallMs: 1000, timedOut: true, astTags: ["while_cond_no_update"] };
    expect(detect(step, { signals }, bundle)).toBe("mis.loop.no_update");
  });

  it("true `while True:` no-break timeout → infinite_true (its structural astTag fired)", () => {
    const signals: RawSignals = {
      ran: false, wallMs: 1000, timedOut: true,
      astTags: ["infinite_true_no_break", "while_cond_no_update"],
    };
    expect(detect(step, { signals }, bundle)).toBe("mis.loop.infinite_true");
  });

  it("a bare timeout with no astTags → infinite_true is the only candidate that fires", () => {
    const signals: RawSignals = { ran: false, wallMs: 1000, timedOut: true };
    expect(detect(step, { signals }, bundle)).toBe("mis.loop.infinite_true");
  });
});

describe("detect — backward compatibility (no timedOut branches present)", () => {
  it("two astTag candidates still tie-break by id", () => {
    const bundle = bundleWith({
      "mis.b": { astTag: "t" },
      "mis.a": { astTag: "t" },
    } as Record<string, Signature>);
    const signals: RawSignals = { ran: true, wallMs: 0, astTags: ["t"] };
    expect(detect(step, { signals }, bundle)).toBe("mis.a");
  });
  it("an astTag candidate beats a runError candidate (specificity 0 < 2)", () => {
    const bundle = bundleWith({
      "mis.structural": { astTag: "t" },
      "mis.generic": { runError: "runtime" },
    } as Record<string, Signature>);
    const signals: RawSignals = { ran: false, wallMs: 0, astTags: ["t"], runError: { type: "runtime", message: "x" } };
    expect(detect(step, { signals }, bundle)).toBe("mis.structural");
  });
});
