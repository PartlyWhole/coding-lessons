import { describe, it, expect } from "vitest";
import { AST_QUERY_INTERPRETER, buildMatchProgram, MATCH_SENTINEL } from "../src/ast-query.js";

describe("ast-query Python source", () => {
  it("exports a non-trivial interpreter and a program builder", () => {
    expect(AST_QUERY_INTERPRETER).toContain("def query_matches");
    expect(AST_QUERY_INTERPRETER).toContain("def eval_tags");
    const prog = buildMatchProgram("def f():\n    return 1", [{ tag: "ret", query: { node: "Return" } }]);
    expect(prog).toContain(AST_QUERY_INTERPRETER);
    expect(prog).toContain("b64decode");
    expect(prog).toContain("__TRELLIS_TAGS__"); // the printable core of MATCH_SENTINEL
  });
  it("source contains no raw NUL byte (CPython rejects null bytes in source)", () => {
    expect(AST_QUERY_INTERPRETER.includes(String.fromCharCode(0))).toBe(false);
    const prog = buildMatchProgram("x = 1", [{ tag: "t", query: { node: "Assign" } }]);
    expect(prog.includes(String.fromCharCode(0))).toBe(false);
  });
});
