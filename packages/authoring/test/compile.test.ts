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

  // The emitted bundle is fully schema-valid (the former GenSpec.elem.param defect was resolved on
  // main via the paramless ElemSpec split, fec6b8f, and rebased in).
  it("emits a Bundle that passes Value.Check with zero errors", () => {
    expect([...Value.Errors(Bundle, bundle)]).toEqual([]);
    expect(Value.Check(Bundle, bundle)).toBe(true);
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
