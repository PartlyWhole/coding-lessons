# Trellis M3b — Build Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the short-circuiting `build` evaluation ladder — `@trellis/engine`'s `evaluate` (Run → Test → AST → Property) plus `@trellis/sandbox`'s §6.3 `parseAndMatch` AST interpreter — so a learner's Python submission is graded deterministically into a `Diagnosis`, agreeing with `content/verify/harness.py` on all 21 misconception fixtures.

**Architecture:** The pure engine owns the ladder, the three comparators (`deep-equal`/`float-close`/`set-equal`), a seeded PRNG + bounded generators + shrinking, and the test/property runners. Its one effectful dependency — a `BuildSandbox` (the frozen `Sandbox` plus an additive `parseAndMatch`) — is **injected**, never imported. The sandbox package owns the Python the worker runs: it lifts `harness.py`'s §6.3 interpreter verbatim as the `parseAndMatch` payload (zero version-skew with execution) and ships an **offline CPython adapter** (`createLocalSandbox`) that is a faithful subprocess twin of the deferred Pyodide worker, used as the differential oracle. No `@trellis/schema` type changes.

**Tech Stack:** TypeScript (ESM, `NodeNext`), Vitest, `@sinclair/typebox` (consumed as types), Python 3 via `node:child_process` (offline adapter + differential), Pyodide (real worker path — typechecked only, behavior **deferred** to a networked browser).

---

## Why these design decisions (read before Task 1)

START-HERE asks the plan to justify the reuse-vs-Python-in-Pyodide call and the seam shape. The decisions below are settled here; **do not re-litigate them mid-execution.** None changes the frozen `@trellis/schema` contract.

1. **`parseAndMatch` is the §6.3 interpreter lifted from `harness.py`, run in the sandbox via the frozen `Sandbox.run`.** Per §6.3 the *runtime* matcher must be Python-in-the-sandbox (zero version-skew with execution), not a TS re-implementation. We lift `harness.py`'s interpreter (`pred_ok`/`node_matches`/`query_matches`/`eval_tags`, lines 45–149) verbatim into a Python source constant. `parseAndMatch(code, queries)` builds a self-contained program = `<interpreter> + base64-embedded {code, queries}` and calls `sandbox.run({ code, entrypoint: undefined })`, reading the matched tags as a sentinel-delimited JSON array on `stdout`. It **does not exec** the learner code (only `ast.parse` + walk), so a malformed or infinite submission cannot hang the matcher. This reuses the existing M3a worker protocol **unchanged** — no new message kind, no schema change.

2. **The engine depends on a local `BuildSandbox` interface = `Sandbox & { parseAndMatch }`.** The frozen `Sandbox` is `{ run }` only (verified: `packages/schema/src/bundle.ts:89`). `parseAndMatch` is the §15 `LanguageAnalyzer` seam, which is **not** in the frozen schema and must not be added there. So the engine declares the minimal shape it needs; the sandbox package wires concrete `parseAndMatch` onto the objects it hands the engine (both the Pyodide `ManagedSandbox` and the offline `LocalSandbox`). This is exactly the additive pattern M3a already uses (`ManagedSandbox extends Sandbox` with `warmup/status/dispose`). Engine purity holds: it imports an *interface*, never a concrete sandbox.

3. **The engine's test/property runner emits a minimal Python call-shim and drives `sandbox.run`.** The frozen `run` calls `entrypoint()` with **no args** and cannot pass a test input. To call `entrypoint(*args)` (or seed `random` before the call) the engine builds a tiny driver program — exactly as `harness.py`'s `build_signals` does (lines 211–252), which is our reference. This is pure string construction (no effects). The large language-specific piece (the AST interpreter) stays in the sandbox; only this ~6-line shim is Python-aware in the engine. Justification for the mild relaxation of §12.2's "engine never sees source": it is forced by the frozen `run` contract, and mirroring `harness.py` is what guarantees differential agreement.

4. **Offline CPython twin (`createLocalSandbox`) is the differential oracle.** Real Pyodide/WASM cannot be fetched here (no network — same constraint that bit M3a). Per START-HERE we build + verify against a mock `Sandbox` + local CPython subprocess — exactly how `harness.py` executes fixtures. `createLocalSandbox` runs the **same** `RUN_HARNESS` Python as the deferred Pyodide worker (extracted to one shared constant) via `python3 -c`, so it is a true twin, not an approximation. **Real-Pyodide-in-WASM verification of `parseAndMatch` and the live ladder is DEFERRED** to a networked browser and is called out as such — we do not claim end-to-end.

5. **Determinism is enforced structurally.** The PRNG is seeded solely from `PropertyConfig.seed`; no `Date.now()` / `Math.random()` anywhere in engine `src`. Same `(submission, EvaluatorConfig, seed)` → identical signals and identical counterexample. The injected `now`/`id`/`learnerId` (the `DiagnoseEffects` pattern M2 already established) keep `evaluate` pure.

6. **The differential agreement gate.** `harness.py` gate 5 computes signals from **tests + AST only** (it never runs property generation; `build_signals` sets `tests`/`runError`/`astTags`, never `propertyFailed`). So the differential test computes signals via our `testRunner` + `parseAndMatch` over the **same** subset, runs the real `detect`, and asserts every `triggers` fixture fires and every `notTriggers` fixture stays silent — the same assertion `harness.py` makes, proving our interpreter + runner agree with it. The full ladder (with property + short-circuit + determinism) is proven separately in the acceptance test.

### File structure (what each new file owns)

`packages/engine/src/`:
- `compare.ts` — `compareValues(comparator, a, b)` dispatch over `deep-equal` (reuse `deepEqual`) / `float-close` / `set-equal`; plus `floatClose`, `setEqual`.
- `prng.ts` — `makePrng(seed)` deterministic PRNG (mulberry32): `nextU32`, `nextFloat`, `nextInt(minIncl, maxIncl)`, `pick(arr)`.
- `generators.ts` — `genValue(spec, prng)` over `GenSpec | ElemSpec`; `genArgs(generators, prng)` → ordered arg tuple.
- `shrink.ts` — `shrink(spec, value, stillFails)` → minimal failing value (generic per type).
- `buildSandbox.ts` — `BuildSandbox` interface (`Sandbox & { parseAndMatch }`); `BuildSubmission` type; `Submission` union; the `SENTINEL` constant.
- `pyDriver.ts` — `entrypointDriver({ code, entrypoint, args, seed })` → program string; `parseDriverStdout(stdout)` → `{ ok: true, value } | { ok: false }`.
- `testRunner.ts` — `runTests(step, code, sandbox)` → `{ passed, failed, failures, runError? }` (mirrors `harness.py` `build_signals`).
- `propertyRunner.ts` — `runProperty(property, entrypoint, code, sandbox)` → `{ passed, counterexample? }` (generate → run learner+oracle → compare → shrink).
- `evaluate.ts` — `evaluate(step, submission, sandbox, bundle, fx, cfg?)` → `Diagnosis` (build path; routes non-build to M2 `diagnoseNonBuild`); `assembleBuildSignals` helper.
- `index.ts` — extend the barrel.

`packages/sandbox/src/`:
- `run-harness.ts` — `RUN_HARNESS` (the `__trellis_run` Python, extracted from `pyodide-worker.ts` so the worker and the offline twin share one source).
- `ast-query.ts` — `AST_QUERY_INTERPRETER` (the §6.3 interpreter Python, lifted from `harness.py`) + `buildMatchProgram(code, queries)`.
- `parse-and-match.ts` — `parseAndMatch(run, code, queries)` → `Promise<string[]>` (`run` is the frozen `Sandbox["run"]`).
- `local-cpython.ts` — `createLocalSandbox(opts?)` → `{ run, parseAndMatch }` offline CPython twin (subprocess `python3`).
- `index.ts` — extend the barrel; wire `parseAndMatch` onto `createSandbox`'s return.

`packages/sandbox/test/`:
- `local-cpython.test.ts` — unit-test the offline twin's `run` (syntax/runtime/success/timeout/stdin) and `parseAndMatch` (a few queries).
- `differential.test.ts` — the 21-fixture differential vs `harness.py`'s expectation, via engine `evaluate` signals + `detect`.
- `acceptance.test.ts` — §4 acceptance + determinism.

Sandbox gains a **devDependency** on `@trellis/engine` (workspace-local; acyclic — engine never imports sandbox) so the cross-package differential/acceptance tests can wire the full ladder.

---

## Task 1: Comparators — `float-close` and `set-equal`

**Files:**
- Create: `packages/engine/src/compare.ts`
- Test: `packages/engine/test/compare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/test/compare.test.ts
import { describe, it, expect } from "vitest";
import { compareValues, floatClose, setEqual } from "../src/compare.js";

describe("floatClose", () => {
  it("accepts values within abs+rel tolerance and rejects outside", () => {
    expect(floatClose(1.0, 1.0 + 1e-12)).toBe(true);
    expect(floatClose(1000.0, 1000.0 + 1e-7)).toBe(true); // rel tolerance
    expect(floatClose(1.0, 1.2)).toBe(false);
  });
  it("is total over non-numbers (falls back to structural)", () => {
    expect(floatClose("a", "a")).toBe(true);
    expect(floatClose("a", "b")).toBe(false);
    expect(floatClose([1.0], [1.0 + 1e-12])).toBe(true);
    expect(floatClose({ x: 1.0 }, { x: 1.0 + 1e-12 })).toBe(true);
  });
});

describe("setEqual", () => {
  it("is order-insensitive for arrays", () => {
    expect(setEqual([1, 2, 3], [3, 2, 1])).toBe(true);
    expect(setEqual([1, 2, 2], [2, 1, 2])).toBe(true); // multiset
    expect(setEqual([1, 2, 2], [1, 2])).toBe(false);
    expect(setEqual([1, 2], [1, 3])).toBe(false);
  });
});

describe("compareValues dispatch", () => {
  it("defaults to deep-equal when comparator is undefined", () => {
    expect(compareValues(undefined, { a: 1 }, { a: 1 })).toBe(true);
    expect(compareValues("deep-equal", [1, 2], [2, 1])).toBe(false); // order-sensitive
  });
  it("routes to float-close and set-equal", () => {
    expect(compareValues("float-close", 1.0, 1.0 + 1e-12)).toBe(true);
    expect(compareValues("set-equal", [1, 2], [2, 1])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @trellis/engine exec vitest run test/compare.test.ts`
Expected: FAIL — cannot resolve `../src/compare.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/engine/src/compare.ts
import type { Json } from "@trellis/schema";
import { deepEqual } from "./deepEqual.js";

// §6.2 float-close: abs OR rel tolerance for numerics; recurses into arrays/objects
// so a structure of floats compares element-wise. Non-numerics fall back to deepEqual.
const ABS = 1e-9;
const REL = 1e-6;

export function floatClose(a: Json, b: Json): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return true;
    const diff = Math.abs(a - b);
    return diff <= ABS || diff <= REL * Math.max(Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => floatClose(x as Json, b[i] as Json));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, Json>;
    const bo = b as Record<string, Json>;
    const ak = Object.keys(ao);
    if (ak.length !== Object.keys(bo).length) return false;
    return ak.every(
      (k) => Object.prototype.hasOwnProperty.call(bo, k) && floatClose(ao[k] as Json, bo[k] as Json),
    );
  }
  return deepEqual(a, b);
}

// §6.2 set-equal: order-insensitive multiset equality for arrays (top level only).
// Non-arrays fall back to deepEqual.
export function setEqual(a: Json, b: Json): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return deepEqual(a, b);
  if (a.length !== b.length) return false;
  const remaining = [...b] as Json[];
  for (const x of a as Json[]) {
    const idx = remaining.findIndex((y) => deepEqual(x, y));
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }
  return remaining.length === 0;
}

export type Comparator = "deep-equal" | "float-close" | "set-equal";

export function compareValues(comparator: Comparator | undefined, a: Json, b: Json): boolean {
  switch (comparator) {
    case "float-close":
      return floatClose(a, b);
    case "set-equal":
      return setEqual(a, b);
    case "deep-equal":
    case undefined:
      return deepEqual(a, b);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @trellis/engine exec vitest run test/compare.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/compare.ts packages/engine/test/compare.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): add float-close/set-equal comparators (§6.2)"
```

---

## Task 2: Seeded PRNG (deterministic, no `Math.random`)

