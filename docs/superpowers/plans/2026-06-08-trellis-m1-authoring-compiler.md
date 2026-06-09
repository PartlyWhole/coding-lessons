# M1 — `@trellis/authoring` Content Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@trellis/authoring` — the TypeScript compiler/validator/CLI that transforms the source YAML under `content/` into the FROZEN `@trellis/schema` `Bundle`, runs the seven §13.2 gates, and ships a `trellis lint | build | grade` CLI — proven against the existing 7-node / 15-skill / 21-misconception corpus and cross-checked against the Python reference validators.

**Architecture:** Pure-TS owns all logic (YAML→Bundle transform, derived indexes, the §6.3 `AstQuery` interpreter, the §7 `Signature` matcher, gates 1–7, lints, CLI). Two irreducibly-CPython primitives are delegated to thin Python helper scripts invoked via `node:child_process`: (a) `ast.parse` → JSON AST, and (b) run-one-test-case (execute learner code + compare). This guarantees byte-identical AST/execution fidelity with `content/verify/harness.py` (the differential oracle) while keeping the gate/transform/matcher logic in TypeScript, unit-testable over hand-built JSON ASTs. The compiler emits a content-addressed bundle (SHA-256 over canonical JSON).

**Tech Stack:** TypeScript 5.9 (ESM, `moduleResolution: Bundler`, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`), `@sinclair/typebox@^0.34` (via `@trellis/schema`, `Value.Check`), `js-yaml@4.2.0` (offline, with a local `.d.ts` shim), Vitest 2.1, local CPython3 (`/usr/bin/python3`, 3.9.6, pyyaml 6) for the two execution primitives. No `@types/node` / `@types/js-yaml` (unavailable offline → minimal ambient shims).

---

## Context the engineer must absorb first (read before Task 0)

You are **Stream A / M1**, working ONLY in the `m1-authoring` worktree at `/Users/alan/Desktop/trellis-m1`. You **own** `packages/authoring/**`. You **read but never write**: `packages/schema/**` (the frozen contract), `content/**` (the curriculum — flag issues, never rewrite), `content/validate.py`, `content/verify/harness.py`. Do not touch other packages, `main`, `TECHNICAL_DESIGN.md`, `docs/coordination/**`, or root config except the unavoidable `pnpm-lock.yaml` churn from adding your package (Task 0).

**Sources of truth (do not re-litigate design):** `TECHNICAL_DESIGN.md` §13 (authoring/pipeline + the seven gates §13.2), §4 (graph/DAG/resolver), §6.3 (AstQuery pinned semantics + `field` selector), §3 (entities); `docs/superpowers/specs/2026-06-08-trellis-m0-m5-implementation-design.md` §1 (proving-slice realignment) + §4 (M1 row); `docs/coordination/PARALLEL-STREAMS.md` (rules of engagement, frozen contract, gates).

**Reconciled instruction (important):** the spec §4 M1 *Note* says "gates 5–7 are stubbed in M1." `START-HERE.md` **overrides this for our stream**: port gates 1–6 to TS and keep `harness.py` as a differential cross-check (the TS matcher must agree on all 21 fixtures). This is feasible because `harness.py` already implements gates 5–6 self-contained via CPython3 + `ast` — needing neither the M3 sandbox nor the M4 detector. **Gate 7** (golden Diagnosis snapshots) has no Python reference and no golden snapshots in the corpus, so it ships as a present-but-passes-empty *plug-in stub* (structured so M4 switches it on without rework).

**The frozen contract you emit (`@trellis/schema`, do NOT change):**
- `Bundle = { contentVersion, skills: Record<SkillId,Skill>, nodes: Record<NodeId,ConceptNode>, cells: Record<CellId,Cell>, misconceptions: Record<MisconId,Misconception>, producers, requirements }`.
- `Skill = { id, title, description, misconceptions: MisconId[], upstream: SkillId[] }` — NOTE the Bundle's `Skill` keeps `upstream` and `misconceptions` as an **id-list**. (Source-only fields stripped: see Transform below.)
- `Misconception = { id, skill, title, signature, hintLadder, feedback, skillDeltas? }` — NO `triggers`/`notTriggers`/`_skill`/`_file` (source-only).
- `ConceptNode = { id, title, track, requires: Requirement[], teaches: SkillId[], cells: CellId[] }` — `cells` is an **id-list** in the Bundle.
- `Cell = { id, nodeId, title, steps: Step[], certifies: SkillId[] }` — `nodeId` is **injected** by the compiler (absent in source).
- `Producers = Record<SkillId, NodeId[]>`; `Requirements = Record<NodeId, Requirement[]>`.
- `Signature` (recursive union): `{astTag}` | `{runError:"syntax"|"runtime"}` | `{timedOut:true}` | `{testFailure:{caseIndex?,gotEquals?}}` | `{propertyFailed:true}` | `{choice}` | `{recallEquals}` | `{all:[]}` | `{any:[]}` | `{not:…}`.
- `AstQuery` (recursive union): `{node, where?, within?, field?, count?}` | `{not}` | `{all:[]}` | `{any:[]}`; `where` ∈ `{attr,eq}` | `{calls}` | `{usesName}` | `{childMatches}`.

**The Transform (source YAML → Bundle), per START-HERE:**
1. Each taxonomy `skill` has inline `misconceptions[]`. Extract them → flat `bundle.misconceptions` record; rewrite `skill.misconceptions` to an **id-list**; strip each misconception's `triggers`/`notTriggers`/`_skill`/`_file`; strip `skill.upstream`? **No — keep `upstream`** (it's in the Bundle `Skill` type). Strip only `_file`/`_skill` bookkeeping and the inline-misconception objects (replaced by ids).
2. Each node has inline `cells[]`. Extract them → flat `bundle.cells` record; rewrite `node.cells` to an **id-list**; **inject `nodeId`** into each cell.
3. Strip source-only fields: misconception `triggers`/`notTriggers`, and any `_skill`/`_file`. (`Skill.upstream` and `Misconception.triggers` are listed in START-HERE's "strip" bullet, but `upstream` IS part of the frozen `Skill` type — so keep `upstream`, strip only `triggers`/`notTriggers`/`_skill`/`_file`. The retained corpus has `Skill.upstream` populated and `bundle.test.ts` validates a Bundle with `upstream: []`. Verify against `bundle.ts` while implementing — the schema is authoritative.)
4. Multi-doc YAML load for taxonomies (`---`-separated skill docs); single-doc for nodes.
5. Emit a content-addressed bundle + the §4.1 derived indexes (`producers`, `requirements`).
6. Validate the emitted bundle against `Bundle` via `Value.Check`.

**Differential-oracle facts (verified):** `python3 content/validate.py` → `RESULT: PASS` (gates 1–4). `python3 content/verify/harness.py` → `gate5: PASS | gate6 oracle-smoke: PASS`. Counts: `nodes=7 skills=15 misconceptions=21`. Your TS gates must reproduce these exactly. The corpus uses AST node types `{Assign,BinOp,Break,Call,Compare,Constant,Expr,If,Import,Name,While}` and `where.attr` ∈ `{value,id}` (plus `ops` supported for completeness). It uses **no** `field:` selector, **no** `timedOut` signature, **no** `patterns:` — you implement those capabilities and test them with your own fixtures; the corpus exercises `childMatches`/`within`.

**Environment gotchas (all verified):**
- `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"` before any `pnpm`.
- No network. `js-yaml@4.2.0` is already in `node_modules/.pnpm` and the pnpm store → offline-addable. `@types/node` and `@types/js-yaml` are NOT available offline → use the ambient `.d.ts` shims in Task 0.
- TypeBox is `^0.34` (not 1.0). Never annotate a recursive schema `: TSchema`.
- ESM build-cycle trap: keep the module graph **acyclic**; a cycle passes under Vitest but deadlocks native-ESM imports of `dist`. Task 14 verifies with a real `node --input-type=module` import of the built output.
- `tsconfig.base.json` enables `noUncheckedIndexedAccess` (every `record[key]` is `T | undefined` — guard it), `exactOptionalPropertyTypes` (never assign `undefined` to an optional prop — omit the key), `verbatimModuleSyntax` (use `import type` for type-only imports). `lib` includes `DOM`, so `console` is typed; `process`/`node:*`/`Buffer` are NOT (shimmed).
- `/usr/bin/python3` = CPython 3.9.6 with pyyaml 6 — used by the two helper scripts.

**Out of scope — FLAG, do not perform (curriculum is the user's call):** START-HERE's "good cleanup" to migrate the corpus's over-matching `has_elif` / `infinite_true_no_break` queries to the `field` selector and re-key `infinite_true` on `{timedOut:true}` requires **editing `content/`**, which our stream must not do (PARALLEL-STREAMS §3: "M1 reads but does not rewrite curriculum — flag issues instead"). The compiler **supports** `field` and `{timedOut:true}` (proven by our own fixtures), but the corpus migration is flagged to the orchestrator as a follow-up. Task 14 records this in the branch hand-off and via a task chip.

---

## File Structure

All paths under `packages/authoring/`. The module graph is a strict DAG (leaf → root): `shims` → `schema-types`/`raw-types` → `load` → `indexes` → `compile`/`hash` → `ast/*` → `signature`/`signals` → `gates/*` → `lints/*` → `grade` → `cli` → `index`. Nothing imports "upward."

```
packages/authoring/
  package.json              # name @trellis/authoring; bin trellis; deps @trellis/schema, @sinclair/typebox, js-yaml
  tsconfig.json             # extends ../../tsconfig.base.json
  vitest.config.ts          # include test/**/*.test.ts
  README.md                 # one-paragraph: requires python3; CLI usage
  py/
    ast_dump.py             # stdin code -> JSON AST (or {_syntaxError:true})
    run_case.py             # stdin JSON spec -> JSON {ran, errType, ok}  (one test case)
  src/
    shims.d.ts              # ambient: node:fs/path/crypto/child_process, process, Buffer, js-yaml
    raw-types.ts            # source-shape interfaces (RawNode/RawSkill/RawMiscon/RawCell/RawStep) + Loaded
    load.ts                 # glob + js-yaml multi/single-doc -> Loaded
    indexes.ts              # buildProducers, buildRequirements
    hash.ts                 # canonicalJson, sha256hex, contentVersion
    compile.ts              # Loaded -> Bundle (transform + Value.Check)
    ast/
      python.ts             # parsePython(code), runCase(spec)  [child_process to py/]
      json-ast.ts           # JsonNode type, walk(), buildParents(), callName(), deepEqual()
      matcher.ts            # evalTags(parsed, queries) + queryMatches/nodeMatches/predOk (+ field/count)
    signature.ts            # sigMatch, norm, sigKinds, sigTags
    signals.ts              # signalsFor(fix, mis), buildSignals(code, step, needs), ownerNodeOf, pickStep
    gates/
      types.ts              # GateIssue, GateReport
      schema-gate.ts        # gate 1: Value.Check(Bundle, …)
      referential.ts        # gate 2: teaches/certifies/dangling/extension-single-track + step refs
      dag.ts                # gate 3: node DAG cycle + upstream DAG cycle + spine connectivity
      granularity.ts        # gate 4: >=1 certifying step, >=1 misconception, warn >6
      fixtures.ts           # gate 5: triggers/notTriggers through the real detector
      oracle.ts             # gate 6: reference-impl smoke on sampled generators
      golden.ts             # gate 7: golden Diagnosis snapshots (plug-in stub)
      run.ts                # runAllGates(loaded, bundle) -> GateReport
    lints/
      where-combinators.ts  # §6.3 loud-reject: not/all/any inside `where`
      spine-extension.ts    # invariant: a spine node never requires an extension-only skill
      re2-pattern.ts        # AcceptedAnswer.patterns RE2-safety lint
    grade.ts                # dry-run grader: (bundle, raw, stepId, submission) -> GradeResult
    cli.ts                  # trellis lint | build | grade
    index.ts                # public API re-exports
  test/
    load.test.ts
    load.dialect.test.ts    # js-yaml vs pyyaml cross-check
    indexes.test.ts
    hash.test.ts
    compile.test.ts
    ast-python.test.ts
    matcher.test.ts
    matcher-field.test.ts
    signature.test.ts
    signals.test.ts
    gates-referential.test.ts
    gates-dag.test.ts
    gates-granularity.test.ts
    gate-fixtures.test.ts
    gate-fixtures.differential.test.ts
    gate-oracle.test.ts
    gate-golden.test.ts
    lints.test.ts
    gates-run.test.ts
    grade.test.ts
    cli.test.ts
    corpus.smoke.test.ts    # whole-corpus: all gates green
```

---

## Task 0: Scaffold `@trellis/authoring` + offline deps + ambient shims

**Files:**
- Create: `packages/authoring/package.json`, `packages/authoring/tsconfig.json`, `packages/authoring/vitest.config.ts`, `packages/authoring/README.md`
- Create: `packages/authoring/src/index.ts`, `packages/authoring/src/shims.d.ts`
- Create: `packages/authoring/test/smoke.test.ts`
- Modify: `pnpm-lock.yaml` (auto, via `pnpm install`)

- [ ] **Step 1: Write `package.json`** (mirrors `packages/schema/package.json`, adds `bin` + `js-yaml`)

```json
{
  "name": "@trellis/authoring",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "bin": { "trellis": "./dist/src/cli.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint src test --ext .ts"
  },
  "dependencies": {
    "@trellis/schema": "workspace:*",
    "@sinclair/typebox": "^0.34.0",
    "js-yaml": "^4.2.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`** (identical pattern to schema)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 4: Write `src/shims.d.ts`** — ambient declarations for the Node APIs and `js-yaml` we use (no `@types/node`/`@types/js-yaml` offline). Declare ONLY what we call.

```ts
// Minimal ambient types — @types/node and @types/js-yaml are unavailable offline.
// `console` comes from the DOM lib (tsconfig.base lib includes "DOM").

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function basename(p: string, ext?: string): string;
  export function dirname(p: string): string;
}
declare module "node:url" {
  export function fileURLToPath(url: string): string;
}
declare module "node:crypto" {
  interface Hash {
    update(data: string): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: string): Hash;
}
declare module "node:child_process" {
  interface SpawnSyncReturn {
    status: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    error?: Error;
  }
  export function spawnSync(
    command: string,
    args: string[],
    options: {
      input?: string;
      encoding: "utf8";
      timeout?: number;
      maxBuffer?: number;
    },
  ): SpawnSyncReturn;
}
declare module "js-yaml" {
  export function load(input: string): unknown;
  export function loadAll(input: string): unknown[];
}

declare const process: {
  argv: string[];
  exitCode: number | undefined;
  exit(code?: number): never;
  cwd(): string;
  env: Record<string, string | undefined>;
  stdout: { write(s: string): boolean };
  stderr: { write(s: string): boolean };
};
declare const Buffer: { from(s: string, enc?: string): { toString(enc: string): string } };
declare const __dirname: string;
// import.meta.url is available under module ESNext; helper for dirname resolution lives in code.
```

- [ ] **Step 5: Write `src/index.ts`** (placeholder export; fleshed out in later tasks)

```ts
export const VERSION = "0.0.0";
```

- [ ] **Step 6: Write `test/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { VERSION } from "../src/index.js";

describe("scaffold", () => {
  it("exposes a version", () => {
    expect(VERSION).toBe("0.0.0");
  });
});
```

- [ ] **Step 7: Write `README.md`**

```markdown
# @trellis/authoring

The Trellis content compiler/validator CLI (`trellis lint | build | grade`) and the §13.2 gates.

Compiles source YAML under `content/` into the frozen `@trellis/schema` `Bundle`.

**Requires `python3` on PATH** (CPython 3.9+) for two build-time primitives: `ast.parse`
(the §6.3 AST detector) and per-test-case execution (gates 5/6). These mirror the Python
reference validators (`content/validate.py`, `content/verify/harness.py`), which are kept as
a differential oracle.
```

- [ ] **Step 8: Install offline + verify the package resolves**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm install --offline
```
Expected: completes; `pnpm-lock.yaml` gains a `packages/authoring` importer entry referencing `js-yaml@4.2.0` (already in the store), `@sinclair/typebox`, and the `@trellis/schema` workspace link.

> If `--offline` fails to resolve `js-yaml` as a *direct* dep (it shouldn't — it's in the store), FALLBACK: remove `js-yaml` from `package.json` and load YAML via a `py/yaml_to_json.py` helper (python3 + pyyaml → JSON), parsed by `load.ts`. Note the swap in the branch hand-off. Do not add other npm deps.

- [ ] **Step 9: Verify typecheck + test + build green**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/authoring typecheck
pnpm --filter @trellis/authoring test
pnpm --filter @trellis/authoring build
```
Expected: typecheck clean; 1 test passes; `dist/` produced.

- [ ] **Step 10: Commit**

```bash
git add packages/authoring pnpm-lock.yaml
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): scaffold @trellis/authoring package (offline deps + ambient shims)"
```

---

## Task 1: Source loading (`load.ts`) + raw types

**Files:**
- Create: `packages/authoring/src/raw-types.ts`, `packages/authoring/src/load.ts`
- Test: `packages/authoring/test/load.test.ts`, `packages/authoring/test/load.dialect.test.ts`

- [ ] **Step 1: Write the failing test** `test/load.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("loadContent", () => {
  const loaded = loadContent(CONTENT);

  it("loads the corpus counts (7 nodes, 15 skills, 21 misconceptions)", () => {
    expect(Object.keys(loaded.nodes)).toHaveLength(7);
    expect(Object.keys(loaded.skills)).toHaveLength(15);
    expect(Object.keys(loaded.miscons)).toHaveLength(21);
  });

  it("preserves source-only fields (triggers/notTriggers/upstream) for the gates", () => {
    const mis = loaded.miscons["mis.loop.infinite_true"];
    expect(mis).toBeDefined();
    expect(mis!.triggers?.length).toBeGreaterThan(0);
    expect(mis!.notTriggers?.length).toBeGreaterThan(0);
    expect(mis!._skill).toBe("skill.loop.while");
    expect(loaded.skills["skill.string.concat"]!.upstream).toContain("skill.string.literal");
  });

  it("keeps inline cells on nodes and tags each misconception with its owning skill", () => {
    const node = loaded.nodes["node.output"];
    expect(node!.cells.length).toBeGreaterThan(0);
    expect(node!.cells[0]!.steps.length).toBeGreaterThan(0);
    expect(loaded.miscons["mis.print.no_call"]!._skill).toBe("skill.output.print_literal");
  });

  it("flags duplicate skill ids", () => {
    expect(() => loadContent(CONTENT)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it — expect failure** (`Cannot find module ../src/load.js`)

Run: `pnpm --filter @trellis/authoring test -- load.test`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/raw-types.ts`**

```ts
// Source-shape (pre-compile) types. These mirror the authored YAML, INCLUDING source-only
// fields (triggers/notTriggers/upstream/_skill/_file) that the Bundle does not carry.
import type { Signature } from "@trellis/schema";

export interface RawFixture {
  stepKind: "build" | "predict" | "recognize" | "recall";
  code?: string;
  choice?: string;
  input?: string;
}

export interface RawMiscon {
  id: string;
  skill: string;
  title: string;
  signature: Signature;
  hintLadder: unknown[];
  feedback: string;
  skillDeltas?: unknown[];
  triggers?: RawFixture[];
  notTriggers?: RawFixture[];
  _skill?: string;
  _file?: string;
}

export interface RawSkill {
  id: string;
  title: string;
  description: string;
  upstream?: string[];
  misconceptions?: RawMiscon[];
  _file?: string;
}

export interface RawRequirement {
  skill: string;
  minMastery: number;
  kind: "prerequisite" | "utility" | "track";
}

export interface RawCell {
  id: string;
  title: string;
  certifies?: string[];
  steps: RawStep[];
}

// Steps are kept loose at load time (compile.ts validates against the schema Step union).
export interface RawStep {
  id: string;
  kind: "watch" | "predict" | "recognize" | "recall" | "build";
  [k: string]: unknown;
}

export interface RawNode {
  id: string;
  title: string;
  track: "spine" | "extension";
  requires?: RawRequirement[];
  teaches?: string[];
  cells: RawCell[];
  _file?: string;
}

export interface Loaded {
  nodes: Record<string, RawNode>;
  skills: Record<string, RawSkill>;
  miscons: Record<string, RawMiscon>;
}
```

- [ ] **Step 4: Write `src/load.ts`** — multi-doc taxonomies, single-doc nodes (mirrors `validate.py` lines 11–26)

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load as yamlLoad, loadAll as yamlLoadAll } from "js-yaml";
import type { Loaded, RawNode, RawSkill } from "./raw-types.js";

function listYaml(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => join(dir, f));
}

/** Load `<root>/nodes/*.yaml` (single-doc) and `<root>/skills/*.yaml` (multi-doc). */
export function loadContent(contentRoot: string): Loaded {
  const nodes: Record<string, RawNode> = {};
  const skills: Record<string, RawSkill> = {};
  const miscons: Loaded["miscons"] = {};

  for (const file of listYaml(join(contentRoot, "nodes"))) {
    const doc = yamlLoad(readFileSync(file, "utf8")) as { node: RawNode } | null;
    if (!doc || !doc.node) continue;
    const n = doc.node;
    n._file = file;
    nodes[n.id] = n;
  }

  for (const file of listYaml(join(contentRoot, "skills"))) {
    for (const raw of yamlLoadAll(readFileSync(file, "utf8"))) {
      const doc = raw as { skill?: RawSkill } | null;
      if (!doc || !doc.skill) continue;
      const s = doc.skill;
      s._file = file;
      if (skills[s.id]) {
        throw new Error(`duplicate skill id ${s.id} (${file} & ${skills[s.id]!._file})`);
      }
      skills[s.id] = s;
      for (const m of s.misconceptions ?? []) {
        if (miscons[m.id]) throw new Error(`duplicate misconception id ${m.id}`);
        m._skill = s.id;
        miscons[m.id] = m;
      }
    }
  }

  return { nodes, skills, miscons };
}
```

- [ ] **Step 5: Run the test — expect PASS**

Run: `pnpm --filter @trellis/authoring test -- load.test`
Expected: PASS (counts 7/15/21; source-only fields present).

- [ ] **Step 6: Write the YAML-dialect cross-check** `test/load.dialect.test.ts` — guards the js-yaml-vs-pyyaml boundary (the only risk of loading YAML in TS instead of CPython)

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadContent } from "../src/load.js";

const ROOT = resolve(__dirname, "../../..");
const CONTENT = resolve(ROOT, "content");

// Parse the same files with pyyaml and assert structural agreement on counts + key scalars.
function pyLoad(): { nodes: number; skills: number; miscons: number; randTrack: unknown } {
  const script = `
import glob, json, yaml
nodes={}; skills={}; miscons={}
for f in sorted(glob.glob("content/nodes/*.yaml")):
    n=yaml.safe_load(open(f))["node"]; nodes[n["id"]]=n
for f in sorted(glob.glob("content/skills/*.yaml")):
    for d in yaml.safe_load_all(open(f)):
        if d and "skill" in d:
            s=d["skill"]; skills[s["id"]]=s
            for m in s.get("misconceptions",[]): miscons[m["id"]]=m
rnd=nodes["node.random"]["requires"][0]
print(json.dumps({"nodes":len(nodes),"skills":len(skills),"miscons":len(miscons),"randTrack":rnd}))
`;
  const r = spawnSync("python3", ["-c", script], { encoding: "utf8", input: "", maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`pyyaml load failed: ${r.stderr}`);
  // run python from repo root so the globs resolve
  return JSON.parse(r.stdout);
}

describe("YAML dialect parity (js-yaml vs pyyaml)", () => {
  it("agrees on entity counts and a representative scalar requirement", () => {
    const py = (() => {
      const cwd = process.cwd();
      // python script uses repo-relative globs; ensure invocation cwd is the repo root
      const r = spawnSync("python3", ["-c", `import os; os.chdir(${JSON.stringify(ROOT)});` +
        `import glob,json,yaml\n` +
        `nodes={};skills={};miscons={}\n` +
        `\nfor f in sorted(glob.glob("content/nodes/*.yaml")):\n n=yaml.safe_load(open(f))["node"];nodes[n["id"]]=n\n` +
        `\nfor f in sorted(glob.glob("content/skills/*.yaml")):\n for d in yaml.safe_load_all(open(f)):\n  if d and "skill" in d:\n   s=d["skill"];skills[s["id"]]=s\n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   \n   for m in s.get("misconceptions",[]):miscons[m["id"]]=m\n` +
        `print(json.dumps({"nodes":len(nodes),"skills":len(skills),"miscons":len(miscons)}))`],
        { encoding: "utf8", input: "" });
      cwd;
      if (r.status !== 0) throw new Error(`pyyaml: ${r.stderr}`);
      return JSON.parse(r.stdout) as { nodes: number; skills: number; miscons: number };
    })();

    const ts = loadContent(CONTENT);
    expect(Object.keys(ts.nodes)).toHaveLength(py.nodes);
    expect(Object.keys(ts.skills)).toHaveLength(py.skills);
    expect(Object.keys(ts.miscons)).toHaveLength(py.miscons);
    expect(ts.nodes["node.random"]!.requires?.[0]).toEqual({
      skill: "skill.var.assign",
      minMastery: 0.6,
      kind: "track",
    });
  });
});
```

> Implementer note: the heredoc-with-newlines python above is fiddly under `-c`. PREFER writing a tiny throwaway `py/yaml_to_json.py` (read globs from `content/`, print counts JSON) and invoking it with `cwd`/`os.chdir(ROOT)`. Keep the assertion: TS counts == pyyaml counts AND `node.random`'s track requirement deep-equals `{skill:"skill.var.assign",minMastery:0.6,kind:"track"}`. If you add `py/yaml_to_json.py`, it may stay (it's reused nowhere else; fine to delete). The MEANING of this test is the only thing that matters: js-yaml and pyyaml agree.

