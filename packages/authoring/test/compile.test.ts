import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Value } from "@sinclair/typebox/value";
import { Bundle } from "@trellis/schema";
import { loadContent } from "../src/load.js";
import { compile } from "../src/compile.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("compile", () => {
  const loaded = loadContent(CONTENT);
  const bundle = compile(loaded);

  // KNOWN-ISSUE PIN (see ESCALATION: @trellis/schema GenSpec requires `param` on nested `elem`,
  // but cell.loops.guessing_game#5 in loops.yaml correctly omits it). The transform is otherwise
  // fully schema-clean. TypeBox collapses the nested generator/elem failure to the enclosing
  // union path, so the single error surfaces at the step boundary
  // `/cells/cell.loops.guessing_game/steps/4` (step #5 is index 4). After the schema fix lands on
  // main and we rebase, change this to assert `Value.Check(Bundle, bundle)` is true (zero errors).
  it("emits a bundle that is schema-valid except the one escalated GenSpec.elem.param defect", () => {
    const errors = [...Value.Errors(Bundle, bundle)];
    // exactly one error, confined to the single known step — nothing else is wrong anywhere.
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("/cells/cell.loops.guessing_game/steps/4");
  });

  it("flattens misconceptions and rewrites Skill.misconceptions to an id-list", () => {
    expect(Object.keys(bundle.misconceptions)).toHaveLength(21);
    const skill = bundle.skills["skill.output.print_literal"]!;
    expect(skill.misconceptions).toContain("mis.print.no_call");
    expect(typeof skill.misconceptions[0]).toBe("string");
    expect(Array.isArray(skill.upstream)).toBe(true);
  });

  it("strips source-only misconception fields", () => {
    const m = bundle.misconceptions["mis.loop.infinite_true"]! as Record<string, unknown>;
    expect(m["triggers"]).toBeUndefined();
    expect(m["notTriggers"]).toBeUndefined();
    expect(m["_skill"]).toBeUndefined();
    expect(m["_file"]).toBeUndefined();
  });

  it("flattens cells, rewrites Node.cells to an id-list, and injects nodeId", () => {
    const node = bundle.nodes["node.output"]!;
    expect(node.cells.every((c) => typeof c === "string")).toBe(true);
    const firstCellId = node.cells[0]!;
    expect(bundle.cells[firstCellId]!.nodeId).toBe("node.output");
  });

  it("includes derived indexes and a content-addressed version", () => {
    expect(bundle.producers["skill.random.randint"]).toEqual(["node.random"]);
    expect(bundle.requirements["node.output"]).toEqual([]);
    expect(bundle.contentVersion).toMatch(/^ca-[0-9a-f]{16}$/);
  });

  it("is deterministic (same input -> same contentVersion)", () => {
    expect(compile(loadContent(CONTENT)).contentVersion).toBe(bundle.contentVersion);
  });
});
