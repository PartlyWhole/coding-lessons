# Trellis M4 — Misconceptions + Hints End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the misconception→feedback→hint-ladder experience end-to-end on the existing deterministic build core: a pure §9 hint-ladder driver in `@trellis/engine`, a match-aware §7 `detect` precedence that disambiguates `timedOut`, and the §13.2 gate-7 (golden Diagnosis) wiring turned live in `@trellis/authoring`.

**Architecture:** M4 does **not** add a package. It extends two already-integrated packages. `@trellis/engine` gains a *pure, deterministic* hint-ladder driver (`hintLadder.ts`) that consumes a `Diagnosis` (already produced by M3b's `evaluate`/`diagnoseNonBuild`) plus the authored `Misconception.hintLadder`, and a refined `detect()` whose cross-candidate tie-break ranks by the **branch that actually fired** (so a re-keyed `infinite_true` carrying a `{timedOut:true}` branch loses to structural `no_update` on a never-updating loop, but wins on a true `while True:`). `@trellis/authoring` flips gate 7 (golden snapshots) from an informational stub to a live re-grade-and-diff over `gradeBuild`. The marquee end-to-end (`'… ' + number` → `mis.concat.str_num` → authored feedback → pullable 4-level ladder) is proven by a real CPython-twin run against the real compiled bundle.

**Tech Stack:** TypeScript (ESM, `"type":"module"`, `.js` import specifiers), TypeBox `@trellis/schema` (frozen contract — **no schema change**), Vitest, `@trellis/sandbox` `createLocalSandbox` (local CPython twin, offline), `@trellis/authoring` `compile`/`loadContent`. pnpm via corepack (`export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"`). No network.

---

## Context the engineer must know (read before Task 1)

**You are in worktree `/Users/alan/Desktop/trellis-m4` on branch `m4-misconceptions-hints`.** Never `cd` to `main` or another worktree. Before any `pnpm`, run:

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
```

**Baseline (already reproduced green):** `pnpm -r typecheck/lint/test/build` → **288 tests** (schema 37, engine 120, authoring 76, sandbox 55); `python3 content/validate.py` → PASS; `python3 content/verify/harness.py` → `RESULT gate5: PASS | gate6 oracle-smoke: PASS`. **Build must precede typecheck/test in a clean tree** (typecheck reads `@trellis/schema`'s built `dist`). If you see `Cannot find module '@trellis/schema'`, run `pnpm -r build` first.

**Frozen-contract facts (do not change; STOP + escalate if you think you must):**
- `Misconception` (`packages/schema/src/content.ts:22`): `{ id, skill, title, signature, hintLadder: Hint[], feedback, skillDeltas? }`.
- `Hint` (`content.ts:15`): `{ level: 1|2|3|4, body: RichText, revealCode?: string }`. **There is no `autoEscalate` field on `Hint`** and **no `hintLadder` field on `Skill`.** Consequences, both engine-side, both **no schema change**:
  - `autoEscalate` is a **driver option** (a behavior parameter of the pure ladder driver), not authored content.
  - The §9.1 "generic ladder on the skill" fallback (for `mismatch`/`syntax`/`runtime`) is an **engine-provided default constant**, since the frozen `Skill` carries no ladder. The marquee slice is a `misconception` attribution and uses the *authored* ladder; generic ladders are the secondary fallback.
- `Signature` union (`packages/schema/src/runtime.ts`): includes `{ timedOut: true }` and `RawSignals.timedOut` already exist (added schema `e125a99`). M4 does **not** add to the union.
- `Diagnosis` (`runtime.ts:64`): `{ id, learnerId, stepId, contentVersion, submittedAt, correct, attribution, signals, skillDeltas, seed, misconceptionId? }`. `Attribution = "pass"|"misconception"|"syntax"|"runtime"|"mismatch"`.

**Reuse — do NOT duplicate (START-HERE §38):**
- `packages/engine/src/detect.ts` — `evalSignature`, `specificityRank`, `detect` (you *refine* `detect`'s tie-break; you do not rewrite the matcher).
- `packages/engine/src/evaluate.ts` — `evaluate` already produces the full build-path `Diagnosis` (attribution + `misconceptionId`). The hint ladder consumes its output.
- `packages/engine/src/diagnose.ts` — `diagnoseNonBuild`, `computeDeltas`.
- `packages/authoring/src/grade.ts` — `gradeBuild(loaded, stepId, submission) → { attribution, misconceptionId? }` (already self-contained; gate 7 calls it).

**The marquee content (source of truth — `content/skills/string_concat.taxonomy.yaml:80`):**
`mis.concat.str_num`, skill `skill.string.concat_str_num`, signature **`{ any: [ { runError: runtime }, { choice: a } ] }`** (it deliberately does NOT key on the `implicit_coerce` astTag, which would over-match the correct `str()` solution — see the yaml comment at lines 84–89; the spec M4 row's "`astTag: implicit_coerce`" is shorthand, the content is the source of truth). Its `hintLadder` has 4 levels; level 4 carries `revealCode`. The build step is `cell.string_concat.text_plus_number#4` (entrypoint `announce(number)`); the str+number fault (START-HERE's `'age: ' + age` shorthand) is `return "Your random number is: " + number` → `TypeError` → `runError: runtime` → `mis.concat.str_num`. The sandbox §4 acceptance test (`packages/sandbox/test/acceptance.test.ts`) already proves this attribution byte-identically; M4 adds the feedback + ladder on top.

**Gates status (`packages/authoring/src/gates/`):** gate 5 (`fixtures.ts`) and gate 6 (`oracle.ts`) are **already live** (M1 shipped them through a faithful TS port; the sandbox 21-fixture differential proves engine `detect` == `harness.py`). **Gate 7 (`golden.ts`) is the real stub** — it emits an informational `warn`. This plan turns it live via `gradeBuild` re-grade + diff. Confirm 5 & 6 stay green; do not rewrite them.

**The `timedOut` re-key is ORCHESTRATOR-OWNED (START-HERE §57, design-note §5).** You build only the engine §7 precedence so live `detect()` disambiguates `timedOut` when the re-key lands. You do **not** edit `content/**` or `content/verify/harness.py`. After Task 2 is green, **escalate** to the orchestrator with the exact re-key + the precedence proof.

**Disjoint-file fan-out (START-HERE §73):** Task 1 (`engine/src/hintLadder.ts`) and Task 2 (`engine/src/detect.ts`) touch different files → parallel. Task 3 (`authoring/src/gates/golden.ts`) is a different package → parallel. **Task 4 serializes the `engine/src/index.ts` barrel** (the one shared file) and adds the marquee e2e. Run Task 4 last.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/engine/src/hintLadder.ts` | **NEW.** Pure §9 ladder driver: `HintState`, `ladderKeyFor`, `ladderFor`, `GENERIC_LADDERS`, `syncLadder`, `pullHint`, `visibleHints`. | 1 |
| `packages/engine/test/hintLadder.test.ts` | **NEW.** Unit tests for the driver (selection, one-level-per-press, level-4 confirm gate, autoEscalate, reset, determinism). | 1 |
| `packages/engine/src/detect.ts` | **MODIFY.** Add `matchedSpecificity(sig, ctx)`; use it in `detect()`'s tie-break. | 2 |
| `packages/engine/test/detect-precedence.test.ts` | **NEW.** `timedOut` disambiguation both ways + backward-compat. | 2 |
| `packages/authoring/src/gates/golden.ts` | **MODIFY.** Live re-grade + diff via `gradeBuild`. | 3 |
| `packages/authoring/test/gate-golden.test.ts` | **NEW.** Gate 7 pass + deliberate-mismatch, using a synthetic `Loaded`. | 3 |
| `packages/engine/src/index.ts` | **MODIFY (serialized).** Export the hintLadder API + `matchedSpecificity`. | 4 |
| `packages/engine/test/m4-concat-e2e.test.ts` | **NEW.** Real-run marquee: `announce` str+number → `mis.concat.str_num` → authored feedback → 4-level ladder drive. | 4 |
| `packages/engine/package.json` | **MODIFY (serialized).** Add test-only devDeps `@trellis/sandbox`, `@trellis/authoring`. | 4 |

---

## Task 1: §9 hint-ladder driver (`@trellis/engine`, pure)

**Files:**
- Create: `packages/engine/src/hintLadder.ts`
- Test: `packages/engine/test/hintLadder.test.ts`

Pure, deterministic, no `Date.now()`/`Math.random()`. Models §9.2 exactly: ladder selection by attribution, learner-pulled one-level-per-press, level-4 behind a confirm, `autoEscalate` on repeat (engine option — schema has no field), reset-on-new-misconception. `revealedThrough` = the highest level currently visible (0 = nothing shown yet).

- [ ] **Step 1: Write the failing test**

Create `packages/engine/test/hintLadder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Bundle, Diagnosis, Hint } from "@trellis/schema";
import {
  initialHintState,
  ladderKeyFor,
  ladderFor,
  syncLadder,
  pullHint,
  visibleHints,
  GENERIC_LADDERS,
  type HintState,
} from "../src/hintLadder.js";