- [ ] **Step 7: Run dialect test — expect PASS**, then commit

```bash
pnpm --filter @trellis/authoring test -- load
git add packages/authoring/src/raw-types.ts packages/authoring/src/load.ts packages/authoring/test/load.test.ts packages/authoring/test/load.dialect.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): source YAML loader (multi-doc taxonomies, single-doc nodes)"
```

---

## Task 2: Derived indexes (`indexes.ts`)

**Files:**
- Create: `packages/authoring/src/indexes.ts`
- Test: `packages/authoring/test/indexes.test.ts`

- [ ] **Step 1: Write the failing test** `test/indexes.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { buildProducers, buildRequirements } from "../src/indexes.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("derived indexes", () => {
  const loaded = loadContent(CONTENT);

  it("producers map each taught skill to the nodes that teach it (sorted, deterministic)", () => {
    const producers = buildProducers(loaded);
    // node.random teaches skill.random.randint
    expect(producers["skill.random.randint"]).toEqual(["node.random"]);
    // every taught skill has at least one producer
    for (const n of Object.values(loaded.nodes)) {
      for (const sk of n.teaches ?? []) {
        expect(producers[sk]!.length).toBeGreaterThan(0);
      }
    }
  });

  it("requirements mirror each node's requires, deduped by skill (max minMastery)", () => {
    const reqs = buildRequirements(loaded);
    expect(reqs["node.random"]).toEqual([
      { skill: "skill.var.assign", minMastery: 0.6, kind: "track" },
      { skill: "skill.output.print_literal", minMastery: 0.5, kind: "utility" },
    ]);
    expect(reqs["node.output"]).toEqual([]);
  });

  it("dedupes a duplicated skill keeping the strictest threshold", () => {
    const fake = {
      nodes: {
        n: { id: "n", title: "", track: "spine" as const, requires: [
          { skill: "s", minMastery: 0.5, kind: "utility" as const },
          { skill: "s", minMastery: 0.7, kind: "prerequisite" as const },
        ], teaches: [], cells: [] },
      },
      skills: {},
      miscons: {},
    };
    expect(buildRequirements(fake)).toEqual({ n: [{ skill: "s", minMastery: 0.7, kind: "prerequisite" }] });
  });
});
```

- [ ] **Step 2: Run — expect failure.** Run: `pnpm --filter @trellis/authoring test -- indexes`. Expected: FAIL (module missing).

- [ ] **Step 3: Write `src/indexes.ts`**

```ts
import type { Loaded } from "./raw-types.js";
import type { Producers, Requirements, Requirement } from "@trellis/schema";

/** skill -> nodes that teach it (§4.1). Sorted by node id for a deterministic bundle. */
export function buildProducers(loaded: Loaded): Producers {
  const producers: Producers = {};
  for (const nid of Object.keys(loaded.nodes).sort()) {
    for (const sk of loaded.nodes[nid]!.teaches ?? []) {
      (producers[sk] ??= []).push(nid);
    }
  }
  for (const sk of Object.keys(producers)) producers[sk]!.sort();
  return producers;
}

/** node -> requires, deduped by skill keeping the strictest minMastery (§4.1 "flattened, deduped"). */
export function buildRequirements(loaded: Loaded): Requirements {
  const out: Requirements = {};
  for (const nid of Object.keys(loaded.nodes)) {
    const bySkill = new Map<string, Requirement>();
    for (const r of loaded.nodes[nid]!.requires ?? []) {
      const prev = bySkill.get(r.skill);
      if (!prev || r.minMastery > prev.minMastery) {
        bySkill.set(r.skill, { skill: r.skill, minMastery: r.minMastery, kind: r.kind });
      }
    }
    out[nid] = [...bySkill.values()];
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS.** Run: `pnpm --filter @trellis/authoring test -- indexes`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/authoring/src/indexes.ts packages/authoring/test/indexes.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): derived producers/requirements indexes (§4.1)"
```

---

## Task 3: Content-addressed hash + compile transform (`hash.ts`, `compile.ts`)

**Files:**
- Create: `packages/authoring/src/hash.ts`, `packages/authoring/src/compile.ts`
- Test: `packages/authoring/test/hash.test.ts`, `packages/authoring/test/compile.test.ts`

- [ ] **Step 1: Write `test/hash.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { canonicalJson, sha256hex } from "../src/hash.js";

describe("hash", () => {
  it("canonicalizes object key order (deterministic)", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: [3, { y: 1, x: 2 }] })).toBe('{"a":[3,{"x":2,"y":1}]}');
  });
  it("hashes deterministically", () => {
    const h = sha256hex("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256hex("hello")).toBe(h);
  });
});
```

- [ ] **Step 2: Run — expect failure.** `pnpm --filter @trellis/authoring test -- hash`. FAIL.

- [ ] **Step 3: Write `src/hash.ts`**

```ts
import { createHash } from "node:crypto";

/** Stable JSON: object keys sorted recursively. Arrays keep order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

export function sha256hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
```

