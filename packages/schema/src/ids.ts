import { Type, type Static } from "@sinclair/typebox";

// §3.1 — identifiers are opaque strings; aliases document intent.
export const SkillId = Type.String();
export const NodeId = Type.String();
export const CellId = Type.String();
export const StepId = Type.String();
export const MisconId = Type.String();
export const ContentVersion = Type.String();

// §3.4 — authored prose. v1: a markdown string.
export const RichText = Type.String();

// §3.4
export const StepKind = Type.Union([
  Type.Literal("watch"),
  Type.Literal("predict"),
  Type.Literal("recognize"),
  Type.Literal("recall"),
  Type.Literal("build"),
]);
export type StepKind = Static<typeof StepKind>;

// §3.7
export const Attribution = Type.Union([
  Type.Literal("pass"),
  Type.Literal("misconception"),
  Type.Literal("syntax"),
  Type.Literal("runtime"),
  Type.Literal("mismatch"),
]);
export type Attribution = Static<typeof Attribution>;

// §3.9
export const SignalType = Type.Union([
  Type.Literal("session_start"),
  Type.Literal("step_enter"),
  Type.Literal("step_release"),
  Type.Literal("focus_change"),
  Type.Literal("submission"),
  Type.Literal("run"),
  Type.Literal("editor_change"),
  Type.Literal("rapid_resubmit"),
  Type.Literal("idle"),
  Type.Literal("dwell"),
  Type.Literal("three_fail_streak"),
  Type.Literal("wrong_predict_then_correct_run"),
  Type.Literal("hint_requested"),
  Type.Literal("peek_back"),
]);
export type SignalType = Static<typeof SignalType>;

// §3.8 — a requirement is satisfied iff mastery >= threshold.
export const MasteryThreshold = Type.Number({ minimum: 0, maximum: 1 });

// A recursive JSON value (used by TestConfig.cases and BehavioralEvent.payload).
// NOTE: do not annotate as `: TSchema` — that erases the inferred TRecursive type and
// makes `Static<typeof Json>` collapse to `unknown`. Let TypeScript infer the type.
export const Json = Type.Recursive((This) =>
  Type.Union([
    Type.Null(),
    Type.Boolean(),
    Type.Number(),
    Type.String(),
    Type.Array(This),
    Type.Record(Type.String(), This),
  ]),
);
export type Json = Static<typeof Json>;
