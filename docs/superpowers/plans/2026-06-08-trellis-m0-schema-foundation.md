# Trellis M0 — Schema & Monorepo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm/Turborepo monorepo and the `@trellis/schema` package, expressing every TECHNICAL_DESIGN §3 type as a TypeBox definition that yields a TypeScript type, a JSON Schema, and runtime validation from one source — proving the data model compiles and round-trips through validation.

**Architecture:** A pnpm workspace with Turborepo orchestration. One package in this milestone — `@trellis/schema` — authors each domain type once with TypeBox. `Static<typeof T>` gives the TS type; the schema object *is* the JSON Schema; `Value.Check`/`Value.Errors` give runtime validation. A reusable `validate`/`assertValid` helper wraps `Value` with readable error paths. An ESLint `no-restricted-imports` rule reserves engine purity for later milestones. CI runs typecheck + tests.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript (strict), `@sinclair/typebox@^0.34`, Vitest, ESLint, GitHub Actions.

---

## Conventions for this plan

- All commands run from the repo root (`/Users/alan/Desktop/Trellis`) unless a step says otherwise.
- The repo is already a git repo with two commits (the design doc and the spec). Do not re-init.
- **Pin TypeBox to `@sinclair/typebox@^0.34`.** This plan uses its stable API: `import { Type, type Static } from '@sinclair/typebox'` and `import { Value } from '@sinclair/typebox/value'`. Do **not** install the separate `typebox` (1.0) package — its import surface differs.
- Commit messages use Conventional Commits.

## File structure (created in this milestone)

```
pnpm-workspace.yaml            workspace globs
package.json                   root: scripts, devDeps, packageManager
turbo.json                     pipeline: build, test, typecheck, lint
tsconfig.base.json             shared strict compiler options
.eslintrc.cjs                  flat-config-free classic config + engine-purity rule
.gitignore                     node_modules, dist, coverage, .turbo
.github/workflows/ci.yml       typecheck + lint + test on push/PR
packages/schema/
├── package.json               @trellis/schema
├── tsconfig.json              extends base
├── vitest.config.ts           test config
├── src/
│   ├── ids.ts                 id aliases, enums, ContentVersion, RichText, Json
│   ├── content.ts             Skill, ConceptNode, Requirement, Cell, Step union, Choice,
│   │                          AcceptedAnswer, Misconception, Hint, SkillDelta
│   ├── evaluator.ts           EvaluatorConfig + RunConfig/TestConfig/AstConfig/AstQuery/
│   │                          AstPred/PropertyConfig/GenSpec/LineRange
│   ├── runtime.ts             Diagnosis, Attribution, RawSignals, LearnerModel, SkillState,
│   │                          BehavioralEvent, SignalType, MasteryThreshold
│   ├── validate.ts            validate()/assertValid() helpers over Value
│   └── index.ts               barrel re-exports
└── test/
    ├── content.test.ts
    ├── evaluator.test.ts
    ├── runtime.test.ts
    └── validate.test.ts
```

---

## Task 1: Monorepo skeleton

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

- [ ] **Step 1: Create the workspace manifest**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 2: Create the root package.json**

Create `package.json`:

```json
{
  "name": "trellis",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Create the Turbo pipeline**

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {}
  }
}
```

- [ ] **Step 4: Create the shared tsconfig**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 5: Create .gitignore**

Create `.gitignore`:

```
node_modules/
dist/
coverage/
.turbo/
*.tsbuildinfo
```

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml package.json turbo.json tsconfig.base.json .gitignore
git commit -m "chore: scaffold pnpm + turborepo monorepo"
```

---

## Task 2: `@trellis/schema` package scaffold

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/vitest.config.ts`
- Create: `packages/schema/src/index.ts` (temporary stub)

- [ ] **Step 1: Create the package manifest**

Create `packages/schema/package.json`:

```json
{
  "name": "@trellis/schema",
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
    "@sinclair/typebox": "^0.34.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create the package tsconfig**

Create `packages/schema/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create the Vitest config**

