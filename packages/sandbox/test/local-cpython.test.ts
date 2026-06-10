import { describe, it, expect } from "vitest";
import { createLocalSandbox } from "../src/local-cpython.js";

const sb = createLocalSandbox();

describe("createLocalSandbox.run", () => {
  it("runs a top-level program and captures stdout", async () => {
    const r = await sb.run({ code: "print('hello')", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(true);
    expect(r.stdout).toBe("hello\n");
    expect(r.error).toBeUndefined();
  });
  it("classifies a syntax error (ran=false, type=syntax)", async () => {
    const r = await sb.run({ code: "def f(:\n    pass", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(false);
    expect(r.error?.type).toBe("syntax");
  });
  it("classifies a runtime error (ran=true, type=runtime)", async () => {
    const r = await sb.run({ code: "print(undefined_name)", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(true);
    expect(r.error?.type).toBe("runtime");
  });
  it("feeds stdin to a program", async () => {
    const r = await sb.run({ code: "print('Hi ' + input() + '!')", stdin: "Alan\n", timeoutMs: 5000, memoryMb: 256 });
    expect(r.stdout).toBe("Hi Alan!\n");
  });
  it("calls an entrypoint() with no args and returns its value", async () => {
    const r = await sb.run({ code: "def main():\n    return 7", entrypoint: "main", timeoutMs: 5000, memoryMb: 256 });
    expect(r.returnValue).toBe(7);
  });
  it("times out a non-terminating program", async () => {
    const r = await sb.run({ code: "while True:\n    pass", timeoutMs: 1000, memoryMb: 256 });
    expect(r.timedOut).toBe(true);
    expect(r.ran).toBe(false);
  });
  it("wallMs is deterministic (0), so Diagnoses stay reproducible", async () => {
    const a = await sb.run({ code: "print('x')", timeoutMs: 5000, memoryMb: 256 });
    const b = await sb.run({ code: "print('x')", timeoutMs: 5000, memoryMb: 256 });
    expect(a.wallMs).toBe(b.wallMs);
  });
});

describe("RUN_HARNESS js-FFI hardening (twin semantics — identical harness runs in Pyodide)", () => {
  const BLOCK_MSG = "is not available in the Trellis sandbox";
  it("blocks `import js` with a clean ImportError", async () => {
    const r = await sb.run({ code: "import js\nprint(type(js))", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(true); // normal Python error path, not a crash
    expect(r.error?.type).toBe("runtime");
    expect(r.error?.message).toContain("ImportError");
    expect(r.error?.message).toContain(BLOCK_MSG);
  });
  it("blocks `import pyodide_js`", async () => {
    const r = await sb.run({ code: "import pyodide_js", timeoutMs: 5000, memoryMb: 256 });
    expect(r.error?.type).toBe("runtime");
    expect(r.error?.message).toContain(BLOCK_MSG);
  });
  it("blocks `import pyodide` (pyodide.code.run_js would be a JS escape)", async () => {
    const r = await sb.run({ code: "import pyodide.code", timeoutMs: 5000, memoryMb: 256 });
    expect(r.error?.type).toBe("runtime");
    expect(r.error?.message).toContain(BLOCK_MSG);
  });
  it("blocks `from js import fetch` and js submodules", async () => {
    const a = await sb.run({ code: "from js import fetch", timeoutMs: 5000, memoryMb: 256 });
    const b = await sb.run({ code: "import js.something", timeoutMs: 5000, memoryMb: 256 });
    expect(a.error?.message).toContain(BLOCK_MSG);
    expect(b.error?.message).toContain(BLOCK_MSG);
  });
  it("reports the blocked import at the right line", async () => {
    const r = await sb.run({ code: "x = 1\nimport js", timeoutMs: 5000, memoryMb: 256 });
    expect(r.error?.line).toBe(2);
  });
  it("normal stdlib imports still work (math, ast, json)", async () => {
    const r = await sb.run({
      code: "import math, ast, json\nprint(math.floor(2.5), len(ast.parse('x=1').body), json.dumps([1]))",
      timeoutMs: 5000,
      memoryMb: 256,
    });
    expect(r.ran).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.stdout).toBe("2 1 [1]\n");
  });
  it("a blocked-import run does not poison the next run (restore holds)", async () => {
    const bad = await sb.run({ code: "import js", timeoutMs: 5000, memoryMb: 256 });
    const ok = await sb.run({ code: "print('healthy')", timeoutMs: 5000, memoryMb: 256 });
    expect(bad.error?.message).toContain(BLOCK_MSG);
    expect(ok.ran).toBe(true);
    expect(ok.stdout).toBe("healthy\n");
    expect(ok.error).toBeUndefined();
  });
  it("blocking is armed only around learner code: harness imports (io/sys/json) unaffected", async () => {
    // entrypoint return value is marshalled with json AFTER the learner code ran —
    // proves the harness's own machinery still works post-block/post-restore.
    const r = await sb.run({
      code: "def main():\n    return 'ok'",
      entrypoint: "main",
      timeoutMs: 5000,
      memoryMb: 256,
    });
    expect(r.returnValue).toBe("ok");
  });
});

describe("createLocalSandbox.parseAndMatch", () => {
  it("matches a field-scoped elif (has_elif) but NOT a nested-if-in-body", async () => {
    const q = [{ tag: "has_elif", query: { node: "If", field: { orelse: { node: "If" } } } }];
    const elif = "def g(s):\n    if s >= 90:\n        return 'A'\n    elif s >= 80:\n        return 'B'\n    else:\n        return 'C'";
    const nestedIf = "def g(s):\n    if s >= 90:\n        if s >= 95:\n            return 'A'\n    return 'C'";
    expect(await sb.parseAndMatch(elif, q)).toContain("has_elif");
    expect(await sb.parseAndMatch(nestedIf, q)).not.toContain("has_elif");
  });
  it("returns [] on a syntax error", async () => {
    const q = [{ tag: "t", query: { node: "Return" } }];
    expect(await sb.parseAndMatch("def f(:", q)).toEqual([]);
  });
  // §17.5 guard 1 — the await-less-loop pre-check needs `Await` as a queryable node
  // type (additive NODE_TYPES entry; mutation golden in both directions).
  it("matches Await as a node type (M6.5 pre-check dependency)", async () => {
    const q = [
      {
        tag: "awaitless_loop",
        query: { node: "While", where: { not: { childMatches: { node: "Await" } } } },
      },
    ] as unknown as Parameters<typeof sb.parseAndMatch>[1];
    const yielding =
      "import asyncio\nasync def main():\n    while True:\n        await asyncio.sleep(1/60)\n";
    const hot = "while True:\n    x = 1\n";
    expect(await sb.parseAndMatch(yielding, q)).not.toContain("awaitless_loop");
    expect(await sb.parseAndMatch(hot, q)).toContain("awaitless_loop");
  });

  // §6.3 E-14 — `Subscript` + `List` as queryable node types (additive NODE_TYPES
  // entries, lockstep with content/verify/harness.py NODE_TYPES). Field selectors must
  // work on the real `ast` fields: Subscript.value / Subscript.slice, List.elts.
  it("matches Subscript with field-scoped value/slice (E-14)", async () => {
    const q = [
      {
        tag: "index_is_one",
        query: {
          node: "Subscript",
          field: {
            value: { node: "Name", where: { attr: "id", eq: "answers" } },
            slice: { node: "Constant", where: { attr: "value", eq: 1 } },
          },
        },
      },
    ] as unknown as Parameters<typeof sb.parseAndMatch>[1];
    expect(await sb.parseAndMatch("print(answers[1])", q)).toContain("index_is_one");
    expect(await sb.parseAndMatch("print(answers[0])", q)).not.toContain("index_is_one");
    expect(await sb.parseAndMatch("print(other[1])", q)).not.toContain("index_is_one");
  });

  it("matches List with field-scoped elts (E-14)", async () => {
    const q = [
      {
        tag: "list_with_certain",
        query: {
          node: "List",
          field: { elts: { node: "Constant", where: { attr: "value", eq: "It is certain." } } },
        },
      },
    ] as unknown as Parameters<typeof sb.parseAndMatch>[1];
    expect(await sb.parseAndMatch('answers = ["It is certain.", "Very doubtful."]', q)).toContain(
      "list_with_certain",
    );
    expect(await sb.parseAndMatch("answers = [1, 2]", q)).not.toContain("list_with_certain");
    expect(await sb.parseAndMatch('answers = ("It is certain.",)', q)).not.toContain(
      "list_with_certain",
    );
  });

  // §6.3 E-18 — `FunctionDef`, `Tuple`, `UnaryOp`, `BoolOp` as queryable node types
  // (additive NODE_TYPES entries, lockstep with content/verify/harness.py NODE_TYPES).
  // Field-selector reality: FunctionDef.body / Tuple.elts / UnaryOp.operand / BoolOp.values
  // are reachable (node / node-list fields); FunctionDef.name is a bare string — reachable
  // only via `where: {attr: name}`, never via `field`; UnaryOp.op / BoolOp.op hold op-class
  // instances whose classes are NOT in the table, so op subqueries are rejected here (the
  // e18 differential pins the resulting authoring divergence — out-of-vocabulary shape).
  it("matches FunctionDef by name attr and body field (E-18)", async () => {
    const q = [
      {
        tag: "input_in_update",
        query: {
          node: "Call",
          where: { calls: "input" },
          within: { node: "FunctionDef", where: { attr: "name", eq: "update" } },
        },
      },
      {
        tag: "draw_body_fill",
        query: { node: "FunctionDef", field: { body: { node: "Call", where: { calls: "screen.fill" } } } },
      },
    ] as unknown as Parameters<typeof sb.parseAndMatch>[1];
    expect(await sb.parseAndMatch("def update(s):\n    x = input()", q)).toContain("input_in_update");
    expect(await sb.parseAndMatch("x = input()\ndef update(s):\n    return s", q)).not.toContain(
      "input_in_update",
    );
    expect(await sb.parseAndMatch("def draw(s, screen):\n    screen.fill(SKY)", q)).toContain(
      "draw_body_fill",
    );
    expect(await sb.parseAndMatch("def draw(s, screen):\n    pass", q)).not.toContain("draw_body_fill");
  });

  it("matches Tuple with field-scoped elts and as a within scope (E-18)", async () => {
    const q = [
      {
        tag: "color_300_in_tuple",
        query: { node: "Constant", where: { attr: "value", eq: 300 }, within: { node: "Tuple" } },
      },
      {
        tag: "tuple_elts_300",
        query: { node: "Tuple", field: { elts: { node: "Constant", where: { attr: "value", eq: 300 } } } },
      },
    ] as unknown as Parameters<typeof sb.parseAndMatch>[1];
    expect(await sb.parseAndMatch("screen.fill((300, 0, 0))", q)).toEqual([
      "color_300_in_tuple",
      "tuple_elts_300",
    ]);
    expect(await sb.parseAndMatch("x = 300", q)).toEqual([]);
    expect(await sb.parseAndMatch("color = (255, 0, 0)", q)).toEqual([]);
  });

  it("matches UnaryOp via operand field; op field is table-gated (E-18)", async () => {
    const q = [
      {
        tag: "negate_x",
        query: { node: "UnaryOp", field: { operand: { node: "Name", where: { attr: "id", eq: "x" } } } },
      },
      // op-class subquery: USub is NOT in NODE_TYPES -> rejected (out of vocabulary).
      { tag: "usub_op", query: { node: "UnaryOp", field: { op: { node: "USub" } } } },
    ] as unknown as Parameters<typeof sb.parseAndMatch>[1];
    expect(await sb.parseAndMatch("x = -x", q)).toEqual(["negate_x"]);
    expect(await sb.parseAndMatch("speed = -speed", q)).toEqual([]);
  });

  it("matches BoolOp op-agnostically via values field and within If (E-18)", async () => {
    const q = [
      { tag: "boolop_in_if", query: { node: "BoolOp", within: { node: "If" } } },
      {
        tag: "boolop_values_near_x",
        query: { node: "BoolOp", field: { values: { node: "Name", where: { attr: "id", eq: "near_x" } } } },
      },
      // op-class subquery: And is NOT in NODE_TYPES -> rejected (out of vocabulary).
      { tag: "and_op", query: { node: "BoolOp", field: { op: { node: "And" } } } },
    ] as unknown as Parameters<typeof sb.parseAndMatch>[1];
    expect(await sb.parseAndMatch("if near_x and near_y:\n    print(1)", q)).toEqual([
      "boolop_in_if",
      "boolop_values_near_x",
    ]);
    expect(await sb.parseAndMatch("if near_x or near_y:\n    print(1)", q)).toContain("boolop_in_if");
    expect(await sb.parseAndMatch("ok = near_x and near_y", q)).toEqual(["boolop_values_near_x"]);
    expect(await sb.parseAndMatch("if near_x:\n    if near_y:\n        print(1)", q)).toEqual([]);
  });
});