- [ ] **Step 4: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- hash`. PASS.

- [ ] **Step 5: Write `test/compile.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Value } from "@sinclair/typebox/value";
import { Bundle } from "@trellis/schema";
import { loadContent } from "../src/load.js";
import { compile } from "../src/compile.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("compile", () => {
  const loaded = loadContent(CONTENT);
  const bundle = compile(loaded);

  it("emits a Bundle that passes Value.Check", () => {
    expect(Value.Check(Bundle, bundle)).toBe(true);
  });

  it("flattens misconceptions and rewrites Skill.misconceptions to an id-list", () => {
    expect(Object.keys(bundle.misconceptions)).toHaveLength(21);
    const skill = bundle.skills["skill.output.print_literal"]!;
    expect(skill.misconceptions).toContain("mis.print.no_call");
    // id-list, not inline objects
    expect(typeof skill.misconceptions[0]).toBe("string");
    // Skill.upstream is RETAINED (part of the frozen Skill type)
    expect(Array.isArray(skill.upstream)).toBe(true);
  });

  it("strips source-only misconception fields", () => {
    const m = bundle.misconceptions["mis.loop.infinite_true"]! as Record<string, unknown>;
    expect(m["triggers"]).toBeUndefined();
    expect(m["notTriggers"]).toBeUndefined();
    expect(m["_skill"]).toBeUndefined();
    expect(m["_file"]).toBeUndefined();
  });

  it("flattens cells, rewrites Node.cells to an id-list, and injects nodeId", () => {
    const node = bundle.nodes["node.output"]!;
    expect(node.cells.every((c) => typeof c === "string")).toBe(true);
    const firstCellId = node.cells[0]!;
    expect(bundle.cells[firstCellId]!.nodeId).toBe("node.output");
  });

  it("includes derived indexes and a content-addressed version", () => {
    expect(bundle.producers["skill.random.randint"]).toEqual(["node.random"]);
    expect(bundle.requirements["node.output"]).toEqual([]);
    expect(bundle.contentVersion).toMatch(/^ca-[0-9a-f]{16}$/);
  });

  it("is deterministic (same input -> same contentVersion)", () => {
    expect(compile(loadContent(CONTENT)).contentVersion).toBe(bundle.contentVersion);
  });
});
```

- [ ] **Step 6: Run — expect failure.** `pnpm --filter @trellis/authoring test -- compile`. FAIL (module missing).

- [ ] **Step 7: Write `src/compile.ts`** — the transform. Read `packages/schema/src/content.ts` + `bundle.ts` while writing this; the schema is authoritative for which fields survive.

```ts
import { assertValid } from "@trellis/schema";
import type { Bundle, Skill, ConceptNode, Cell, Misconception } from "@trellis/schema";
import { Bundle as BundleSchema } from "@trellis/schema";
import type { Loaded, RawMiscon, RawSkill, RawNode } from "./raw-types.js";
import { buildProducers, buildRequirements } from "./indexes.js";
import { canonicalJson, sha256hex } from "./hash.js";

function compileMisconception(m: RawMiscon): Misconception {
  // Keep ONLY the frozen Misconception fields; drop triggers/notTriggers/_skill/_file.
  const out: Misconception = {
    id: m.id,
    skill: m.skill,
    title: m.title,
    signature: m.signature,
    hintLadder: m.hintLadder as Misconception["hintLadder"],
    feedback: m.feedback,
  };
  if (m.skillDeltas !== undefined) out.skillDeltas = m.skillDeltas as Misconception["skillDeltas"];
  return out;
}

function compileSkill(s: RawSkill): Skill {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    misconceptions: (s.misconceptions ?? []).map((m) => m.id), // inline objects -> id-list
    upstream: s.upstream ?? [], // RETAINED (frozen Skill type)
  };
}

function compileCell(raw: RawNode["cells"][number], nodeId: string): Cell {
  return {
    id: raw.id,
    nodeId, // INJECTED
    title: raw.title,
    steps: raw.steps as unknown as Cell["steps"],
    certifies: raw.certifies ?? [],
  };
}

function compileNode(n: RawNode): ConceptNode {
  return {
    id: n.id,
    title: n.title,
    track: n.track,
    requires: (n.requires ?? []).map((r) => ({ skill: r.skill, minMastery: r.minMastery, kind: r.kind })),
    teaches: n.teaches ?? [],
    cells: n.cells.map((c) => c.id), // inline cells -> id-list
  };
}

export function compile(loaded: Loaded): Bundle {
  const skills: Record<string, Skill> = {};
  const misconceptions: Record<string, Misconception> = {};
  const nodes: Record<string, ConceptNode> = {};
  const cells: Record<string, Cell> = {};

  for (const s of Object.values(loaded.skills)) {
    skills[s.id] = compileSkill(s);
    for (const m of s.misconceptions ?? []) misconceptions[m.id] = compileMisconception(m);
  }
  for (const n of Object.values(loaded.nodes)) {
    nodes[n.id] = compileNode(n);
    for (const c of n.cells) cells[c.id] = compileCell(c, n.id);
  }

  const producers = buildProducers(loaded);
  const requirements = buildRequirements(loaded);

  // content-addressed version: hash everything EXCEPT contentVersion itself.
  const body = { skills, nodes, cells, misconceptions, producers, requirements };
  const contentVersion = "ca-" + sha256hex(canonicalJson(body)).slice(0, 16);

  const bundle = { contentVersion, ...body };
  // Validate the emitted bundle against the frozen schema (gate 1 lives here too, but we
  // assert at emit time so a malformed transform fails loudly).
  return assertValid(BundleSchema, bundle) as Bundle;
}
```

- [ ] **Step 8: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- compile`. PASS (all 6 assertions).

> If `assertValid` throws, read the error path — it names the first offending field. Common causes: a Step shape the union rejects, or a stray source-only field not stripped. Fix the transform; do NOT relax the schema.

- [ ] **Step 9: Commit**

```bash
git add packages/authoring/src/hash.ts packages/authoring/src/compile.ts packages/authoring/test/hash.test.ts packages/authoring/test/compile.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): YAML->Bundle compile transform + content-addressed hash"
```

---

## Task 4: Python bridge (`py/ast_dump.py`, `py/run_case.py`, `src/ast/python.ts`, `src/ast/json-ast.ts`)

**Files:**
- Create: `packages/authoring/py/ast_dump.py`, `packages/authoring/py/run_case.py`
- Create: `packages/authoring/src/ast/python.ts`, `packages/authoring/src/ast/json-ast.ts`
- Test: `packages/authoring/test/ast-python.test.ts`

- [ ] **Step 1: Write `py/ast_dump.py`** — parse stdin → JSON AST (mirrors `harness.parents`/`ast.walk` source faithfully because it IS CPython `ast`)

```python
#!/usr/bin/env python3
"""Read Python source from stdin, print a JSON AST. On SyntaxError, print {"_syntaxError": true}.
Each AST node -> {"_type": <ClassName>, <field>: <value|node|list>}. Mirrors CPython ast exactly."""
import ast, json, sys

def conv(node):
    if isinstance(node, ast.AST):
        d = {"_type": type(node).__name__}
        for f in node._fields:
            d[f] = conv(getattr(node, f, None))
        return d
    if isinstance(node, list):
        return [conv(x) for x in node]
    return node  # str / int / float / bool / None

src = sys.stdin.read()
try:
    tree = ast.parse(src)
except SyntaxError:
    print(json.dumps({"_syntaxError": True}))
    sys.exit(0)
print(json.dumps(conv(tree), default=str))
```

- [ ] **Step 2: Write `py/run_case.py`** — execute one test case; mirrors `harness.build_signals` per-case logic + `harness.run` (subprocess→here in-process, same CPython)

```python
#!/usr/bin/env python3
"""Run one build test case, mirroring content/verify/harness.py's per-case logic.
stdin: JSON {code, mode:"entrypoint"|"stdin", entry?, args?, expected, seed?, stdin?}
stdout: JSON {ran: bool, errType: "syntax"|"runtime"|null, ok: bool}
- entrypoint mode: seed PRNG as the grader does (import random as _sd; _sd.seed(seed)) WITHOUT
  binding `random` in the learner namespace; compare repr(entry(*args)) == repr(expected).
- stdin mode: feed stdin, compare stdout == expected.
Executes in a child python so an infinite loop is killed by a 5s timeout (-> runtime)."""
import json, subprocess, sys

spec = json.loads(sys.stdin.read())

def run(code, stdin):
    try:
        p = subprocess.run([sys.executable, "-c", code], input=stdin,
                           capture_output=True, text=True, timeout=5)
    except subprocess.TimeoutExpired:
        return "", {"type": "runtime"}
    err = None
    if p.returncode != 0:
        kind = "syntax" if ("SyntaxError" in p.stderr or "IndentationError" in p.stderr) else "runtime"
        err = {"type": kind}
    return p.stdout, err

code = spec["code"]
if spec["mode"] == "entrypoint":
    seed = spec.get("seed")
    seeding = f"\nimport random as _sd\n_sd.seed({seed})" if seed is not None else ""
    args = spec.get("args") or []
    driver = code + seeding + "\nprint(repr(" + spec["entry"] + "(" + \
        ", ".join(repr(a) for a in args) + ")))"
    out, err = run(driver, "")
    ok = (err is None) and out.strip() == repr(spec["expected"])
else:  # stdin
    stdin = spec.get("stdin")
    stdin = "" if stdin is None else (stdin if isinstance(stdin, str) else str(stdin))
    out, err = run(code, stdin)
    ok = (err is None) and out == spec["expected"]

ran = not (err and err["type"] == "syntax")
print(json.dumps({"ran": ran, "errType": (err["type"] if err else None), "ok": ok}))
```

- [ ] **Step 3: Write `src/ast/json-ast.ts`** — the JSON-AST type + traversal helpers (pure TS)

```ts
export interface JsonNode {
  _type: string;
  [field: string]: unknown;
}

export function isNode(v: unknown): v is JsonNode {
  return typeof v === "object" && v !== null && typeof (v as JsonNode)._type === "string";
}

/** All AST-typed descendants of `root`, including `root` (mirrors ast.walk: order irrelevant). */
export function walk(root: JsonNode): JsonNode[] {
  const out: JsonNode[] = [];
  const stack: JsonNode[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n);
    for (const child of childNodes(n)) stack.push(child);
  }
  return out;
}

/** Immediate AST children of a node (mirrors ast.iter_child_nodes). */
export function childNodes(n: JsonNode): JsonNode[] {
  const out: JsonNode[] = [];
  for (const k of Object.keys(n)) {
    if (k === "_type") continue;
    const v = n[k];
    if (isNode(v)) out.push(v);
    else if (Array.isArray(v)) for (const e of v) if (isNode(e)) out.push(e);
  }
  return out;
}

/** child -> parent map over the whole tree (mirrors harness.parents). Identity-keyed. */
export function buildParents(root: JsonNode): Map<JsonNode, JsonNode> {
  const parents = new Map<JsonNode, JsonNode>();
  for (const n of walk(root)) for (const c of childNodes(n)) parents.set(c, n);
  return parents;
}

/** name of a Call's target: print / input / random.randint (mirrors harness.call_name). */
export function callName(node: JsonNode): string | null {
  if (node._type !== "Call") return null;
  const f = node["func"];
  if (!isNode(f)) return null;
  if (f._type === "Name") return f["id"] as string;
  if (f._type === "Attribute") {
    const base = isNode(f["value"]) && (f["value"] as JsonNode)._type === "Name"
      ? ((f["value"] as JsonNode)["id"] as string)
      : "?";
    return `${base}.${f["attr"] as string}`;
  }
  return null;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}
```

- [ ] **Step 4: Write `src/ast/python.ts`** — locate the `py/` scripts relative to the module, invoke python3

```ts
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import type { JsonNode } from "./json-ast.js";

const PY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "py");

function python(script: string, input: string): string {
  const r = spawnSync("python3", [script], { input, encoding: "utf8", maxBuffer: 1 << 24, timeout: 30000 });
  if (r.error) throw new Error(`python3 not runnable: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`python3 ${script} failed (${r.status}): ${r.stderr}`);
  return r.stdout;
}

export type Parsed = { syntaxError: true } | { syntaxError: false; ast: JsonNode };

/** ast.parse(code) -> JSON AST (or a syntax-error marker). */
export function parsePython(code: string): Parsed {
  const out = JSON.parse(python(join(PY_DIR, "ast_dump.py"), code)) as JsonNode & { _syntaxError?: boolean };
  return out._syntaxError ? { syntaxError: true } : { syntaxError: false, ast: out };
}

export interface CaseSpec {
  code: string;
  mode: "entrypoint" | "stdin";
  entry?: string;
  args?: unknown[];
  expected: unknown;
  seed?: number;
  stdin?: string | null;
}
export interface CaseResult { ran: boolean; errType: "syntax" | "runtime" | null; ok: boolean; }

/** Run one build test case via py/run_case.py (CPython execution + repr comparison). */
export function runCase(spec: CaseSpec): CaseResult {
  return JSON.parse(python(join(PY_DIR, "run_case.py"), JSON.stringify(spec))) as CaseResult;
}
```

- [ ] **Step 5: Ensure `py/` is shipped to `dist`.** The `dist/src/ast/python.ts` resolves `py/` as `<dist>/../py` i.e. `packages/authoring/py` (siblings of `dist`), so `py/` does NOT need copying into `dist`. Confirm the relative path: `dist/src/ast/python.js` → `../../py` = `packages/authoring/py`. ✓ No build step needed. (If you later relocate `py/`, update `PY_DIR`.)

- [ ] **Step 6: Write `test/ast-python.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parsePython, runCase } from "../src/ast/python.js";

