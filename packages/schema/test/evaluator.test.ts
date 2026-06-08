import { describe, it, expect } from "vitest";
import { validate } from "../src/validate.js";
import { EvaluatorConfig, AstQuery, GenSpec } from "../src/evaluator.js";

describe("AstQuery", () => {
  it("accepts a nested structural query (the §13.1 implicit_coerce example)", () => {
    const q = {
      node: "BinOp",
      where: {
        childMatches: {
          node: "Constant",
          where: { attr: "value", eq: 7 },
        },
      },
    };
    expect(validate(AstQuery, q).ok).toBe(true);
  });

  it("accepts boolean combinators", () => {
    const q = { all: [{ node: "For" }, { not: { node: "Call", where: { calls: "$self" } } }] };
    expect(validate(AstQuery, q).ok).toBe(true);
  });

  it("accepts a field-scoped query (the pinned §6.3 field selector)", () => {
    const q = { node: "While", field: { test: { node: "Constant", where: { attr: "value", eq: true } } } };
    expect(validate(AstQuery, q).ok).toBe(true);
  });

  it("rejects an invalid count operator (closed union)", () => {
    expect(validate(AstQuery, { node: "For", count: { op: "<", n: 2 } }).ok).toBe(false);
  });

  it("rejects a non-integer count.n", () => {
    expect(validate(AstQuery, { node: "For", count: { op: "=", n: 1.5 } }).ok).toBe(false);
  });
});

describe("GenSpec", () => {
  it("rejects an unknown generator type (closed union)", () => {
    expect(validate(GenSpec, { param: "x", type: "dict" }).ok).toBe(false);
  });
});

describe("EvaluatorConfig", () => {
  it("accepts the §13.1 string-concat build evaluator", () => {
    const cfg = {
      run: { timeoutMs: 2000, memoryMb: 256 },
      tests: { cases: [{ input: null, expected: "age: 7\n" }] },
      ast: {
        queries: [
          { tag: "implicit_coerce", query: { node: "BinOp" } },
        ],
      },
      property: {
        referenceImpl: "def sol(age): return f'age: {age}'",
        generators: [{ param: "age", type: "int", min: 0, max: 999 }],
        numCases: 50,
        seed: 1234,
      },
    };
    expect(validate(EvaluatorConfig, cfg).ok).toBe(true);
  });

  it("rejects a config missing the required run block", () => {
    const result = validate(EvaluatorConfig, { tests: { cases: [] } });
    expect(result.ok).toBe(false);
  });
});