// A minimal Diagnosis factory (only the fields the ladder reads).
function diag(attribution: Diagnosis["attribution"], misconceptionId?: string): Diagnosis {
  const d = {
    id: "d",
    learnerId: "L",
    stepId: "s",
    contentVersion: "v1",
    submittedAt: "2026-06-08T00:00:00.000Z",
    correct: attribution === "pass",
    attribution,
    signals: { ran: true, wallMs: 0 },
    skillDeltas: [],
    seed: 0,
  } as Diagnosis;
  if (misconceptionId !== undefined) d.misconceptionId = misconceptionId;
  return d;
}

const LADDER: Hint[] = [
  { level: 1, body: "nudge" },
  { level: 2, body: "sharper" },
  { level: 3, body: "worked example" },
  { level: 4, body: "Solution:", revealCode: "answer = 42" },
];

// A Bundle carrying just one misconception with the 4-level ladder above.
const bundle = {
  contentVersion: "v1",
  skills: {},
  nodes: {},
  cells: {},
  misconceptions: {
    "mis.x": { id: "mis.x", skill: "skill.x", title: "X", signature: { runError: "runtime" }, hintLadder: LADDER, feedback: "fb" },
  },
  producers: {},
  requirements: {},
} as unknown as Bundle;

describe("ladderKeyFor — §9.2 selection", () => {
  it("misconception → the misconception id", () => {
    expect(ladderKeyFor(diag("misconception", "mis.x"))).toBe("mis.x");
  });
  it("pass → empty key (no ladder)", () => {
    expect(ladderKeyFor(diag("pass"))).toBe("");
  });
  it("mismatch/syntax/runtime → attribution-keyed generic ladder", () => {
    expect(ladderKeyFor(diag("mismatch"))).toBe("generic:mismatch");
    expect(ladderKeyFor(diag("syntax"))).toBe("generic:syntax");
    expect(ladderKeyFor(diag("runtime"))).toBe("generic:runtime");
  });
  it("misconception with no id (defensive) falls back to generic", () => {
    expect(ladderKeyFor(diag("misconception"))).toBe("generic:misconception");
  });
});

describe("ladderFor — ladder data for a key", () => {
  it("misconception key → the authored ladder", () => {
    expect(ladderFor("mis.x", bundle)).toEqual(LADDER);
  });
  it("generic key → the engine default generic ladder for that attribution", () => {
    expect(ladderFor("generic:syntax", bundle)).toEqual(GENERIC_LADDERS.syntax);
    expect(ladderFor("generic:runtime", bundle)).toEqual(GENERIC_LADDERS.runtime);
    expect(ladderFor("generic:mismatch", bundle)).toEqual(GENERIC_LADDERS.mismatch);
  });
  it("empty key → empty ladder", () => {
    expect(ladderFor("", bundle)).toEqual([]);
  });
  it("unknown misconception id → empty ladder (referential integrity is the compiler's gate)", () => {
    expect(ladderFor("mis.absent", bundle)).toEqual([]);
  });
  it("every generic ladder has exactly levels 1..4 in order", () => {
    for (const k of ["syntax", "runtime", "mismatch"] as const) {
      expect(GENERIC_LADDERS[k].map((h) => h.level)).toEqual([1, 2, 3, 4]);
    }
  });
});

describe("syncLadder — reset-on-new-misconception + autoEscalate-on-repeat", () => {
  it("first diagnosis: sets the key, revealedThrough 0", () => {
    const s = syncLadder(initialHintState(), diag("misconception", "mis.x"));
    expect(s).toEqual({ ladderKey: "mis.x", revealedThrough: 0 });
  });
  it("changing misconception resets to the new ladder at level 0", () => {
    const prev: HintState = { ladderKey: "mis.x", revealedThrough: 3 };
    expect(syncLadder(prev, diag("misconception", "mis.y"))).toEqual({ ladderKey: "mis.y", revealedThrough: 0 });
  });
  it("same misconception, no autoEscalate: state unchanged", () => {
    const prev: HintState = { ladderKey: "mis.x", revealedThrough: 1 };
    expect(syncLadder(prev, diag("misconception", "mis.x"))).toEqual(prev);
  });
  it("same misconception + autoEscalate: bumps the floor by one (so level 1 isn't re-read)", () => {
    const prev: HintState = { ladderKey: "mis.x", revealedThrough: 1 };
    expect(syncLadder(prev, diag("misconception", "mis.x"), { autoEscalate: true })).toEqual({ ladderKey: "mis.x", revealedThrough: 2 });
  });
  it("autoEscalate never auto-reveals the solution (caps the floor at 3)", () => {
    const prev: HintState = { ladderKey: "mis.x", revealedThrough: 3 };
    expect(syncLadder(prev, diag("misconception", "mis.x"), { autoEscalate: true })).toEqual({ ladderKey: "mis.x", revealedThrough: 3 });
  });
  it("autoEscalate is a no-op before the first pull (floor stays 0)", () => {
    const prev: HintState = { ladderKey: "mis.x", revealedThrough: 0 };
    expect(syncLadder(prev, diag("misconception", "mis.x"), { autoEscalate: true })).toEqual({ ladderKey: "mis.x", revealedThrough: 0 });
  });
});

