import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateDag } from "../src/gates/dag.js";
import type { Loaded } from "../src/raw-types.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 3: DAG + spine connectivity", () => {
  it("passes on the real corpus (acyclic, spine connected)", () => {
    expect(gateDag(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });

  it("reports a node cycle with the offending path", () => {
    const loaded: Loaded = {
      nodes: {
        a: { id: "a", title: "", track: "spine", requires: [{ skill: "sb", minMastery: 0.5, kind: "prerequisite" }], teaches: ["sa"], cells: [] },
        b: { id: "b", title: "", track: "spine", requires: [{ skill: "sa", minMastery: 0.5, kind: "prerequisite" }], teaches: ["sb"], cells: [] },
      },
      skills: { sa: { id: "sa", title: "", description: "" }, sb: { id: "sb", title: "", description: "" } },
      miscons: {},
    };
    expect(gateDag(loaded).filter((i) => i.level === "error").some((i) => /CYCLE:/.test(i.message))).toBe(true);
  });

  it("reports an upstream skill cycle", () => {
    const loaded: Loaded = {
      nodes: {},
      skills: {
        x: { id: "x", title: "", description: "", upstream: ["y"] },
        y: { id: "y", title: "", description: "", upstream: ["x"] },
      },
      miscons: {},
    };
    expect(gateDag(loaded).some((i) => /UPSTREAM CYCLE/.test(i.message))).toBe(true);
  });

  it("reports an unreachable / multi-root spine", () => {
    const loaded: Loaded = {
      nodes: {
        root: { id: "root", title: "", track: "spine", requires: [], teaches: ["s0"], cells: [] },
        island: { id: "island", title: "", track: "spine", requires: [], teaches: ["s1"], cells: [] },
      },
      skills: { s0: { id: "s0", title: "", description: "" }, s1: { id: "s1", title: "", description: "" } },
      miscons: {},
    };
    expect(gateDag(loaded).some((i) => /spine/.test(i.message))).toBe(true);
  });
});
