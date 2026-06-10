import { Type, type Static } from "@sinclair/typebox";
import { Json } from "./ids.js";

// §3.6
export const RunConfig = Type.Object({
  timeoutMs: Type.Integer({ minimum: 1 }),
  memoryMb: Type.Integer({ minimum: 1 }),
  entrypoint: Type.Optional(Type.String()),
});
export type RunConfig = Static<typeof RunConfig>;

export const TestConfig = Type.Object({
  cases: Type.Array(
    Type.Object({
      input: Json,
      expected: Json,
      hidden: Type.Optional(Type.Boolean()),
    }),
  ),
  comparator: Type.Optional(
    Type.Union([
      Type.Literal("deep-equal"),
      Type.Literal("float-close"),
      Type.Literal("set-equal"),
    ]),
  ),
});
export type TestConfig = Static<typeof TestConfig>;

// §6.3 — AstPred references AstQuery (childMatches), so both are recursive.
// Declared together inside one Type.Recursive over a discriminated wrapper would be
// awkward; instead AstQuery is recursive and AstPred embeds it by referencing the
// exported AstQuery schema.
export const AstQuery = Type.Recursive((Self) =>
  Type.Union([
    Type.Object({
      node: Type.String(),
      where: Type.Optional(
        // AstPred — inlined here so it can reference Self (AstQuery).
        Type.Union([
          Type.Object({ attr: Type.String(), eq: Json }),
          Type.Object({ calls: Type.String() }),
          Type.Object({ usesName: Type.String() }),
          Type.Object({ childMatches: Self }),
        ]),
      ),
      within: Type.Optional(Self),
      // §6.3 — match a SPECIFIC child field (e.g. While.test, If.orelse), turning over-matching
      // childMatches heuristics into exact detectors. Field name → sub-query.
      field: Type.Optional(Type.Record(Type.String(), Self)),
      count: Type.Optional(
        Type.Object({
          op: Type.Union([Type.Literal("="), Type.Literal(">="), Type.Literal("<=")]),
          n: Type.Integer({ minimum: 0 }),
        }),
      ),
    }),
    Type.Object({ not: Self }),
    Type.Object({ all: Type.Array(Self) }),
    Type.Object({ any: Type.Array(Self) }),
  ]),
);
export type AstQuery = Static<typeof AstQuery>;

export const AstConfig = Type.Object({
  queries: Type.Array(Type.Object({ tag: Type.String(), query: AstQuery })),
});
export type AstConfig = Static<typeof AstConfig>;

// §6.4
const GenKind = Type.Union([
  Type.Literal("int"),
  Type.Literal("float"),
  Type.Literal("str"),
  Type.Literal("list"),
  Type.Literal("bool"),
  Type.Literal("choice"),
]);

// An element generator (the `elem` of a `list`). It has NO `param`: per §6.4 `param`
// names an entrypoint argument, and a list element binds to no such argument. Recursive
// so a list-of-lists element nests cleanly.
export const ElemSpec = Type.Recursive((Self) =>
  Type.Object({
    type: GenKind,
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    alphabet: Type.Optional(Type.String()),
    elem: Type.Optional(Self),
    choices: Type.Optional(Type.Array(Json)),
  }),
);
export type ElemSpec = Static<typeof ElemSpec>;

// A top-level generator: `param` is REQUIRED (it binds the generated value to a named
// entrypoint argument). Its `elem` is a paramless ElemSpec — the root invariant stays
// strict while element generators are correctly param-free.
export const GenSpec = Type.Object({
  param: Type.String(),
  type: GenKind,
  min: Type.Optional(Type.Number()),
  max: Type.Optional(Type.Number()),
  alphabet: Type.Optional(Type.String()),
  elem: Type.Optional(ElemSpec),
  choices: Type.Optional(Type.Array(Json)),
});
export type GenSpec = Static<typeof GenSpec>;

export const PropertyConfig = Type.Object({
  referenceImpl: Type.String(),
  generators: Type.Array(GenSpec),
  numCases: Type.Integer({ minimum: 1 }),
  seed: Type.Integer(),
  comparator: Type.Optional(
    Type.Union([Type.Literal("deep-equal"), Type.Literal("float-close")]),
  ),
});
export type PropertyConfig = Static<typeof PropertyConfig>;

// §17.4 — graphical build steps (BuildStep.runtime === "pygame"). The harness imports the
// learner module under SDL_VIDEODRIVER=dummy and drives `update` frame-by-frame with a
// fixed dt over a scripted input tape; the resulting probe trajectory feeds the normal
// Run→Test→AST→Property ladder. Additive: meaningful only on pygame steps (content lint
// enforces the pairing; the schema does not).
export const ScriptedFrame = Type.Object({
  keysDown: Type.Optional(Type.Array(Type.String())), // pygame key names, e.g. "K_LEFT"
  mouse: Type.Optional(
    Type.Object({
      x: Type.Number(),
      y: Type.Number(),
      buttons: Type.Integer({ minimum: 0 }),
    }),
  ),
});
export type ScriptedFrame = Static<typeof ScriptedFrame>;

export const GraphicalConfig = Type.Object({
  entrypoints: Type.Object({
    init: Type.Optional(Type.String()),  // e.g. "make_state" → returns the game state
    update: Type.String(),               // update(state, events, dt) -> state (pure step fn)
    probe: Type.Optional(Type.String()), // probe(state) -> JSON-able scalars
  }),
  inputTape: Type.Array(ScriptedFrame), // one entry per simulated frame; short tape = trailing empty frames
  dt: Type.Number({ exclusiveMinimum: 0 }), // fixed seconds-per-frame (e.g. 1/60)
  frames: Type.Integer({ minimum: 1 }),     // §17.7: authors keep ≤ ~600 (lint, not schema)
});
export type GraphicalConfig = Static<typeof GraphicalConfig>;

export const EvaluatorConfig = Type.Object({
  run: RunConfig,
  tests: Type.Optional(TestConfig),
  ast: Type.Optional(AstConfig),
  property: Type.Optional(PropertyConfig),
  acceptedVariants: Type.Optional(
    Type.Array(Type.Object({ astQuery: AstQuery })),
  ),
  graphical: Type.Optional(GraphicalConfig), // §17.4
});
export type EvaluatorConfig = Static<typeof EvaluatorConfig>;
