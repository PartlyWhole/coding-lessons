# Trellis — Parallel Work Coordination

**Owner:** orchestrator (the session that merges to `main`). **Date:** 2026-06-08
**Audience:** every agent working a Trellis milestone in parallel.

> This document is the single sync point for parallel streams. It is **read-only for streams.**
> The authoritative *contract* lives in code (`@trellis/schema`), not here — this doc points to it.
> Streams do **not** edit this file (it would become a merge-conflict magnet). Report status and
> blockers back to the orchestrator; the orchestrator updates the status board below.

---

## 1. Rules of engagement (read before you touch anything)

1. **One stream = one milestone = one git worktree = one branch.** Work only inside your assigned
   worktree on your assigned branch. Never `cd` into another stream's worktree or `main`.
2. **Stay in your package.** Each stream owns exactly the paths in §3. Do not edit another stream's
   package, the frozen contract, or shared docs. If you think you must, **STOP and escalate** —
   that's a contract change and it lands on `main` first.
3. **The frozen contract is `@trellis/schema` (on `main`).** Treat every exported type as immutable.
   Your stream consumes/implements it; it does not change it. See §2.
4. **Branch from the current `main`** (which already contains M0 + the frozen contract + the content
   corpus). Rebase on `main` before you open your integration PR.
5. **Commit discipline:** Conventional Commits; commit with
   `-c user.name='<your stream>' -c user.email='noreply@anthropic.com'`. Frequent, scoped commits.
6. **Verify before "done":** run the gates in §5 and paste real output. No success claims without evidence.
7. **Escalate, don't guess,** on anything that is the user's call (curriculum, contract changes,
   cross-stream decisions). Surface it; keep working on what you can.

## 2. The frozen contract (the integration seam)

Authoritative source: `packages/schema/src/bundle.ts` (+ the rest of `@trellis/schema`). Key types:

- **`Bundle`** — the compiled, immutable content artifact. **M1 emits it; M2 consumes it.** Keyed-by-id
  entity records (`skills`/`nodes`/`cells`/`misconceptions`) + the §4.1 derived indexes
  (`producers`, `requirements`).
- **`Graph`** — the structural subset the availability resolver (§4.3) needs (`nodes` + indexes). M2 consumes.
- **`RunResult` / `Sandbox` / `RunRequest`** — the sandbox execution contract (§6.1). **M3a implements
  `Sandbox`**; M3b/the build ladder call it; the pure engine never imports a concrete sandbox.
- All §3 entity types (`Skill`, `ConceptNode`, `Cell`, `Step` union, `Misconception`, `Signature`,
  `AstQuery` incl. the `field` selector, `Diagnosis`, `LearnerModel`, `RawSignals` incl. `timedOut`, …).

**If the seam is wrong or missing something:** stop, write down exactly what's needed, and escalate to
the orchestrator. A contract change is made once on `main` and all streams rebase. Do **not** add a
divergent local copy of a shared type.

## 3. Stream ↔ package ownership (disjoint paths — this is what makes parallel safe)

| Stream | Milestone | Branch | Owns (writes) | Reads (never writes) |
|---|---|---|---|---|
| **A** | M1 — `@trellis/authoring` compiler | `m1-authoring` | `packages/authoring/**` | `@trellis/schema`, `content/**`, `content/verify/harness.py`, `content/validate.py` |
| **B** | M2 — `@trellis/engine` pure core | `m2-engine` | `packages/engine/**` | `@trellis/schema` |
| **C** *(optional)* | M3a — `@trellis/sandbox` host | `m3a-sandbox` | `packages/sandbox/**` | `@trellis/schema` (`Sandbox`/`RunResult`) |

Shared, do-not-touch from a stream: `packages/schema/**`, `TECHNICAL_DESIGN.md`, `docs/**`,
root config (`turbo.json`, `.eslintrc.cjs`, `package.json`, `pnpm-workspace.yaml`, CI), `content/**`
(M1 reads but does not rewrite curriculum — flag issues instead).

## 4. Dependency & integration order

```
main (M0 ✅ + frozen contract) ──┬─► A: M1 authoring ──┐
                                 ├─► B: M2 engine ─────┤ merge each to main when done+reviewed
                                 └─► C: M3a sandbox ───┘
                                          │
                  (after integration)     ▼
                              M3b build-ladder ─► M4 misconceptions/hints ─► M5 presentation
```

- A, B, (C) are independent and merge to `main` in any order (disjoint packages).
- Each adds its package to `pnpm-workspace.yaml`? **No** — the glob `packages/*` already covers new
  packages; do not edit the workspace manifest.
- After a stream merges, others **rebase on `main`** (only the shared lockfile / new package dirs change;
  conflicts should be nil given disjoint paths). The orchestrator resolves any lockfile churn.
- Downstream (M3b/M4/M5) starts only after its inputs are integrated on `main`.

## 5. Environment & gates (every stream)

- **pnpm via corepack:** `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"` before any pnpm.
- **No network:** Pyodide/pygame wheels cannot be fetched here (affects M3a verification — build now,
  verify later, and say so). CPython3 IS available locally.
- **`@sinclair/typebox@^0.34`** (not `typebox` 1.0). Recursive TypeBox schemas: never annotate `: TSchema`.
- **ESM/build trap:** a module import cycle passes under Vitest but deadlocks native-ESM imports of the
  build output. Keep your package's module graph acyclic; verify with `pnpm --filter <pkg> build` +
  `node -e "import('./packages/<pkg>/dist/src/index.js')…"`. CI runs `pnpm build`.
