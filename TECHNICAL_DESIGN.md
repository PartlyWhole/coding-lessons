# Trellis — Technical Design Document

**Status:** Draft for build · **Audience:** Engineering · **Scope:** v1 (Python target)
**Author:** Architecture · **Date:** 2026-06-08

A note on how to read this: every section that resolves an open decision states the
recommendation first, then the trade-off accepted. Schemas are given in TypeScript
interface syntax (the engine's source-of-truth language) plus SQL DDL where the data
is relational. Pseudocode is deterministic; assume no randomness anywhere in the
grading/feedback/hinting path unless a seeded PRNG is explicitly named.

---

## 1. System overview and scope

Trellis is a deterministic computer-science teaching platform. A learner moves through a
**curriculum graph** of concept nodes; each node, when its prerequisites are met, exposes
one or more **cells** (self-contained lessons); each cell is an ordered list of **steps**
that replace one another on screen. Steps are evaluated by a layered, fully deterministic
pipeline that produces a **Diagnosis**, which updates a per-learner **LearnerModel**, which
in turn gates the next nodes, targets feedback at root-cause skills, and drives navigation.

**The determinism guarantee (stated up front, because it constrains every later section):**

- **Grading** is fixed rules over structured data: exact comparison (`recognize`),
  normalized pattern match (`recall`), and a Run→Test→AST→Property ladder (`build`).
- **Feedback text is pre-authored**, keyed to a detected misconception id. The system never
  generates prose; it selects prose.
- **Hints come from authored hint ladders**, selected and escalated by deterministic rules;
  the learner controls the dosage.
- **Correct-but-unanticipated solutions are accepted** via three mechanisms that do not rely
  on enumerating expected answers: property-based tests against a reference implementation,
  the reference implementation itself as oracle, and explicit `acceptedVariants`.
- **No probabilistic inference sits in the request path.** Bayesian Knowledge Tracing, if
  enabled (§10), updates mastery *after* the Diagnosis is produced and never changes the
  correctness verdict or the feedback text; it only influences *what to show next*.

**In scope for v1:** Python as the only `build` language; the Output→Variables spine plus the
string-concatenation extension as the proving slice (§16); single-learner web client; authored
content compiled from declarative source; learner state persisted **in the browser (IndexedDB)**;
graphical (pygame) `build` steps via a main-thread runtime (§17). **The entire site is hosted
statically on GitHub Pages with no backend of any kind** — this is a hard, global constraint that
shapes §2, §6.1, §11, §12, and §14.

**Out of scope for v1:** multi-language `build` (the boundary is designed in §12/§15 but only
Python is implemented); collaborative/classroom features; a visual authoring GUI (CLI + schema
validation only — §13); spaced-repetition scheduling (the model supports it; the scheduler is
deferred — §10).

---

## 2. Technology stack and rationale

| Layer | Choice | Rationale | Trade-off accepted |
|---|---|---|---|
| Language (engine + content tooling) | **TypeScript**, strict mode | One language for engine, client, and content validator means schemas are shared types, not duplicated. The engine is pure/deterministic and trivially unit-testable. | Not as fast as a systems language; irrelevant — the hot path is the sandbox, not the engine. |
| Client | **React 18 + Vite** | Step replacement is naturally a component-keyed remount; Vite gives fast HMR for authoring iteration. | React's flexibility invites accidental statefulness; we constrain it with the step state machine (§5). |
| Code sandbox (Python) | **Pyodide (CPython→WASM)** — in a Web Worker for headless grading, on the **main thread** for graphical play (§17) | Sub-second feedback with zero server compute; scales to N learners on their own CPU; Python's `ast` module for free. `pygame-ce` is main-thread-only, which forces the two-runtime split. | ~6–10 MB cold download; pinned WASM Python; client is spoofable and there is **no server to re-verify against** — accepted as low-stakes (§6.1, §15). |
| Graphical runtime | **`pygame-ce` on main-thread Pyodide, SDL→`<canvas>`** (§17) | Real `pygame-ce` runs (nearly) unmodified in the browser from static files; first-class in Pyodide ≥0.26. Single-threaded use means **no `COOP`/`COEP` headers**, which is exactly why GitHub Pages works. | SDL/canvas is marked *experimental*; main-thread loops can't be force-killed (mitigated by the async-loop contract + an AST pre-check, §17). |
| Content storage | **Git repo of declarative source → compiled immutable JSON bundles served as static files** (GitHub Pages, CDN-cached) | Content is the largest cost (§13); Git gives review, diff, blame, rollback. Bundles are content-addressed and infinitely cacheable; no object-store service needed. | Authors work through PR review, not a live editor (GUI deferred). |
| Learner state | **IndexedDB (browser-local)**, one object store per concern | The site is fully static — there is no server to hold state. IndexedDB gives transactional, indexed, origin-scoped persistence with ample quota for per-learner mastery + telemetry. | State is per-device, not synced across devices (accepted; a future backend could add sync — §15). |
| Telemetry | **IndexedDB-buffered event log, processed in-browser** | Behavioral signals (§11) feed deterministic rules that run client-side; no ingestion service exists in the static model. | No cross-device or aggregate analytics until a backend is added; the upside is data never leaves the device (§11.4). |
| Data flow | **No backend API** — content fetched as static JSON; all engine logic + persistence run client-side | A static host cannot run server code; eliminating the API tier removes an entire class of infra and is the simplest thing that satisfies the constraint. | No server-authoritative grading; client verdicts are final (§6.1). |
| Monorepo / build | **pnpm workspaces + Turborepo** | Packages: `@trellis/schema`, `@trellis/engine`, `@trellis/sandbox` (worker grader), `@trellis/runtime` (main-thread pygame), `@trellis/persist` (IndexedDB), `@trellis/telemetry` (behavior logging, §11), `@trellis/client`, `@trellis/content`, `@trellis/authoring`. No `@trellis/server`. | Monorepo tooling overhead; justified by shared schema. |

**Why deterministic-friendly choices matter:** the engine package has **no I/O, no clock, no
randomness** except a seeded PRNG passed in explicitly (used only by property-test input
generation, §6.4). This makes every Diagnosis reproducible from `(submission, EvaluatorConfig,
seed)` — a hard requirement for trustworthy grading and for golden-file testing of content.

---

## 3. Concrete data model

Two storage tiers:

- **Authored content** (Skill, ConceptNode, Cell, Step, EvaluatorConfig, Misconception, hint
  ladders): immutable, versioned, content-addressed. Stored as compiled JSON bundles; the
  *source* is authored as YAML/TS (§13). Keyed by stable string ids + a content version.
- **Runtime state** (LearnerModel, Diagnosis records, Signals): mutable, per-learner, in
  browser-local **IndexedDB** (§3.10) — there is no server.

### 3.1 Identifiers and versioning

```ts
type SkillId       = string; // e.g. "skill.string.concat_str_num"
type NodeId        = string; // e.g. "node.variables"
type CellId        = string; // e.g. "cell.variables.intro"
type StepId        = string; // e.g. "cell.variables.intro#3"  (cell id + ordinal)
type MisconId      = string; // e.g. "mis.concat.implicit_coercion"
type ContentVersion = string; // monotonic semver of the *whole bundle*, e.g. "2026.06.0"
```

Content is versioned as a **whole immutable bundle**, not per-entity. A learner is pinned to
the bundle version they started a cell on, so a mid-flight content edit never changes a
learner's in-progress evaluation. The `content_version` is stamped into every Diagnosis record
for reproducibility. Cross-entity references are by id and validated at bundle compile time
(§4.2, §13) — a dangling id fails the build, never reaches runtime.

### 3.2 Skill

```ts
interface Skill {
  id: SkillId;
  title: string;            // "Join a string and a number"
  description: string;      // author-facing, one sentence
  // The misconception catalogue for this skill (ids resolved at compile time).
  misconceptions: MisconId[];
  // Optional: skills that, if weak, commonly explain failure here (root-cause hints).
  // Used by feedback targeting (§10). DAG over skills, validated separately.
  upstream: SkillId[];
}
```

**Granularity rule (resolving the open question concretely):** a skill is the smallest unit
that (a) can be *independently certified* by at least one step and (b) has *at least one
distinct misconception* worth detecting. If two candidate skills always pass/fail together and
share misconceptions, merge them. If a single skill accumulates >~6 misconceptions, split it.
This makes granularity testable in CI: a content lint (§13) flags skills with zero certifying
steps or zero misconceptions. See §15 for the trade-off.

### 3.3 ConceptNode

```ts
interface ConceptNode {
  id: NodeId;
  title: string;
  track: "spine" | "extension";
  // The unified requires list — three edge semantics, one field (see §4).
  requires: Requirement[];
  // Skills certified when every cell in this node is completed.
  teaches: SkillId[];
  cells: CellId[];          // ordered
}

interface Requirement {
  skill: SkillId;
  // Minimum mastery state the learner must hold for this requirement to be satisfied.
  minMastery: MasteryThreshold;  // see §10
  // Edge semantics — advisory metadata, does NOT change gating math, but drives
  // authoring lint and UI explanation ("locked because…").
  kind: "prerequisite" | "utility" | "track";
}
```

The `kind` field records *why* an edge exists (true prereq vs. utility-timing vs. track
membership) without forking the resolver. Gating math reads `skill` + `minMastery` uniformly;
`kind` only drives the "why is this locked / why now" explanation and content-lint rules
(e.g. a `track: extension` node must `requires` exactly one `kind: "track"` edge to its spine
parent).

### 3.4 Cell and Step

```ts
interface Cell {
  id: CellId;
  nodeId: NodeId;
  title: string;
  steps: Step[];            // ordered; the runner walks these
  // Skills this cell can move the needle on (subset of node.teaches).
  certifies: SkillId[];
}

type Step =
  | WatchStep | PredictStep | RecognizeStep | RecallStep | BuildStep;

interface StepBase {
  id: StepId;
  kind: StepKind;
  prompt: RichText;         // the question/instruction shown
  // Context that the *next* step's peek-back can surface (§5). Authored, optional.
  carryContext?: RichText;
  skills: SkillId[];        // skills this step touches
}

type StepKind = "watch" | "predict" | "recognize" | "recall" | "build";

interface WatchStep extends StepBase {
  kind: "watch";
  body: RichText;           // the idea being installed; no evaluation
}

interface PredictStep extends StepBase {
  kind: "predict";
  // The hidden state the learner must predict (e.g. value of x after a line runs).
  code: string;             // runnable snippet whose effect is "invisible"
  choices?: Choice[];       // optional MC form; else free-text prediction
  expected: AcceptedAnswer; // what the correct prediction is
  // After grading the prediction we ALWAYS run the code and reveal — a wrong
  // prediction followed by correct run is the key telemetry signal (§11).
  reveal: "run-and-show";
}

interface RecognizeStep extends StepBase {
  kind: "recognize";
  choices: Choice[];        // each choice may carry a misconception id (§7)
  correctChoiceId: string;
}

interface RecallStep extends StepBase {
  kind: "recall";
  accepted: AcceptedAnswer; // normalized-text / pattern match
}

interface BuildStep extends StepBase {
  kind: "build";
  language: "python";       // v1 fixed; the field exists for §15's boundary
  runtime?: "headless" | "pygame";  // default "headless"; "pygame" → graphical, §17
  starterCode: string;
  lockedRegions?: LineRange[];       // editor seam: non-editable lesson scaffolding (§17.6)
  evaluator: EvaluatorConfig;  // §3.6 (pygame adds a `graphical` block, §17.4)
}

interface LineRange { startLine: number; endLine: number; }

interface Choice { id: string; label: RichText; misconception?: MisconId; }

interface AcceptedAnswer {
  // Deterministic acceptance for recall/predict free-text.
  normalized?: string[];    // accepted after normalization (§6, trim/case/whitespace)
  patterns?: string[];      // RE2 regexes (linear-time, no catastrophic backtracking)
  // Each accepted value may also map a *wrong* normalized input to a misconception.
  misconceptionMap?: Record<string, MisconId>;
}
```

### 3.5 Misconception

```ts
interface Misconception {
  id: MisconId;
  skill: SkillId;
  title: string;            // author-facing
  // The detection signature: a predicate over evaluator signals / AST (§7).
  signature: Signature;
  hintLadder: Hint[];       // ordered nudge→sharper→worked→solution (§9)
  // The pre-authored explanation shown when this misconception is the attribution.
  feedback: RichText;
  // Skill deltas implied by exhibiting this misconception (usually negative/zero).
  skillDeltas?: SkillDelta[];
}

interface Hint {
  level: 1 | 2 | 3 | 4;     // 1=nudge, 4=solution
  body: RichText;
  // level-4 may include a full worked solution / runnable patch.
  revealCode?: string;
}

interface SkillDelta { skill: SkillId; kind: "pass" | "fail" | "misconception"; weight: number; }
```

### 3.6 EvaluatorConfig

```ts
interface EvaluatorConfig {
  // Ordered ladder; each layer can short-circuit (§6).
  run: RunConfig;
  tests?: TestConfig;
  ast?: AstConfig;
  property?: PropertyConfig;
  // Explicit accepted-answer escape hatch for known-good variants (§1 determinism).
  acceptedVariants?: { astQuery: AstQuery }[];
}

interface RunConfig {
  timeoutMs: number;        // wall-clock budget inside sandbox (default 2000)
  memoryMb: number;         // heap cap (default 256)
  entrypoint?: string;      // function name to call, else top-level execution
}

interface TestConfig {
  cases: { input: Json; expected: Json; hidden?: boolean }[];
  comparator?: "deep-equal" | "float-close" | "set-equal";
}

interface AstConfig {
  // Named detection queries; each maps a structural pattern to a tag the
  // misconception signatures can reference (§7).
  queries: { tag: string; query: AstQuery }[];
}

interface PropertyConfig {
  referenceImpl: string;        // trusted Python source, run in sandbox as oracle
  generators: GenSpec[];        // input domain (§6.4)
  numCases: number;             // default 100
  seed: number;                 // fixed → reproducible
  comparator?: "deep-equal" | "float-close";
}
```

### 3.7 Diagnosis (runtime record)

```ts
interface Diagnosis {
  id: string;
  learnerId: string;
  stepId: StepId;
  contentVersion: ContentVersion;
  submittedAt: string;          // ISO; from server clock, not engine
  correct: boolean;
  attribution: Attribution;     // §8
  misconceptionId?: MisconId;
  signals: RawSignals;          // every layer's raw output (§6, §8)
  skillDeltas: SkillDelta[];    // applied to LearnerModel
  seed: number;                 // reproducibility
}

type Attribution = "pass" | "misconception" | "syntax" | "runtime" | "mismatch";

interface RawSignals {
  ran: boolean;
  runError?: { type: "syntax" | "runtime"; message: string; line?: number };
  tests?: { passed: number; failed: number; failures: { caseIndex: number; got: Json }[] };
  astTags?: string[];           // which AstConfig queries matched
  property?: { passed: boolean; counterexample?: Json };
  stdout?: string;
  wallMs: number;
}
```

### 3.8 LearnerModel (runtime state)

```ts
interface LearnerModel {
  learnerId: string;
  // One entry per skill the learner has encountered.
  skills: Record<SkillId, SkillState>;
  contentVersion: ContentVersion;  // bundle the learner is pinned to
}

interface SkillState {
  // Representation decision resolved in §10: continuous mastery + BKT params.
  mastery: number;          // 0..1, the gating/targeting/driving value
  attempts: number;
  passes: number;
  // BKT latent (optional; only populated if spaced-rep enabled, §10).
  pKnown?: number;          // 0..1 latent prob of mastery
  lastSeen: string;         // ISO
  // Misconception history for targeting (which root causes recur).
  misconceptionCounts: Record<MisconId, number>;
}

type MasteryThreshold = number; // a requirement satisfied iff mastery >= threshold
```

### 3.9 Behavioral Signals (runtime events)

```ts
interface BehavioralEvent {
  id: string;
  learnerId: string;
  sessionId: string;        // per-page-load uuid; groups a sitting (§11.1)
  seq: number;              // monotonic per session — gap-free ordering independent of clock skew
  stepId: StepId;
  ts: string;               // client-stamped (no server in the static model; telemetry ≠ grading)
  type: SignalType;
  payload: Json;            // type-specific (e.g. {editDistance} for resubmit, {durationMs} for idle)
}

type SignalType =
  | "session_start"
  | "step_enter" | "step_release"   // dwell boundaries
  | "focus_change"                  // canvas/editor gained or lost focus
  | "submission"                    // any attempt
  | "run"                           // executed without submitting (e.g. pygame Run)
  | "editor_change"                 // debounced buffer edit (length+hash, not raw text by default)
  | "rapid_resubmit"                // near-identical resubmission within window
  | "idle" | "dwell"                // pause duration / active time on a step
  | "three_fail_streak"
  | "wrong_predict_then_correct_run"
  | "hint_requested"
  | "peek_back";
```

### 3.10 Storage representation, keys, indexes

**Content bundle (immutable JSON, content-addressed):** one compiled file per bundle version,
plus a manifest mapping ids→offsets. Served as static files from GitHub Pages/CDN; the client
caches by `contentVersion` (immutable URL → cache-forever). No database, no server.

**Runtime state — IndexedDB (browser-local).** Because the site is fully static there is no server
tier; all per-learner state lives in one origin-scoped IndexedDB database, `trellis`, opened at a
fixed schema version. Object stores and their keys/indexes:

```
DB "trellis" (schema v1)
├── store "learner_skill"
│     keyPath: "skillId"                    // single learner per browser profile; skillId is unique
│     value:   SkillState (+ skillId)       // §3.8 — point get(skillId) for gating
│     index:   "by_lastSeen" → lastSeen     // spaced-rep candidate scan (deferred)
├── store "diagnosis"
│     keyPath: "id"
│     value:   Diagnosis                     // §3.7
│     index:   "by_submittedAt" → submittedAt   // recent-history reads
├── store "behavioral_event"
│     keyPath: "id"
│     value:   BehavioralEvent               // §3.9
│     index:   "by_step_ts" → [stepId, ts]   // per-step trigger evaluation (§11)
└── store "meta"
      keyPath: "key"                         // { key:"contentVersion", value }, { key:"learnerId", value }
```

All writes for one submission (skill updates + the Diagnosis record + emitted events) go through a
**single IndexedDB `readwrite` transaction** spanning the three stores, so a learner's state stays
internally consistent even if the tab is closed mid-write — the transaction either commits whole or
aborts whole. `learnerId` is a client-generated opaque uuid stored in `meta`; there is no account
system in v1 (one learner per browser profile). Quota is the browser's per-origin allowance (tens
to hundreds of MB), far beyond what mastery + capped telemetry need; a retention sweep (§11.4)
trims `behavioral_event` by age to stay well under it.

