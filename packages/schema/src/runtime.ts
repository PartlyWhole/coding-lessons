import { Type, type Static } from "@sinclair/typebox";
import {
  SkillId,
  StepId,
  MisconId,
  ContentVersion,
  Attribution,
  SignalType,
  Json,
  SkillDelta,
} from "./ids.js";

// §7 — a misconception signature: a boolean predicate over RawSignals.
export const Signature = Type.Recursive((Self) =>
  Type.Union([
    Type.Object({ astTag: Type.String() }),
    Type.Object({ runError: Type.Union([Type.Literal("syntax"), Type.Literal("runtime")]) }),
    Type.Object({
      testFailure: Type.Object({
        caseIndex: Type.Optional(Type.Number()),
        gotEquals: Type.Optional(Json),
      }),
    }),
    Type.Object({ propertyFailed: Type.Literal(true) }),
    Type.Object({ choice: Type.String() }),
    Type.Object({ recallEquals: Type.String() }),
    Type.Object({ all: Type.Array(Self) }),
    Type.Object({ any: Type.Array(Self) }),
    Type.Object({ not: Self }),
  ]),
);
export type Signature = Static<typeof Signature>;

// §3.7
export const RawSignals = Type.Object({
  ran: Type.Boolean(),
  runError: Type.Optional(
    Type.Object({
      type: Type.Union([Type.Literal("syntax"), Type.Literal("runtime")]),
      message: Type.String(),
      line: Type.Optional(Type.Number()),
    }),
  ),
  tests: Type.Optional(
    Type.Object({
      passed: Type.Integer({ minimum: 0 }),
      failed: Type.Integer({ minimum: 0 }),
      failures: Type.Array(Type.Object({ caseIndex: Type.Integer({ minimum: 0 }), got: Json })),
    }),
  ),
  astTags: Type.Optional(Type.Array(Type.String())),
  property: Type.Optional(
    Type.Object({ passed: Type.Boolean(), counterexample: Type.Optional(Json) }),
  ),
  stdout: Type.Optional(Type.String()),
  wallMs: Type.Number({ minimum: 0 }),
});
export type RawSignals = Static<typeof RawSignals>;

export const Diagnosis = Type.Object({
  id: Type.String(),
  learnerId: Type.String(),
  stepId: StepId,
  contentVersion: ContentVersion,
  submittedAt: Type.String(),
  correct: Type.Boolean(),
  attribution: Attribution,
  misconceptionId: Type.Optional(MisconId),
  signals: RawSignals,
  skillDeltas: Type.Array(SkillDelta),
  seed: Type.Number(),
});
export type Diagnosis = Static<typeof Diagnosis>;

// §3.8
export const SkillState = Type.Object({
  mastery: Type.Number({ minimum: 0, maximum: 1 }),
  attempts: Type.Integer({ minimum: 0 }),
  passes: Type.Integer({ minimum: 0 }),
  pKnown: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  lastSeen: Type.String(),
  misconceptionCounts: Type.Record(MisconId, Type.Number()),
});
export type SkillState = Static<typeof SkillState>;

export const LearnerModel = Type.Object({
  learnerId: Type.String(),
  skills: Type.Record(SkillId, SkillState),
  contentVersion: ContentVersion,
});
export type LearnerModel = Static<typeof LearnerModel>;

// §3.9
export const BehavioralEvent = Type.Object({
  id: Type.String(),
  learnerId: Type.String(),
  sessionId: Type.String(),
  seq: Type.Integer({ minimum: 0 }),
  stepId: StepId,
  ts: Type.String(),
  type: SignalType,
  payload: Json,
});
export type BehavioralEvent = Static<typeof BehavioralEvent>;