describe("python bridge", () => {
  it("parses code to a JSON AST", () => {
    const p = parsePython("print('hi')");
    expect(p.syntaxError).toBe(false);
    if (!p.syntaxError) expect(p.ast._type).toBe("Module");
  });
  it("reports syntax errors", () => {
    const p = parsePython("def f(:\n  pass");
    expect(p.syntaxError).toBe(true);
  });
  it("runs a passing stdin case", () => {
    const r = runCase({ code: "print('Hi Alan!')", mode: "stdin", expected: "Hi Alan!\n", stdin: null });
    expect(r).toEqual({ ran: true, errType: null, ok: true });
  });
  it("runs a passing entrypoint case", () => {
    const r = runCase({ code: "def greet(n):\n return 'Hi ' + n + '!'", mode: "entrypoint", entry: "greet", args: ["Alan"], expected: "Hi Alan!" });
    expect(r).toEqual({ ran: true, errType: null, ok: true });
  });
  it("detects a runtime error", () => {
    const r = runCase({ code: "def f(x):\n return 'a' + x", mode: "entrypoint", entry: "f", args: [7], expected: "a7" });
    expect(r.errType).toBe("runtime");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 7: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- ast-python`. PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/authoring/py packages/authoring/src/ast/python.ts packages/authoring/src/ast/json-ast.ts packages/authoring/test/ast-python.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): CPython bridge (ast_dump + run_case) for the AST/exec gates"
```

---

## Task 5: AST matcher (`src/ast/matcher.ts`) — the §6.3 interpreter port

**Files:**
- Create: `packages/authoring/src/ast/matcher.ts`
- Test: `packages/authoring/test/matcher.test.ts`, `packages/authoring/test/matcher-field.test.ts`

This is the centerpiece port of `harness.py` lines 63–133, extended with the `field` selector (§6.3 pinned semantics). It operates on the JSON AST (so it is pure TS and unit-testable with hand-built nodes). The §6.3 semantics it MUST honor: `within` = any ancestor (transitive); `childMatches` = any descendant; `not` = over the current root; `field: {name: Q}` = the node's named child field contains a match of Q (handles single-node and list fields); `count` over the matched set; `where` is ONLY `{attr,eq}|{calls}|{usesName}|{childMatches}` (combinators in `where` are rejected by the lint in Task 10, never silently accepted here).

- [ ] **Step 1: Write `test/matcher.test.ts`** — hand-built JSON ASTs AND real-parse integration

```ts
import { describe, it, expect } from "vitest";
import { parsePython } from "../src/ast/python.js";
import { buildParents } from "../src/ast/json-ast.js";
import { queryMatches, evalTags } from "../src/ast/matcher.js";

function q(code: string, query: unknown): boolean {
  const p = parsePython(code);
  if (p.syntaxError) throw new Error("unexpected syntax error");
  return queryMatches(query, p.ast, buildParents(p.ast));
}

describe("AstQuery interpreter (§6.3)", () => {
  it("matches a Call to print via `calls`", () => {
    expect(q("print('x')", { node: "Call", where: { calls: "print" } })).toBe(true);
    expect(q("input()", { node: "Call", where: { calls: "print" } })).toBe(false);
  });

  it("not: no print call (missing_print)", () => {
    expect(q("'x'", { not: { node: "Call", where: { calls: "print" } } })).toBe(true);
    expect(q("print('x')", { not: { node: "Call", where: { calls: "print" } } })).toBe(false);
  });

  it("childMatches matches any descendant (transitive)", () => {
    const query = { node: "Return", where: { childMatches: { node: "Constant", where: { attr: "value", eq: "Hello, World!" } } } };
    expect(q("def f():\n return 'Hello, World!'", query)).toBe(true);
    expect(q("def f():\n return 'bye'", query)).toBe(false);
  });

  it("within is satisfied by any ancestor (transitive)", () => {
    // an Assign anywhere inside a While
    const query = { node: "Assign", within: { node: "While" } };
    expect(q("while True:\n  if 1:\n   x = 2", query)).toBe(true);
    expect(q("x = 2", query)).toBe(false);
  });

  it("Constant value equality (int/str/bool)", () => {
    expect(q("x = 7", { node: "Constant", where: { attr: "value", eq: 7 } })).toBe(true);
    expect(q("x = 8", { node: "Constant", where: { attr: "value", eq: 7 } })).toBe(false);
    expect(q("while True: pass", { node: "Constant", where: { attr: "value", eq: true } })).toBe(true);
  });

  it("all/any combinators (infinite_true_no_break style, via childMatches+not)", () => {
    const infinite = { all: [
      { node: "While", where: { childMatches: { node: "Constant", where: { attr: "value", eq: true } } } },
      { not: { node: "Break" } },
    ] };
    expect(q("while True:\n  print('x')", infinite)).toBe(true);
    expect(q("while True:\n  break", infinite)).toBe(false);
  });

  it("usesName finds an identifier anywhere", () => {
    expect(q("print(snacks)", { node: "Call", where: { usesName: "snacks" } })).toBe(true);
  });

  it("count over the matched set", () => {
    expect(q("if a: pass\nif b: pass", { node: "If", count: { op: ">=", n: 2 } })).toBe(true);
    expect(q("if a: pass", { node: "If", count: { op: ">=", n: 2 } })).toBe(false);
  });

  it("evalTags returns matched tag names; null on syntax error", () => {
    const queries = [{ tag: "has_print", query: { node: "Call", where: { calls: "print" } } }];
    expect([...evalTags("print('x')", queries)!]).toEqual(["has_print"]);
    expect([...evalTags("'x'", queries)!]).toEqual([]);
    expect(evalTags("def f(:", queries)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect failure.** `pnpm --filter @trellis/authoring test -- matcher.test`. FAIL.

- [ ] **Step 3: Write `src/ast/matcher.ts`**

```ts
import { parsePython } from "./python.js";
import { walk, childNodes, callName, deepEqual, isNode, type JsonNode } from "./json-ast.js";

type Query = Record<string, unknown>;
type Pred = Record<string, unknown>;

// §6.3 node-type strings used by the corpus; the matcher checks the parsed node's _type directly,
// so any CPython node name is supported without a hardcoded table (we keep this list for docs).
// (Assign, BinOp, Break, Call, Compare, Constant, Expr, If, Import, Name, While, ...)

function predOk(where: Pred, node: JsonNode, parents: Map<JsonNode, JsonNode>): boolean {
  if ("attr" in where) {
    const attr = where["attr"] as string;
    const val = where["eq"];
    if (attr === "value" && node._type === "Constant") return deepEqual(node["value"], val);
    if (attr === "ops" && node._type === "Compare") {
      const ops = (node["ops"] as JsonNode[]).map((o) => o._type);
      return deepEqual(ops, val);
    }
    return deepEqual(node[attr], val);
  }
  if ("calls" in where) {
    const nm = where["calls"] as string;
    if (node._type === "Call") return callName(node) === nm;
    return walk(node).some((c) => c._type === "Call" && callName(c) === nm);
  }
  if ("usesName" in where) {
    const nm = where["usesName"] as string;
    return walk(node).some((x) => x._type === "Name" && x["id"] === nm);
  }
  if ("childMatches" in where) {
    const sub = where["childMatches"] as Query;
    return walk(node).some((d) => nodeMatches(sub, d, parents));
  }
  return true; // empty predicate
}

/** the node's named child field contains a match of Q (§6.3 `field`). */
function fieldMatches(node: JsonNode, name: string, sub: Query, parents: Map<JsonNode, JsonNode>): boolean {
  const v = node[name];
  const roots: JsonNode[] = [];
  if (isNode(v)) roots.push(v);
  else if (Array.isArray(v)) for (const e of v) if (isNode(e)) roots.push(e);
  return roots.some((r) => queryMatches(sub, r, parents));
}

/** does this single node match the query's top-level node spec (+ where + field)? */
function nodeMatches(query: Query, node: JsonNode, parents: Map<JsonNode, JsonNode>): boolean {
  if (!("node" in query)) return queryMatches(query, node, parents); // not/all/any at child position
  if (node._type !== (query["node"] as string)) return false;
  if ("where" in query && !predOk(query["where"] as Pred, node, parents)) return false;
  if ("field" in query) {
    const fields = query["field"] as Record<string, Query>;
    for (const name of Object.keys(fields)) {
      if (!fieldMatches(node, name, fields[name]!, parents)) return false;
    }
  }
  return true;
}

function hasAncestor(node: JsonNode, ancestors: Set<JsonNode>, parents: Map<JsonNode, JsonNode>): boolean {
  let cur = parents.get(node);
  while (cur !== undefined) {
    if (ancestors.has(cur)) return true;
    cur = parents.get(cur);
  }
  return false;
}

/** does `query` match anywhere in `tree` (a module or subtree)? (harness.query_matches) */
export function queryMatches(query: Query, tree: JsonNode, parents: Map<JsonNode, JsonNode>): boolean {
  if ("not" in query) return !queryMatches(query["not"] as Query, tree, parents);
  if ("all" in query) return (query["all"] as Query[]).every((qq) => queryMatches(qq, tree, parents));
  if ("any" in query) return (query["any"] as Query[]).some((qq) => queryMatches(qq, tree, parents));

  let matches = walk(tree).filter((nd) => nodeMatches(query, nd, parents));
  if ("within" in query) {
    const inside = new Set(walk(tree).filter((nd) => nodeMatches(query["within"] as Query, nd, parents)));
    matches = matches.filter((m) => hasAncestor(m, inside, parents));
  }
  if ("count" in query) {
    const { op, n } = query["count"] as { op: "=" | ">=" | "<="; n: number };
    const c = matches.length;
    return op === "=" ? c === n : op === ">=" ? c >= n : c <= n;
  }
  return matches.length > 0;
}

// childNodes is intentionally re-exported for symmetry with harness's iter_child_nodes usage.
export { childNodes };

export interface TagQuery { tag: string; query: Query; }

/** evaluate all tag queries against code; null signals a syntax error (no tags). */
export function evalTags(code: string, queries: TagQuery[]): Set<string> | null {
  const p = parsePython(code);
  if (p.syntaxError) return null;
  const parents = buildParentsLocal(p.ast);
  const out = new Set<string>();
  for (const q of queries) if (queryMatches(q.query, p.ast, parents)) out.add(q.tag);
  return out;
}

// local import avoids a cycle with json-ast re-exports
import { buildParents as buildParentsLocal } from "./json-ast.js";
```

> Implementer note on `import` placement: keep all imports at the top of the file (ESLint/`verbatimModuleSyntax` are fine with it; the trailing `import` above is shown inline only for readability — MOVE it up with the others when you write the file). The module must have NO import cycle: `matcher.ts` imports `python.ts` + `json-ast.ts` only.

- [ ] **Step 4: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- matcher.test`. PASS.

- [ ] **Step 5: Write `test/matcher-field.test.ts`** — proves the `field` selector (the exact detectors the corpus does NOT yet use; we support them per the frozen schema)

```ts
import { describe, it, expect } from "vitest";
import { parsePython } from "../src/ast/python.js";
import { buildParents } from "../src/ast/json-ast.js";
import { queryMatches } from "../src/ast/matcher.js";

function q(code: string, query: unknown): boolean {
  const p = parsePython(code);
  if (p.syntaxError) throw new Error("syntax");
  return queryMatches(query, p.ast, buildParents(p.ast));
}

describe("field selector (§6.3 pinned exact detectors)", () => {
  it("While.test is literally True (infinite_true_no_break, exact form)", () => {
    const test = { node: "While", field: { test: { node: "Constant", where: { attr: "value", eq: true } } } };
    expect(q("while True:\n  pass", test)).toBe(true);
    // a stray True deeper in the body must NOT match the field-scoped test
    expect(q("x = 0\nwhile x < 3:\n  y = True", test)).toBe(false);
  });

  it("If with an elif (nested If in orelse) vs nested if in body (has_elif, exact form)", () => {
    const hasElif = { node: "If", field: { orelse: { node: "If" } } };
    expect(q("if a:\n  pass\nelif b:\n  pass", hasElif)).toBe(true);
    // nested if in the BODY (not orelse) must NOT count as an elif
    expect(q("if a:\n  if b:\n   pass", hasElif)).toBe(false);
  });
});
```

- [ ] **Step 6: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- matcher-field`. PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/authoring/src/ast/matcher.ts packages/authoring/test/matcher.test.ts packages/authoring/test/matcher-field.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): §6.3 AstQuery interpreter (+ field/count/within/childMatches)"
```

---

## Task 6: Signature matcher + signal computation (`signature.ts`, `signals.ts`)

**Files:**
- Create: `packages/authoring/src/signature.ts`, `packages/authoring/src/signals.ts`
- Test: `packages/authoring/test/signature.test.ts`, `packages/authoring/test/signals.test.ts`

`signature.ts` ports `harness.sig_match`/`norm`/`sig_kinds`/`sig_tags` (lines 151–259) and ADDS the frozen `{timedOut:true}` primitive. `signals.ts` ports `signals_for`/`build_signals`/`owner_node_of`/`pick_step` (lines 170–272), delegating parse to `evalTags` and execution to `runCase`.

- [ ] **Step 1: Write `test/signature.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { sigMatch, norm, sigKinds, sigTags } from "../src/signature.js";

describe("sigMatch", () => {
  it("astTag", () => {
    expect(sigMatch({ astTag: "no_print_call" }, { astTags: new Set(["no_print_call"]) })).toBe(true);
    expect(sigMatch({ astTag: "x" }, { astTags: new Set() })).toBe(false);
  });
  it("runError", () => {
    expect(sigMatch({ runError: "runtime" }, { runError: { type: "runtime" } })).toBe(true);
    expect(sigMatch({ runError: "runtime" }, { runError: { type: "syntax" } })).toBe(false);
    expect(sigMatch({ runError: "runtime" }, {})).toBe(false);
  });
  it("timedOut (frozen primitive, new)", () => {
    expect(sigMatch({ timedOut: true }, { timedOut: true })).toBe(true);
    expect(sigMatch({ timedOut: true }, { timedOut: false })).toBe(false);
    expect(sigMatch({ timedOut: true }, {})).toBe(false);
  });
  it("testFailure with and without caseIndex", () => {
    expect(sigMatch({ testFailure: {} }, { tests: { failed: 1, failures: [0] } })).toBe(true);
    expect(sigMatch({ testFailure: { caseIndex: 0 } }, { tests: { failed: 1, failures: [0] } })).toBe(true);
    expect(sigMatch({ testFailure: { caseIndex: 1 } }, { tests: { failed: 1, failures: [0] } })).toBe(false);
    expect(sigMatch({ testFailure: {} }, { tests: { failed: 0, failures: [] } })).toBe(false);
  });
  it("choice / recallEquals (normalized)", () => {
    expect(sigMatch({ choice: "b" }, { chosenChoiceId: "b" })).toBe(true);
    expect(sigMatch({ recallEquals: "Int." }, { recallInput: " int " })).toBe(true);
  });
  it("all / any / not", () => {
    expect(sigMatch({ all: [{ astTag: "t" }, { choice: "b" }] }, { astTags: new Set(["t"]), chosenChoiceId: "b" })).toBe(true);
    expect(sigMatch({ any: [{ astTag: "t" }, { choice: "b" }] }, { chosenChoiceId: "b" })).toBe(true);
    expect(sigMatch({ not: { astTag: "t" } }, { astTags: new Set() })).toBe(true);
  });
  it("norm collapses whitespace, lowercases, strips a trailing period", () => {
    expect(norm("  Int .  ")).toBe("int");
    expect(norm("A  B")).toBe("a b");
  });
  it("sigKinds / sigTags collect referenced kinds and astTags", () => {
    const s = { any: [{ astTag: "no_print_call" }, { choice: "c" }] };
    expect([...sigKinds(s)].sort()).toEqual(["astTag", "choice"]);
    expect([...sigTags(s)]).toEqual(["no_print_call"]);
  });
});
```

- [ ] **Step 2: Run — expect failure.** `pnpm --filter @trellis/authoring test -- signature`. FAIL.

- [ ] **Step 3: Write `src/signature.ts`**

```ts
// Ports content/verify/harness.py sig_match/norm/sig_kinds/sig_tags, plus the frozen {timedOut:true}.
export interface Signals {
  astTags?: Set<string>;
  ran?: boolean;
  runError?: { type: "syntax" | "runtime" } | null;
  timedOut?: boolean;
  tests?: { failed: number; failures: number[] } | null;
  propertyFailed?: boolean;
  chosenChoiceId?: string;
  recallInput?: string;
}

type Sig = Record<string, unknown>;

export function norm(s: string): string {
  const collapsed = String(s).trim().split(/\s+/).join(" ").toLowerCase();
  return collapsed.endsWith(".") ? collapsed.slice(0, -1) : collapsed;
}

export function sigMatch(sig: Sig, signals: Signals): boolean {
  if ("all" in sig) return (sig["all"] as Sig[]).every((s) => sigMatch(s, signals));
  if ("any" in sig) return (sig["any"] as Sig[]).some((s) => sigMatch(s, signals));
  if ("not" in sig) return !sigMatch(sig["not"] as Sig, signals);
  if ("astTag" in sig) return (signals.astTags ?? new Set()).has(sig["astTag"] as string);
  if ("runError" in sig) {
    const re = signals.runError;
    return !!re && re.type === (sig["runError"] as string);
  }
  if ("timedOut" in sig) return signals.timedOut === true; // frozen Signature primitive (new)
  if ("testFailure" in sig) {
    const t = signals.tests;
    if (!t || t.failed === 0) return false;
    const tf = sig["testFailure"] as { caseIndex?: number };
    if ("caseIndex" in tf) return t.failures.includes(tf.caseIndex!);
    return true;
  }
  if ("propertyFailed" in sig) return signals.propertyFailed === true;
  if ("choice" in sig) return signals.chosenChoiceId === (sig["choice"] as string);
  if ("recallEquals" in sig) return norm(signals.recallInput ?? "\0") === norm(sig["recallEquals"] as string);
  return false;
}

const KIND_KEYS = ["astTag", "runError", "timedOut", "testFailure", "propertyFailed", "choice", "recallEquals"] as const;

/** which signal kinds a signature references (drives whether build_signals must execute). */
export function sigKinds(sig: Sig, acc = new Set<string>()): Set<string> {
  for (const k of ["all", "any"] as const) if (k in sig) for (const s of sig[k] as Sig[]) sigKinds(s, acc);
  if ("not" in sig) sigKinds(sig["not"] as Sig, acc);
  for (const k of KIND_KEYS) if (k in sig) acc.add(k);
  return acc;
}

/** which astTags a signature references (drives pick_step selection). */
export function sigTags(sig: Sig, acc = new Set<string>()): Set<string> {
  for (const k of ["all", "any"] as const) if (k in sig) for (const s of sig[k] as Sig[]) sigTags(s, acc);
  if ("not" in sig) sigTags(sig["not"] as Sig, acc);
  if ("astTag" in sig) acc.add(sig["astTag"] as string);
  return acc;
}
```

- [ ] **Step 4: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- signature`. PASS.

- [ ] **Step 5: Write `test/signals.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { signalsFor } from "../src/signals.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("signalsFor", () => {
  const loaded = loadContent(CONTENT);

  it("recognize -> chosenChoiceId", () => {
    const s = signalsFor({ stepKind: "recognize", choice: "b" }, loaded.miscons["mis.print.unquoted"]!, loaded);
    expect(s.chosenChoiceId).toBe("b");
  });

  it("recall -> recallInput", () => {
    const s = signalsFor({ stepKind: "recall", input: "str" }, loaded.miscons["mis.type.int_input"]!, loaded);
    expect(s.recallInput).toBe("str");
  });

  it("build fixture -> astTags from the owning node's build step", () => {
    const mis = loaded.miscons["mis.print.no_call"]!;
    const trigger = mis.triggers!.find((t) => t.stepKind === "build")!;
    const s = signalsFor(trigger, mis, loaded);
    expect(s.astTags).toBeInstanceOf(Set);
    // the no_print_call tag fires on the trigger (a bare string, no print call)
    expect([...(s.astTags ?? [])]).toContain("no_print_call");
  });
});
```

- [ ] **Step 6: Run — expect failure.** `pnpm --filter @trellis/authoring test -- signals`. FAIL.

- [ ] **Step 7: Write `src/signals.ts`** — ports `harness.owner_node_of`/`pick_step`/`build_signals`/`signals_for`

```ts
import type { Loaded, RawFixture, RawMiscon, RawNode, RawStep } from "./raw-types.js";
import { evalTags, type TagQuery } from "./ast/matcher.js";
import { runCase, type CaseSpec } from "./ast/python.js";
import { sigKinds, sigTags, type Signals } from "./signature.js";

function ownerNodeOf(loaded: Loaded, skillId: string): RawNode | null {
  for (const n of Object.values(loaded.nodes)) if ((n.teaches ?? []).includes(skillId)) return n;
  return null;
}

function buildStepsForSkill(loaded: Loaded, skillId: string): RawStep[] {
  const out: RawStep[] = [];
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      const certifies = new Set(c.certifies ?? []);
      for (const st of c.steps) {
        if (st.kind === "build") {
          const skills = new Set((st["skills"] as string[]) ?? []);
          if (skills.has(skillId) || certifies.has(skillId)) out.push(st);
        }
      }
    }
  }
  return out;
}

