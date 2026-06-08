# Trellis — Orchestrator Handoff

**Purpose:** onboard a fresh agent into the **orchestrator** role for Trellis's parallel build.
**As of:** `main` @ `ab67dd4`. Re-verify on arrival (state may have advanced).

> You are the ORCHESTRATOR, not a stream. You do NOT implement milestones — the stream sessions do
> that in their own worktrees. You own `main`, the frozen contract, the coordination docs, integration
> review, and the downstream chain. Root your session at the MAIN repo: `/Users/alan/Desktop/Trellis`
> on branch `main` (confirm with `pwd` + `git branch --show-current`).

## 0. First moves on arrival
1. Confirm rooting: `pwd` = `/Users/alan/Desktop/Trellis`, `git branch --show-current` = `main`.
2. `git worktree list` and `git log --oneline -12` — see what's merged and which streams exist.
3. Reproduce the baseline: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"` then
   `pnpm test` (expect `@trellis/schema` green) and `pnpm build` + a native-ESM import check.
4. Read, in order: this file → `docs/coordination/PARALLEL-STREAMS.md` (the sync doc you OWN) →
   `docs/superpowers/specs/2026-06-08-trellis-m0-m5-implementation-design.md` (the M0–M5 spec) →
   `TECHNICAL_DESIGN.md` (architecture source of truth). Invoke `superpowers:using-superpowers`.

## 1. The project in one paragraph
Trellis is a deterministic, fully-static (no-backend) CS teaching platform graded in-browser by
Pyodide. The design is settled in `TECHNICAL_DESIGN.md`; we turn it into milestone plans and execute
them test-first. We do NOT re-litigate the design. Methodology = the **superpowers** skills:
`writing-plans` to author a plan, `subagent-driven-development` to execute (fresh implementer per task
+ two-stage review: spec-compliance then code-quality), `finishing-a-development-branch` to wrap up.

## 2. What's DONE and on `main`
- **M0 — `@trellis/schema`**: all `TECHNICAL_DESIGN` §3 types + the frozen cross-stream contract
  (`Bundle`/`Graph`/`RunResult`/`Sandbox` in `src/bundle.ts`) as TypeBox. 34 tests, CI green.
- **Frozen contract**: the integration seam. Treat as immutable; a change lands HERE on `main` first,
  then streams rebase. (See §5.)
- **Content workstream** (authored by a parallel session, committer "PartlyWhole", now idle): the
  `authoring-trellis-content` skill (`.claude/skills/`) + a 7-node beginner-Python corpus
  (`content/`) + Python reference validators (`content/validate.py`, `content/verify/harness.py`).
- **Design hardening**: §6.3/§7 grammar gaps pinned; proving-slice realigned (string_concat = spine,
  `random` = the extension). See the spec's §1 note and `docs/design-notes/2026-06-08-astquery-grammar-gaps.md`.

## 3. The parallel streams you coordinate
Three worktrees off `main`, each its own branch + `START-HERE.md` (git-excluded). Streams are
launched as SEPARATE Claude Desktop sessions whose workspace folder is the worktree itself (so cwd/
git/pnpm are correctly scoped — a session rooted in the main repo is the failure mode that already
bit M1 once; the `START-HERE.md` self-check guards against it).

| Stream | Milestone | Worktree / branch | Owns | Notes |
|---|---|---|---|---|
| A | M1 `@trellis/authoring` compiler | `../trellis-m1` / `m1-authoring` | `packages/authoring/**` | reads schema + `content/` |
| B | M2 `@trellis/engine` pure core | `../trellis-m2` / `m2-engine` | `packages/engine/**` | builds on hand-authored `Bundle` fixtures (no dep on M1) |
| C | M3a `@trellis/sandbox` host | `../trellis-m3a` / `m3a-sandbox` | `packages/sandbox/**` | **no network here → real-Pyodide verify deferred** |

A, B, C are independent (disjoint packages) and merge to `main` in any order.

## 4. Your job (the orchestrator loop)
- **Keep the sync doc current.** `docs/coordination/PARALLEL-STREAMS.md` §7 status board is yours to
  update; streams report, they don't edit it.
- **Review integrations.** When a stream finishes (`finishing-a-development-branch` → merge to `main`),
  verify its milestone gate, run `pnpm typecheck && lint && test && build` on the merged result, and
  confirm it didn't touch the frozen contract or other packages. Use `requesting-code-review` /
  dispatch a review subagent if you want a second pass.
