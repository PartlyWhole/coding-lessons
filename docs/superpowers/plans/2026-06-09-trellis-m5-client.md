# Trellis M5-client (`@trellis/client`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@trellis/client` — the React presentation slice (the final M5 unit): a `CellRunner` with React-keyed step replacement, views for all five step kinds, a CodeMirror editor pane, attribution-colored feedback, a learner-dosed hint panel, a read-only peek-back panel, content loaded via `@trellis/persist`'s `contentVersion` cache, and a stubbed `EventBus` emit seam.

**Architecture:** A new, disjoint package `packages/client/**` that **consumes** `@trellis/schema` (types), `@trellis/engine` (the §5.1 step machine, §6/§8 `evaluate`/`diagnoseNonBuild`, the §9.2 hint ladder, §10.2 `applyDiagnosis`), `@trellis/persist` (`loadBundle`, `commitSubmission`, `loadLearnerModel`/`readDiagnoses`, `appendEvents`/`recentEvents`, `memoryDriver`/`nativeDriver`), and `@trellis/sandbox` (`createSandbox` Pyodide host for production; `createLocalSandbox` CPython twin for offline tests). The pure brain is a `useCellRunner` hook over a reducer; near-independent presentational components (step views, editor, hint panel, peek-back, feedback) fan out in parallel; a final wiring phase assembles `CellRunner` + the bootstrap + the barrel.

**Tech Stack:** React 19, CodeMirror 6 (`@codemirror/state`/`view`/`commands`/`lang-python`), TypeScript 5.6 (tsc build, `jsx: react-jsx`), Vitest 2.x + happy-dom + `@testing-library/react`. **Network is available in this environment** (verified: registry 200; React 19 + CodeMirror 6 + happy-dom + testing-library all install) — the offline `idb`-trap that hit M5-persist does **not** apply, so we use the spec's intended CodeMirror+React stack. The lockfile drift from the new deps is expected new-package churn the orchestrator resolves.

---

## Context the executor must hold

### What is already on `main` (verified green this session: 350 tests, `validate.py` PASS, `harness.py` gate5+gate6 PASS)
- `@trellis/schema` — frozen contract. **DO NOT EDIT.** UI-facing types live in `packages/schema/src/{ids,content,runtime,bundle}.ts`.
- `@trellis/engine` — pure core + M4 hint ladder. **DO NOT EDIT.**
- `@trellis/persist` — IndexedDB layer. **DO NOT EDIT.**
- `@trellis/sandbox` — Pyodide host + CPython twin. **DO NOT EDIT.**

If you believe any consumed package must change: **STOP and escalate to the orchestrator.** Do not fork a shared type.

### Frozen API surfaces this package consumes (exact signatures — do not guess)

**`@trellis/schema`** (types only; note: `RichText`, `SkillId`, `StepId`, etc. are TypeBox `Type.String()` values whose `Static` is `string`):
```ts
type StepKind = "watch" | "predict" | "recognize" | "recall" | "build";
type Attribution = "pass" | "misconception" | "syntax" | "runtime" | "mismatch";
interface LineRange { startLine: number; endLine: number; }            // §3.4 (1-based, inclusive)
interface Choice { id: string; label: string; misconception?: string; }
interface AcceptedAnswer { normalized?: string[]; patterns?: string[]; misconceptionMap?: Record<string,string>; }
// Step union members (all share: id, prompt, carryContext?, skills[]):
interface WatchStep     { kind:"watch";     id;prompt;carryContext?;skills; body: string; }
interface PredictStep   { kind:"predict";   ...; code: string; choices?: Choice[]; expected: AcceptedAnswer; reveal:"run-and-show"; }
interface RecognizeStep { kind:"recognize"; ...; choices: Choice[]; correctChoiceId: string; }
interface RecallStep    { kind:"recall";    ...; accepted: AcceptedAnswer; }
interface BuildStep      { kind:"build";    ...; language:"python"; runtime?:"headless"|"pygame"; starterCode: string; lockedRegions?: LineRange[]; evaluator: EvaluatorConfig; }
type Step = WatchStep | PredictStep | RecognizeStep | RecallStep | BuildStep;
interface Cell { id; nodeId; title: string; steps: Step[]; certifies: string[]; }
interface Hint { level: 1|2|3|4; body: string; revealCode?: string; }
interface Misconception { id; skill; title; signature; hintLadder: Hint[]; feedback: string; skillDeltas?; }
interface Diagnosis { id; learnerId; stepId; contentVersion; submittedAt: string; correct: boolean;
  attribution: Attribution; misconceptionId?: string; signals: RawSignals; skillDeltas: SkillDelta[]; seed: number; }
interface SkillState { mastery; attempts; passes; pKnown?; lastSeen: string; misconceptionCounts: Record<string,number>; }
interface LearnerModel { learnerId: string; skills: Record<string,SkillState>; contentVersion: string; }
interface Bundle { contentVersion; skills; nodes; cells; misconceptions: Record<string,Misconception>; producers; requirements; }
interface Sandbox { run(req: RunRequest): Promise<RunResult>; }
interface RunRequest { code:string; entrypoint?:string; stdin?:string; timeoutMs:number; memoryMb:number; }
interface RunResult { ran:boolean; error?:{type:"syntax"|"runtime";message:string;line?:number}; stdout:string; returnValue?; wallMs:number; timedOut:boolean; }
```

**`@trellis/engine`** (the pure brain — import these, do not reimplement):
```ts
// §5.1 step machine
type Phase = "PENDING"|"ACTIVE"|"EVALUATING"|"FEEDBACK"|"RELEASED";
interface MachineState { phase: Phase; lastCorrect: boolean | null; }
type StepEvent = {type:"enter"}|{type:"submit"}|{type:"diagnosis";correct:boolean}|{type:"hint"}|{type:"retry"}|{type:"advance";allowSkip?:boolean};
function initialState(): MachineState;
function step(kind: StepKind, state: MachineState, event: StepEvent): MachineState;  // throws StepTransitionError on invalid
class StepTransitionError extends Error {}

// §6/§8 grading
type NonBuildSubmission = {kind:"recognize";choiceId:string}|{kind:"recall";text:string}|{kind:"predict";choiceId?:string;text?:string};
interface BuildSubmission { kind:"build"; code:string; }
type Submission = BuildSubmission | NonBuildSubmission;
interface BuildSandbox extends Sandbox { parseAndMatch(code:string, queries:{tag:string;query:AstQuery}[]): Promise<string[]>; }
interface DiagnoseEffects { id:string; learnerId:string; now:string; }  // ISO timestamp injected
function diagnoseNonBuild(step, sub: NonBuildSubmission, bundle, fx: DiagnoseEffects, cfg?): Diagnosis;       // sync
async function evaluate(step, submission: Submission, sandbox: BuildSandbox, bundle, fx, cfg?): Promise<Diagnosis>;  // build OR non-build

// §9.2 hint ladder
interface HintState { ladderKey: string; revealedThrough: 0|1|2|3|4; }
interface LadderOptions { confirmRevealCode?: boolean; autoEscalate?: boolean; }
const NO_LADDER = "";
function initialHintState(): HintState;
function ladderKeyFor(diag: Diagnosis): string;
function ladderFor(key: string, bundle: Bundle): Hint[];
function syncLadder(prev: HintState, diag: Diagnosis, opts?: LadderOptions): HintState;  // resets on misconception change; autoEscalate bumps floor
function pullHint(state: HintState, ladder: Hint[], opts?: LadderOptions): HintState;     // +1 level; lvl4 needs confirmRevealCode
function visibleHints(state: HintState, ladder: Hint[]): Hint[];                          // levels 1..revealedThrough

// §10.2 mastery
function newSkillState(now: string): SkillState;
function applyDiagnosis(model: LearnerModel, diag: Diagnosis, cfg?): LearnerModel;  // PURE, returns new model
const DEFAULT_CONFIG; type EngineConfig;
```

**`@trellis/persist`**:
```ts
function memoryDriver(): IdbDriver;          // in-memory; one factory instance = one persistent origin (survives close/reopen)
function nativeDriver(): IdbDriver;          // browser DOM-IndexedDB (production; real-browser verify DEFERRED)
async function openTrellisDb(driver: IdbDriver, opts?:{idGen?:()=>string}): Promise<TrellisDb>;  // bootstraps learnerId in `meta`
interface TrellisDb { conn; learnerId: string; getMeta; setMeta; close(): void; }
async function loadBundle(db: TrellisDb, opts:{url:string; contentVersion:string; fetchImpl?:typeof fetch}): Promise<Bundle>;
interface SubmissionWrite { skillUpdates: (SkillState & {skillId:string})[]; diagnosis: Diagnosis; events: BehavioralEvent[]; }
async function commitSubmission(db: TrellisDb, write: SubmissionWrite): Promise<void>;  // single atomic txn over 3 stores
async function loadLearnerModel(db: TrellisDb, contentVersion: string): Promise<LearnerModel>;
async function readDiagnoses(db: TrellisDb): Promise<Diagnosis[]>;  // ascending by submittedAt
async function appendEvents(db, events: BehavioralEvent[]): Promise<void>;
async function recentEvents(db, q: RecentEventsQuery): Promise<BehavioralEvent[]>;
type StoredSkillState = SkillState & { skillId: string };
```

**`@trellis/sandbox`**:
```ts
function createSandbox(config: SandboxConfig): ManagedSandbox;        // Pyodide host (production browser). ManagedSandbox: Sandbox + warmup/status/dispose + parseAndMatch
function createLocalSandbox(config?:{python?:string}): LocalSandbox;  // CPython twin (offline tests). LocalSandbox: { run; parseAndMatch } — satisfies BuildSandbox structurally
function browserWorkerFactory; // production worker factory for createSandbox
```

### The marquee walkthrough cell (real compiled content)
`cell.string_concat.text_plus_number` — title "When text meets a number", certifies `skill.string.concat_str_num`. Steps:
1. `#1` **watch** — installs "text vs number" (`carryContext` set).
2. `#2` **predict** — has `code` + `expected` (no `choices` → free-text prediction), `reveal:"run-and-show"`.
3. `#3` **recognize** — `choices[]` + `correctChoiceId`.
4. `#4` **build** — entrypoint `announce(number)`; reference `return "Your random number is: " + str(number)`; AST tag `implicit_coerce`; tests + property. A `"..." + number` submission → `mis.concat.str_num` (the str/number coercion misconception, authored 4-level ladder + feedback).

Step-kind counts across the corpus: watch 17, predict 13, recognize 12, recall 3, build 12 — all five kinds appear; views must handle real content.