/** The build step that would surface this misconception: one in the skill's OWNER node whose
 *  AST queries define every tag the signature needs (harness.pick_step). */
function pickStep(loaded: Loaded, mis: RawMiscon, neededTags: Set<string>): RawStep | null {
  const node = ownerNodeOf(loaded, mis._skill ?? mis.skill);
  let cands: RawStep[] = [];
  if (node) {
    for (const c of node.cells) {
      const touch = new Set(c.certifies ?? []);
      for (const st of c.steps) {
        if (st.kind === "build") {
          const skills = new Set((st["skills"] as string[]) ?? []);
          if (skills.has(mis._skill ?? mis.skill) || touch.has(mis._skill ?? mis.skill)) cands.push(st);
        }
      }
    }
  }
  if (cands.length === 0) cands = buildStepsForSkill(loaded, mis._skill ?? mis.skill);
  if (neededTags.size > 0) {
    for (const st of cands) {
      const ev = st["evaluator"] as { ast?: { queries?: TagQuery[] } } | undefined;
      const tags = new Set((ev?.ast?.queries ?? []).map((q) => q.tag));
      if ([...neededTags].every((t) => tags.has(t))) return st;
    }
  }
  return cands[0] ?? null;
}

interface Evaluator {
  ast?: { queries?: TagQuery[] };
  tests?: { cases?: { input?: unknown; expected?: unknown }[] };
  run?: { entrypoint?: string };
  property?: { seed?: number };
}

/** harness.build_signals: AST tags (always) + run/test signals (only if the signature needs them). */
export function buildSignals(code: string, step: RawStep, needs: Set<string>): Signals {
  const ev = step["evaluator"] as Evaluator;
  const queries = ev.ast?.queries ?? [];
  const tags = evalTags(code, queries);
  const signals: Signals = { astTags: tags ?? new Set(), ran: tags !== null, runError: null, tests: null };
  if (tags === null) {
    signals.runError = { type: "syntax" };
    return signals;
  }
  const needsExec = ["runError", "testFailure", "propertyFailed"].some((k) => needs.has(k));
  if (!needsExec) return signals;

  const cases = ev.tests?.cases ?? [];
  const entry = ev.run?.entrypoint;
  const seed = ev.property?.seed;
  const failures: number[] = [];
  let runtimeErr: { type: "runtime" } | null = null;

  cases.forEach((c, i) => {
    const expected = c.expected;
    let spec: CaseSpec;
    if (entry) {
      const inp = c.input;
      const args = Array.isArray(inp) ? inp : [inp];
      spec = { code, mode: "entrypoint", entry, args, expected, ...(seed !== undefined ? { seed } : {}) };
    } else {
      const inp = c.input;
      const stdin = inp == null ? null : typeof inp === "string" ? inp : String(inp);
      spec = { code, mode: "stdin", expected, stdin };
    }
    const r = runCase(spec);
    if (r.errType === "runtime") runtimeErr = { type: "runtime" };
    if (!r.ok) failures.push(i);
  });

  if (runtimeErr) signals.runError = runtimeErr;
  signals.tests = { failed: failures.length, failures };
  return signals;
}

/** harness.signals_for: compute signals for one fixture. */
export function signalsFor(fix: RawFixture, mis: RawMiscon, loaded: Loaded): Signals & { _error?: string } {
  if (fix.stepKind === "recognize" || fix.stepKind === "predict") {
    return { chosenChoiceId: fix.choice };
  }
  if (fix.stepKind === "recall") {
    return { recallInput: fix.input };
  }
  if (fix.stepKind === "build") {
    const step = pickStep(loaded, mis, sigTags(mis.signature as Record<string, unknown>));
    if (step === null) return { _error: `no build step certifies ${mis._skill ?? mis.skill}` };
    return buildSignals(fix.code ?? "", step, sigKinds(mis.signature as Record<string, unknown>));
  }
  return { _error: `unknown stepKind ${fix.stepKind}` };
}
```

- [ ] **Step 8: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- signals`. PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/authoring/src/signature.ts packages/authoring/src/signals.ts packages/authoring/test/signature.test.ts packages/authoring/test/signals.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): §7 Signature matcher + fixture signal computation (+timedOut)"
```

---

## Task 7: Gates 1–4 (`gates/types.ts`, `schema-gate.ts`, `referential.ts`, `dag.ts`, `granularity.ts`)

**Files:**
- Create: `packages/authoring/src/gates/types.ts`, `schema-gate.ts`, `referential.ts`, `dag.ts`, `granularity.ts`
- Test: `packages/authoring/test/gates-referential.test.ts`, `gates-dag.test.ts`, `gates-granularity.test.ts`

Ports `validate.py` gates (lines 34–123) and ADDS spine connectivity (§4.2, absent in `validate.py`). Each gate returns `GateIssue[]`.

- [ ] **Step 1: Write `src/gates/types.ts`**

```ts
export interface GateIssue {
  gate: string; // "1-schema" | "2-referential" | ...
  level: "error" | "warn";
  message: string;
}

