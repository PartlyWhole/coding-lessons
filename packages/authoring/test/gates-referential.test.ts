import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateReferential } from "../src/gates/referential.js";
import type { Loaded } from "../src/raw-types.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 2: referential integrity", () => {
  it("passes on the real corpus", () => {
    expect(gateReferential(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });

  it("flags a dangling required skill (no producer)", () => {
    const loaded: Loaded = {
      nodes: { n: { id: "n", title: "", track: "spine", requires: [{ skill: "ghost", minMastery: 0.5, kind: "prerequisite" }], teaches: [], cells: [] } },
      skills: {}, miscons: {},
    };
    expect(gateReferential(loaded).some((i) => /requires ghost which NO node teaches/.test(i.message))).toBe(true);
  });

  it("flags an extension without exactly one track edge", () => {
    const loaded: Loaded = {
      nodes: { ext: { id: "ext", title: "", track: "extension", requires: [], teaches: [], cells: [] } },
      skills: {}, miscons: {},
    };
    expect(gateReferential(loaded).some((i) => /exactly 1 track edge/.test(i.message))).toBe(true);
  });

  it("flags certifies not in teaches", () => {
    const loaded: Loaded = {
      nodes: { n: { id: "n", title: "", track: "spine", requires: [], teaches: ["a"], cells: [
        { id: "c", title: "", certifies: ["b"], steps: [] }] } },
      skills: { a: { id: "a", title: "", description: "" } }, miscons: {},
    };
    expect(gateReferential(loaded).some((i) => /certifies b not in n.teaches/.test(i.message))).toBe(true);
  });
});