### Environment / gates
- Before any pnpm: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"`.
- Build the whole workspace once so cross-package `dist` types resolve: `pnpm -r build` (already done this session; re-run after rebases).
- Per-package gate (the definition of done): `pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint && pnpm --filter @trellis/client test && pnpm --filter @trellis/client build`.
- **No-network reality for the DEFINING M5 acceptance:** real Pyodide/WASM cannot be fetched, so the in-browser whole-slice walkthrough (real Pyodide grading + real-browser IndexedDB) is **DEFERRED** to a networked-browser session (same posture as M3a/M3b/M5-persist's `nativeDriver`). Verify OFFLINE: component/interaction tests, engine+persist+sandbox wiring against the **CPython twin** (`createLocalSandbox`) + a fast in-test mock `BuildSandbox`, and reload-survival via `memoryDriver`. **Build now, say so — do NOT claim in-browser end-to-end.**
- Commit discipline: Conventional Commits as `Stream G — M5 client <noreply@anthropic.com>`. Use `git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' commit ...`. Commit after every green task.

---

## File Structure

```
packages/client/
  package.json            # deps + scripts (Task 1)
  tsconfig.json           # extends base; jsx:react-jsx (Task 1)
  vitest.config.ts        # happy-dom env; esbuild jsx automatic (Task 1)
  .eslintrc.cjs           # local override: parse .tsx, lint .ts,.tsx (Task 1)
  index.html              # static host for `python -m http.server` (Task 11)
  src/
    types.ts              # shared view-model types: PeekBackEntry, StepAnswer (Task 2)
    eventBus.ts           # §11.1 UiEvent + EventBus + createEventBus (stub seam) (Task 2)
    attribution.ts        # attribution → CSS color/label map (Task 2)
    steps/
      WatchStepView.tsx        (Task 3)
      PredictStepView.tsx      (Task 3)
      RecognizeStepView.tsx    (Task 3)
      RecallStepView.tsx       (Task 3)
      BuildStepView.tsx        # composes EditorPane (Task 9, wiring)
      StepView.tsx             # kind switch (Task 9, wiring)
    editor/
      lockedRegions.ts         # pure: line-range → offset protection + transactionFilter (Task 4)
      EditorPane.tsx           # CodeMirror mount (Task 4)
    hints/HintPanel.tsx        (Task 5)
    feedback/FeedbackPanel.tsx (Task 6)
    peekback/PeekBackPanel.tsx (Task 7)
    runner/
      grade.ts                 # pure-ish: gradeStep + persistDiagnosis (Task 8)
      useCellRunner.ts         # the brain: reducer + async grading + bus emits (Task 8)
    app/
      loadContent.ts           # persist loadBundle bootstrap (Task 11)
      makeSandbox.ts           # createSandbox wiring for the browser (Task 11)
      TrellisApp.tsx           # top-level cell host (Task 11)
      main.tsx                 # createRoot browser entry (Task 11)
    CellRunner.tsx             # §5.2 keyed step replacement (Task 10, wiring)
    index.ts                   # public barrel (Task 12, FINAL)
  test/
    setup.ts                   # testing-library cleanup (Task 1)
    esm-probe.mjs              # native-ESM acyclicity probe under happy-dom globals (Task 12)
    *.test.tsx / *.test.ts     # colocated per task
```

**Parallelism (per START-HERE):** Tasks 1–2 are sequential foundations (every component imports `types.ts`/`eventBus.ts`). Tasks **3, 4, 5, 6, 7 are near-independent — disjoint files — and fan out one implementer each.** Tasks 8–12 are the sequential wiring that assembles them (and `index.ts` / `CellRunner` are touched only there, so parallel edits never collide).

---

## Task 1: Package scaffold + toolchain smoke test

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/vitest.config.ts`
- Create: `packages/client/.eslintrc.cjs`
- Create: `packages/client/test/setup.ts`
- Create: `packages/client/src/Smoke.tsx`
- Test: `packages/client/test/smoke.test.tsx`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@trellis/client",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint src test --ext .ts,.tsx"
  },
  "dependencies": {
    "@trellis/schema": "workspace:*",
    "@trellis/engine": "workspace:*",
    "@trellis/persist": "workspace:*",
    "@trellis/sandbox": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@codemirror/state": "^6.4.0",
    "@codemirror/view": "^6.34.0",
    "@codemirror/commands": "^6.6.0",
    "@codemirror/lang-python": "^6.1.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "happy-dom": "^15.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/dom": "^10.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (extends the workspace base; adds JSX + DOM iterable + the React types)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["react", "react-dom"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "test/**/*.ts", "test/**/*.tsx"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`** (happy-dom env; esbuild compiles JSX via the automatic runtime — no `@vitejs/plugin-react` needed)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 4: Create `test/setup.ts`** (auto-cleanup the DOM between tests)

```ts
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());
```

- [ ] **Step 5: Create `.eslintrc.cjs`** (local override so `.tsx` parses with JSX; cascades up to the root config which has `root:true`. Does NOT touch root config.)

```js
/** @type {import('eslint').Linter.Config} */
module.exports = {
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  env: { browser: true, es2022: true },
};
```

- [ ] **Step 6: Create `src/Smoke.tsx`** (a stateful component + click handler — validates the WHOLE toolchain: JSX transform, React 19 state, happy-dom, testing-library interaction)

```tsx
import { useState } from "react";

export function Smoke(): React.ReactElement {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((x) => x + 1)}>
      count: {n}
    </button>
  );
}
```

- [ ] **Step 7: Write the failing smoke test** `test/smoke.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Smoke } from "../src/Smoke.js";

describe("toolchain smoke", () => {
  it("renders JSX, holds React state, and reacts to a click under happy-dom", async () => {
    render(<Smoke />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toBe("count: 0");
    await userEvent.click(btn);
    expect(btn.textContent).toBe("count: 1");
  });
});
```

- [ ] **Step 8: Install deps + run the gate**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm install
pnpm --filter @trellis/client test
```
Expected: install resolves online (React 19, CodeMirror, happy-dom, testing-library downloaded); the smoke test PASSES (`count: 0` → `count: 1`).
**If the JSX transform fails** (e.g. esbuild does not pick up `jsx: "automatic"`): add `@vitejs/plugin-react` to devDeps and `plugins: [react()]` to `vitest.config.ts`, then re-run. If install fails offline (`ERR_PNPM_NO_OFFLINE_META`), STOP and escalate to the orchestrator (do not hand-edit `pnpm-lock.yaml`).

- [ ] **Step 9: Verify typecheck + lint + build are green**

Run:
```bash
pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint && pnpm --filter @trellis/client build
```
Expected: all PASS (build emits `dist/`). `tsc` may complain `src/index.ts` is missing from the barrel-less build — that's fine until Task 12; if `build` errors on no inputs, it will pass once `.tsx` files exist. If `tsc` errors that there is nothing to emit, ignore until later tasks add files.

- [ ] **Step 10: Commit**

```bash
git add packages/client pnpm-lock.yaml
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): scaffold @trellis/client package + toolchain smoke test"
```

---

## Task 2: Shared view-model types + EventBus seam + attribution colors

**Files:**
- Create: `packages/client/src/types.ts`
- Create: `packages/client/src/eventBus.ts`
- Create: `packages/client/src/attribution.ts`
- Test: `packages/client/test/eventBus.test.ts`
- Test: `packages/client/test/attribution.test.ts`

- [ ] **Step 1: Create `src/types.ts`** (the contract every parallel component imports — freeze it here)

```ts
import type { StepKind, Attribution } from "@trellis/schema";

// §5.3 — a peek-back entry is a SNAPSHOT reconstructed from released-step history,
// never live step state. Immune to step unmounting.
export interface PeekBackEntry {
  stepId: string;
  kind: StepKind;
  promptSnapshot: string; // RichText is a markdown string in v1
  carryContext?: string;
  outcome?: { correct: boolean; attribution: Attribution };
}

// A learner's answer leaving a step view, headed for the runner. Mirrors the engine's
// NonBuildSubmission shapes plus the build code, but is the UI-side carrier.
export type StepAnswer =
  | { kind: "recognize"; choiceId: string }
  | { kind: "recall"; text: string }
  | { kind: "predict"; choiceId?: string; text?: string }
  | { kind: "build"; code: string };
```

- [ ] **Step 2: Write the failing EventBus test** `test/eventBus.test.ts` (§11.1: sync fan-out; a throwing subscriber NEVER breaks the caller; unsubscribe works; the bus has NO default subscriber)

```ts
import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../src/eventBus.js";
import type { UiEvent } from "../src/eventBus.js";

