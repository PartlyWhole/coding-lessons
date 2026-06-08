import { Type, type Static } from "@sinclair/typebox";
import {
  SkillId,
  NodeId,
  CellId,
  StepId,
  MisconId,
  RichText,
  MasteryThreshold,
} from "./ids.js";
import { EvaluatorConfig } from "./evaluator.js";
import { Signature } from "./runtime.js";

// §3.5
export const SkillDelta = Type.Object({
  skill: SkillId,
  kind: Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("misconception")]),
  weight: Type.Number(),
});
export type SkillDelta = Static<typeof SkillDelta>;

export const Hint = Type.Object({
  level: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3), Type.Literal(4)]),
  body: RichText,
  revealCode: Type.Optional(Type.String()),
});

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

export const AcceptedAnswer = Type.Object({
  normalized: Type.Optional(Type.Array(Type.String())),
  patterns: Type.Optional(Type.Array(Type.String())),
  misconceptionMap: Type.Optional(Type.Record(Type.String(), MisconId)),
});

export const LineRange = Type.Object({
  startLine: Type.Number(),
  endLine: Type.Number(),
});

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

export const PredictStep = Type.Object({
  ...StepBaseProps,
  kind: Type.Literal("predict"),
  code: Type.String(),
  choices: Type.Optional(Type.Array(Choice)),
  expected: AcceptedAnswer,
  reveal: Type.Literal("run-and-show"),
});

export const RecognizeStep = Type.Object({
  ...StepBaseProps,
  kind: Type.Literal("recognize"),
  choices: Type.Array(Choice),
  correctChoiceId: Type.String(),
});

export const RecallStep = Type.Object({
  ...StepBaseProps,
  kind: Type.Literal("recall"),
  accepted: AcceptedAnswer,
});

export const BuildStep = Type.Object({
  ...StepBaseProps,
  kind: Type.Literal("build"),
  language: Type.Literal("python"),
  runtime: Type.Optional(Type.Union([Type.Literal("headless"), Type.Literal("pygame")])),
  starterCode: Type.String(),
  lockedRegions: Type.Optional(Type.Array(LineRange)),
  evaluator: EvaluatorConfig,
});

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
