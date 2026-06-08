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
export const GenSpec = Type.Recursive((Self) =>
  Type.Object({
    param: Type.String(),
    type: Type.Union([
      Type.Literal("int"),
      Type.Literal("float"),
      Type.Literal("str"),
      Type.Literal("list"),
      Type.Literal("bool"),
      Type.Literal("choice"),
    ]),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    alphabet: Type.Optional(Type.String()),
    elem: Type.Optional(Self),
    choices: Type.Optional(Type.Array(Json)),
  }),
);
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

export const EvaluatorConfig = Type.Object({
  run: RunConfig,
  tests: Type.Optional(TestConfig),
  ast: Type.Optional(AstConfig),
  property: Type.Optional(PropertyConfig),
  acceptedVariants: Type.Optional(
    Type.Array(Type.Object({ astQuery: AstQuery })),
  ),
});
export type EvaluatorConfig = Static<typeof EvaluatorConfig>;