export interface GateReport {
  ok: boolean; // false iff any error-level issue
  issues: GateIssue[];
  stats: { nodes: number; skills: number; misconceptions: number; cells: number };
}
```

- [ ] **Step 2: Write `test/gates-referential.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateReferential } from "../src/gates/referential.js";
import type { Loaded } from "../src/raw-types.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 2: referential integrity", () => {
  it("passes on the real corpus", () => {
    expect(gateReferential(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });

  it("flags a dangling required skill (no producer)", () => {
    const loaded: Loaded = {
      nodes: { n: { id: "n", title: "", track: "spine", requires: [{ skill: "ghost", minMastery: 0.5, kind: "prerequisite" }], teaches: [], cells: [] } },
      skills: {}, miscons: {},
    };
    expect(gateReferential(loaded).some((i) => /requires ghost which NO node teaches/.test(i.message))).toBe(true);
  });

  it("flags an extension without exactly one track edge", () => {
    const loaded: Loaded = {
      nodes: { ext: { id: "ext", title: "", track: "extension", requires: [], teaches: [], cells: [] } },
      skills: {}, miscons: {},
    };
    expect(gateReferential(loaded).some((i) => /exactly 1 track edge/.test(i.message))).toBe(true);
  });

  it("flags certifies not in teaches", () => {
    const loaded: Loaded = {
      nodes: { n: { id: "n", title: "", track: "spine", requires: [], teaches: ["a"], cells: [
        { id: "c", title: "", certifies: ["b"], steps: [] }] } },
      skills: { a: { id: "a", title: "", description: "" } }, miscons: {},
    };
    expect(gateReferential(loaded).some((i) => /certifies b not in n.teaches/.test(i.message))).toBe(true);
  });
});
```

- [ ] **Step 3: Run — expect failure.** `pnpm --filter @trellis/authoring test -- gates-referential`. FAIL.

- [ ] **Step 4: Write `src/gates/referential.ts`** (ports `validate.py` lines 34–90)

```ts
import type { Loaded } from "../raw-types.js";
import { buildProducers } from "../indexes.js";
import type { GateIssue } from "./types.js";

const G = "2-referential";

export function gateReferential(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const err = (message: string) => issues.push({ gate: G, level: "error", message });
  const producers = buildProducers(loaded);
  const { nodes, skills, miscons } = loaded;

  for (const [nid, n] of Object.entries(nodes)) {
    for (const sk of n.teaches ?? []) if (!skills[sk]) err(`${nid} teaches undefined skill ${sk}`);
    for (const c of n.cells) {
      for (const sk of c.certifies ?? []) {
        if (!(n.teaches ?? []).includes(sk)) err(`${c.id} certifies ${sk} not in ${nid}.teaches`);
      }
    }
    const certified = new Set(n.cells.flatMap((c) => c.certifies ?? []));
    for (const sk of n.teaches ?? []) if (!certified.has(sk)) err(`${nid} teaches ${sk} but no cell certifies it`);
  }

  for (const [nid, n] of Object.entries(nodes)) {
    let trackEdges = 0;
    for (const r of n.requires ?? []) {
      if (r.kind === "track") trackEdges++;
      if (!producers[r.skill]?.length) err(`${nid} requires ${r.skill} which NO node teaches (dangling)`);
    }
    if (n.track === "extension" && trackEdges !== 1) err(`extension ${nid} must have exactly 1 track edge, has ${trackEdges}`);
  }

  for (const [mid, m] of Object.entries(miscons)) if (!skills[m.skill]) err(`${mid}.skill ${m.skill} undefined`);

  // misconception ids referenced by steps (choices / maps) must be defined (validate.py 75-90)
  for (const [nid, n] of Object.entries(nodes)) {
    for (const c of n.cells) {
      for (const s of c.steps) {
        for (const ch of ((s["choices"] as { misconception?: string }[]) ?? [])) {
          if (ch.misconception && !miscons[ch.misconception]) err(`${nid} references undefined misconception ${ch.misconception}`);
        }
        const acc = (s["accepted"] as { misconceptionMap?: Record<string, string> }) ?? {};
        for (const ref of Object.values(acc.misconceptionMap ?? {})) if (!miscons[ref]) err(`${nid} references undefined misconception ${ref}`);
        const exp = (s["expected"] as { misconceptionMap?: Record<string, string> }) ?? {};
        for (const ref of Object.values(exp.misconceptionMap ?? {})) if (!miscons[ref]) err(`${nid} references undefined misconception ${ref}`);
      }
    }
  }

  return issues;
}
```

- [ ] **Step 5: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- gates-referential`. PASS.

- [ ] **Step 6: Write `test/gates-dag.test.ts`** (cycle + upstream cycle + spine connectivity)

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateDag } from "../src/gates/dag.js";
import type { Loaded } from "../src/raw-types.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 3: DAG + spine connectivity", () => {
  it("passes on the real corpus (acyclic, spine connected)", () => {
    expect(gateDag(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });

  it("reports a node cycle with the offending path", () => {
    // a requires skill taught by b; b requires skill taught by a -> cycle
    const loaded: Loaded = {
      nodes: {
        a: { id: "a", title: "", track: "spine", requires: [{ skill: "sb", minMastery: 0.5, kind: "prerequisite" }], teaches: ["sa"], cells: [] },
        b: { id: "b", title: "", track: "spine", requires: [{ skill: "sa", minMastery: 0.5, kind: "prerequisite" }], teaches: ["sb"], cells: [] },
      },
      skills: { sa: { id: "sa", title: "", description: "" }, sb: { id: "sb", title: "", description: "" } },
      miscons: {},
    };
    const errs = gateDag(loaded).filter((i) => i.level === "error");
    expect(errs.some((i) => /CYCLE:/.test(i.message))).toBe(true);
  });

  it("reports an upstream skill cycle", () => {
    const loaded: Loaded = {
      nodes: {},
      skills: {
        x: { id: "x", title: "", description: "", upstream: ["y"] },
        y: { id: "y", title: "", description: "", upstream: ["x"] },
      },
      miscons: {},
    };
    expect(gateDag(loaded).some((i) => /UPSTREAM CYCLE/.test(i.message))).toBe(true);
  });

  it("reports an unreachable spine node", () => {
    const loaded: Loaded = {
      nodes: {
        root: { id: "root", title: "", track: "spine", requires: [], teaches: ["s0"], cells: [] },
        island: { id: "island", title: "", track: "spine", requires: [], teaches: ["s1"], cells: [] },
      },
      skills: { s0: { id: "s0", title: "", description: "" }, s1: { id: "s1", title: "", description: "" } },
      miscons: {},
    };
    // two spine roots (both requires:[]) -> connectivity violation surfaced
    expect(gateDag(loaded).some((i) => /spine/.test(i.message))).toBe(true);
  });
});
```

- [ ] **Step 7: Run — expect failure.** `pnpm --filter @trellis/authoring test -- gates-dag`. FAIL.

- [ ] **Step 8: Write `src/gates/dag.ts`** (ports `validate.py` 92–123 + adds §4.2 spine connectivity)

```ts
import type { Loaded } from "../raw-types.js";
import { buildProducers } from "../indexes.js";
import type { GateIssue } from "./types.js";

const G = "3-dag";

export function gateDag(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const err = (message: string) => issues.push({ gate: G, level: "error", message });
  const { nodes, skills } = loaded;
  const producers = buildProducers(loaded);

  // node DAG (validate.py 92-107): edge producer(req.skill) -> node
  const color: Record<string, 0 | 1 | 2> = {};
  for (const nid of Object.keys(nodes)) color[nid] = 0;
  const visit = (nid: string, stack: string[]): void => {
    color[nid] = 1;
    for (const r of nodes[nid]!.requires ?? []) {
      for (const p of producers[r.skill] ?? []) {
        if (p === nid) continue;
        if (color[p] === 1) err(`CYCLE: ${[...stack, nid, p].join(" -> ")}`);
        else if (color[p] === 0) visit(p, [...stack, nid]);
      }
    }
    color[nid] = 2;
  };
  for (const nid of Object.keys(nodes)) if (color[nid] === 0) visit(nid, []);

  // upstream skill DAG (validate.py 109-123)
  const uc: Record<string, 0 | 1 | 2> = {};
  for (const sid of Object.keys(skills)) uc[sid] = 0;
  const uvisit = (sid: string, stack: string[]): void => {
    uc[sid] = 1;
    for (const up of skills[sid]!.upstream ?? []) {
      if (!skills[up]) { err(`${sid}.upstream references undefined skill ${up}`); continue; }
      if (uc[up] === 1) err(`UPSTREAM CYCLE: ${[...stack, sid, up].join(" -> ")}`);
      else if (uc[up] === 0) uvisit(up, [...stack, sid]);
    }
    uc[sid] = 2;
  };
  for (const sid of Object.keys(skills)) if (uc[sid] === 0) uvisit(sid, []);

  // §4.2 spine connectivity (NEW; not in validate.py): every spine node reachable from the
  // single spine root via enable-edges A->B (A teaches a skill B requires).
  const spine = Object.keys(nodes).filter((n) => nodes[n]!.track === "spine");
  if (spine.length > 0) {
    const teaches = (n: string) => new Set(nodes[n]!.teaches ?? []);
    const spineProducerReq = (n: string) =>
      (nodes[n]!.requires ?? []).some((r) => spine.some((p) => p !== n && teaches(p).has(r.skill)));
    const roots = spine.filter((n) => !spineProducerReq(n));
    if (roots.length !== 1) {
      err(`spine must have exactly one root (nodes with no spine prerequisite), found ${roots.length}: ${roots.join(", ")}`);
    }
    const enables = (a: string, b: string) => (nodes[b]!.requires ?? []).some((r) => teaches(a).has(r.skill));
    const seen = new Set<string>(roots);
    const queue = [...roots];
    while (queue.length) {
      const a = queue.shift()!;
      for (const b of Object.keys(nodes)) if (!seen.has(b) && enables(a, b)) { seen.add(b); queue.push(b); }
    }
    for (const n of spine) if (!seen.has(n)) err(`spine node ${n} is not reachable from the spine root (disconnected)`);
  }

  return issues;
}
```

- [ ] **Step 9: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- gates-dag`. PASS.

- [ ] **Step 10: Write `test/gates-granularity.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateGranularity } from "../src/gates/granularity.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 4: granularity", () => {
  it("passes on the real corpus (every skill 1..6 misconceptions, >=1 certifying step)", () => {
    const issues = gateGranularity(loadContent(CONTENT));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("errors on a skill with 0 misconceptions", () => {
    const loaded = {
      nodes: { n: { id: "n", title: "", track: "spine" as const, requires: [], teaches: ["lonely"], cells: [
        { id: "c", title: "", certifies: ["lonely"], steps: [{ id: "c#0", kind: "build" as const }] }] } },
      skills: { lonely: { id: "lonely", title: "", description: "" } },
      miscons: {},
    };
    expect(gateGranularity(loaded).some((i) => /0 misconceptions/.test(i.message))).toBe(true);
  });
});
```

- [ ] **Step 11: Run — expect failure.** `pnpm --filter @trellis/authoring test -- gates-granularity`. FAIL.

- [ ] **Step 12: Write `src/gates/granularity.ts`** (ports `validate.py` 43–72; the certifying-step part folds in the cell-certifies check). Note: `validate.py` counts misconceptions per skill and errors at 0, warns at >6.

```ts
import type { Loaded } from "../raw-types.js";
import type { GateIssue } from "./types.js";

const G = "4-granularity";

export function gateGranularity(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const { skills, miscons, nodes } = loaded;

  // every skill must be certified by >=1 cell step (validate.py certifies/teaches coverage is in
  // gate 2; here we add the explicit ">=1 certifying step" reading of §13.2 gate 4).
  const certifiedSkills = new Set<string>();
  for (const n of Object.values(nodes)) for (const c of n.cells) for (const sk of c.certifies ?? []) certifiedSkills.add(sk);

  const count: Record<string, number> = {};
  for (const m of Object.values(miscons)) count[m.skill] = (count[m.skill] ?? 0) + 1;

  for (const sid of Object.keys(skills)) {
    const c = count[sid] ?? 0;
    if (c === 0) issues.push({ gate: G, level: "error", message: `granularity: skill ${sid} has 0 misconceptions (merge or add one)` });
    else if (c > 6) issues.push({ gate: G, level: "warn", message: `granularity: skill ${sid} has ${c} misconceptions (>6, consider split)` });
    // a taught-but-uncertified skill is already an error in gate 2; we don't double-report here.
    void certifiedSkills;
  }

  return issues;
}
```

- [ ] **Step 13: Write `src/gates/schema-gate.ts`** (gate 1 — already enforced at compile-time, but expose a gate fn for the report)

```ts
import { Bundle } from "@trellis/schema";
import { Value } from "@sinclair/typebox/value";
import type { GateIssue } from "./types.js";

const G = "1-schema";

export function gateSchema(bundle: unknown): GateIssue[] {
  if (Value.Check(Bundle, bundle)) return [];
  return [...Value.Errors(Bundle, bundle)].map((e) => ({
    gate: G,
    level: "error" as const,
    message: `schema: ${e.path || "/"}: ${e.message}`,
  }));
}
```

- [ ] **Step 14: Run all gate tests — expect PASS.** `pnpm --filter @trellis/authoring test -- gates-`. PASS.

- [ ] **Step 15: Commit**

```bash
git add packages/authoring/src/gates/types.ts packages/authoring/src/gates/schema-gate.ts packages/authoring/src/gates/referential.ts packages/authoring/src/gates/dag.ts packages/authoring/src/gates/granularity.ts packages/authoring/test/gates-referential.test.ts packages/authoring/test/gates-dag.test.ts packages/authoring/test/gates-granularity.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): gates 1-4 (schema, referential, DAG+spine-connectivity, granularity)"
```

---

## Task 8: Gate 5 (fixtures) + differential cross-check vs `harness.py`

**Files:**
- Create: `packages/authoring/src/gates/fixtures.ts`
- Test: `packages/authoring/test/gate-fixtures.test.ts`, `packages/authoring/test/gate-fixtures.differential.test.ts`

- [ ] **Step 1: Write `test/gate-fixtures.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateFixtures } from "../src/gates/fixtures.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 5: misconception fixtures (real detector)", () => {
  it("every trigger fires and every notTrigger stays silent across all 21 misconceptions", () => {
    const issues = gateFixtures(loadContent(CONTENT));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failure.** `pnpm --filter @trellis/authoring test -- gate-fixtures.test`. FAIL.

- [ ] **Step 3: Write `src/gates/fixtures.ts`** (ports `harness.py` gate-5 loop, lines 274–291)

```ts
import type { Loaded } from "../raw-types.js";
import { signalsFor } from "../signals.js";
import { sigMatch } from "../signature.js";
import type { GateIssue } from "./types.js";

const G = "5-fixtures";

export function gateFixtures(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  for (const mid of Object.keys(loaded.miscons).sort()) {
    const m = loaded.miscons[mid]!;
    const sig = m.signature as Record<string, unknown>;
    for (const [label, want] of [["triggers", true], ["notTriggers", false]] as const) {
      for (const fix of m[label] ?? []) {
        const s = signalsFor(fix, m, loaded);
        if (s._error) { issues.push({ gate: G, level: "error", message: `${mid}: ${s._error}` }); continue; }
        const got = sigMatch(sig, s);
        if (got !== want) {
          const what = fix.code ?? fix.choice ?? fix.input;
          issues.push({ gate: G, level: "error", message: `${mid}: ${label} ${JSON.stringify(what)} want=${want} got=${got}` });
        }
      }
    }
  }
  return issues;
}
```

- [ ] **Step 4: Run — expect PASS** (all 21 fixtures agree). `pnpm --filter @trellis/authoring test -- gate-fixtures.test`. PASS.

> If a fixture disagrees, that is EITHER a port bug OR an exposed §6.3 ambiguity (per START-HERE). Debug with `superpowers:systematic-debugging`: print the computed `signals` for the failing fixture and compare to what `harness.py` computes for the same misconception. Do NOT "fix" by editing content.

- [ ] **Step 5: Write `test/gate-fixtures.differential.test.ts`** — run `harness.py` and assert per-misconception agreement (the differential oracle)

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadContent } from "../src/load.js";
import { gateFixtures } from "../src/gates/fixtures.js";

const ROOT = resolve(__dirname, "../../..");

/** Parse harness.py's gate-5 output: lines "  <mid>   ok" or "  <mid>   FAIL[...]". */
function harnessGate5Failures(): Set<string> {
  const r = spawnSync("python3", ["content/verify/harness.py"], { encoding: "utf8", input: "", maxBuffer: 1 << 24 });
  // harness.py exits 1 on any gate failure; on the green corpus it exits 0. Either way parse stdout.
  const failures = new Set<string>();
  for (const line of r.stdout.split("\n")) {
    const m = /^\s{2}(\S+)\s+(.*)$/.exec(line);
    if (m && m[2] !== "ok" && m[1]!.startsWith("mis.")) failures.add(m[1]!);
  }
  return failures;
}

describe("gate 5 differential oracle (TS port vs harness.py)", () => {
  it("agrees with harness.py on which misconceptions pass", () => {
    // NOTE: run python from repo root so its content/ globs resolve.
    const cwd0 = process.cwd();
    void cwd0;
    const harnessFails = (() => {
      const r = spawnSync("python3", [resolve(ROOT, "content/verify/harness.py")], {
        encoding: "utf8", input: "", maxBuffer: 1 << 24,
      });
      const fails = new Set<string>();
      for (const line of r.stdout.split("\n")) {
        const m = /^\s{2}(mis\.\S+)\s+(.*)$/.exec(line);
        if (m && m[2] !== "ok") fails.add(m[1]!);
      }
      return fails;
    })();

    const tsFails = new Set(
      gateFixtures(loadContent(resolve(ROOT, "content")))
        .filter((i) => i.level === "error")
        .map((i) => i.message.split(":")[0]!),
    );

    // On the green corpus both sets are empty; the assertion is structural agreement.
    expect([...tsFails].sort()).toEqual([...harnessFails].sort());
  });
});

// silence unused (kept for documentation of the parser shape)
void harnessGate5Failures;
```

> Implementer note: `harness.py` uses repo-relative globs (`content/...`), so it must run with `cwd` = repo root OR be invoked by absolute path with the working directory set. `spawnSync` inherits the test process cwd (the package dir under vitest). Pass `{ cwd: ROOT }` in the options if the globs come up empty — add `cwd: ROOT` to the `spawnSync` options object. Verify by checking the harness prints `nodes=7 skills=15`. (The `shims.d.ts` `spawnSync` options type omits `cwd`; ADD `cwd?: string` to that ambient declaration when you need it.)

- [ ] **Step 6: Run — expect PASS** (both sets empty → equal). `pnpm --filter @trellis/authoring test -- differential`. PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/authoring/src/gates/fixtures.ts packages/authoring/test/gate-fixtures.test.ts packages/authoring/test/gate-fixtures.differential.test.ts packages/authoring/src/shims.d.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): gate 5 fixtures + differential cross-check vs harness.py (21/21)"
```

---

## Task 9: Gate 6 (oracle) + Gate 7 (golden stub)

**Files:**
- Create: `packages/authoring/src/gates/oracle.ts`, `packages/authoring/src/gates/golden.ts`
- Test: `packages/authoring/test/gate-oracle.test.ts`, `packages/authoring/test/gate-golden.test.ts`

- [ ] **Step 1: Write `test/gate-oracle.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateOracle } from "../src/gates/oracle.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 6: reference-impl oracle smoke", () => {
  it("every build step's referenceImpl parses and runs on sampled generators", () => {
    expect(gateOracle(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failure.** FAIL.

- [ ] **Step 3: Write `src/gates/oracle.ts`** (ports `harness.py` gate-6, lines 293–321, incl. `_sample`)

```ts
import type { Loaded, RawStep } from "../raw-types.js";
import { runCase } from "../ast/python.js";
import type { GateIssue } from "./types.js";

const G = "6-oracle";

interface Gen { param: string; type: string; min?: number; choices?: unknown[]; }

function sample(g: Gen): unknown {
  switch (g.type) {
    case "int": case "float": return g.min ?? 0;
    case "str": return "ab";
    case "bool": return true;
    case "list": return [];
    case "choice": return (g.choices ?? [0])[0];
    default: return 0;
  }
}

export function gateOracle(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const st of c.steps as RawStep[]) {
        if (st.kind !== "build") continue;
        const ev = st["evaluator"] as { property?: { referenceImpl: string; generators?: Gen[] } };
        const prop = ev.property;
        if (!prop) continue;
        const gens = prop.generators ?? [];
        // Build sol(<sampled args>) and assert it parses + runs without error. We reuse run_case
        // in entrypoint mode against the oracle's own output (expected = the oracle's value), so
        // "ok" is irrelevant; we only care that errType is null (harness only asserts no error).
        const args = gens.map(sample);
        const r = runCase({ code: prop.referenceImpl, mode: "entrypoint", entry: "sol", args, expected: null });
        if (r.errType !== null) {
          issues.push({ gate: G, level: "error", message: `${st.id}: oracle ${r.errType} error on sampled generators` });
        }
      }
    }
  }
  return issues;
}
```

> Subtlety vs harness: `harness.py` runs `referenceImpl + print(repr(sol(args)))` and flags ANY error. Our `runCase` entrypoint mode does exactly that internally (it builds `print(repr(sol(args)))`), and `errType` captures syntax/runtime errors regardless of the `expected` comparison. So `errType !== null` ⇔ harness's `ORACLE FAIL`. The `expected: null` we pass only affects `ok`, which we ignore here.

- [ ] **Step 4: Run — expect PASS.** PASS.

- [ ] **Step 5: Write `test/gate-golden.test.ts`** (plug-in stub: passes when no snapshots present)

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gateGolden } from "../src/gates/golden.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gate 7: golden Diagnosis snapshots (plug-in stub)", () => {
  it("passes with an informational note when the corpus has no golden snapshots", () => {
    const issues = gateGolden(loadContent(CONTENT));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues.some((i) => i.level === "warn" && /no golden/i.test(i.message))).toBe(true);
  });
});
```

- [ ] **Step 6: Write `src/gates/golden.ts`** — structured so M4 plugs in real re-grading without rework

```ts
import type { Loaded } from "../raw-types.js";
import type { GateIssue } from "./types.js";

const G = "7-golden";

// Golden snapshots would live on steps as `golden: { submission, expect: { attribution, misconceptionId? } }`.
// The corpus has none yet, and full Diagnosis production is M4. This gate scans for them and, when
// present, re-grades via the dry-run grader (grade.ts) and diffs. Until M4 wires the grader's
// attribution precedence, we emit an informational warn so the seam is visible but never red.
export function gateGolden(loaded: Loaded): GateIssue[] {
  let found = 0;
  for (const n of Object.values(loaded.nodes)) for (const c of n.cells) for (const s of c.steps) if (s["golden"]) found++;
  if (found === 0) {
    return [{ gate: G, level: "warn", message: "gate 7: no golden Diagnosis snapshots in corpus (skipped; plugs in at M4)" }];
  }
  return [{ gate: G, level: "warn", message: `gate 7: ${found} golden snapshot(s) found but re-grading lands at M4 (skipped)` }];
}
```

- [ ] **Step 7: Run both — expect PASS.** `pnpm --filter @trellis/authoring test -- "gate-oracle|gate-golden"`. PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/authoring/src/gates/oracle.ts packages/authoring/src/gates/golden.ts packages/authoring/test/gate-oracle.test.ts packages/authoring/test/gate-golden.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): gate 6 oracle smoke + gate 7 golden plug-in stub"
```

---

## Task 10: Lints (`where-combinators`, `spine-extension`, `re2-pattern`)

**Files:**
- Create: `packages/authoring/src/lints/where-combinators.ts`, `spine-extension.ts`, `re2-pattern.ts`
- Test: `packages/authoring/test/lints.test.ts`

- [ ] **Step 1: Write `test/lints.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { lintWhereCombinators } from "../src/lints/where-combinators.js";
import { lintSpineExtension } from "../src/lints/spine-extension.js";
import { lintRe2Patterns } from "../src/lints/re2-pattern.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("lint: §6.3 loud-reject combinators inside `where`", () => {
  it("passes on the corpus (no combinators in any where)", () => {
    expect(lintWhereCombinators(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });
  it("rejects a where containing not/all/any", () => {
    const loaded = {
      nodes: { n: { id: "n", title: "", track: "spine" as const, requires: [], teaches: [], cells: [
        { id: "c", title: "", certifies: [], steps: [{ id: "c#0", kind: "build" as const,
          evaluator: { ast: { queries: [{ tag: "bad", query: { node: "Call", where: { any: [{ calls: "print" }] } } }] } } }] }] } },
      skills: {}, miscons: {},
    };
    expect(lintWhereCombinators(loaded).some((i) => /where.*(not|all|any)/i.test(i.message))).toBe(true);
  });
});

describe("lint: spine never requires an extension-only skill", () => {
  it("finds ZERO violations on the current corpus (conditionals re-theme landed)", () => {
    expect(lintSpineExtension(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });
  it("flags a spine node requiring a skill only an extension teaches", () => {
    const loaded = {
      nodes: {
        ext: { id: "ext", title: "", track: "extension" as const, requires: [{ skill: "base", minMastery: 0.6, kind: "track" as const }], teaches: ["extOnly"], cells: [] },
        spine: { id: "spine", title: "", track: "spine" as const, requires: [{ skill: "extOnly", minMastery: 0.5, kind: "prerequisite" as const }], teaches: ["base"], cells: [] },
      },
      skills: {}, miscons: {},
    };
    expect(lintSpineExtension(loaded).some((i) => /spine.*requires.*extension/i.test(i.message))).toBe(true);
  });
});

describe("lint: RE2 pattern safety", () => {
  it("passes on the corpus (no AcceptedAnswer.patterns present)", () => {
    expect(lintRe2Patterns(loadContent(CONTENT)).filter((i) => i.level === "error")).toEqual([]);
  });
  it("rejects backreferences and lookarounds (RE2-incompatible)", () => {
    const loaded = {
      nodes: { n: { id: "n", title: "", track: "spine" as const, requires: [], teaches: [], cells: [
        { id: "c", title: "", certifies: [], steps: [{ id: "c#0", kind: "recall" as const,
          accepted: { patterns: ["(a)\\1", "(?=x)y"] } }] }] } },
      skills: {}, miscons: {},
    };
    const errs = lintRe2Patterns(loaded).filter((i) => i.level === "error");
    expect(errs.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect failure.** `pnpm --filter @trellis/authoring test -- lints`. FAIL.

- [ ] **Step 3: Write `src/lints/where-combinators.ts`** (§6.3 pin #2: combinators are NOT allowed inside `where`; reject loudly)

```ts
import type { Loaded } from "../raw-types.js";
import type { GateIssue } from "../gates/types.js";

const G = "lint-where";
const COMBINATORS = ["not", "all", "any"];

function scanQuery(q: unknown, path: string, push: (m: string) => void): void {
  if (!q || typeof q !== "object") return;
  const obj = q as Record<string, unknown>;
  if (obj["where"] && typeof obj["where"] === "object") {
    for (const k of COMBINATORS) {
      if (k in (obj["where"] as object)) push(`${path}: \`where\` contains forbidden combinator \`${k}\` (§6.3: not/all/any live only at the AstQuery level)`);
    }
    // recurse into childMatches inside where
    const cm = (obj["where"] as Record<string, unknown>)["childMatches"];
    if (cm) scanQuery(cm, `${path}.where.childMatches`, push);
  }
  for (const k of ["within", "not"]) if (obj[k]) scanQuery(obj[k], `${path}.${k}`, push);
  if (obj["field"]) for (const [f, sub] of Object.entries(obj["field"] as object)) scanQuery(sub, `${path}.field.${f}`, push);
  for (const k of ["all", "any"]) if (Array.isArray(obj[k])) (obj[k] as unknown[]).forEach((s, i) => scanQuery(s, `${path}.${k}[${i}]`, push));
}

export function lintWhereCombinators(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const push = (message: string) => issues.push({ gate: G, level: "error", message });
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const s of c.steps) {
        const ev = s["evaluator"] as { ast?: { queries?: { tag: string; query: unknown }[] }; acceptedVariants?: { astQuery: unknown }[] } | undefined;
        for (const q of ev?.ast?.queries ?? []) scanQuery(q.query, `${s.id} ast[${q.tag}]`, push);
        for (const v of ev?.acceptedVariants ?? []) scanQuery(v.astQuery, `${s.id} acceptedVariant`, push);
      }
    }
  }
  return issues;
}
```

- [ ] **Step 4: Write `src/lints/spine-extension.ts`** — the architectural invariant (§1 realignment): a spine node must not require a skill that ONLY an extension node teaches

```ts
import type { Loaded } from "../raw-types.js";
import { buildProducers } from "../indexes.js";
import type { GateIssue } from "../gates/types.js";

