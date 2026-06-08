import { Type, type Static } from "@sinclair/typebox";
import {
  SkillId,
  NodeId,
  CellId,
  StepId,
  MisconId,
  RichText,
  MasteryThreshold,
  SkillDelta,
} from "./ids.js";
import { EvaluatorConfig } from "./evaluator.js";
import { Signature } from "./runtime.js";

export const Hint = Type.Object({
  level: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3), Type.Literal(4)]),
  body: RichText,
  revealCode: Type.Optional(Type.String()),
});
export type Hint = Static<typeof Hint>;

export const Misconception = Type.Object({
  id: MisconId,
  skill: SkillId,
  title: Type.String(),
  signature: Signature,
  hintLadder: Type.Array(Hint),
  feedback: RichText,
  skillDeltas: Type.Optional(Type.Array(SkillDelta)),
});
export type Misconception = Static<typeof Misconception>;

// §3.2
export const Skill = Type.Object({
  id: SkillId,
  title: Type.String(),
  description: Type.String(),
  misconceptions: Type.Array(MisconId),
  upstream: Type.Array(SkillId),
});
export type Skill = Static<typeof Skill>;

// §3.3
export const Requirement = Type.Object({
  skill: SkillId,
  minMastery: MasteryThreshold,
  kind: Type.Union([
    Type.Literal("prerequisite"),
    Type.Literal("utility"),
    Type.Literal("track"),
  ]),
});
export type Requirement = Static<typeof Requirement>;

export const ConceptNode = Type.Object({
  id: NodeId,
  title: Type.String(),
  track: Type.Union([Type.Literal("spine"), Type.Literal("extension")]),
  requires: Type.Array(Requirement),
  teaches: Type.Array(SkillId),
  cells: Type.Array(CellId),
});
export type ConceptNode = Static<typeof ConceptNode>;

// §3.4
export const Choice = Type.Object({
  id: Type.String(),
  label: RichText,
  misconception: Type.Optional(MisconId),
});
export type Choice = Static<typeof Choice>;

export const AcceptedAnswer = Type.Object({
  normalized: Type.Optional(Type.Array(Type.String())),
  patterns: Type.Optional(Type.Array(Type.String())),
  misconceptionMap: Type.Optional(Type.Record(Type.String(), MisconId)),
});
export type AcceptedAnswer = Static<typeof AcceptedAnswer>;

export const LineRange = Type.Object({
  startLine: Type.Number(),
  endLine: Type.Number(),
});
export type LineRange = Static<typeof LineRange>;

const StepBaseProps = {
  id: StepId,
  prompt: RichText,
  carryContext: Type.Optional(RichText),
  skills: Type.Array(SkillId),
};

export const WatchStep = Type.Object({
  ...StepBaseProps,
  kind: Type.Literal("watch"),
  body: RichText,
});
export type WatchStep = Static<typeof WatchStep>;

export const PredictStep = Type.Object({
  ...StepBaseProps,
  kind: Type.Literal("predict"),
  code: Type.String(),
  choices: Type.Optional(Type.Array(Choice)),
  expected: AcceptedAnswer,
  reveal: Type.Literal("run-and-show"),
});
export type PredictStep = Static<typeof PredictStep>;

export const RecognizeStep = Type.Object({
  ...StepBaseProps,
  kind: Type.Literal("recognize"),
  choices: Type.Array(Choice),
  correctChoiceId: Type.String(),
});
export type RecognizeStep = Static<typeof RecognizeStep>;

export const RecallStep = Type.Object({
  ...StepBaseProps,
  kind: Type.Literal("recall"),
  accepted: AcceptedAnswer,
});
export type RecallStep = Static<typeof RecallStep>;

export const BuildStep = Type.Object({
  ...StepBaseProps,
  kind: Type.Literal("build"),
  language: Type.Literal("python"),
  runtime: Type.Optional(Type.Union([Type.Literal("headless"), Type.Literal("pygame")])),
  starterCode: Type.String(),
  lockedRegions: Type.Optional(Type.Array(LineRange)),
  evaluator: EvaluatorConfig,
});
export type BuildStep = Static<typeof BuildStep>;

export const Step = Type.Union([WatchStep, PredictStep, RecognizeStep, RecallStep, BuildStep]);
export type Step = Static<typeof Step>;

export const Cell = Type.Object({
  id: CellId,
  nodeId: NodeId,
  title: Type.String(),
  steps: Type.Array(Step),
  certifies: Type.Array(SkillId),
});
export type Cell = Static<typeof Cell>;
