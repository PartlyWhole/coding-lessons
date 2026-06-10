// E-18 three-way differential: signatures using the NEW §6.3 node types (FunctionDef,
// Tuple, UnaryOp, BoolOp) must evaluate IDENTICALLY under all three lockstep
// implementations of the grammar/oracle:
//   (1) the authoring TS matcher (src/ast/matcher.ts evalTags),
//   (2) the sandbox AstQuery interpreter (@trellis/sandbox parseAndMatch, local CPython twin),
//   (3) content/verify/harness.py's eval_tags — the ACTUAL harness source, executed up to its
//       "execution" section marker so the oracle itself (not a copy) is what we differential.
//
// Query shapes are the content track's `# E-18-gated:` comment-recorded forms (branch
// content-authoring, content/nodes/world-*.yaml + game-*.yaml), embedded locally — no
// cross-branch test dependency.
//
// FIELD-SELECTOR REALITY for the four (documented by the tests below):
//   FunctionDef — `where: {attr: name, eq: …}` WORKS (name is a plain string attr);
//                 `field: {body: …}` WORKS (list of stmt nodes); `field: {name: …}` can
//                 NEVER match in ANY implementation (the field selector only descends into
//                 ast nodes, and `name` is a bare string) — all three agree on no-match.
//   Tuple       — `field: {elts: …}` WORKS (list of expr nodes); `within: {node: Tuple}` works.
//   UnaryOp     — `field: {operand: …}` WORKS (expr node). The `op` field holds an OP-CLASS
//                 INSTANCE (ast.USub() / ast.Not()), see OP-CLASS VOCABULARY below.
//   BoolOp      — `field: {values: …}` WORKS (list of expr nodes). `op` (ast.And()/ast.Or())
//                 is op-class, see below; the content track's boolop_in_condition is
//                 DELIBERATELY op-agnostic (E-3) for exactly this reason.
//
// OP-CLASS VOCABULARY (UnaryOp.op / BoolOp.op): op classes (USub, Not, And, Or, …) are NOT
// in the NODE_TYPES tables, so a field subquery like `field: {op: {node: "USub"}}` is
// REJECTED by harness.py and the sandbox (table miss) but WOULD match in the table-less
// authoring matcher (it compares the raw `_type` string). Such queries are therefore OUT OF
// the legal §6.3 vocabulary — the divergence is pinned by an explicit test below so any
// future table change re-surfaces this documentation. (`where: {attr: op, eq: "USub"}`
// matches NOWHERE — the op instance never equals a string — and all three agree on that,
// so it is included in the differential.) Making op-class matching legal would be additive
// table entries in BOTH tables (zero authoring change) — an orchestrator/§6.3 design call,
// not this stream's.
//
// ESCALATED (found BY this differential, pre-existing, NOT E-18-specific): a `field` key on
// a `within:`/`childMatches:` SUB-SPEC is silently IGNORED by harness.py and the sandbox
// (their node_matches checks only node+where; `field` is applied only at query_matches'
// top level), while the authoring matcher honors `field` inside nodeMatches. So
//   { node: Tuple, within: { node: Call, field: { func: { node: Attribute,
//     where: { attr: attr, eq: "fill" } } } } }
// — the content track's RECORDED E-18-gated form for color_tuple_in_fill — scopes to ANY
// Call in harness/sandbox but only to fill-Calls in authoring. The divergence reproduces
// with the pre-E-18 vocabulary too (e.g. within {node: If, field: {test: …}}); fixing it
// means touching matcher/interpreter SEMANTICS, outside this table-only stream's write set.
// Pinned by an explicit test below; the differential proper uses where-based within scopes,
// which all three implementations agree on.
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createLocalSandbox } from "@trellis/sandbox";
import { evalTags, type TagQuery } from "../src/ast/matcher.js";

const ROOT = resolve(__dirname, "../../..");
const HARNESS = resolve(ROOT, "content/verify/harness.py");
const QUERY_MARKER = "# ------------------------------------------------------------------- §6.3 AstQuery";
const EXEC_MARKER = "# ------------------------------------------------------------------- execution";

