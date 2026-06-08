# Schema cheatsheet (condensed from TECHNICAL_DESIGN.md §3)

The authoritative source is `TECHNICAL_DESIGN.md` §3. This is the working subset an author needs.
Ids are stable strings: `skill.*`, `node.*`, `cell.*`, `mis.*`. Cross-entity references are by id and
are validated at compile time — a dangling id fails the build (§4.2, §13.2).

## Skill (§3.2)
```ts
interface Skill {
  id: SkillId;            // "skill.string.concat_str_num"
  title: string;          // "Join a string and a number"
  description: string;    // author-facing, one sentence
  misconceptions: MisconId[];
  upstream: SkillId[];    // skills that, if weak, explain failure here (root-cause targeting, §10.3)
}
```
**Granularity rule:** smallest unit that is independently certifiable AND has ≥1 distinct
misconception. 0 misconceptions → merge. >6 → split.

## ConceptNode + Requirement (§3.3)
```ts
interface ConceptNode {
  id: NodeId; title: string;
  track: "spine" | "extension";
  requires: Requirement[];
  teaches: SkillId[];      // certified when every cell completes
  cells: CellId[];         // ordered
}
interface Requirement {
  skill: SkillId;
  minMastery: number;      // 0..1; requirement met iff learner mastery >= this
  kind: "prerequisite" | "utility" | "track";  // advisory: drives lint + "why locked", not gating math
}
```
An `extension` node must `requires` exactly one `kind:"track"` edge to its spine parent.

## Cell + Step (§3.4)
```ts
interface Cell { id; nodeId; title; steps: Step[]; certifies: SkillId[]; }  // certifies ⊆ node.teaches

interface StepBase { id; kind; prompt: RichText; carryContext?: RichText; skills: SkillId[]; }
type StepKind = "watch" | "predict" | "recognize" | "recall" | "build";

WatchStep    { kind:"watch";  body: RichText }                              // no evaluation
PredictStep  { kind:"predict"; code: string; choices?: Choice[];
               expected: AcceptedAnswer; reveal:"run-and-show" }            // grade then ALWAYS run+reveal
RecognizeStep{ kind:"recognize"; choices: Choice[]; correctChoiceId: string }
RecallStep   { kind:"recall";  accepted: AcceptedAnswer }
BuildStep    { kind:"build";  language:"python"; runtime?:"headless"|"pygame";
               starterCode: string; lockedRegions?: LineRange[]; evaluator: EvaluatorConfig }

Choice { id: string; label: RichText; misconception?: MisconId }
AcceptedAnswer {
  normalized?: string[];                 // accepted after normalize() = trim/collapse-ws/lowercase/strip-trailing-period
  patterns?: string[];                   // RE2 regex (linear-time)
  misconceptionMap?: Record<string,MisconId>;  // wrong normalized input -> misconception
}
// recall/predict detection: the misconception's `signature` ({recallEquals: ";"}) is what ATTRIBUTES
// the misconception. The step-side `misconceptionMap` is an optional convenience that names the same
// link from the step's view. Keep the two consistent; the signature is the source of truth.
```

## Misconception + Hint (§3.5)
```ts
interface Misconception {
  id: MisconId; skill: SkillId; title: string;
  signature: Signature;          // predicate over RawSignals — see misconception-patterns.md
  hintLadder: Hint[];            // ordered levels 1..4
  feedback: RichText;            // pre-authored; SELECTED, never generated
  skillDeltas?: SkillDelta[];
}
interface Hint { level: 1|2|3|4; body: RichText; revealCode?: string }  // 4 = full solution
interface SkillDelta { skill: SkillId; kind:"pass"|"fail"|"misconception"; weight: number }
```

## EvaluatorConfig (§3.6) — build steps
```ts
interface EvaluatorConfig {
  run: { timeoutMs: number; memoryMb: number; entrypoint?: string };   // entrypoint = fn to call
  tests?: { cases: {input: Json; expected: Json; hidden?: boolean}[];
            comparator?: "deep-equal"|"float-close"|"set-equal" };
  ast?: { queries: { tag: string; query: AstQuery }[] };               // see misconception-patterns.md
  property?: { referenceImpl: string;        // trusted Python oracle, run in sandbox
               generators: GenSpec[]; numCases: number; seed: number;  // seed -> reproducible
               comparator?: "deep-equal"|"float-close" };
  acceptedVariants?: { astQuery: AstQuery }[];  // bless a structural form so it's never flagged
}
interface GenSpec { param: string; type:"int"|"float"|"str"|"list"|"bool"|"choice";
                    min?; max?; alphabet?; elem?: GenSpec; choices?: Json[] }
```
A `build` is **correct** iff it ran, all tests passed, AND (if `property` set) property passed. AST
tags do not fail a passing solution — they attach misconception context to failing ones.

## Attribution (§8) — what the diagnosis resolves to
`pass` | `misconception` (wrong + known cause) | `syntax` | `runtime` | `mismatch` (wrong, no known
cause). Precedence mirrors the ladder: didn't-run → syntax/runtime; ran but tests fail → misconception
or mismatch; ran+passed → pass.

## Authoring-file layout (§13.1)
- `content/nodes/<topic>.yaml` — the `node:` with its cells/steps/evaluators.
- `content/skills/<topic>.taxonomy.yaml` — the `skill:` with misconceptions + hint ladders.
  One taxonomy file may hold multiple skills; keep one *topic* per file.
- The compiler injects `nodeId` into cells from the enclosing node; you may omit it in source.
