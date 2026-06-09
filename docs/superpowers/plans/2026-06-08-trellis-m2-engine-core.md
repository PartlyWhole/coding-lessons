# Trellis M2 — `@trellis/engine` Pure Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@trellis/engine` — the deterministic, pure-functional core of Trellis: availability/gating resolver, spine navigation, the step lifecycle state machine, non-build diagnosis (recognize/recall/predict) with misconception detection, and the learner-model mastery update + upstream targeter.

**Architecture:** A side-effect-free TypeScript library that consumes the **frozen** `@trellis/schema` contract **as types only** (`import type`), so the compiled output has *zero* runtime dependency on the schema package — sidestepping the ESM build-cycle trap (`docs/coordination/PARALLEL-STREAMS.md` §5). Every function is pure: no clocks, no randomness, no I/O. Effects the design needs (the wall-clock timestamp and ids on a `Diagnosis`) are **injected** by the caller. The one runtime dependency is `re2js` (pure-JS RE2) for linear-time `recall`/`predict` pattern matching. All behaviour is exhaustively unit-tested against **hand-authored `Bundle`/`Graph` fixtures** (no dependency on M1).

**Tech Stack:** TypeScript 5.6 (ESM, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest 2, `@trellis/schema` (workspace, type-only), `re2js@^2.8.3`.

---

## Design facts pinned for this plan (read before coding)

These resolve the gaps between the §-numbered `TECHNICAL_DESIGN.md` pseudocode and the **frozen** `@trellis/schema`. The schema is authoritative; where the design pseudocode references fields that do not exist on the frozen types, this plan adapts the *engine's function signatures* (an internal API choice — **not** a contract change).

1. **Ids are plain `string`s.** `@trellis/schema/ids.ts` exports `SkillId`/`NodeId`/`CellId`/`StepId`/`MisconId` as runtime TypeBox *values* only — there are **no** exported TS type aliases for them. After `Static<>` inference every id field is `string`. So engine code uses `string`, never `import type { NodeId }`.

2. **The engine imports `@trellis/schema` as types ONLY.** It consumes the shapes (`Bundle`, `Graph`, `ConceptNode`, `Requirement`, `Step` + variants, `Skill`, `Misconception`, `Signature`, `RawSignals`, `Diagnosis`, `SkillState`, `SkillDelta`, `LearnerModel`, `AcceptedAnswer`, `Choice`, `Attribution`, `StepKind`, `Json`). It never validates at runtime (it trusts the frozen contract), so it never needs the TypeBox schema *values*. With `verbatimModuleSyntax`, type-only imports MUST be written `import type { … } from "@trellis/schema"`. Result: compiled JS has no `@trellis/schema` import at all.

3. **Non-build submissions are NOT carried in `RawSignals`.** The frozen `RawSignals` has no `chosenChoiceId`/`recallInput` field (the §7 pseudocode's `signals.chosenChoiceId` does not exist on the frozen type). The frozen `Signature` *does* have `{ choice }` and `{ recallEquals }` forms — meant to match the learner's submission. Therefore the engine threads the submission through a separate `DetectContext`, and the public non-build entry takes an explicit `NonBuildSubmission` parameter. `Diagnosis.signals` for a non-build step is a minimal `{ ran: false, wallMs: 0 }` (the submission is captured by `attribution`/`correct`/`misconceptionId`, not raw in `signals`).

4. **No authored `priority` on `Misconception`.** The frozen `Misconception` has no `priority` field, so `detect`'s tie-break is **(1) specificity rank, then (2) stable id order** — the §7 "authored priority int" step is dropped (documented in code).

5. **`detect` is implemented fully over `RawSignals` for ALL signature forms** (incl. `testFailure`/`propertyFailed`/`timedOut`/`astTag` used by build steps). Build *grading* (`evaluate`) is M3b and out of scope, but `detect`/`evalSignature` operate purely on `RawSignals` + the `DetectContext`, so they are complete and fully testable now.

6. **The gating pair (milestone gate)** — pinned by content (`docs/coordination/PARALLEL-STREAMS.md` §6): `node.random` (extension) requires `skill.var.assign` @ **0.6** (kind `track`, producer `node.variables`) and `skill.output.print_literal` @ **0.5** (kind `utility`, producer `node.output`). Test: hold `print_literal ≥ 0.5` met and toggle `var.assign` across 0.6 → `random` flips `locked` ↔ `available`. `var.assign` is the deciding gate.

7. **`recall`/`predict` pattern matching uses `re2js` anchored full-match** (`RE2JS.compile(p).matches(value)`), the deterministic/conservative choice; authors widen with `.*` if they want partial. (`re2js` API verified: `import { RE2JS } from "re2js"`; `.matches()` = anchored, `.test()` = unanchored.)

8. **Determinism via injected effects.** `diagnoseNonBuild` takes `{ id, learnerId, now }` — there are no clock/uuid calls in the engine. `Diagnosis.seed` is `0` for non-build steps (no `evaluator.property.seed`).

---

## File structure

```
packages/engine/
  package.json            # @trellis/engine; deps: @trellis/schema (workspace), re2js
  tsconfig.json           # extends ../../tsconfig.base.json, outDir dist
  vitest.config.ts        # mirror packages/schema
  src/
    index.ts              # barrel: re-export the public API
    config.ts             # EngineConfig + DEFAULT_CONFIG + clamp01
    normalize.ts          # normalize(text) for recall/predict comparison
    deepEqual.ts          # structural equality over Json (for testFailure.gotEquals)
    resolver.ts           # meets, completed, resolveAvailability, whyLocked, AvailabilityMap
    navigation.ts         # spineOrder, nextSpineCell, availabilityDiff
    stepMachine.ts        # Phase, MachineState, step() transitions
    detect.ts             # DetectContext, evalSignature, specificityRank, detect
    diagnose.ts           # NonBuildSubmission, matchesAccepted, compareNonBuild,
                          # computeDeltas, diagnoseNonBuild
    learnerModel.ts       # newSkillState, applyDiagnosis, targetUpstream
  test/
    fixtures.ts           # hand-authored Bundle/Graph + sample steps (proving slice)
    resolver.test.ts
    navigation.test.ts
    stepMachine.test.ts
    detect.test.ts
    diagnose.test.ts
    learnerModel.test.ts
    gating.test.ts        # the milestone gate
    determinism.test.ts
```

Module dependency graph (acyclic by construction): `config` ← (nothing); `normalize`, `deepEqual` ← (nothing); `resolver`, `navigation` ← `config`; `detect` ← `normalize`, `deepEqual`; `diagnose` ← `detect`, `normalize`, `config`; `learnerModel` ← `config`; `index` ← all. No module imports a sibling that imports it back.

---

## Conventions for every task

- **pnpm via corepack** — prefix any pnpm command with: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"`.
- **Run from the worktree root** `/Users/alan/Desktop/trellis-m2` (cwd/git/pnpm are already scoped here).
- **Commit** with `-c user.name='m2-engine' -c user.email='noreply@anthropic.com'`, Conventional Commits.
- **Type-only imports** from `@trellis/schema` are always `import type { … }`.
- Engine purity is enforced by the existing ESLint override in `.eslintrc.cjs` (`packages/engine/**`): no `react`/`react-dom`/`idb`/`pyodide`/`@trellis/persist`, no bare `fetch`. `re2js` is allowed.

---

## Task 0: Scaffold the `@trellis/engine` package

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/vitest.config.ts`
- Create: `packages/engine/src/index.ts`
- Create: `packages/engine/test/smoke.test.ts`

- [ ] **Step 1: Create `packages/engine/package.json`**

```json
{
  "name": "@trellis/engine",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint src test --ext .ts"
  },
  "dependencies": {
    "@trellis/schema": "workspace:*",
    "re2js": "^2.8.3"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/engine/tsconfig.json`** (mirrors `packages/schema/tsconfig.json`)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/engine/vitest.config.ts`** (mirrors schema)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 4: Create `packages/engine/src/index.ts`** (temporary stub; filled by later tasks)

```ts
// @trellis/engine — pure, deterministic core. Public API barrel.
// Populated incrementally; see docs/superpowers/plans/2026-06-08-trellis-m2-engine-core.md
export const ENGINE_VERSION = "0.0.0";
```

- [ ] **Step 5: Create `packages/engine/test/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { ENGINE_VERSION } from "../src/index.js";

describe("@trellis/engine scaffold", () => {
  it("exports a version constant", () => {
    expect(ENGINE_VERSION).toBe("0.0.0");
  });
});
```

- [ ] **Step 6: Install the new dependency (`re2js`) and link the workspace package**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm install
```
Expected: install succeeds; `re2js` (≈2.8.3, zero deps) is added; `@trellis/engine` is linked into the workspace. (Network to the npm registry works here — only Pyodide/pygame wheels are blocked.)

- [ ] **Step 7: Verify the full gate is green on the empty package**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine typecheck && \
pnpm --filter @trellis/engine lint && \
pnpm --filter @trellis/engine test && \
pnpm --filter @trellis/engine build
```
Expected: typecheck PASS, lint PASS (no errors), test PASS (1 test: scaffold), build PASS (emits `packages/engine/dist/`).

- [ ] **Step 8: Verify the compiled output is importable under native ESM (build-cycle trap check)**

Run:
```bash
node -e "import('./packages/engine/dist/src/index.js').then(m => { if (m.ENGINE_VERSION !== '0.0.0') throw new Error('bad export'); console.log('ESM import OK'); })"
```
Expected: prints `ESM import OK`. (Because the engine imports `@trellis/schema` as *types only*, the compiled `index.js` has no runtime cross-package import to resolve.)

- [ ] **Step 9: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine pnpm-lock.yaml
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): scaffold @trellis/engine package (schema as type-only dep + re2js)"
```

---

## Task 1: Engine config (constants + clamp)

**Files:**
- Create: `packages/engine/src/config.ts`
- Test: covered indirectly by `learnerModel.test.ts` (Task 8); add a focused unit test here.
- Test: `packages/engine/test/config.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/config.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { clamp01, DEFAULT_CONFIG } from "../src/config.js";

describe("clamp01", () => {
  it("clamps below 0 and above 1, passes through the middle", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBeCloseTo(0.3, 10);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("exposes the tuning constants in [0,1] where applicable", () => {
    expect(DEFAULT_CONFIG.learnRate).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.learnRate).toBeLessThanOrEqual(1);
    expect(DEFAULT_CONFIG.completionThreshold).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.completionThreshold).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test config`
Expected: FAIL — cannot resolve `../src/config.js`.

- [ ] **Step 3: Implement `packages/engine/src/config.ts`**

```ts
// Engine tuning constants (§10.2). Identical across learners → deterministic.
// Injectable so content/tests can override without touching the update math.

export interface EngineConfig {
  /** §10.2 LEARN_RATE — pass nudges mastery toward 1 with diminishing returns. */
  learnRate: number;
  /** §10.2 SLIP — mastery penalty per misconception delta. */
  slip: number;
  /** §10.2 SMALL — mastery penalty for a generic fail (mismatch/syntax/runtime). */
  small: number;
  /** §4.3 COMPLETION_THRESHOLD — a node is "done" when every taught skill is at/above this. */
  completionThreshold: number;
  /** Weight applied to a `pass` delta when content authors none (non-build steps). */
  defaultPassWeight: number;
  /** Weight applied to a default fail/misconception delta when content authors none. */
  defaultFailWeight: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  learnRate: 0.5,
  slip: 0.15,
  small: 0.05,
  completionThreshold: 0.8,
  defaultPassWeight: 1,
  defaultFailWeight: 1,
};

export function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/src/config.ts packages/engine/test/config.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): add EngineConfig tuning constants and clamp01"
```

---

## Task 2: Text normalization

**Files:**
- Create: `packages/engine/src/normalize.ts`
- Test: `packages/engine/test/normalize.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/normalize.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { normalize } from "../src/normalize.js";

describe("normalize", () => {
  it("trims, lowercases, and collapses internal whitespace", () => {
    expect(normalize("  Hello   World  ")).toBe("hello world");
    expect(normalize("A\tB\nC")).toBe("a b c");
    expect(normalize("already")).toBe("already");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test normalize`
Expected: FAIL — cannot resolve `../src/normalize.js`.

- [ ] **Step 3: Implement `packages/engine/src/normalize.ts`**

```ts
// Normalization for recall/predict free-text comparison (§8 compareNonBuild,
// §7 recallEquals). Deterministic, locale-independent: trim, lowercase, collapse
// any run of whitespace to a single space.
export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test normalize`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/src/normalize.ts packages/engine/test/normalize.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): add text normalization for non-build comparison"
```

---

## Task 3: Structural equality over Json

**Files:**
- Create: `packages/engine/src/deepEqual.ts`
- Test: `packages/engine/test/deepEqual.test.ts`

Used by `detect`'s `testFailure.gotEquals` matching (a build-path signature, but `detect` is implemented in full now).

- [ ] **Step 1: Write the failing test** — `packages/engine/test/deepEqual.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { deepEqual } from "../src/deepEqual.js";

describe("deepEqual", () => {
  it("compares primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, 0)).toBe(false);
  });

  it("compares arrays structurally and order-sensitively", () => {
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([1], [1, 2])).toBe(false);
  });

  it("compares objects key-by-key regardless of insertion order", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: { c: 3 } }, { a: { c: 3 } })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test deepEqual`
Expected: FAIL — cannot resolve `../src/deepEqual.js`.

- [ ] **Step 3: Implement `packages/engine/src/deepEqual.ts`**

```ts
import type { Json } from "@trellis/schema";

// Structural equality for Json values (§6.2 deep-equal comparator semantics,
// reused by detect's testFailure.gotEquals). Arrays are order-sensitive; objects
// compare by key set + per-key values, order-independent.
export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i] as Json, b[i] as Json)) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, Json>;
    const bo = b as Record<string, Json>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
      if (!deepEqual(ao[k] as Json, bo[k] as Json)) return false;
    }
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test deepEqual`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/src/deepEqual.ts packages/engine/test/deepEqual.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): add structural deepEqual over Json"
```

---

## Task 4: Hand-authored test fixtures (proving slice)

**Files:**
- Create: `packages/engine/test/fixtures.ts`

These typed fixtures back every later test. They model the proving slice's gating shape (Output → Variables spine + the `random` extension) plus a recognize and a predict step. They are typed against the frozen `@trellis/schema` types, so a contract drift fails compilation.

- [ ] **Step 1: Create `packages/engine/test/fixtures.ts`**

```ts
import type {
  Bundle,
  Graph,
  LearnerModel,
  RecognizeStep,
  RecallStep,
  PredictStep,
  SkillState,
} from "@trellis/schema";

// ---------------------------------------------------------------------------
// Skills (proving slice). Upstream edges mirror content/skills/*.taxonomy.yaml.
// ---------------------------------------------------------------------------
const skills: Bundle["skills"] = {
  "skill.output.print_literal": {
    id: "skill.output.print_literal",
    title: "Print a literal",
    description: "print(\"...\") on a string literal.",
    misconceptions: [],
    upstream: [],
  },
  "skill.string.literal": {
    id: "skill.string.literal",
    title: "String literal",
    description: "Text lives in quotes.",
    misconceptions: [],
    upstream: [],
  },
  "skill.var.assign": {
    id: "skill.var.assign",
    title: "Assign a variable",
    description: "name = value.",
    misconceptions: [],
    upstream: ["skill.string.literal"],
  },
  "skill.var.use": {
    id: "skill.var.use",
    title: "Use a variable",
    description: "Read a variable's value.",
    misconceptions: [],
    upstream: ["skill.var.assign"],
  },
  "skill.random.randint": {
    id: "skill.random.randint",
    title: "Get a random integer",
    description: "import random; random.randint(a, b) inclusive.",
    misconceptions: ["mis.random.no_import", "mis.random.range_off_by_one"],
    upstream: ["skill.var.assign", "skill.output.print_literal"],
  },
};

// ---------------------------------------------------------------------------
// Misconceptions for skill.random.randint (signatures mirror
// content/skills/random.taxonomy.yaml). hintLadder/feedback kept minimal —
// M2 does not consume them (hints are M4).
// ---------------------------------------------------------------------------
const misconceptions: Bundle["misconceptions"] = {
  "mis.random.no_import": {
    id: "mis.random.no_import",
    skill: "skill.random.randint",
    title: "Used random.randint without importing random",
    signature: {
      any: [
        { all: [{ astTag: "uses_random_name" }, { not: { astTag: "has_random_import" } }] },
        { runError: "runtime" },
        { choice: "b" },
      ],
    },
    hintLadder: [],
    feedback: "import random first.",
    skillDeltas: [{ skill: "skill.random.randint", kind: "misconception", weight: 0.4 }],
  },
  "mis.random.range_off_by_one": {
    id: "mis.random.range_off_by_one",
    skill: "skill.random.randint",
    title: "Shaved the inclusive upper bound",
    signature: {
      any: [
        { all: [{ testFailure: { caseIndex: 0 } }, { not: { runError: "runtime" } }] },
        { propertyFailed: true },
        { choice: "c" },
      ],
    },
    hintLadder: [],
    feedback: "randint includes both ends.",
    skillDeltas: [{ skill: "skill.random.randint", kind: "misconception", weight: 0.4 }],
  },
};

// ---------------------------------------------------------------------------
// Nodes: output (spine root) → variables (spine) ; random (extension).
// ---------------------------------------------------------------------------
const nodes: Bundle["nodes"] = {
  "node.output": {
    id: "node.output",
    title: "Output",
    track: "spine",
    requires: [],
    teaches: ["skill.output.print_literal", "skill.string.literal"],
    cells: ["cell.output.hello"],
  },
  "node.variables": {
    id: "node.variables",
    title: "Variables",
    track: "spine",
    requires: [
      { skill: "skill.string.literal", minMastery: 0.6, kind: "prerequisite" },
      { skill: "skill.output.print_literal", minMastery: 0.5, kind: "utility" },
    ],
    teaches: ["skill.var.assign", "skill.var.use"],
    cells: ["cell.variables.box"],
  },
  "node.random": {
    id: "node.random",
    title: "Roll the dice",
    track: "extension",
    requires: [
      { skill: "skill.var.assign", minMastery: 0.6, kind: "track" },
      { skill: "skill.output.print_literal", minMastery: 0.5, kind: "utility" },
    ],
    teaches: ["skill.random.randint"],
    cells: ["cell.random.intro", "cell.random.build"],
  },
};

// §4.1 derived indexes (materialized at compile time; the engine reads, never recomputes).
const producers: Bundle["producers"] = {
  "skill.output.print_literal": ["node.output"],
  "skill.string.literal": ["node.output"],
  "skill.var.assign": ["node.variables"],
  "skill.var.use": ["node.variables"],
  "skill.random.randint": ["node.random"],
};

const requirements: Bundle["requirements"] = {
  "node.output": [],
  "node.variables": [
    { skill: "skill.string.literal", minMastery: 0.6, kind: "prerequisite" },
    { skill: "skill.output.print_literal", minMastery: 0.5, kind: "utility" },
  ],
  "node.random": [
    { skill: "skill.var.assign", minMastery: 0.6, kind: "track" },
    { skill: "skill.output.print_literal", minMastery: 0.5, kind: "utility" },
  ],
};

export const bundle: Bundle = {
  contentVersion: "2026.06.0-test",
  skills,
  nodes,
  cells: {
    "cell.output.hello": {
      id: "cell.output.hello",
      nodeId: "node.output",
      title: "Hello",
      certifies: ["skill.output.print_literal", "skill.string.literal"],
      steps: [],
    },
    "cell.variables.box": {
      id: "cell.variables.box",
      nodeId: "node.variables",
      title: "Box",
      certifies: ["skill.var.assign"],
      steps: [],
    },
    "cell.random.intro": {
      id: "cell.random.intro",
      nodeId: "node.random",
      title: "Intro",
      certifies: ["skill.random.randint"],
      steps: [],
    },
    "cell.random.build": {
      id: "cell.random.build",
      nodeId: "node.random",
      title: "Build",
      certifies: ["skill.random.randint"],
      steps: [],
    },
  },
  misconceptions,
  producers,
  requirements,
};

export const graph: Graph = { nodes, producers, requirements };

// ---------------------------------------------------------------------------
// Sample steps for diagnose/detect tests.
// ---------------------------------------------------------------------------

// recognize: choice a correct; b→no_import; c→off_by_one; d→no misconception (mismatch path).
export const recognizeStep: RecognizeStep = {
  id: "cell.random.intro#3",
  kind: "recognize",
  skills: ["skill.random.randint"],
  prompt: "Which program is correct?",
  choices: [
    { id: "a", label: "import random; random.randint(1,100)" },
    { id: "b", label: "random.randint(1,100)  # no import", misconception: "mis.random.no_import" },
    { id: "c", label: "import random; random.randint(1,99)", misconception: "mis.random.range_off_by_one" },
    { id: "d", label: "a deliberately unclassified wrong answer" },
  ],
  correctChoiceId: "a",
};

// recall: accepted normalized answers + a misconceptionMap entry.
export const recallStep: RecallStep = {
  id: "cell.random.recall#1",
  kind: "recall",
  skills: ["skill.random.randint"],
  prompt: "What must you do before random.randint?",
  accepted: {
    normalized: ["import random"],
    misconceptionMap: { "use random.randint": "mis.random.no_import" },
  },
};

// predict (choice mode): expected accepts choice id "a"; choice b carries a misconception.
export const predictStep: PredictStep = {
  id: "cell.random.intro#2",
  kind: "predict",
  skills: ["skill.random.randint"],
  prompt: "What happens when you run this?",
  code: "number = random.randint(1, 100)\nprint(number)",
  choices: [
    { id: "a", label: "NameError — random is not defined" },
    { id: "b", label: "prints a random number", misconception: "mis.random.no_import" },
    { id: "c", label: "prints 0" },
  ],
  expected: { normalized: ["a"] },
  reveal: "run-and-show",
};

// ---------------------------------------------------------------------------
// Learner-model helpers.
// ---------------------------------------------------------------------------
export function skillState(mastery: number): SkillState {
  return {
    mastery,
    attempts: 1,
    passes: mastery > 0 ? 1 : 0,
    lastSeen: "2026-06-08T00:00:00.000Z",
    misconceptionCounts: {},
  };
}

export function model(masteries: Record<string, number>): LearnerModel {
  const skills: LearnerModel["skills"] = {};
  for (const [id, m] of Object.entries(masteries)) skills[id] = skillState(m);
  return { learnerId: "L1", skills, contentVersion: "2026.06.0-test" };
}
```

- [ ] **Step 2: Verify the fixtures compile (typecheck)**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine typecheck`
Expected: PASS — fixtures type-check against the frozen schema. (No test file imports them yet; that's fine.)

- [ ] **Step 3: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/test/fixtures.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "test(engine): add hand-authored Bundle/Graph proving-slice fixtures"
```

---

## Task 5: Availability resolver (`resolveAvailability`, `meets`, `completed`, `whyLocked`)

**Files:**
- Create: `packages/engine/src/resolver.ts`
- Test: `packages/engine/test/resolver.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/resolver.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { resolveAvailability, meets, completed, whyLocked } from "../src/resolver.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { graph, model } from "./fixtures.js";

describe("meets", () => {
  it("is true iff the skill exists and mastery >= threshold", () => {
    const m = model({ "skill.var.assign": 0.6 });
    expect(meets(m, { skill: "skill.var.assign", minMastery: 0.6, kind: "track" })).toBe(true);
    expect(meets(m, { skill: "skill.var.assign", minMastery: 0.7, kind: "track" })).toBe(false);
    expect(meets(m, { skill: "skill.missing", minMastery: 0.1, kind: "track" })).toBe(false);
  });
});

describe("completed", () => {
  it("is true iff every taught skill is at/above completionThreshold", () => {
    const node = graph.nodes["node.random"]!;
    expect(completed(model({ "skill.random.randint": 0.8 }), node, DEFAULT_CONFIG)).toBe(true);
    expect(completed(model({ "skill.random.randint": 0.79 }), node, DEFAULT_CONFIG)).toBe(false);
    expect(completed(model({}), node, DEFAULT_CONFIG)).toBe(false);
  });
});

describe("resolveAvailability", () => {
  it("marks the spine root available with an empty learner model", () => {
    const status = resolveAvailability(model({}), graph);
    expect(status["node.output"]).toBe("available");
    expect(status["node.variables"]).toBe("locked");
    expect(status["node.random"]).toBe("locked");
  });

  it("marks a node done when its taught skills are mastered", () => {
    const status = resolveAvailability(
      model({ "skill.output.print_literal": 0.9, "skill.string.literal": 0.9 }),
      graph,
    );
    expect(status["node.output"]).toBe("done");
  });
});

describe("whyLocked", () => {
  it("returns the unmet requirements with kind and current mastery", () => {
    const m = model({ "skill.output.print_literal": 0.5 }); // utility met, track unmet
    const unmet = whyLocked(m, graph, "node.random");
    expect(unmet).toEqual([
      { skill: "skill.var.assign", minMastery: 0.6, kind: "track", mastery: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test resolver`
Expected: FAIL — cannot resolve `../src/resolver.js`.

- [ ] **Step 3: Implement `packages/engine/src/resolver.ts`**

```ts
import type { Graph, LearnerModel, ConceptNode, Requirement } from "@trellis/schema";
import { DEFAULT_CONFIG, type EngineConfig } from "./config.js";

export type Availability = "locked" | "available" | "done";
export type AvailabilityMap = Record<string, Availability>;

// §4.3 — a requirement is met iff the skill exists and mastery >= threshold.
export function meets(model: LearnerModel, req: Requirement): boolean {
  const s = model.skills[req.skill];
  return s !== undefined && s.mastery >= req.minMastery;
}

// §4.3 — a node is done iff every skill it teaches is at/above the completion threshold.
export function completed(model: LearnerModel, node: ConceptNode, cfg: EngineConfig): boolean {
  if (node.teaches.length === 0) return false;
  return node.teaches.every((sk) => {
    const s = model.skills[sk];
    return s !== undefined && s.mastery >= cfg.completionThreshold;
  });
}

// §4.3 — full availability pass. Reads the materialized requirements index.
export function resolveAvailability(
  model: LearnerModel,
  graph: Graph,
  cfg: EngineConfig = DEFAULT_CONFIG,
): AvailabilityMap {
  const status: AvailabilityMap = {};
  for (const id of Object.keys(graph.nodes)) {
    const node = graph.nodes[id]!;
    status[id] = completed(model, node, cfg) ? "done" : "locked";
  }
  for (const id of Object.keys(graph.nodes)) {
    if (status[id] !== "locked") continue;
    const reqs = graph.requirements[id] ?? graph.nodes[id]!.requires;
    if (reqs.every((r) => meets(model, r))) status[id] = "available";
  }
  return status;
}

export interface UnmetRequirement {
  skill: string;
  minMastery: number;
  kind: Requirement["kind"];
  mastery: number;
}

// §4.3 "why locked" — the unmet requirements (with kind) for a node, for UI explanation.
export function whyLocked(
  model: LearnerModel,
  graph: Graph,
  nodeId: string,
): UnmetRequirement[] {
  const reqs = graph.requirements[nodeId] ?? graph.nodes[nodeId]?.requires ?? [];
  return reqs
    .filter((r) => !meets(model, r))
    .map((r) => ({
      skill: r.skill,
      minMastery: r.minMastery,
      kind: r.kind,
      mastery: model.skills[r.skill]?.mastery ?? 0,
    }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test resolver`
Expected: PASS (all 4 describe blocks).

- [ ] **Step 5: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/src/resolver.ts packages/engine/test/resolver.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): availability resolver (resolveAvailability/meets/completed/whyLocked)"
```

---

## Task 6: Navigation (`spineOrder`, `nextSpineCell`, `availabilityDiff`)

**Files:**
- Create: `packages/engine/src/navigation.ts`
- Test: `packages/engine/test/navigation.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/navigation.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { spineOrder, nextSpineCell, availabilityDiff } from "../src/navigation.js";
import { resolveAvailability } from "../src/resolver.js";
import { graph, model } from "./fixtures.js";

describe("spineOrder", () => {
  it("topologically orders spine nodes by prerequisite depth (extensions excluded)", () => {
    expect(spineOrder(graph)).toEqual(["node.output", "node.variables"]);
  });
});

describe("nextSpineCell", () => {
  it("returns the first cell of the lowest-ordinal available, not-done spine node", () => {
    // empty model → output is the first available spine node.
    expect(nextSpineCell(model({}), graph)).toBe("cell.output.hello");
  });

  it("skips a done spine node and advances to the next available one", () => {
    // output done (both taught skills high), variables now available (prereqs met).
    const m = model({
      "skill.output.print_literal": 0.9,
      "skill.string.literal": 0.9,
    });
    expect(nextSpineCell(m, graph)).toBe("cell.variables.box");
  });

  it("returns null when no spine node is available", () => {
    // Force every spine node done.
    const m = model({
      "skill.output.print_literal": 0.9,
      "skill.string.literal": 0.9,
      "skill.var.assign": 0.9,
      "skill.var.use": 0.9,
    });
    expect(nextSpineCell(m, graph)).toBeNull();
  });
});

describe("availabilityDiff", () => {
  it("reports nodes that flipped locked→available and *→done", () => {
    const before = resolveAvailability(
      model({ "skill.output.print_literal": 0.5 }),
      graph,
    );
    const after = resolveAvailability(
      model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.6 }),
      graph,
    );
    const diff = availabilityDiff(before, after);
    expect(diff.newlyAvailable).toContain("node.random");
    expect(diff.newlyDone).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test navigation`
Expected: FAIL — cannot resolve `../src/navigation.js`.

- [ ] **Step 3: Implement `packages/engine/src/navigation.ts`**

```ts
import type { Graph, LearnerModel } from "@trellis/schema";
import { DEFAULT_CONFIG, type EngineConfig } from "./config.js";
import { resolveAvailability, type AvailabilityMap } from "./resolver.js";

// §4.3 — order spine nodes by prerequisite depth. Edge p→n when a spine producer p
// teaches a skill that spine node n requires. Kahn's algorithm with sorted queues so
// the output is deterministic (ties broken by id). Extensions are excluded; the
// "ordinal" the design references is this topological position.
export function spineOrder(graph: Graph): string[] {
  const spine = Object.keys(graph.nodes)
    .filter((id) => graph.nodes[id]!.track === "spine")
    .sort();
  const spineSet = new Set(spine);

  const indeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const id of spine) {
    indeg[id] = 0;
    adj[id] = [];
  }
  for (const id of spine) {
    const reqs = graph.requirements[id] ?? graph.nodes[id]!.requires;
    const preds = new Set<string>();
    for (const r of reqs) {
      for (const p of graph.producers[r.skill] ?? []) {
        if (spineSet.has(p) && p !== id) preds.add(p);
      }
    }
    for (const p of preds) {
      adj[p]!.push(id);
      indeg[id]!++;
    }
  }

  const queue = spine.filter((id) => indeg[id] === 0).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const m of adj[id]!.slice().sort()) {
      indeg[m]!--;
      if (indeg[m] === 0) {
        queue.push(m);
        queue.sort();
      }
    }
  }
  return order; // a cycle (invalid content) would drop the cyclic nodes; acceptable.
}

// §4.3 / §10 drive — the next spine cell: first cell of the lowest-ordinal spine node
// whose status is `available` (available already excludes done).
export function nextSpineCell(
  model: LearnerModel,
  graph: Graph,
  cfg: EngineConfig = DEFAULT_CONFIG,
): string | null {
  const status = resolveAvailability(model, graph, cfg);
  for (const nodeId of spineOrder(graph)) {
    if (status[nodeId] === "available") {
      const cells = graph.nodes[nodeId]!.cells;
      if (cells.length > 0) return cells[0]!;
    }
  }
  return null;
}

export interface AvailabilityDiff {
  newlyAvailable: string[]; // locked → available (powers "you just unlocked X")
  newlyDone: string[]; // (locked|available) → done
}

// §4.3 — the diff of two availability passes (before vs. after applying a Diagnosis).
export function availabilityDiff(
  before: AvailabilityMap,
  after: AvailabilityMap,
): AvailabilityDiff {
  const newlyAvailable: string[] = [];
  const newlyDone: string[] = [];
  for (const id of Object.keys(after)) {
    if (before[id] === "locked" && after[id] === "available") newlyAvailable.push(id);
    if (before[id] !== "done" && after[id] === "done") newlyDone.push(id);
  }
  return { newlyAvailable: newlyAvailable.sort(), newlyDone: newlyDone.sort() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test navigation`
Expected: PASS (all 3 describe blocks).

- [ ] **Step 5: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/src/navigation.ts packages/engine/test/navigation.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): spine navigation (spineOrder/nextSpineCell/availabilityDiff)"
```

---

## Task 7: Step lifecycle state machine

**Files:**
- Create: `packages/engine/src/stepMachine.ts`
- Test: `packages/engine/test/stepMachine.test.ts`

Pure transitions for the §5.1 machine. `watch` skips `EVALUATING`; non-build kinds go `ACTIVE → EVALUATING → FEEDBACK`. `advance` from `FEEDBACK` requires `correct` or `allowSkip`. Hints are M4 — here `hint` is a phase-preserving event only (no ladder logic).

- [ ] **Step 1: Write the failing test** — `packages/engine/test/stepMachine.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { initialState, step, StepTransitionError } from "../src/stepMachine.js";

describe("step machine — non-build (recognize)", () => {
  it("walks PENDING→ACTIVE→EVALUATING→FEEDBACK→RELEASED on a correct submission", () => {
    let s = initialState();
    expect(s.phase).toBe("PENDING");
    s = step("recognize", s, { type: "enter" });
    expect(s.phase).toBe("ACTIVE");
    s = step("recognize", s, { type: "submit" });
    expect(s.phase).toBe("EVALUATING");
    s = step("recognize", s, { type: "diagnosis", correct: true });
    expect(s.phase).toBe("FEEDBACK");
    expect(s.lastCorrect).toBe(true);
    s = step("recognize", s, { type: "advance" });
    expect(s.phase).toBe("RELEASED");
  });

  it("allows retry from FEEDBACK back to ACTIVE", () => {
    let s = initialState();
    s = step("recognize", s, { type: "enter" });
    s = step("recognize", s, { type: "submit" });
    s = step("recognize", s, { type: "diagnosis", correct: false });
    expect(s.phase).toBe("FEEDBACK");
    s = step("recognize", s, { type: "retry" });
    expect(s.phase).toBe("ACTIVE");
  });

  it("blocks advance after an incorrect submission unless allowSkip", () => {
    let s = initialState();
    s = step("recognize", s, { type: "enter" });
    s = step("recognize", s, { type: "submit" });
    s = step("recognize", s, { type: "diagnosis", correct: false });
    expect(() => step("recognize", s, { type: "advance" })).toThrow(StepTransitionError);
    const released = step("recognize", s, { type: "advance", allowSkip: true });
    expect(released.phase).toBe("RELEASED");
  });

  it("treats hint as phase-preserving in FEEDBACK", () => {
    let s = initialState();
    s = step("recognize", s, { type: "enter" });
    s = step("recognize", s, { type: "submit" });
    s = step("recognize", s, { type: "diagnosis", correct: false });
    const after = step("recognize", s, { type: "hint" });
    expect(after.phase).toBe("FEEDBACK");
  });
});

describe("step machine — watch skips EVALUATING", () => {
  it("walks PENDING→ACTIVE→RELEASED with advance and rejects submit", () => {
    let s = initialState();
    s = step("watch", s, { type: "enter" });
    expect(s.phase).toBe("ACTIVE");
    expect(() => step("watch", s, { type: "submit" })).toThrow(StepTransitionError);
    s = step("watch", s, { type: "advance" });
    expect(s.phase).toBe("RELEASED");
  });
});

describe("step machine — invalid transitions throw", () => {
  it("rejects submit before enter", () => {
    expect(() => step("recognize", initialState(), { type: "submit" })).toThrow(
      StepTransitionError,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test stepMachine`
Expected: FAIL — cannot resolve `../src/stepMachine.js`.

- [ ] **Step 3: Implement `packages/engine/src/stepMachine.ts`**

```ts
import type { StepKind } from "@trellis/schema";

// §5.1 — the step lifecycle as pure transitions. Exactly one step is ACTIVE per cell.
export type Phase = "PENDING" | "ACTIVE" | "EVALUATING" | "FEEDBACK" | "RELEASED";

export interface MachineState {
  phase: Phase;
  // null until a Diagnosis arrives; gates `advance` out of FEEDBACK.
  lastCorrect: boolean | null;
}

export type StepEvent =
  | { type: "enter" }
  | { type: "submit" }
  | { type: "diagnosis"; correct: boolean }
  | { type: "hint" }
  | { type: "retry" }
  | { type: "advance"; allowSkip?: boolean };

export class StepTransitionError extends Error {
  constructor(kind: StepKind, phase: Phase, event: StepEvent["type"]) {
    super(`invalid transition: ${kind} step in ${phase} cannot handle "${event}"`);
    this.name = "StepTransitionError";
  }
}

export function initialState(): MachineState {
  return { phase: "PENDING", lastCorrect: null };
}

// `watch` steps have no evaluation: ACTIVE --advance--> RELEASED and cannot submit.
export function step(kind: StepKind, state: MachineState, event: StepEvent): MachineState {
  const { phase } = state;
  const fail = (): never => {
    throw new StepTransitionError(kind, phase, event.type);
  };

  switch (phase) {
    case "PENDING":
      if (event.type === "enter") return { phase: "ACTIVE", lastCorrect: null };
      return fail();

    case "ACTIVE":
      if (event.type === "hint") return state; // phase-preserving (ladder is M4)
      if (kind === "watch") {
        if (event.type === "advance") return { phase: "RELEASED", lastCorrect: null };
        return fail(); // watch cannot submit
      }
      if (event.type === "submit") return { phase: "EVALUATING", lastCorrect: null };
      return fail();

    case "EVALUATING":
      if (event.type === "diagnosis") return { phase: "FEEDBACK", lastCorrect: event.correct };
      return fail();

    case "FEEDBACK":
      if (event.type === "hint") return state; // phase-preserving
      if (event.type === "retry") return { phase: "ACTIVE", lastCorrect: state.lastCorrect };
      if (event.type === "advance") {
        if (state.lastCorrect === true || event.allowSkip === true) {
          return { phase: "RELEASED", lastCorrect: state.lastCorrect };
        }
        return fail(); // advance requires correct or an authored allowSkip
      }
      return fail();

    case "RELEASED":
      return fail(); // terminal
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test stepMachine`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/src/stepMachine.ts packages/engine/test/stepMachine.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): step lifecycle state machine (§5.1 pure transitions)"
```

---

## Task 8: Misconception detection (`evalSignature`, `specificityRank`, `detect`)

**Files:**
- Create: `packages/engine/src/detect.ts`
- Test: `packages/engine/test/detect.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/detect.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { evalSignature, specificityRank, detect } from "../src/detect.js";
import type { Signature, RawSignals } from "@trellis/schema";
import { bundle, recognizeStep } from "./fixtures.js";

const noSignals: RawSignals = { ran: false, wallMs: 0 };

describe("evalSignature — leaf forms", () => {
  it("astTag matches against signals.astTags", () => {
    const sig: Signature = { astTag: "uses_random_name" };
    expect(evalSignature(sig, { signals: { ran: true, wallMs: 1, astTags: ["uses_random_name"] } })).toBe(true);
    expect(evalSignature(sig, { signals: noSignals })).toBe(false);
  });

  it("runError matches the run error type", () => {
    const sig: Signature = { runError: "runtime" };
    expect(evalSignature(sig, { signals: { ran: false, wallMs: 1, runError: { type: "runtime", message: "x" } } })).toBe(true);
    expect(evalSignature(sig, { signals: { ran: false, wallMs: 1, runError: { type: "syntax", message: "x" } } })).toBe(false);
  });

  it("choice and recallEquals match the DetectContext submission", () => {
    expect(evalSignature({ choice: "b" }, { signals: noSignals, choiceId: "b" })).toBe(true);
    expect(evalSignature({ choice: "b" }, { signals: noSignals, choiceId: "a" })).toBe(false);
    expect(evalSignature({ recallEquals: "Use Random.randint" }, { signals: noSignals, recallText: "use random.randint" })).toBe(true);
  });

  it("timedOut matches signals.timedOut", () => {
    expect(evalSignature({ timedOut: true }, { signals: { ran: false, wallMs: 1, timedOut: true } })).toBe(true);
    expect(evalSignature({ timedOut: true }, { signals: noSignals })).toBe(false);
  });

  it("testFailure matches by caseIndex with the failed-count guard", () => {
    const sig: Signature = { testFailure: { caseIndex: 0 } };
    const signals: RawSignals = { ran: true, wallMs: 1, tests: { passed: 1, failed: 1, failures: [{ caseIndex: 0, got: 57 }] } };
    expect(evalSignature(sig, { signals })).toBe(true);
    expect(evalSignature(sig, { signals: { ran: true, wallMs: 1, tests: { passed: 2, failed: 0, failures: [] } } })).toBe(false);
  });
});

describe("evalSignature — combinators", () => {
  it("all/any/not compose", () => {
    const sig: Signature = { all: [{ astTag: "uses_random_name" }, { not: { astTag: "has_random_import" } }] };
    expect(evalSignature(sig, { signals: { ran: true, wallMs: 1, astTags: ["uses_random_name"] } })).toBe(true);
    expect(evalSignature(sig, { signals: { ran: true, wallMs: 1, astTags: ["uses_random_name", "has_random_import"] } })).toBe(false);
  });
});

describe("specificityRank", () => {
  it("ranks structural/direct (0) above behavioral (1) above generic errors (2)", () => {
    expect(specificityRank({ astTag: "x" })).toBe(0);
    expect(specificityRank({ choice: "b" })).toBe(0);
    expect(specificityRank({ testFailure: {} })).toBe(1);
    expect(specificityRank({ runError: "runtime" })).toBe(2);
    // a composite takes the most-specific (min) leaf rank.
    expect(specificityRank({ any: [{ runError: "runtime" }, { choice: "b" }] })).toBe(0);
  });
});

describe("detect", () => {
  it("returns the no_import misconception for choice b on the recognize step", () => {
    expect(detect(recognizeStep, { signals: noSignals, choiceId: "b" }, bundle)).toBe("mis.random.no_import");
  });

  it("returns the off_by_one misconception for choice c", () => {
    expect(detect(recognizeStep, { signals: noSignals, choiceId: "c" }, bundle)).toBe("mis.random.range_off_by_one");
  });

  it("returns null when nothing matches (unclassified choice d)", () => {
    expect(detect(recognizeStep, { signals: noSignals, choiceId: "d" }, bundle)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test detect`
Expected: FAIL — cannot resolve `../src/detect.js`.

- [ ] **Step 3: Implement `packages/engine/src/detect.ts`**

```ts
import type { Signature, RawSignals, Step, Bundle, Json } from "@trellis/schema";
import { normalize } from "./normalize.js";
import { deepEqual } from "./deepEqual.js";

// §7 — the learner's submission for non-build steps is threaded here (the frozen
// RawSignals has no choice/recall field). Build-path forms read from `signals`.
export interface DetectContext {
  signals: RawSignals;
  choiceId?: string; // recognize / predict (choice mode)
  recallText?: string; // recall / predict (text mode)
}

function matchTestFailure(
  signals: RawSignals,
  pred: { caseIndex?: number; gotEquals?: Json },
): boolean {
  const tests = signals.tests;
  if (!tests || tests.failed === 0) return false;
  let failures = tests.failures;
  if (pred.caseIndex !== undefined) {
    failures = failures.filter((f) => f.caseIndex === pred.caseIndex);
  }
  if (failures.length === 0) return false;
  if (pred.gotEquals !== undefined) {
    return failures.some((f) => deepEqual(f.got, pred.gotEquals as Json));
  }
  return true;
}

// §7 evalSignature — pure boolean recursion over the frozen Signature union.
export function evalSignature(sig: Signature, ctx: DetectContext): boolean {
  if ("astTag" in sig) return (ctx.signals.astTags ?? []).includes(sig.astTag);
  if ("runError" in sig) return ctx.signals.runError?.type === sig.runError;
  if ("timedOut" in sig) return ctx.signals.timedOut === true;
  if ("testFailure" in sig) return matchTestFailure(ctx.signals, sig.testFailure);
  if ("propertyFailed" in sig) return ctx.signals.property?.passed === false;
  if ("choice" in sig) return ctx.choiceId === sig.choice;
  if ("recallEquals" in sig) {
    return ctx.recallText !== undefined && normalize(ctx.recallText) === normalize(sig.recallEquals);
  }
  if ("all" in sig) return sig.all.every((s) => evalSignature(s, ctx));
  if ("any" in sig) return sig.any.some((s) => evalSignature(s, ctx));
  if ("not" in sig) return !evalSignature(sig.not, ctx);
  return false;
}

// §7 specificity — structural/direct signatures (0) beat behavioral (1) beat generic
// errors (2). Composites take the most-specific (min) leaf rank. NOTE: the frozen
// Misconception has no `priority` field, so this rank + stable id order is the whole
// tie-break (the §7 "authored priority int" step is dropped).
export function specificityRank(sig: Signature): number {
  if ("astTag" in sig || "choice" in sig || "recallEquals" in sig) return 0;
  if ("testFailure" in sig || "propertyFailed" in sig) return 1;
  if ("runError" in sig || "timedOut" in sig) return 2;
  if ("all" in sig) return sig.all.length ? Math.min(...sig.all.map(specificityRank)) : 3;
  if ("any" in sig) return sig.any.length ? Math.min(...sig.any.map(specificityRank)) : 3;
  if ("not" in sig) return specificityRank(sig.not);
  return 3;
}

// §7 detect — first-match within a skill, global tie-break (specificity, then id).
export function detect(step: Step, ctx: DetectContext, bundle: Bundle): string | null {
  const candidates: string[] = [];
  for (const skillId of step.skills) {
    const skill = bundle.skills[skillId];
    if (!skill) continue;
    for (const mid of skill.misconceptions) {
      const m = bundle.misconceptions[mid];
      if (!m) continue;
      if (evalSignature(m.signature, ctx)) candidates.push(mid);
    }
  }
  if (candidates.length === 0) return null;
  const unique = [...new Set(candidates)];
  unique.sort((a, b) => {
    const ra = specificityRank(bundle.misconceptions[a]!.signature);
    const rb = specificityRank(bundle.misconceptions[b]!.signature);
    if (ra !== rb) return ra - rb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return unique[0]!;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test detect`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/src/detect.ts packages/engine/test/detect.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): misconception detection (evalSignature/specificityRank/detect)"
```

---

## Task 9: Non-build diagnosis (`matchesAccepted`, `compareNonBuild`, `computeDeltas`, `diagnoseNonBuild`)

**Files:**
- Create: `packages/engine/src/diagnose.ts`
- Test: `packages/engine/test/diagnose.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/diagnose.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  matchesAccepted,
  compareNonBuild,
  diagnoseNonBuild,
  type NonBuildSubmission,
  type DiagnoseEffects,
} from "../src/diagnose.js";
import { bundle, recognizeStep, recallStep, predictStep } from "./fixtures.js";

const fx: DiagnoseEffects = { id: "diag-1", learnerId: "L1", now: "2026-06-08T12:00:00.000Z" };

describe("matchesAccepted", () => {
  it("matches a normalized accepted answer", () => {
    expect(matchesAccepted({ normalized: ["import random"] }, "  Import   Random ")).toBe(true);
    expect(matchesAccepted({ normalized: ["import random"] }, "random")).toBe(false);
  });

  it("matches an anchored RE2 pattern", () => {
    expect(matchesAccepted({ patterns: ["import\\s+random"] }, "import   random")).toBe(true);
    // anchored full match: trailing junk fails unless the pattern allows it.
    expect(matchesAccepted({ patterns: ["import\\s+random"] }, "import random now")).toBe(false);
    expect(matchesAccepted({ patterns: ["import\\s+random.*"] }, "import random now")).toBe(true);
  });
});

describe("compareNonBuild", () => {
  it("recognize: correct iff choiceId === correctChoiceId", () => {
    expect(compareNonBuild(recognizeStep, { kind: "recognize", choiceId: "a" })).toBe(true);
    expect(compareNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" })).toBe(false);
  });

  it("recall: correct iff text matches accepted", () => {
    expect(compareNonBuild(recallStep, { kind: "recall", text: "import random" })).toBe(true);
    expect(compareNonBuild(recallStep, { kind: "recall", text: "nope" })).toBe(false);
  });

  it("predict (choice mode): correct iff chosen id is in expected.normalized", () => {
    expect(compareNonBuild(predictStep, { kind: "predict", choiceId: "a" })).toBe(true);
    expect(compareNonBuild(predictStep, { kind: "predict", choiceId: "b" })).toBe(false);
  });
});

describe("diagnoseNonBuild — attribution precedence", () => {
  it("pass: a correct recognize submission", () => {
    const d = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "a" }, bundle, fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
    expect(d.misconceptionId).toBeUndefined();
    expect(d.skillDeltas).toEqual([{ skill: "skill.random.randint", kind: "pass", weight: 1 }]);
  });

  it("misconception: a wrong choice with an authored misconception", () => {
    const d = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" }, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.random.no_import");
    expect(d.skillDeltas).toEqual([{ skill: "skill.random.randint", kind: "misconception", weight: 0.4 }]);
  });

  it("mismatch: a wrong choice with no misconception and no matching signature", () => {
    const d = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "d" }, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("mismatch");
    expect(d.misconceptionId).toBeUndefined();
    expect(d.skillDeltas).toEqual([{ skill: "skill.random.randint", kind: "fail", weight: 1 }]);
  });

  it("recall: misconceptionMap routes a known wrong answer to its misconception", () => {
    const d = diagnoseNonBuild(recallStep, { kind: "recall", text: "use random.randint" }, bundle, fx);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.random.no_import");
  });

  it("stamps the injected effects and a minimal RawSignals", () => {
    const d = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "a" }, bundle, fx);
    expect(d.id).toBe("diag-1");
    expect(d.learnerId).toBe("L1");
    expect(d.submittedAt).toBe("2026-06-08T12:00:00.000Z");
    expect(d.stepId).toBe("cell.random.intro#3");
    expect(d.contentVersion).toBe("2026.06.0-test");
    expect(d.signals).toEqual({ ran: false, wallMs: 0 });
    expect(d.seed).toBe(0);
  });
});

// The submission discriminator must match the step kind.
const _typecheck: NonBuildSubmission = { kind: "recognize", choiceId: "a" };
void _typecheck;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test diagnose`
Expected: FAIL — cannot resolve `../src/diagnose.js`.

- [ ] **Step 3: Implement `packages/engine/src/diagnose.ts`**

```ts
import type {
  Step,
  AcceptedAnswer,
  RawSignals,
  Diagnosis,
  SkillDelta,
  Bundle,
  Attribution,
} from "@trellis/schema";
import { RE2JS } from "re2js";
import { normalize } from "./normalize.js";
import { detect, type DetectContext } from "./detect.js";
import { DEFAULT_CONFIG, type EngineConfig } from "./config.js";

// The learner's raw input for a non-build step (not carried in RawSignals — see plan
// design fact #3). The discriminator must match the step kind at the call site.
export type NonBuildSubmission =
  | { kind: "recognize"; choiceId: string }
  | { kind: "recall"; text: string }
  | { kind: "predict"; choiceId?: string; text?: string };

// Injected effects keep the engine pure (no clock / no uuid).
export interface DiagnoseEffects {
  id: string;
  learnerId: string;
  now: string; // ISO timestamp, provided by the caller
}

// §8 non-build comparison: normalized exact OR anchored RE2 full-match (design fact #7).
export function matchesAccepted(accepted: AcceptedAnswer, value: string): boolean {
  const norm = normalize(value);
  if (accepted.normalized && accepted.normalized.some((a) => normalize(a) === norm)) {
    return true;
  }
  if (accepted.patterns) {
    for (const p of accepted.patterns) {
      if (RE2JS.compile(p).matches(value)) return true; // anchored full match
    }
  }
  return false;
}

export function compareNonBuild(step: Step, sub: NonBuildSubmission): boolean {
  switch (step.kind) {
    case "recognize":
      if (sub.kind !== "recognize") throw new Error("submission kind != step kind (recognize)");
      return sub.choiceId === step.correctChoiceId;
    case "recall":
      if (sub.kind !== "recall") throw new Error("submission kind != step kind (recall)");
      return matchesAccepted(step.accepted, sub.text);
    case "predict": {
      if (sub.kind !== "predict") throw new Error("submission kind != step kind (predict)");
      const value = step.choices ? (sub.choiceId ?? "") : (sub.text ?? "");
      return matchesAccepted(step.expected, value);
    }
    default:
      throw new Error(`compareNonBuild called on a ${step.kind} step`);
  }
}

// Direct authored mapping (most local): a chosen Choice.misconception, or an
// AcceptedAnswer.misconceptionMap entry. Takes precedence over signature detect().
function directMisconception(step: Step, sub: NonBuildSubmission): string | undefined {
  if (step.kind === "recognize" && sub.kind === "recognize") {
    return step.choices.find((c) => c.id === sub.choiceId)?.misconception;
  }
  if (step.kind === "recall" && sub.kind === "recall") {
    return step.accepted.misconceptionMap?.[normalize(sub.text)];
  }
  if (step.kind === "predict" && sub.kind === "predict") {
    const map = step.expected.misconceptionMap;
    if (step.choices) {
      const key = sub.choiceId ?? "";
      return map?.[key] ?? step.choices.find((c) => c.id === sub.choiceId)?.misconception;
    }
    return map?.[normalize(sub.text ?? "")];
  }
  return undefined;
}

function detectContext(sub: NonBuildSubmission): DetectContext {
  const signals: RawSignals = { ran: false, wallMs: 0 };
  const ctx: DetectContext = { signals };
  if (sub.kind === "recognize") ctx.choiceId = sub.choiceId;
  else if (sub.kind === "recall") ctx.recallText = sub.text;
  else {
    if (sub.choiceId !== undefined) ctx.choiceId = sub.choiceId;
    if (sub.text !== undefined) ctx.recallText = sub.text;
  }
  return ctx;
}

// §8 computeDeltas — outcome → SkillDelta[]. Pass: positive weight on each step skill.
// Misconception: the authored deltas (or a default negative on the misconception's skill).
// Generic fail (mismatch/syntax/runtime): a small negative on each step skill.
export function computeDeltas(
  step: Step,
  correct: boolean,
  mid: string | undefined,
  bundle: Bundle,
  cfg: EngineConfig,
): SkillDelta[] {
  if (correct) {
    return step.skills.map((sk) => ({ skill: sk, kind: "pass", weight: cfg.defaultPassWeight }));
  }
  if (mid !== undefined) {
    const m = bundle.misconceptions[mid];
    if (m?.skillDeltas && m.skillDeltas.length > 0) return m.skillDeltas;
    return m ? [{ skill: m.skill, kind: "misconception", weight: cfg.defaultFailWeight }] : [];
  }
  return step.skills.map((sk) => ({ skill: sk, kind: "fail", weight: cfg.defaultFailWeight }));
}

// §8 diagnose (non-build path). Total + deterministic: same (step, submission, fx) →
// same Diagnosis. `signals` is minimal; the submission is captured by attribution.
export function diagnoseNonBuild(
  step: Step,
  sub: NonBuildSubmission,
  bundle: Bundle,
  fx: DiagnoseEffects,
  cfg: EngineConfig = DEFAULT_CONFIG,
): Diagnosis {
  if (step.kind === "build" || step.kind === "watch") {
    throw new Error(`diagnoseNonBuild does not handle a ${step.kind} step`);
  }
  const correct = compareNonBuild(step, sub);
  let mid: string | undefined;
  let attribution: Attribution;
  if (correct) {
    attribution = "pass";
  } else {
    mid = directMisconception(step, sub) ?? detect(step, detectContext(sub), bundle) ?? undefined;
    attribution = mid !== undefined ? "misconception" : "mismatch";
  }
  const skillDeltas = computeDeltas(step, correct, mid, bundle, cfg);
  const diag: Diagnosis = {
    id: fx.id,
    learnerId: fx.learnerId,
    stepId: step.id,
    contentVersion: bundle.contentVersion,
    submittedAt: fx.now,
    correct,
    attribution,
    signals: { ran: false, wallMs: 0 },
    skillDeltas,
    seed: 0, // non-build steps have no evaluator.property.seed
  };
  if (mid !== undefined) diag.misconceptionId = mid;
  return diag;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test diagnose`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/src/diagnose.ts packages/engine/test/diagnose.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): non-build diagnosis with attribution precedence + RE2 patterns"
```

---

## Task 10: Learner model (`newSkillState`, `applyDiagnosis`, `targetUpstream`)

**Files:**
- Create: `packages/engine/src/learnerModel.ts`
- Test: `packages/engine/test/learnerModel.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/learnerModel.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { newSkillState, applyDiagnosis, targetUpstream } from "../src/learnerModel.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { Diagnosis } from "@trellis/schema";
import { bundle, model } from "./fixtures.js";

function diag(partial: Partial<Diagnosis> & Pick<Diagnosis, "skillDeltas">): Diagnosis {
  return {
    id: "d",
    learnerId: "L1",
    stepId: "s",
    contentVersion: "2026.06.0-test",
    submittedAt: "2026-06-08T12:00:00.000Z",
    correct: true,
    attribution: "pass",
    signals: { ran: false, wallMs: 0 },
    seed: 0,
    ...partial,
  };
}

describe("newSkillState", () => {
  it("starts at zero mastery with the provided timestamp", () => {
    const s = newSkillState("2026-06-08T00:00:00.000Z");
    expect(s).toEqual({
      mastery: 0,
      attempts: 0,
      passes: 0,
      lastSeen: "2026-06-08T00:00:00.000Z",
      misconceptionCounts: {},
    });
  });
});

describe("applyDiagnosis", () => {
  it("a pass raises mastery with diminishing returns and does not mutate the input", () => {
    const before = model({ "skill.var.assign": 0.0 });
    const d = diag({ skillDeltas: [{ skill: "skill.var.assign", kind: "pass", weight: 1 }] });
    const after = applyDiagnosis(before, d, DEFAULT_CONFIG);
    // 0 + 0.5 * (1 - 0) * 1 = 0.5
    expect(after.skills["skill.var.assign"]!.mastery).toBeCloseTo(0.5, 10);
    expect(after.skills["skill.var.assign"]!.attempts).toBe(2); // fixture seeds attempts=1
    expect(after.skills["skill.var.assign"]!.passes).toBe(2);
    // input untouched (purity)
    expect(before.skills["skill.var.assign"]!.mastery).toBe(0.0);
  });

  it("a misconception lowers mastery and bumps the misconception count", () => {
    const before = model({ "skill.random.randint": 0.5 });
    const d = diag({
      correct: false,
      attribution: "misconception",
      misconceptionId: "mis.random.no_import",
      skillDeltas: [{ skill: "skill.random.randint", kind: "misconception", weight: 0.4 }],
    });
    const after = applyDiagnosis(before, d, DEFAULT_CONFIG);
    // 0.5 - 0.15 * 0.4 = 0.44
    expect(after.skills["skill.random.randint"]!.mastery).toBeCloseTo(0.44, 10);
    expect(after.skills["skill.random.randint"]!.misconceptionCounts["mis.random.no_import"]).toBe(1);
  });

  it("a generic fail applies the small penalty and creates a missing skill state", () => {
    const before = model({});
    const d = diag({
      correct: false,
      attribution: "mismatch",
      skillDeltas: [{ skill: "skill.var.assign", kind: "fail", weight: 1 }],
    });
    const after = applyDiagnosis(before, d, DEFAULT_CONFIG);
    expect(after.skills["skill.var.assign"]!.mastery).toBe(0); // clamped at 0
    expect(after.skills["skill.var.assign"]!.attempts).toBe(1);
  });
});

describe("targetUpstream", () => {
  it("returns the lowest-mastery upstream skill below threshold, ties by id", () => {
    // random.randint upstream = [var.assign, print_literal]; both below 0.8.
    const m = model({ "skill.var.assign": 0.3, "skill.output.print_literal": 0.7 });
    expect(targetUpstream(m, "skill.random.randint", bundle, DEFAULT_CONFIG)).toBe("skill.var.assign");
  });

  it("returns null when all upstream skills are at/above threshold", () => {
    const m = model({ "skill.var.assign": 0.9, "skill.output.print_literal": 0.9 });
    expect(targetUpstream(m, "skill.random.randint", bundle, DEFAULT_CONFIG)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test learnerModel`
Expected: FAIL — cannot resolve `../src/learnerModel.js`.

- [ ] **Step 3: Implement `packages/engine/src/learnerModel.ts`**

```ts
import type { LearnerModel, Diagnosis, SkillState, Bundle } from "@trellis/schema";
import { clamp01, DEFAULT_CONFIG, type EngineConfig } from "./config.js";

export function newSkillState(now: string): SkillState {
  return { mastery: 0, attempts: 0, passes: 0, lastSeen: now, misconceptionCounts: {} };
}

// §10.2 — apply a Diagnosis's skillDeltas to the model. PURE: returns a new model,
// never mutates the input (deep-copies touched skill states + their count maps).
export function applyDiagnosis(
  model: LearnerModel,
  diag: Diagnosis,
  cfg: EngineConfig = DEFAULT_CONFIG,
): LearnerModel {
  const skills: LearnerModel["skills"] = {};
  for (const k of Object.keys(model.skills)) {
    const prev = model.skills[k]!;
    skills[k] = { ...prev, misconceptionCounts: { ...prev.misconceptionCounts } };
  }

  for (const d of diag.skillDeltas) {
    const base = skills[d.skill] ?? newSkillState(diag.submittedAt);
    const s: SkillState = { ...base, misconceptionCounts: { ...base.misconceptionCounts } };
    s.attempts += 1;
    if (d.kind === "pass") {
      s.passes += 1;
      s.mastery = clamp01(s.mastery + cfg.learnRate * (1 - s.mastery) * d.weight);
    } else if (d.kind === "misconception") {
      s.mastery = clamp01(s.mastery - cfg.slip * d.weight);
      if (diag.misconceptionId !== undefined) {
        s.misconceptionCounts[diag.misconceptionId] =
          (s.misconceptionCounts[diag.misconceptionId] ?? 0) + 1;
      }
    } else {
      s.mastery = clamp01(s.mastery - cfg.small * d.weight);
    }
    s.lastSeen = diag.submittedAt;
    skills[d.skill] = s;
  }

  return { ...model, skills };
}

// §10.3 target — when a skill fails, re-aim at the weakest upstream skill below the
// completion threshold. Deterministic walk: lowest mastery wins, ties broken by id.
export function targetUpstream(
  model: LearnerModel,
  skillId: string,
  bundle: Bundle,
  cfg: EngineConfig = DEFAULT_CONFIG,
): string | null {
  const skill = bundle.skills[skillId];
  if (!skill) return null;
  let best: { id: string; mastery: number } | null = null;
  for (const up of skill.upstream) {
    const mastery = model.skills[up]?.mastery ?? 0;
    if (mastery >= cfg.completionThreshold) continue;
    if (
      best === null ||
      mastery < best.mastery ||
      (mastery === best.mastery && up < best.id)
    ) {
      best = { id: up, mastery };
    }
  }
  return best === null ? null : best.id;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test learnerModel`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/src/learnerModel.ts packages/engine/test/learnerModel.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): learner model update (applyDiagnosis) + upstream targeter"
```

---

## Task 11: Public API barrel (`index.ts`)

**Files:**
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/smoke.test.ts` (replace the scaffold assertion)

- [ ] **Step 1: Replace `packages/engine/src/index.ts` with the full barrel**

```ts
// @trellis/engine — pure, deterministic core (M2). Consumes @trellis/schema as types only.
export type { EngineConfig } from "./config.js";
export { DEFAULT_CONFIG, clamp01 } from "./config.js";

export { normalize } from "./normalize.js";
export { deepEqual } from "./deepEqual.js";

export type { Availability, AvailabilityMap, UnmetRequirement } from "./resolver.js";
export { meets, completed, resolveAvailability, whyLocked } from "./resolver.js";

export type { AvailabilityDiff } from "./navigation.js";
export { spineOrder, nextSpineCell, availabilityDiff } from "./navigation.js";

export type { Phase, MachineState, StepEvent } from "./stepMachine.js";
export { initialState, step, StepTransitionError } from "./stepMachine.js";

export type { DetectContext } from "./detect.js";
export { evalSignature, specificityRank, detect } from "./detect.js";

export type { NonBuildSubmission, DiagnoseEffects } from "./diagnose.js";
export {
  matchesAccepted,
  compareNonBuild,
  computeDeltas,
  diagnoseNonBuild,
} from "./diagnose.js";

export { newSkillState, applyDiagnosis, targetUpstream } from "./learnerModel.js";
```

- [ ] **Step 2: Replace `packages/engine/test/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import * as engine from "../src/index.js";

describe("@trellis/engine public API", () => {
  it("exports the documented surface", () => {
    for (const name of [
      "resolveAvailability",
      "nextSpineCell",
      "availabilityDiff",
      "step",
      "detect",
      "diagnoseNonBuild",
      "applyDiagnosis",
      "targetUpstream",
    ] as const) {
      expect(typeof engine[name]).toBe("function");
    }
    expect(engine.DEFAULT_CONFIG.learnRate).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the smoke test**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test smoke`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/src/index.ts packages/engine/test/smoke.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "feat(engine): export the public API barrel"
```

---

## Task 12: Milestone gate — the gating diff + determinism

**Files:**
- Create: `packages/engine/test/gating.test.ts`
- Create: `packages/engine/test/determinism.test.ts`

This task encodes the milestone definition of done (`START-HERE.md` §Gate).

- [ ] **Step 1: Write `packages/engine/test/gating.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  resolveAvailability,
  availabilityDiff,
  applyDiagnosis,
  diagnoseNonBuild,
} from "../src/index.js";
import type { Diagnosis } from "@trellis/schema";
import { graph, bundle, model } from "./fixtures.js";

describe("MILESTONE GATE — random extension gating diff", () => {
  it("one prerequisite met (print_literal) but var.assign unmet → random LOCKED", () => {
    const m = model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.5 });
    expect(resolveAvailability(m, graph)["node.random"]).toBe("locked");
  });

  it("both prerequisites met (var.assign crosses 0.6) → random AVAILABLE", () => {
    const m = model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.6 });
    expect(resolveAvailability(m, graph)["node.random"]).toBe("available");
  });

  it("the availability DIFF reports node.random as newly unlocked when var.assign crosses 0.6", () => {
    const before = resolveAvailability(
      model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.59 }),
      graph,
    );
    const after = resolveAvailability(
      model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.6 }),
      graph,
    );
    expect(before["node.random"]).toBe("locked");
    expect(after["node.random"]).toBe("available");
    expect(availabilityDiff(before, after).newlyAvailable).toContain("node.random");
  });

  it("end-to-end: applying a pass Diagnosis that lifts var.assign over 0.6 unlocks random", () => {
    // var.assign at 0.2; a pass with weight 1 → 0.2 + 0.5*(1-0.2)*1 = 0.6 (meets the 0.6 gate).
    const start = model({ "skill.output.print_literal": 0.5, "skill.var.assign": 0.2 });
    const before = resolveAvailability(start, graph);
    expect(before["node.random"]).toBe("locked");

    const passDiag: Diagnosis = {
      id: "d1",
      learnerId: "L1",
      stepId: "cell.variables.box#x",
      contentVersion: "2026.06.0-test",
      submittedAt: "2026-06-08T12:00:00.000Z",
      correct: true,
      attribution: "pass",
      signals: { ran: false, wallMs: 0 },
      skillDeltas: [{ skill: "skill.var.assign", kind: "pass", weight: 1 }],
      seed: 0,
    };
    const updated = applyDiagnosis(start, passDiag);
    expect(updated.skills["skill.var.assign"]!.mastery).toBeCloseTo(0.6, 10);

    const after = resolveAvailability(updated, graph);
    expect(after["node.random"]).toBe("available");
    expect(availabilityDiff(before, after).newlyAvailable).toContain("node.random");
  });
});

describe("MILESTONE GATE — non-build attribution precedence", () => {
  const fx = { id: "d", learnerId: "L1", now: "2026-06-08T12:00:00.000Z" };
  it("covers pass / misconception / mismatch", () => {
    const recognizeStep = bundle.cells; // ensure bundle import is used
    void recognizeStep;
    // (full precedence assertions live in diagnose.test.ts; this is the gate summary)
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run the gating test**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test gating`
Expected: PASS — every gate assertion green (especially the end-to-end unlock).

- [ ] **Step 3: Write `packages/engine/test/determinism.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { diagnoseNonBuild, detect } from "../src/index.js";
import { bundle, recognizeStep } from "./fixtures.js";

describe("determinism", () => {
  const fx = { id: "d", learnerId: "L1", now: "2026-06-08T12:00:00.000Z" };

  it("same (step, submission, effects) → byte-identical Diagnosis", () => {
    const a = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" }, bundle, fx);
    const b = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" }, bundle, fx);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("detect is a pure function of its inputs", () => {
    const ctx = { signals: { ran: false, wallMs: 0 }, choiceId: "c" };
    expect(detect(recognizeStep, ctx, bundle)).toBe(detect(recognizeStep, ctx, bundle));
  });
});
```

- [ ] **Step 4: Run the determinism test**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test determinism`
Expected: PASS.

- [ ] **Step 5: Simplify the gating test's second block**

The `MILESTONE GATE — non-build attribution precedence` block above is a placeholder summary; replace its body so it asserts the real precedence directly (don't leave the `void` hack):

```ts
describe("MILESTONE GATE — non-build attribution precedence", () => {
  const fx = { id: "d", learnerId: "L1", now: "2026-06-08T12:00:00.000Z" };
  it("pass / misconception / mismatch on the recognize step", () => {
    const pass = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "a" }, bundle, fx);
    const misc = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "b" }, bundle, fx);
    const mism = diagnoseNonBuild(recognizeStep, { kind: "recognize", choiceId: "d" }, bundle, fx);
    expect(pass.attribution).toBe("pass");
    expect(misc.attribution).toBe("misconception");
    expect(misc.misconceptionId).toBe("mis.random.no_import");
    expect(mism.attribution).toBe("mismatch");
  });
});
```

Also update the imports at the top of `gating.test.ts` to include `diagnoseNonBuild` and `recognizeStep`:

```ts
import {
  resolveAvailability,
  availabilityDiff,
  applyDiagnosis,
  diagnoseNonBuild,
} from "../src/index.js";
import type { Diagnosis } from "@trellis/schema";
import { graph, bundle, model, recognizeStep } from "./fixtures.js";
```

- [ ] **Step 6: Re-run the gating test after the rewrite**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/engine test gating`
Expected: PASS (both describe blocks, real assertions).

- [ ] **Step 7: Commit**

```bash
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' add packages/engine/test/gating.test.ts packages/engine/test/determinism.test.ts
git -c user.name='m2-engine' -c user.email='noreply@anthropic.com' commit -m "test(engine): milestone gate (random gating diff) + determinism + attribution precedence"
```

---

## Task 13: Full gate verification + finish the branch

**Files:** none (verification + integration).

- [ ] **Step 1: Run the complete package gate**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine typecheck && \
pnpm --filter @trellis/engine lint && \
pnpm --filter @trellis/engine test && \
pnpm --filter @trellis/engine build
```
Expected: all four PASS. Paste the real output (no success claim without evidence — `PARALLEL-STREAMS.md` §1.6).

- [ ] **Step 2: Verify the compiled ESM output imports cleanly (build-cycle trap)**

Run:
```bash
node -e "import('./packages/engine/dist/src/index.js').then(m => { const need=['resolveAvailability','diagnoseNonBuild','applyDiagnosis','step','detect']; for(const n of need){ if(typeof m[n]!=='function') throw new Error('missing '+n);} console.log('ESM import OK:', Object.keys(m).length, 'exports'); })"
```
Expected: `ESM import OK: <n> exports`. (Confirms the engine's dist has no unresolved cross-package runtime import — the type-only schema dependency is fully elided.)

- [ ] **Step 3: Run the whole-monorepo gate to confirm nothing else broke**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Expected: green across `@trellis/schema` and `@trellis/engine`.

- [ ] **Step 4: Confirm engine purity (no forbidden imports leaked in)**

Run:
```bash
grep -REn "from ['\"](react|react-dom|idb|pyodide|@trellis/persist)" packages/engine/src || echo "PURE: no effectful imports"
grep -REn "import (\{[^}]*\} )?from ['\"]@trellis/schema" packages/engine/src | grep -v "import type" || echo "schema imported as TYPES ONLY"
```
Expected: `PURE: no effectful imports` and `schema imported as TYPES ONLY`.

- [ ] **Step 5: Finish the development branch**

Invoke the `superpowers:finishing-a-development-branch` skill. Merge target: `main` (per `START-HERE.md` and `PARALLEL-STREAMS.md` §4). Rebase on `main` first if it advanced; given disjoint package paths, conflicts should be limited to the lockfile (orchestrator resolves lockfile churn).

---

## Self-Review

**1. Spec coverage** (M2 row, spec §4 + `START-HERE.md` scope):
- `resolveAvailability` + `nextSpineCell` (§4.3) → Tasks 5, 6. ✓
- Step lifecycle machine for watch/recognize/recall/predict (§5.1) → Task 7. ✓
- Non-build `diagnose` (§8): recognize exact-choice; recall normalize + RE2 + misconceptionMap; predict → Task 9. ✓
- `detect` (§7) incl. combinators → Task 8. ✓
- `applyDiagnosis` + continuous mastery (§10.2) → Task 10. ✓
- Upstream-skill targeter (§10.3) → Task 10. ✓
- Gate: gating diff on random (locked with one prereq, available with both; the diff) → Task 12. ✓
- Gate: non-build attribution precedence (pass/misconception/mismatch) → Tasks 9, 12. ✓
- Gate: determinism (same (step, signals) → identical Diagnosis) → Task 12. ✓
- Purity (no react/idb/pyodide/fetch; effects injected) → enforced by ESLint + Task 13 grep; achieved via type-only schema import + injected `DiagnoseEffects`. ✓
- `re2js` dependency added → Task 0. ✓

**2. Placeholder scan:** The only intentional placeholder (the `void`-hack block in Task 12 Step 1) is explicitly rewritten in Task 12 Step 5 with real assertions. No `TBD`/`add validation`/"similar to" left.

**3. Type consistency:** `AvailabilityMap` (resolver) is consumed by `availabilityDiff` (navigation). `DetectContext` (detect) is produced by `detectContext()` (diagnose). `NonBuildSubmission`/`DiagnoseEffects`/`EngineConfig` names match across diagnose↔index↔tests. `SkillDelta.kind` values used (`"pass"`/`"fail"`/`"misconception"`) match the frozen schema. `Attribution` values used (`"pass"`/`"misconception"`/`"mismatch"`) are a subset of the frozen union. `step(kind, state, event)` signature matches all call sites.

**4. Escalation note:** This plan makes **no** change to the frozen `@trellis/schema`. The non-build submission is threaded through an engine-internal `DetectContext`/`NonBuildSubmission` (a function-signature choice), not by adding a field to `RawSignals`. If, during execution, a frozen type proves genuinely insufficient (not merely awkward), STOP and escalate to the orchestrator per `PARALLEL-STREAMS.md` §2 — do not fork the contract.