- **Handle rebase/lockfile churn.** After a stream merges, the others rebase on `main`; disjoint paths
  mean conflicts should be nil except possibly `pnpm-lock.yaml` — you resolve that. Do NOT edit a
  stream's package yourself.
- **Own cross-stream decisions** (surface to the user; don't guess) — see §6.
- **Resume the downstream chain** once inputs land (see §7).

## 5. The frozen contract — change protocol
If a stream escalates that the seam (`@trellis/schema`) must change: decide it with the user if it's
a design choice, make the change ONCE on `main` (test-first, keep the module graph acyclic — see §8),
then have every stream rebase. Never let a stream fork a divergent copy of a shared type.

## 6. Cross-stream decisions — both RESOLVED (2026-06-08)
- **`conditionals → random.randint`**: **RESOLVED — re-themed.** `node.conditionals` no longer requires
  `skill.random.randint`; its capstone is now a deterministic **grade classifier** (not a Magic-8 Ball),
  so `random` is a genuinely optional extension and the spine-never-requires-an-extension invariant holds
  corpus-wide. Files touched: `content/nodes/conditionals.yaml`, `content/skills/conditionals.taxonomy.yaml`
  (`mis.elif.assign_in_elif` + `mis.elif.order_overlap` re-authored), `content/AUTHORING_BRIEF.md`.
  Green: `validate.py` + `verify/harness.py` (gates 1–6). See `PARALLEL-STREAMS.md` §6.
- **Proving-slice gating pair**: **RESOLVED — determined by content.** M2 gating-diff test pair =
  `skill.var.assign` @ 0.6 (track) + `skill.output.print_literal` @ 0.5 (utility); toggle `var.assign`
  across 0.6 to flip `random` locked↔available. Single producers each; unambiguous.

## 7. Downstream chain (you write + run these after M1/M2/(M3a) integrate)
`M3b` build ladder (`evaluate`: Run→Test→AST→Property; the REAL TS detector — **differential-test it
against `content/verify/harness.py` on all 21 fixtures**) → `M4` misconceptions + hints end-to-end
(turn on §13.2 gates 5–7) → `M5` presentation slice (React `CellRunner` + IndexedDB persist + static
fetch). Each gets its own plan (`writing-plans`) on its own branch/worktree. M6 (telemetry), M6.5
(pygame), M7 (offline/a11y) are deferred.

## 8. Environment gotchas (will waste your time if missed)
- pnpm only via corepack: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"`.
- No network here: Pyodide/pygame wheels can't be fetched (blocks M3a *verification*). CPython3 is available.
- `@sinclair/typebox@^0.34` (NOT `typebox` 1.0). Recursive TypeBox schemas: never annotate `: TSchema`
  (collapses `Static` to `unknown`).
- **ESM build-cycle trap**: a module import cycle passes under Vitest but DEADLOCKS native-ESM imports
  of the built output. Keep graphs acyclic; the check is `pnpm build` + `node -e import(dist/...)`. CI
  runs `pnpm build`. (This is why `SkillDelta` lives in `ids.ts`.)
- `@trellis/engine` must stay pure (no react/idb/pyodide/fetch) — ESLint enforces; rule also covers
  `react/*`/`react-dom/*` subpaths.
- Commit on `main` as `-c user.name='Trellis' -c user.email='noreply@anthropic.com'`. The content
  session commits as "PartlyWhole"; interleaved committers are expected and fine (disjoint paths).

## 9. Reference index
- `TECHNICAL_DESIGN.md` — architecture source of truth.
- `docs/coordination/PARALLEL-STREAMS.md` — the sync doc (you own the status board).
- `docs/superpowers/specs/2026-06-08-trellis-m0-m5-implementation-design.md` — M0–M5 spec (read §1 realignment).
- `docs/superpowers/plans/2026-06-08-trellis-m0-schema-foundation.md` — executed M0 plan + "Execution amendments".
- `docs/design-notes/2026-06-08-astquery-grammar-gaps.md` — the six §6.3 gaps (now pinned in the design).
- `.claude/skills/authoring-trellis-content/` — content authoring skill; `content/verify/harness.py` — the differential oracle.