---

## 4. Curriculum graph

### 4.1 Representation

The graph is **implicit in the data**: nodes carry `requires: Requirement[]` and `teaches:
SkillId[]`. There is no separate edge table. An edge "node A → node B" exists iff some skill in
`A.teaches` appears in `B.requires`. This keeps a single source of truth (a skill is the
currency) and means adding a node never requires editing other nodes' edge lists.

We compile two derived indexes at bundle build time for fast runtime resolution:

```ts
// skill → nodes that certify it
producers: Map<SkillId, NodeId[]>;
// node → fully-resolved requirement list (flattened, deduped)
requirements: Map<NodeId, Requirement[]>;
```

### 4.2 Validation: it must be a DAG

The graph that must be acyclic is the **skill-dependency graph** induced over nodes: draw an
edge `producer(skill) → node` for every `skill ∈ node.requires`. Cycle detection runs at bundle
compile time (CI gate, never runtime):

```
function assertDAG(nodes):
  color = {}                       # WHITE/GRAY/BLACK per node
  for n in nodes: color[n] = WHITE
  for n in nodes:
    if color[n] == WHITE:
      visit(n, [])

function visit(n, stack):
  color[n] = GRAY
  for req in requirements[n]:
    for p in producers[req.skill]:        # nodes that teach the required skill
      if color[p] == GRAY:
        FAIL with cycle = stack ++ [n, p] # report the offending path
      if color[p] == WHITE:
        visit(p, stack ++ [n])
  color[n] = BLACK
```

Iterative DFS with an explicit stack is used in the real implementation to avoid blowing the
call stack on deep curricula; the recursive form above is for clarity. The reported cycle path
is surfaced to the author verbatim. The same routine validates the `Skill.upstream` graph
independently.

Additional compile-time validations: every `requires.skill` has at least one producer (no
unreachable requirement); the spine is a single connected chain (every `track:"spine"` node is
reachable from the root spine node); every `extension` node `requires` exactly one `track` edge.

### 4.3 Availability / gating resolver

Given a `LearnerModel`, compute each node's availability. A node is **available** when every
requirement is met; **the next spine node** and **newly-unlocked extensions** are derived from
the same pass.

```
function resolveAvailability(model, nodes):
  status = {}                                  # NodeId -> "locked" | "available" | "done"
  for n in nodes:
    status[n] = "done" if completed(model, n) else "locked"
  for n in nodes where status[n] == "locked":
    if all(meets(model, req) for req in requirements[n]):
      status[n] = "available"
  return status

function meets(model, req):
  s = model.skills[req.skill]
  return s != null and s.mastery >= req.minMastery

function completed(model, n):
  # node done iff every skill it certifies is at/above the node's own teach threshold
  return all(model.skills[sk]?.mastery >= COMPLETION_THRESHOLD for sk in n.teaches)
```

