import { describe, it, expect } from "vitest";
import { parsePython } from "../src/ast/python.js";
import { buildParents } from "../src/ast/json-ast.js";
import { queryMatches } from "../src/ast/matcher.js";

function q(code: string, query: unknown): boolean {
  const p = parsePython(code);
  if (p.syntaxError) throw new Error("syntax");
  return queryMatches(query, p.ast, buildParents(p.ast));
}

describe("field selector (§6.3 pinned exact detectors)", () => {
  it("While.test is literally True (infinite_true_no_break, exact form)", () => {
    const test = { node: "While", field: { test: { node: "Constant", where: { attr: "value", eq: true } } } };
    expect(q("while True:\n  pass", test)).toBe(true);
    expect(q("x = 0\nwhile x < 3:\n  y = True", test)).toBe(false);
  });

  it("If with an elif (nested If in orelse) vs nested if in body (has_elif, exact form)", () => {
    const hasElif = { node: "If", field: { orelse: { node: "If" } } };
    expect(q("if a:\n  pass\nelif b:\n  pass", hasElif)).toBe(true);
    expect(q("if a:\n  if b:\n   pass", hasElif)).toBe(false);
  });
});
