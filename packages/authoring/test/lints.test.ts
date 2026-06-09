import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { lintWhereCombinators } from "../src/lints/where-combinators.js";
import { lintSpineExtension } from "../src/lints/spine-extension.js";
import { lintRe2Patterns } from "../src/lints/re2-pattern.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("lint: §6.3 loud-reject combinators inside `where`", () => {
  it("passes on the corpus (no combinators in any where)", () => {
    expect(lintWhereCombinators(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });
  it("rejects a where containing not/all/any", () => {
    const loaded = {
      nodes: { n: { id: "n", title: "", track: "spine" as const, requires: [], teaches: [], cells: [
        { id: "c", title: "", certifies: [], steps: [{ id: "c#0", kind: "build" as const,
          evaluator: { ast: { queries: [{ tag: "bad", query: { node: "Call", where: { any: [{ calls: "print" }] } } }] } } }] }] } },
      skills: {}, miscons: {},
    };
    expect(lintWhereCombinators(loaded).some((i) => /where.*(not|all|any)/i.test(i.message))).toBe(true);
  });
});

describe("lint: spine never requires an extension-only skill", () => {
  it("finds ZERO violations on the current corpus (conditionals re-theme landed)", () => {
    expect(lintSpineExtension(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });
  it("flags a spine node requiring a skill only an extension teaches", () => {
    const loaded = {
      nodes: {
        ext: { id: "ext", title: "", track: "extension" as const, requires: [{ skill: "base", minMastery: 0.6, kind: "track" as const }], teaches: ["extOnly"], cells: [] },
        spine: { id: "spine", title: "", track: "spine" as const, requires: [{ skill: "extOnly", minMastery: 0.5, kind: "prerequisite" as const }], teaches: ["base"], cells: [] },
      },
      skills: {}, miscons: {},
    };
    expect(lintSpineExtension(loaded).some((i) => /spine.*requires.*extension/i.test(i.message))).toBe(true);
  });
});

describe("lint: RE2 pattern safety", () => {
  it("passes on the corpus (no AcceptedAnswer.patterns present)", () => {
    expect(lintRe2Patterns(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });
  it("rejects backreferences and lookarounds (RE2-incompatible)", () => {
    const loaded = {
      nodes: { n: { id: "n", title: "", track: "spine" as const, requires: [], teaches: [], cells: [
        { id: "c", title: "", certifies: [], steps: [{ id: "c#0", kind: "recall" as const,
          accepted: { patterns: ["(a)\\1", "(?=x)y"] } }] }] } },
      skills: {}, miscons: {},
    };
    const errs = lintRe2Patterns(loaded).filter((i) => i.level === "error");
    expect(errs.length).toBe(2);
  });
});