**Files:**
- Create: `packages/engine/src/prng.ts`
- Test: `packages/engine/test/prng.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/test/prng.test.ts
import { describe, it, expect } from "vitest";
import { makePrng } from "../src/prng.js";

describe("makePrng", () => {
  it("is deterministic: same seed → identical stream", () => {
    const a = makePrng(1234);
    const b = makePrng(1234);
    const seqA = Array.from({ length: 8 }, () => a.nextU32());
    const seqB = Array.from({ length: 8 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });
  it("different seeds diverge", () => {
    const a = makePrng(1);
    const b = makePrng(2);
    expect(a.nextU32()).not.toBe(b.nextU32());
  });
  it("nextInt is inclusive on both ends and stays in range", () => {
    const p = makePrng(42);
    for (let i = 0; i < 1000; i++) {
      const v = p.nextInt(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
  it("nextInt(n, n) returns n", () => {
    expect(makePrng(9).nextInt(5, 5)).toBe(5);
  });
  it("nextFloat is in [0,1)", () => {
    const p = makePrng(7);
    for (let i = 0; i < 1000; i++) {
      const v = p.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("pick selects a member deterministically", () => {
    expect(makePrng(3).pick(["a", "b", "c"])).toBe(makePrng(3).pick(["a", "b", "c"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @trellis/engine exec vitest run test/prng.test.ts`
Expected: FAIL — cannot resolve `../src/prng.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/engine/src/prng.ts
// Deterministic PRNG (mulberry32) seeded ONLY from PropertyConfig.seed. The whole
// point of M3b is reproducibility: no Date.now() / Math.random() anywhere (§6.4).

export interface Prng {
  nextU32(): number; // uint32
  nextFloat(): number; // [0, 1)
  nextInt(minIncl: number, maxIncl: number): number; // inclusive both ends
  pick<T>(arr: readonly T[]): T;
}

export function makePrng(seed: number): Prng {
  // Coerce to a uint32 state. mulberry32 is a well-known tiny, well-distributed PRNG.
  let a = seed >>> 0;
  const nextU32 = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const nextFloat = (): number => nextU32() / 0x100000000; // 2^32
  const nextInt = (minIncl: number, maxIncl: number): number => {
    const lo = Math.ceil(minIncl);
    const hi = Math.floor(maxIncl);
    if (hi <= lo) return lo;
    const span = hi - lo + 1;
    return lo + (nextU32() % span);
  };
  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error("pick from empty array");
    return arr[nextInt(0, arr.length - 1)]!;
  };
  return { nextU32, nextFloat, nextInt, pick };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @trellis/engine exec vitest run test/prng.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/prng.ts packages/engine/test/prng.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): add seeded deterministic PRNG (§6.4)"
```

---

## Task 3: Bounded generators over `GenSpec`/`ElemSpec`

**Files:**
- Create: `packages/engine/src/generators.ts`
- Test: `packages/engine/test/generators.test.ts`