Create `packages/schema/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create a temporary index stub**

Create `packages/schema/src/index.ts`:

```ts
export {};
```

- [ ] **Step 5: Install dependencies**

Run: `pnpm install`
Expected: installs without error; creates `pnpm-lock.yaml` and `node_modules`.

- [ ] **Step 6: Verify the toolchain runs**

Run: `pnpm --filter @trellis/schema typecheck`
Expected: exits 0 (no type errors on the empty stub).

- [ ] **Step 7: Commit**

```bash
git add packages/schema pnpm-lock.yaml
git commit -m "chore: scaffold @trellis/schema package"
```

---

## Task 3: Identifiers, enums, and primitive aliases (`ids.ts`)

These are the leaf types every other schema references. Per §3.1, ids are strings; per §3.4/§3.7/§3.9 there are several string-literal unions. `RichText` is authored prose — modeled as a markdown string for v1. `Json` is a recursive JSON value used by `TestConfig.cases` and `BehavioralEvent.payload`.

**Files:**
- Create: `packages/schema/src/ids.ts`
- Test: `packages/schema/test/runtime.test.ts` (created in Task 6; ids are exercised transitively)

- [ ] **Step 1: Write `ids.ts`**

Create `packages/schema/src/ids.ts`:

```ts
import { Type, type Static, type TSchema } from "@sinclair/typebox";

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
export const Json: TSchema = Type.Recursive((This) =>
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
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @trellis/schema typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/schema/src/ids.ts
git commit -m "feat(schema): add identifiers, enums, RichText and Json primitives"
```

---

## Task 4: Validation helpers (`validate.ts`)

Built before the entity schemas so the entity tests can use it. Wraps TypeBox `Value` to give a boolean check and a throwing assert with a readable error path.

**Files:**
- Create: `packages/schema/src/validate.ts`
- Test: `packages/schema/test/validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Type } from "@sinclair/typebox";
import { validate, assertValid } from "../src/validate.js";

const Point = Type.Object({ x: Type.Number(), y: Type.Number() });

describe("validate", () => {
  it("accepts a valid value", () => {
    expect(validate(Point, { x: 1, y: 2 }).ok).toBe(true);
  });

  it("rejects an invalid value and reports the failing path", () => {
    const result = validate(Point, { x: 1, y: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].path).toBe("/y");
    }
  });
});