describe("pullHint — one level per press, level-4 behind a confirm", () => {
  it("each press reveals exactly one more level", () => {
    let s: HintState = { ladderKey: "mis.x", revealedThrough: 0 };
    s = pullHint(s, LADDER);
    expect(s.revealedThrough).toBe(1);
    s = pullHint(s, LADDER);
    expect(s.revealedThrough).toBe(2);
    s = pullHint(s, LADDER);
    expect(s.revealedThrough).toBe(3);
  });
  it("a plain pull stops at level 3 (level 4 needs a confirm)", () => {
    const s: HintState = { ladderKey: "mis.x", revealedThrough: 3 };
    expect(pullHint(s, LADDER).revealedThrough).toBe(3);
  });
  it("a confirmed pull from 3 reveals level 4", () => {
    const s: HintState = { ladderKey: "mis.x", revealedThrough: 3 };
    expect(pullHint(s, LADDER, { confirmRevealCode: true }).revealedThrough).toBe(4);
  });
  it("never exceeds the ladder length", () => {
    const short: Hint[] = [{ level: 1, body: "only one" }];
    const s: HintState = { ladderKey: "mis.x", revealedThrough: 1 };
    expect(pullHint(s, short, { confirmRevealCode: true }).revealedThrough).toBe(1);
  });
  it("a pull on an empty ladder is a no-op", () => {
    const s: HintState = { ladderKey: "", revealedThrough: 0 };
    expect(pullHint(s, []).revealedThrough).toBe(0);
  });
});

describe("visibleHints — levels 1..revealedThrough", () => {
  it("reveals the prefix of the ladder", () => {
    expect(visibleHints({ ladderKey: "mis.x", revealedThrough: 0 }, LADDER)).toEqual([]);
    expect(visibleHints({ ladderKey: "mis.x", revealedThrough: 2 }, LADDER)).toEqual([LADDER[0], LADDER[1]]);
    expect(visibleHints({ ladderKey: "mis.x", revealedThrough: 4 }, LADDER)).toEqual(LADDER);
  });
  it("level 4 (revealCode) is only visible at revealedThrough 4", () => {
    const v3 = visibleHints({ ladderKey: "mis.x", revealedThrough: 3 }, LADDER);
    expect(v3.some((h) => h.revealCode !== undefined)).toBe(false);
    const v4 = visibleHints({ ladderKey: "mis.x", revealedThrough: 4 }, LADDER);
    expect(v4.some((h) => h.revealCode !== undefined)).toBe(true);
  });
});