Reference: `GenSpec`/`ElemSpec` schema at `packages/schema/src/evaluator.ts:71-107`. Types: `int`/`float`/`str`/`list`/`bool`/`choice`. `genArgs` returns the ordered argument tuple for `entrypoint(*args)` (generator order = arg order, e.g. `get_random(a, b)` → `[a, b]`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/test/generators.test.ts
import { describe, it, expect } from "vitest";
import type { GenSpec } from "@trellis/schema";
import { genValue, genArgs } from "../src/generators.js";
import { makePrng } from "../src/prng.js";

describe("genValue", () => {
  it("int respects [min,max] inclusive", () => {
    const spec: GenSpec = { param: "n", type: "int", min: 1, max: 5 };
    const p = makePrng(1234);
    for (let i = 0; i < 500; i++) {
      const v = genValue(spec, p) as number;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
  it("str respects length bounds and alphabet", () => {
    const spec: GenSpec = { param: "s", type: "str", min: 0, max: 8, alphabet: "abc" };
    const p = makePrng(1234);
    for (let i = 0; i < 500; i++) {
      const v = genValue(spec, p) as string;
      expect(v.length).toBeGreaterThanOrEqual(0);
      expect(v.length).toBeLessThanOrEqual(8);
      expect([...v].every((c) => "abc".includes(c))).toBe(true);
    }
  });
  it("list uses elem spec and length bounds", () => {
    const spec: GenSpec = { param: "xs", type: "list", min: 0, max: 4, elem: { type: "int", min: 0, max: 9 } };
    const p = makePrng(1234);
    const v = genValue(spec, p) as number[];
    expect(Array.isArray(v)).toBe(true);
    expect(v.length).toBeLessThanOrEqual(4);
    expect(v.every((n) => n >= 0 && n <= 9)).toBe(true);
  });
  it("choice picks only from the provided set", () => {
    const spec: GenSpec = { param: "c", type: "choice", choices: ["x", "y", "z"] };
    const p = makePrng(1234);
    expect(["x", "y", "z"]).toContain(genValue(spec, p));
  });
  it("bool yields a boolean", () => {
    expect(typeof genValue({ param: "b", type: "bool" }, makePrng(1))).toBe("boolean");
  });
  it("is deterministic for a fixed seed", () => {
    const spec: GenSpec = { param: "n", type: "int", min: 1, max: 100 };
    expect(genValue(spec, makePrng(99))).toBe(genValue(spec, makePrng(99)));
  });
});

describe("genArgs", () => {
  it("returns args in generator order", () => {
    const gens: GenSpec[] = [
      { param: "a", type: "int", min: 1, max: 5 },
      { param: "b", type: "int", min: 50, max: 100 },
    ];
    const args = genArgs(gens, makePrng(1234));
    expect(args).toHaveLength(2);
    expect(args[0]).toBeGreaterThanOrEqual(1);
    expect(args[0]).toBeLessThanOrEqual(5);
    expect(args[1]).toBeGreaterThanOrEqual(50);
    expect(args[1]).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @trellis/engine exec vitest run test/generators.test.ts`
Expected: FAIL — cannot resolve `../src/generators.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/engine/src/generators.ts
import type { GenSpec, ElemSpec, Json } from "@trellis/schema";
import type { Prng } from "./prng.js";

// A GenSpec is an ElemSpec plus a required `param`; genValue only reads the shared
// fields, so it accepts either. Bounded + total: every domain is finite and meaningful.
type AnySpec = ElemSpec | GenSpec;

export function genValue(spec: AnySpec, prng: Prng): Json {
  switch (spec.type) {
    case "int": {
      const lo = Math.ceil(spec.min ?? 0);
      const hi = Math.floor(spec.max ?? lo + 10);
      return prng.nextInt(lo, hi);
    }
    case "float": {
      const lo = spec.min ?? 0;
      const hi = spec.max ?? lo + 1;
      return lo + prng.nextFloat() * (hi - lo);
    }
    case "bool":
      return prng.nextU32() % 2 === 0;
    case "str": {
      const alphabet = spec.alphabet && spec.alphabet.length > 0 ? spec.alphabet : "abcdefghijklmnopqrstuvwxyz";
      const lo = Math.max(0, Math.ceil(spec.min ?? 0));
      const hi = Math.max(lo, Math.floor(spec.max ?? lo + 8));
      const len = prng.nextInt(lo, hi);
      let s = "";
      for (let i = 0; i < len; i++) s += alphabet[prng.nextInt(0, alphabet.length - 1)];
      return s;
    }
    case "list": {
      const lo = Math.max(0, Math.ceil(spec.min ?? 0));
      const hi = Math.max(lo, Math.floor(spec.max ?? lo + 4));
      const len = prng.nextInt(lo, hi);
      const elem: AnySpec = spec.elem ?? { type: "int", min: 0, max: 9 };
      const out: Json[] = [];
      for (let i = 0; i < len; i++) out.push(genValue(elem, prng));
      return out;
    }
    case "choice": {
      const choices = spec.choices ?? [];
      if (choices.length === 0) throw new Error("choice generator has no choices");
      return prng.pick(choices);
    }
  }
}

// The argument tuple for entrypoint(*args): one value per generator, in order.
export function genArgs(generators: readonly GenSpec[], prng: Prng): Json[] {
  return generators.map((g) => genValue(g, prng));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @trellis/engine exec vitest run test/generators.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/generators.ts packages/engine/test/generators.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): bounded generators over GenSpec/ElemSpec (§6.4)"
```

---

## Task 4: Shrinking to a minimal counterexample

**Files:**
- Create: `packages/engine/src/shrink.ts`
- Test: `packages/engine/test/shrink.test.ts`

`shrink(spec, value, stillFails)` greedily reduces `value` toward the spec's floor while `stillFails(candidate)` holds, returning the smallest failing value found. Deterministic: it tries a fixed sequence of candidates (halving numbers toward `min`, trimming list/string length, recursing into list elements). `stillFails` is synchronous here (the property runner supplies a memoized predicate driven by already-collected results — see Task 7).

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/test/shrink.test.ts
import { describe, it, expect } from "vitest";
import type { GenSpec } from "@trellis/schema";
import { shrink } from "../src/shrink.js";

describe("shrink", () => {
  it("shrinks an int toward its min while the predicate fails", () => {
    const spec: GenSpec = { param: "n", type: "int", min: 0, max: 100 };
    // 'fails' whenever n >= 10 → minimal failing int is exactly 10.
    const result = shrink(spec, 87, (c) => (c as number) >= 10);
    expect(result).toBe(10);
  });
  it("shrinks a string toward its min length", () => {
    const spec: GenSpec = { param: "s", type: "str", min: 0, max: 12, alphabet: "ab" };
    // 'fails' whenever length >= 2 → minimal failing length is 2.
    const result = shrink(spec, "aababb", (c) => (c as string).length >= 2) as string;
    expect(result.length).toBe(2);
  });
  it("shrinks a list toward its min length", () => {
    const spec: GenSpec = { param: "xs", type: "list", min: 0, max: 8, elem: { type: "int", min: 0, max: 9 } };
    const result = shrink(spec, [3, 1, 4, 1, 5], (c) => (c as number[]).length >= 1) as number[];
    expect(result.length).toBe(1);
  });
  it("returns the original when no smaller candidate fails", () => {
    const spec: GenSpec = { param: "n", type: "int", min: 0, max: 100 };
    expect(shrink(spec, 5, (c) => (c as number) === 5)).toBe(5);
  });
  it("is deterministic", () => {
    const spec: GenSpec = { param: "n", type: "int", min: 0, max: 100 };
    const f = (c: unknown) => (c as number) >= 10;
    expect(shrink(spec, 87, f)).toBe(shrink(spec, 87, f));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @trellis/engine exec vitest run test/shrink.test.ts`
Expected: FAIL — cannot resolve `../src/shrink.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/engine/src/shrink.ts
import type { GenSpec, ElemSpec, Json } from "@trellis/schema";

type AnySpec = ElemSpec | GenSpec;
export type StillFails = (candidate: Json) => boolean;

// Candidate-smaller values for one shrink step, ordered smallest-first so the greedy
// loop converges to a minimal counterexample. Deterministic (no randomness).
function candidates(spec: AnySpec, value: Json): Json[] {
  switch (spec.type) {
    case "int":
    case "float": {
      const n = value as number;
      const floor = spec.min ?? 0;
      if (n === floor) return [];
      const out: Json[] = [];
      // Binary search toward the floor: floor, then halfway points.
      let lo = floor;
      let hi = n;
      out.push(floor);
      while (hi - lo > 1) {
        const mid = spec.type === "int" ? Math.floor((lo + hi) / 2) : (lo + hi) / 2;
        if (mid === lo || mid === hi) break;
        out.push(mid);
        lo = mid;
      }
      return out.filter((c) => c !== n);
    }
    case "str": {
      const s = value as string;
      if (s.length <= (spec.min ?? 0)) return [];
      // Drop one char at a time from the end, plus a halved prefix.
      const half = s.slice(0, Math.floor(s.length / 2));
      return [half, s.slice(0, s.length - 1)].filter((c) => c.length >= (spec.min ?? 0) && c !== s);
    }
    case "list": {
      const xs = value as Json[];
      if (xs.length <= (spec.min ?? 0)) return [];
      const half = xs.slice(0, Math.floor(xs.length / 2));
      return [half, xs.slice(0, xs.length - 1)].filter((c) => c.length >= (spec.min ?? 0));
    }
    case "bool":
    case "choice":
      return []; // atomic — nothing smaller to try
  }
}

export function shrink(spec: AnySpec, value: Json, stillFails: StillFails): Json {
  let current = value;
  // Greedy fixpoint: repeatedly take the smallest still-failing candidate.
  for (;;) {
    let shrunk = false;
    for (const c of candidates(spec, current)) {
      if (stillFails(c)) {
        current = c;
        shrunk = true;
        break;
      }
    }
    if (!shrunk) return current;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @trellis/engine exec vitest run test/shrink.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/shrink.ts packages/engine/test/shrink.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): deterministic shrinking to minimal counterexample (§6.4)"
```

---

## Task 5: `BuildSandbox` interface + Python driver codegen

**Files:**
- Create: `packages/engine/src/buildSandbox.ts`
- Create: `packages/engine/src/pyDriver.ts`
- Test: `packages/engine/test/pyDriver.test.ts`

The driver embeds args as base64-encoded JSON and `json.loads`-decodes them in Python (base64 is ASCII → no quote/escape hazards; `json.loads` yields proper Python objects incl. `True`/`False`). It writes a `SENTINEL`-prefixed JSON result to stdout so the engine can split it from any learner output. Seeding mirrors `harness.py:235` — `import random as _sd; _sd.seed(<seed>)` seeds the global Mersenne Twister the learner's `random.randint` reads, **without** binding `random` in the learner namespace (so a missing `import random` still `NameError`s).

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/test/pyDriver.test.ts
import { describe, it, expect } from "vitest";
import { entrypointDriver, parseDriverStdout, SENTINEL } from "../src/pyDriver.js";

describe("entrypointDriver", () => {
  it("embeds the learner code and emits a base64 args decode + sentinel print", () => {
    const prog = entrypointDriver({ code: "def greet(name):\n    return 'Hi ' + name", entrypoint: "greet", args: ["Alan"] });
    expect(prog).toContain("def greet(name)");
    expect(prog).toContain("b64decode");
    expect(prog).toContain("greet(*");
    expect(prog).toContain(SENTINEL);
    expect(prog).not.toContain("_sd.seed"); // no seed → no seeding line
  });
  it("includes seeding when a seed is provided", () => {
    const prog = entrypointDriver({ code: "x=1", entrypoint: "f", args: [1, 2], seed: 1234 });
    expect(prog).toContain("import random as _sd");
    expect(prog).toContain("_sd.seed(1234)");
  });
});

describe("parseDriverStdout", () => {
  it("extracts the JSON after the sentinel and ignores preceding output", () => {
    const out = `some learner print\n${SENTINEL}{"v": 42}`;
    expect(parseDriverStdout(out)).toEqual({ ok: true, value: 42 });
  });
  it("reports failure when the sentinel is absent", () => {
    expect(parseDriverStdout("no sentinel here")).toEqual({ ok: false });
  });
});
```

Note: `parseDriverStdout` expects the driver to emit `{"v": <result>}` after the sentinel (a wrapper object so a bare `null`/`false` result is unambiguous).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @trellis/engine exec vitest run test/pyDriver.test.ts`
Expected: FAIL — cannot resolve `../src/pyDriver.js`.

- [ ] **Step 3: Write the implementations**

```ts
// packages/engine/src/buildSandbox.ts
import type { Sandbox, RunResult, AstQuery } from "@trellis/schema";

// The §15 LanguageAnalyzer seam, realized WITHOUT touching the frozen schema. The
// engine depends only on this structural shape; the @trellis/sandbox package wires a
// concrete `parseAndMatch` onto the object it injects (Pyodide host or offline twin).
// `run` is exactly the frozen Sandbox.run.
export interface BuildSandbox extends Sandbox {
  parseAndMatch(code: string, queries: { tag: string; query: AstQuery }[]): Promise<string[]>;
}

// The learner's submission for a build step is its source code.
export interface BuildSubmission {
  kind: "build";
  code: string;
}

export type { RunResult };
```

```ts
// packages/engine/src/pyDriver.ts
import type { Json } from "@trellis/schema";

// Marker separating any learner stdout from the driver's JSON result. The \x00 bytes
// make accidental collision with learner text effectively impossible.
export const SENTINEL = "\x00__TRELLIS_RESULT__\x00";

export interface EntrypointDriver {
  code: string;
  entrypoint: string;
  args: Json[];
  seed?: number;
}

function toBase64Json(value: unknown): string {
  // Buffer is a Node global; the engine's runtime here is Node (tests) and the bundler
  // for the browser provides Buffer or we swap to btoa at M5. ASCII base64 only.
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64");
}

// Build a self-contained program: learner code, optional PRNG seeding, then call
// entrypoint(*args) and print SENTINEL + {"v": result}. Mirrors harness.py build_signals.
export function entrypointDriver(d: EntrypointDriver): string {
  const seeding = d.seed !== undefined ? `\nimport random as _sd\n_sd.seed(${d.seed})` : "";
  const argsB64 = toBase64Json(d.args);
  return (
    d.code +
    seeding +
    `\nimport json as _t_json, base64 as _t_b64, sys as _t_sys` +
    `\n_t_args = _t_json.loads(_t_b64.b64decode("${argsB64}").decode("utf-8"))` +
    `\n_t_res = ${d.entrypoint}(*_t_args)` +
    `\n_t_sys.stdout.write(${JSON.stringify(SENTINEL)} + _t_json.dumps({"v": _t_res}, default=str))`
  );
}

export type DriverResult = { ok: true; value: Json } | { ok: false };

export function parseDriverStdout(stdout: string): DriverResult {
  const idx = stdout.lastIndexOf(SENTINEL);
  if (idx === -1) return { ok: false };
  const tail = stdout.slice(idx + SENTINEL.length);
  try {
    const wrapped = JSON.parse(tail) as { v: Json };
    return { ok: true, value: wrapped.v };
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @trellis/engine exec vitest run test/pyDriver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/buildSandbox.ts packages/engine/src/pyDriver.ts packages/engine/test/pyDriver.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): BuildSandbox seam + Python entrypoint driver codegen"
```

---

## Task 6: Test runner (mirrors `harness.py` `build_signals`)

**Files:**
- Create: `packages/engine/src/testRunner.ts`
- Test: `packages/engine/test/testRunner.test.ts`

`runTests` handles both styles, matching `harness.py:227-251`:
- **entrypoint style** (`run.entrypoint` set): for each case, `args = Array.isArray(input) ? input : [input]`; build a driver (with seeding when `property.seed` is present); `sandbox.run`; a case **fails** if the run errored OR the returned value ≠ expected (by comparator). The **first** case whose run yields a `runtime` error sets `runError` (a per-case entrypoint exception surfaces as `runError: "runtime"`, exactly as in `harness.py` — this is what lets `mis.var.undefined`'s `{ runError: runtime }` match).
- **stdin style** (no entrypoint): `sandbox.run({ code, stdin })`; a case fails if it errored OR `stdout` ≠ expected.

`failures` carries `{ caseIndex, got }` per failed case (the schema shape). `got` is the returned value (entrypoint) or `stdout` (stdin), or `null` when the run errored.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/test/testRunner.test.ts
import { describe, it, expect } from "vitest";
import type { BuildStep, RunResult, RunRequest } from "@trellis/schema";
import { runTests } from "../src/testRunner.js";
import { SENTINEL } from "../src/pyDriver.js";

// A scripted fake BuildSandbox: returns canned RunResults keyed by a substring of code.
function fakeSandbox(handler: (req: RunRequest) => RunResult) {
  return {
    run: async (req: RunRequest): Promise<RunResult> => handler(req),
    parseAndMatch: async (): Promise<string[]> => [],
  };
}

const greetStep = {
  kind: "build",
  evaluator: {
    run: { timeoutMs: 2000, memoryMb: 256, entrypoint: "greet" },
    tests: { comparator: "deep-equal", cases: [
      { input: "Alan", expected: "Hi Alan!" },
      { input: "Bo", expected: "Hi Bo!" },
    ] },
  },
} as unknown as BuildStep;

const result = (over: Partial<RunResult>): RunResult =>
  ({ ran: true, stdout: "", wallMs: 1, timedOut: false, ...over });

describe("runTests — entrypoint style", () => {
  it("passes when every case returns the expected value", async () => {
    const sb = fakeSandbox((req) => {
      const name = req.code.includes('"Alan"') || req.code.includes("Alan") ? "Alan" : "Bo";
      // emulate greet by echoing what the embedded args decode to is overkill; instead
      // return the expected for whichever case (driver embeds args as base64 — we just
      // answer correctly for both here).
      const v = req.code.includes("QWxhbg==") ? "Hi Alan!" : "Hi Bo!";
      void name;
      return result({ stdout: SENTINEL + JSON.stringify({ v }) });
    });
    const r = await runTests(greetStep, "def greet(name):\n    return 'Hi ' + name + '!'", sb);
    expect(r.passed).toBe(2);
    expect(r.failed).toBe(0);
    expect(r.runError).toBeUndefined();
  });

  it("a per-case runtime error sets runError and fails that case", async () => {
    const sb = fakeSandbox(() => result({ ran: true, error: { type: "runtime", message: "NameError" } }));
    const r = await runTests(greetStep, "def greet(name):\n    return missing", sb);
    expect(r.runError?.type).toBe("runtime");
    expect(r.failed).toBeGreaterThan(0);
  });

  it("a wrong value fails the case without a runError", async () => {
    const sb = fakeSandbox(() => result({ stdout: SENTINEL + JSON.stringify({ v: "WRONG" }) }));
    const r = await runTests(greetStep, "def greet(name):\n    return 'WRONG'", sb);
    expect(r.failed).toBe(2);
    expect(r.runError).toBeUndefined();
    expect(r.failures[0]).toEqual({ caseIndex: 0, got: "WRONG" });
  });
});

describe("runTests — stdin style", () => {
  const stdinStep = {
    kind: "build",
    evaluator: {
      run: { timeoutMs: 2000, memoryMb: 256 },
      tests: { comparator: "deep-equal", cases: [{ input: "Alan\n", expected: "Hi Alan!\n" }] },
    },
  } as unknown as BuildStep;

  it("compares stdout to expected", async () => {
    const sb = fakeSandbox((req) => result({ stdout: req.stdin === "Alan\n" ? "Hi Alan!\n" : "?" }));
    const r = await runTests(stdinStep, "print('Hi ' + input() + '!')", sb);
    expect(r.passed).toBe(1);
    expect(r.failed).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @trellis/engine exec vitest run test/testRunner.test.ts`
Expected: FAIL — cannot resolve `../src/testRunner.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/engine/src/testRunner.ts
import type { BuildStep, Json } from "@trellis/schema";
import type { BuildSandbox } from "./buildSandbox.js";
import { compareValues, type Comparator } from "./compare.js";
import { entrypointDriver, parseDriverStdout } from "./pyDriver.js";

export interface TestRunResult {
  passed: number;
  failed: number;
  failures: { caseIndex: number; got: Json }[];
  runError?: { type: "syntax" | "runtime" };
}

// §6.2 test runner. Mirrors harness.py build_signals so the offline differential agrees:
// a case fails on a run error OR a comparator mismatch; the first runtime error sets
// runError (a per-case entrypoint exception surfaces as runError: "runtime").
export async function runTests(
  step: BuildStep,
  code: string,
  sandbox: BuildSandbox,
): Promise<TestRunResult> {
  const ev = step.evaluator;
  const cases = ev.tests?.cases ?? [];
  const comparator = ev.tests?.comparator as Comparator | undefined;
  const entrypoint = ev.run.entrypoint;
  const seed = ev.property?.seed;
  const failures: { caseIndex: number; got: Json }[] = [];
  let runError: { type: "syntax" | "runtime" } | undefined;
  let passed = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    let got: Json = null;
    let errored = false;
    let ok = false;

    if (entrypoint) {
      const args = Array.isArray(c.input) ? (c.input as Json[]) : [c.input as Json];
      const driver = entrypointDriver({ code, entrypoint, args, seed });
      const res = await sandbox.run({ code: driver, timeoutMs: ev.run.timeoutMs, memoryMb: ev.run.memoryMb });
      if (res.error || res.timedOut || !res.ran) {
        errored = true;
        if (res.error?.type === "runtime" || res.timedOut) runError ??= { type: "runtime" };
        else if (res.error?.type === "syntax") runError ??= { type: "syntax" };
      } else {
        const parsed = parseDriverStdout(res.stdout);
        if (parsed.ok) {
          got = parsed.value;
          ok = compareValues(comparator, got, c.expected as Json);
        } else {
          errored = true;
        }
      }
    } else {
      const stdin = c.input === undefined || c.input === null ? "" : String(c.input);
      const res = await sandbox.run({ code, stdin, timeoutMs: ev.run.timeoutMs, memoryMb: ev.run.memoryMb });
      if (res.error || res.timedOut || !res.ran) {
        errored = true;
        if (res.error?.type === "runtime" || res.timedOut) runError ??= { type: "runtime" };
        else if (res.error?.type === "syntax") runError ??= { type: "syntax" };
      } else {
        got = res.stdout;
        ok = compareValues(comparator, got, c.expected as Json);
      }
    }

    if (ok) passed++;
    else failures.push({ caseIndex: i, got: errored ? null : got });
  }

  return { passed, failed: failures.length, failures, ...(runError ? { runError } : {}) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @trellis/engine exec vitest run test/testRunner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/testRunner.ts packages/engine/test/testRunner.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): build test runner (§6.2), mirrors harness.py build_signals"
```

---

## Task 7: Property runner (generate → run learner+oracle → compare → shrink)

**Files:**
- Create: `packages/engine/src/propertyRunner.ts`
- Test: `packages/engine/test/propertyRunner.test.ts`

`runProperty` (entrypoint-style only — every `property` in the corpus targets an entrypoint) uses a single PRNG seeded from `property.seed`, generates `numCases` argument tuples, and for each runs the **learner** (`code` + driver calling `entrypoint`) and the **oracle** (`referenceImpl` + driver calling `sol`), each seeded identically (so the random node's `random.randint` is reproducible). On the first comparator mismatch it shrinks the failing arg tuple (per-arg, left to right) and returns `{ passed: false, counterexample }`; otherwise `{ passed: true }`. The oracle's entrypoint name is `sol` (corpus convention — verified in every `referenceImpl`). Shrink's `stillFails` predicate re-runs learner+oracle for a candidate and returns whether they still disagree; results are memoized by a JSON key so the same `(submission, seed)` yields the same counterexample.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/test/propertyRunner.test.ts
import { describe, it, expect } from "vitest";
import type { PropertyConfig, RunRequest, RunResult } from "@trellis/schema";
import { runProperty } from "../src/propertyRunner.js";
import { SENTINEL, parseDriverStdout } from "../src/pyDriver.js";

// A fake sandbox that "runs" Python by recognizing our two known entrypoints and
// computing the result in JS from the decoded args. It reads the base64 args back out.
function jsFakeSandbox(impl: (entry: "learner" | "oracle", args: number[]) => number) {
  return {
    parseAndMatch: async (): Promise<string[]> => [],
    run: async (req: RunRequest): Promise<RunResult> => {
      // crude: oracle programs contain "def sol", learner programs contain "def add"
      const entry: "learner" | "oracle" = req.code.includes("def sol") ? "oracle" : "learner";
      const m = req.code.match(/b64decode\("([^"]+)"\)/);
      const args = m ? (JSON.parse(Buffer.from(m[1], "base64").toString("utf-8")) as number[]) : [];
      const v = impl(entry, args);
      return { ran: true, stdout: SENTINEL + JSON.stringify({ v }), wallMs: 1, timedOut: false };
    },
  };
}

const prop: PropertyConfig = {
  referenceImpl: "def sol(a, b):\n    return a + b",
  generators: [
    { param: "a", type: "int", min: 0, max: 50 },
    { param: "b", type: "int", min: 0, max: 50 },
  ],
  numCases: 30,
  seed: 1234,
  comparator: "deep-equal",
};

describe("runProperty", () => {
  it("passes when learner matches the oracle on every case", async () => {
    const sb = jsFakeSandbox((_e, [a, b]) => a + b);
    const r = await runProperty(prop, "add", "def add(a, b):\n    return a + b", sb);
    expect(r.passed).toBe(true);
    expect(r.counterexample).toBeUndefined();
  });

  it("fails and returns a counterexample when learner diverges", async () => {
    // learner computes a*b instead of a+b → mismatch on most inputs.
    const sb = jsFakeSandbox((e, [a, b]) => (e === "oracle" ? a + b : a * b));
    const r = await runProperty(prop, "add", "def add(a, b):\n    return a * b", sb);
    expect(r.passed).toBe(false);
    expect(Array.isArray(r.counterexample)).toBe(true);
  });

  it("is deterministic: identical counterexample for the same seed", async () => {
    const make = () => jsFakeSandbox((e, [a, b]) => (e === "oracle" ? a + b : a * b));
    const r1 = await runProperty(prop, "add", "def add(a, b):\n    return a * b", make());
    const r2 = await runProperty(prop, "add", "def add(a, b):\n    return a * b", make());
    expect(r1.counterexample).toEqual(r2.counterexample);
  });
});

// guard: ensure parseDriverStdout still imported (keeps the fake honest)
void parseDriverStdout;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @trellis/engine exec vitest run test/propertyRunner.test.ts`
Expected: FAIL — cannot resolve `../src/propertyRunner.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/engine/src/propertyRunner.ts
import type { PropertyConfig, Json } from "@trellis/schema";
import type { BuildSandbox } from "./buildSandbox.js";
import { makePrng } from "./prng.js";
import { genArgs } from "./generators.js";
import { compareValues, type Comparator } from "./compare.js";
import { shrink } from "./shrink.js";
import { entrypointDriver, parseDriverStdout } from "./pyDriver.js";

export interface PropertyResult {
  passed: boolean;
  counterexample?: Json;
}

const RUN = { timeoutMs: 5000, memoryMb: 256 };

// Run one entrypoint(args) and return its value, or undefined on any run error.
async function call(
  sandbox: BuildSandbox,
  code: string,
  entrypoint: string,
  args: Json[],
  seed: number,
): Promise<Json | undefined> {
  const driver = entrypointDriver({ code, entrypoint, args, seed });
  const res = await sandbox.run({ code: driver, timeoutMs: RUN.timeoutMs, memoryMb: RUN.memoryMb });
  if (res.error || res.timedOut || !res.ran) return undefined;
  const parsed = parseDriverStdout(res.stdout);
  return parsed.ok ? parsed.value : undefined;
}

// §6.4 property test. Generators seeded from property.seed; learner + oracle each seeded
// identically per call so any internal randomness (random.randint) is reproducible. On
// first mismatch, shrink the failing argument tuple to a minimal counterexample.
export async function runProperty(
  property: PropertyConfig,
  entrypoint: string,
  code: string,
  sandbox: BuildSandbox,
): Promise<PropertyResult> {
  const comparator = property.comparator as Comparator | undefined;
  const prng = makePrng(property.seed);
  const memo = new Map<string, boolean>(); // argsKey → "diverges?"

  // True iff learner and oracle disagree (or learner errors) on this arg tuple.
  const diverges = async (args: Json[]): Promise<boolean> => {
    const key = JSON.stringify(args);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const learner = await call(sandbox, code, entrypoint, args, property.seed);
    const oracle = await call(sandbox, property.referenceImpl, "sol", args, property.seed);
    // oracle is trusted; if it errored we treat as non-diverging (can't blame the learner).
    const bad = oracle === undefined ? false : learner === undefined || !compareValues(comparator, learner, oracle);
    memo.set(key, bad);
    return bad;
  };

  for (let i = 0; i < property.numCases; i++) {
    const args = genArgs(property.generators, prng);
    if (await diverges(args)) {
      // Shrink each argument independently, left to right, holding the others fixed.
      const minimal = [...args];
      for (let j = 0; j < minimal.length; j++) {
        const spec = property.generators[j]!;
        // synchronous predicate over a precomputed cache: we probe diverges() eagerly by
        // collecting candidate results first. Simpler: re-run diverges synchronously via
        // a blocking await loop using a thin wrapper.
        // eslint-disable-next-line no-await-in-loop
        minimal[j] = await shrinkArg(spec, minimal[j]!, j, minimal, diverges);
      }
      return { passed: false, counterexample: minimal };
    }
  }
  return { passed: true };
}

// Shrink one positional argument while the whole tuple still diverges. Because shrink()
// takes a synchronous predicate, we pre-resolve each candidate's divergence by awaiting.
async function shrinkArg(
  spec: PropertyConfig["generators"][number],
  value: Json,
  index: number,
  tuple: Json[],
  diverges: (args: Json[]) => Promise<boolean>,
): Promise<Json> {
  // Local greedy shrink mirroring shrink.ts but async over `diverges`.
  let current = value;
  for (;;) {
    const cands = candidatesFor(spec, current);
    let advanced = false;
    for (const c of cands) {
      const probe = [...tuple];
      probe[index] = c;
      // eslint-disable-next-line no-await-in-loop
      if (await diverges(probe)) {
        current = c;
        tuple[index] = c;
        advanced = true;
        break;
      }
    }
    if (!advanced) return current;
  }
}

// Candidate-smaller values, smallest-first (shared shape with shrink.ts; kept local to
// avoid coupling the async runner to the sync shrink export).
import type { GenSpec, ElemSpec } from "@trellis/schema";
function candidatesFor(spec: GenSpec | ElemSpec, value: Json): Json[] {
  switch (spec.type) {
    case "int":
    case "float": {
      const n = value as number;
      const floor = spec.min ?? 0;
      if (n === floor) return [];
      const out: Json[] = [floor];
      let lo = floor;
      const hi = n;
      while (hi - lo > 1) {
        const mid = spec.type === "int" ? Math.floor((lo + hi) / 2) : (lo + hi) / 2;
        if (mid === lo || mid === hi) break;
        out.push(mid);
        lo = mid;
      }
      return out.filter((c) => c !== n);
    }
    case "str": {
      const s = value as string;
      if (s.length <= (spec.min ?? 0)) return [];
      return [s.slice(0, Math.floor(s.length / 2)), s.slice(0, s.length - 1)].filter(
        (c) => c.length >= (spec.min ?? 0) && c !== s,
      );
    }
    case "list": {
      const xs = value as Json[];
      if (xs.length <= (spec.min ?? 0)) return [];
      return [xs.slice(0, Math.floor(xs.length / 2)), xs.slice(0, xs.length - 1)].filter(
        (c) => c.length >= (spec.min ?? 0),
      );
    }
    default:
      return [];
  }
}
```

> **Implementer note:** Task 4's `shrink.ts` and Task 7's `candidatesFor` intentionally duplicate the candidate-generation shape because one is sync and one is async. If the two-stage reviewer prefers, refactor `candidatesFor` into a shared exported `shrinkCandidates(spec, value)` in `shrink.ts` and import it in both — behavior must stay identical (re-run both test files). DRY is welcome here as long as the tests stay green.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @trellis/engine exec vitest run test/propertyRunner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/propertyRunner.ts packages/engine/test/propertyRunner.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): property runner with seeded generation + shrinking (§6.4)"
```

---

## Task 8: `evaluate` orchestrator (Run → Test → AST → Property → Diagnosis)

**Files:**
- Create: `packages/engine/src/evaluate.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/evaluate.test.ts`

`evaluate` assembles `RawSignals` for a build step and produces a `Diagnosis` via the §8 precedence, **reusing** M2's `detect` and `computeDeltas`. Signature (extends §12.1 with the bundle + injected effects that `detect`/`computeDeltas`/`Diagnosis` require — the same `DiagnoseEffects` pattern `diagnoseNonBuild` already uses):

```ts
evaluate(step, submission, sandbox, bundle, fx, cfg?) → Promise<Diagnosis>
```

**Signal assembly (`assembleBuildSignals`)** — order Run → Test → AST → Property, but compute AST tags unconditionally (they are advisory signals `detect` consumes; they never gate pass/fail — §6.4):
1. **Run:** `sandbox.run({ code, entrypoint?, timeoutMs, memoryMb })` on the bare submission to detect a **syntax** error or a top-level runtime/timeout. If `!ran` with a `syntax` error → set `runError`, `ran=false`, and **short-circuit** (skip tests/property; AST tags will be empty since `ast.parse` also fails).
2. **AST:** `sandbox.parseAndMatch(code, queries)` → `astTags` (always, when `ev.ast` present; empty array on a syntax error).
3. **Test:** if `ev.tests` present and the submission ran, `runTests` → `tests` + possibly `runError` (a per-case runtime error).
4. **Property:** if `ev.property` present AND tests did not fail AND no `runError`, `runProperty` → `property`.

**Diagnosis (§8 precedence):** `if !ran → attribution = runError.type`; `else if tests.failed>0 → mid = detect(...); attribution = mid ? "misconception" : "mismatch"`; `else if property && !property.passed → mid = detect(...); attribution = mid ? "misconception" : "mismatch"`; `else → correct, attribution="pass"`, `mid = detect(...)` pass-compatible only if an `acceptedVariants` exclusion does NOT bless the structure (style miscons are out of scope for the corpus, so `mid` stays effectively null on pass). `seed = ev.property?.seed ?? 0`. Non-build steps delegate to `diagnoseNonBuild`.

> **acceptedVariants:** `ev.acceptedVariants` is an authored allow-list of structural forms that must never be flagged. On a **passing** solution, if any `acceptedVariants[].astQuery` matched (its tag is in `astTags`... but `acceptedVariants` carries a raw `AstQuery`, not a tag), we suppress style attribution. The corpus ships no `acceptedVariants` entries, so the v1 behavior is: compute it, and since the list is empty, never suppress/flag anything on pass. Implement the empty-list path now; the matching path is a no-op guarded by `ev.acceptedVariants?.length`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/test/evaluate.test.ts
import { describe, it, expect } from "vitest";
import type { BuildStep, Bundle, RunRequest, RunResult, AstQuery } from "@trellis/schema";
import { evaluate } from "../src/evaluate.js";
import { SENTINEL } from "../src/pyDriver.js";

const fx = { id: "d1", learnerId: "L1", now: "2026-06-08T00:00:00.000Z" };

// Minimal bundle carrying one skill + one misconception keyed on runError: runtime.
const bundle = {
  contentVersion: "test@1",
  skills: { "skill.x": { id: "skill.x", title: "x", description: "", misconceptions: ["mis.rt"], upstream: [] } },
  misconceptions: {
    "mis.rt": {
      id: "mis.rt", skill: "skill.x", title: "runtime fault",
      signature: { runError: "runtime" }, hintLadder: [], feedback: "",
      skillDeltas: [{ skill: "skill.x", kind: "misconception", weight: 0.4 }],
    },
  },
  nodes: {}, cells: {}, producers: {}, requirements: {},
} as unknown as Bundle;

const step = {
  id: "cell.x#1", kind: "build", skills: ["skill.x"], language: "python", starterCode: "",
  evaluator: {
    run: { timeoutMs: 2000, memoryMb: 256, entrypoint: "f" },
    tests: { comparator: "deep-equal", cases: [{ input: 1, expected: 2 }] },
    ast: { queries: [{ tag: "t", query: { node: "Return" } as AstQuery }] },
  },
} as unknown as BuildStep;

const ok = (over: Partial<RunResult>): RunResult => ({ ran: true, stdout: "", wallMs: 1, timedOut: false, ...over });

function sandbox(opts: { run: (r: RunRequest) => RunResult; tags?: string[] }) {
  return {
    run: async (r: RunRequest) => opts.run(r),
    parseAndMatch: async () => opts.tags ?? [],
  };
}

describe("evaluate — build path (§8)", () => {
  it("syntax error short-circuits to attribution=syntax, correct=false", async () => {
    const sb = sandbox({ run: () => ok({ ran: false, error: { type: "syntax", message: "bad" } }), tags: [] });
    const d = await evaluate(step, { kind: "build", code: "def f(" }, sb, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("syntax");
    expect(d.signals.ran).toBe(false);
  });

  it("a passing solution → correct, attribution=pass", async () => {
    const sb = sandbox({
      run: (r) => (r.code.includes("__TRELLIS") || r.code.includes("_t_res")
        ? ok({ stdout: SENTINEL + JSON.stringify({ v: 2 }) })  // entrypoint driver case
        : ok({})),                                              // bare run
      tags: ["t"],
    });
    const d = await evaluate(step, { kind: "build", code: "def f(x):\n    return 2" }, sb, bundle, fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
  });

  it("a per-case runtime error → detect fires mis.rt (misconception)", async () => {
    let firstBareDone = false;
    const sb = sandbox({
      run: (r) => {
        const isDriver = r.code.includes("_t_res");
        if (!isDriver && !firstBareDone) { firstBareDone = true; return ok({}); } // bare run ok
        return ok({ ran: true, error: { type: "runtime", message: "NameError" } });  // driver raises
      },
      tags: [],
    });
    const d = await evaluate(step, { kind: "build", code: "def f(x):\n    return missing" }, sb, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.rt");
  });

  it("is deterministic: identical Diagnosis for identical inputs", async () => {
    const mk = () => sandbox({ run: () => ok({ stdout: SENTINEL + JSON.stringify({ v: 2 }) }), tags: ["t"] });
    const a = await evaluate(step, { kind: "build", code: "def f(x):\n    return 2" }, mk(), bundle, fx);
    const b = await evaluate(step, { kind: "build", code: "def f(x):\n    return 2" }, mk(), bundle, fx);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @trellis/engine exec vitest run test/evaluate.test.ts`
Expected: FAIL — cannot resolve `../src/evaluate.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/engine/src/evaluate.ts
import type { BuildStep, Step, Bundle, Diagnosis, RawSignals, Attribution } from "@trellis/schema";
import type { BuildSandbox, BuildSubmission } from "./buildSandbox.js";
import { DEFAULT_CONFIG, type EngineConfig } from "./config.js";
import { detect, type DetectContext } from "./detect.js";
import {
  computeDeltas,
  diagnoseNonBuild,
  type NonBuildSubmission,
  type DiagnoseEffects,
} from "./diagnose.js";
import { runTests } from "./testRunner.js";
import { runProperty } from "./propertyRunner.js";

export type Submission = BuildSubmission | NonBuildSubmission;

// Assemble RawSignals for a build submission: Run → AST → Test → Property. AST tags are
// computed unconditionally (advisory; they never gate pass/fail — §6.4). A syntax error
// short-circuits (no tests/property). A per-case runtime error is surfaced on runError.
export async function assembleBuildSignals(
  step: BuildStep,
  code: string,
  sandbox: BuildSandbox,
): Promise<RawSignals> {
  const ev = step.evaluator;
  const signals: RawSignals = { ran: true, wallMs: 0 };

  // 1. Run the bare submission to catch a syntax error / top-level fault.
  const bare = await sandbox.run({
    code,
    entrypoint: ev.run.entrypoint,
    timeoutMs: ev.run.timeoutMs,
    memoryMb: ev.run.memoryMb,
  });
  signals.wallMs = bare.wallMs;
  if (!bare.ran) {
    signals.ran = false;
    if (bare.timedOut) signals.timedOut = true;
    if (bare.error) signals.runError = { type: bare.error.type, message: bare.error.message, ...(bare.error.line !== undefined ? { line: bare.error.line } : {}) };
    // ast.parse also fails on a syntax error → no tags; short-circuit.
    return signals;
  }
  if (bare.timedOut) signals.timedOut = true;

  // 2. AST tags (always, when queries exist).
  if (ev.ast && ev.ast.queries.length > 0) {
    signals.astTags = await sandbox.parseAndMatch(code, ev.ast.queries);
  }

  // 3. Tests.
  if (ev.tests) {
    const t = await runTests(step, code, sandbox);
    signals.tests = { passed: t.passed, failed: t.failed, failures: t.failures };
    if (t.runError) signals.runError = { type: t.runError.type, message: t.runError.type };
  }

  // 4. Property — only when tests didn't fail and nothing errored.
  const testsFailed = (signals.tests?.failed ?? 0) > 0;
  if (ev.property && !testsFailed && !signals.runError) {
    if (!ev.run.entrypoint) {
      // Corpus property always targets an entrypoint; guard defensively.
      // (No entrypoint → skip property rather than mis-run a stdin program.)
    } else {
      const p = await runProperty(ev.property, ev.run.entrypoint, code, sandbox);
      signals.property = { passed: p.passed, ...(p.counterexample !== undefined ? { counterexample: p.counterexample } : {}) };
    }
  }

  return signals;
}

// §12.1 evaluate. Build path runs the ladder + §8 diagnosis (reusing detect/computeDeltas);
// non-build delegates to the M2 sync path. Total + deterministic given (step, code, seed).
export async function evaluate(
  step: Step,
  submission: Submission,
  sandbox: BuildSandbox,
  bundle: Bundle,
  fx: DiagnoseEffects,
  cfg: EngineConfig = DEFAULT_CONFIG,
): Promise<Diagnosis> {
  if (step.kind !== "build") {
    if (submission.kind === "build") throw new Error("build submission on a non-build step");
    return diagnoseNonBuild(step, submission, bundle, fx, cfg);
  }
  if (submission.kind !== "build") throw new Error("non-build submission on a build step");

  const signals = await assembleBuildSignals(step, submission.code, sandbox);
  const ctx: DetectContext = { signals };

  let correct: boolean;
  let attribution: Attribution;
  let mid: string | undefined;

  if (!signals.ran) {
    correct = false;
    attribution = (signals.runError?.type ?? "runtime") as Attribution;
  } else if ((signals.tests?.failed ?? 0) > 0) {
    correct = false;
    mid = detect(step, ctx, bundle) ?? undefined;
    attribution = mid !== undefined ? "misconception" : "mismatch";
  } else if (signals.property && signals.property.passed === false) {
    correct = false;
    mid = detect(step, ctx, bundle) ?? undefined;
    attribution = mid !== undefined ? "misconception" : "mismatch";
  } else {
    correct = true;
    attribution = "pass";
    // Pass-compatible style detection is a no-op for the v1 corpus (no acceptedVariants,
    // no pass-compatible misconceptions). detect() over a passing solution's signals
    // would only fire if a signature matched purely on astTags; corpus signatures pair
    // every astTag with a behavioral testFailure, so a passing solution never matches.
    mid = undefined;
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
    signals,
    skillDeltas,
    seed: step.evaluator.property?.seed ?? 0,
  };
  if (mid !== undefined) diag.misconceptionId = mid;
  return diag;
}
```

> **Implementer note on `attribution` typing:** `Attribution` is a frozen union (`pass`/`misconception`/`mismatch`/`syntax`/`runtime` — verify exact members at `packages/schema/src/ids.ts`). `signals.runError.type` is `"syntax" | "runtime"`, both valid `Attribution` members, so the cast is sound. If `Attribution` lacks `syntax`/`runtime`, STOP — that contradicts §8 and is a contract question to escalate, not to work around.

- [ ] **Step 4: Extend the barrel**

```ts
// append to packages/engine/src/index.ts
export type { BuildSandbox, BuildSubmission } from "./buildSandbox.js";
export { compareValues, floatClose, setEqual } from "./compare.js";
export type { Comparator } from "./compare.js";
export { makePrng } from "./prng.js";
export type { Prng } from "./prng.js";
export { genValue, genArgs } from "./generators.js";
export { shrink } from "./shrink.js";
export { runTests } from "./testRunner.js";
export type { TestRunResult } from "./testRunner.js";
export { runProperty } from "./propertyRunner.js";
export type { PropertyResult } from "./propertyRunner.js";
export { evaluate, assembleBuildSignals } from "./evaluate.js";
export type { Submission } from "./evaluate.js";
export { SENTINEL } from "./pyDriver.js";
```

- [ ] **Step 5: Run the test + the whole engine suite + typecheck/lint**

Run:
```bash
pnpm --filter @trellis/engine exec vitest run test/evaluate.test.ts
pnpm --filter @trellis/engine test
pnpm --filter @trellis/engine typecheck
pnpm --filter @trellis/engine lint
```
Expected: evaluate test PASS; full suite PASS (76 prior + new); typecheck clean (no purity import added); lint clean.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/evaluate.ts packages/engine/src/index.ts packages/engine/test/evaluate.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): evaluate build ladder Run→Test→AST→Property + §8 diagnosis"
```

---

## Task 9: Sandbox — extract `RUN_HARNESS`, add the §6.3 AST interpreter Python

**Files:**
- Create: `packages/sandbox/src/run-harness.ts`
- Create: `packages/sandbox/src/ast-query.ts`
- Modify: `packages/sandbox/src/pyodide-worker.ts` (import `RUN_HARNESS` instead of the inline `HARNESS`)
- Test: `packages/sandbox/test/ast-query.test.ts`

The §6.3 interpreter is lifted **verbatim** from `harness.py:45-149` (`call_name`, `pred_ok`, `NODE_TYPES`, `node_matches`, `query_matches`, `_has_ancestor`, `eval_tags`) so the runtime matcher is byte-for-byte the reference. `buildMatchProgram` wraps it: decode base64 `{code, queries}`, `eval_tags`, print `SENTINEL + JSON(sorted tags)`. (Matches `eval_tags`: a `SyntaxError` in the learner code → no tags, i.e. `[]`.)

- [ ] **Step 1: Write the failing test**

```ts
// packages/sandbox/test/ast-query.test.ts
import { describe, it, expect } from "vitest";
import { AST_QUERY_INTERPRETER, buildMatchProgram, MATCH_SENTINEL } from "../src/ast-query.js";

describe("ast-query Python source", () => {
  it("exports a non-trivial interpreter and a program builder", () => {
    expect(AST_QUERY_INTERPRETER).toContain("def query_matches");
    expect(AST_QUERY_INTERPRETER).toContain("def eval_tags");
    const prog = buildMatchProgram("def f():\n    return 1", [{ tag: "ret", query: { node: "Return" } }]);
    expect(prog).toContain(AST_QUERY_INTERPRETER);
    expect(prog).toContain("b64decode");
    expect(prog).toContain(MATCH_SENTINEL);
  });
});
```

(Behavioral verification of the interpreter is in Task 10's `local-cpython.test.ts`, which actually runs it through CPython.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @trellis/sandbox exec vitest run test/ast-query.test.ts`
Expected: FAIL — cannot resolve `../src/ast-query.js`.

- [ ] **Step 3: Create `run-harness.ts` by extracting the inline harness**

Copy the exact string currently assigned to `HARNESS` in `packages/sandbox/src/pyodide-worker.ts:26-70` into a new export:

```ts
// packages/sandbox/src/run-harness.ts
// The per-run Python harness shared by the real Pyodide worker (pyodide-worker.ts) and
// the offline CPython twin (local-cpython.ts). Single source of truth: a fresh namespace
// per run, stdout capture, syntax(compile) vs runtime(exec) classification with a line
// number, JSON-serializable result. Extracted verbatim from the original worker inline.
export const RUN_HARNESS = `
import io, sys, json

def __trellis_run(code, entrypoint, stdin_text):
    ns = {}
    out = io.StringIO()
    try:
        compiled = compile(code, "<submission>", "exec")
    except SyntaxError as e:
        return json.dumps({
            "ran": False, "stdout": "", "wallMs": 0, "timedOut": False,
            "error": {"type": "syntax", "message": (e.msg or "syntax error"), "line": e.lineno},
        })
    old_out, old_in = sys.stdout, sys.stdin
    sys.stdout = out
    if stdin_text is not None:
        sys.stdin = io.StringIO(stdin_text)
    return_value = None
    called = False
    try:
        exec(compiled, ns)
        if entrypoint and entrypoint in ns and callable(ns[entrypoint]):
            return_value = ns[entrypoint]()
            called = True
    except BaseException as e:
        tb = e.__traceback__
        line = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == "<submission>":
                line = tb.tb_lineno
            tb = tb.tb_next
        return json.dumps({
            "ran": True, "stdout": out.getvalue(), "wallMs": 0, "timedOut": False,
            "error": {"type": "runtime", "message": f"{type(e).__name__}: {e}", "line": line},
        })
    finally:
        sys.stdout = old_out
        sys.stdin = old_in
    result = {"ran": True, "stdout": out.getvalue(), "wallMs": 0, "timedOut": False}
    if called:
        result["returnValue"] = return_value
    return json.dumps(result, default=str)
`;
```

Then modify `pyodide-worker.ts` to use it:

```ts
// packages/sandbox/src/pyodide-worker.ts — replace the inline `const HARNESS = ` block.
import { RUN_HARNESS } from "./run-harness.js";
// ...delete the `const HARNESS = \`...\`;` literal...
// and change `await py.runPythonAsync(HARNESS);` → `await py.runPythonAsync(RUN_HARNESS);`
```

- [ ] **Step 4: Create `ast-query.ts` (interpreter lifted from harness.py)**

```ts
// packages/sandbox/src/ast-query.ts
// §6.3 AstQuery interpreter, lifted VERBATIM from content/verify/harness.py (lines
// 45–149) so the runtime matcher is the SAME algorithm as the differential oracle —
// zero version-skew with execution (the design's reason for Python-in-the-sandbox).
// Implements field/within/childMatches/not/all/any/count + the pinned grammar rules.
export const MATCH_SENTINEL = "\x00__TRELLIS_TAGS__\x00";

export const AST_QUERY_INTERPRETER = `
import ast, json

def parents(tree):
    p = {}
    for node in ast.walk(tree):
        for ch in ast.iter_child_nodes(node):
            p[ch] = node
    return p

def call_name(node):
    if not isinstance(node, ast.Call):
        return None
    f = node.func
    if isinstance(f, ast.Name):
        return f.id
    if isinstance(f, ast.Attribute):
        base = f.value.id if isinstance(f.value, ast.Name) else "?"
        return f"{base}.{f.attr}"
    return None

def pred_ok(where, node):
    if "attr" in where:
        val = where["eq"]
        if where["attr"] == "value" and isinstance(node, ast.Constant):
            return node.value == val
        if where["attr"] == "ops" and isinstance(node, ast.Compare):
            return [type(o).__name__ for o in node.ops] == val
        return getattr(node, where["attr"], None) == val
    if "calls" in where:
        nm = where["calls"]
        return any(call_name(c) == nm for c in ast.walk(node) if isinstance(c, ast.Call)) \\
            if not isinstance(node, ast.Call) else call_name(node) == nm
    if "usesName" in where:
        return any(isinstance(x, ast.Name) and x.id == where["usesName"] for x in ast.walk(node))
    if "childMatches" in where:
        return any(node_matches(where["childMatches"], d, None) for d in ast.walk(node))
    return True

NODE_TYPES = {
    "Call": ast.Call, "BinOp": ast.BinOp, "Compare": ast.Compare, "For": ast.For,
    "While": ast.While, "If": ast.If, "Return": ast.Return, "Constant": ast.Constant,
    "Name": ast.Name, "Assign": ast.Assign, "Expr": ast.Expr, "Break": ast.Break,
    "Import": ast.Import, "ImportFrom": ast.ImportFrom, "Attribute": ast.Attribute,
}

def node_matches(query, node, parmap):
    if "node" not in query:
        return query_matches(query, node, parmap)
    cls = NODE_TYPES.get(query["node"])
    if cls is None or not isinstance(node, cls):
        return False
    if "where" in query and not pred_ok(query["where"], node):
        return False
    return True

def _has_ancestor(node, anc_set, parmap):
    cur = parmap.get(node)
    while cur is not None:
        if cur in anc_set:
            return True
        cur = parmap.get(cur)
    return False

def query_matches(query, tree, parmap):
    if "not" in query:
        return not query_matches(query["not"], tree, parmap)
    if "all" in query:
        return all(query_matches(q, tree, parmap) for q in query["all"])
    if "any" in query:
        return any(query_matches(q, tree, parmap) for q in query["any"])
    matches = [nd for nd in ast.walk(tree) if node_matches(query, nd, parmap)]
    if "field" in query:
        def _field_ok(nd):
            for fname, subq in query["field"].items():
                kids = getattr(nd, fname, None)
                kids = kids if isinstance(kids, list) else ([kids] if kids is not None else [])
                if not any(isinstance(k, ast.AST) and query_matches(subq, k, parmap) for k in kids):
                    return False
            return True
        matches = [m for m in matches if _field_ok(m)]
    if "within" in query:
        inside = set(nd for nd in ast.walk(tree) if node_matches(query["within"], nd, parmap))
        matches = [m for m in matches if _has_ancestor(m, inside, parmap)]
    if "count" in query:
        op, k = query["count"]["op"], query["count"]["n"]
        c = len(matches)
        return {"=": c == k, ">=": c >= k, "<=": c <= k}[op]
    return len(matches) > 0

def eval_tags(code, queries):
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None
    pm = parents(tree)
    return [q["tag"] for q in queries if query_matches(q["query"], tree, pm)]
`;

function toBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64");
}

// A self-contained program that does NOT exec the learner code — only ast.parse + walk.
// Reads {code, queries} from base64, prints MATCH_SENTINEL + JSON(sorted matched tags).
export function buildMatchProgram(
  code: string,
  queries: { tag: string; query: unknown }[],
): string {
  const payload = toBase64Json({ code, queries });
  return (
    AST_QUERY_INTERPRETER +
    `\nimport base64 as _b64\n_payload = json.loads(_b64.b64decode("${payload}").decode("utf-8"))` +
    `\n_tags = eval_tags(_payload["code"], _payload["queries"]) or []` +
    `\nimport sys as _sys\n_sys.stdout.write(${JSON.stringify(MATCH_SENTINEL)} + json.dumps(sorted(_tags)))`
  );
}
```

- [ ] **Step 5: Run the unit test + sandbox suite (regression on the harness extraction)**

Run:
```bash
pnpm --filter @trellis/sandbox exec vitest run test/ast-query.test.ts
pnpm --filter @trellis/sandbox test
pnpm --filter @trellis/sandbox typecheck
```
Expected: new test PASS; existing 23 sandbox tests still PASS (the `pyodide-worker.ts` change is a pure extraction — `RUN_HARNESS === HARNESS` byte-for-byte); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/sandbox/src/run-harness.ts packages/sandbox/src/ast-query.ts packages/sandbox/src/pyodide-worker.ts packages/sandbox/test/ast-query.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "feat(sandbox): §6.3 AstQuery interpreter (lifted from harness.py) + shared RUN_HARNESS"
```

---

## Task 10: Sandbox — `parseAndMatch`, the offline CPython twin, and barrel wiring

**Files:**
- Create: `packages/sandbox/src/parse-and-match.ts`
- Create: `packages/sandbox/src/local-cpython.ts`
- Modify: `packages/sandbox/src/index.ts`
- Modify: `packages/sandbox/src/sandbox.ts` (add `parseAndMatch` to the returned `ManagedSandbox`)
- Modify: `packages/sandbox/src/sandbox.ts` `ManagedSandbox` interface + `packages/sandbox/package.json` (no new runtime deps)
- Test: `packages/sandbox/test/local-cpython.test.ts`

`parseAndMatch(run, code, queries)` builds the match program (Task 9) and calls the frozen `run` (entrypoint omitted), then parses the tags off `stdout`. The Pyodide `ManagedSandbox` gains `parseAndMatch` by closing over its own `run`. `createLocalSandbox()` is the offline twin: `run` shells `python3 -c "<RUN_HARNESS + driver-to-call-__trellis_run>"` (passing `_code`/`_entry`/`_stdin` via base64 to dodge quoting), classifies syntax/runtime/timeout exactly like the worker, and reuses the same `parseAndMatch`.

- [ ] **Step 1: Write the failing test** (real CPython behavior — the heart of offline verification)

```ts
// packages/sandbox/test/local-cpython.test.ts
import { describe, it, expect } from "vitest";
import { createLocalSandbox } from "../src/local-cpython.js";

const sb = createLocalSandbox();

describe("createLocalSandbox.run", () => {
  it("runs a top-level program and captures stdout", async () => {
    const r = await sb.run({ code: "print('hello')", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(true);
    expect(r.stdout).toBe("hello\n");
    expect(r.error).toBeUndefined();
  });
  it("classifies a syntax error (ran=false, type=syntax)", async () => {
    const r = await sb.run({ code: "def f(:\n    pass", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(false);
    expect(r.error?.type).toBe("syntax");
  });
  it("classifies a runtime error (ran=true, type=runtime)", async () => {
    const r = await sb.run({ code: "print(undefined_name)", timeoutMs: 5000, memoryMb: 256 });
    expect(r.ran).toBe(true);
    expect(r.error?.type).toBe("runtime");
  });
  it("feeds stdin to a program", async () => {
    const r = await sb.run({ code: "print('Hi ' + input() + '!')", stdin: "Alan\n", timeoutMs: 5000, memoryMb: 256 });
    expect(r.stdout).toBe("Hi Alan!\n");
  });
  it("calls an entrypoint() with no args and returns its value", async () => {
    const r = await sb.run({ code: "def main():\n    return 7", entrypoint: "main", timeoutMs: 5000, memoryMb: 256 });
    expect(r.returnValue).toBe(7);
  });
  it("times out a non-terminating program", async () => {
    const r = await sb.run({ code: "while True:\n    pass", timeoutMs: 1000, memoryMb: 256 });
    expect(r.timedOut).toBe(true);
    expect(r.ran).toBe(false);
  });
});

describe("createLocalSandbox.parseAndMatch", () => {
  it("matches a field-scoped elif (has_elif) and not a nested if", async () => {
    const q = [{ tag: "has_elif", query: { node: "If", field: { orelse: { node: "If" } } } }];
    const elif = "def g(s):\n    if s >= 90:\n        return 'A'\n    elif s >= 80:\n        return 'B'\n    else:\n        return 'C'";
    const nestedIf = "def g(s):\n    if s >= 90:\n        if s >= 95:\n            return 'A'\n    return 'C'";
    expect(await sb.parseAndMatch(elif, q)).toContain("has_elif");
    expect(await sb.parseAndMatch(nestedIf, q)).not.toContain("has_elif");
  });
  it("returns [] on a syntax error", async () => {
    const q = [{ tag: "t", query: { node: "Return" } }];
    expect(await sb.parseAndMatch("def f(:", q)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @trellis/sandbox exec vitest run test/local-cpython.test.ts`
Expected: FAIL — cannot resolve `../src/local-cpython.js`.

- [ ] **Step 3: Write `parse-and-match.ts`**

```ts
// packages/sandbox/src/parse-and-match.ts
import type { RunResult, AstQuery } from "@trellis/schema";
import { buildMatchProgram, MATCH_SENTINEL } from "./ast-query.js";

export type RunFn = (req: {
  code: string;
  entrypoint?: string;
  stdin?: string;
  timeoutMs: number;
  memoryMb: number;
}) => Promise<RunResult>;

// §6.3 parseAndMatch: run the AST interpreter program (no learner exec) and read the
// matched tags off stdout. Works against ANY frozen Sandbox.run (Pyodide host or twin).
export async function parseAndMatch(
  run: RunFn,
  code: string,
  queries: { tag: string; query: AstQuery }[],
): Promise<string[]> {
  const program = buildMatchProgram(code, queries);
  const res = await run({ code: program, timeoutMs: 5000, memoryMb: 256 });
  if (!res.ran || res.error) return [];
  const idx = res.stdout.lastIndexOf(MATCH_SENTINEL);
  if (idx === -1) return [];
  try {
    return JSON.parse(res.stdout.slice(idx + MATCH_SENTINEL.length)) as string[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Write `local-cpython.ts`** (offline twin)

```ts
// packages/sandbox/src/local-cpython.ts
import { spawnSync } from "node:child_process";
import type { RunResult, RunRequest, AstQuery } from "@trellis/schema";
import { RUN_HARNESS } from "./run-harness.js";
import { parseAndMatch as runParseAndMatch, type RunFn } from "./parse-and-match.js";

// OFFLINE VERIFICATION ONLY. A faithful subprocess twin of the deferred Pyodide worker:
// it executes the SAME RUN_HARNESS Python via local CPython, so the differential and the
// ladder can be proven without network. The PRODUCTION path is Pyodide (sandbox.ts);
// real-Pyodide behavior of the live ladder is DEFERRED to a networked browser.
export interface LocalSandboxConfig {
  python?: string; // default "python3"
}

export interface LocalSandbox {
  run(req: RunRequest): Promise<RunResult>;
  parseAndMatch(code: string, queries: { tag: string; query: AstQuery }[]): Promise<string[]>;
}

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

export function createLocalSandbox(config: LocalSandboxConfig = {}): LocalSandbox {
  const python = config.python ?? "python3";

  const run = async (req: RunRequest): Promise<RunResult> => {
    // Drive __trellis_run exactly as the worker does, passing code/entry/stdin via base64
    // so arbitrary learner source can't break the -c string. Print its JSON to stdout.
    const driver =
      RUN_HARNESS +
      `\nimport base64 as _b64\n` +
      `_code = _b64.b64decode("${b64(req.code)}").decode("utf-8")\n` +
      `_entry = ${req.entrypoint !== undefined ? `_b64.b64decode("${b64(req.entrypoint)}").decode("utf-8")` : "None"}\n` +
      `_stdin = ${req.stdin !== undefined ? `_b64.b64decode("${b64(req.stdin)}").decode("utf-8")` : "None"}\n` +
      `print(__trellis_run(_code, _entry, _stdin))`;
    const started = Date.now(); // host-side wall clock for the twin only (NOT engine code)
    const proc = spawnSync(python, ["-c", driver], {
      input: "",
      encoding: "utf-8",
      timeout: req.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    const wallMs = Date.now() - started;
    if (proc.error && (proc.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      return { ran: false, stdout: "", wallMs, timedOut: true };
    }
    if (proc.status !== 0 || !proc.stdout) {
      // The harness itself should not fail; a nonzero status here is an infra error.
      return {
        ran: false, stdout: "", wallMs, timedOut: false,
        error: { type: "runtime", message: (proc.stderr || "twin failure").trim().split("\n").pop() ?? "twin failure" },
      };
    }
    try {
      const parsed = JSON.parse(proc.stdout) as RunResult;
      return { ...parsed, wallMs };
    } catch {
      return { ran: false, stdout: proc.stdout, wallMs, timedOut: false, error: { type: "runtime", message: "unparseable harness output" } };
    }
  };

  const runFn: RunFn = run;
  return {
    run,
    parseAndMatch: (code, queries) => runParseAndMatch(runFn, code, queries),
  };
}
```

> **Implementer note on timeout semantics:** `spawnSync`'s `timeout` kills the child and sets `proc.error.code === "ETIMEDOUT"` (verify the exact code on this Node version; some report `proc.signal === "SIGTERM"` with a null status). Handle both: treat `proc.error?.code === "ETIMEDOUT"` OR (`proc.status === null && proc.signal != null`) as `timedOut: true, ran: false`. Adjust the guard so the `while True` test passes.

- [ ] **Step 5: Wire `parseAndMatch` onto the Pyodide `ManagedSandbox` and extend the barrel**

In `packages/sandbox/src/sandbox.ts`, add `parseAndMatch` to the interface and the returned object:

```ts
// add import at top:
import { parseAndMatch as runParseAndMatch } from "./parse-and-match.js";
import type { AstQuery } from "@trellis/schema";

// extend the interface:
export interface ManagedSandbox extends Sandbox {
  warmup(): Promise<void>;
  status(): PoolStatus;
  dispose(): void;
  parseAndMatch(code: string, queries: { tag: string; query: AstQuery }[]): Promise<string[]>;
}

// in the returned object (the `return { run, warmup, ... }`), add:
//   parseAndMatch: (code, queries) => runParseAndMatch(run, code, queries),
```

In `packages/sandbox/src/index.ts`, append:

```ts
export { createLocalSandbox } from "./local-cpython.js";
export type { LocalSandbox, LocalSandboxConfig } from "./local-cpython.js";
export { parseAndMatch } from "./parse-and-match.js";
export type { RunFn } from "./parse-and-match.js";
export { AST_QUERY_INTERPRETER, buildMatchProgram, MATCH_SENTINEL } from "./ast-query.js";
export { RUN_HARNESS } from "./run-harness.js";
```

- [ ] **Step 6: Run the local-cpython test + full sandbox suite + typecheck/lint**

Run:
```bash
pnpm --filter @trellis/sandbox exec vitest run test/local-cpython.test.ts
pnpm --filter @trellis/sandbox test
pnpm --filter @trellis/sandbox typecheck
pnpm --filter @trellis/sandbox lint
```
Expected: local-cpython PASS (real CPython); full suite PASS; typecheck + lint clean.

- [ ] **Step 7: Commit**

```bash
git add packages/sandbox/src/parse-and-match.ts packages/sandbox/src/local-cpython.ts packages/sandbox/src/index.ts packages/sandbox/src/sandbox.ts packages/sandbox/test/local-cpython.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "feat(sandbox): parseAndMatch + offline CPython twin (real-Pyodide deferred)"
```

---

## Task 11: The 21-fixture differential gate (engine ⊕ sandbox vs harness.py)

**Files:**
- Modify: `packages/sandbox/package.json` (add `@trellis/engine` + `@trellis/schema` to devDependencies; both `workspace:*`)
- Create: `packages/sandbox/test/_fixtures.ts` (loads content via `python3 -m` yaml → JSON; no JS yaml dep)
- Create: `packages/sandbox/test/differential.test.ts`
- Run: `pnpm install --offline` (workspace link only — no network)

The differential proves our pipeline agrees with `harness.py`'s gate 5 on **every build fixture**. For each misconception, for each `triggers`/`notTriggers` fixture whose `stepKind === "build"`, we:
1. resolve the build step that surfaces it (the same `pick_step` rule `harness.py:192` uses: the owner node's build step whose AST tags ⊇ the signature's needed tags), then
2. compute signals via `assembleBuildSignals` **restricted to tests + AST** (the same subset `harness.py` uses for gate 5 — no property), and
3. assert `evalSignature(signature, { signals })` equals the fixture's expectation (`true` for triggers, `false` for notTriggers).

Non-build fixtures (`recognize`/`recall`/`predict`) are M2's domain and are covered by the engine's existing `detect`/`diagnose` tests; the differential asserts they're skipped here (the count of build fixtures exercised is logged and asserted ≥ 1 per build-bearing misconception).

- [ ] **Step 1: Add the workspace devDeps and install**

Edit `packages/sandbox/package.json` `devDependencies`:

```json
  "devDependencies": {
    "vitest": "^2.1.0",
    "@trellis/engine": "workspace:*",
    "@trellis/schema": "workspace:*"
  }
```

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm install --offline`
Expected: resolves with a workspace link to `@trellis/engine`; no network fetch. (`@trellis/schema` is already a runtime dep — listing it in devDeps is harmless/explicit; if pnpm warns about duplication, drop the schema line and keep only engine.)

- [ ] **Step 2: Write the fixtures loader** (reuses pyyaml, exactly like harness.py)

```ts
// packages/sandbox/test/_fixtures.ts
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { Bundle, BuildStep, Misconception, Signature } from "@trellis/schema";

// Load content the SAME way harness.py does (pyyaml), emitted as JSON, so parsing can
// never diverge from the oracle. Returns the raw node/skill/misconception maps.
export interface RawContent {
  nodes: Record<string, any>;
  skills: Record<string, any>;
  miscons: Record<string, any>; // misconception + _skill back-ref, mirroring harness.py
}

const REPO = resolve(__dirname, "../../.."); // packages/sandbox/test → repo root

const LOADER = `
import glob, json, yaml
nodes, skills, miscons = {}, {}, {}
for f in sorted(glob.glob("content/nodes/*.yaml")):
    n = yaml.safe_load(open(f))["node"]; nodes[n["id"]] = n
for f in sorted(glob.glob("content/skills/*.yaml")):
    for d in yaml.safe_load_all(open(f)):
        if d and "skill" in d:
            s = d["skill"]; skills[s["id"]] = s
            for m in s.get("misconceptions", []):
                m["_skill"] = s["id"]; miscons[m["id"]] = m
print(json.dumps({"nodes": nodes, "skills": skills, "miscons": miscons}))
`;

export function loadRawContent(python = "python3"): RawContent {
  const proc = spawnSync(python, ["-c", LOADER], { cwd: REPO, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
  if (proc.status !== 0) throw new Error(`fixture load failed: ${proc.stderr}`);
  return JSON.parse(proc.stdout) as RawContent;
}

// Tags a signature references (mirrors harness.py sig_tags).
export function sigTags(sig: any, acc = new Set<string>()): Set<string> {
  for (const k of ["all", "any"]) if (sig[k]) for (const s of sig[k]) sigTags(s, acc);
  if (sig.not) sigTags(sig.not, acc);
  if (sig.astTag) acc.add(sig.astTag);
  return acc;
}

// The build step that surfaces a misconception — harness.py pick_step (owner node's build
// step whose AST tags ⊇ needed tags; else the first build step certifying the skill).
export function pickBuildStep(content: RawContent, mis: any): BuildStep | null {
  const skillId = mis._skill as string;
  const ownerNode = Object.values(content.nodes).find((n: any) => (n.teaches ?? []).includes(skillId)) as any;
  const cands: any[] = [];
  const collect = (node: any) => {
    for (const c of node?.cells ?? []) {
      const touch = new Set<string>(c.certifies ?? []);
      for (const st of c.steps ?? []) {
        if (st.kind === "build" && (new Set<string>(st.skills ?? []).has(skillId) || touch.has(skillId))) cands.push(st);
      }
    }
  };
  if (ownerNode) collect(ownerNode);
  if (cands.length === 0) for (const n of Object.values(content.nodes)) collect(n);
  const needed = sigTags(mis.signature);
  if (needed.size > 0) {
    for (const st of cands) {
      const tags = new Set<string>((st.evaluator?.ast?.queries ?? []).map((q: any) => q.tag));
      if ([...needed].every((t) => tags.has(t))) return st as BuildStep;
    }
  }
  return (cands[0] as BuildStep) ?? null;
}

export type { Bundle, BuildStep, Misconception, Signature };
```

> **Implementer note:** `_fixtures.ts` uses `any` and `__dirname`. Ensure the sandbox `tsconfig`/eslint allow `any` in test files (the existing sandbox tests will show the convention — match it; if `@typescript-eslint/no-explicit-any` is on for tests, add targeted `// eslint-disable-next-line` or a typed shim). `__dirname` requires CJS interop or `import.meta.url`; if the package is `"type": "module"`, replace `__dirname` with `path.dirname(fileURLToPath(import.meta.url))` from `node:url`.

- [ ] **Step 3: Write the differential test**

```ts
// packages/sandbox/test/differential.test.ts
import { describe, it, expect } from "vitest";
import { evalSignature, assembleBuildSignals } from "@trellis/engine";
import type { BuildStep, RawSignals, Signature } from "@trellis/schema";
import { createLocalSandbox } from "../src/local-cpython.js";
import { loadRawContent, pickBuildStep } from "./_fixtures.js";

const content = loadRawContent();
const sandbox = createLocalSandbox();

// Compute signals via the real ladder. We do NOT strip property: the test runner reads
// property.seed to seed the random node's cases (harness.py:233 does the same), so
// removing it would deseed randint and manufacture a false disagreement. assembleBuildSignals
// only RUNS property when tests pass (harness's gate-5 subset skips property, but running
// it on a passing solution returns passed=true and never changes the signature outcome —
// every corpus signature gates propertyFailed behind a real divergence). Harmless + agrees.
async function signalsForBuild(step: BuildStep, code: string): Promise<RawSignals> {
  return assembleBuildSignals(step, code, sandbox);
}

describe("21-fixture differential: our detector agrees with harness.py gate 5", () => {
  const buildBearing = Object.values(content.miscons).filter((m: any) =>
    [...(m.triggers ?? []), ...(m.notTriggers ?? [])].some((f: any) => f.stepKind === "build"),
  );

  it("covers the build-bearing misconceptions", () => {
    expect(buildBearing.length).toBeGreaterThan(0);
  });

  for (const mis of buildBearing as any[]) {
    it(`${mis.id}: every build trigger fires, every build non-trigger stays silent`, async () => {
      const step = pickBuildStep(content, mis);
      expect(step, `no build step surfaces ${mis.id}`).not.toBeNull();
      let exercised = 0;
      for (const [label, want] of [["triggers", true], ["notTriggers", false]] as const) {
        for (const fix of (mis[label] ?? []) as any[]) {
          if (fix.stepKind !== "build") continue;
          exercised++;
          const signals = await signalsForBuild(step!, fix.code as string);
          const got = evalSignature(mis.signature as Signature, { signals });
          expect(got, `${mis.id} ${label} code=${JSON.stringify(fix.code)} signals=${JSON.stringify(signals)}`).toBe(want);
        }
      }
      expect(exercised).toBeGreaterThan(0);
    });
  }
});
```

- [ ] **Step 4: Run the differential**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox exec vitest run test/differential.test.ts`
Expected: PASS — every build-bearing misconception's build fixtures agree with `harness.py`'s expectation.

If any case disagrees: the failure message prints the misconception id, the fixture code, and the computed signals. Debug with **systematic-debugging** — compare the computed `signals` against what `harness.py build_signals` produces for the same `(code, step)` (instrument `harness.py` locally or replicate its `build_signals` for that one fixture). The likely culprits: (a) `runError` not surfaced from a per-case entrypoint exception (Task 6), (b) a `field`/`within` scoping mismatch in the interpreter (Task 9 — it's lifted verbatim, so suspect the program wrapper, not the algorithm), or (c) `pickBuildStep` selecting a different step than `harness.py:pick_step`.

- [ ] **Step 5: Belt-and-suspenders — assert harness.py itself is green**

Add to the same test file:

```ts
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

it("content/verify/harness.py exits 0 (the oracle we agree with is itself valid)", () => {
  const repo = resolve(__dirname, "../../..");
  const proc = spawnSync("python3", ["content/verify/harness.py"], { cwd: repo, encoding: "utf-8" });
  expect(proc.status, proc.stdout + proc.stderr).toBe(0);
});
```

(Same `__dirname` caveat as Step 2 — use `import.meta.url` if ESM.)

Run: `pnpm --filter @trellis/sandbox exec vitest run test/differential.test.ts`
Expected: PASS including the harness-green assertion.

- [ ] **Step 6: Commit**

```bash
git add packages/sandbox/package.json packages/sandbox/test/_fixtures.ts packages/sandbox/test/differential.test.ts pnpm-lock.yaml
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "test(sandbox): 21-fixture differential — evaluate+parseAndMatch agree with harness.py"
```

---

## Task 12: §4 acceptance — unanticipated solutions pass; determinism; tags on failing only

**Files:**
- Create: `packages/sandbox/test/acceptance.test.ts`

Proves the spec §4 M3b gate via the full `evaluate` ladder (with property) on the **string_concat** `str_num` build step and the **random** build step. Uses the real `createLocalSandbox`. The str_num step is `cell.string_concat.text_plus_number` — `announce(number)` returns `"Your random number is: " + str(number)` and `f"..."` are both correct; `"..." + number` is a runtime `TypeError`. Load the actual step from content (via `_fixtures.ts`) so the test grades the shipped evaluator, not a hand-copy.

- [ ] **Step 1: Write the test**

```ts
// packages/sandbox/test/acceptance.test.ts
import { describe, it, expect } from "vitest";
import { evaluate } from "@trellis/engine";
import type { Bundle, BuildStep, Cell } from "@trellis/schema";
import { createLocalSandbox } from "../src/local-cpython.js";
import { loadRawContent } from "./_fixtures.js";

const content = loadRawContent();
const sandbox = createLocalSandbox();
const fx = { id: "d", learnerId: "L", now: "2026-06-08T00:00:00.000Z" };

// Find a build step by id across the raw content.
function findStep(stepId: string): BuildStep {
  for (const node of Object.values(content.nodes) as any[]) {
    for (const cell of node.cells ?? []) {
      for (const st of cell.steps ?? []) if (st.id === stepId) return st as BuildStep;
    }
  }
  throw new Error(`step ${stepId} not found`);
}

// A minimal bundle: the step's skills + their misconceptions, harvested from raw content.
function bundleFor(step: BuildStep): Bundle {
  const skills: any = {};
  const misconceptions: any = {};
  for (const sid of step.skills) {
    const s = content.skills[sid];
    if (!s) continue;
    skills[sid] = { id: s.id, title: s.title ?? sid, description: s.description ?? "", misconceptions: (s.misconceptions ?? []).map((m: any) => m.id), upstream: s.upstream ?? [] };
    for (const m of s.misconceptions ?? []) misconceptions[m.id] = { ...m, hintLadder: m.hintLadder ?? [], feedback: m.feedback ?? "", skillDeltas: m.skillDeltas ?? [] };
  }
  return { contentVersion: "acceptance@1", skills, misconceptions, nodes: {}, cells: {}, producers: {}, requirements: {} } as unknown as Bundle;
}

describe("§4 acceptance — string_concat str_num", () => {
  const step = findStep("cell.string_concat.text_plus_number#" + lastBuildStepSuffix("cell.string_concat.text_plus_number"));
  const bundle = bundleFor(step);

  // resolve the build step suffix at module load (the cell's build step index can vary)
  function lastBuildStepSuffix(_cellId: string): number { return 0; } // replaced below

  it("both f-string and str() coercion PASS (correct-but-unanticipated)", async () => {
    const fstr = await evaluate(step, { kind: "build", code: 'def announce(number):\n    return f"Your random number is: {number}"' }, sandbox, bundle, fx);
    const concat = await evaluate(step, { kind: "build", code: 'def announce(number):\n    return "Your random number is: " + str(number)' }, sandbox, bundle, fx);
    expect(fstr.correct).toBe(true);
    expect(fstr.attribution).toBe("pass");
    expect(concat.correct).toBe(true);
    expect(concat.attribution).toBe("pass");
  });

  it("text + raw number is a runtime fault (misconception or runtime), never pass", async () => {
    const bad = await evaluate(step, { kind: "build", code: 'def announce(number):\n    return "Your random number is: " + number' }, sandbox, bundle, fx);
    expect(bad.correct).toBe(false);
    expect(["misconception", "runtime"]).toContain(bad.attribution);
  });
});

describe("§4 acceptance — determinism", () => {
  const step = findStep(randomBuildStepId());
  const bundle = bundleFor(step);
  function randomBuildStepId(): string {
    const node = (Object.values(content.nodes) as any[]).find((n) => n.id === "node.random");
    for (const c of node.cells) for (const st of c.steps) if (st.kind === "build") return st.id;
    throw new Error("no random build step");
  }

  it("same (submission, seed) → identical counterexample for an off-by-one", async () => {
    const code = "import random\n\ndef get_random(a, b):\n    return random.randint(a, b - 1)";
    const a = await evaluate(step, { kind: "build", code }, sandbox, bundle, fx);
    const b = await evaluate(step, { kind: "build", code }, sandbox, bundle, fx);
    expect(a.signals).toEqual(b.signals);
    expect(a).toEqual(b);
  });

  it("a correct randint solution passes (property holds under the seed)", async () => {
    const code = "import random\n\ndef get_random(a, b):\n    return random.randint(a, b)";
    const d = await evaluate(step, { kind: "build", code }, sandbox, bundle, fx);
    expect(d.correct).toBe(true);
  });
});
```

> **Implementer note:** the inline `lastBuildStepSuffix` placeholder above is a drafting artifact — **replace it**: resolve the str_num step by scanning `content.nodes["node.string_concat"]` for the cell `cell.string_concat.text_plus_number` and taking its single `kind: "build"` step's actual `id` (same pattern as `randomBuildStepId`). Do not hardcode `#N`. Grade the shipped step.

- [ ] **Step 2: Run the acceptance test**

Run: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" && pnpm --filter @trellis/sandbox exec vitest run test/acceptance.test.ts`
Expected: PASS — both coercion styles pass, the raw-number fault never passes, the off-by-one yields an identical `Diagnosis` (incl. counterexample) across runs, and the correct randint passes.

- [ ] **Step 3: Commit**

```bash
git add packages/sandbox/test/acceptance.test.ts
git -c user.name='Stream D — M3b build-ladder' -c user.email='noreply@anthropic.com' \
  commit -m "test(sandbox): §4 acceptance — unanticipated solutions pass + determinism"
```

---

## Task 13: Final gates — both packages green, ESM build, harness, handoff

**Files:** none new — verification + a short status note.

- [ ] **Step 1: Run the full per-package gates**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
for p in @trellis/engine @trellis/sandbox; do
  echo "=== $p ==="
  pnpm --filter $p typecheck && pnpm --filter $p lint && pnpm --filter $p test || { echo "FAIL $p"; break; }
done
```
Expected: typecheck + lint + test all green for both packages.

- [ ] **Step 2: Build + native-ESM import (the build-cycle trap, §5/§81 START-HERE)**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine build && pnpm --filter @trellis/sandbox build
node -e "import('./packages/engine/dist/src/index.js').then(m => console.log('engine ok:', typeof m.evaluate))"
node -e "import('./packages/sandbox/dist/src/index.js').then(m => console.log('sandbox ok:', typeof m.createLocalSandbox, typeof m.parseAndMatch))"
```
Expected: both builds succeed; both `import()`s print `ok` with `function` types (no ESM deadlock — module graphs stay acyclic).

- [ ] **Step 3: Re-run the Python oracle (sanity: our differential target is still green)**

```bash
python3 content/validate.py && python3 content/verify/harness.py
```
Expected: `validate.py` RESULT PASS; `harness.py` gate5 PASS | gate6 PASS.

- [ ] **Step 4: Update the memory note for the deferred-verification reality**

Update `/Users/alan/.claude/projects/-Users-alan-Desktop-Trellis/memory/` with an `m3b-build-ladder-status.md` memory (and a one-line `MEMORY.md` pointer): M3b built + differential-verified against local CPython on branch `m3b-build-ladder`; **real-Pyodide-in-WASM verification of `parseAndMatch` + the live ladder is DEFERRED to a networked browser** (same posture as M3a). Do not claim end-to-end.

- [ ] **Step 5: Commit any final touch-ups, then hand off to finishing-a-development-branch**

```bash
git status   # expect clean or only the intended files
```
Then invoke **superpowers:finishing-a-development-branch** (merge target: `main`). Before opening the integration PR: **rebase on `main`** (M1 `@trellis/authoring`, disjoint paths, may have landed — the only expected conflict is `pnpm-lock.yaml`, which the orchestrator resolves). Report status to the orchestrator per the coordination doc; do **not** edit `docs/coordination/PARALLEL-STREAMS.md`.

---

## Self-review (run before execution)

- **Spec coverage (spec §4 M3b "Build" + "Gate"):** comparators → Task 1; AST via Python `ast` matching `AstQuery` → tags → Tasks 9–10; seeded PRNG + bounded generators + shrinking → Tasks 2–4, 7; `evaluate` Run→Test→AST→Property short-circuit → Task 8; `acceptedVariants` handling → Task 8 (empty-list path, documented); both coercion styles pass + AST tags on failing only + identical signals/counterexample → Task 12; 21-fixture differential vs `harness.py` → Task 11. ✓
- **START-HERE "THE defining M3b gate":** differential agreement on all 21 → Task 11; acceptance (`f'age: {age}'`/`str()` analogue via `announce` str_num, oracle+property, determinism) → Task 12. The reuse-vs-Python-in-Pyodide decision is justified in "Why these design decisions" (#1, #4: lift `harness.py`'s interpreter as the runtime matcher). ✓
- **Frozen contract:** no `@trellis/schema` edit anywhere; `parseAndMatch` is additive (`BuildSandbox`/`ManagedSandbox` extend `Sandbox`); engine imports an interface, never a concrete sandbox (purity holds). ✓
- **Determinism / no clock:** PRNG seeded from `property.seed` only; engine `src` has no `Date.now`/`Math.random` (the twin's `Date.now` is in `@trellis/sandbox`, not engine, and only stamps `wallMs` — not a grading signal). ✓
- **No-network:** real Pyodide deferred + said so (Tasks 4-note, 10 header, 13 Step 4); all verification via local CPython twin. ✓
- **Placeholder scan:** the only intentional "replace me" markers are flagged loudly as implementer notes (Task 7 candidate dedup, Task 11 `__dirname`/`any` conventions, Task 12 step-suffix resolution) with the exact fix stated. No silent TODOs. ✓
- **Type consistency:** `BuildSandbox` (`run`+`parseAndMatch`), `SENTINEL` (engine driver) vs `MATCH_SENTINEL` (AST tags) are deliberately distinct constants; `RUN_HARNESS` (run) vs `AST_QUERY_INTERPRETER` (parse-only) distinct; `assembleBuildSignals`/`evaluate`/`runTests`/`runProperty` names match across Tasks 6–8 and 11–12. ✓
