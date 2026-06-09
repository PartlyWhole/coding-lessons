# Stream A / M1 (`@trellis/authoring`) — Report to Orchestrator

**From:** Stream A (M1 `@trellis/authoring`) · **Branch:** `m1-authoring` · **Date:** 2026-06-08
**To action:** orchestrator (owns `main` + the frozen `@trellis/schema` contract)

**Status:** implementation complete; **76/76 package tests green**; `typecheck`/`lint`/`build` clean;
the Python differential oracle (`content/validate.py`, `content/verify/harness.py`) still green and
agreeing with the TS port on all 21 misconception fixtures. **The branch is NOT integratable to
`main` until Item 1 is resolved on `main` and this branch rebases.** No `@trellis/schema`,
`content/`, other-package, or shared-doc (`docs/**`) edits were made in this branch — only
`packages/authoring/**` plus the unavoidable `pnpm-lock.yaml` importer entry.

---

## 🚩 Item 1 — BLOCKER (frozen-contract change; must land on `main` first)

**`@trellis/schema` `GenSpec` over-constrains a nested `elem`.**

- **Defect:** `packages/schema/src/evaluator.ts:71–89` —
  `GenSpec = Type.Recursive((Self) => Type.Object({ param: Type.String(), …, elem: Type.Optional(Self), … }))`.
  Because `elem` reuses `Self`, a `list` generator's element generator inherits a **required** `param`.
- **Corpus collision:** `content/nodes/loops.yaml:268`, build step `cell.loops.guessing_game#5`:
  ```yaml
  generators:
    - param: guesses
      type: list
      elem: { type: choice, choices: [1, 25, 50, 75, 82, 90, 99, 100] }
      min: 1
      max: 8
  ```
  The `elem` (a `choice` element generator) correctly omits `param` — an element is not bound to a
  named entrypoint argument. It is the **only** nested `elem` in the entire corpus.
- **Failure:** `Value.Check(Bundle, …)` fails at `/cells/cell.loops.guessing_game/steps/4 →
  Expected union value`; the leaf cause is `/evaluator/property/generators/0/elem/param →
  Expected required property / Expected string`.
- **Why it was never caught before:** `content/validate.py` does not validate `GenSpec`;
  `content/verify/harness.py` gate‑6 samples a `list` as `[]` (`_sample`, ~line 313) and never
  recurses into `elem`. Both Python gates are green — only M1's TS `Value.Check` surfaces it.
- **Diagnosis:** the **schema is over-constrained**, not the content. Per §6.4, `param` is "which
  entrypoint argument" — meaningful only for top-level generators.
- **Recommended fix (on `main`, then streams rebase):** make `param` optional for nested element
  generators — lowest-risk: `param: Type.Optional(Type.String())` in `GenSpec` (or split a dedicated
  `ElemSpec` without `param`). Impact is minimal: top-level generators still carry `param`; the
  not-yet-built M3b property runner reads `param` only at the top level.
- **What I do after it lands:** rebase `m1-authoring` on `main` and flip the pinned tests from
  "exactly one known gate‑1 error" to full validity. The pins are in `packages/authoring/test/`:
  `compile.test.ts`, `gates-run.test.ts`, `cli.test.ts`, `corpus.smoke.test.ts` — each carries an
  inline flip-after-rebase comment. (In the interim, `compile()` builds and returns the bundle;
  schema validation is gate 1's job, and the four tests pin that the bundle is schema-valid *except*
  this one step, so the suite stays green and honest.)

## 🔧 Item 2 — lower severity (shared-package packaging; affects any stream shipping a bin)

Built `dist` entrypoints that **value**-import `@trellis/schema` cannot run under plain `node`,
because `@trellis/schema`'s `package.json` `main`/`exports` point at TS source (`./src/index.ts`).
Concretely, `node ./packages/authoring/dist/src/cli.js` fails to resolve `@trellis/schema`
(`ERR_MODULE_NOT_FOUND: …/packages/schema/src/ids.js`). Findings:

- My package's own module graph is verified **acyclic** and native‑ESM‑clean (the schema-free
  subgraph — `grade`/`signals`/`matcher`/`python`/`json-ast`/`signature` — imports cleanly under raw
  `node`). The only runtime value-import of `@trellis/schema` is `gates/schema-gate.js` (`Bundle`
  for `Value.Check`). `compile.js` only type-imports schema (erased).
- `@trellis/schema`'s **own** `dist` is node-runnable; the issue is purely that consumers resolve the
  bare specifier to `src/*.ts` via its `main`.
- The CLI behavior is fully proven via the test runner (`cli.test.ts` calls `main()` directly:
  lint/build/grade all verified).

**Options for `main`:** point shared packages' `exports`/`main` at built `dist` for node
consumption, or standardize bins on a TS runner (`tsx`/`vite-node`). Not a stream-local fix; it will
hit any stream with a `bin` and node-side consumers (e.g. M3a).

---

## What M1 delivered (independent of both items)

- **YAML → `Bundle` transform:** multi-doc taxonomy load; extract inline `misconceptions[]` → flat
  record + id-list on `Skill` (strip `triggers`/`notTriggers`/`_skill`/`_file`; keep `upstream`/
  `skillDeltas`); extract inline `cells[]` → flat record + id-list on `ConceptNode` + injected
  `nodeId`; §4.1 derived `producers`/`requirements`; content-addressed `contentVersion` (`ca-<16hex>`).
- **The seven §13.2 gates:** 1 schema · 2 referential · 3 DAG + upstream-DAG + **new §4.2 spine
  connectivity** · 4 granularity · 5 misconception fixtures · 6 reference-impl oracle · 7 golden
  Diagnosis (M4 plug-in stub). Gates 1–6 are ported to TS and **cross-checked against
  `content/verify/harness.py` on all 21 fixtures** via a real differential test.
- **Lints:** §6.3 loud-reject of `not`/`all`/`any` inside `where`; spine-never-requires-an-extension
  invariant (finds **zero** violations on the current corpus — positive confirmation the conditionals
  re-theme landed); RE2 pattern safety.
- **CLI:** `trellis lint | build | grade`.
- **Differential oracle retained:** `content/validate.py` → `RESULT: PASS`;
  `content/verify/harness.py` → `gate5: PASS | gate6 oracle-smoke: PASS`.
- **Capabilities supported but not yet exercised by the corpus** (proven by own fixtures, NOT a
  content rewrite — flagged, see below): the §6.3 `field` selector and the `{timedOut:true}`
  Signature primitive.

## Flagged follow-up (curriculum — the user's/orchestrator's call, NOT done in this branch)

START-HERE suggested migrating the corpus's over-matching `has_elif` / `infinite_true_no_break`
queries to the `field` selector and re-keying `mis.loop.infinite_true` on `{timedOut:true}`. That
edits `content/**`, which this stream must not do (PARALLEL-STREAMS §3). The compiler **supports**
both forms (tested in `matcher-field.test.ts` / `signature.test.ts`); the content migration is left
for the orchestrator/user. Both Python references and the TS gates are green on the un-migrated corpus.

## Plan & provenance

Implementation plan: `docs/superpowers/plans/2026-06-08-trellis-m1-authoring-compiler.md` (on this
branch). 16 scoped Conventional Commits authored as `Stream A — M1 authoring <noreply@anthropic.com>`.
