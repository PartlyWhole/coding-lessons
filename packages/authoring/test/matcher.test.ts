import { describe, it, expect } from "vitest";
import { parsePython } from "../src/ast/python.js";
import { buildParents } from "../src/ast/json-ast.js";
import { queryMatches, evalTags } from "../src/ast/matcher.js";

function q(code: string, query: unknown): boolean {
  const p = parsePython(code);
  if (p.syntaxError) throw new Error("unexpected syntax error");
  return queryMatches(query, p.ast, buildParents(p.ast));
}

describe("AstQuery interpreter (§6.3)", () => {
  it("matches a Call to print via `calls`", () => {
    expect(q("print('x')", { node: "Call", where: { calls: "print" } })).toBe(true);
    expect(q("input()", { node: "Call", where: { calls: "print" } })).toBe(false);
  });

  it("not: no print call (missing_print)", () => {
    expect(q("'x'", { not: { node: "Call", where: { calls: "print" } } })).toBe(true);
    expect(q("print('x')", { not: { node: "Call", where: { calls: "print" } } })).toBe(false);
  });

  it("childMatches matches any descendant (transitive)", () => {
    const query = { node: "Return", where: { childMatches: { node: "Constant", where: { attr: "value", eq: "Hello, World!" } } } };
    expect(q("def f():\n return 'Hello, World!'", query)).toBe(true);
    expect(q("def f():\n return 'bye'", query)).toBe(false);
  });

  it("within is satisfied by any ancestor (transitive)", () => {
    const query = { node: "Assign", within: { node: "While" } };
    expect(q("while True:\n  if 1:\n   x = 2", query)).toBe(true);
    expect(q("x = 2", query)).toBe(false);
  });

  it("Constant value equality (int/str/bool)", () => {
    expect(q("x = 7", { node: "Constant", where: { attr: "value", eq: 7 } })).toBe(true);
    expect(q("x = 8", { node: "Constant", where: { attr: "value", eq: 7 } })).toBe(false);
    expect(q("while True: pass", { node: "Constant", where: { attr: "value", eq: true } })).toBe(true);
  });

  it("all/any combinators (infinite_true_no_break style, via childMatches+not)", () => {
    const infinite = { all: [
      { node: "While", where: { childMatches: { node: "Constant", where: { attr: "value", eq: true } } } },
      { not: { node: "Break" } },
    ] };
    expect(q("while True:\n  print('x')", infinite)).toBe(true);
    expect(q("while True:\n  break", infinite)).toBe(false);
  });

  it("usesName finds an identifier anywhere", () => {
    expect(q("print(snacks)", { node: "Call", where: { usesName: "snacks" } })).toBe(true);
  });

  it("count over the matched set", () => {
    expect(q("if a: pass\nif b: pass", { node: "If", count: { op: ">=", n: 2 } })).toBe(true);
    expect(q("if a: pass", { node: "If", count: { op: ">=", n: 2 } })).toBe(false);
  });

  // §6.3 E-14 — Subscript + List. The authoring matcher carries NO node-type table
  // (it compares the query's `node` string against the real CPython `_type` directly),
  // so these prove the per-item lockstep on the authoring side: the same shapes the
  // harness/sandbox NODE_TYPES additions enable must match here identically.
  it("E-14: Subscript with field-scoped value/slice", () => {
    const query = {
      node: "Subscript",
      field: {
        value: { node: "Name", where: { attr: "id", eq: "answers" } },
        slice: { node: "Constant", where: { attr: "value", eq: 1 } },
      },
    };
    expect(q("print(answers[1])", query)).toBe(true);
    expect(q("print(answers[0])", query)).toBe(false);
    expect(q("print(other[1])", query)).toBe(false);
  });

  it("E-14: List with field-scoped elts (+ count over Subscript)", () => {
    const listQuery = {
      node: "List",
      field: { elts: { node: "Constant", where: { attr: "value", eq: "It is certain." } } },
    };
    expect(q('answers = ["It is certain.", "Very doubtful."]', listQuery)).toBe(true);
    expect(q("answers = [1, 2]", listQuery)).toBe(false);
    expect(q('answers = ("It is certain.",)', listQuery)).toBe(false);
    expect(q("a[0]\nb[1]", { node: "Subscript", count: { op: ">=", n: 2 } })).toBe(true);
    expect(q("a[0]", { node: "Subscript", count: { op: ">=", n: 2 } })).toBe(false);
  });

  it("evalTags returns matched tag names; null on syntax error", () => {
    const queries = [{ tag: "has_print", query: { node: "Call", where: { calls: "print" } } }];
    expect([...evalTags("print('x')", queries)!]).toEqual(["has_print"]);
    expect([...evalTags("'x'", queries)!]).toEqual([]);
    expect(evalTags("def f(:", queries)).toBeNull();
  });
});
