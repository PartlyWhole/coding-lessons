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

## 6. Open cross-stream decisions (user's call — do not resolve unilaterally)

- **`conditionals → random.randint`** (spine→extension) violates the "spine never requires an extension"
  invariant (see the spec's §1 realignment note). Resolution (drop the edge vs promote `random` to spine)
  is a curriculum-intent call. M1 *flags* it via lint; it is not silently rewritten.
- **Proving-slice gating specifics** (which `random` prerequisite pair the M2 gating-diff test uses) are
  finalized against the content's actual `minMastery` values during M1/M2 — inspect, don't guess.

## 7. Status board (orchestrator updates this — streams report, don't edit)

Worktrees created off `main` (each has a `START-HERE.md` onboarding scaffold, git-excluded):

| Stream | Status | Worktree / branch | Notes |
|---|---|---|---|
| A · M1 authoring | ready to start | `../trellis-m1` / `m1-authoring` | write plan first (writing-plans) |
| B · M2 engine | ready to start | `../trellis-m2` / `m2-engine` | write plan first; builds on hand-authored Bundle fixtures (no dep on M1) |
| C · M3a sandbox | ready to start (verify deferred) | `../trellis-m3a` / `m3a-sandbox` | **no network here → real-Pyodide verification deferred**; build host + mock-worker tests now |

## 8. Reference index

- `TECHNICAL_DESIGN.md` — architecture source of truth.
- `docs/superpowers/specs/2026-06-08-trellis-m0-m5-implementation-design.md` — M0–M5 impl spec (read §1 realignment).
- `docs/superpowers/plans/2026-06-08-trellis-m0-schema-foundation.md` — executed M0 plan + amendments.
- `docs/design-notes/2026-06-08-astquery-grammar-gaps.md` — §6.3 gaps (now pinned in the design).
- `.claude/skills/authoring-trellis-content/` — the content authoring skill.
- `content/validate.py`, `content/verify/harness.py` — Python gate reference impls (port to TS; keep as differential oracle).