/** Run harness.py's own eval_tags (its §6.3 section, cut out of the actual source). */
function harnessEvalTags(code: string, queries: TagQuery[]): string[] {
  const src = readFileSync(HARNESS, "utf8");
  const start = src.indexOf(QUERY_MARKER);
  const end = src.indexOf(EXEC_MARKER);
  if (start === -1 || end === -1) throw new Error("harness.py §6.3/execution markers not found");
  const section = src.slice(start, end);
  const driver =
    `import ast, json, sys\n` +
    section +
    `\npayload = json.loads(sys.stdin.read())\n` +
    `tags = eval_tags(payload["code"], payload["queries"])\n` +
    `print(json.dumps(sorted(tags) if tags is not None else None))\n`;
  const r = spawnSync("python3", ["-c", driver], {
    input: JSON.stringify({ code, queries }),
    encoding: "utf8",
    maxBuffer: 1 << 24,
  });
  if (r.status !== 0) throw new Error(`harness eval_tags driver failed: ${r.stderr}`);
  return JSON.parse(r.stdout.trim()) as string[];
}

const QUERIES: TagQuery[] = [
  // world-grab-the-wheel.yaml E-18-gated pinned form: input_call_in_loop
  {
    tag: "input_call_in_update",
    query: {
      node: "Call",
      where: { calls: "input" },
      within: { node: "FunctionDef", where: { attr: "name", eq: "update" } },
    },
  },
  // world-game.taxonomy.yaml B30 E-18-gated build form: no_fill_in_loop
  {
    tag: "no_fill_in_draw",
    query: {
      not: {
        node: "Call",
        field: { func: { node: "Attribute", where: { attr: "attr", eq: "fill" } } },
        within: { node: "FunctionDef", where: { attr: "name", eq: "draw" } },
      },
    },
  },
  // FunctionDef.body IS field-reachable (list of stmt nodes).
  {
    tag: "draw_body_has_fill",
    query: { node: "FunctionDef", field: { body: { node: "Call", where: { calls: "screen.fill" } } } },
  },
  // FunctionDef.name is a BARE STRING: the field selector can never reach it (all three
  // implementations agree this matches nothing — use `where: {attr: name}` instead).
  {
    tag: "fn_field_name_unreachable",
    query: { node: "FunctionDef", field: { name: { node: "Name" } } },
  },
  // world-first-light.yaml E-18-gated sharper form: color_component_300 within Tuple
  {
    tag: "color_300_in_tuple",
    query: { node: "Constant", where: { attr: "value", eq: 300 }, within: { node: "Tuple" } },
  },
  // world-first-light.yaml E-18-gated color_tuple_in_fill, in the where-based form all
  // three implementations agree on (the RECORDED field-in-within form hits the escalated
  // divergence — see header + the pinned test below).
  {
    tag: "tuple_in_fill",
    query: {
      node: "Tuple",
      within: { node: "Call", where: { calls: "screen.fill" } },
    },
  },
  // Tuple.elts IS field-reachable (list of expr nodes).
  {
    tag: "tuple_elts_300",
    query: { node: "Tuple", field: { elts: { node: "Constant", where: { attr: "value", eq: 300 } } } },
  },
  // world-walls.yaml E-18-gated pinned form: negate_x_assign (UnaryOp.operand IS reachable)
  {
    tag: "negate_x_assign",
    query: {
      node: "Assign",
      field: {
        targets: { node: "Name", where: { attr: "id", eq: "x" } },
        value: { node: "UnaryOp", field: { operand: { node: "Name", where: { attr: "id", eq: "x" } } } },
      },
    },
  },
  // game-touching.yaml E-18-gated: boolop_in_condition — DELIBERATELY op-agnostic (E-3).
  {
    tag: "boolop_in_condition",
    query: { node: "BoolOp", within: { node: "If" } },
  },
  // BoolOp.values IS field-reachable (list of expr nodes).
  {
    tag: "boolop_values_near_x",
    query: { node: "BoolOp", field: { values: { node: "Name", where: { attr: "id", eq: "near_x" } } } },
  },
  // `where: {attr: op, eq: "<string>"}` matches NOWHERE — UnaryOp.op/BoolOp.op hold op-class
  // INSTANCES, never equal to a string, in all three implementations alike. Differential-safe.
  {
    tag: "unary_op_attr_string_unreachable",
    query: { node: "UnaryOp", where: { attr: "op", eq: "USub" } },
  },
  {
    tag: "boolop_op_attr_string_unreachable",
    query: { node: "BoolOp", where: { attr: "op", eq: "And" } },
  },
];

