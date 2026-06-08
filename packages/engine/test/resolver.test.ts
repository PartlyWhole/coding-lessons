import { describe, it, expect } from "vitest";
import { resolveAvailability, meets, completed, whyLocked } from "../src/resolver.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { graph, model } from "./fixtures.js";

describe("meets", () => {
  it("is true iff the skill exists and mastery >= threshold", () => {
    const m = model({ "skill.var.assign": 0.6 });
    expect(meets(m, { skill: "skill.var.assign", minMastery: 0.6, kind: "track" })).toBe(true);
    expect(meets(m, { skill: "skill.var.assign", minMastery: 0.7, kind: "track" })).toBe(false);
    expect(meets(m, { skill: "skill.missing", minMastery: 0.1, kind: "track" })).toBe(false);
  });
});

describe("completed", () => {
  it("is true iff every taught skill is at/above completionThreshold", () => {
    const node = graph.nodes["node.random"]!;
    expect(completed(model({ "skill.random.randint": 0.8 }), node, DEFAULT_CONFIG)).toBe(true);
    expect(completed(model({ "skill.random.randint": 0.79 }), node, DEFAULT_CONFIG)).toBe(false);
    expect(completed(model({}), node, DEFAULT_CONFIG)).toBe(false);
  });
});

describe("resolveAvailability", () => {
  it("marks the spine root available with an empty learner model", () => {
    const status = resolveAvailability(model({}), graph);
    expect(status["node.output"]).toBe("available");
    expect(status["node.variables"]).toBe("locked");
    expect(status["node.random"]).toBe("locked");
  });

  it("marks a node done when its taught skills are mastered", () => {
    const status = resolveAvailability(
      model({ "skill.output.print_literal": 0.9, "skill.string.literal": 0.9 }),
      graph,
    );
    expect(status["node.output"]).toBe("done");
  });
});

describe("whyLocked", () => {
  it("returns the unmet requirements with kind and current mastery", () => {
    const m = model({ "skill.output.print_literal": 0.5 });
    const unmet = whyLocked(m, graph, "node.random");
    expect(unmet).toEqual([
      { skill: "skill.var.assign", minMastery: 0.6, kind: "track", mastery: 0 },
    ]);
  });
});