describe("determinism", () => {
  it("the same (state, ladder, opts) always yields byte-identical results", () => {
    const s: HintState = { ladderKey: "mis.x", revealedThrough: 1 };
    expect(JSON.stringify(pullHint(s, LADDER))).toBe(JSON.stringify(pullHint(s, LADDER)));
    expect(JSON.stringify(visibleHints(s, LADDER))).toBe(JSON.stringify(visibleHints(s, LADDER)));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine test -- hintLadder
```
Expected: FAIL — `Cannot find module '../src/hintLadder.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/engine/src/hintLadder.ts`:

```ts
import type { Bundle, Diagnosis, Hint } from "@trellis/schema";

// §9.2 — the learner-dosed ladder state. `revealedThrough` is the highest level
// currently visible (0 = nothing shown yet). Pure data + a counter; no model in the loop.
export interface HintState {
  ladderKey: string;
  revealedThrough: 0 | 1 | 2 | 3 | 4;
}

// Empty key: a `pass` (or no-ladder) state — nothing to reveal.
export const NO_LADDER = "";

export function initialHintState(): HintState {
  return { ladderKey: NO_LADDER, revealedThrough: 0 };
}

export interface LadderOptions {
  // Required to advance into level 4 (revealCode / full solution).
  confirmRevealCode?: boolean;
  // §9.2: on a repeat of the SAME misconception, start one level higher so a stuck
  // learner isn't forced to re-read level 1. Schema carries no `autoEscalate` field, so
  // this is a driver option, not authored content.
  autoEscalate?: boolean;
}

// §9.1 — the frozen `Skill` has no `hintLadder` field, so the generic fallback ladders
// (used when attribution is mismatch/syntax/runtime) are engine defaults, keyed by
// attribution so a syntax error gets syntax-flavored nudges. Minimal and content-free;
// supersede with authored skill ladders if/when the schema grows that field.
export const GENERIC_LADDERS: Record<"syntax" | "runtime" | "mismatch", Hint[]> = {
  syntax: [
    { level: 1, body: "Your code didn't run — Python reported a syntax error. Read the message and look at the line it names." },
    { level: 2, body: "Syntax errors are usually a missing colon `:`, an unbalanced bracket/quote, or wrong indentation. Check the named line and the one above it." },
    { level: 3, body: "Re-type the named line carefully: every `(` needs a `)`, every opening quote needs a closing quote, and a block header (`if`/`for`/`while`/`def`) ends in `:`." },
    { level: 4, body: "Compare your line against a minimal correct example of the same construct and fix the mismatch." },
  ],
  runtime: [
    { level: 1, body: "Your code started but crashed while running. Read the error type and the line it points at." },
    { level: 2, body: "A runtime error means the line is valid Python but did something impossible — e.g. mixing incompatible types, or using a name before it's defined." },
    { level: 3, body: "Trace the values on the failing line by hand: what is each variable, and what type is it, at the moment the line runs?" },
    { level: 4, body: "Fix the operation on the failing line so the types and names are valid, then re-run." },
  ],
  mismatch: [
    { level: 1, body: "Your code ran, but the output didn't match what was expected. Compare them side by side." },
    { level: 2, body: "Look for a small difference: spacing, capitalisation, a missing/extra character, or computing a slightly different value." },
    { level: 3, body: "Re-read the prompt's exact wording for what to print/return, then make your output match it character-for-character." },
    { level: 4, body: "Adjust the computation or the literal so the produced output equals the expected output exactly." },
  ],
};

// §9.2 — which ladder a Diagnosis points at.
export function ladderKeyFor(diag: Diagnosis): string {
  if (diag.attribution === "pass") return NO_LADDER;
  if (diag.attribution === "misconception") {
    return diag.misconceptionId ?? "generic:misconception";
  }
  return `generic:${diag.attribution}`;
}

// The ladder data for a key. Misconception key → authored ladder; `generic:<attr>` →
// engine default; empty/unknown → empty.
export function ladderFor(key: string, bundle: Bundle): Hint[] {
  if (key === NO_LADDER) return [];
  if (key.startsWith("generic:")) {
    const attr = key.slice("generic:".length);
    return GENERIC_LADDERS[attr as keyof typeof GENERIC_LADDERS] ?? GENERIC_LADDERS.mismatch;
  }
  return bundle.misconceptions[key]?.hintLadder ?? [];
}

// §9.2 — sync the ladder to a new Diagnosis. Changing misconception resets to the new
// ladder at level 0; repeating the same one (with autoEscalate) raises the floor by one,
// bounded at 3 so the solution is never auto-revealed, and only after at least one pull.
export function syncLadder(prev: HintState, diag: Diagnosis, opts: LadderOptions = {}): HintState {
  const key = ladderKeyFor(diag);
  if (key !== prev.ladderKey) return { ladderKey: key, revealedThrough: 0 };
  if (opts.autoEscalate && prev.revealedThrough >= 1 && prev.revealedThrough < 3) {
    return { ladderKey: key, revealedThrough: (prev.revealedThrough + 1) as HintState["revealedThrough"] };
  }
  return prev;
}

// §9.2 — one press reveals exactly one more level. Level 4 (the last, the revealCode
// solution) requires an explicit confirm. Never exceeds the ladder's length.
export function pullHint(state: HintState, ladder: Hint[], opts: LadderOptions = {}): HintState {
  const max = ladder.length; // 0..4 for v1 content
  const next = state.revealedThrough + 1;
  if (next > max) return state;
  if (next >= 4 && !opts.confirmRevealCode) return state; // solution behind a confirm
  return { ladderKey: state.ladderKey, revealedThrough: next as HintState["revealedThrough"] };
}

// §9.2 — the learner sees levels 1..revealedThrough.
export function visibleHints(state: HintState, ladder: Hint[]): Hint[] {
  return ladder.filter((h) => h.level <= state.revealedThrough);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine test -- hintLadder
```
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Lint + typecheck the new file**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine lint && pnpm --filter @trellis/engine typecheck
```
Expected: both clean (purity lint passes — no react/idb/pyodide/fetch).

- [ ] **Step 6: Commit**

```bash
git -c user.name='Stream E — M4 misconceptions-hints' -c user.email='noreply@anthropic.com' \
  add packages/engine/src/hintLadder.ts packages/engine/test/hintLadder.test.ts
git -c user.name='Stream E — M4 misconceptions-hints' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): pure §9 hint-ladder driver (dose, confirm-gate, autoEscalate, reset)"
```

---

## Task 2: §7 match-aware `detect` precedence for `timedOut` disambiguation (`@trellis/engine`)

**Files:**
- Modify: `packages/engine/src/detect.ts` (add `matchedSpecificity`; use it in `detect()`)
- Test: `packages/engine/test/detect-precedence.test.ts`

**Why (design-note §5):** once the orchestrator re-keys `mis.loop.infinite_true` to add a `{timedOut:true}` branch, its signature becomes `{ any: [ {timedOut:true}, {astTag: infinite_true_no_break}, {choice: b} ] }`. The current `specificityRank` ranks the *whole signature* by its min-rank branch (= 0, because of the `astTag` branch) **regardless of which branch actually fired**. So on a never-updating `while guess != number:` timeout — where `infinite_true` matches ONLY via `timedOut`, while `no_update` matches via its `while_cond_no_update` astTag — both would rank 0 and the id tie-break would pick `infinite_true` (wrong). The fix: rank a candidate by the **most specific branch that actually evaluated true** for these signals. Then `no_update` (fired astTag, rank 0) beats `infinite_true` (fired only `timedOut`, rank 2). On a real `while True:` (where `infinite_true_no_break` astTag fires), `infinite_true`'s matched rank is 0 and the id tie-break correctly favours it. This is the exact discrimination the offline isolated-signature harness cannot reproduce, so it lives in the engine.

This change is **backward-compatible**: no current corpus misconception carries a `timedOut` branch, and the differential/`detect` tests pin existing behavior — you re-run them in Step 6.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/test/detect-precedence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Bundle, RawSignals, Step, Signature } from "@trellis/schema";
import { detect, matchedSpecificity, type DetectContext } from "../src/detect.js";

// Build a tiny bundle: one skill carrying two misconceptions whose signatures we control.
function bundleWith(sigs: Record<string, Signature>): Bundle {
  const misconceptions: Record<string, unknown> = {};
  for (const [id, signature] of Object.entries(sigs)) {
    misconceptions[id] = { id, skill: "skill.loop", title: id, signature, hintLadder: [], feedback: "" };
  }
  return {
    contentVersion: "v1",
    skills: { "skill.loop": { id: "skill.loop", title: "loop", description: "", misconceptions: Object.keys(sigs), upstream: [] } },
    nodes: {},
    cells: {},
    misconceptions,
    producers: {},
    requirements: {},
  } as unknown as Bundle;
}

const step = { id: "s", kind: "build", skills: ["skill.loop"] } as unknown as Step;

// The post-re-key infinite_true signature (timedOut OR astTag OR choice) and no_update (astTag OR choice).
const REKEYED = {
  "mis.loop.infinite_true": { any: [{ timedOut: true }, { astTag: "infinite_true_no_break" }, { choice: "b" }] },
  "mis.loop.no_update": { any: [{ astTag: "while_cond_no_update" }, { choice: "b" }] },
} as Record<string, Signature>;

describe("matchedSpecificity — rank by the branch that actually fired", () => {
  it("an `any` with only its timedOut branch matching ranks at the timedOut leaf (2)", () => {
    const ctx: DetectContext = { signals: { ran: false, wallMs: 0, timedOut: true } };
    expect(matchedSpecificity(REKEYED["mis.loop.infinite_true"], ctx)).toBe(2);
  });
  it("an `any` whose astTag branch fires ranks at the astTag leaf (0)", () => {
    const ctx: DetectContext = { signals: { ran: false, wallMs: 0, timedOut: true, astTags: ["infinite_true_no_break"] } };
    expect(matchedSpecificity(REKEYED["mis.loop.infinite_true"], ctx)).toBe(0);
  });
  it("a non-matching signature ranks at Infinity", () => {
    const ctx: DetectContext = { signals: { ran: true, wallMs: 0 } };
    expect(matchedSpecificity(REKEYED["mis.loop.no_update"], ctx)).toBe(Infinity);
  });
});

describe("detect — timedOut disambiguation across infinite-loop misconceptions", () => {
  const bundle = bundleWith(REKEYED);

  it("never-updating `while cond:` timeout → no_update (its astTag fired; infinite_true only timed out)", () => {
    // Genuine non-terminating while-cond loop: while_cond_no_update astTag fires; the
    // While.test is NOT a literal True so infinite_true_no_break does NOT fire; it hangs → timedOut.
    const signals: RawSignals = { ran: false, wallMs: 1000, timedOut: true, astTags: ["while_cond_no_update"] };
    expect(detect(step, { signals }, bundle)).toBe("mis.loop.no_update");
  });

  it("true `while True:` no-break timeout → infinite_true (its structural astTag fired)", () => {
    // `while True:` with no break: BOTH astTags fire (a While with no Assign also matches
    // while_cond_no_update). Both candidates rank 0 → id tie-break favours infinite_true.
    const signals: RawSignals = {
      ran: false, wallMs: 1000, timedOut: true,
      astTags: ["infinite_true_no_break", "while_cond_no_update"],
    };
    expect(detect(step, { signals }, bundle)).toBe("mis.loop.infinite_true");
  });

  it("a bare timeout with no astTags → infinite_true is the only candidate that fires", () => {
    const signals: RawSignals = { ran: false, wallMs: 1000, timedOut: true };
    // no_update requires its astTag (or choice b); neither fires → only infinite_true matches.
    expect(detect(step, { signals }, bundle)).toBe("mis.loop.infinite_true");
  });
});

describe("detect — backward compatibility (no timedOut branches present)", () => {
  it("two astTag candidates still tie-break by id", () => {
    const bundle = bundleWith({
      "mis.b": { astTag: "t" },
      "mis.a": { astTag: "t" },
    } as Record<string, Signature>);
    const signals: RawSignals = { ran: true, wallMs: 0, astTags: ["t"] };
    expect(detect(step, { signals }, bundle)).toBe("mis.a");
  });
  it("an astTag candidate beats a runError candidate (specificity 0 < 2)", () => {
    const bundle = bundleWith({
      "mis.structural": { astTag: "t" },
      "mis.generic": { runError: "runtime" },
    } as Record<string, Signature>);
    const signals: RawSignals = { ran: false, wallMs: 0, astTags: ["t"], runError: { type: "runtime", message: "x" } };
    expect(detect(step, { signals }, bundle)).toBe("mis.structural");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine test -- detect-precedence
```
Expected: FAIL — `matchedSpecificity` is not exported, and the never-updating case currently resolves to `mis.loop.infinite_true` (the bug this task fixes).

- [ ] **Step 3: Add `matchedSpecificity` and use it in `detect()`**

In `packages/engine/src/detect.ts`, add `matchedSpecificity` after `specificityRank` (keep `specificityRank` — it stays exported and used as a documented static fallback). Insert:

```ts
// §7 match-aware specificity — rank a signature by the MOST specific leaf that actually
// evaluates true for these signals (Infinity if it doesn't match at all). This is what the
// cross-candidate tie-break needs once a misconception's `any` mixes a structural branch
// (astTag, rank 0) with a runtime branch (timedOut, rank 2): the candidate that matched via
// the runtime branch must lose to one that matched structurally, even though both signatures
// statically contain a rank-0 branch. See design-note §5 (the timedOut re-key).
export function matchedSpecificity(sig: Signature, ctx: DetectContext): number {
  if (!evalSignature(sig, ctx)) return Infinity;
  if ("astTag" in sig || "choice" in sig || "recallEquals" in sig) return 0;
  if ("testFailure" in sig || "propertyFailed" in sig) return 1;
  if ("runError" in sig || "timedOut" in sig) return 2;
  if ("any" in sig) {
    // The `any` matched, so at least one member did — rank by the most specific matcher.
    return Math.min(...sig.any.map((s) => matchedSpecificity(s, ctx)));
  }
  if ("all" in sig) {
    // The `all` matched, so every member did — rank by the most specific member.
    return sig.all.length ? Math.min(...sig.all.map((s) => matchedSpecificity(s, ctx))) : 3;
  }
  if ("not" in sig) {
    // A satisfied `not` has no positive leaf; fall back to its static structural rank.
    return specificityRank(sig.not);
  }
  return 3;
}
```

Then change `detect()`'s sort to use `matchedSpecificity` (match-aware) with the static `specificityRank` as a deterministic secondary, then id. Replace the existing `unique.sort(...)` block (`packages/engine/src/detect.ts:75-80`) with:

```ts
  unique.sort((a, b) => {
    const sa = bundle.misconceptions[a]!.signature;
    const sb = bundle.misconceptions[b]!.signature;
    const ma = matchedSpecificity(sa, ctx);
    const mb = matchedSpecificity(sb, ctx);
    if (ma !== mb) return ma - mb;
    const ra = specificityRank(sa);
    const rb = specificityRank(sb);
    if (ra !== rb) return ra - rb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
```

(Both `a` and `b` are in `candidates`, so each already satisfies `evalSignature` → `matchedSpecificity` is finite for both. The static `specificityRank` secondary keeps the ordering total and stable for equal-matched-rank candidates.)

- [ ] **Step 4: Run the new test to verify it passes**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine test -- detect-precedence
```
Expected: PASS.

- [ ] **Step 5: Run the FULL engine suite (no regression in existing detect/diagnose tests)**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine test
```
Expected: all engine tests green (≥120 prior + the new files).

- [ ] **Step 6: Run the sandbox 21-fixture differential (cross-impl backward-compat with `harness.py`)**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/sandbox build && pnpm --filter @trellis/engine build
pnpm --filter @trellis/sandbox test -- differential
```
Expected: PASS (17 tests) — the match-aware tie-break must not change any per-fixture fire/silent outcome. If any fixture flips, STOP: the change regressed cross-impl agreement; re-examine `matchedSpecificity` before proceeding.

- [ ] **Step 7: Commit**

```bash
git -c user.name='Stream E — M4 misconceptions-hints' -c user.email='noreply@anthropic.com' \
  add packages/engine/src/detect.ts packages/engine/test/detect-precedence.test.ts
git -c user.name='Stream E — M4 misconceptions-hints' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): match-aware §7 detect precedence (timedOut disambiguation, design-note §5)"
```

- [ ] **Step 8: ESCALATION ARTIFACT (do NOT edit content/harness yourself)**

Append the orchestrator hand-off to the status report (Task 5). The re-key the orchestrator must apply on `main` (design-note §5 / §92):
- In `content/skills/loops.taxonomy.yaml`, change `mis.loop.infinite_true.signature` from
  `{ any: [ { astTag: infinite_true_no_break }, { choice: b } ] }`
  to `{ any: [ { timedOut: true }, { astTag: infinite_true_no_break }, { choice: b } ] }`.
- Update `content/verify/harness.py` if it must accept the `timedOut` primitive in isolation (the offline harness tests signatures in isolation and cannot reproduce precedence — flag that the harness fixture for `infinite_true` may need a `notTriggers` adjustment, which is the orchestrator's call).
- After the orchestrator lands it on `main`, rebase and re-run Step 6 (differential) + the new `detect-precedence` test to verify end-to-end. **Hold and escalate if a precedence ambiguity surfaces — do not paper over it.**

---

## Task 3: Turn on §13.2 gate 7 (golden Diagnosis snapshots) live (`@trellis/authoring`)

**Files:**
- Modify: `packages/authoring/src/gates/golden.ts`
- Test: `packages/authoring/test/gate-golden.test.ts`

Gate 7 currently emits an informational `warn` (a stub). Make it **re-grade** each build-step golden snapshot via `gradeBuild` and **diff** the result against the authored `expect: { attribution, misconceptionId? }`, emitting an `error` on mismatch. A golden snapshot lives on a step as `golden: { submission: <code>, expect: { attribution, misconceptionId? } }`. Build-step goldens are re-graded (matching `gradeBuild`'s capability); non-build goldens emit a `warn` (deferred — `gradeBuild` is build-only). The corpus currently has zero goldens, so this gate is proven live against a synthetic `Loaded` in the authoring test suite (no `content/**` edit). To make the gate green on the *real* corpus, the orchestrator adds a golden to `content/` (escalation artifact below).

- [ ] **Step 1: Write the failing test**

Create `packages/authoring/test/gate-golden.test.ts`. Mirror the shape `loadContent` produces (`Loaded` = `{ nodes, skills, miscons }`, with `nodes[id].cells[].steps[]` carrying raw steps). Reuse the marquee str_num content so the re-grade is real (it shells out to `python3`).

```ts
import { describe, it, expect } from "vitest";
import { gateGolden } from "../src/gates/golden.js";
import type { Loaded } from "../src/raw-types.js";

// The real str_num build step + misconception, minimal but faithful to content/.
function loadedWithGolden(golden: unknown): Loaded {
  const step = {
    id: "cell.string_concat.text_plus_number#4",
    kind: "build",
    language: "python",
    skills: ["skill.string.concat_str_num"],
    starterCode: "def announce(number):\n    return \"\"",
    evaluator: {
      run: { timeoutMs: 5000, memoryMb: 256, entrypoint: "announce" },
      tests: { cases: [{ args: [7], expected: "Your random number is: 7" }] },
    },
    golden,
  };
  return {
    nodes: {
      "node.string_concat": {
        id: "node.string_concat",
        cells: [{ id: "cell.string_concat.text_plus_number", nodeId: "node.string_concat", title: "t", certifies: [], steps: [step] }],
      },
    },
    skills: {
      "skill.string.concat_str_num": { id: "skill.string.concat_str_num", title: "t", description: "", upstream: ["skill.string.concat"], misconceptions: [] },
    },
    miscons: {
      "mis.concat.str_num": {
        id: "mis.concat.str_num",
        skill: "skill.string.concat_str_num",
        title: "t",
        signature: { any: [{ runError: "runtime" }, { choice: "a" }] },
        hintLadder: [],
        feedback: "fb",
      },
    },
  } as unknown as Loaded;
}

describe("gate 7 — golden Diagnosis snapshots (live re-grade + diff)", () => {
  it("no goldens in corpus → informational warn, never red", () => {
    const loaded = loadedWithGolden(undefined);
    const issues = gateGolden(loaded);
    expect(issues.every((i) => i.level === "warn")).toBe(true);
  });

  it("a matching golden re-grades clean (no error)", () => {
    const loaded = loadedWithGolden({
      submission: "def announce(number):\n    return \"Your random number is: \" + number",
      expect: { attribution: "misconception", misconceptionId: "mis.concat.str_num" },
    });
    const issues = gateGolden(loaded);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("a golden whose expected attribution is wrong fails the gate with a clear diff", () => {
    const loaded = loadedWithGolden({
      submission: "def announce(number):\n    return \"Your random number is: \" + number",
      expect: { attribution: "pass" }, // wrong: this submission is a misconception
    });
    const issues = gateGolden(loaded);
    const errs = issues.filter((i) => i.level === "error");
    expect(errs.length).toBe(1);
    expect(errs[0].message).toContain("cell.string_concat.text_plus_number#4");
    expect(errs[0].message).toContain("attribution");
  });

  it("a golden whose expected misconceptionId is wrong fails the gate", () => {
    const loaded = loadedWithGolden({
      submission: "def announce(number):\n    return \"Your random number is: \" + number",
      expect: { attribution: "misconception", misconceptionId: "mis.concat.missing_space" },
    });
    const errs = gateGolden(loaded).filter((i) => i.level === "error");
    expect(errs.length).toBe(1);
    expect(errs[0].message).toContain("misconceptionId");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/authoring test -- gate-golden
```
Expected: FAIL — the current stub never re-grades, so the matching/mismatching cases don't behave as asserted (the "wrong attribution" case yields no error).

- [ ] **Step 3: Implement the live gate**

Replace the body of `packages/authoring/src/gates/golden.ts` with a live re-grade + diff:

```ts
import type { Loaded, RawStep } from "../raw-types.js";
import { gradeBuild } from "../grade.js";
import type { GateIssue } from "./types.js";

const G = "7-golden";

interface Golden {
  submission: string;
  expect: { attribution: string; misconceptionId?: string };
}

// §13.2 gate 7 — for every step carrying a `golden` snapshot, re-grade the recorded
// submission and diff attribution (+ misconceptionId) against the authored expectation.
// Build steps re-grade via the dry-run grader (grade.ts); non-build goldens are deferred
// (gradeBuild is build-only) and warn rather than error.
export function gateGolden(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  let found = 0;

  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const st of c.steps as RawStep[]) {
        const golden = st["golden"] as Golden | undefined;
        if (!golden) continue;
        found++;

        if (st.kind !== "build") {
          issues.push({ gate: G, level: "warn", message: `gate 7: ${st.id} golden on a ${st.kind} step — non-build re-grade deferred (skipped)` });
          continue;
        }

        let got;
        try {
          got = gradeBuild(loaded, st.id, golden.submission);
        } catch (e) {
          issues.push({ gate: G, level: "error", message: `gate 7: ${st.id} golden failed to re-grade: ${(e as Error).message}` });
          continue;
        }

        if (got.attribution !== golden.expect.attribution) {
          issues.push({
            gate: G,
            level: "error",
            message: `gate 7: ${st.id} attribution drift — expected ${golden.expect.attribution}, got ${got.attribution}`,
          });
          continue;
        }
        const wantMid = golden.expect.misconceptionId;
        if (wantMid !== undefined && got.misconceptionId !== wantMid) {
          issues.push({
            gate: G,
            level: "error",
            message: `gate 7: ${st.id} misconceptionId drift — expected ${wantMid}, got ${got.misconceptionId ?? "(none)"}`,
          });
        }
      }
    }
  }

  if (found === 0) {
    return [{ gate: G, level: "warn", message: "gate 7: no golden Diagnosis snapshots in corpus (skipped; add `golden:` to a step to enable)" }];
  }
  return issues;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/authoring test -- gate-golden
```
Expected: PASS (the matching golden is clean; both drift cases produce exactly one error with a readable diff).

- [ ] **Step 5: Run the FULL authoring suite + lint/typecheck (gates 5 & 6 unaffected)**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/authoring test && pnpm --filter @trellis/authoring lint && pnpm --filter @trellis/authoring typecheck
```
Expected: all authoring tests green (76 prior + new); gate 5 (`fixtures`) and gate 6 (`oracle`) still live and green.

- [ ] **Step 6: Confirm the real-corpus gate run still passes (gate 7 warns, never red, with no goldens authored yet)**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
node --import tsx packages/authoring/src/cli.ts build 2>/dev/null || pnpm --filter @trellis/authoring exec trellis build || true
python3 content/validate.py && python3 content/verify/harness.py
```
Expected: `validate.py` PASS; `harness.py` `gate5: PASS | gate6 oracle-smoke: PASS`. (The CLI line is best-effort to exercise `runAllGates` on the real corpus; if the CLI entrypoint differs, the authoring test suite already exercises `runAllGates` — the load-bearing check is that no gate goes red.)

- [ ] **Step 7: Commit**

```bash
git -c user.name='Stream E — M4 misconceptions-hints' -c user.email='noreply@anthropic.com' \
  add packages/authoring/src/gates/golden.ts packages/authoring/test/gate-golden.test.ts
git -c user.name='Stream E — M4 misconceptions-hints' -c user.email='noreply@anthropic.com' \
  commit -m "feat(authoring): turn on §13.2 gate 7 — live golden Diagnosis re-grade + diff"
```

- [ ] **Step 8: ESCALATION ARTIFACT (content is orchestrator-owned)**

To make gate 7 green on the *real* corpus (not just the synthetic test), the orchestrator should add a golden to the str_num build step in `content/nodes/string_concat.yaml` (step `cell.string_concat.text_plus_number#4`):

```yaml
golden:
  submission: |
    def announce(number):
        return "Your random number is: " + number
  expect: { attribution: misconception, misconceptionId: mis.concat.str_num }
```

Include this verbatim in the Task 5 status report.

---

## Task 4: Marquee end-to-end + serialize the barrel (`@trellis/engine`)

**Files:**
- Modify (serialized): `packages/engine/src/index.ts` — export the hintLadder API + `matchedSpecificity`.
- Modify (serialized): `packages/engine/package.json` — add test-only devDeps `@trellis/sandbox`, `@trellis/authoring`.
- Test: `packages/engine/test/m4-concat-e2e.test.ts`.

This is the marquee defining gate: `'… ' + number` → right misconception id → right authored feedback → a 4-level ladder where each press reveals exactly one more level (level 4 behind a confirm), `autoEscalate` on repeat, reset-on-new-misconception, and a byte-identical `Diagnosis` under a fixed `now`. It does a **real CPython-twin run** (`createLocalSandbox`, offline) against the **real compiled bundle** (`compile(loadContent("content"))`) so nothing drifts from authored content. **Run this task last** — it is the only one that edits the shared `index.ts` barrel.

> **No-network reality:** the local CPython twin (`createLocalSandbox`) runs offline; real-Pyodide-in-WASM verification of the live ladder remains DEFERRED to a networked browser (same posture as M3a/M3b). Say so in the report; do not claim browser end-to-end.

- [ ] **Step 1: Add test-only devDeps to the engine package**

Edit `packages/engine/package.json`'s `devDependencies` to add (keep `vitest`):

```json
  "devDependencies": {
    "@trellis/authoring": "workspace:*",
    "@trellis/sandbox": "workspace:*",
    "vitest": "^2.1.0"
  }
```

Then install (lockfile churn here is the expected, orchestrator-resolved conflict — START-HERE §90):

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm install --offline
```
Expected: resolves from the workspace; no network. (`@trellis/authoring` depends on `@trellis/schema` + `re2js` only — it does NOT import `@trellis/engine`, so this devDep adds no runtime cycle. `@trellis/sandbox` already devDeps `@trellis/engine`; the engine→sandbox edge here is **test-only** and never enters the built module graph — re-verified in Step 7.)

- [ ] **Step 2: Update the barrel (serialized — the one shared file)**

Append to `packages/engine/src/index.ts` (after the `detect` export block at line 18):

```ts
export { matchedSpecificity } from "./detect.js";

export type { HintState, LadderOptions } from "./hintLadder.js";
export {
  NO_LADDER,
  GENERIC_LADDERS,
  initialHintState,
  ladderKeyFor,
  ladderFor,
  syncLadder,
  pullHint,
  visibleHints,
} from "./hintLadder.js";
```

- [ ] **Step 3: Write the failing end-to-end test**

Create `packages/engine/test/m4-concat-e2e.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadContent, compile } from "@trellis/authoring";
import { createLocalSandbox } from "@trellis/sandbox";
import {
  evaluate,
  ladderKeyFor,
  ladderFor,
  syncLadder,
  pullHint,
  visibleHints,
  initialHintState,
} from "../src/index.js";
import type { BuildStep, Bundle, Step } from "@trellis/schema";

const CONTENT_ROOT = resolve(__dirname, "../../../content");
const bundle: Bundle = compile(loadContent(CONTENT_ROOT));
const sandbox = createLocalSandbox();
const fx = { id: "d1", learnerId: "L1", now: "2026-06-08T00:00:00.000Z" };

function findStep(stepId: string): Step {
  for (const cid of Object.keys(bundle.cells)) {
    const cell = bundle.cells[cid]!;
    for (const st of cell.steps) if (st.id === stepId) return st;
  }
  throw new Error(`step ${stepId} not found in compiled bundle`);
}

const STR_NUM_STEP = findStep("cell.string_concat.text_plus_number#4") as BuildStep;
// START-HERE's `'age: ' + age` shorthand for the str+number fault on this entrypoint:
const BAD = 'def announce(number):\n    return "Your random number is: " + number';
const GOOD = 'def announce(number):\n    return "Your random number is: " + str(number)';

describe("M4 marquee — str+number → mis.concat.str_num → feedback → pullable ladder", () => {
  it("the str+number fault is attributed to mis.concat.str_num with the authored feedback", { timeout: 60_000 }, async () => {
    const d = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    expect(d.correct).toBe(false);
    expect(d.attribution).toBe("misconception");
    expect(d.misconceptionId).toBe("mis.concat.str_num");

    // Right feedback: the authored copy on the misconception (source of truth = content).
    const authored = bundle.misconceptions["mis.concat.str_num"]!;
    expect(authored.feedback).toContain("TypeError");
    expect(authored.feedback.length).toBeGreaterThan(0);
  });

  it("a correct str() solution passes — no misconception, no ladder", { timeout: 60_000 }, async () => {
    const d = await evaluate(STR_NUM_STEP, { kind: "build", code: GOOD }, sandbox, bundle, fx);
    expect(d.correct).toBe(true);
    expect(d.attribution).toBe("pass");
    expect(ladderKeyFor(d)).toBe("");
  });

  it("each press reveals exactly one more level; level 4 (revealCode) is behind a confirm", { timeout: 60_000 }, async () => {
    const d = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    const ladder = ladderFor(ladderKeyFor(d), bundle);
    expect(ladder.map((h) => h.level)).toEqual([1, 2, 3, 4]);
    expect(ladder[3].revealCode).toBeTruthy(); // authored solution on level 4

    let s = syncLadder(initialHintState(), d);
    expect(s).toEqual({ ladderKey: "mis.concat.str_num", revealedThrough: 0 });
    expect(visibleHints(s, ladder)).toEqual([]);

    s = pullHint(s, ladder);
    expect(visibleHints(s, ladder).map((h) => h.level)).toEqual([1]);
    s = pullHint(s, ladder);
    expect(visibleHints(s, ladder).map((h) => h.level)).toEqual([1, 2]);
    s = pullHint(s, ladder);
    expect(visibleHints(s, ladder).map((h) => h.level)).toEqual([1, 2, 3]);

    // Plain pull cannot cross into the solution.
    const stuck = pullHint(s, ladder);
    expect(stuck.revealedThrough).toBe(3);
    expect(visibleHints(stuck, ladder).some((h) => h.revealCode !== undefined)).toBe(false);

    // Confirmed pull reveals level 4 (the revealCode).
    s = pullHint(s, ladder, { confirmRevealCode: true });
    expect(s.revealedThrough).toBe(4);
    expect(visibleHints(s, ladder).some((h) => h.revealCode !== undefined)).toBe(true);
  });

  it("autoEscalate on a repeat of the same misconception raises the floor (no re-reading level 1)", { timeout: 60_000 }, async () => {
    const d = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    const ladder = ladderFor(ladderKeyFor(d), bundle);
    let s = pullHint(syncLadder(initialHintState(), d), ladder); // revealedThrough 1
    // Same misconception again → autoEscalate bumps the floor to 2.
    s = syncLadder(s, d, { autoEscalate: true });
    expect(s.revealedThrough).toBe(2);
    expect(visibleHints(s, ladder).map((h) => h.level)).toEqual([1, 2]);
  });

  it("a different misconception resets the ladder to level 0", { timeout: 60_000 }, async () => {
    const d = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    let s = pullHint(pullHint(syncLadder(initialHintState(), d), ladderFor(ladderKeyFor(d), bundle)), ladderFor(ladderKeyFor(d), bundle));
    expect(s.revealedThrough).toBe(2);
    // A syntax error on the next attempt → different ladder key → reset.
    const synt = await evaluate(STR_NUM_STEP, { kind: "build", code: "def announce(number)\n    return number" }, sandbox, bundle, fx);
    s = syncLadder(s, synt);
    expect(s.ladderKey).not.toBe("mis.concat.str_num");
    expect(s.revealedThrough).toBe(0);
  });

  it("determinism: the same submission yields a byte-identical Diagnosis", { timeout: 60_000 }, async () => {
    const a = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    const b = await evaluate(STR_NUM_STEP, { kind: "build", code: BAD }, sandbox, bundle, fx);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
```

- [ ] **Step 4: Run the test to verify it fails (then passes)**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine test -- m4-concat-e2e
```
Expected: PASS once the barrel (Step 2) exports the ladder API and Tasks 1–2 are in. If it FAILS first on a missing export, that confirms the barrel wiring is the only gap — fix the export, re-run. If `findStep` throws "not found", verify the compiled `bundle.cells` keying (the cell id is `cell.string_concat.text_plus_number`; the step id is `…#4`).

- [ ] **Step 5: Run the FULL engine suite + lint + typecheck**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm --filter @trellis/engine test && pnpm --filter @trellis/engine lint && pnpm --filter @trellis/engine typecheck
```
Expected: all green. The purity lint covers `src/**` only — the e2e test's `@trellis/sandbox`/`@trellis/authoring` imports are test files, not engine `src`, so engine runtime purity is preserved.

- [ ] **Step 6: Full monorepo gates**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm -r build && pnpm -r typecheck && pnpm -r lint && pnpm -r test
```
Expected: all green; total test count = 288 baseline + new M4 tests.

- [ ] **Step 7: Verify no runtime ESM cycle from the new devDeps (the build-cycle trap)**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
node -e "import('./packages/engine/dist/src/index.js').then(m => console.log('engine ok:', typeof m.pullHint, typeof m.detect, typeof m.matchedSpecificity))"
node -e "import('./packages/authoring/dist/src/index.js').then(m => console.log('authoring ok:', typeof m.compile))"
node -e "import('./packages/sandbox/dist/src/index.js').then(m => console.log('sandbox ok:', typeof m.createLocalSandbox))"
```
Expected: each prints `… ok: function …` with no deadlock/hang (the test-only devDep does not enter `engine/dist`'s module graph; engine `src` never imports sandbox/authoring).

- [ ] **Step 8: Python gates (unchanged corpus)**

```bash
python3 content/validate.py && python3 content/verify/harness.py
```
Expected: `validate.py` PASS; `harness.py` `gate5: PASS | gate6 oracle-smoke: PASS`.

- [ ] **Step 9: Commit**

```bash
git -c user.name='Stream E — M4 misconceptions-hints' -c user.email='noreply@anthropic.com' \
  add packages/engine/src/index.ts packages/engine/package.json packages/engine/test/m4-concat-e2e.test.ts pnpm-lock.yaml
git -c user.name='Stream E — M4 misconceptions-hints' -c user.email='noreply@anthropic.com' \
  commit -m "feat(engine): M4 marquee e2e — str+number → mis.concat.str_num → feedback → ladder; export ladder API"
```

---

## Task 5: Verification, status report, and branch finishing

**Files:** none (verification + reporting only).

- [ ] **Step 1: Reproduce the full green bar with real output**

```bash
export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"
pnpm -r build && pnpm -r typecheck && pnpm -r lint && pnpm -r test
python3 content/validate.py
python3 content/verify/harness.py
```
Capture: per-package test counts (`Tests N passed`), `validate.py` `RESULT: PASS`, `harness.py` `gate5: PASS | gate6 oracle-smoke: PASS`.

- [ ] **Step 2: Confirm the M4 defining gates (spec §4 M4 / START-HERE §50) are each demonstrably green**
  - Right id + right feedback + pullable ladder (one level per press, level-4 confirm, autoEscalate, reset): `m4-concat-e2e.test.ts` ✅
  - Gates 5–7 green for the slice, fixture-runner live (not stubbed): authoring suite (gate 5 `fixtures`, gate 6 `oracle` live; gate 7 `golden` now live re-grade) ✅
  - Determinism (byte-identical Diagnosis): `m4-concat-e2e.test.ts` determinism case ✅
  - §7 timedOut precedence built + escalation prepared: `detect-precedence.test.ts` ✅

- [ ] **Step 3: Write the orchestrator status report** with real command output, including BOTH escalation artifacts:
  - **Escalation A (timedOut re-key, Task 2 Step 8):** the exact `content/skills/loops.taxonomy.yaml` signature change + the `harness.py` caveat; note the engine precedence is proven and the orchestrator applies the content/harness re-key on `main`, after which Stream E rebases + re-verifies the differential.
  - **Escalation B (gate-7 golden, Task 3 Step 8):** the exact `golden:` block to add to `content/nodes/string_concat.yaml` to make gate 7 green on the real corpus.
  - **Deferral note:** real-Pyodide-in-WASM verification of the live ladder remains deferred to a networked browser (built/verified against the local CPython twin only).
  - **No schema change** was needed (as expected); `autoEscalate` and generic fallback ladders are engine-side because the frozen `Hint`/`Skill` carry no such fields.

- [ ] **Step 4: Rebase on `main` before integration (Stream F may have landed; only `pnpm-lock.yaml` is expected to conflict — orchestrator resolves)**

```bash
git fetch origin && git rebase origin/main
# If only pnpm-lock.yaml conflicts: re-run `pnpm install --offline`, `git add pnpm-lock.yaml`, `git rebase --continue`.
```
Then re-run Step 1 to confirm still-green post-rebase.

- [ ] **Step 5: Finish the branch** via `superpowers:finishing-a-development-branch` (merge target: `main`). Hand the green report + both escalation artifacts to the orchestrator, who performs the merge.

---

## Self-Review (completed against START-HERE + spec §4 M4 + design §7/§8/§9/§10/§13.2 + design-note §5)

**Spec coverage:**
- §9 hint ladder (4-level, learner-dosed, one-per-press, level-4 confirm, autoEscalate-on-repeat, reset-on-new-misconception) → Task 1 + Task 4 e2e. ✅
- Concat taxonomy wired end-to-end (str+number → `mis.concat.str_num` → feedback → ladder) → Task 4. ✅ (Uses the *actual* content signature `{any:[{runError:runtime},{choice:a}]}`; the spec's `implicit_coerce` astTag is shorthand the content deliberately avoids — documented.)
- §7 detect precedence for `timedOut` disambiguation → Task 2 (match-aware specificity) + escalation. ✅
- §8 diagnose / `applyDiagnosis` → REUSED (M2/M3b `evaluate`/`diagnoseNonBuild`/`computeDeltas`/`applyDiagnosis`), not duplicated. ✅
- §13.2 gates 5–7 → gates 5 & 6 already live (verified, not rewritten); gate 7 turned live → Task 3. ✅
- Determinism (byte-identical Diagnosis) → Task 4 determinism case. ✅
- No schema change → confirmed; `autoEscalate`/generic ladders are engine-side (Task 1 doc). ✅

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every command has expected output. ✅

**Type consistency:** `HintState`, `LadderOptions`, `ladderKeyFor`, `ladderFor`, `GENERIC_LADDERS`, `syncLadder`, `pullHint`, `visibleHints`, `initialHintState`, `NO_LADDER`, `matchedSpecificity` are named identically across Tasks 1, 2, 4, and the barrel. `Loaded`/`RawStep`/`GateIssue`/`gradeBuild` match existing authoring exports. `Diagnosis`/`Hint`/`Bundle`/`Step`/`BuildStep`/`Signature`/`RawSignals` are frozen schema types used as-is. ✅

**Ownership & escalation:** all writes are within `packages/engine/**` + `packages/authoring/**` (+ the engine test-only devDeps & lockfile). The `content/**` + `harness.py` re-key (Escalation A) and the corpus golden (Escalation B) are prepared as artifacts for the orchestrator — never edited here. ✅