const PROGRAMS = [
  // FunctionDef shapes (world-grab-the-wheel / world-game B30)
  "def update(state):\n    x = input()\n    return state",
  "x = input()\ndef update(state):\n    return state",
  "def draw(state, screen):\n    screen.fill(SKY)\n    pygame.draw.rect(screen, C, (state[0], 60, 60, 80))",
  "def draw(state, screen):\n    pygame.draw.rect(screen, C, (state[0], 60, 60, 80))",
  // Tuple shapes (world-first-light)
  "screen.fill((300, 0, 0))",
  "screen.fill((255, 0, 0))",
  "x = 300",
  "color = (300, 0, 0)",
  // UnaryOp shapes (world-walls A7.1)
  "if x > 800:\n    x = -x",
  "if x > 800:\n    speed = -speed",
  "x = x + speed",
  "flag = not done",
  // BoolOp shapes (game-touching)
  'if near_x and near_y:\n    print("snack")',
  'if near_x or near_y:\n    print("snack")',
  "ok = near_x and near_y",
  'if near_x:\n    if near_y:\n        print("snack")',
];

describe("E-18 differential: FunctionDef/Tuple/UnaryOp/BoolOp agree across all three implementations", () => {
  const sb = createLocalSandbox();

  it("authoring TS == sandbox twin == harness.py on every program", async () => {
    for (const code of PROGRAMS) {
      const ts = [...(evalTags(code, QUERIES) ?? new Set<string>())].sort();
      const sandbox = (
        await sb.parseAndMatch(code, QUERIES as unknown as Parameters<typeof sb.parseAndMatch>[1])
      ).sort();
      const harness = harnessEvalTags(code, QUERIES).sort();
      expect({ code, tags: sandbox }).toEqual({ code, tags: ts });
      expect({ code, tags: harness }).toEqual({ code, tags: ts });
    }
  });

  it("sanity: the new vocabulary actually fires (not vacuous agreement)", () => {
    const t = (code: string) => [...(evalTags(code, QUERIES) ?? new Set<string>())].sort();
    expect(t("def update(state):\n    x = input()\n    return state")).toContain("input_call_in_update");
    expect(t("x = input()\ndef update(state):\n    return state")).not.toContain("input_call_in_update");
    expect(t("def draw(state, screen):\n    screen.fill(SKY)")).not.toContain("no_fill_in_draw");
    expect(t("def draw(state, screen):\n    pygame.draw.rect(screen, C, (1, 2))")).toContain("no_fill_in_draw");
    expect(t("def draw(state, screen):\n    screen.fill(SKY)")).toContain("draw_body_has_fill");
    expect(t("screen.fill((300, 0, 0))")).toEqual(
      expect.arrayContaining(["color_300_in_tuple", "tuple_in_fill", "tuple_elts_300"]),
    );
    expect(t("x = 300")).not.toContain("color_300_in_tuple");
    expect(t("if x > 800:\n    x = -x")).toContain("negate_x_assign");
    expect(t("if x > 800:\n    speed = -speed")).not.toContain("negate_x_assign");
    expect(t('if near_x and near_y:\n    print("s")')).toEqual(
      expect.arrayContaining(["boolop_in_condition", "boolop_values_near_x"]),
    );
    expect(t('if near_x or near_y:\n    print("s")')).toContain("boolop_in_condition"); // op-agnostic
    expect(t("ok = near_x and near_y")).not.toContain("boolop_in_condition");
    // the documented dead-ends really match nothing anywhere
    for (const code of PROGRAMS) {
      expect(t(code)).not.toContain("fn_field_name_unreachable");
      expect(t(code)).not.toContain("unary_op_attr_string_unreachable");
      expect(t(code)).not.toContain("boolop_op_attr_string_unreachable");
    }
  });

  // OP-CLASS SUBQUERIES ARE OUT OF VOCABULARY — pinned divergence (see header). The
  // authoring matcher (table-less, raw `_type` compare) matches `field: {op: {node:
  // "USub"/"And"}}`, while harness.py and the sandbox REJECT the unknown node string
  // (NODE_TYPES miss). Content must never author this shape (the gated boolop tag is
  // op-agnostic, E-3); legalizing it = additive op-class table entries in both tables,
  // an orchestrator-level §6.3 vocabulary decision. If this test ever flips, the header
  // documentation above is stale — update both together.
  it("documents the op-class divergence: authoring matches, table-gated implementations reject", async () => {
    const opQueries: TagQuery[] = [
      { tag: "usub_op_subquery", query: { node: "UnaryOp", field: { op: { node: "USub" } } } },
      { tag: "and_op_subquery", query: { node: "BoolOp", field: { op: { node: "And" } } } },
    ];
    const programs = ["x = -x", "ok = near_x and near_y"];
    for (const code of programs) {
      const ts = [...(evalTags(code, opQueries) ?? new Set<string>())].sort();
      const sandbox = (
        await sb.parseAndMatch(code, opQueries as unknown as Parameters<typeof sb.parseAndMatch>[1])
      ).sort();
      const harness = harnessEvalTags(code, opQueries).sort();
      expect(harness).toEqual([]); // table miss in harness.py
      expect(sandbox).toEqual([]); // table miss in the sandbox twin
      // authoring DOES match the op-class node string — the divergence this test pins:
      if (code === "x = -x") expect(ts).toEqual(["usub_op_subquery"]);
      else expect(ts).toEqual(["and_op_subquery"]);
    }
  });

  // ESCALATED DIVERGENCE (pre-existing; see header): `field` on a `within:` sub-spec is
  // ignored by harness.py/sandbox (node+where only) but honored by authoring. The query
  // below is the content track's RECORDED E-18-gated form for color_tuple_in_fill
  // (world-first-light.yaml); on the draw program the rect call's coordinate Tuple is
  // "within a Call" to harness/sandbox (field dropped -> ANY Call scopes) but not within
  // a fill-Call to authoring. Until the orchestrator adjudicates, this shape MUST NOT be
  // authored — use a where-based within (as the differential's tuple_in_fill does). If
  // this test flips, the semantics were aligned: move the recorded form back into the
  // differential and delete this pin.
  it("pins the field-in-within divergence (escalated; out-of-vocabulary shape)", async () => {
    const divergent: TagQuery[] = [
      {
        tag: "tuple_in_fill_recorded_form",
        query: {
          node: "Tuple",
          within: {
            node: "Call",
            field: { func: { node: "Attribute", where: { attr: "attr", eq: "fill" } } },
          },
        },
      },
    ];
    const code =
      "def draw(state, screen):\n    screen.fill(SKY)\n    pygame.draw.rect(screen, C, (state[0], 60, 60, 80))";
    const ts = [...(evalTags(code, divergent) ?? new Set<string>())];
    const sandbox = await sb.parseAndMatch(
      code,
      divergent as unknown as Parameters<typeof sb.parseAndMatch>[1],
    );
    const harness = harnessEvalTags(code, divergent);
    expect(ts).toEqual([]); // authoring: within-set = fill Calls only -> rect Tuple out of scope
    expect(sandbox).toEqual(["tuple_in_fill_recorded_form"]); // sandbox: field dropped -> any Call
    expect(harness).toEqual(["tuple_in_fill_recorded_form"]); // harness: field dropped -> any Call
  });
});