**Navigation** (`drive`, §10): the **next spine cell** is the first cell of the lowest-ordinal
spine node whose status is `available` and not `done`. **Newly-unlocked extensions** are the
diff between availability computed before vs. after a Diagnosis is applied — exactly the set of
extension nodes that flipped `locked → available`. This diff is what powers the "you just
unlocked X" affordance and is cheap because availability is O(nodes × avg-requires).

**"Why locked" explanation:** for a locked node, return the unmet requirements with their
`kind`, so the UI can say *"Locked — needs 'string vs. number' (prerequisite) and 'declare a
variable' (utility)."* This reuses the `kind` metadata from §3.3 at zero resolver cost.

---

## 5. Cell and step runner

### 5.1 Step lifecycle state machine

Each step is an instance of this machine. Exactly one step is `ACTIVE` per cell at a time.

```
            ┌─────────┐  enter   ┌────────┐ submit  ┌───────────┐
  (start)──▶│ PENDING │ ───────▶ │ ACTIVE │ ──────▶ │ EVALUATING │
            └─────────┘          └────────┘         └───────────┘
                                     ▲  │ hint            │
                                     │  └──────────┐      │ Diagnosis
                                     │             ▼      ▼
                                  retry        ┌──────────────┐
                                     └─────────│  FEEDBACK    │
                                               └──────────────┘
                                                  │ advance
                                                  ▼
                                               ┌────────┐
                                               │ RELEASED│ ──▶ next step PENDING→ACTIVE
                                               └────────┘
```

- `watch` steps skip `EVALUATING`: `ACTIVE --advance--> RELEASED`.
- `EVALUATING` is the only state that touches the sandbox; it is async and cancellable (a
  resubmit cancels the in-flight evaluation).
- `FEEDBACK` is where attribution-colored UI, misconception feedback, and the hint ladder live.
  `retry` returns to `ACTIVE` preserving the editor buffer; `advance` requires `correct` *or* an
  authored `allowSkip` flag.

### 5.2 Step replacement

Each step renders under a React key of its `StepId`. Advancing changes the active key, so React
**unmounts** the previous step component and mounts the next — there is no lingering DOM and no
shared step state. The cell-level store holds only: `activeStepIndex`, the current step's
machine state, and an append-only `history` of `{stepId, diagnosisId}` for peek-back. The
previous step's working memory (editor buffer, choices) is intentionally dropped on `RELEASED`,
matching the design intent that the learner holds one step's context at a time.

The `RELEASED` transition is the **explicit "release" signal** the proposal calls for: it is the
hook where we (a) drop transient step state, (b) emit the transition telemetry event, and (c)
materialize the prior step into peek-back history.

### 5.3 Peek-back / retrievable context

Peek-back is read-only and reconstructed from history, never from live step state:

```ts
interface PeekBackEntry {
  stepId: StepId;
  kind: StepKind;
  promptSnapshot: RichText;     // the prompt as shown
  carryContext?: RichText;      // author-marked "this is worth remembering"
  outcome?: { correct: boolean; attribution: Attribution };  // from Diagnosis
}
```

The runner exposes `peekBack(): PeekBackEntry[]` over the cell's released steps. Authors mark
what survives via `Step.carryContext` (§3.4) — e.g. a `watch` step that installed "strings are
text in quotes" sets `carryContext` so it reappears in peek-back during a later `build` step.
Because entries are snapshots, peek-back is immune to step unmounting and is cheap to render in a
collapsible side panel. Opening it emits a `peek_back` behavioral event (§11) — itself a weak
signal of struggle.

---

## 6. Evaluation pipeline

The `build` evaluator is a **short-circuiting ladder**. Each layer either produces a terminal
Diagnosis or passes signals down. Non-`build` kinds use only the relevant comparator. **Graphical
(pygame) `build` steps reuse this exact ladder** but run the learner's code against a *headless*
display with scripted input and a fixed time step — fully specified in §17; everything in §6.2–§6.4
applies to them unchanged.

```
recognize → exact choice id compare
recall    → normalize(input) ∈ accepted.normalized  OR  any RE2 pattern matches
predict   → same as recall/recognize on the prediction; THEN run-and-reveal (telemetry)
build     → Run → Test → AST → Property  (below)
```

`normalize(s)` = trim, collapse internal whitespace, lowercase (configurable per step),
strip a trailing period. Deterministic and total.

### 6.1 Code-execution sandbox — decision