describe("assertValid", () => {
  it("returns the value when valid", () => {
    expect(assertValid(Point, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it("throws with a path-annotated message when invalid", () => {
    expect(() => assertValid(Point, { x: 1 })).toThrowError(/\/y/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @trellis/schema test`
Expected: FAIL — cannot resolve `../src/validate.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/schema/src/validate.ts`:

```ts
import { type TSchema, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export interface SchemaError {
  path: string;
  message: string;
}

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: SchemaError[] };

export function validate<S extends TSchema>(
  schema: S,
  value: unknown,
): ValidateResult<Static<S>> {
  if (Value.Check(schema, value)) {
    return { ok: true, value: value as Static<S> };
  }
  const errors: SchemaError[] = [...Value.Errors(schema, value)].map((e) => ({
    path: e.path,
    message: e.message,
  }));
  return { ok: false, errors };
}

export function assertValid<S extends TSchema>(
  schema: S,
  value: unknown,
): Static<S> {
  const result = validate(schema, value);
  if (result.ok) return result.value;
  const detail = result.errors
    .map((e) => `${e.path || "/"}: ${e.message}`)
    .join("; ");
  throw new Error(`Schema validation failed: ${detail}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trellis/schema test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/validate.ts packages/schema/test/validate.test.ts
git commit -m "feat(schema): add validate/assertValid helpers over TypeBox Value"
```

---

## Task 5: Evaluator schemas (`evaluator.ts`)

Authored before `content.ts` because `BuildStep` embeds `EvaluatorConfig`. Covers §3.6 and §6.3's `AstQuery` (recursive) + `AstPred`.

**Files:**
- Create: `packages/schema/src/evaluator.ts`
- Test: `packages/schema/test/evaluator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/evaluator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validate } from "../src/validate.js";
import { EvaluatorConfig, AstQuery } from "../src/evaluator.js";

describe("AstQuery", () => {
  it("accepts a nested structural query (the §13.1 implicit_coerce example)", () => {
    const q = {
      node: "BinOp",
      where: {
        childMatches: {
          node: "Constant",
          where: { attr: "value", eq: 7 },
        },
      },
    };
    expect(validate(AstQuery, q).ok).toBe(true);
  });

  it("accepts boolean combinators", () => {
    const q = { all: [{ node: "For" }, { not: { node: "Call", where: { calls: "$self" } } }] };
    expect(validate(AstQuery, q).ok).toBe(true);
  });
});

describe("EvaluatorConfig", () => {
  it("accepts the §13.1 string-concat build evaluator", () => {
    const cfg = {
      run: { timeoutMs: 2000, memoryMb: 256 },
      tests: { cases: [{ input: null, expected: "age: 7\n" }] },
      ast: {
        queries: [
          { tag: "implicit_coerce", query: { node: "BinOp" } },
        ],
      },
      property: {
        referenceImpl: "def sol(age): return f'age: {age}'",
        generators: [{ param: "age", type: "int", min: 0, max: 999 }],
        numCases: 50,
        seed: 1234,
      },
    };
    expect(validate(EvaluatorConfig, cfg).ok).toBe(true);
  });

  it("rejects a config missing the required run block", () => {
    const result = validate(EvaluatorConfig, { tests: { cases: [] } });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @trellis/schema test evaluator`
Expected: FAIL — cannot resolve `../src/evaluator.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/schema/src/evaluator.ts`:

```ts
import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Json } from "./ids.js";

// §3.6
export const RunConfig = Type.Object({
  timeoutMs: Type.Number(),
  memoryMb: Type.Number(),
  entrypoint: Type.Optional(Type.String()),
});

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

// §6.3 — AstPred references AstQuery (childMatches), so both are recursive.
// Declared together inside one Type.Recursive over a discriminated wrapper would be
// awkward; instead AstQuery is recursive and AstPred embeds it by referencing the
// exported AstQuery schema.
export const AstQuery: TSchema = Type.Recursive((Self) =>
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
      count: Type.Optional(
        Type.Object({
          op: Type.Union([Type.Literal("="), Type.Literal(">="), Type.Literal("<=")]),
          n: Type.Number(),
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

// §6.4
export const GenSpec: TSchema = Type.Recursive((Self) =>
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
  numCases: Type.Number(),
  seed: Type.Number(),
  comparator: Type.Optional(
    Type.Union([Type.Literal("deep-equal"), Type.Literal("float-close")]),
  ),
});

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trellis/schema test evaluator`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/evaluator.ts packages/schema/test/evaluator.test.ts
git commit -m "feat(schema): add EvaluatorConfig and recursive AstQuery/GenSpec"
```

---

## Task 6: Content schemas (`content.ts`)

Covers §3.2–§3.5: `Skill`, `ConceptNode`/`Requirement`, `Cell`/`Step` (a 5-member discriminated union), `Choice`, `AcceptedAnswer`, `Misconception`/`Hint`, `SkillDelta`, `LineRange`.

**Files:**
- Create: `packages/schema/src/content.ts`
- Test: `packages/schema/test/content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/content.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validate } from "../src/validate.js";
import { ConceptNode, Cell, Misconception, Skill } from "../src/content.js";

describe("ConceptNode", () => {
  it("accepts the §13.1 string-concat node with three requirement kinds", () => {
    const node = {
      id: "node.string_concat",
      title: "String concatenation",
      track: "extension",
      requires: [
        { skill: "skill.var.assign", minMastery: 0.6, kind: "track" },
        { skill: "skill.string.literal", minMastery: 0.6, kind: "prerequisite" },
        { skill: "skill.var.use", minMastery: 0.6, kind: "utility" },
      ],
      teaches: ["skill.string.concat_str_num"],
      cells: ["cell.concat.intro"],
    };
    expect(validate(ConceptNode, node).ok).toBe(true);
  });

  it("rejects an unknown requirement kind", () => {
    const node = {
      id: "node.x",
      title: "x",
      track: "spine",
      requires: [{ skill: "s", minMastery: 0.5, kind: "bogus" }],
      teaches: [],
      cells: [],
    };
    expect(validate(ConceptNode, node).ok).toBe(false);
  });
});

describe("Cell with a Step union", () => {
  it("accepts a cell containing watch, predict, and build steps", () => {
    const cell = {
      id: "cell.concat.intro",
      nodeId: "node.string_concat",
      title: "Intro",
      certifies: ["skill.string.concat_str_num"],
      steps: [
        { id: "cell.concat.intro#0", kind: "watch", prompt: "p", skills: [], body: "Strings join with +" },
        {
          id: "cell.concat.intro#1",
          kind: "predict",
          prompt: "What prints?",
          skills: ["skill.string.concat_str_num"],
          code: "x = 'age: ' + 7",
          expected: { normalized: ["TypeError"] },
          reveal: "run-and-show",
        },
        {
          id: "cell.concat.intro#2",
          kind: "build",
          prompt: "Print 'age: 7'.",
          skills: ["skill.string.concat_str_num"],
          language: "python",
          starterCode: "age = 7\n# print here\n",
          evaluator: { run: { timeoutMs: 2000, memoryMb: 256 } },
        },
      ],
    };
    expect(validate(Cell, cell).ok).toBe(true);
  });

  it("rejects a build step missing its evaluator", () => {
    const cell = {
      id: "c",
      nodeId: "n",
      title: "t",
      certifies: [],
      steps: [
        { id: "c#0", kind: "build", prompt: "p", skills: [], language: "python", starterCode: "" },
      ],
    };
    expect(validate(Cell, cell).ok).toBe(false);
  });
});

describe("Misconception", () => {
  it("accepts the §13.1 implicit_coercion taxonomy entry", () => {
    const m: unknown = {
      id: "mis.concat.implicit_coercion",
      skill: "skill.string.concat_str_num",
      title: "Implicit coercion",
      signature: { any: [{ runError: "runtime" }, { astTag: "implicit_coerce" }] },
      feedback: "Python won't auto-convert a number to text.",
      hintLadder: [
        { level: 1, body: "What type is `age`?" },
        { level: 4, body: "Solution:", revealCode: "print(f'age: {age}')" },
      ],
      skillDeltas: [
        { skill: "skill.string.concat_str_num", kind: "misconception", weight: 0.3 },
      ],
    };
    expect(validate(Misconception, m).ok).toBe(true);
  });
});

describe("Skill", () => {
  it("accepts a skill with misconception ids and upstream edges", () => {
    const s = {
      id: "skill.string.concat_str_num",
      title: "Join a string and a number",
      description: "Combine text and a number into one string.",
      misconceptions: ["mis.concat.implicit_coercion"],
      upstream: ["skill.string.literal"],
    };
    expect(validate(Skill, s).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @trellis/schema test content`
Expected: FAIL — cannot resolve `../src/content.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/schema/src/content.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trellis/schema test content`
Expected: PASS. (This depends on `Signature` from `runtime.ts`, written in Task 7. If Task 7 is not yet done, this test fails to import `Signature` — do Task 7 first or together. The plan orders `runtime.ts` after because runtime types are larger; if executing strictly in order, temporarily comment the `signature` field. Prefer doing Task 7 Step 3's `Signature` export before running this.)

> **Executor note:** `content.ts` imports `Signature` from `runtime.ts`. Implement Task 7's `runtime.ts` (which defines and exports `Signature`) before running this step, then return here. The two files are mutually ordered by this single dependency; there is no cycle (runtime does not import content).

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/content.ts packages/schema/test/content.test.ts
git commit -m "feat(schema): add Skill/ConceptNode/Cell/Step/Misconception content types"
```

---

## Task 7: Runtime-state schemas (`runtime.ts`)

Covers §3.7–§3.9 and §7's `Signature`: `Signature`, `RawSignals`, `Diagnosis`, `SkillState`, `LearnerModel`, `BehavioralEvent`. **Implement this file before running Task 6 Step 4** (it exports `Signature`, which `content.ts` imports).

**Files:**
- Create: `packages/schema/src/runtime.ts`
- Test: `packages/schema/test/runtime.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/runtime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validate } from "../src/validate.js";
import { Signature, Diagnosis, LearnerModel, BehavioralEvent } from "../src/runtime.js";

describe("Signature", () => {
  it("accepts the §13.1 implicit_coercion signature", () => {
    const sig = { any: [{ runError: "runtime" }, { astTag: "implicit_coerce" }] };
    expect(validate(Signature, sig).ok).toBe(true);
  });

  it("accepts nested all/not combinators", () => {
    const sig = { all: [{ astTag: "loop" }, { not: { propertyFailed: true } }] };
    expect(validate(Signature, sig).ok).toBe(true);
  });
});

describe("Diagnosis", () => {
  it("accepts a build-step misconception diagnosis", () => {
    const d = {
      id: "diag.1",
      learnerId: "learner.abc",
      stepId: "cell.concat.intro#2",
      contentVersion: "2026.06.0",
      submittedAt: "2026-06-08T10:00:00.000Z",
      correct: false,
      attribution: "misconception",
      misconceptionId: "mis.concat.implicit_coercion",
      signals: { ran: true, wallMs: 42, astTags: ["implicit_coerce"] },
      skillDeltas: [{ skill: "skill.string.concat_str_num", kind: "misconception", weight: 0.3 }],
      seed: 1234,
    };
    expect(validate(Diagnosis, d).ok).toBe(true);
  });
});

describe("LearnerModel", () => {
  it("accepts a model with one skill state", () => {
    const m = {
      learnerId: "learner.abc",
      contentVersion: "2026.06.0",
      skills: {
        "skill.string.concat_str_num": {
          mastery: 0.4,
          attempts: 2,
          passes: 0,
          lastSeen: "2026-06-08T10:00:00.000Z",
          misconceptionCounts: { "mis.concat.implicit_coercion": 1 },
        },
      },
    };
    expect(validate(LearnerModel, m).ok).toBe(true);
  });
});

describe("BehavioralEvent", () => {
  it("accepts a submission event", () => {
    const e = {
      id: "ev.1",
      learnerId: "learner.abc",
      sessionId: "sess.1",
      seq: 7,
      stepId: "cell.concat.intro#2",
      ts: "2026-06-08T10:00:00.000Z",
      type: "submission",
      payload: { correct: false },
    };
    expect(validate(BehavioralEvent, e).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @trellis/schema test runtime`
Expected: FAIL — cannot resolve `../src/runtime.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/schema/src/runtime.ts`:

```ts
import { Type, type Static, type TSchema } from "@sinclair/typebox";
import {
  SkillId,
  StepId,
  MisconId,
  ContentVersion,
  Attribution,
  SignalType,
  Json,
} from "./ids.js";
import { SkillDelta } from "./content.js";

// §7 — a misconception signature: a boolean predicate over RawSignals.
export const Signature: TSchema = Type.Recursive((Self) =>
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
      passed: Type.Number(),
      failed: Type.Number(),
      failures: Type.Array(Type.Object({ caseIndex: Type.Number(), got: Json })),
    }),
  ),
  astTags: Type.Optional(Type.Array(Type.String())),
  property: Type.Optional(
    Type.Object({ passed: Type.Boolean(), counterexample: Type.Optional(Json) }),
  ),
  stdout: Type.Optional(Type.String()),
  wallMs: Type.Number(),
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
  attempts: Type.Number(),
  passes: Type.Number(),
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
  seq: Type.Number(),
  stepId: StepId,
  ts: Type.String(),
  type: SignalType,
  payload: Json,
});
export type BehavioralEvent = Static<typeof BehavioralEvent>;
```

> **Cross-file note:** `runtime.ts` imports `SkillDelta` from `content.ts`, and `content.ts` imports `Signature` from `runtime.ts`. This is a TypeScript *type-and-value* import cycle across two ES modules. It resolves cleanly because each symbol is only *referenced inside a function passed to `Type.Recursive`/`Type.Object`* or as a property value evaluated at module-eval time in an order Node/Vitest handles (the schemas are plain objects, not classes with inheritance). If you hit a "Cannot access before initialization" error at import time, break the cycle by moving `SkillDelta` into `ids.ts` (it depends only on `SkillId`) and importing it from there in both files. Prefer that move if any runtime ReferenceError appears.

- [ ] **Step 4: Run the runtime test to verify it passes**

Run: `pnpm --filter @trellis/schema test runtime`
Expected: PASS (5 tests).

- [ ] **Step 5: Now run the content test (Task 6) — it should pass**

Run: `pnpm --filter @trellis/schema test content`
Expected: PASS (Task 6's `Signature` import now resolves).

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/runtime.ts packages/schema/test/runtime.test.ts
git commit -m "feat(schema): add Signature/RawSignals/Diagnosis/LearnerModel/BehavioralEvent"
```

---

## Task 8: Barrel exports and full-suite verification

**Files:**
- Modify: `packages/schema/src/index.ts`

- [ ] **Step 1: Replace the index stub with real exports**

Replace the entire contents of `packages/schema/src/index.ts`:

```ts
export * from "./ids.js";
export * from "./validate.js";
export * from "./evaluator.js";
export * from "./content.js";
export * from "./runtime.js";
```

- [ ] **Step 2: Typecheck the whole package**

Run: `pnpm --filter @trellis/schema typecheck`
Expected: exits 0.

- [ ] **Step 3: Run the whole test suite**

Run: `pnpm --filter @trellis/schema test`
Expected: PASS — all suites green (validate, evaluator, content, runtime).

- [ ] **Step 4: Commit**

```bash
git add packages/schema/src/index.ts
git commit -m "feat(schema): export all domain schemas from the package barrel"
```

---

## Task 9: ESLint engine-purity rule

Reserves the §12 purity boundary now, before `@trellis/engine` exists, so the rule is in place the moment that package is created in M2. The rule forbids `react`, `idb`, raw `fetch`, and `pyodide` imports under `packages/engine/**`.

**Files:**
- Create: `.eslintrc.cjs`
- Modify: `package.json` (root devDependencies + lint script wiring)

- [ ] **Step 1: Add ESLint to the root devDependencies**

Modify `package.json` — add to `devDependencies`:

```json
    "eslint": "^8.57.0",
    "@typescript-eslint/parser": "^8.8.0"
```

(Keep the existing `turbo` and `typescript` entries.)

- [ ] **Step 2: Create the ESLint config with the purity rule**

Create `.eslintrc.cjs`:

```js
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  env: { browser: true, es2022: true, node: true },
  rules: {},
  overrides: [
    {
      // §12 purity boundary: the engine must not import effectful libs.
      files: ["packages/engine/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              { name: "react", message: "engine must stay pure (§12): no React." },
              { name: "react-dom", message: "engine must stay pure (§12): no React." },
              { name: "idb", message: "engine must stay pure (§12): inject persist instead." },
              { name: "pyodide", message: "engine must stay pure (§12): inject the sandbox instead." },
            ],
            patterns: [
              { group: ["*/persist", "@trellis/persist"], message: "engine must stay pure (§12): inject persist." },
            ],
          },
        ],
        "no-restricted-globals": [
          "error",
          { name: "fetch", message: "engine must stay pure (§12): no network in engine." },
        ],
      },
    },
  ],
};
```

- [ ] **Step 3: Install and verify lint runs clean**

Run: `pnpm install && pnpm --filter @trellis/schema lint`
Expected: exits 0 (the schema package has no restricted imports; the engine override matches no files yet, which is fine).

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.cjs package.json pnpm-lock.yaml
git commit -m "chore: add ESLint with the §12 engine-purity import rule"
```

---

## Task 10: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 2: Verify the same commands pass locally (what CI will run)**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all three exit 0; Turbo reports the `@trellis/schema` tasks succeeding.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck, lint, and test on push and PR"
```

---

## M0 Definition of Done (gate)

All of the following must hold:

- [ ] `pnpm typecheck` exits 0 — every §3 type compiles.
- [ ] `pnpm test` is green — valid examples of `ConceptNode`, `Cell`/`Step`, `Misconception`, `Skill`, `EvaluatorConfig`/`AstQuery`, `Diagnosis`, `LearnerModel`, `BehavioralEvent`, and `Signature` all pass `Value.Check`, and malformed examples are rejected with a path-annotated error.
- [ ] `pnpm lint` exits 0 and the engine-purity rule is wired (verifiable by temporarily adding `import 'react'` to a throwaway `packages/engine/x.ts` and seeing lint fail — then removing it).
- [ ] The repo round-trips: a value built from the design's §13.1 examples validates, proving the data model is faithfully encoded.

This unblocks **M1 (content compiler)** and **M2 (engine core)**, which both depend only on `@trellis/schema`.

---

## Self-review notes (addressed in this plan)

- **Spec coverage (M0 row of the implementation spec §4):** workspace + Turbo (Task 1), `@trellis/schema` with all §3 types as TypeBox → TS + JSON Schema (Tasks 3–8), Vitest + CI (Tasks 2, 10), engine-purity import-lint (Task 9), and the round-trip validation gate (Tasks 4–8 + DoD). ✓
- **Type consistency:** `Signature` is defined in `runtime.ts` and consumed by `content.ts`'s `Misconception`; `SkillDelta` is defined in `content.ts` and consumed by `runtime.ts`'s `Diagnosis`. The one cross-file ordering hazard (build the `runtime.ts` `Signature` before running the `content.ts` test) is called out in Task 6 Step 4 and Task 7, with the `SkillDelta`→`ids.ts` escape hatch if a load-order ReferenceError appears. ✓
- **No placeholders:** every code step contains complete, runnable content; no TBD/TODO. ✓
- **Library APIs:** TypeBox pinned to `@sinclair/typebox@^0.34` with its verified stable surface (`Type.*`, `Static`, `Value.Check`, `Value.Errors`). ✓
```
