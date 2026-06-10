import { describe, it, expect } from "vitest";
import { validate } from "../src/validate.js";
import { EvaluatorConfig, AstQuery, GenSpec, GraphicalConfig } from "../src/evaluator.js";

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

  it("accepts a top-level list generator whose elem omits param (§6.4: param binds an entrypoint arg; an element has none — the loops guessing-game case)", () => {
    const g = {
      param: "guesses",
      type: "list",
      min: 1,
      max: 8,
      elem: { type: "choice", choices: [1, 25, 50, 75, 82, 90, 99, 100] },
    };
    expect(validate(GenSpec, g).ok).toBe(true);
  });

  it("still requires param on a top-level generator (the element-only relaxation must not loosen the root)", () => {
    expect(validate(GenSpec, { type: "int", min: 0, max: 9 }).ok).toBe(false);
  });

  it("accepts a nested list-of-lists element generator (ElemSpec stays recursive)", () => {
    const g = {
      param: "matrix",
      type: "list",
      elem: { type: "list", elem: { type: "int", min: 0, max: 9 } },
    };
    expect(validate(GenSpec, g).ok).toBe(true);
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

describe("GraphicalConfig (§17.4)", () => {
  const minimal = {
    entrypoints: { update: "update" },
    inputTape: [{}, { keysDown: ["K_LEFT"] }, { mouse: { x: 10, y: 20, buttons: 1 } }],
    dt: 1 / 60,
    frames: 120,
  };

  it("accepts the minimal block (update only; empty + keys + mouse frames)", () => {
    expect(validate(GraphicalConfig, minimal).ok).toBe(true);
  });

  it("accepts full entrypoints {init, update, probe} and an empty tape", () => {
    const g = { ...minimal, entrypoints: { init: "make_state", update: "update", probe: "probe" }, inputTape: [] };
    expect(validate(GraphicalConfig, g).ok).toBe(true);
  });

  it("rejects a block without entrypoints.update (the one mandatory entrypoint)", () => {
    const g = { ...minimal, entrypoints: { init: "make_state" } };
    expect(validate(GraphicalConfig, g).ok).toBe(false);
  });

  it("rejects dt: 0 — the fixed timestep must be strictly positive", () => {
    expect(validate(GraphicalConfig, { ...minimal, dt: 0 }).ok).toBe(false);
  });

  it("rejects frames: 0 and non-integer frames", () => {
    expect(validate(GraphicalConfig, { ...minimal, frames: 0 }).ok).toBe(false);
    expect(validate(GraphicalConfig, { ...minimal, frames: 1.5 }).ok).toBe(false);
  });

  it("rejects a mouse frame missing buttons (closed mouse shape)", () => {
    const g = { ...minimal, inputTape: [{ mouse: { x: 1, y: 2 } }] };
    expect(validate(GraphicalConfig, g).ok).toBe(false);
  });

  it("EvaluatorConfig accepts an optional graphical block (additive seam)", () => {
    const cfg = { run: { timeoutMs: 2000, memoryMb: 256, entrypoint: "__trellis_sim" }, graphical: minimal };
    expect(validate(EvaluatorConfig, cfg).ok).toBe(true);
  });

  it("EvaluatorConfig without graphical still validates (frozen corpus untouched)", () => {
    const cfg = { run: { timeoutMs: 2000, memoryMb: 256 } };
    expect(validate(EvaluatorConfig, cfg).ok).toBe(true);
  });
});