**Recommendation: Pyodide (CPython compiled to WASM) running entirely on the client, as the only
path — there is no server in the static model, so there is nothing to fall back to.** Two runtime
hosts share one Pyodide build: a **Web Worker** hosts headless `build` grading (force-killable, off
the UI thread), and the **main thread** hosts graphical `pygame` execution and its headless-grading
variant (pygame's SDL layer is main-thread-only — §17). Both run the identical engine code, so a
graphical step and a headless step grade the same Python the same way.

Why client-side WASM wins for this product:

- **Sub-second feedback.** No network round-trip; after warm-up, a small Python program runs in
  tens of milliseconds. The dominant cost is one-time interpreter load, amortized.
- **Zero per-run server compute.** Each learner brings their own CPU. This is the difference
  between linear infra cost and ~free at scale — decisive for an education product.
- **Free AST access.** Python's own `ast` module runs in the same sandbox, so §6.3 needs no
  separate parser service.
- **Strong-enough isolation.** WASM is a memory-safe sandbox with no ambient syscalls; the
  worker has no DOM, no network (we don't import `js`), and a structured-clone-only boundary.

**The trade-off accepted, and its mitigation:**

- *Spoofability — accepted outright.* A determined learner can patch the in-browser grader and fake
  a pass. In the static model **there is no server-authoritative verdict to appeal to**; the client
  Diagnosis is final. For a *teaching* product this is the right trade: the stakes are low (they
  only cheat themselves), and gating math is per-device anyway (§3.10). If a future deployment ever
  needs integrity (certification, grades-of-record), it would require introducing a backend that
  re-runs the same `EvaluatorConfig` server-side — explicitly out of scope here and called out as
  the upgrade path in §15. We do *not* design dead code for it now.
- *Cold-start weight.* ~6–10 MB. Mitigated by: lazy load on first `build` step, CDN + long
  cache, and a "warming sandbox…" state in the runner. The worker is created once per session
  and reused across all `build` steps.
- *Language lock.* WASM availability constrains languages; this is exactly the boundary §15
  discusses. The `LanguageAnalyzer` interface (§15) abstracts execution so that *if* a future
  backend is ever introduced (§15 upgrade path), it could serve languages with no WASM toolchain —
  but no such backend exists in the static v1.

**Isolation, limits, timeouts:**

```ts
interface Sandbox {
  // Stateless per call; fresh module namespace each run to avoid cross-step bleed.
  run(req: {
    code: string;
    entrypoint?: string;
    stdin?: string;
    timeoutMs: number;     // enforced by a watchdog in the worker host (terminate worker)
    memoryMb: number;      // Pyodide heap cap via WebAssembly.Memory maximum
  }): Promise<RunResult>;
}
interface RunResult {
  ran: boolean;
  error?: { type: "syntax" | "runtime"; message: string; line?: number };
  stdout: string;
  returnValue?: Json;
  wallMs: number;
  timedOut: boolean;
}
```

- **Timeout** is enforced by the *host* of the worker, not inside it: the main thread arms a
  timer; on expiry it `worker.terminate()`s and spins up a replacement (infinite loops cannot be
  cooperatively interrupted inside CPython-on-WASM, so termination is the only reliable cutoff).
  A small warm pool hides respawn latency. **This kill switch exists only for the worker grader** —
  graphical play runs on the main thread, where `terminate()` does not exist, so runaway loops there
  are prevented by an AST pre-check and the async-loop contract instead (§17.5).
- **Memory** is bounded by the worker's `WebAssembly.Memory` maximum; OOM surfaces as a runtime
  error, not a tab crash.
- **No I/O reach:** the worker is created without importing the `js` FFI; it cannot touch
  `fetch`, DOM, storage, or the parent. stdin/stdout cross the boundary as plain strings only.
- **No cross-step state:** each `run` evaluates in a fresh Python namespace (re-exec of a clean
  module dict), so a prior step's globals can't leak into grading.

**Performance target:** p95 end-to-end `build` feedback **< 800 ms** *after warm-up* (warm-up,
first build of a session, is budgeted separately at < 4 s). Budget split (§14): editor→worker
postMessage < 5 ms, exec < 200 ms typical, AST + tests + property (100 cases) < 400 ms, engine
diagnosis < 5 ms.

### 6.2 Test runner

`TestConfig.cases` are executed by calling `entrypoint(input)` (or feeding `input` as stdin for
top-level programs) once per case in the same warm interpreter. Comparison uses the configured
comparator: `deep-equal` (structural), `float-close` (abs/rel tolerance for numerics),
`set-equal` (order-insensitive). `hidden: true` cases are graded but their expected values are
not *rendered* to the learner. Note the honest limitation of a static client: with no server, a
"hidden" case is only obscured (kept out of the UI, and ideally salted/hashed so casual inspection
doesn't reveal it), **not cryptographically secret** — a determined user can read the fetched
bundle. We accept this; it is the same low-stakes posture as spoofable grading (§6.1). Output signal: `{passed, failed, failures:[{caseIndex, got}]}`. Tests are
**pass/fail gating** but a failing case's `got` value feeds AST/misconception detection (e.g.
"returned the example output verbatim" → hardcoding misconception).

### 6.3 AST analysis

**Parser choice: Python's own `ast` module, run inside the same Pyodide sandbox.** Rationale:
zero version-skew with the execution semantics, no second parser to maintain, full fidelity. The
worker parses `ast.parse(code)` and walks it with a small visitor that evaluates the authored
queries, returning matched tags to the engine. (A pure-JS Python parser was rejected: it would
drift from real CPython grammar across versions.)

**Detection signatures are expressed as a small declarative query language**, not arbitrary code,
so authors write data and the matcher stays deterministic and sandbox-safe:

```ts
type AstQuery =
  | { node: string;                      // ast node type, e.g. "For", "Call", "BinOp"
      where?: AstPred;                    // predicate on attributes/children
      within?: AstQuery;                  // must occur inside a match of this
      count?: { op: "=" | ">=" | "<="; n: number } }
  | { not: AstQuery }
  | { all: AstQuery[] }
  | { any: AstQuery[] };

type AstPred =
  | { attr: string; eq: Json }
  | { calls: string }                     // a Call to a named function, e.g. "print"
  | { usesName: string }                  // references identifier
  | { childMatches: AstQuery };
```

Examples of authored signatures:

```yaml
# "Used a loop where recursion was required"
loop_instead_of_recursion:
  all:
    - { node: "For" }                                    # or While
    - { not: { node: "Call", where: { calls: "$self" } } } # no self-call
# "Hardcoded the expected output instead of computing it"
hardcoded_output:
  node: "Return"
  where: { childMatches: { node: "Constant", where: { attr: "value", eq: "Hello, World!" } } }
# "Omitted the required print call"
missing_print:
  not: { node: "Call", where: { calls: "print" } }
```

The matcher compiles each `AstQuery` into a predicate over the visited tree and returns the set
of matched tags. Matching is **linear in AST size**; there is no backtracking pattern that can
blow up. Tags become `RawSignals.astTags`, which misconception signatures consume (§7).

### 6.4 Property-based testing

For correct-but-unanticipated solutions, fixed test cases are insufficient; we generate inputs
and compare the learner's function to a **trusted reference implementation** (the oracle).

```ts
interface GenSpec {
  param: string;                          // which entrypoint argument
  type: "int" | "float" | "str" | "list" | "bool" | "choice";
  // bounded domains keep generation total and meaningful
  min?: number; max?: number;             // int/float/str-length/list-length
  alphabet?: string;                      // str
  elem?: GenSpec;                         // list element
  choices?: Json[];                       // choice
}
```

Generation uses a **seeded PRNG** (seed from `PropertyConfig.seed`), so the same content +
submission always produces the same cases and the same counterexample — reproducibility is a
hard requirement. For each of `numCases` inputs: run learner fn and `referenceImpl` in the
sandbox, compare with the configured comparator; on first mismatch, **shrink** the input toward
a minimal counterexample (halve numbers / lists, trim strings, re-check) and stop. Output:
`{passed, counterexample?}`. The reference implementation is authored and trusted; it runs in the
same isolated sandbox and is not shown in the UI, but (as with hidden tests, §6.2) in a static
client it is obscured in the bundle, not truly secret. Acceptable for low-stakes learning.

A `build` is **correct** iff: it ran, all tests passed, AND (if `property` configured) property
passed. AST tags do not by themselves fail a passing solution — they only attach misconception
context to *failing* ones, or trigger style feedback on passing ones if the author opted in via
`acceptedVariants` exclusions. `acceptedVariants` lets an author explicitly bless a structural
form (e.g. "a list comprehension is fine here") so it is never flagged.

---

## 7. Misconception detection engine

A misconception's `signature` is a predicate over `RawSignals` (including `astTags`). The format:

```ts
type Signature =
  | { astTag: string }                                   // an AST query matched
  | { runError: "syntax" | "runtime" }
  | { testFailure: { caseIndex?: number; gotEquals?: Json } }
  | { propertyFailed: true }
  | { choice: string }                                   // recognize: a distractor chosen
  | { recallEquals: string }                             // recall: a specific wrong input
  | { all: Signature[] }
  | { any: Signature[] }
  | { not: Signature };
```

**Matching logic** — deterministic, ordered, first-match-wins within a skill, with a global
priority so structural causes beat generic ones:

```
function detect(signals, step, skills) -> MisconId | null:
  candidates = []
  for skillId in step.skills:
    for mid in skill(skillId).misconceptions:
      if evalSignature(misconception(mid).signature, signals):
        candidates.push(mid)
  if candidates empty: return null
  # Deterministic tie-break: (1) AST/structural signatures rank above run/test errors,
  # (2) then by authored `priority` int, (3) then by stable id order.
  return candidates.sortBy(specificityRank, priority, id).first()

function evalSignature(sig, signals):  # pure boolean recursion over the union above
  switch sig:
    {astTag}        -> sig.astTag in signals.astTags
    {runError}      -> signals.runError?.type == sig.runError
    {testFailure}   -> matchTestFailure(signals.tests, sig.testFailure)
    {propertyFailed}-> signals.property?.passed == false
    {choice}        -> signals.chosenChoiceId == sig.choice
    {recallEquals}  -> normalize(signals.recallInput) == normalize(sig.recallEquals)
    {all}/{any}/{not} -> compose
```

Specificity ranking encodes the design intent that *most misconception signatures live at the
AST layer*: a structural match ("looped instead of recursed") is more diagnostic than "a test
failed," so it wins when both fire. The whole function is pure and is exhaustively unit-tested
against authored fixtures in CI (§13: every misconception ships with a triggering and a
non-triggering example).

---

## 8. Diagnosis production

The ladder's signals are combined into one Diagnosis by a pure function. Attribution is decided
by precedence, mirroring the ladder order:

```
function diagnose(step, signals, model) -> Diagnosis:
  if step.kind != "build":
    correct = compareNonBuild(step, signals)        # exact / normalized / pattern
    mid = correct ? null : detect(signals, step)    # distractor or recallEquals → miscon
    attribution = correct ? "pass" : (mid ? "misconception" : "mismatch")
  else:
    if not signals.ran:
      attribution = signals.runError.type            # "syntax" | "runtime"
      correct = false
    else if signals.tests and signals.tests.failed > 0:
      mid = detect(signals, step)
      attribution = mid ? "misconception" : "mismatch"
      correct = false
    else if signals.property and not signals.property.passed:
      mid = detect(signals, step)
      attribution = mid ? "misconception" : "mismatch"
      correct = false
    else:
      # ran, tests pass, property passes → correct. AST may still attach a *style* miscon
      # only if author marked it pass-compatible; otherwise:
      correct = true
      mid = detectPassCompatible(signals, step)      # usually null
      attribution = "pass"
  return {
    correct, attribution, misconceptionId: mid,
    signals, skillDeltas: computeDeltas(step, correct, mid),
    seed: step.evaluator?.property?.seed ?? 0,
    ...
  }
```

**Attribution semantics (the UI uses these to color the experience):**

- `pass` — correct; celebrate, advance.
- `misconception` — wrong *and* we know the conceptual cause; show authored feedback + targeted
  hint ladder. "You misunderstood the task."
- `syntax` / `runtime` — code didn't run; "your code has a bug" framing, point at the line.
- `mismatch` — wrong output but no recognized misconception and no run error; generic
  "doesn't match expected" + fall back to the skill's default hint ladder.

`computeDeltas` maps outcome → `SkillDelta[]`: a pass yields positive weight on
`step.certifies`/`skills`; a misconception yields the misconception's authored `skillDeltas`
(often a negative nudge on the root-cause skill, plus increment of `misconceptionCounts`); a
syntax/runtime error yields a small negative on the skill but is treated as low-signal (bugs ≠
not knowing). All deltas are bounded and authored-weighted, never inferred.

The function is **total and deterministic**: same `(step, signals)` → same Diagnosis, always.

---

## 9. Hint ladder system

### 9.1 Data format

Hint ladders live on the misconception (`Misconception.hintLadder`, §3.5) and, as a fallback, on
the skill (a generic ladder used when `attribution == "mismatch"`). Each ladder is the ordered
`Hint[]`: level 1 nudge → 2 sharper → 3 worked example → 4 solution (`revealCode`).

### 9.2 Selection and escalation (deterministic, learner-dosed)

```ts
interface HintState { ladderKey: string; revealedThrough: 0|1|2|3|4; }
```

- **Which ladder:** `attribution == "misconception"` → that misconception's ladder;
  `mismatch`/`syntax`/`runtime` → the step's skill's generic ladder (keyed by attribution so a
  syntax error gets syntax-flavored nudges).
- **Dosing is learner-controlled:** hints are *pulled*, not pushed. Each "show me a hint" press
  increments `revealedThrough` by exactly one level; the learner sees levels `1..revealedThrough`.
  Level 4 (`revealCode`/solution) requires an extra confirm ("show full solution"). The engine
  never auto-advances the ladder — only the learner or a §11 proactive trigger can.
- **Escalation across attempts:** on a *repeat* of the *same* misconception within a step, the
  next pull may start one level higher (authored `autoEscalate` flag), so a stuck learner isn't
  forced to re-read level 1. This is the only non-learner-initiated ladder movement, and it is a
  fixed rule, not inference.
- **Reset:** changing misconception (a different signature fires) resets to the new ladder at
  level 0; the editor buffer is preserved.

Each hint pull emits a `hint_requested` event (§11). The ladder is pure data + a counter; there
is no generation and no model in the loop.

---

## 10. Learner model

### 10.1 Mastery representation — decision

**Recommendation: continuous mastery `∈ [0,1]` as the operative value used by gate/target/drive,
backed by an optional BKT latent (`pKnown`) that is computed but not in the request path.**

Why not the alternatives:

- *Binary flag* — too lossy; can't express "shaky but passing," can't drive spaced repetition,
  makes targeting (§10.3) coarse. Rejected.
- *Pure Bayesian Knowledge Tracing in the path* — its update is fine, but putting a probabilistic
  estimate *on the grading/gating path* violates the determinism guarantee and makes "why am I
  locked out" hard to explain. Rejected as the operative value.
- *Continuous + optional BKT latent* — the operative `mastery` updates by a **fixed, transparent
  rule** (below), so gating is explainable and deterministic; BKT's `pKnown` rides alongside,
  feeding only the (deferred) spaced-repetition scheduler. Best of both. **Chosen.**

Trade-off accepted: two numbers per skill instead of one, and a scheduler that reads a different
value than the gate. We accept this to keep gating deterministic/explainable while leaving the
door open to decay-based review. `pKnown` is only populated when spaced-rep is enabled.

### 10.2 Update logic

**On cell/step completion** (apply the Diagnosis's `skillDeltas`):

```
function applyDiagnosis(model, diag):
  for d in diag.skillDeltas:
    s = model.skills[d.skill] ?? newSkillState()
    s.attempts += 1
    if d.kind == "pass":
      s.passes += 1
      s.mastery = clamp01(s.mastery + LEARN_RATE * (1 - s.mastery) * d.weight)
    else if d.kind == "misconception":
      s.mastery = clamp01(s.mastery - SLIP * d.weight)
      s.misconceptionCounts[diag.misconceptionId] += 1
    else:  # generic fail (mismatch/runtime/syntax) — low signal
      s.mastery = clamp01(s.mastery - SMALL * d.weight)
    s.lastSeen = diag.submittedAt
    if BKT_ENABLED: s.pKnown = bktUpdate(s.pKnown, d.kind)
  return model
```

`LEARN_RATE * (1 - mastery)` gives diminishing returns (mastery asymptotes toward 1, never
spikes from a single pass). Constants are config, tuned by content, identical across learners →
deterministic. `bktUpdate` is the standard four-parameter BKT posterior; it touches only
`pKnown`.

**On behavioral signals** (§11): behavioral events do **not** move `mastery` (mastery reflects
demonstrated correctness only, to keep gating honest). They update *engagement* state used by
proactive scaffolding and may *lower the threshold for offering help*, never raise mastery.

### 10.3 The three jobs read from the model

- **Gate** — `resolveAvailability` (§4.3) reads `mastery` against `Requirement.minMastery`. One
  read path, one value.
- **Target** — when a step yields a misconception on skill *S*, the targeter walks
  `Skill.upstream(S)` and checks each upstream skill's `mastery`. If an upstream skill is below
  threshold, feedback is *re-aimed* there: "this concat is failing because *string vs number* is
  shaky" — it surfaces that skill's hint ladder/cell as the root cause. This is a deterministic
  walk: lowest-mastery upstream skill below threshold wins; ties broken by id.
- **Drive** — navigation reads availability diffs (§4.3) for next-spine-cell and
  newly-unlocked-extensions; the dashboard reads `mastery` per skill for progress display.

Because all three consume the same `SkillState`, they cannot drift — there is exactly one number
that means "how well does this learner know skill S."

---

## 11. Behavior logging, telemetry, and proactive scaffolding

### 11.1 The behavior-logging component (`@trellis/telemetry`)

Behavior logging is a **single, self-contained component**, not a concern sprinkled through the UI.
It has exactly one job: turn raw learner interaction — actions, pauses, focus changes, resubmissions
— into a durable, structured behavioral-event stream. It does **not** grade, does **not** touch
mastery, and does **not** decide what the UI shows. That narrow remit is precisely what makes
"record everything" safe (§10.2, §11.4).

It lives in the **effectful adapter layer** (§12), beside `@trellis/sandbox` and `@trellis/persist`.
This placement is deliberate: the pure engine forbids clocks and randomness (§2), but logging
*needs* wall-time (to measure pauses) and uuids (event/session ids). Isolating those effects in this
one adapter keeps the engine pure while giving the logger the clock it requires.

**The inbound seam is an in-process event bus (publisher/subscriber).** Presentation and the cell
runner never call the logger directly — they *announce* semantic facts onto a bus, and the logger
subscribes:

```
 CellRunner · StepMachine · EditorPane · HintPanel · PygameStage · grader
        │  emit(UiEvent)   — fire-and-forget, typed, never blocks the UI
        ▼
   ┌──────────── EventBus (in-process pub/sub) ────────────┐
   │                                                        │
   ▼                                                        ▼
 @trellis/telemetry  (Recorder)                  ProactiveScaffolder (§11.3)
   ├─ IdleDetector   (clock-driven: pauses/dwell)        (subscribes; reads back
   ├─ SignalDeriver  (pure: edit-distance, streaks)       recent events to fire rules)
   └─ EventBuffer ──▶ persist.appendEvents() ──▶ IndexedDB `behavioral_event`
```

Why a bus instead of direct logging calls: **the UI must not know telemetry exists.** `CellRunner`
emits "step entered," `EditorPane` emits "buffer changed," the grader emits "submission diagnosed" —
semantic events, not log lines. Both the recorder and the proactive scaffolder subscribe. A future
analytics sink, or a global "logging off" privacy switch (§11.4), is one subscription toggle changed
in one place. That is the cleanliness this component exists to provide: **one inbound seam (the bus),
one outbound seam (`persist`), and zero coupling to business logic.** Emit sites never change when
logging behavior changes.

**Sub-parts (all inside `@trellis/telemetry`):**

| Sub-part | Responsibility | Notable property |
|---|---|---|
| `EventBus` | typed in-process pub/sub; synchronous fan-out; isolates subscriber failures | an `emit` **never throws into the caller** — a telemetry bug cannot break the lesson |
| `Recorder` | maps each `UiEvent` → 0+ `BehavioralEvent`, stamping session id, monotonic `seq`, timestamp | the *only* writer of the `behavioral_event` store |
| `IdleDetector` | clock-driven; arms a timer reset by any event; emits `idle`/`dwell` with durations | the lone wall-clock dependency; clock is injected so tests drive it deterministically |
| `SignalDeriver` | pure functions: edit distance, consecutive-fail streak, predict→run correlation | deterministic — same event sequence → same derived signals (the §11.3 rules depend on this) |
| `EventBuffer` | batches writes; flushes on size, on interval, and on `visibilitychange:hidden`/`pagehide` | no IndexedDB write per keystroke; no event loss on tab close |

**Interfaces:**

```ts
// Semantic events the app emits — distinct from the persisted BehavioralEvent (§3.9).
type UiEvent =
  | { t: "session_start" }
  | { t: "step_enter";    stepId: StepId; kind: StepKind }
  | { t: "step_release";  stepId: StepId }
  | { t: "submission";    stepId: StepId; diagnosis: Diagnosis }
  | { t: "editor_change"; stepId: StepId; length: number; hash: string }  // not raw text by default
  | { t: "run";           stepId: StepId }                                 // e.g. pygame Run pressed
  | { t: "predict_answer";stepId: StepId; correct: boolean }
  | { t: "hint_request";  stepId: StepId; level: 1|2|3|4 }
  | { t: "peek_back";     stepId: StepId }
  | { t: "focus";         stepId: StepId; focused: boolean };

interface EventBus {
  emit(e: UiEvent): void;                            // sync fan-out; subscriber errors caught + swallowed
  subscribe(fn: (e: UiEvent) => void): () => void;   // returns an unsubscribe handle
}

interface TelemetryRecorder {
  // Wires bus → derive/idle → buffer → persist. Returns a detach function.
  attach(deps: { bus: EventBus; persist: Persist; clock: Clock; policy: CapturePolicy }): () => void;
}

interface Clock { now(): number; setTimer(ms: number, fn: () => void): Handle; clear(h: Handle): void; }

// One place to tune what is captured (privacy lever, §11.4).
interface CapturePolicy {
  enabled: boolean;                 // master switch: if false, Recorder simply never subscribes
  captureEditorText: boolean;       // default false → store only length+hash, never raw keystrokes
  idleThresholdMs: number;          // default 90_000
  editorDebounceMs: number;         // default 400
}
```

**Worked path (keystroke → pause → proactive offer), no UI code involved past the first `emit`:**
learner types → `EditorPane` emits a debounced `editor_change` → `Recorder` records a lightweight
event *and* `IdleDetector` resets its idle timer → learner stops → the timer fires after
`idleThresholdMs` → `IdleDetector` emits an `idle` `BehavioralEvent` carrying the dwell duration →
`EventBuffer` flushes it to IndexedDB → on the next submission `SignalDeriver` sees the idle gap and
the `ProactiveScaffolder` (§11.3) may offer help.

### 11.2 Captured events and taxonomy

The `Recorder` is the only writer of the `behavioral_event` object store (§3.10) — there is no
endpoint and nothing leaves the device. It enriches each persisted `BehavioralEvent` (§3.9) with a
per-page-load `sessionId`, a monotonic `seq` (gap-free ordering independent of clock skew), and a
client timestamp. Client timestamps are acceptable here because **no grading or gating depends on
telemetry** (§10.2), so a skewed clock can at worst mistime a proactive offer — never a verdict.
Captured signals: submissions, runs, hint pulls, peek-backs, prediction outcomes, focus changes,
and time-derived `idle`/`dwell`. The `SignalDeriver` computes cheap derived fields (edit distance
between consecutive submissions, fail-streak length) at record time so the §11.3 rules read them
directly. Per the `CapturePolicy`, raw editor text is **not** stored by default — only its length
and a hash, enough to detect a near-identical resubmission without keystroke surveillance.

### 11.3 Processing → deterministic triggers

The `ProactiveScaffolder` subscribes to the same bus and evaluates fixed rules over a learner's
recent events for the current step (read back via `persist.recentEvents`, §12.2). Each rule is a pure predicate; when it
fires, it proposes a **scaffold action** (offer next hint level, surface root-cause cell, suggest
a peek-back, or just a gentle check-in). Rules:

```
RULE wrong_predict_then_correct_run:
  if last predict was wrong AND the subsequent run was correct
  → offer the misconception's level-1 hint for the predicted concept   # confusion just surfaced
RULE three_fail_streak:
  if 3 consecutive failing submissions on this step
  → auto-advance the hint ladder by one level (proactive escalation)
RULE rapid_resubmit:
  if >=2 submissions within 20s AND editDistance < 5
  → suggest "want a hint?" (they're flailing on a tiny change)
RULE idle:
  if step ACTIVE and no input event for 90s
  → surface a non-modal "stuck? peek back or take a hint" affordance
```

Thresholds (20s, 90s, 3, distance 5) are configuration; the rules are deterministic. The
highest-priority firing rule wins (priority order as listed; `wrong_predict_then_correct_run` is
the most valuable, per the design, so it ranks first). Proactive offers are **suggestions**, never
forced ladder reveals beyond one level — dosage stays with the learner except the explicit
`three_fail_streak` single-level bump.

### 11.4 Privacy

- **Data minimization:** the `CapturePolicy` (§11.1) defaults to storing derived signals and
  length+hash of editor buffers, not keystroke-level recordings. Idle is a single duration, not a
  trace. One switch (`policy.enabled = false`) stops all capture by simply not subscribing the
  `Recorder` — privacy control lives in exactly one place because logging is one component.
- **Purpose binding:** behavioral events feed only scaffolding and content analytics; they never
  influence `mastery` (so they can't gate a learner) and are not sold/shared.
- **Data never leaves the device:** in the static model the strongest possible privacy posture is
  free — all behavioral data lives only in the learner's own IndexedDB. There is no transmission,
  no third party, nothing to breach server-side.
- **Retention & control:** a startup sweep deletes `behavioral_event` rows older than a TTL (e.g.
  90 days) using the `by_step_ts` index; "export my data" dumps the stores to JSON and "delete my
  data" clears the `trellis` database. `learnerId` is an opaque uuid in `meta` tied to no identity
  (no accounts in v1). If a backend is ever added (§15), telemetry export becomes opt-in, not
  automatic.

---

## 12. Layer architecture and contracts

Three layers, narrow contracts, **all running in the browser** — there is no server process. The
**engine is pure** (no I/O); content flows *in* (static fetch), presentation calls *in*, state flows
*out* to a thin persistence adapter over IndexedDB.

```
┌─────────────── Presentation (React client) ───────────────┐
│  CellRunner, StepViews, EditorPane, HintPanel, PeekBack,    │
│  PygameStage (canvas, §17)                                  │
└──▲────────────────┬──────────────────┬─────────────────────┘
   │ engine API     │ emit(UiEvent)    │ persist API (in-process)
   │ (in-process)   ▼                  │
   │        ┌── EventBus (pub/sub) ──┐ │   ← logging seam: UI announces, never calls the logger
   │        ▼                        ▼ │
   │  @trellis/telemetry      ProactiveScaffolder (§11)
   │  (Recorder/IdleDetector) │       │
┌──┴────────────────────────┴────────▼─────────────────────┐
│                 Engine (pure TS, @trellis/engine)          │
│  resolver · stepMachine · evaluate · detect · diagnose ·   │
│  hintSelect · learnerModel                                 │
│  ── adapters (effectful, injected) ─────────────────────── │
│  @trellis/sandbox (worker grader) · @trellis/runtime       │
│  (pygame main-thread) · @trellis/persist (IndexedDB) ·     │
│  @trellis/telemetry (behavior logging, §11)                │
└──▲────────────────────────────────────────────────────────┘
content │ fetch(staticUrl) — immutable JSON bundle (GitHub Pages / CDN)
┌──────┴──────────────────────────────────────────────────────┐
│  Static host: index.html · bundle.json · Pyodide (CDN) ·     │
│  pygame-ce wheel (CDN) · game assets                         │
└──────────────────────────────────────────────────────────────┘
```

Everything above the static host is JavaScript/WASM executing in the tab. "Deploying" is pushing
static files; there is no API surface to operate, monitor, or secure.

### 12.1 Engine API (in-process, called by presentation)

```ts
// All pure given (content, model, inputs); sandbox is the one eff-ful dependency, injected.
function resolveAvailability(model: LearnerModel, graph: Graph): Map<NodeId, NodeStatus>;
function nextSpineCell(model: LearnerModel, graph: Graph): CellId | null;

function startStep(step: Step): StepRuntime;           // → PENDING/ACTIVE machine
async function evaluate(
  step: Step, submission: Submission, sandbox: Sandbox, model: LearnerModel
): Promise<Diagnosis>;                                  // runs ladder → detect → diagnose
function selectHint(diag: Diagnosis, state: HintState, content: Content): Hint[];
function applyDiagnosis(model: LearnerModel, diag: Diagnosis): LearnerModel;
function evaluateTriggers(events: BehavioralEvent[], step: Step): ScaffoldAction | null;
```

### 12.2 Persistence API (`@trellis/persist`, in-process over IndexedDB)

Replaces the former server API. Every call is a local IndexedDB transaction; no network.

```ts
// Content is just a static fetch — no RPC.
async function loadBundle(): Promise<Content>;        // fetch(manifest.url), cache by version

interface Persist {
  getModel(): Promise<LearnerModel>;                  // read all of learner_skill + meta
  // One atomic readwrite txn across learner_skill + diagnosis + behavioral_event (§3.10):
  commitSubmission(input: {
    diagnosis: Diagnosis; updatedSkills: SkillState[]; events: BehavioralEvent[];
  }): Promise<void>;
  appendEvents(events: BehavioralEvent[]): Promise<void>;   // telemetry buffer flush (§11.1)
  recentEvents(stepId: StepId, limit: number): Promise<BehavioralEvent[]>;  // by_step_ts index
  exportAll(): Promise<Json>;                          // privacy: dump stores
  deleteAll(): Promise<void>;                          // privacy: drop DB
}
```

**Contract discipline:** the client never mutates IndexedDB directly; it calls the engine to
produce a Diagnosis + updated `SkillState[]`, then hands them to `persist.commitSubmission` for one
atomic write. The **engine never imports React, IndexedDB, or `fetch`** — its effectful
dependencies (sandbox, pygame runtime, persist) are *injected*, which is what keeps it pure and
exhaustively unit-testable. The content bundle is the only way content enters the engine, so
swapping content versions is a data change (a different static URL), not a code change.

---

## 13. Content authoring format and pipeline

Content authoring is the single largest hidden cost; the pipeline is designed to make authoring
**declarative, validated, and testable**, with tooling investment front-loaded.

### 13.1 Authoring format

Authors write **YAML** (or typed TS for power users) — one file per node, with its cells, steps,
evaluator configs, and a sibling taxonomy file per skill (misconceptions + hint ladders). Example
(abbreviated) for the string-concat extension:

```yaml
# content/nodes/string-concat.yaml
node:
  id: node.string_concat
  track: extension
  requires:
    - { skill: skill.var.assign,        minMastery: 0.6, kind: track }       # spine parent
    - { skill: skill.string.literal,    minMastery: 0.6, kind: prerequisite }
    - { skill: skill.var.use,           minMastery: 0.6, kind: utility }
  teaches: [ skill.string.concat_str_num ]
  cells:
    - id: cell.concat.intro
      certifies: [ skill.string.concat_str_num ]
      steps:
        - { kind: watch, prompt: "...", body: "Strings join with +", carryContext: "..." }
        - kind: predict
          prompt: "What prints?"
          code: "x = 'age: ' + 7"
          expected: { normalized: ["TypeError"] }
          reveal: run-and-show
        - kind: build
          language: python
          prompt: "Print 'age: 7' using the variable age."
          starterCode: "age = 7\n# print here\n"
          evaluator:
            run: { timeoutMs: 2000, memoryMb: 256 }
            tests:
              cases: [ { input: null, expected: "age: 7\n" } ]
            ast:
              queries:
                - { tag: implicit_coerce, query: { node: BinOp, where: { childMatches: { node: Constant, where: { attr: value, eq: 7 } } } } }
            property:
              referenceImpl: "def sol(age): return f'age: {age}'"
              generators: [ { param: age, type: int, min: 0, max: 999 } ]
              numCases: 50
              seed: 1234
```

```yaml
# content/skills/string-concat.taxonomy.yaml
skill:
  id: skill.string.concat_str_num
  misconceptions:
    - id: mis.concat.implicit_coercion
      signature: { any: [ { runError: runtime }, { astTag: implicit_coerce } ] }
      feedback: "Python won't auto-convert a number to text. Convert it with str(...) or use an f-string."
      hintLadder:
        - { level: 1, body: "What type is `age`? Can you + a string and a number?" }
        - { level: 2, body: "You need to make the number into text first." }
        - { level: 3, body: "Try str(age), or an f-string: f'age: {age}'." }
        - { level: 4, body: "Solution:", revealCode: "print(f'age: {age}')" }
      skillDeltas: [ { skill: skill.string.concat_str_num, kind: misconception, weight: 0.3 } ]
```

### 13.2 Validation pipeline (CI gate)

The compiler (`@trellis/authoring`) turns source → bundle and **fails the build** on:

1. **Schema validity** — every entity matches its TS/JSON-Schema type.
2. **Referential integrity** — all `skill`/`misconception`/`cell` ids resolve.
3. **Graph DAG** — §4.2 cycle check; spine connectivity; extension single-track edge.
4. **Granularity lint** (§3.2) — every skill has ≥1 certifying step and ≥1 misconception; warn
   on skills with >6 misconceptions.
5. **Misconception fixtures** — every misconception ships a `triggers:` and `notTriggers:` code
   sample; the compiler *runs them through the real detector* and asserts the signature fires
   (resp. doesn't). This is the highest-value gate: it makes authored detection logic self-testing.
6. **Reference-impl agreement** — every `build` step's reference impl is run against its fixed
   `tests` to confirm the oracle itself is correct.
7. **Golden Diagnosis snapshots** — authors can attach example submissions with expected
   attribution/misconception; CI re-grades them and diffs (catches content regressions).

The compiler emits the immutable, content-addressed bundle + the derived indexes (§4.1).

### 13.3 Authoring tooling investment (the recommendation)

Treat tooling as a first-class deliverable, staged:

- **v1 (must-have):** the schema + validator + fixture-runner above, a CLI (`trellis lint`,
  `trellis build`, `trellis grade <step> <file>` to dry-run a submission), and rich error
  messages. This alone makes authoring safe without a GUI.
- **v1.5:** a **local preview harness** — run a single cell in the real runner against the local
  bundle with hot reload, so authors see exactly what learners see, including hint ladders.
- **v2 (defer):** a web authoring GUI with graph visualization, misconception-coverage heatmaps,
  and analytics on which misconceptions actually fire in production (closing the loop: under-firing
  signatures and never-unlocked nodes get flagged for revision).

Rationale: the expensive, error-prone part is *correctness of detection and gating*, which the
CLI validator + fixtures cover deterministically. A GUI improves authoring *velocity*, not
*correctness*, so it follows once content volume justifies it.

---

## 14. Non-functional requirements

**Performance budgets:**

| Path | Target |
|---|---|
| Sandbox cold warm-up (first build of session) | p95 < 4 s (lazy, with UI state) |
| `build` feedback (warm) | **p95 < 800 ms** end-to-end |
| `recognize`/`recall`/`predict` grade | < 30 ms (engine only) |
| Availability resolve | < 10 ms (O(nodes × requires)) |
| Step transition (unmount→mount) | < 100 ms perceived |
| Engine `diagnose` | < 5 ms (pure function) |

**Sandbox security model:** WASM memory-safe isolation; the **worker grader** has no `js` FFI, no
network, no DOM, no storage, a host-armed watchdog timeout via `worker.terminate()`, bounded
`WebAssembly.Memory`, and a fresh namespace per run. The **main-thread pygame runtime** necessarily
has `js` access (it reads `window.gameGen` and paints a canvas, §17), so it is *not* sandboxed from
the page the way the grader is — its safety rests on the async-loop contract, the AST pre-check that
rejects blocking loops, and the fact that it still has no server or filesystem to reach. Hidden
test/reference data is obscured in the static bundle but not cryptographically secret (§6.2). There
is **no server re-verification** — the static model has no server (§6.1, §15).

**Scalability:** there is no compute tier to scale. The site is static files behind a CDN, so
capacity is bandwidth and cache hit-rate, not request throughput — effectively unbounded, with cost
flat per byte served. All per-learner work (grading, model updates, telemetry) runs on each
learner's own device. Content is immutable and content-addressed → infinitely cacheable.

**Offline behavior:** after first load the app is **fully functional offline**. A service worker
precaches `index.html`, `runtime`, the content bundle, the pinned Pyodide runtime, the `pygame-ce`
wheel, and game assets; all learner state already lives in local IndexedDB. There is no "sync on
reconnect" to design — nothing was ever remote. The only operation that requires the network is the
very first visit (to populate the cache); subsequent sessions, including grading and graphical play,
work with the network off. Cross-device continuity is the one thing this gives up (§15).

**Accessibility:** all step kinds keyboard-navigable; the editor is a screen-reader-friendly
component (e.g. accessible CodeMirror) with announced diagnostics; attribution is conveyed by
**text/icon, not color alone** (color-blind safe); hint reveals are focus-managed; respects
reduced-motion for step transitions; targets WCAG 2.1 AA.

---

## 15. Open technical decisions

| Decision | Options | Recommendation | Trade-off accepted |
|---|---|---|---|
| **Hosting / backend** | Fully static (GitHub Pages) · Static-first then backend · Full backend now | **Fully static, no backend** (decided) | No server-authoritative grading, no truly-hidden tests, and **state is per-device with no cross-device sync**. Accepted for a low-stakes single-learner v1; the named upgrade path (below) re-introduces a server without touching the engine. |
| **Sandbox** | In-browser Pyodide/WASM · Backend execution service · Hybrid | **Pyodide, client-only** — Web Worker for headless grading, main thread for pygame (§17). No backend exists to fall back to. | Spoofable client with no re-verify; ~6–10 MB cold load; WASM-only languages; main-thread graphical loops can't be force-killed. We trade integrity for sub-second feedback and zero server cost — correct for low-stakes learning. |
| **Mastery representation** | Binary · Continuous 0–1 · BKT/decay | **Continuous 0–1 as operative value + optional BKT `pKnown` latent off the request path** | Two numbers per skill and a scheduler reading a different value than the gate; accepted to keep gating deterministic/explainable while enabling future spaced repetition. |
| **Skill granularity** | Fine · Coarse · Rule-based | **Rule: smallest unit that is independently certifiable AND has ≥1 distinct misconception; CI-linted (1–6 misconceptions)** | Some judgment calls remain at authoring time; the lint makes the boundary testable rather than subjective, at the cost of occasional merge/split churn. |
| **When to generalize AST/misconception to multiple languages** | Now (abstract early) · Never · Later behind a seam | **Build Python-specific now; isolate it behind a `LanguageAnalyzer` seam (parse→AstQuery match→tags) so a second language is an adapter, not a rewrite** | Carrying an abstraction with one implementation; cheap insurance. The `AstQuery` language is deliberately Python-ish but the *matcher contract* (code → tags) is language-neutral, so e.g. a JS/TS analyzer plugs in later without touching detection/diagnosis/hints. |

**The backend upgrade path (so "static now" doesn't become a rewrite later).** Because the engine is
pure and its effects are injected (§12), adding a server later means swapping *adapters*, not engine
code: `@trellis/persist` gains a remote implementation that writes through to an API and keeps
IndexedDB as a cache; `commitSubmission` optionally posts the `(submission, EvaluatorConfig, seed)`
for server re-verification, which can overrule the client Diagnosis; and a sync reconciler merges
per-device state. None of `resolve/evaluate/detect/diagnose/hintSelect/learnerModel` changes. Until
that day, none of it is built — no dead code.

The language seam concretely:

```ts
interface LanguageAnalyzer {
  language: string;
  run(req: RunRequest): Promise<RunResult>;
  parseAndMatch(code: string, queries: { tag: string; query: AstQuery }[]): Promise<string[]>;
}
// v1 registers only PythonAnalyzer (Pyodide). Engine code (detect/diagnose/hint) is
// language-agnostic: it consumes RunResult + astTags, never raw source.
```

---

## 16. Implementation / milestone plan

The proving slice is the **Output → Variables spine plus the string-concatenation extension** —
chosen because `node.string_concat` has a *multi-prerequisite* `requires` (string literal +
variable assignment + variable use), so unlocking it exercises real gating, not a linear chain.
Each milestone ends in something demonstrable.

**M0 — Schemas & monorepo skeleton.** `@trellis/schema` (all §3 types as TS + JSON Schema),
pnpm/Turbo workspaces, CI. *Proves:* the data model compiles and round-trips through validation.

**M1 — Content compiler & graph validation.** Author the Output and Variables spine nodes + the
string-concat extension in YAML; build the compiler with §13.2 gates (schema, refs, DAG, spine
connectivity, multi-prereq extension edge). *Proves:* authored content → immutable bundle; cycle
detection and the three-edge `requires` model work; a deliberately-cyclic fixture fails the build.

**M2 — Engine core (pure, no sandbox).** `resolveAvailability`, `nextSpineCell`, step machine for
`watch`/`recognize`/`recall`/`predict`, `diagnose` for non-build, `applyDiagnosis`, continuous
mastery update. *Proves:* gating math — with `string.literal` mastered but `var.assign` not, the
extension stays locked; mastering both flips it to available (the availability *diff*). All in
unit tests, no UI.

**M3 — Sandbox + build ladder.** `@trellis/sandbox` Pyodide worker (run/timeout/memory/AST via
`ast`); `evaluate` running Run→Test→AST→Property; seeded property generation + shrinking. *Proves:*
sub-second warm `build` feedback; a correct-but-unanticipated solution (f-string vs `str()`)
passes via property/oracle; an infinite loop is killed by the watchdog.

**M4 — Misconception + hints end-to-end.** Wire the concat taxonomy: `implicit_coercion` signature
(runtime error OR `implicit_coerce` AST tag) → attribution `misconception` → authored feedback →
4-level learner-dosed hint ladder. Fixture-runner gate green. *Proves:* the full deterministic
feedback path: a learner writing `'age: ' + age` gets the *right* misconception, the *right*
feedback, and a pullable ladder — and the same input always yields the same Diagnosis.

**M5 — Presentation slice (still no backend).** `CellRunner` with keyed step replacement, editor,
peek-back panel, attribution-colored feedback, hint panel; `@trellis/persist` over IndexedDB with
the single-transaction `commitSubmission`; content loaded as a static JSON fetch. *Proves:* a real
learner walks Output → Variables → unlocks String-Concat → hits the coercion misconception → climbs
the hint ladder → passes, with mastery surviving a page reload — the whole machine end to end on the
chosen slice, served from `python -m http.server` with zero server logic.

**M6 — Behavior logging & proactive scaffolding.** Stand up `@trellis/telemetry` as a standalone
component: the `EventBus`, `Recorder`, `IdleDetector` (with an injected clock), `SignalDeriver`, and
`EventBuffer`, wired so UI components only `emit(UiEvent)` and never touch the logger directly. Then
the four deterministic trigger rules and the `wrong_predict_then_correct_run` proactive offer on the
concat `predict` step. *Proves:* actions, pauses, and resubmissions are captured cleanly through one
seam, and the system proactively scaffolds a silent, struggling learner — closing the loop the design
identifies as most valuable. (Unit-test the `IdleDetector` with a fake clock to prove pause detection
is deterministic.)

**M6.5 — Graphical build step (pygame).** Stand up the §17 main-thread runtime and author one
graphical `build` step (e.g. "make the ball bounce off the walls") graded headlessly via the
SDL-dummy + scripted-input + fixed-`dt` harness, with an AST blocking-loop pre-check and the
`gameGen` lifecycle wired to the step machine's `RELEASED` transition. *Proves:* a graphical lesson
grades deterministically and the two-runtime model (worker grader + main-thread player) coexists.

**M7 — Hardening.** Service-worker precaching for full offline (Pyodide + wheel + bundle + assets),
"export/delete my data," WCAG-AA accessibility pass, authoring preview harness (v1.5), and explicit
**iOS Safari validation** of both the headless grader and the pygame runtime (the riskiest target,
§14/§17). No server re-verification — it does not exist in this model. *Proves:* the non-functional
guarantees hold offline, on assistive tech, and on the flakiest browser.

After M5 the platform is a working vertical slice; M0–M4 are the deterministic core that everything
else hangs from and should be built and tested in that order. M6.5 layers the graphical runtime onto
that proven core rather than entangling it.

---

## 17. Graphical build steps — the static pygame runtime

This section integrates the *Static Pygame Runtime* prototype into Trellis. It specializes the
`build` step (§3.4, `runtime: "pygame"`) so a learner can write and run a real `pygame-ce` program
in the browser, and — critically — so that program can still be **graded deterministically** despite
being a continuously-rendering game. It inherits every constraint from the rest of this document:
**fully static, no backend** (§2/§12), deterministic evaluation (§1/§6), and the misconception →
diagnosis → hint pipeline (§7–§9) unchanged. The headline requirement the prototype must satisfy
remains: *push static files to GitHub Pages, open the URL, a pygame window appears and runs.*

### 17.1 Why pygame forces a second runtime (and how it coexists with the worker grader)

`pygame-ce` is a first-class Pyodide package (≥0.26) but its SDL→canvas layer is **main-thread-only
and single-threaded** — it cannot run in a Web Worker. This collides with §6.1, where headless
`build` grading runs *in a worker* precisely so a runaway loop can be force-killed via
`worker.terminate()`. The resolution is a **two-runtime model**, both sharing one pinned Pyodide
build loaded from the CDN:

| Runtime | Where | Used for | Kill switch |
|---|---|---|---|
| **Worker grader** (`@trellis/sandbox`) | Web Worker | Headless Run/Test/AST/Property for all `build` steps, *including the headless grading pass of pygame steps* (§17.5) | `worker.terminate()` (§6.1) |
| **Graphical runtime** (`@trellis/runtime`) | Main thread | *Playing* a pygame step live (the canvas the learner sees and controls) | Cooperative only — `gameGen` guard + AST pre-check (§17.5) |

The important consequence: **grading never happens on the main thread.** When a learner submits a
pygame step, the live game is stopped (gameGen bumped, §17.3) and the *same source* is re-run
headlessly in the worker for evaluation. The learner sees the game on the main thread; the verdict
comes from the worker. This keeps the deterministic guarantee and the force-kill safety intact, and
confines the un-killable main-thread execution to *play*, never to *grading*.

Single-threaded use also means **no `SharedArrayBuffer`, hence no `COOP`/`COEP` headers** — which is
exactly why a header-less static host like GitHub Pages works at all. This is a load-bearing reason
the whole "no backend" model is viable for graphics.

### 17.2 Static runtime stack and boot ordering

The prototype's stack is adopted wholesale, with the Trellis SPA as the shell. Files served
statically:

```
/ (GitHub Pages root)
├── index.html          # Trellis SPA shell; includes <canvas id="canvas" tabindex="0"> for pygame
├── trellis.[hash].js   # the React app + engine + adapters (bundled)
├── content/bundle.json # compiled content (§13)
└── assets/             # game image/sound assets, fetched into Pyodide FS on demand
   (Pyodide runtime + pygame-ce wheel are pulled from a PINNED CDN url, not committed — §10 of the
    prototype; committing tens of MB of WASM would bloat the repo and burn Pages bandwidth.)
```

**Boot ordering is load-bearing** (violations fail silently). For a pygame step the main-thread
runtime performs, in order:

```
1. loadPyodide()                                  (pinned version; shared with worker grader build)
2. pyodide.canvas.setCanvas2D(canvasEl)           # BEFORE any pygame import — else set_mode paints nowhere
3. await pyodide.loadPackage("pygame-ce")
4. write the step's assets into pyodide.FS at the paths the game expects  (before the game reads them)
5. set window.gameGen = (current generation)
6. await pyodide.runPythonAsync(<locked preamble> + learnerSource)
```

The two rules that silently break things if violated, carried verbatim from the prototype: **canvas
registered before pygame import** (step 2 before step 6), and **assets present before the game reads
them** (step 4 before step 6). The runtime exposes `boot()/start()/stop()/restart()` exactly as the
prototype specifies.

**Keyboard scoping is now mandatory, not belt-and-suspenders.** The prototype notes SDL globally
`preventDefault`s key events and that scoping is optional only when nothing else on the page is
focusable. In Trellis the page *always* contains a focusable code editor, so the locked preamble
must set, before display creation:

```python
os.environ["SDL_EMSCRIPTEN_KEYBOARD_ELEMENT"] = "#canvas"
```

so SDL captures keys only while the canvas holds focus and the editor keeps working. (Keep the
documented JS-module fallback `pyodide._module.keyboardListeningElement = canvas` for Pyodide builds
where the canvas API surface differs — §14 of the prototype.)

### 17.3 Mapping the async-loop contract onto the step state machine

Every pygame program obeys the prototype's **async-loop contract**: an `async def main()` that
`await asyncio.sleep(1/fps)` each frame (handing control back to the browser's single thread so the
tab never freezes — `clock.tick()` does not yield and must not be used), guarded by a generation
counter:

```python
import asyncio, os, pygame
from js import window
os.environ["SDL_EMSCRIPTEN_KEYBOARD_ELEMENT"] = "#canvas"   # before display
pygame.init()
screen = pygame.display.set_mode((W, H))
GEN = int(window.gameGen)                 # capture this run's id
async def main():
    while int(window.gameGen) == GEN:     # exit cleanly when restart bumps gameGen
        handle_events(pygame.event.get())
        update(dt=FRAME_DT)               # FRAME_DT injected — see §17.5
        draw(screen); pygame.display.flip()
        await asyncio.sleep(1 / 60)       # yields to the browser; the heartbeat
asyncio.ensure_future(main())
```

This maps cleanly onto the step lifecycle (§5.1). The `gameGen` integer on `window` is the bridge
between the JS step machine and the running Python loop:

| Step machine transition (§5.1) | Runtime action |
|---|---|
| `PENDING → ACTIVE` (pygame step entered) | `start()`: bump `gameGen`, run source; canvas comes alive |
| learner presses **Run** / resubmits | `restart()`: bump `gameGen` (old loop's `while` goes false next frame → exits), re-run edited source — no stacked loops, the prototype's core safety property |
| `ACTIVE → EVALUATING` (submit) | `stop()` (bump `gameGen`, schedule nothing) → the live loop returns; then grade headlessly in the worker (§17.5) |
| `FEEDBACK → RELEASED` (advance) | `stop()` + drop the runtime's Python namespace so the next step starts clean |

So the prototype's `gameGen` lifecycle *is* Trellis's step-replacement mechanism for graphical steps:
unmounting the `PygameStage` component bumps the generation, which is what guarantees a released
step's loop is dead before the next step mounts.

### 17.4 Authoring a graphical build step

A pygame step is a `BuildStep` with `runtime: "pygame"`. Its `EvaluatorConfig` gains a `graphical`
block that makes grading deterministic by separating *what the learner controls* from the
non-deterministic rendering:

```ts
interface EvaluatorConfigGraphical extends EvaluatorConfig {
  graphical: {
    // The learner is asked to implement/modify pure-ish logic the harness can drive headlessly.
    // The harness imports the learner module under SDL_VIDEODRIVER=dummy (no real window) and
    // drives it frame-by-frame with a fixed dt and a scripted input tape.
    entrypoints: {
      init?: string;        // e.g. "make_state" → returns the game state object
      update: string;       // e.g. "update(state, events, dt) -> state"  (pure step function)
      // optional: a function exposing observable scalars for assertions
      probe?: string;       // e.g. "probe(state) -> {x, y, vx, vy, score}"
    };
    inputTape: ScriptedFrame[];   // deterministic synthetic input, one entry per simulated frame
    dt: number;                   // fixed seconds-per-frame fed to update (e.g. 1/60)
    frames: number;               // how many frames to simulate
    // Then the normal ladder runs over the resulting probe trajectory:
    //   tests:    assertions on probe() at specific frames (e.g. "ball y reverses after frame 30")
    //   property: compare the probe trajectory to a reference update() over generated start states
    //   ast:      structural checks on the learner's code (e.g. "reads pygame.K_LEFT")
  };
}

interface ScriptedFrame {
  keysDown?: string[];          // e.g. ["K_LEFT"]
  mouse?: { x: number; y: number; buttons: number };
}
```

The authoring guidance (enforced by a content lint, §13): a gradable pygame step must factor the
game into a **pure `update(state, events, dt) -> state`** plus a `draw(state, screen)` that the
harness never calls. Rendering is for the human; `update` is what gets graded. This is the standard
"separate simulation from presentation" discipline and it is what makes a *game* fit a
*deterministic* grader. Steps that are purely expressive ("draw something you like") are authored as
`watch`-adjacent `build` steps with no `tests`/`property` — they Run-only (does it execute) and get
style/AST feedback, never a pass/fail on output.

### 17.5 Deterministic headless grading + runaway-loop safety

**Determinism.** Grading a game is deterministic because the harness removes every source of
nondeterminism the prototype's *play* path tolerates:

- **No real display:** the worker imports the learner's module with `SDL_VIDEODRIVER=dummy` and
  `SDL_AUDIODRIVER=dummy`, so `pygame` initializes with no canvas, no audio, no browser frame.
- **No wall clock:** the harness never calls `clock.tick()` or reads real time; it feeds the fixed
  `dt` into `update`. Frame *n* always sees the same `dt` and the same scripted input.
- **Scripted input:** `inputTape` replaces live keyboard/mouse with a fixed per-frame sequence, so
  the event stream is identical on every run.
- **Seeded randomness:** if the game uses `random`, the harness seeds it from
  `PropertyConfig.seed`; the reference `update` is seeded identically. (Same rule as §6.4.)

The result is that running `update` for `frames` steps over `inputTape` yields a **fixed probe
trajectory**, which the §6.2–§6.4 ladder grades exactly as it grades any other `build`: `tests` are
assertions on probe values at chosen frames; `property` compares the trajectory to a reference
`update` over generated initial states (catching, e.g., "forgot to clamp the ball at the wall" that
a single fixed start would miss); AST tags feed misconceptions (§7) unchanged — e.g. a tag
`reads_no_input` ("never checks any `K_*` constant") drives a "your paddle ignores the keyboard"
misconception. **No part of the graphical path introduces probabilistic inference** (§1 holds).

**Runaway-loop safety on the main thread.** The worker grader can be force-killed; the main-thread
*player* cannot (`terminate()` does not apply to the main thread, and a blocking `while True:`
without `await` would freeze the tab — the prototype's central hazard). Three deterministic guards,
in order:

1. **AST pre-check before play.** Before `runPythonAsync` on the main thread, the runtime parses the
   learner source (reusing the §6.3 AST machinery) and **refuses to run** any top-level/`main` loop
   that lacks an `await` inside it, surfacing an attribution-`syntax`-flavored message: *"This loop
   never yields to the browser — add `await asyncio.sleep(1/60)` so the page stays responsive."*
   This converts the worst freeze into a teachable, deterministic rejection.
2. **The `gameGen` guard** ensures any *well-formed* loop is cooperatively stoppable each frame.
3. **A watchdog** measures wall-time between yields via `requestAnimationFrame`; if a frame budget is
   blown repeatedly it shows a non-modal "the game stopped responding — Reset" affordance (a full
   page reload is the last-resort recovery, since the main thread can't be surgically killed).

Grading itself is immune to (1)–(3): it runs headlessly in the worker, where the §6.1 watchdog
`terminate()` handles infinite loops the AST check didn't catch.

### 17.6 Editor seam and locked regions

The prototype keeps `game/main.py` as a *fetched standalone file* precisely so an editor can sit on
top; Trellis is that editor layer. A pygame `build` step renders an editor bound to the step's
`starterCode`, with `lockedRegions` (§3.4) marking non-editable lines — the locked **preamble**
(imports, `SDL_EMSCRIPTEN_KEYBOARD_ELEMENT`, `pygame.init`, `set_mode`, the `gameGen` capture and
the `async def main` scaffold with its `await`) is always locked, so the learner edits only the
lesson's target region (e.g. the body of `update`). Locking the preamble is also what lets the AST
pre-check (§17.5) assume the yield contract is structurally present and only police the learner's
own region. "Run" re-executes via `restart()` (§17.3); "Submit" routes the same source to the
headless grader.

### 17.7 Reconciliation with the static / no-backend model, and performance

- **Still zero backend.** Everything above runs from static files: Pyodide + the `pygame-ce` wheel
  come from a pinned CDN; assets are static; the worker grader and main-thread player are the same
  two adapters from §12. No header configuration is needed or possible on Pages, and none is required
  (§17.1). Service-worker precaching (§14) makes pygame steps work fully offline after first load.
- **One Pyodide download, shared.** The graphical runtime and the worker grader load the *same
  pinned Pyodide build*; the ~6–10 MB cost (§14) is paid once per cache lifetime and amortized across
  both. The `pygame-ce` wheel is an additional one-time fetch, lazy-loaded only when the learner
  first reaches a pygame step.
- **Performance budgets (additive to §14):** target **60 FPS** for play via `await asyncio.sleep`
  pacing (with the known caveat that this pacing is *approximate*; if precise timing ever matters,
  switch the play loop to `requestAnimationFrame`-driven stepping — an open risk, §17.8). Headless
  grading of a pygame step is bounded by `frames × per-frame update cost`; with `frames ≤ ~600`
  (10 simulated seconds) and a modest `update`, grading stays within the §14 sub-second budget. Keep
  per-frame work modest and cap particle counts (the prototype's CPU caveat).
- **Audio gating:** browsers block autoplay until a user gesture, so authored content must not start
  sound on load; trigger the first sound from a keypress/click (prototype §11). The headless grader
  uses the dummy audio driver, so audio never affects a verdict.

### 17.8 Risks folded in from the prototype

- **SDL/canvas is experimental in Pyodide.** Pin the Pyodide version in the loader URL; re-run the
  M6.5 + M7 validation on every deliberate bump. Keep the `keyboardListeningElement` fallback
  documented.
- **iOS Safari is the flakiest target.** Treat as a known risk, not an assumption; M7 mandates
  hands-on device validation of both runtimes and confirms the no-audio-on-start rule.
- **Frame-pacing accuracy.** `asyncio.sleep` pacing is approximate; the documented escape hatch is a
  `requestAnimationFrame`-driven play loop if a lesson ever needs precise timing. This affects *play*
  only — grading uses a fixed injected `dt` and is unaffected.

These map onto the existing build plan as **M6.5** (§16): graphical runtime + one headless-graded
pygame step, proving the two-runtime model on the already-proven deterministic core.