- **Engine purity (M2):** `@trellis/engine` must not import react/idb/pyodide/fetch (ESLint enforces).
- Done = green: `pnpm --filter <pkg> typecheck && lint && test && build` + your milestone's plan gate.

## 6. Cross-stream decisions

Both prior open decisions are now **RESOLVED** (orchestrator + user, 2026-06-08):

- **`conditionals → random.randint`** (spine→extension invariant violation) — **RESOLVED: re-themed.**
  `node.conditionals` no longer requires `skill.random.randint`; its capstone was re-themed from a
  Magic-8 Ball to a deterministic **grade classifier** (`grade(score)` via `if/elif/else`), so the
  `random` extension is now genuinely optional and the invariant holds corpus-wide. Verified green:
  `python3 content/validate.py` (gates 1–4) + `content/verify/harness.py` (gate 5 fixtures incl.
  re-authored `mis.elif.order_overlap`, gate 6 oracle). M1's invariant lint should now find zero
  spine→extension `requires` edges. Side benefit: removed a version-fragile `random.seed→randint`
  trace and an unrequired `input()` dependency from the old capstone.
- **Proving-slice gating pair (M2 gating-diff test)** — **RESOLVED: determined by content.** `node.random`
  has exactly two requirements — `skill.var.assign` @ **0.6** (track, producer `node.variables`) and
  `skill.output.print_literal` @ **0.5** (utility, producer `node.output`). M2's diff test: hold
  `print_literal ≥ 0.5` met and toggle `var.assign` across 0.6 → `random` flips `locked`↔`available`
  (`var.assign` is the deciding gate). Both skills have single producers; the pair is unambiguous.

### Frozen-contract change during integration (2026-06-08)

- **`GenSpec.elem` over-constraint — FIXED on `main` @ `fec6b8f`.** Escalated by Stream A: the recursive
  `GenSpec` forced a list-element generator's `elem` to carry a REQUIRED `param`, but §6.4 `param`
  names an entrypoint argument (top-level only) — so the valid `loops` guessing-game generator failed
  `Value.Check(Bundle)`. Fix (decision A): a paramless recursive **`ElemSpec`** for `elem`; top-level
  `GenSpec.param` stays required. Compatible loosening — M2/M3a unaffected; **M1 must rebase + flip its
  pinned validity tests** (see §7). Test-first; schema 37/37 green.
- **~~DEFERRED follow-up~~ RESOLVED — shared-package node-runnable exports.** `@trellis/schema`'s
  `main`/`types`/`exports` now point at built `dist` with a `development`→`src` condition. Plain `node`
  (conditions `node`/`import`/`default`) resolves the bare specifier `@trellis/schema` to
  `dist/src/index.js` — a runtime value-import from a built consumer (e.g. M1's CLI) now works; only
  Vite/vitest inject `development`, so the test loop still runs live TS source (proved via a src-only
  sentinel). Verified clean-room across all three packages: `pnpm -r build` + native-ESM `import()` of
  each `dist/src/index.js` + plain-`node` bare value-import + `pnpm -r test` (136) + `pnpm -r typecheck`,
  all green; no ESM cycle (schema is a linear DAG). Only `packages/schema/package.json` changed. **M1
  benefit:** its `gates/schema-gate.js` CLI value-import resolves on rebase onto this `main` — no M1 code
  change needed. `tsconfig` `customConditions` deliberately untouched (editor types read `dist/*.d.ts`,
  kept fresh by Turbo `^build`); revisit at M5 if packaging needs live-source editor types.

## 7. Status board (orchestrator updates this — streams report, don't edit)

`main` @ `1c05031`. M2 + M3a integrated (merged result green: 136 tests across schema/engine/sandbox;
typecheck/lint/test/build all pass; lockfile reconciled with `re2js` + `pyodide`). M1 blocked on a
post-fix rebase. Worktrees each have a git-excluded `START-HERE.md` scaffold.

| Stream | Status | Worktree / branch | Notes |
|---|---|---|---|
| A · M1 authoring | ⏳ **rebase needed** | `../trellis-m1` / `m1-authoring` | Complete & 76/76 green, but pinned to the pre-fix schema. **Re-engage the M1 session:** rebase on `main` (≥ `fec6b8f`, ElemSpec fix landed) + flip the 4 pinned tests (`compile`/`gates-run`/`cli`/`corpus.smoke`) from "exactly one gate-1 error" to full validity, then re-report for integration. |
| B · M2 engine | ✅ **integrated** @ `f5a1ad8` | merged to `main` | Gating diff (`var.assign` 0.59→locked, 0.60→available) + determinism proven; engine purity confirmed; 76 tests. |
| C · M3a sandbox | ✅ **integrated** @ `1c05031` · real-Pyodide verify **deferred** | merged to `main` | Host/watchdog/warm-pool proven vs a mock worker (23 tests). **Real Pyodide load, live `worker.terminate()`, line extraction, mem-cap, and `PYODIDE_VERSION` (0.27.2) CDN pin MUST be verified in a networked browser before M3a is verification-COMPLETE.** |

## 8. Reference index

- `TECHNICAL_DESIGN.md` — architecture source of truth.
- `docs/superpowers/specs/2026-06-08-trellis-m0-m5-implementation-design.md` — M0–M5 impl spec (read §1 realignment).
- `docs/superpowers/plans/2026-06-08-trellis-m0-schema-foundation.md` — executed M0 plan + amendments.
- `docs/design-notes/2026-06-08-astquery-grammar-gaps.md` — §6.3 gaps (now pinned in the design).
- `.claude/skills/authoring-trellis-content/` — the content authoring skill.
- `content/validate.py`, `content/verify/harness.py` — Python gate reference impls (port to TS; keep as differential oracle).