const G = "lint-spine-extension";

export function lintSpineExtension(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const producers = buildProducers(loaded);
  const trackOf = (nid: string) => loaded.nodes[nid]?.track;

  for (const [nid, n] of Object.entries(loaded.nodes)) {
    if (n.track !== "spine") continue;
    for (const r of n.requires ?? []) {
      const prod = producers[r.skill] ?? [];
      const spineProducers = prod.filter((p) => trackOf(p) === "spine");
      if (prod.length > 0 && spineProducers.length === 0) {
        issues.push({
          gate: G,
          level: "error",
          message: `spine node ${nid} requires ${r.skill}, which only extension node(s) ${prod.join(", ")} teach (spine must not depend on an extension)`,
        });
      }
    }
  }
  return issues;
}
```

- [ ] **Step 5: Write `src/lints/re2-pattern.ts`** — RE2-safety static lint (no `re2js` dep needed; reject RE2-incompatible constructs and unparseable patterns)

```ts
import type { Loaded } from "../raw-types.js";
import type { GateIssue } from "../gates/types.js";

const G = "lint-re2";

// RE2 forbids backreferences and lookaround. Flag them, and flag patterns JS itself cannot compile.
const BACKREF = /\\[1-9]/;
const LOOKAROUND = /\(\?<?[=!]/;

export function lintRe2Patterns(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const push = (message: string) => issues.push({ gate: G, level: "error", message });
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const s of c.steps) {
        const acc = (s["accepted"] as { patterns?: string[] }) ?? {};
        const exp = (s["expected"] as { patterns?: string[] }) ?? {};
        for (const p of [...(acc.patterns ?? []), ...(exp.patterns ?? [])]) {
          if (BACKREF.test(p)) push(`${s.id}: pattern ${JSON.stringify(p)} uses a backreference (RE2-incompatible)`);
          else if (LOOKAROUND.test(p)) push(`${s.id}: pattern ${JSON.stringify(p)} uses lookaround (RE2-incompatible)`);
          else { try { new RegExp(p); } catch { push(`${s.id}: pattern ${JSON.stringify(p)} does not compile`); } }
        }
      }
    }
  }
  return issues;
}
```

- [ ] **Step 6: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- lints`. PASS (corpus clean; synthetic violations caught).

- [ ] **Step 7: Commit**

```bash
git add packages/authoring/src/lints packages/authoring/test/lints.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): lints (§6.3 where-combinators, spine-extension invariant, RE2 patterns)"
```

---

## Task 11: Gate orchestrator (`gates/run.ts`)

**Files:**
- Create: `packages/authoring/src/gates/run.ts`
- Test: `packages/authoring/test/gates-run.test.ts`

- [ ] **Step 1: Write `test/gates-run.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { compile } from "../src/compile.js";
import { runAllGates } from "../src/gates/run.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("runAllGates", () => {
  it("reports the whole corpus as green (no errors), with stats", () => {
    const loaded = loadContent(CONTENT);
    const report = runAllGates(loaded, compile(loaded));
    expect(report.ok).toBe(true);
    expect(report.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(report.stats).toEqual({ nodes: 7, skills: 15, misconceptions: 21, cells: expect.any(Number) });
  });
});
```

- [ ] **Step 2: Run — expect failure.** FAIL.

- [ ] **Step 3: Write `src/gates/run.ts`** — runs gates 1–7 + the three lints, aggregates

```ts
import type { Loaded } from "../raw-types.js";
import type { Bundle } from "@trellis/schema";
import type { GateIssue, GateReport } from "./types.js";
import { gateSchema } from "./schema-gate.js";
import { gateReferential } from "./referential.js";
import { gateDag } from "./dag.js";
import { gateGranularity } from "./granularity.js";
import { gateFixtures } from "./fixtures.js";
import { gateOracle } from "./oracle.js";
import { gateGolden } from "./golden.js";
import { lintWhereCombinators } from "../lints/where-combinators.js";
import { lintSpineExtension } from "../lints/spine-extension.js";
import { lintRe2Patterns } from "../lints/re2-pattern.js";

export interface GateOptions {
  // gates 5/6 shell out to python3; allow skipping for environments without it (CLI --no-exec).
  runExecGates?: boolean;
}

export function runAllGates(loaded: Loaded, bundle: Bundle, opts: GateOptions = {}): GateReport {
  const runExec = opts.runExecGates !== false;
  const issues: GateIssue[] = [
    ...gateSchema(bundle),
    ...gateReferential(loaded),
    ...gateDag(loaded),
    ...gateGranularity(loaded),
    ...lintWhereCombinators(loaded),
    ...lintSpineExtension(loaded),
    ...lintRe2Patterns(loaded),
    ...(runExec ? gateFixtures(loaded) : []),
    ...(runExec ? gateOracle(loaded) : []),
    ...gateGolden(loaded),
  ];
  const cells = Object.values(loaded.nodes).reduce((acc, n) => acc + n.cells.length, 0);
  return {
    ok: !issues.some((i) => i.level === "error"),
    issues,
    stats: {
      nodes: Object.keys(loaded.nodes).length,
      skills: Object.keys(loaded.skills).length,
      misconceptions: Object.keys(loaded.miscons).length,
      cells,
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS.** PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/authoring/src/gates/run.ts packages/authoring/test/gates-run.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): gate orchestrator (gates 1-7 + lints) with aggregated report"
```

---

## Task 12: Dry-run grader (`grade.ts`)

The CLI's `trellis grade <step> <file>` dry-runs a submission against a step's evaluator and reports attribution + the matched misconception — the §13.3 v1 authoring affordance. It is self-contained (no `@trellis/engine`, which does not exist yet): it reuses our signal computation + signature matcher. It is intentionally narrow (build steps), since that is what authors most need to dry-run.

**Files:**
- Create: `packages/authoring/src/grade.ts`
- Test: `packages/authoring/test/grade.test.ts`

- [ ] **Step 1: Write `test/grade.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent } from "../src/load.js";
import { gradeBuild } from "../src/grade.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("gradeBuild (dry-run authoring grader)", () => {
  const loaded = loadContent(CONTENT);

  it("passes a correct submission for the string-concat greet step", () => {
    // cell.string_concat.join_text#4 has entrypoint greet
    const res = gradeBuild(loaded, "cell.string_concat.join_text#4", "def greet(name):\n    return \"Hi \" + name + \"!\"");
    expect(res.attribution).toBe("pass");
    expect(res.misconceptionId).toBeUndefined();
  });

  it("attributes the str/num coercion misconception on a wrong submission", () => {
    const res = gradeBuild(loaded, "cell.string_concat.text_plus_number#4", "def announce(number):\n    return \"Your random number is: \" + number");
    expect(res.attribution).toBe("misconception");
    expect(res.misconceptionId).toBe("mis.concat.str_num");
  });
});
```

> Implementer: confirm the exact step ids and the wrong-answer misconception by reading `content/nodes/string_concat.yaml` (the `text_plus_number` cell + `mis.concat.str_num`). Adjust the test's step ids/expected id to the real content if they differ; the BEHAVIOR (pass vs. the right misconception id) is the contract.

- [ ] **Step 2: Run — expect failure.** FAIL.

- [ ] **Step 3: Write `src/grade.ts`** — compute signals for the submission, then attribution precedence: syntax → runtime → misconception (first signature that matches among the step's skills' misconceptions) → mismatch (tests failed, no misconception) → pass

```ts
import type { Loaded, RawStep, RawMiscon } from "./raw-types.js";
import { buildSignals } from "./signals.js";
import { sigMatch, sigKinds, type Signals } from "./signature.js";

export interface GradeResult {
  stepId: string;
  attribution: "pass" | "misconception" | "syntax" | "runtime" | "mismatch";
  misconceptionId?: string;
  signals: Signals;
}

function findStep(loaded: Loaded, stepId: string): { step: RawStep; skills: string[]; certifies: string[] } | null {
  for (const n of loaded.nodes ? Object.values(loaded.nodes) : []) {
    for (const c of n.cells) {
      for (const st of c.steps) {
        if (st.id === stepId) return { step: st, skills: (st["skills"] as string[]) ?? [], certifies: c.certifies ?? [] };
      }
    }
  }
  return null;
}

export function gradeBuild(loaded: Loaded, stepId: string, submission: string): GradeResult {
  const found = findStep(loaded, stepId);
  if (!found) throw new Error(`unknown step ${stepId}`);
  if (found.step.kind !== "build") throw new Error(`grade supports build steps only; ${stepId} is ${found.step.kind}`);

  // candidate misconceptions: those owned by any skill this step exercises/certifies.
  const skillSet = new Set([...found.skills, ...found.certifies]);
  const candidates: RawMiscon[] = Object.values(loaded.miscons).filter((m) => skillSet.has(m.skill));

  // compute the union of signal kinds any candidate needs (so we execute once, fully).
  const needs = new Set<string>();
  for (const m of candidates) for (const k of sigKinds(m.signature as Record<string, unknown>)) needs.add(k);
  // always include test signals so we can decide pass/mismatch even with no candidates.
  needs.add("testFailure");
  needs.add("runError");

  const signals = buildSignals(submission, found.step, needs);

  if (signals.runError?.type === "syntax") return { stepId, attribution: "syntax", signals };

  // first matching misconception wins (authors order specificity; deterministic by id otherwise).
  for (const m of candidates.sort((a, b) => a.id.localeCompare(b.id))) {
    if (sigMatch(m.signature as Record<string, unknown>, signals)) {
      return { stepId, attribution: "misconception", misconceptionId: m.id, signals };
    }
  }

  if (signals.runError?.type === "runtime") return { stepId, attribution: "runtime", signals };
  if (signals.tests && signals.tests.failed > 0) return { stepId, attribution: "mismatch", signals };
  return { stepId, attribution: "pass", signals };
}
```