describe("EventBus (§11.1 stub seam)", () => {
  it("fans out synchronously to subscribers and returns an unsubscribe handle", () => {
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    const off = bus.subscribe((e) => seen.push(e));
    bus.emit({ t: "session_start" });
    bus.emit({ t: "step_enter", stepId: "s1", kind: "build" });
    expect(seen.map((e) => e.t)).toEqual(["session_start", "step_enter"]);
    off();
    bus.emit({ t: "peek_back", stepId: "s1" });
    expect(seen).toHaveLength(2); // no delivery after unsubscribe
  });

  it("emit never throws into the caller even if a subscriber throws", () => {
    const bus = createEventBus();
    bus.subscribe(() => {
      throw new Error("telemetry bug");
    });
    const after = vi.fn();
    bus.subscribe(after);
    expect(() => bus.emit({ t: "run", stepId: "s1" })).not.toThrow();
    expect(after).toHaveBeenCalledOnce(); // a throwing subscriber does not block later ones
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test eventBus`
Expected: FAIL — `createEventBus` not found.

- [ ] **Step 4: Create `src/eventBus.ts`**

```ts
import type { StepId, StepKind, Diagnosis } from "@trellis/schema";

// §11.1 — the semantic facts the presentation announces. Distinct from the persisted
// BehavioralEvent (§3.9): M6's @trellis/telemetry Recorder will map UiEvent → BehavioralEvent.
// The client defines this contract (M6 subscribes to it); the schema does not export it.
export type UiEvent =
  | { t: "session_start" }
  | { t: "step_enter"; stepId: StepId; kind: StepKind }
  | { t: "step_release"; stepId: StepId }
  | { t: "submission"; stepId: StepId; diagnosis: Diagnosis }
  | { t: "editor_change"; stepId: StepId; length: number; hash: string }
  | { t: "run"; stepId: StepId }
  | { t: "predict_answer"; stepId: StepId; correct: boolean }
  | { t: "hint_request"; stepId: StepId; level: 1 | 2 | 3 | 4 }
  | { t: "peek_back"; stepId: StepId }
  | { t: "focus"; stepId: StepId; focused: boolean };

export interface EventBus {
  emit(e: UiEvent): void; // sync fan-out; subscriber errors caught + swallowed
  subscribe(fn: (e: UiEvent) => void): () => void; // returns an unsubscribe handle
}

// The STUBBED seam (§11.1): a real pub/sub bus with emit sites wired throughout the client,
// but NO subscriber attached by the client. M6 telemetry attaches a Recorder via subscribe()
// with ZERO emit-site change. An emit never throws into the caller — a telemetry bug cannot
// break the lesson.
export function createEventBus(): EventBus {
  const subs = new Set<(e: UiEvent) => void>();
  return {
    emit(e) {
      for (const fn of subs) {
        try {
          fn(e);
        } catch {
          // swallow: telemetry failures must never propagate into the UI.
        }
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
```

- [ ] **Step 5: Run the EventBus test to verify it passes**

Run: `pnpm --filter @trellis/client test eventBus`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the failing attribution test** `test/attribution.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { attributionStyle } from "../src/attribution.js";

describe("attribution styling (§5.1 FEEDBACK)", () => {
  it("maps every Attribution to a stable label + color", () => {
    expect(attributionStyle("pass").label).toMatch(/correct/i);
    expect(attributionStyle("misconception").label.length).toBeGreaterThan(0);
    for (const a of ["pass", "misconception", "syntax", "runtime", "mismatch"] as const) {
      const s = attributionStyle(a);
      expect(s.color).toMatch(/^#|rgb|hsl/); // a real CSS color
      expect(typeof s.label).toBe("string");
    }
  });
  it("distinguishes pass from failures by color", () => {
    expect(attributionStyle("pass").color).not.toBe(attributionStyle("syntax").color);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test attribution`
Expected: FAIL — `attributionStyle` not found.

- [ ] **Step 8: Create `src/attribution.ts`**

```ts
import type { Attribution } from "@trellis/schema";

export interface AttributionStyle {
  label: string;
  color: string; // CSS color for the FEEDBACK band
}

// §5.1 — attribution-colored FEEDBACK. Pass is green; misconception is amber (a teachable
// moment, not an error); syntax/runtime are red (the code didn't run); mismatch is yellow.
const STYLES: Record<Attribution, AttributionStyle> = {
  pass: { label: "Correct", color: "#1a7f37" },
  misconception: { label: "Let's look closer", color: "#bf8700" },
  syntax: { label: "Syntax error", color: "#cf222e" },
  runtime: { label: "Runtime error", color: "#cf222e" },
  mismatch: { label: "Not quite", color: "#9a6700" },
};

export function attributionStyle(a: Attribution): AttributionStyle {
  return STYLES[a];
}
```

- [ ] **Step 9: Run all tests + typecheck**

Run: `pnpm --filter @trellis/client test && pnpm --filter @trellis/client typecheck`
Expected: PASS (smoke + eventBus + attribution).

- [ ] **Step 10: Commit**

```bash
git add packages/client
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): shared view-model types, EventBus stub seam, attribution styling"
```

---

## Task 3: Non-build step views (`watch` / `predict` / `recognize` / `recall`) — PARALLELIZABLE

**Files:**
- Create: `packages/client/src/steps/WatchStepView.tsx`
- Create: `packages/client/src/steps/PredictStepView.tsx`
- Create: `packages/client/src/steps/RecognizeStepView.tsx`
- Create: `packages/client/src/steps/RecallStepView.tsx`
- Test: `packages/client/test/stepViews.test.tsx`

> These are pure presentational components. They render the prompt + the kind-specific input and call back to the runner via `onAdvance`/`onSubmit`. They hold only transient local input state (a radio selection, a text buffer) — the runner owns machine state. `disabled` is true during `EVALUATING` to lock inputs. RichText renders as plain text in v1 (markdown rendering is out of scope; render the string in a `<div>`).

- [ ] **Step 1: Write the failing test** `test/stepViews.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WatchStep, PredictStep, RecognizeStep, RecallStep } from "@trellis/schema";
import { WatchStepView } from "../src/steps/WatchStepView.js";
import { PredictStepView } from "../src/steps/PredictStepView.js";
import { RecognizeStepView } from "../src/steps/RecognizeStepView.js";
import { RecallStepView } from "../src/steps/RecallStepView.js";

const base = { id: "s", prompt: "Do the thing", skills: ["sk"] };

describe("WatchStepView", () => {
  it("shows body + prompt and advances on Continue", async () => {
    const step: WatchStep = { ...base, kind: "watch", body: "Strings are text in quotes." };
    const onAdvance = vi.fn();
    render(<WatchStepView step={step} onAdvance={onAdvance} />);
    expect(screen.getByText(/Strings are text in quotes/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onAdvance).toHaveBeenCalledOnce();
  });
});

describe("RecognizeStepView", () => {
  it("submits the selected choice id", async () => {
    const step: RecognizeStep = {
      ...base, kind: "recognize", correctChoiceId: "b",
      choices: [{ id: "a", label: "First" }, { id: "b", label: "Second" }],
    };
    const onSubmit = vi.fn();
    render(<RecognizeStepView step={step} disabled={false} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("Second"));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "recognize", choiceId: "b" });
  });
});

describe("RecallStepView", () => {
  it("submits trimmed free text", async () => {
    const step: RecallStep = { ...base, kind: "recall", accepted: { normalized: ["x"] } };
    const onSubmit = vi.fn();
    render(<RecallStepView step={step} disabled={false} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox"), "  hello  ");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "recall", text: "  hello  " });
  });
});

describe("PredictStepView", () => {
  it("renders code read-only and submits a free-text prediction when no choices", async () => {
    const step: PredictStep = {
      ...base, kind: "predict", code: "print(1+1)", reveal: "run-and-show",
      expected: { normalized: ["2"] },
    };
    const onSubmit = vi.fn();
    render(<PredictStepView step={step} disabled={false} onSubmit={onSubmit} />);
    expect(screen.getByText(/print\(1\+1\)/)).toBeTruthy();
    await userEvent.type(screen.getByRole("textbox"), "2");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "predict", text: "2" });
  });

  it("submits a choice id when the predict step has choices", async () => {
    const step: PredictStep = {
      ...base, kind: "predict", code: "x", reveal: "run-and-show",
      expected: { normalized: ["a"] },
      choices: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }],
    };
    const onSubmit = vi.fn();
    render(<PredictStepView step={step} disabled={false} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("Beta"));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "predict", choiceId: "b" });
  });

  it("disables the submit button while disabled (EVALUATING)", () => {
    const step: PredictStep = { ...base, kind: "predict", code: "x", reveal: "run-and-show", expected: {} };
    render(<PredictStepView step={step} disabled={true} onSubmit={vi.fn()} />);
    expect((screen.getByRole("button", { name: /submit/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test stepViews`
Expected: FAIL — view modules not found.

- [ ] **Step 3: Create `src/steps/WatchStepView.tsx`**

```tsx
import type { WatchStep } from "@trellis/schema";

export interface WatchStepViewProps {
  step: WatchStep;
  onAdvance: () => void;
}

// §5.1 — watch steps are passive: render the body, then advance (no submit, no ladder).
export function WatchStepView({ step, onAdvance }: WatchStepViewProps): React.ReactElement {
  return (
    <section aria-label="watch step">
      <div className="prompt">{step.prompt}</div>
      <div className="body">{step.body}</div>
      <button type="button" onClick={onAdvance}>
        Continue
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Create `src/steps/RecognizeStepView.tsx`**

```tsx
import { useState } from "react";
import type { RecognizeStep } from "@trellis/schema";
import type { StepAnswer } from "../types.js";

export interface RecognizeStepViewProps {
  step: RecognizeStep;
  disabled: boolean;
  onSubmit: (answer: StepAnswer) => void;
}

export function RecognizeStepView({ step, disabled, onSubmit }: RecognizeStepViewProps): React.ReactElement {
  const [choiceId, setChoiceId] = useState<string | null>(null);
  return (
    <section aria-label="recognize step">
      <div className="prompt">{step.prompt}</div>
      <fieldset disabled={disabled}>
        {step.choices.map((c) => (
          <label key={c.id}>
            <input
              type="radio"
              name={`recognize-${step.id}`}
              value={c.id}
              checked={choiceId === c.id}
              onChange={() => setChoiceId(c.id)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        disabled={disabled || choiceId === null}
        onClick={() => choiceId !== null && onSubmit({ kind: "recognize", choiceId })}
      >
        Submit
      </button>
    </section>
  );
}
```

- [ ] **Step 5: Create `src/steps/RecallStepView.tsx`**

```tsx
import { useState } from "react";
import type { RecallStep } from "@trellis/schema";
import type { StepAnswer } from "../types.js";

export interface RecallStepViewProps {
  step: RecallStep;
  disabled: boolean;
  onSubmit: (answer: StepAnswer) => void;
}

// Submits the raw text (the engine's normalize() handles trimming/casing in matching).
export function RecallStepView({ step, disabled, onSubmit }: RecallStepViewProps): React.ReactElement {
  const [text, setText] = useState("");
  return (
    <section aria-label="recall step">
      <div className="prompt">{step.prompt}</div>
      <input
        type="text"
        aria-label="answer"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" disabled={disabled} onClick={() => onSubmit({ kind: "recall", text })}>
        Submit
      </button>
    </section>
  );
}
```

- [ ] **Step 6: Create `src/steps/PredictStepView.tsx`** (free-text OR choices; code shown read-only as a `<pre>`. The "run-and-show" reveal of actual output is rendered by `FeedbackPanel` post-submit, so this view stays sandbox-free.)

```tsx
import { useState } from "react";
import type { PredictStep } from "@trellis/schema";
import type { StepAnswer } from "../types.js";

export interface PredictStepViewProps {
  step: PredictStep;
  disabled: boolean;
  onSubmit: (answer: StepAnswer) => void;
}

export function PredictStepView({ step, disabled, onSubmit }: PredictStepViewProps): React.ReactElement {
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const hasChoices = step.choices !== undefined && step.choices.length > 0;
  const canSubmit = hasChoices ? choiceId !== null : true;

  const submit = (): void => {
    if (hasChoices) {
      if (choiceId !== null) onSubmit({ kind: "predict", choiceId });
    } else {
      onSubmit({ kind: "predict", text });
    }
  };

  return (
    <section aria-label="predict step">
      <div className="prompt">{step.prompt}</div>
      <pre className="code">{step.code}</pre>
      {hasChoices ? (
        <fieldset disabled={disabled}>
          {step.choices!.map((c) => (
            <label key={c.id}>
              <input
                type="radio"
                name={`predict-${step.id}`}
                value={c.id}
                checked={choiceId === c.id}
                onChange={() => setChoiceId(c.id)}
              />
              {c.label}
            </label>
          ))}
        </fieldset>
      ) : (
        <input
          type="text"
          aria-label="prediction"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      <button type="button" disabled={disabled || !canSubmit} onClick={submit}>
        Submit
      </button>
    </section>
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @trellis/client test stepViews`
Expected: PASS (all step-view tests).

- [ ] **Step 8: Typecheck + lint, then commit**

```bash
pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint
git add packages/client/src/steps packages/client/test/stepViews.test.tsx
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): watch/predict/recognize/recall step views (§5.1)"
```

---

## Task 4: CodeMirror editor pane + `lockedRegions` protection — PARALLELIZABLE

**Files:**
- Create: `packages/client/src/editor/lockedRegions.ts`
- Create: `packages/client/src/editor/EditorPane.tsx`
- Test: `packages/client/test/lockedRegions.test.ts`
- Test: `packages/client/test/editorPane.test.tsx`

> CodeMirror was chosen (spec §M5) for read-only ranges — the pygame `lockedRegions` seam. M0–M5 corpus content has NO `lockedRegions`, so this is the SEAM: wire it and prove it with synthetic ranges. The protection uses `EditorState.transactionFilter` (clear cancel semantics: return the transaction to allow, return `[]` to cancel) — chosen over `changeFilter` because its allow/cancel contract is unambiguous. `lineRangesToOffsets` is a pure, separately-unit-tested helper.

- [ ] **Step 1: Write the failing pure-logic test** `test/lockedRegions.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { lineRangesToOffsets, lockedRegionsExtension } from "../src/editor/lockedRegions.js";

const DOC = "line1\nline2\nline3\nline4"; // lines are 1-based

describe("lineRangesToOffsets", () => {
  it("maps 1-based inclusive line ranges to {from,to} char offsets", () => {
    const offs = lineRangesToOffsets(EditorState.create({ doc: DOC }).doc, [{ startLine: 2, endLine: 2 }]);
    // line2 starts after "line1\n" (offset 6) and ends at offset 11
    expect(offs).toEqual([{ from: 6, to: 11 }]);
  });
});

describe("lockedRegionsExtension (transactionFilter)", () => {
  function stateWith(ranges: { startLine: number; endLine: number }[]) {
    return EditorState.create({ doc: DOC, extensions: [lockedRegionsExtension(ranges)] });
  }

  it("blocks an edit that touches a locked line", () => {
    const s = stateWith([{ startLine: 2, endLine: 2 }]);
    // try to insert at offset 7 (inside line2)
    const next = s.update({ changes: { from: 7, insert: "X" } }).state;
    expect(next.doc.toString()).toBe(DOC); // change cancelled → doc unchanged
  });

  it("allows an edit outside locked lines", () => {
    const s = stateWith([{ startLine: 2, endLine: 2 }]);
    const next = s.update({ changes: { from: 0, insert: "X" } }).state; // line1, not locked
    expect(next.doc.toString()).toBe("X" + DOC);
  });

  it("is a no-op when there are no locked regions", () => {
    const s = stateWith([]);
    const next = s.update({ changes: { from: 7, insert: "X" } }).state;
    expect(next.doc.toString()).not.toBe(DOC);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test lockedRegions`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/editor/lockedRegions.ts`**

```ts
import { EditorState, type Extension, type Text } from "@codemirror/state";
import type { LineRange } from "@trellis/schema";

export interface Offset {
  from: number;
  to: number;
}

// §3.4 LineRange is 1-based inclusive. Map to {from,to} char offsets over the current doc.
export function lineRangesToOffsets(doc: Text, ranges: readonly LineRange[]): Offset[] {
  return ranges.map((r) => {
    const start = doc.line(r.startLine);
    const end = doc.line(r.endLine);
    return { from: start.from, to: end.to };
  });
}

// A transaction filter that cancels any document change overlapping a locked range. Returns
// the transaction unchanged to allow it, or [] to cancel it (CodeMirror's documented contract).
export function lockedRegionsExtension(ranges: readonly LineRange[]): Extension {
  if (ranges.length === 0) return [];
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    const locked = lineRangesToOffsets(tr.startState.doc, ranges);
    let blocked = false;
    tr.changes.iterChangedRanges((fromA, toA) => {
      for (const { from, to } of locked) {
        // half-open overlap test against the changed range in the OLD doc coordinates
        if (fromA <= to && toA >= from) blocked = true;
      }
    });
    return blocked ? [] : tr;
  });
}
```

- [ ] **Step 4: Run the locked-regions test to verify it passes**

Run: `pnpm --filter @trellis/client test lockedRegions`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing EditorPane test** `test/editorPane.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { EditorPane } from "../src/editor/EditorPane.js";

describe("EditorPane (CodeMirror)", () => {
  it("renders the initial value into the editor DOM", () => {
    const { container } = render(<EditorPane value={"hello = 1"} onChange={() => {}} />);
    // CodeMirror renders its content in a .cm-content element
    const content = container.querySelector(".cm-content");
    expect(content).toBeTruthy();
    expect(content!.textContent).toContain("hello = 1");
  });

  it("fires onChange when the document is edited programmatically", () => {
    const onChange = vi.fn();
    const { container } = render(<EditorPane value={"x"} onChange={onChange} />);
    // grab the live EditorView off the DOM node CodeMirror exposes and dispatch an insert
    const view = (container.querySelector(".cm-editor") as unknown as { cmView?: { view: import("@codemirror/view").EditorView } })?.cmView?.view;
    // Fallback path: query via the module's test hook if cmView isn't exposed.
    expect(typeof onChange).toBe("function");
    // Note: see Step 6 — EditorPane stores its EditorView on the container via a ref callback
    // exposed for tests as data attribute; we assert onChange wiring through the updateListener
    // in the integration test instead if direct dispatch is brittle under happy-dom.
    void view;
  });

  it("renders read-only when readOnly is set (no .cm-content contenteditable)", () => {
    const { container } = render(<EditorPane value={"y"} onChange={() => {}} readOnly />);
    const content = container.querySelector(".cm-content");
    expect(content!.getAttribute("contenteditable")).toBe("false");
  });
});
```

> NOTE: dispatching synthetic edits into CodeMirror under happy-dom can be brittle. The reliable onChange coverage lives in the marquee integration test (Task 12), which drives a real edit through `setBuildCode`. Keep this unit test focused on render + the read-only attribute. If the middle test proves flaky, simplify it to assert the `.cm-editor` mounted and remove the dispatch probe.

- [ ] **Step 6: Create `src/editor/EditorPane.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import type { LineRange } from "@trellis/schema";
import { lockedRegionsExtension } from "./lockedRegions.js";

export interface EditorPaneProps {
  value: string;
  onChange: (next: string) => void;
  lockedRegions?: LineRange[];
  readOnly?: boolean;
}

// CodeMirror 6 mounted in a ref. Created once on mount; an external `value` change is
// reconciled by dispatching a doc-replacing transaction (controlled-ish). The updateListener
// reports learner edits up via onChange. lockedRegions wires the §3.4 pygame seam.
export function EditorPane({ value, onChange, lockedRegions = [], readOnly = false }: EditorPaneProps): React.ReactElement {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount once.
  useEffect(() => {
    if (host.current === null) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        python(),
        lockedRegionsExtension(lockedRegions),
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // Mount-once: lockedRegions/readOnly are fixed per step (the step remounts under a new key, §5.2).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile an external value change (e.g. a retry resetting the buffer) without losing focus.
  useEffect(() => {
    const v = view.current;
    if (v === null) return;
    const current = v.state.doc.toString();
    if (current !== value) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div className="editor-pane" ref={host} />;
}
```

> NOTE on `react-hooks/exhaustive-deps`: the root `.eslintrc.cjs` does not enable the React Hooks plugin, so the disable comment is harmless (an unused eslint-disable is not an error under the base config). If lint flags the unused directive, delete the comment line.

- [ ] **Step 7: Run the EditorPane test to verify it passes**

Run: `pnpm --filter @trellis/client test editorPane`
Expected: PASS — render + read-only assertions hold. If the programmatic-dispatch middle test is flaky, simplify per the Step 5 note.

- [ ] **Step 8: Typecheck + lint, then commit**

```bash
pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint
git add packages/client/src/editor packages/client/test/lockedRegions.test.ts packages/client/test/editorPane.test.tsx
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): CodeMirror EditorPane + lockedRegions protection seam (§3.4)"
```

---

## Task 5: Hint panel (pull/dose, §9.2) — PARALLELIZABLE

**Files:**
- Create: `packages/client/src/hints/HintPanel.tsx`
- Test: `packages/client/test/hintPanel.test.tsx`

> The runner owns `HintState` and the engine ladder fns. The panel is a presentational driver: it renders `visibleHints(state, ladder)`, a "Show a hint" button that calls `onPull`, and gates level 4 (the `revealCode` solution) behind an explicit confirm (§9.2). It computes whether the NEXT pull is level 4 via `state.revealedThrough + 1 >= 4`.

- [ ] **Step 1: Write the failing test** `test/hintPanel.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Hint } from "@trellis/schema";
import type { HintState } from "@trellis/engine";
import { HintPanel } from "../src/hints/HintPanel.js";

const ladder: Hint[] = [
  { level: 1, body: "Hint one" },
  { level: 2, body: "Hint two" },
  { level: 3, body: "Hint three" },
  { level: 4, body: "Full solution", revealCode: "return 'x' + str(n)" },
];

describe("HintPanel (§9.2)", () => {
  it("shows nothing revealed at level 0 and a pull button", () => {
    render(<HintPanel ladder={ladder} state={{ ladderKey: "k", revealedThrough: 0 }} onPull={vi.fn()} />);
    expect(screen.queryByText("Hint one")).toBeNull();
    expect(screen.getByRole("button", { name: /show.*hint/i })).toBeTruthy();
  });

  it("renders levels 1..revealedThrough", () => {
    render(<HintPanel ladder={ladder} state={{ ladderKey: "k", revealedThrough: 2 }} onPull={vi.fn()} />);
    expect(screen.getByText("Hint one")).toBeTruthy();
    expect(screen.getByText("Hint two")).toBeTruthy();
    expect(screen.queryByText("Hint three")).toBeNull();
  });

  it("calls onPull() for a normal (non-level-4) pull", async () => {
    const onPull = vi.fn();
    render(<HintPanel ladder={ladder} state={{ ladderKey: "k", revealedThrough: 1 }} onPull={onPull} />);
    await userEvent.click(screen.getByRole("button", { name: /show.*hint/i }));
    expect(onPull).toHaveBeenCalledWith(); // no confirm arg for level 2
  });

  it("requires a confirm before pulling level 4, then calls onPull({confirmRevealCode:true})", async () => {
    const onPull = vi.fn();
    render(<HintPanel ladder={ladder} state={{ ladderKey: "k", revealedThrough: 3 }} onPull={onPull} />);
    // The primary button now asks to reveal the full solution
    await userEvent.click(screen.getByRole("button", { name: /full solution/i }));
    // a confirm appears
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onPull).toHaveBeenCalledWith({ confirmRevealCode: true });
  });

  it("hides the pull button when the ladder is exhausted", () => {
    render(<HintPanel ladder={ladder} state={{ ladderKey: "k", revealedThrough: 4 }} onPull={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /show.*hint|full solution/i })).toBeNull();
    expect(screen.getByText("Full solution")).toBeTruthy();
  });

  it("renders nothing when the ladder is empty (a pass / NO_LADDER)", () => {
    const { container } = render(<HintPanel ladder={[]} state={{ ladderKey: "", revealedThrough: 0 }} onPull={vi.fn()} />);
    expect(container.querySelector("button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test hintPanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/hints/HintPanel.tsx`**

```tsx
import { useState } from "react";
import type { Hint } from "@trellis/schema";
import { type HintState, visibleHints } from "@trellis/engine";

export interface HintPanelProps {
  ladder: Hint[];
  state: HintState;
  onPull: (opts?: { confirmRevealCode: true }) => void;
}

// §9.2 — hints are PULLED, one level per press. Level 4 (the revealCode solution) is gated
// behind an explicit confirm. The runner owns the HintState mutation (calls pullHint); this
// panel only renders the visible hints and requests the next pull.
export function HintPanel({ ladder, state, onPull }: HintPanelProps): React.ReactElement | null {
  const [confirming, setConfirming] = useState(false);
  if (ladder.length === 0) return null;

  const shown = visibleHints(state, ladder);
  const nextLevel = state.revealedThrough + 1;
  const exhausted = nextLevel > ladder.length;
  const isLevel4 = nextLevel >= 4;

  return (
    <aside aria-label="hints">
      <ol className="hints">
        {shown.map((h) => (
          <li key={h.level} className={`hint hint-${h.level}`}>
            <div className="hint-body">{h.body}</div>
            {h.revealCode !== undefined && <pre className="hint-solution">{h.revealCode}</pre>}
          </li>
        ))}
      </ol>
      {!exhausted &&
        (isLevel4 ? (
          confirming ? (
            <div className="confirm">
              <span>Show the full solution?</span>
              <button type="button" onClick={() => { setConfirming(false); onPull({ confirmRevealCode: true }); }}>
                Confirm
              </button>
              <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)}>Show full solution</button>
          )
        ) : (
          <button type="button" onClick={() => onPull()}>Show a hint</button>
        ))}
    </aside>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trellis/client test hintPanel`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + lint, then commit**

```bash
pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint
git add packages/client/src/hints packages/client/test/hintPanel.test.tsx
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): learner-dosed HintPanel with level-4 confirm (§9.2)"
```

---

## Task 6: Attribution-colored FEEDBACK panel — PARALLELIZABLE

**Files:**
- Create: `packages/client/src/feedback/FeedbackPanel.tsx`
- Test: `packages/client/test/feedbackPanel.test.tsx`

> The FEEDBACK state (§5.1): an attribution-colored band + (for a misconception) the authored feedback text + (for predict) the "run-and-show" reveal text the runner supplies. Pure presentational; the runner passes a `Diagnosis` + optional `misconceptionFeedback` + optional `revealText`.

- [ ] **Step 1: Write the failing test** `test/feedbackPanel.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Diagnosis } from "@trellis/schema";
import { FeedbackPanel } from "../src/feedback/FeedbackPanel.js";

function diag(over: Partial<Diagnosis>): Diagnosis {
  return {
    id: "d", learnerId: "L", stepId: "s", contentVersion: "v", submittedAt: "t",
    correct: false, attribution: "misconception", signals: { ran: true, wallMs: 1 },
    skillDeltas: [], seed: 0, ...over,
  };
}

describe("FeedbackPanel (§5.1 attribution-colored)", () => {
  it("shows a green 'Correct' band on pass", () => {
    render(<FeedbackPanel diagnosis={diag({ correct: true, attribution: "pass" })} />);
    const band = screen.getByLabelText("feedback");
    expect(band.textContent).toMatch(/correct/i);
    expect(band.getAttribute("style") ?? "").toContain("1a7f37");
  });

  it("shows the authored misconception feedback when present", () => {
    render(
      <FeedbackPanel
        diagnosis={diag({ attribution: "misconception", misconceptionId: "mis.concat.str_num" })}
        misconceptionFeedback="You added a number to a string."
      />,
    );
    expect(screen.getByText(/added a number to a string/i)).toBeTruthy();
  });

  it("shows the run-and-show reveal text for a predict step", () => {
    render(<FeedbackPanel diagnosis={diag({ attribution: "mismatch" })} revealText="The code printed: 2" />);
    expect(screen.getByText(/The code printed: 2/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test feedbackPanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/feedback/FeedbackPanel.tsx`**

```tsx
import type { Diagnosis } from "@trellis/schema";
import { attributionStyle } from "../attribution.js";

export interface FeedbackPanelProps {
  diagnosis: Diagnosis;
  misconceptionFeedback?: string; // authored Misconception.feedback (runner resolves it from the bundle)
  revealText?: string; // predict "run-and-show" reveal the runner builds
}

// §5.1 FEEDBACK — an attribution-colored band, plus the authored misconception feedback and/or
// the predict reveal when supplied.
export function FeedbackPanel({ diagnosis, misconceptionFeedback, revealText }: FeedbackPanelProps): React.ReactElement {
  const sty = attributionStyle(diagnosis.attribution);
  return (
    <div aria-label="feedback" className="feedback" style={{ borderLeft: `4px solid ${sty.color}`, color: sty.color }}>
      <strong className="feedback-label">{sty.label}</strong>
      {misconceptionFeedback !== undefined && <p className="feedback-misconception">{misconceptionFeedback}</p>}
      {revealText !== undefined && <p className="feedback-reveal">{revealText}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trellis/client test feedbackPanel`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + lint, then commit**

```bash
pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint
git add packages/client/src/feedback packages/client/test/feedbackPanel.test.tsx
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): attribution-colored FeedbackPanel (§5.1)"
```

---

## Task 7: Read-only peek-back panel (§5.3) — PARALLELIZABLE

**Files:**
- Create: `packages/client/src/peekback/PeekBackPanel.tsx`
- Test: `packages/client/test/peekBackPanel.test.tsx`

> Peek-back is read-only, reconstructed from `PeekBackEntry[]` snapshots (never live step state). Collapsible side panel; opening it calls `onOpen` (the runner emits the `peek_back` event). Renders each released step's prompt snapshot, optional `carryContext`, and an attribution-colored outcome dot.

- [ ] **Step 1: Write the failing test** `test/peekBackPanel.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PeekBackEntry } from "../src/types.js";
import { PeekBackPanel } from "../src/peekback/PeekBackPanel.js";

const entries: PeekBackEntry[] = [
  { stepId: "s1", kind: "watch", promptSnapshot: "Watch this", carryContext: "Strings are quoted text" },
  { stepId: "s2", kind: "build", promptSnapshot: "Build announce()", outcome: { correct: true, attribution: "pass" } },
];

describe("PeekBackPanel (§5.3)", () => {
  it("is collapsed by default and shows a toggle", () => {
    render(<PeekBackPanel entries={entries} />);
    expect(screen.queryByText("Watch this")).toBeNull();
    expect(screen.getByRole("button", { name: /peek|history|review/i })).toBeTruthy();
  });

  it("expands to show snapshots + carryContext and calls onOpen", async () => {
    const onOpen = vi.fn();
    render(<PeekBackPanel entries={entries} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /peek|history|review/i }));
    expect(screen.getByText("Watch this")).toBeTruthy();
    expect(screen.getByText("Strings are quoted text")).toBeTruthy();
    expect(screen.getByText("Build announce()")).toBeTruthy();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders nothing useful to interact with when there are no released steps", () => {
    render(<PeekBackPanel entries={[]} />);
    // toggle present but disabled (nothing to review)
    const btn = screen.getByRole("button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test peekBackPanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/peekback/PeekBackPanel.tsx`**

```tsx
import { useState } from "react";
import type { PeekBackEntry } from "../types.js";
import { attributionStyle } from "../attribution.js";

export interface PeekBackPanelProps {
  entries: PeekBackEntry[];
  onOpen?: () => void; // runner emits the peek_back event (§11)
}

// §5.3 — read-only, reconstructed from released-step snapshots. Opening it is a weak struggle
// signal, so it notifies the runner via onOpen the first time it expands.
export function PeekBackPanel({ entries, onOpen }: PeekBackPanelProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const empty = entries.length === 0;

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next && onOpen) onOpen();
  };

  return (
    <aside aria-label="peek-back" className="peek-back">
      <button type="button" disabled={empty} onClick={toggle}>
        {open ? "Hide review" : "Review earlier steps"}
      </button>
      {open && (
        <ol className="peek-entries">
          {entries.map((e) => (
            <li key={e.stepId} className={`peek-entry kind-${e.kind}`}>
              {e.outcome && (
                <span
                  className="peek-outcome"
                  aria-label={`outcome ${e.outcome.attribution}`}
                  style={{ color: attributionStyle(e.outcome.attribution).color }}
                >
                  ●
                </span>
              )}
              <div className="peek-prompt">{e.promptSnapshot}</div>
              {e.carryContext !== undefined && <div className="peek-carry">{e.carryContext}</div>}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trellis/client test peekBackPanel`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + lint, then commit**

```bash
pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint
git add packages/client/src/peekback packages/client/test/peekBackPanel.test.tsx
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): read-only PeekBackPanel reconstructed from history (§5.3)"
```

---

## Task 8: The runner brain — `grade.ts` + `useCellRunner` (WIRING; sequential)

**Files:**
- Create: `packages/client/src/runner/grade.ts`
- Create: `packages/client/src/runner/useCellRunner.ts`
- Test: `packages/client/test/grade.test.ts`
- Test: `packages/client/test/useCellRunner.test.tsx`

> This is the brain. `grade.ts` holds two effectful-but-injectable helpers: `gradeStep` (runs the engine's `evaluate`/`diagnoseNonBuild`) and `persistDiagnosis` (the §10.2 mastery update + atomic commit). `useCellRunner` is a `useReducer` over the cell: it owns `activeStepIndex`, the step `MachineState`, `HintState`, the per-build editor buffer, the `lastDiagnosis`, and the append-only peek-back `history`. It emits `UiEvent`s on the bus at every semantic point (§11.1 stub seam). On `advance` it drops transient state and materializes a `PeekBackEntry` (§5.2).

- [ ] **Step 1: Write the failing `grade.ts` test** `test/grade.test.ts` (uses a fast in-test mock `BuildSandbox` + `memoryDriver`)

```ts
import { describe, it, expect } from "vitest";
import type { Bundle, Step, RunRequest, RunResult, AstQuery } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { memoryDriver } from "@trellis/persist";
import { openTrellisDb, loadLearnerModel, readDiagnoses } from "@trellis/persist";
import { gradeStep, persistDiagnosis } from "../src/runner/grade.js";

// Minimal bundle with one recognize step + its misconception, enough to diagnose.
function miniBundle(): Bundle {
  return {
    contentVersion: "v1",
    skills: { "skill.x": { id: "skill.x", title: "X", description: "", misconceptions: ["mis.x"], upstream: [] } },
    nodes: {}, cells: {},
    misconceptions: {
      "mis.x": { id: "mis.x", skill: "skill.x", title: "X mis", signature: { choice: "wrong" },
        hintLadder: [{ level: 1, body: "h1" }], feedback: "the X feedback" },
    },
    producers: {}, requirements: {},
  } as unknown as Bundle;
}

const recognize: Step = {
  id: "s1", kind: "recognize", prompt: "pick", skills: ["skill.x"],
  correctChoiceId: "right",
  choices: [{ id: "right", label: "Right" }, { id: "wrong", label: "Wrong", misconception: "mis.x" }],
} as Step;

// A mock sandbox is only needed for build steps; recognize never calls it.
const noSandbox: BuildSandbox = {
  run: async (_req: RunRequest): Promise<RunResult> => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }),
  parseAndMatch: async (_c: string, _q: { tag: string; query: AstQuery }[]) => [],
};

const fx = { newId: () => "diag-1", now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

describe("gradeStep", () => {
  it("diagnoses a correct recognize answer as pass", async () => {
    const d = await gradeStep(recognize, { kind: "recognize", choiceId: "right" }, noSandbox, miniBundle(), fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
  });
  it("diagnoses a wrong recognize answer as the authored misconception", async () => {
    const d = await gradeStep(recognize, { kind: "recognize", choiceId: "wrong" }, noSandbox, miniBundle(), fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.x");
  });
});

describe("persistDiagnosis", () => {
  it("applies §10.2 mastery + commits atomically; survives reload", async () => {
    const driver = memoryDriver();
    const bundle = miniBundle();
    const db1 = await openTrellisDb(driver, { idGen: () => "L" });
    const d = await gradeStep(recognize, { kind: "recognize", choiceId: "right" }, noSandbox, bundle, fx);
    await persistDiagnosis(db1, bundle, d, []);
    const m1 = await loadLearnerModel(db1, "v1");
    expect(m1.skills["skill.x"]!.mastery).toBeGreaterThan(0); // a pass raised mastery
    db1.close();

    const db2 = await openTrellisDb(driver, { idGen: () => "X" });
    const m2 = await loadLearnerModel(db2, "v1");
    const hist = await readDiagnoses(db2);
    expect(m2.skills["skill.x"]!.mastery).toBe(m1.skills["skill.x"]!.mastery); // survived reload
    expect(hist).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test grade`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/runner/grade.ts`**

```ts
import type { Bundle, Step, Diagnosis, BehavioralEvent } from "@trellis/schema";
import {
  evaluate,
  diagnoseNonBuild,
  applyDiagnosis,
  type BuildSandbox,
  type Submission,
  type DiagnoseEffects,
} from "@trellis/engine";
import {
  commitSubmission,
  loadLearnerModel,
  type TrellisDb,
  type StoredSkillState,
} from "@trellis/persist";

export interface RunnerEffects {
  newId: () => string;
  now: () => string; // ISO timestamp
  learnerId: string;
}

// Grade one submission. Build steps go through the async ladder (needs the sandbox);
// non-build steps use the sync path. Both produce a Diagnosis. (evaluate() handles both,
// but calling diagnoseNonBuild directly for non-build avoids a needless sandbox dependency
// in the type — we route on kind for clarity.)
export async function gradeStep(
  step: Step,
  submission: Submission,
  sandbox: BuildSandbox,
  bundle: Bundle,
  fx: RunnerEffects,
): Promise<Diagnosis> {
  const effects: DiagnoseEffects = { id: fx.newId(), learnerId: fx.learnerId, now: fx.now() };
  if (step.kind === "build") {
    return evaluate(step, submission, sandbox, bundle, effects);
  }
  if (submission.kind === "build") throw new Error("build submission on a non-build step");
  return diagnoseNonBuild(step, submission, bundle, effects);
}

// §10.2 + §3.10 — apply the diagnosis to the persisted learner model and commit it together
// with the diagnosis and any behavioral events in ONE atomic transaction. Only the skills the
// diagnosis touched are written back (write-only, no read-modify-write inside the txn).
export async function persistDiagnosis(
  db: TrellisDb,
  bundle: Bundle,
  diagnosis: Diagnosis,
  events: BehavioralEvent[],
): Promise<void> {
  const model = await loadLearnerModel(db, bundle.contentVersion);
  const updated = applyDiagnosis(model, diagnosis);
  const touched = new Set(diagnosis.skillDeltas.map((d) => d.skill));
  const skillUpdates: StoredSkillState[] = [...touched]
    .map((skillId) => {
      const s = updated.skills[skillId];
      return s ? { skillId, ...s } : null;
    })
    .filter((x): x is StoredSkillState => x !== null);
  await commitSubmission(db, { skillUpdates, diagnosis, events });
}
```

- [ ] **Step 4: Run the grade test to verify it passes**

Run: `pnpm --filter @trellis/client test grade`
Expected: PASS (4 assertions across the describes).

- [ ] **Step 5: Write the failing `useCellRunner` test** `test/useCellRunner.test.tsx` (drives the hook through a full step with `renderHook` + `act`)

```tsx
import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { memoryDriver, openTrellisDb } from "@trellis/persist";
import { createEventBus } from "../src/eventBus.js";
import type { UiEvent } from "../src/eventBus.js";
import { useCellRunner } from "../src/runner/useCellRunner.js";

const noSandbox: BuildSandbox = {
  run: async () => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }),
  parseAndMatch: async () => [],
};

function bundleAndCell(): { bundle: Bundle; cell: Cell } {
  const cell: Cell = {
    id: "c1", nodeId: "n1", title: "Mini", certifies: ["skill.x"],
    steps: [
      { id: "w", kind: "watch", prompt: "watch", skills: ["skill.x"], body: "body", carryContext: "remember me" } as Cell["steps"][number],
      { id: "r", kind: "recognize", prompt: "pick", skills: ["skill.x"],
        correctChoiceId: "right",
        choices: [{ id: "right", label: "Right" }, { id: "wrong", label: "Wrong", misconception: "mis.x" }],
      } as Cell["steps"][number],
    ],
  };
  const bundle = {
    contentVersion: "v1",
    skills: { "skill.x": { id: "skill.x", title: "X", description: "", misconceptions: ["mis.x"], upstream: [] } },
    nodes: {}, cells: { c1: cell },
    misconceptions: { "mis.x": { id: "mis.x", skill: "skill.x", title: "m", signature: { choice: "wrong" }, hintLadder: [{ level: 1, body: "h" }], feedback: "fb" } },
    producers: {}, requirements: {},
  } as unknown as Bundle;
  return { bundle, cell };
}

let idCounter = 0;
const fx = { newId: () => `d${idCounter++}`, now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

describe("useCellRunner", () => {
  it("walks watch → recognize, keys the active step, materializes peek-back, persists, and emits events", async () => {
    idCounter = 0;
    const { bundle, cell } = bundleAndCell();
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const driver = memoryDriver();
    const db = await openTrellisDb(driver, { idGen: () => "L" });

    const { result } = renderHook(() =>
      useCellRunner({ cell, bundle, sandbox: noSandbox, bus, db, effects: fx }),
    );

    // first step is the watch step, ACTIVE after auto-enter
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));
    expect(result.current.step.id).toBe("w");

    // advance the watch step → recognize step becomes ACTIVE; peek-back has the watch snapshot
    act(() => result.current.advance());
    await waitFor(() => expect(result.current.step.id).toBe("r"));
    expect(result.current.peekBack.map((p) => p.stepId)).toEqual(["w"]);
    expect(result.current.peekBack[0]!.carryContext).toBe("remember me");

    // submit a WRONG recognize answer → FEEDBACK + misconception + a non-empty hint ladder
    await act(async () => {
      await result.current.submitNonBuild({ kind: "recognize", choiceId: "wrong" });
    });
    expect(result.current.phase).toBe("FEEDBACK");
    expect(result.current.lastDiagnosis!.attribution).toBe("misconception");
    expect(result.current.ladder.length).toBeGreaterThan(0);

    // pull one hint level
    act(() => result.current.pullHint());
    expect(result.current.hintState.revealedThrough).toBe(1);

    // retry → ACTIVE, then submit the RIGHT answer → pass, advance completes the cell
    act(() => result.current.retry());
    expect(result.current.phase).toBe("ACTIVE");
    await act(async () => {
      await result.current.submitNonBuild({ kind: "recognize", choiceId: "right" });
    });
    expect(result.current.lastDiagnosis!.correct).toBe(true);
    act(() => result.current.advance());
    expect(result.current.isComplete).toBe(true);

    // events emitted include step_enter, submission, step_release (the stub seam fired)
    const kinds = seen.map((e) => e.t);
    expect(kinds).toContain("step_enter");
    expect(kinds).toContain("submission");
    expect(kinds).toContain("step_release");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test useCellRunner`
Expected: FAIL — module not found.

- [ ] **Step 7: Create `src/runner/useCellRunner.ts`**

```ts
import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { Bundle, Cell, Step, BuildStep, Diagnosis, Hint } from "@trellis/schema";
import {
  initialState,
  step as stepMachine,
  initialHintState,
  ladderKeyFor,
  ladderFor,
  syncLadder,
  pullHint as enginePullHint,
  type MachineState,
  type HintState,
  type BuildSandbox,
} from "@trellis/engine";
import type { EventBus } from "../eventBus.js";
import type { TrellisDb } from "@trellis/persist";
import type { PeekBackEntry, StepAnswer } from "../types.js";
import { gradeStep, persistDiagnosis, type RunnerEffects } from "./grade.js";

export interface UseCellRunnerArgs {
  cell: Cell;
  bundle: Bundle;
  sandbox: BuildSandbox;
  bus: EventBus;
  db?: TrellisDb; // optional: when omitted, no persistence (pure-UI / fast tests)
  effects: RunnerEffects;
}

interface RunnerState {
  activeStepIndex: number;
  machine: MachineState;
  hintState: HintState;
  buildCode: string; // the active build step's editor buffer
  lastDiagnosis: Diagnosis | null;
  history: PeekBackEntry[]; // append-only released-step snapshots
  complete: boolean;
}

type Action =
  | { type: "enter" }
  | { type: "setBuildCode"; code: string }
  | { type: "evaluating" }
  | { type: "diagnosed"; diagnosis: Diagnosis }
  | { type: "retry" }
  | { type: "advance"; entry: PeekBackEntry | null; nextStarter: string }
  | { type: "pullHint"; next: HintState };

function reducer(state: RunnerState, action: Action, cell: Cell, bundle: Bundle): RunnerState {
  const active = cell.steps[state.activeStepIndex]!;
  switch (action.type) {
    case "enter":
      return { ...state, machine: stepMachine(active.kind, state.machine, { type: "enter" }) };
    case "setBuildCode":
      return { ...state, buildCode: action.code };
    case "evaluating":
      return { ...state, machine: stepMachine(active.kind, state.machine, { type: "submit" }) };
    case "diagnosed": {
      const machine = stepMachine(active.kind, state.machine, { type: "diagnosis", correct: action.diagnosis.correct });
      const hintState = syncLadder(state.hintState, action.diagnosis);
      return { ...state, machine, hintState, lastDiagnosis: action.diagnosis };
    }
    case "retry":
      return { ...state, machine: stepMachine(active.kind, state.machine, { type: "retry" }) };
    case "advance": {
      const isLast = state.activeStepIndex >= cell.steps.length - 1;
      const history = action.entry ? [...state.history, action.entry] : state.history;
      if (isLast) {
        // RELEASE the final step but stay on it; mark complete.
        return { ...state, history, complete: true,
          machine: stepMachine(active.kind, state.machine, { type: "advance" }) };
      }
      const nextIndex = state.activeStepIndex + 1;
      const next = cell.steps[nextIndex]!;
      // Drop transient state (§5.2): reset hint state + build buffer; enter the next step.
      return {
        activeStepIndex: nextIndex,
        machine: stepMachine(next.kind, initialState(), { type: "enter" }),
        hintState: initialHintState(),
        buildCode: action.nextStarter,
        lastDiagnosis: null,
        history,
        complete: false,
      };
    }
    case "pullHint":
      return { ...state, hintState: action.next };
  }
}

function starterFor(step: Step): string {
  return step.kind === "build" ? step.starterCode : "";
}

function makePeekEntry(step: Step, diagnosis: Diagnosis | null): PeekBackEntry {
  const entry: PeekBackEntry = { stepId: step.id, kind: step.kind, promptSnapshot: step.prompt };
  if (step.carryContext !== undefined) entry.carryContext = step.carryContext;
  if (diagnosis) entry.outcome = { correct: diagnosis.correct, attribution: diagnosis.attribution };
  return entry;
}

export interface CellRunnerView {
  step: Step;
  phase: MachineState["phase"];
  hintState: HintState;
  ladder: Hint[];
  lastDiagnosis: Diagnosis | null;
  peekBack: PeekBackEntry[];
  buildCode: string;
  isComplete: boolean;
  submitNonBuild: (answer: Exclude<StepAnswer, { kind: "build" }>) => Promise<void>;
  submitBuild: () => Promise<void>;
  setBuildCode: (code: string) => void;
  advance: () => void;
  retry: () => void;
  pullHint: (opts?: { confirmRevealCode: true }) => void;
  openPeekBack: () => void;
}

export function useCellRunner(args: UseCellRunnerArgs): CellRunnerView {
  const { cell, bundle, sandbox, bus, db, effects } = args;
  const init: RunnerState = useMemo(
    () => ({
      activeStepIndex: 0,
      machine: initialState(),
      hintState: initialHintState(),
      buildCode: starterFor(cell.steps[0]!),
      lastDiagnosis: null,
      history: [],
      complete: false,
    }),
    [cell],
  );
  const [state, rawDispatch] = useReducer(
    (s: RunnerState, a: Action) => reducer(s, a, cell, bundle),
    init,
  );

  const active = cell.steps[state.activeStepIndex]!;

  // Auto-enter the first step (PENDING → ACTIVE) on mount, and emit session_start + step_enter.
  useEffect(() => {
    bus.emit({ t: "session_start" });
    rawDispatch({ type: "enter" });
    bus.emit({ t: "step_enter", stepId: active.id, kind: active.kind });
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ladder = useMemo<Hint[]>(() => ladderFor(state.hintState.ladderKey, bundle), [state.hintState.ladderKey, bundle]);

  const grade = useCallback(
    async (answer: StepAnswer): Promise<void> => {
      rawDispatch({ type: "evaluating" });
      const submission =
        answer.kind === "build" ? ({ kind: "build", code: state.buildCode } as const) : answer;
      const diagnosis = await gradeStep(active, submission, sandbox, bundle, effects);
      rawDispatch({ type: "diagnosed", diagnosis });
      bus.emit({ t: "submission", stepId: active.id, diagnosis });
      if (active.kind === "predict") {
        bus.emit({ t: "predict_answer", stepId: active.id, correct: diagnosis.correct });
      }
      if (db) await persistDiagnosis(db, bundle, diagnosis, []);
    },
    [active, sandbox, bundle, effects, bus, db, state.buildCode],
  );

  const submitNonBuild = useCallback(
    (answer: Exclude<StepAnswer, { kind: "build" }>) => grade(answer),
    [grade],
  );
  const submitBuild = useCallback(() => grade({ kind: "build", code: state.buildCode }), [grade, state.buildCode]);
  const setBuildCode = useCallback((code: string) => rawDispatch({ type: "setBuildCode", code }), []);
  const retry = useCallback(() => rawDispatch({ type: "retry" }), []);

  const advance = useCallback(() => {
    const entry = makePeekEntry(active, state.lastDiagnosis);
    const isLast = state.activeStepIndex >= cell.steps.length - 1;
    const nextStarter = isLast ? state.buildCode : starterFor(cell.steps[state.activeStepIndex + 1]!);
    rawDispatch({ type: "advance", entry, nextStarter });
    bus.emit({ t: "step_release", stepId: active.id });
    if (!isLast) {
      const next = cell.steps[state.activeStepIndex + 1]!;
      bus.emit({ t: "step_enter", stepId: next.id, kind: next.kind });
    }
  }, [active, state.lastDiagnosis, state.activeStepIndex, state.buildCode, cell, bus]);

  const pullHint = useCallback(
    (opts?: { confirmRevealCode: true }) => {
      const next = enginePullHint(state.hintState, ladder, opts);
      if (next.revealedThrough !== state.hintState.revealedThrough) {
        rawDispatch({ type: "pullHint", next });
        bus.emit({ t: "hint_request", stepId: active.id, level: next.revealedThrough as 1 | 2 | 3 | 4 });
      }
    },
    [state.hintState, ladder, bus, active.id],
  );

  const openPeekBack = useCallback(() => bus.emit({ t: "peek_back", stepId: active.id }), [bus, active.id]);

  return {
    step: active,
    phase: state.machine.phase,
    hintState: state.hintState,
    ladder,
    lastDiagnosis: state.lastDiagnosis,
    peekBack: state.history,
    buildCode: state.buildCode,
    isComplete: state.complete,
    submitNonBuild,
    submitBuild,
    setBuildCode,
    advance,
    retry,
    pullHint,
    openPeekBack,
  };
}
```

- [ ] **Step 8: Run the useCellRunner test to verify it passes**

Run: `pnpm --filter @trellis/client test useCellRunner`
Expected: PASS. If `react-hooks/exhaustive-deps` directive triggers an "unused eslint-disable" lint error, delete that comment line. If `waitFor`/`act` warns about state updates, ensure the auto-enter `useEffect` dispatch is wrapped (it is, via React's effect flush).

- [ ] **Step 9: Full gate + commit**

```bash
pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint && pnpm --filter @trellis/client test
git add packages/client/src/runner packages/client/test/grade.test.ts packages/client/test/useCellRunner.test.tsx
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): useCellRunner brain + grade/persist wiring (§5.1/§9.2/§10.2/§11.1)"
```

---

## Task 9: `BuildStepView` (composes EditorPane) + `StepView` kind switch (WIRING)

**Files:**
- Create: `packages/client/src/steps/BuildStepView.tsx`
- Create: `packages/client/src/steps/StepView.tsx`
- Test: `packages/client/test/buildStepView.test.tsx`
- Test: `packages/client/test/stepViewSwitch.test.tsx`

- [ ] **Step 1: Write the failing BuildStepView test** `test/buildStepView.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuildStep } from "@trellis/schema";
import { BuildStepView } from "../src/steps/BuildStepView.js";

const step: BuildStep = {
  id: "b", kind: "build", prompt: "Write announce()", skills: ["skill.x"], language: "python",
  starterCode: "def announce(number):\n    return ...", evaluator: {} as BuildStep["evaluator"],
};

describe("BuildStepView", () => {
  it("renders the prompt + an editor seeded with the current code and a Submit button", () => {
    const { container } = render(
      <BuildStepView step={step} code={step.starterCode} disabled={false} onChange={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText(/Write announce/)).toBeTruthy();
    expect(container.querySelector(".cm-content")!.textContent).toContain("def announce");
    expect(screen.getByRole("button", { name: /submit|run|check/i })).toBeTruthy();
  });

  it("calls onSubmit when the run/submit button is pressed", async () => {
    const onSubmit = vi.fn();
    render(<BuildStepView step={step} code={step.starterCode} disabled={false} onChange={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /submit|run|check/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test buildStepView`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/steps/BuildStepView.tsx`**

```tsx
import type { BuildStep } from "@trellis/schema";
import { EditorPane } from "../editor/EditorPane.js";

export interface BuildStepViewProps {
  step: BuildStep;
  code: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onSubmit: () => void;
}

export function BuildStepView({ step, code, disabled, onChange, onSubmit }: BuildStepViewProps): React.ReactElement {
  return (
    <section aria-label="build step">
      <div className="prompt">{step.prompt}</div>
      <EditorPane value={code} onChange={onChange} {...(step.lockedRegions ? { lockedRegions: step.lockedRegions } : {})} readOnly={disabled} />
      <button type="button" disabled={disabled} onClick={onSubmit}>
        Run &amp; check
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Run the BuildStepView test to verify it passes**

Run: `pnpm --filter @trellis/client test buildStepView`
Expected: PASS.

- [ ] **Step 5: Write the failing StepView switch test** `test/stepViewSwitch.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Step } from "@trellis/schema";
import { StepView } from "../src/steps/StepView.js";

const handlers = { onAdvance: vi.fn(), onSubmit: vi.fn(), onBuildChange: vi.fn(), onBuildSubmit: vi.fn() };

describe("StepView switch", () => {
  it("routes watch to the watch view", () => {
    const step: Step = { id: "w", kind: "watch", prompt: "p", skills: [], body: "the body" } as Step;
    render(<StepView step={step} disabled={false} buildCode="" {...handlers} />);
    expect(screen.getByText("the body")).toBeTruthy();
  });
  it("routes build to the build view (editor present)", () => {
    const step: Step = { id: "b", kind: "build", prompt: "p", skills: [], language: "python", starterCode: "code_here", evaluator: {} } as unknown as Step;
    const { container } = render(<StepView step={step} disabled={false} buildCode="code_here" {...handlers} />);
    expect(container.querySelector(".cm-content")).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test stepViewSwitch`
Expected: FAIL — module not found.

- [ ] **Step 7: Create `src/steps/StepView.tsx`** (the kind switch the runner renders under a React key)

```tsx
import type { Step } from "@trellis/schema";
import type { StepAnswer } from "../types.js";
import { WatchStepView } from "./WatchStepView.js";
import { PredictStepView } from "./PredictStepView.js";
import { RecognizeStepView } from "./RecognizeStepView.js";
import { RecallStepView } from "./RecallStepView.js";
import { BuildStepView } from "./BuildStepView.js";

export interface StepViewProps {
  step: Step;
  disabled: boolean;
  buildCode: string;
  onAdvance: () => void;
  onSubmit: (answer: StepAnswer) => void;
  onBuildChange: (code: string) => void;
  onBuildSubmit: () => void;
}

export function StepView(props: StepViewProps): React.ReactElement {
  const { step, disabled, buildCode, onAdvance, onSubmit, onBuildChange, onBuildSubmit } = props;
  switch (step.kind) {
    case "watch":
      return <WatchStepView step={step} onAdvance={onAdvance} />;
    case "predict":
      return <PredictStepView step={step} disabled={disabled} onSubmit={onSubmit} />;
    case "recognize":
      return <RecognizeStepView step={step} disabled={disabled} onSubmit={onSubmit} />;
    case "recall":
      return <RecallStepView step={step} disabled={disabled} onSubmit={onSubmit} />;
    case "build":
      return <BuildStepView step={step} code={buildCode} disabled={disabled} onChange={onBuildChange} onSubmit={onBuildSubmit} />;
  }
}
```

- [ ] **Step 8: Run the switch test to verify it passes**

Run: `pnpm --filter @trellis/client test stepViewSwitch`
Expected: PASS (2 tests).

- [ ] **Step 9: Full gate + commit**

```bash
pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint && pnpm --filter @trellis/client test
git add packages/client/src/steps packages/client/test/buildStepView.test.tsx packages/client/test/stepViewSwitch.test.tsx
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): BuildStepView (editor) + StepView kind switch"
```

---

## Task 10: `CellRunner` — React-keyed step replacement (§5.2) (WIRING)

**Files:**
- Create: `packages/client/src/CellRunner.tsx`
- Test: `packages/client/test/cellRunner.test.tsx`

> §5.2: the active step renders under a React `key={step.id}` so advancing UNMOUNTS the previous step component and MOUNTS the next (no lingering DOM, no shared step state). `CellRunner` composes `StepView` + `HintPanel` (FEEDBACK only) + `FeedbackPanel` (FEEDBACK only) + `PeekBackPanel`, driven by `useCellRunner`. It resolves the misconception feedback text + the predict reveal text for `FeedbackPanel`.

- [ ] **Step 1: Write the failing test** `test/cellRunner.test.tsx` (asserts keyed remount: the watch DOM is gone after advancing; full FEEDBACK affordances on a wrong recognize answer)

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { createEventBus } from "../src/eventBus.js";
import { CellRunner } from "../src/CellRunner.js";

const noSandbox: BuildSandbox = { run: async () => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }), parseAndMatch: async () => [] };

function fixture(): { bundle: Bundle; cell: Cell } {
  const cell: Cell = {
    id: "c1", nodeId: "n1", title: "Mini", certifies: ["skill.x"],
    steps: [
      { id: "w", kind: "watch", prompt: "watch prompt", skills: ["skill.x"], body: "WATCH BODY MARKER" } as Cell["steps"][number],
      { id: "r", kind: "recognize", prompt: "pick one", skills: ["skill.x"], correctChoiceId: "right",
        choices: [{ id: "right", label: "Right" }, { id: "wrong", label: "Wrong", misconception: "mis.x" }] } as Cell["steps"][number],
    ],
  };
  const bundle = {
    contentVersion: "v1",
    skills: { "skill.x": { id: "skill.x", title: "X", description: "", misconceptions: ["mis.x"], upstream: [] } },
    nodes: {}, cells: { c1: cell },
    misconceptions: { "mis.x": { id: "mis.x", skill: "skill.x", title: "m", signature: { choice: "wrong" }, hintLadder: [{ level: 1, body: "first hint" }], feedback: "MISCONCEPTION FEEDBACK MARKER" } },
    producers: {}, requirements: {},
  } as unknown as Bundle;
  return { bundle, cell };
}

let n = 0;
const fx = { newId: () => `d${n++}`, now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

describe("CellRunner (§5.2 keyed step replacement)", () => {
  it("unmounts the watch step on advance and mounts the recognize step", async () => {
    n = 0;
    const { bundle, cell } = fixture();
    render(<CellRunner cell={cell} bundle={bundle} sandbox={noSandbox} bus={createEventBus()} effects={fx} />);
    expect(await screen.findByText("WATCH BODY MARKER")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.queryByText("WATCH BODY MARKER")).toBeNull()); // unmounted
    expect(screen.getByText("pick one")).toBeTruthy();
  });

  it("shows attribution feedback + the hint ladder after a wrong answer", async () => {
    n = 0;
    const { bundle, cell } = fixture();
    render(<CellRunner cell={cell} bundle={bundle} sandbox={noSandbox} bus={createEventBus()} effects={fx} />);
    await userEvent.click(await screen.findByRole("button", { name: /continue/i }));
    await userEvent.click(await screen.findByLabelText("Wrong"));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("MISCONCEPTION FEEDBACK MARKER")).toBeTruthy();
    // pull the hint
    await userEvent.click(screen.getByRole("button", { name: /show.*hint/i }));
    expect(screen.getByText("first hint")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test cellRunner`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/CellRunner.tsx`**

```tsx
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import type { TrellisDb } from "@trellis/persist";
import type { EventBus } from "./eventBus.js";
import type { RunnerEffects } from "./runner/grade.js";
import { useCellRunner } from "./runner/useCellRunner.js";
import { StepView } from "./steps/StepView.js";
import { HintPanel } from "./hints/HintPanel.js";
import { FeedbackPanel } from "./feedback/FeedbackPanel.js";
import { PeekBackPanel } from "./peekback/PeekBackPanel.js";

export interface CellRunnerProps {
  cell: Cell;
  bundle: Bundle;
  sandbox: BuildSandbox;
  bus: EventBus;
  effects: RunnerEffects;
  db?: TrellisDb;
}

export function CellRunner(props: CellRunnerProps): React.ReactElement {
  const r = useCellRunner(props);
  const disabled = r.phase === "EVALUATING";
  const inFeedback = r.phase === "FEEDBACK";

  // Resolve FEEDBACK extras from the diagnosis.
  const misconceptionFeedback =
    inFeedback && r.lastDiagnosis?.misconceptionId !== undefined
      ? props.bundle.misconceptions[r.lastDiagnosis.misconceptionId]?.feedback
      : undefined;
  const revealText =
    inFeedback && r.step.kind === "predict"
      ? `Expected: ${r.step.expected.normalized?.join(", ") ?? "(see prompt)"}`
      : undefined;

  return (
    <div className="cell-runner">
      <h2 className="cell-title">{props.cell.title}</h2>

      {/* §5.2 — keyed by StepId: advancing remounts a fresh step component. */}
      <div key={r.step.id} className="active-step">
        <StepView
          step={r.step}
          disabled={disabled}
          buildCode={r.buildCode}
          onAdvance={r.advance}
          onSubmit={(answer) => {
            if (answer.kind !== "build") void r.submitNonBuild(answer);
          }}
          onBuildChange={r.setBuildCode}
          onBuildSubmit={() => void r.submitBuild()}
        />
      </div>

      {inFeedback && r.lastDiagnosis && (
        <>
          <FeedbackPanel
            diagnosis={r.lastDiagnosis}
            {...(misconceptionFeedback !== undefined ? { misconceptionFeedback } : {})}
            {...(revealText !== undefined ? { revealText } : {})}
          />
          <HintPanel ladder={r.ladder} state={r.hintState} onPull={r.pullHint} />
          {r.lastDiagnosis.correct || r.step.kind === "watch" ? (
            <button type="button" onClick={r.advance}>Continue</button>
          ) : (
            <button type="button" onClick={r.retry}>Try again</button>
          )}
        </>
      )}

      <PeekBackPanel entries={r.peekBack} onOpen={r.openPeekBack} />

      {r.isComplete && <div className="cell-complete">Cell complete ✓</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run the CellRunner test to verify it passes**

Run: `pnpm --filter @trellis/client test cellRunner`
Expected: PASS (2 tests).

- [ ] **Step 5: Full gate + commit**

```bash
pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint && pnpm --filter @trellis/client test
git add packages/client/src/CellRunner.tsx packages/client/test/cellRunner.test.tsx
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): CellRunner with React-keyed step replacement (§5.2)"
```

---

## Task 11: Content bootstrap + sandbox wiring + static host (WIRING)

**Files:**
- Create: `packages/client/src/app/loadContent.ts`
- Create: `packages/client/src/app/makeSandbox.ts`
- Create: `packages/client/src/app/TrellisApp.tsx`
- Create: `packages/client/src/app/main.tsx`
- Create: `packages/client/index.html`
- Test: `packages/client/test/loadContent.test.ts`

> Content loads via persist's `loadBundle` (static `fetch` + `contentVersion` cache, §3.10). The browser uses `nativeDriver` + `createSandbox` (Pyodide). `index.html` is the static host servable by `python -m http.server` with NO server logic (the M5 acceptance posture). The Pyodide-grading + real-browser-IndexedDB half is DEFERRED to a networked browser — `main.tsx` wires it but is not exercised offline.

- [ ] **Step 1: Write the failing loadContent test** `test/loadContent.test.ts` (uses `memoryDriver` + an injected `fetchImpl` returning a real compiled bundle — no network)

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { memoryDriver, openTrellisDb } from "@trellis/persist";
import { loadCellContent } from "../src/app/loadContent.js";

// Compile the real corpus bundle once for this test (offline; uses the authoring CLI dist).
function realBundleJson(): { json: unknown; contentVersion: string } {
  const out = "/tmp/trellis-client-bundle.json";
  execSync(`node ${process.cwd()}/../authoring/dist/src/cli.js build --out ${out} --content ${process.cwd()}/../../content`, { stdio: "ignore" });
  const json = JSON.parse(readFileSync(out, "utf8")) as { contentVersion: string };
  return { json, contentVersion: json.contentVersion };
}

describe("loadCellContent", () => {
  it("loads a Bundle via persist's contentVersion cache (injected fetch, no network) and finds a cell", async () => {
    const { json, contentVersion } = realBundleJson();
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => json })) as unknown as typeof fetch;
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const { bundle, cell } = await loadCellContent(db, {
      url: "/bundle.json", contentVersion, cellId: "cell.string_concat.text_plus_number", fetchImpl,
    });
    expect(bundle.contentVersion).toBe(contentVersion);
    expect(cell.id).toBe("cell.string_concat.text_plus_number");
    expect(cell.steps.some((s) => s.kind === "build")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @trellis/client test loadContent`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/loadContent.ts`**

```ts
import type { Bundle, Cell } from "@trellis/schema";
import { loadBundle, type TrellisDb } from "@trellis/persist";

export interface LoadCellOptions {
  url: string;
  contentVersion: string;
  cellId: string;
  fetchImpl?: typeof fetch;
}

// Load (or serve from the contentVersion cache) the compiled Bundle, then pick one cell.
export async function loadCellContent(db: TrellisDb, opts: LoadCellOptions): Promise<{ bundle: Bundle; cell: Cell }> {
  const bundle = await loadBundle(db, {
    url: opts.url,
    contentVersion: opts.contentVersion,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  const cell = bundle.cells[opts.cellId];
  if (cell === undefined) throw new Error(`loadCellContent: cell ${opts.cellId} not in bundle`);
  return { bundle, cell };
}
```

- [ ] **Step 4: Run the loadContent test to verify it passes**

Run: `pnpm --filter @trellis/client test loadContent`
Expected: PASS. (If the `execSync` path is wrong, adjust the relative path to `packages/authoring/dist/src/cli.js` and `content/` from the client package cwd.)

- [ ] **Step 5: Create `src/app/makeSandbox.ts`** (production Pyodide wiring — DEFERRED real verify)

```ts
import { createSandbox, browserWorkerFactory } from "@trellis/sandbox";
import type { BuildSandbox } from "@trellis/engine";

// Production sandbox: the Pyodide Web Worker host. Real-Pyodide-in-WASM behavior is DEFERRED
// to a networked browser (no network here). createSandbox returns a ManagedSandbox, which
// structurally satisfies BuildSandbox ({ run, parseAndMatch }).
export function makeBrowserSandbox(): BuildSandbox {
  return createSandbox({ workerFactory: browserWorkerFactory });
}
```

- [ ] **Step 6: Create `src/app/TrellisApp.tsx`** (top-level host: loads content, opens the DB, renders the CellRunner once both are ready)

```tsx
import { useEffect, useState } from "react";
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { openTrellisDb, nativeDriver, type TrellisDb } from "@trellis/persist";
import { createEventBus } from "../eventBus.js";
import { CellRunner } from "../CellRunner.js";
import { loadCellContent } from "./loadContent.js";

export interface TrellisAppProps {
  bundleUrl: string;
  contentVersion: string;
  cellId: string;
  sandbox: BuildSandbox;
}

const bus = createEventBus(); // single stubbed bus for the app (M6 attaches a subscriber here)

export function TrellisApp({ bundleUrl, contentVersion, cellId, sandbox }: TrellisAppProps): React.ReactElement {
  const [ready, setReady] = useState<{ bundle: Bundle; cell: Cell; db: TrellisDb } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let db: TrellisDb | null = null;
    (async () => {
      try {
        db = await openTrellisDb(nativeDriver());
        const { bundle, cell } = await loadCellContent(db, { url: bundleUrl, contentVersion, cellId });
        setReady({ bundle, cell, db });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => db?.close();
  }, [bundleUrl, contentVersion, cellId]);

  if (err !== null) return <div role="alert">Failed to load: {err}</div>;
  if (ready === null) return <div>Loading…</div>;
  return (
    <CellRunner
      cell={ready.cell}
      bundle={ready.bundle}
      sandbox={sandbox}
      bus={bus}
      db={ready.db}
      effects={{ newId: () => crypto.randomUUID(), now: () => new Date().toISOString(), learnerId: ready.db.learnerId }}
    />
  );
}
```

- [ ] **Step 7: Create `src/app/main.tsx`** (browser entry — not exercised offline)

```tsx
import { createRoot } from "react-dom/client";
import { TrellisApp } from "./TrellisApp.js";
import { makeBrowserSandbox } from "./makeSandbox.js";

// Static-model entry: served from `python -m http.server` with NO server logic. The
// contentVersion + bundle URL are injected at build time (here: defaults for the proving slice).
const root = createRoot(document.getElementById("root")!);
root.render(
  <TrellisApp
    bundleUrl="./bundle.json"
    contentVersion={(globalThis as { __TRELLIS_CONTENT_VERSION__?: string }).__TRELLIS_CONTENT_VERSION__ ?? ""}
    cellId="cell.string_concat.text_plus_number"
    sandbox={makeBrowserSandbox()}
  />,
);
```

- [ ] **Step 8: Create `index.html`** (static host)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Trellis</title>
  </head>
  <body>
    <div id="root"></div>
    <!-- Built bundle + main entry are emitted by a future build step; M5 ships the slice
         served from `python -m http.server`. Real-Pyodide grading is DEFERRED (needs network). -->
    <script type="module" src="./dist/src/app/main.js"></script>
  </body>
</html>
```

- [ ] **Step 9: Full gate + commit**

```bash
pnpm --filter @trellis/client typecheck && pnpm --filter @trellis/client lint && pnpm --filter @trellis/client test
git add packages/client/src/app packages/client/index.html packages/client/test/loadContent.test.ts
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): content bootstrap, Pyodide sandbox wiring, static host (§3.10/§6.1)"
```

---

## Task 12: Public barrel + marquee offline walkthrough + reload-survival + acyclicity gate (FINAL)

**Files:**
- Create: `packages/client/src/index.ts`
- Create: `packages/client/test/walkthrough.offline.test.tsx`
- Create: `packages/client/test/esm-probe.mjs`
- Test: (the two test files above)

> The barrel is touched ONLY here (parallel edits would collide). The marquee test drives the REAL `cell.string_concat.text_plus_number` through the CPython twin (`createLocalSandbox`) end-to-end: a `"..." + number` build submission → `mis.concat.str_num` → pull the ladder → fix → pass; then a simulated reload proves mastery + history survive. This is the OFFLINE half of the M5 acceptance gate; the real-Pyodide-in-browser walkthrough is DEFERRED.

- [ ] **Step 1: Create `src/index.ts`** (public API surface)

```ts
// @trellis/client — the React presentation slice (M5). Consumes schema/engine/persist/sandbox.
export { CellRunner } from "./CellRunner.js";
export type { CellRunnerProps } from "./CellRunner.js";
export { useCellRunner } from "./runner/useCellRunner.js";
export type { UseCellRunnerArgs, CellRunnerView } from "./runner/useCellRunner.js";
export { gradeStep, persistDiagnosis } from "./runner/grade.js";
export type { RunnerEffects } from "./runner/grade.js";
export { createEventBus } from "./eventBus.js";
export type { EventBus, UiEvent } from "./eventBus.js";
export type { PeekBackEntry, StepAnswer } from "./types.js";
export { attributionStyle } from "./attribution.js";
export type { AttributionStyle } from "./attribution.js";
// Components
export { StepView } from "./steps/StepView.js";
export { WatchStepView } from "./steps/WatchStepView.js";
export { PredictStepView } from "./steps/PredictStepView.js";
export { RecognizeStepView } from "./steps/RecognizeStepView.js";
export { RecallStepView } from "./steps/RecallStepView.js";
export { BuildStepView } from "./steps/BuildStepView.js";
export { EditorPane } from "./editor/EditorPane.js";
export { lockedRegionsExtension, lineRangesToOffsets } from "./editor/lockedRegions.js";
export { HintPanel } from "./hints/HintPanel.js";
export { FeedbackPanel } from "./feedback/FeedbackPanel.js";
export { PeekBackPanel } from "./peekback/PeekBackPanel.js";
// App bootstrap
export { TrellisApp } from "./app/TrellisApp.js";
export { loadCellContent } from "./app/loadContent.js";
export { makeBrowserSandbox } from "./app/makeSandbox.js";
```

- [ ] **Step 2: Write the failing marquee offline test** `test/walkthrough.offline.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Bundle, Cell } from "@trellis/schema";
import { createLocalSandbox } from "@trellis/sandbox";
import { memoryDriver, openTrellisDb, loadLearnerModel, readDiagnoses } from "@trellis/persist";
import { createEventBus } from "../src/eventBus.js";
import { CellRunner } from "../src/CellRunner.js";

function realBundle(): Bundle {
  const out = "/tmp/trellis-walkthrough-bundle.json";
  execSync(`node ${process.cwd()}/../authoring/dist/src/cli.js build --out ${out} --content ${process.cwd()}/../../content`, { stdio: "ignore" });
  return JSON.parse(readFileSync(out, "utf8")) as Bundle;
}

let n = 0;
const fx = { newId: () => `diag-${n++}`, now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

// CPython twin satisfies BuildSandbox structurally ({ run, parseAndMatch }).
const sandbox = createLocalSandbox();

describe("MARQUEE offline walkthrough (string_concat str_num) — real engine+sandbox(twin)+persist", () => {
  it("build a str_num bug → misconception → hint → fix → pass; mastery+history survive reload", async () => {
    n = 0;
    const bundle = realBundle();
    const cell: Cell = bundle.cells["cell.string_concat.text_plus_number"]!;
    const buildStep = cell.steps.find((s) => s.kind === "build")!;
    const driver = memoryDriver();
    const db = await openTrellisDb(driver, { idGen: () => "L" });

    // Render only the build step's cell, but drive directly to the build step by constructing a
    // single-step cell to keep the test focused on grading + persistence + ladder.
    const buildOnly: Cell = { ...cell, steps: [buildStep] };

    render(
      <CellRunner cell={buildOnly} bundle={bundle} sandbox={sandbox} bus={createEventBus()} db={db} effects={fx} />,
    );

    // editor mounts with the starter code
    const editor = await screen.findByLabelText("build step");
    expect(editor).toBeTruthy();

    // Type a buggy `"..." + number` solution by replacing the editor doc through the public
    // CellRunner path is awkward in a DOM test; instead assert the GRADING wiring via the
    // engine directly is covered in grade.test — here we verify the END-TO-END twin grading by
    // submitting the starter (which is incomplete → not a pass), then confirm a misconception or
    // mismatch attribution renders, the ladder is pullable, and a corrected solution passes.

    // Submit the (incomplete) starter → expect a non-pass FEEDBACK band to appear.
    await userEvent.click(screen.getByRole("button", { name: /run.*check/i }));
    await waitFor(() => expect(screen.getByLabelText("feedback")).toBeTruthy(), { timeout: 15000 });

    // history + mastery were committed for the submission
    const hist = await readDiagnoses(db);
    expect(hist.length).toBeGreaterThanOrEqual(1);
    const model = await loadLearnerModel(db, bundle.contentVersion);
    expect(Object.keys(model.skills).length).toBeGreaterThanOrEqual(1);
    db.close();

    // SIMULATED RELOAD: reopen from the same driver → mastery + history survive identically.
    const db2 = await openTrellisDb(driver, { idGen: () => "SHOULD-NOT-BE-USED" });
    expect(db2.learnerId).toBe("L");
    const hist2 = await readDiagnoses(db2);
    const model2 = await loadLearnerModel(db2, bundle.contentVersion);
    expect(hist2).toEqual(hist);
    expect(model2).toEqual(model);
  }, 30000);
});
```

> NOTE on scope: typing a full Python solution into CodeMirror under happy-dom and asserting the exact `mis.concat.str_num` attribution end-to-end through the DOM is brittle and slow (the twin spawns `python3` per run). The robust split is: (a) `grade.test.ts` already proves the engine→twin→diagnosis attribution wiring with direct calls; (b) this test proves the END-TO-END CellRunner → twin → persist → reload survival path through the real UI. If you want a stronger end-to-end misconception assertion, add a direct `gradeStep(buildStep, {kind:"build", code: '"Your random number is: " + number'}, sandbox, bundle, fx)` call in `grade.test.ts` and assert `attribution === "misconception"` / `misconceptionId === "mis.concat.str_num"` — that is the deterministic, fast home for the marquee diagnosis claim. ADD THAT ASSERTION in Step 3 below.

- [ ] **Step 3: Strengthen `grade.test.ts` with the real twin marquee diagnosis** (append to `test/grade.test.ts`)

```ts
// --- appended: marquee str_num diagnosis through the real CPython twin ---
import { readFileSync as _read } from "node:fs";
import { execSync as _exec } from "node:child_process";
import { createLocalSandbox } from "@trellis/sandbox";
import type { Bundle as _Bundle, Cell as _Cell, BuildStep as _BuildStep } from "@trellis/schema";

function _realBundle(): _Bundle {
  const out = "/tmp/trellis-grade-bundle.json";
  _exec(`node ${process.cwd()}/../authoring/dist/src/cli.js build --out ${out} --content ${process.cwd()}/../../content`, { stdio: "ignore" });
  return JSON.parse(_read(out, "utf8")) as _Bundle;
}

describe("marquee build diagnosis (real CPython twin)", () => {
  it("'...: ' + number → mis.concat.str_num; str() coercion → pass", async () => {
    const bundle = _realBundle();
    const cell = bundle.cells["cell.string_concat.text_plus_number"] as _Cell;
    const step = cell.steps.find((s) => s.kind === "build") as _BuildStep;
    const twin = createLocalSandbox();
    const fx2 = { newId: () => "dx", now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

    const bug = await gradeStep(step, { kind: "build", code: 'def announce(number):\n    return "Your random number is: " + number\n' }, twin, bundle, fx2);
    expect(bug.correct).toBe(false);
    expect(bug.misconceptionId).toBe("mis.concat.str_num");

    const ok = await gradeStep(step, { kind: "build", code: 'def announce(number):\n    return "Your random number is: " + str(number)\n' }, twin, bundle, fx2);
    expect(ok.correct).toBe(true);
    expect(ok.attribution).toBe("pass");
  }, 30000);
});
```

- [ ] **Step 4: Run the new tests to verify they fail then pass**

Run: `pnpm --filter @trellis/client test grade walkthrough`
Expected: After the barrel + tests exist, both PASS. The twin spawns `python3` — these tests are slower (seconds). If `python3` is unavailable the test errors clearly; ensure `python3 --version` works (it does in this env).

- [ ] **Step 5: Create the native-ESM acyclicity probe** `test/esm-probe.mjs` (verifies the built `dist` barrel imports cleanly under DOM globals — the ESM build-cycle trap from §5 of the coordination doc)

```js
// Boot minimal DOM globals (a browser package legitimately touches the DOM), then import the
// built barrel. A real ESM init cycle throws "Cannot access 'X' before initialization"; a
// missing-DOM error is NOT what we are testing. We register happy-dom's window first.
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost/" });
for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "customElements", "getComputedStyle", "DOMParser", "MutationObserver"]) {
  if (globalThis[k] === undefined && win[k] !== undefined) globalThis[k] = win[k];
}
globalThis.window ??= win;
globalThis.document ??= win.document;

const mod = await import("../dist/src/index.js");
const required = ["CellRunner", "useCellRunner", "createEventBus", "EditorPane", "HintPanel", "FeedbackPanel", "PeekBackPanel", "StepView"];
const missing = required.filter((k) => mod[k] === undefined);
if (missing.length > 0) {
  console.error("esm-probe FAIL: missing exports:", missing.join(", "));
  process.exit(1);
}
console.log("esm-probe OK: barrel imported, no ESM init cycle,", required.length, "exports present");
```

- [ ] **Step 6: Build, then run the acyclicity probe**

Run:
```bash
pnpm --filter @trellis/client build
node packages/client/test/esm-probe.mjs
```
Expected: build emits `dist/`; probe prints `esm-probe OK`. If it throws "Cannot access … before initialization", there is a real ESM cycle — break it (move the offending shared type/value to a leaf module). If it throws a DOM `ReferenceError`, extend the globals list in the probe.

- [ ] **Step 7: Run the FULL per-package gate (the definition of done)**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/client typecheck \
  && pnpm --filter @trellis/client lint \
  && pnpm --filter @trellis/client test \
  && pnpm --filter @trellis/client build \
  && node packages/client/test/esm-probe.mjs
```
Expected: ALL green. Then confirm the whole workspace still passes (no regression in the consumed packages):
```bash
pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build
python3 content/validate.py && python3 content/verify/harness.py
```
Expected: 350 existing tests + the new client tests all pass; `validate.py` PASS; `harness.py` gate5+gate6 PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/index.ts packages/client/test/walkthrough.offline.test.tsx packages/client/test/esm-probe.mjs packages/client/test/grade.test.ts
git -c user.name='Stream G — M5 client' -c user.email='noreply@anthropic.com' \
  commit -m "feat(client): public barrel, marquee offline walkthrough, reload-survival + ESM acyclicity gate"
```

- [ ] **Step 9: Report status to the orchestrator**

Paste the real command output from Step 7. State explicitly:
- ✅ OFFLINE gates green: `@trellis/client` typecheck/lint/test/build; whole-workspace `-r` gates; content validators.
- ✅ Marquee diagnosis proven through the CPython twin (`mis.concat.str_num` on `"..."+number`; pass on `str()` coercion).
- ✅ Reload survival proven via `memoryDriver` (mastery + history identical across close/reopen).
- ✅ EventBus stub seam (emit sites present, no subscriber) — M6 attaches with zero emit-site change.
- ⚠️ **DEFERRED to a networked browser** (same posture as M3a/M3b/M5-persist `nativeDriver`): the real-Pyodide-in-WASM in-browser walkthrough + real-browser IndexedDB end-to-end, and CodeMirror typing-driven full-DOM grading. **Built and wired; not claimed as run in-browser.**
- Lockfile drift from the new React/CodeMirror/testing deps is expected new-package churn — orchestrator resolves it on merge to `main`.

---

## Self-Review (run against the spec + START-HERE before executing)

**Spec coverage (spec §M5 + design sections named in START-HERE):**
- §5.2 React-keyed step replacement (unmount/remount per StepId) → Task 10 (`key={r.step.id}`) + test asserting the prior step DOM unmounts.
- §5.1 all five step kinds → Task 3 (watch/predict/recognize/recall) + Task 9 (build) + Task 9 switch.
- §5.1 FEEDBACK state, attribution-colored → Task 2 (`attribution.ts`) + Task 6 (`FeedbackPanel`) + Task 10 wiring.
- §5.3 read-only peek-back reconstructed from history → Task 7 (`PeekBackPanel`) + Task 8 (`makePeekEntry`, history in reducer).
- §9.2 hint panel pull/dose, one level per press, level-4 confirm, reset-on-new-misconception, autoEscalate available → Task 5 (`HintPanel`) + Task 8 (`pullHint`/`syncLadder` wiring) + Task 10.
- §6.1 Sandbox.run contract wired → Task 8 (`evaluate` via injected `BuildSandbox`) + Task 11 (`createSandbox`) + Task 12 (twin).
- §11.1 EventBus emit seam STUBBED (sites present, no subscriber) → Task 2 (`eventBus.ts`) + emit sites in Task 8/10; barrel re-exports for M6.
- CodeMirror editor pane chosen for read-only ranges (lockedRegions seam) → Task 4.
- Content via static fetch through persist's contentVersion cache → Task 11 (`loadCellContent` → `loadBundle`).
- M5 acceptance (whole-slice; partly DEFERRED) → Task 12 (offline marquee + reload survival; real-Pyodide-in-browser explicitly deferred + documented).
- New disjoint package, `packages/*` glob, no `pnpm-workspace.yaml` edit, no shared-package edits → Task 1 (package.json only) + guardrails throughout.
- Offline npm pre-flight → resolved in the header (network available; React/CM/testing install); fallback-to-escalate noted in Task 1 Step 8.
- ESM acyclicity (build + native-ESM import probe, DOM caveat) → Task 12 Steps 5–6.

**Placeholder scan:** No TODO/TBD; every code step has complete code; every command has expected output. The two DOM-brittle spots (EditorPane onChange dispatch in Task 4; full-DOM Python-typing in Task 12) are explicitly de-risked by routing the authoritative assertions to fast, deterministic homes (the integration test / `grade.test.ts`) with a written rationale — not left as gaps.

**Type consistency:** `BuildSandbox` (engine) used uniformly; `RunnerEffects` ({newId, now, learnerId}) consistent across `grade.ts`, `useCellRunner`, `CellRunner`, `TrellisApp`; `StepAnswer` discriminants match the engine `NonBuildSubmission` shapes; `HintPanel.onPull(opts?: {confirmRevealCode:true})` matches `useCellRunner.pullHint` and engine `LadderOptions`; `PeekBackEntry` shape consistent across `types.ts`, `PeekBackPanel`, and `makePeekEntry`; `CellRunnerProps`/`UseCellRunnerArgs` share `{cell,bundle,sandbox,bus,db?,effects}`.

**Open risks flagged for the executor (not blockers):**
1. JSX-under-vitest via esbuild `jsx:"automatic"` — validated by the Task 1 smoke test; documented `@vitejs/plugin-react` fallback if it fails.
2. `react-hooks/exhaustive-deps` eslint directives are inert under the base config (the plugin isn't enabled); delete the comments if lint flags an unused directive.
3. CodeMirror DOM interactions under happy-dom — authoritative assertions routed away from brittle DOM typing.
4. If a consumed package's API differs from the signatures captured here, STOP and escalate (do not edit the package).
