import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { buildProducers, buildRequirements } from "../src/indexes.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("derived indexes", () => {
  const loaded = loadContent(CONTENT);

  it("producers map each taught skill to the nodes that teach it (sorted, deterministic)", () => {
    const producers = buildProducers(loaded);
    expect(producers["skill.random.randint"]).toEqual(["node.random"]);
    for (const n of Object.values(loaded.nodes)) {
      for (const sk of n.teaches ?? []) {
        expect(producers[sk]!.length).toBeGreaterThan(0);
      }
    }
  });

  it("requirements mirror each node's requires, deduped by skill (max minMastery)", () => {
    const reqs = buildRequirements(loaded);
    expect(reqs["node.random"]).toEqual([
      { skill: "skill.var.assign", minMastery: 0.6, kind: "track" },
      { skill: "skill.output.print_literal", minMastery: 0.5, kind: "utility" },
    ]);
    expect(reqs["node.output"]).toEqual([]);
  });

  it("dedupes a duplicated skill keeping the strictest threshold", () => {
    const fake = {
      nodes: {
        n: { id: "n", title: "", track: "spine" as const, requires: [
          { skill: "s", minMastery: 0.5, kind: "utility" as const },
          { skill: "s", minMastery: 0.7, kind: "prerequisite" as const },
        ], teaches: [], cells: [] },
      },
      skills: {},
      miscons: {},
    };
    expect(buildRequirements(fake)).toEqual({ n: [{ skill: "s", minMastery: 0.7, kind: "prerequisite" }] });
  });
});