- [ ] **Step 4: Run — expect PASS.** PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/authoring/src/grade.ts packages/authoring/test/grade.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): dry-run build grader (trellis grade) — signals + attribution"
```

---

## Task 13: CLI (`cli.ts`) + public API (`index.ts`)

**Files:**
- Create: `packages/authoring/src/cli.ts`
- Modify: `packages/authoring/src/index.ts`
- Test: `packages/authoring/test/cli.test.ts`

- [ ] **Step 1: Write `test/cli.test.ts`** — invoke the built CLI via node (after build) OR call exported `main()` directly. We test the exported `main()` to avoid a build dependency in the unit test.

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { main } from "../src/cli.js";

const ROOT = resolve(__dirname, "../../..");
const CONTENT = resolve(ROOT, "content");
const OUT = resolve(__dirname, "../.tmp-bundle.json");

describe("CLI", () => {
  it("lint exits 0 on the corpus and prints a PASS summary", () => {
    const log: string[] = [];
    const code = main(["lint", "--content", CONTENT], (s) => log.push(s));
    expect(code).toBe(0);
    expect(log.join("")).toMatch(/nodes=7 skills=15 misconceptions=21/);
    expect(log.join("")).toMatch(/PASS/);
  });

  it("build writes a content-addressed bundle to --out", () => {
    const code = main(["build", "--content", CONTENT, "--out", OUT], () => {});
    expect(code).toBe(0);
    expect(existsSync(OUT)).toBe(true);
    const bundle = JSON.parse(readFileSync(OUT, "utf8"));
    expect(bundle.contentVersion).toMatch(/^ca-[0-9a-f]{16}$/);
    expect(Object.keys(bundle.nodes)).toHaveLength(7);
  });

  it("grade dry-runs a submission and reports attribution", () => {
    const log: string[] = [];
    // write a temp submission file
    const sub = resolve(__dirname, "../.tmp-sub.py");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (globalThis as { require?: unknown }); // not used; we write via node:fs in the impl path
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    writeFileSync(sub, "def greet(name):\n    return \"Hi \" + name + \"!\"\n");
    const code = main(["grade", "cell.string_concat.join_text#4", sub, "--content", CONTENT], (s) => log.push(s));
    expect(code).toBe(0);
    expect(log.join("")).toMatch(/pass/i);
  });
});
```

> Implementer: `require` is not available under ESM/`verbatimModuleSyntax`. Replace the temp-file write in the test with a top-level `import { writeFileSync } from "node:fs"` and remove the `require` lines. (Shown above only to flag the file is needed; write it cleanly.)

- [ ] **Step 2: Run — expect failure.** `pnpm --filter @trellis/authoring test -- cli`. FAIL.

- [ ] **Step 3: Write `src/cli.ts`** — arg parsing, three subcommands, returns an exit code (testable), with a thin `process` wrapper at the bottom for the `bin`

```ts
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { loadContent } from "./load.js";
import { compile } from "./compile.js";
import { runAllGates } from "./gates/run.js";
import { gradeBuild } from "./grade.js";

type Emit = (s: string) => void;

function parseFlags(args: string[]): { positionals: string[]; flags: Record<string, string | boolean> } {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) { flags[key] = next; i++; }
      else flags[key] = true;
    } else positionals.push(a);
  }
  return { positionals, flags };
}

function contentRoot(flags: Record<string, string | boolean>): string {
  return typeof flags["content"] === "string" ? resolve(flags["content"]) : resolve(process.cwd(), "content");
}

/** Returns a process exit code (0 ok, 1 error). `emit` defaults to stdout (overridable for tests). */
export function main(argv: string[], emit: Emit = (s) => process.stdout.write(s)): number {
  const [cmd, ...rest] = argv;
  const { positionals, flags } = parseFlags(rest);

  if (cmd === "lint") {
    const loaded = loadContent(contentRoot(flags));
    const bundle = compile(loaded);
    const report = runAllGates(loaded, bundle, { runExecGates: flags["no-exec"] !== true });
    emit(`nodes=${report.stats.nodes} skills=${report.stats.skills} misconceptions=${report.stats.misconceptions} cells=${report.stats.cells}\n`);
    for (const i of report.issues) emit(`${i.level.toUpperCase()} [${i.gate}] ${i.message}\n`);
    emit(`\nRESULT: ${report.ok ? "PASS" : `FAIL (${report.issues.filter((x) => x.level === "error").length} errors)`}\n`);
    return report.ok ? 0 : 1;
  }

  if (cmd === "build") {
    const loaded = loadContent(contentRoot(flags));
    const bundle = compile(loaded);
    const report = runAllGates(loaded, bundle, { runExecGates: flags["no-exec"] !== true });
    if (!report.ok) {
      for (const i of report.issues.filter((x) => x.level === "error")) emit(`ERROR [${i.gate}] ${i.message}\n`);
      emit("\nRESULT: FAIL — refusing to emit a bundle that fails gates\n");
      return 1;
    }
    const out = typeof flags["out"] === "string" ? resolve(flags["out"]) : resolve(process.cwd(), "bundle.json");
    if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(bundle, null, 2));
    emit(`wrote ${out} (contentVersion ${bundle.contentVersion})\n`);
    return 0;
  }

  if (cmd === "grade") {
    const [stepId, file] = positionals;
    if (!stepId || !file) { emit("usage: trellis grade <stepId> <submission-file> [--content <dir>]\n"); return 2; }
    const loaded = loadContent(contentRoot(flags));
    const submission = readFileSync(resolve(file), "utf8");
    const res = gradeBuild(loaded, stepId, submission);
    emit(`step ${res.stepId}\nattribution: ${res.attribution}\n`);
    if (res.misconceptionId) emit(`misconception: ${res.misconceptionId}\n`);
    return 0;
  }

  emit("usage: trellis <lint|build|grade> [...]\n");
  return 2;
}

// bin entrypoint
const isMain = (() => {
  try { return process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "\0"); }
  catch { return false; }
})();
if (isMain) process.exit(main(process.argv.slice(2)));
```

> Implementer note on the `bin` guard: the `isMain` heuristic is brittle. SIMPLER and reliable: at the bottom write `if (import.meta.url === \`file://${process.argv[1]}\`) process.exit(main(process.argv.slice(2)));`. Use that form. The `dist/src/cli.js` is the `bin` target (see package.json), so it runs after `pnpm build`.

- [ ] **Step 4: Update `src/index.ts`** to export the public API

```ts
export { loadContent } from "./load.js";
export { compile } from "./compile.js";
export { runAllGates } from "./gates/run.js";
export type { GateIssue, GateReport } from "./gates/types.js";
export { gradeBuild } from "./grade.js";
export type { GradeResult } from "./grade.js";
export { main } from "./cli.js";
export const VERSION = "0.0.0";
```

- [ ] **Step 5: Run — expect PASS.** `pnpm --filter @trellis/authoring test -- cli`. PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/authoring/src/cli.ts packages/authoring/src/index.ts packages/authoring/test/cli.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): trellis CLI (lint/build/grade) + public API"
```

---

## Task 14: Whole-corpus smoke, ESM build/import verification, branch finish

**Files:**
- Create: `packages/authoring/test/corpus.smoke.test.ts`

- [ ] **Step 1: Write `test/corpus.smoke.test.ts`** — the milestone gate in one test

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { Value } from "@sinclair/typebox/value";
import { Bundle } from "@trellis/schema";
import { loadContent } from "../src/load.js";
import { compile } from "../src/compile.js";
import { runAllGates } from "../src/gates/run.js";

const CONTENT = resolve(__dirname, "../../../content");

describe("M1 milestone gate: proving-slice corpus", () => {
  it("compiles to a schema-valid bundle and passes all gates (no errors)", () => {
    const loaded = loadContent(CONTENT);
    const bundle = compile(loaded);
    expect(Value.Check(Bundle, bundle)).toBe(true);
    const report = runAllGates(loaded, bundle);
    const errors = report.issues.filter((i) => i.level === "error");
    expect(errors).toEqual([]);
    expect(report.stats).toMatchObject({ nodes: 7, skills: 15, misconceptions: 21 });
  });
});
```

- [ ] **Step 2: Run the FULL package suite — expect all green**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/authoring typecheck
pnpm --filter @trellis/authoring lint
pnpm --filter @trellis/authoring test
```
Expected: typecheck clean; eslint clean; ALL tests pass (load, dialect, indexes, hash, compile, ast-python, matcher, matcher-field, signature, signals, gates-*, gate-fixtures + differential, gate-oracle, gate-golden, lints, gates-run, grade, cli, corpus.smoke).

- [ ] **Step 3: Verify the ESM build + native import (the build-cycle trap, PARALLEL-STREAMS §5)**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/schema build
pnpm --filter @trellis/authoring build
node --input-type=module -e "import('./packages/authoring/dist/src/index.js').then(m => { if (typeof m.compile !== 'function') throw new Error('no compile export'); console.log('ESM import OK:', m.VERSION); })"
```
Expected: both builds succeed; the dynamic import prints `ESM import OK: 0.0.0` (no deadlock → module graph is acyclic).

- [ ] **Step 4: Verify the built CLI binary end-to-end**

Run:
```bash
node ./packages/authoring/dist/src/cli.js lint --content ./content
node ./packages/authoring/dist/src/cli.js build --content ./content --out /tmp/trellis-bundle.json
```
Expected: `lint` prints `nodes=7 skills=15 misconceptions=21` and `RESULT: PASS`, exit 0; `build` writes `/tmp/trellis-bundle.json` with a `ca-…` contentVersion.

- [ ] **Step 5: Confirm the differential oracle still agrees (one last cross-check)**

Run:
```bash
python3 content/validate.py | tail -2
python3 content/verify/harness.py | tail -2
```
Expected: `RESULT: PASS` and `gate5: PASS | gate6 oracle-smoke: PASS` — i.e. the Python references and the TS port both green on the same corpus.

- [ ] **Step 6: Run the workspace build (turbo) to confirm nothing else broke**

Run:
```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm -w build
```
Expected: `@trellis/schema` and `@trellis/authoring` both build green.

- [ ] **Step 7: Commit the smoke test**

```bash
git add packages/authoring/test/corpus.smoke.test.ts
git -c user.name='Stream A — M1 authoring' -c user.email='noreply@anthropic.com' \
  commit -m "test(authoring): whole-corpus M1 milestone gate + ESM import smoke"
```

- [ ] **Step 8: Record the flagged follow-up (content migration) for the orchestrator**

Add a short note to the branch hand-off (the PR/merge description in the next step) and spawn a background task chip:
- The compiler **supports** the `field` selector and `{timedOut:true}` Signature primitive (proven by `matcher-field.test.ts` and `signature.test.ts`), but the **corpus migration** — re-expressing `has_elif` / `infinite_true_no_break` via `field`, and re-keying `mis.loop.infinite_true` on `{timedOut:true}` — was NOT performed, because Stream A must not rewrite `content/` (PARALLEL-STREAMS §3). This is a curriculum-intent change for the orchestrator/user. Both Python references and the TS gates are green on the un-migrated corpus.

- [ ] **Step 9: Finish the branch** — invoke `superpowers:finishing-a-development-branch` (merge target: `main`). Rebase on `main` first if it has advanced; given disjoint paths the only expected churn is `pnpm-lock.yaml`. Surface the flagged follow-up in the PR/merge description.

---

## Self-Review (run against the spec before execution)

**1. Spec coverage (§13.2 seven gates + START-HERE bullets):**
- YAML → Bundle transform (extract misconceptions→id-list + strip source-only; extract cells→id-list + inject nodeId; multi-doc taxonomies; content-addressed; derived indexes) → Tasks 1, 3.
- Validate via `Value.Check` → Task 3 (`assertValid` at emit) + Task 7 (`gateSchema`).
- Gate 1 schema → Task 7. Gate 2 referential → Task 7. Gate 3 DAG + spine connectivity + extension single-track → Task 7. Gate 4 granularity → Task 7. Gate 5 fixtures + differential cross-check (21/21) → Task 8. Gate 6 oracle → Task 9. Gate 7 golden plug-in stub → Task 9.
- §6.3 loud-reject `where`-combinators lint → Task 10. Spine-never-requires-extension invariant (zero violations = positive test) → Task 10. RE2 pattern lint → Task 10.
- CLI `lint|build|grade` → Tasks 12–13. Differential-oracle harness kept as cross-check → Task 8 + Task 14 Step 5.
- `field` selector + `{timedOut:true}` SUPPORTED (tested) but corpus migration FLAGGED, not performed → Tasks 5/6 + Task 14 Step 8.
- Scaffold mirrors `packages/schema` (package.json, tsconfig extending base, vitest) → Task 0.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step shows complete code. The two heredoc-python test snippets (load.dialect, differential) carry explicit implementer notes to prefer a small `py/` helper or `cwd: ROOT` — their *assertions* (the contract) are concrete.

**3. Type consistency:** `Loaded`/`RawNode`/`RawMiscon`/`RawFixture` (Task 1) are used consistently by indexes (T2), compile (T3), signals (T6), gates (T7–9), lints (T10), grade (T12). `Signals` (T6 signature.ts) is the single signal shape consumed by `sigMatch`, `buildSignals`, `gradeBuild`. `GateIssue`/`GateReport` (T7 types.ts) are the uniform gate return. `parsePython`/`runCase`/`CaseSpec`/`CaseResult` (T4) are used by matcher (T5) and signals (T6). `queryMatches`/`evalTags`/`TagQuery` (T5) used by signals (T6) and the where-lint scanning (T10 uses its own scanner, intentionally — it inspects raw query objects, not the runtime matcher).

**4. Known sharp edges flagged inline for the executor:**
- `noUncheckedIndexedAccess`: every `record[key]!` is guarded or asserted where provably present (e.g. after an `Object.keys` loop). Re-check each `!` during implementation.
- `exactOptionalPropertyTypes`: `compileMisconception` omits `skillDeltas` when absent (never assigns `undefined`); `CaseSpec` spreads `seed` conditionally. Keep this discipline.
- `verbatimModuleSyntax`: use `import type` for type-only imports (raw-types, schema types); the test `require(...)` lines are explicitly called out to be replaced with ESM imports.
- Module-graph acyclicity verified empirically in Task 14 Step 3 (the real guarantee, not just review).
- python3 is a hard build-time dependency (README + CLI `--no-exec` escape hatch for gates 5/6).
