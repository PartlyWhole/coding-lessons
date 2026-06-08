import { describe, it, expect } from "vitest";
import { spineOrder, nextSpineCell, availabilityDiff } from "../src/navigation.js";
import { resolveAvailability } from "../src/resolver.js";
import { graph, model } from "./fixtures.js";

describe("spineOrder", () => {
  it("topologically orders spine nodes by prerequisite depth (extensions excluded)", () => {
    expect(spineOrder(graph)).toEqual(["node.output", "node.variables"]);
  });
});

describe("nextSpineCell", () => {
  it("returns the first cell of the lowest-ordinal available, not-done spine node", () => {
    expect(nextSpineCell(model({}), graph)).toBe("cell.output.hello");
  });

  it("skips a done spine node and advances to the next available one", () => {
    const m = model({
      "skill.output.print_literal": 0.9,
      "skill.string.literal": 0.9,
    });
    expect(nextSpineCell(m, graph)).toBe("cell.variables.box");
  });

  it("returns null when no spine node is available", () => {
    const m = model({
      "skill.output.print_literal": 0.9,
      "skill.string.literal": 0.9,
      "skill.var.assign": 0.9,
      "skill.var.use": 0.9,
    });
    expect(nextSpineCell(m, graph)).toBeNull();
  });
});

describe("availabilityDiff", () => {
  it("reports nodes that flipped locked→available and *→done", () => {
    const before = resolveAvailability(
      model({ "skill.output.print_literal": 0.5 }),
      graph,
    );
    const after = resolveAvailability(
      model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.6 }),
      graph,
    );
    const diff = availabilityDiff(before, after);
    expect(diff.newlyAvailable).toContain("node.random");
    expect(diff.newlyDone).toEqual([]);
  });

  it("reports a node that transitioned to done in newlyDone", () => {
    const before = resolveAvailability(model({}), graph);
    // node.output teaches print_literal + string.literal; lift both above the 0.8
    // completion threshold so node.output flips to "done".
    const after = resolveAvailability(
      model({ "skill.output.print_literal": 0.9, "skill.string.literal": 0.9 }),
      graph,
    );
    const diff = availabilityDiff(before, after);
    expect(diff.newlyDone).toContain("node.output");
  });
});
