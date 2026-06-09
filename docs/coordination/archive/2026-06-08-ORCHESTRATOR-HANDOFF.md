# Trellis — Orchestrator Handoff

**Purpose:** onboard a fresh agent into the **orchestrator** role for Trellis's parallel build.
**As of:** `main` @ `6787dff` (2026-06-08, late session). Re-verify on arrival (state may have advanced).
**Read the "State snapshot" section immediately below first — it is the live picture; the rest of this
doc is the durable role manual.**

> You are the ORCHESTRATOR, not a stream. You do NOT implement milestones — the stream sessions do
> that in their own worktrees. You own `main`, the frozen contract, the coordination docs, integration
> review, and the downstream chain. Root your session at the MAIN repo: `/Users/alan/Desktop/Trellis`
> on branch `main` (confirm with `pwd` + `git branch --show-current`).

---

## State snapshot — read this first (2026-06-08, `main` @ `ee79120`)

This is the live picture as of the handoff. Everything below it (§0–§9) is the durable role manual;
this section is the "you are here." Re-verify with `git log --oneline -15` + the §0 baseline on arrival.

### Where the build stands
**🎉 THE FULL M0–M5 DETERMINISTIC SLICE IS INTEGRATED on `main`** — 6 packages, **392 tests green**
(typecheck/lint/build clean; native-ESM imports of every `dist` clean; content oracle PASS). **No build
streams remain.** The only work before the slice is *fully verified* is the networked-browser real-Pyodide
pass (5 debts; see `REAL-PYODIDE-VERIFICATION.md`).

| Milestone | Package | Integration SHA | Tests | Notes |
|---|---|---|---|---|
| M0 | `@trellis/schema` | (base) | 37 | frozen contract + two session fixes (below) |
| M1 | `@trellis/authoring` | `a04c082` | 76→**80** | compiler + 7 §13.2 gates — **all 1–7 live** (M4 turned on 5–7) + CLI |
| M2 | `@trellis/engine` | `f5a1ad8` | 76→**159** | pure core + **M3b `evaluate` ladder** + **M4 §9 hint ladder + §7 match-aware precedence** |
| M3a | `@trellis/sandbox` | `1c05031` | 23→**55** | Pyodide worker host + **M3b `parseAndMatch` + local-CPython twin**; **real-Pyodide verify DEFERRED** |
| M3b | (extends engine+sandbox) | `ee79120` | (above) | build ladder; **NO contract change** — additive `BuildSandbox = Sandbox & { parseAndMatch }` |
| M4 | (extends engine+authoring) | `406b069` (+`cf7daa7`) | (above) | concat misconception→feedback→hint ladder; gates 5–7 + golden; **NO schema change**; ⚠️ `timedOut` re-key HELD → real-Pyodide session |
| M5-persist | `@trellis/persist` | `4e8eca5` | **19** | IndexedDB (atomic `commitSubmission`, reload survival, content cache); zero-new-dep (memory+native drivers); `nativeDriver` real-browser verify DEFERRED |
| M5-client | `@trellis/client` | `19d8eea` | **42** | React 19 + CodeMirror 6 presentation slice; `CellRunner`/step views/hints/peek-back/`EventBus` stub; marquee offline walkthrough green; in-browser real-Pyodide + real-IDB verify DEFERRED |

**M3b (Stream D) integrated `ee79120`** via the §4.1 runbook (Phase 0 pre-flight: scope = engine+sandbox
+ plan doc + 1-line lockfile delta only; schema/content/coordination-docs byte-clean; FF-merge). Both
defining gates green & proven non-vacuous: the **21-fixture differential** (engine `evaluate` +
`parseAndMatch` over the local-CPython twin agrees with `harness.py` on all 15 build-bearing
misconceptions; oracle exits 0) and **§4 acceptance** (f-string + `str()` both pass; `str+number`→
`mis.concat.str_num`; byte-identical `Diagnosis` under fixed seed). The new sandbox→engine dependency is
a **test-only devDep** (engine never imports sandbox → runtime graph stays acyclic; native-ESM import
confirms no deadlock). ⚠️ Still deferred (same as M3a): real-Pyodide-in-WASM verification of
`parseAndMatch` + the live ladder — needs a networked browser.

**Not started:** M4 (misconceptions + hints end-to-end; turn on gates 5–7) → M5 (presentation slice).
**Critical path is single-threaded:** `M3b → M4 → M5`. M4 needs M3b's detector; M5 needs M4. No second
build stream can run in parallel right now. Deferred entirely: M6 (telemetry), M6.5 (pygame), M7 (hardening).

### Contract & content changes made THIS session (a consumer must know these)
- **Schema `ElemSpec` split** (`fec6b8f`, test-first): `GenSpec.elem` no longer inherits a required `param`
  — a paramless recursive `ElemSpec` for list elements; top-level `GenSpec.param` stays required. Fixed the
  blocker M1 escalated (the `loops` list-element generator was rejected). §6.4: `param` = entrypoint arg,
  meaningless for elements.
- **Schema `exports`→`dist`** (`f9bcef6`): `@trellis/schema` `main`/`exports` point at built `dist` with a
  `development`→`src` condition ordered before `import`. Plain `node` resolves the bare specifier to `dist`
  (so built consumers that *value*-import schema run under node); Vite/vitest inject `development` → live
  `src`. Both schema changes are manifest/type-compatible — M2/M3a unaffected.
- **`conditionals` re-themed Magic-8-Ball → grade classifier** (`303834e`): dropped the
  `conditionals → random.randint` `requires` edge so the spine never depends on the `random` *extension*
  (the adopted invariant). `random` is now genuinely optional. Bonus: removed a CPython-version-fragile
  `random.seed` trace + an unrequired `input()`.
- **AST queries migrated to the §6.3 `field` selector** (`3a8bf73`): `has_elif` and `infinite_true_no_break`
  use exact field-scoped forms; `content/verify/harness.py` was taught `field` (rule 1) in lockstep — **it
  silently ignored unknown query keys (the §6.3 true-by-default trap), so migrating content REQUIRED updating
  the harness.** M1's TS matcher ↔ harness differential confirmed identical on all 21 fixtures incl. field forms.

### Decisions resolved this session (durably recorded; pointers below)
- Conditionals invariant → re-theme; gating-diff pair = `var.assign`@0.6 + `print_literal`@0.5 — `PARALLEL-STREAMS.md` §6.
- GenSpec fix shape = decision A (ElemSpec split); schema packaging = Option 1 (exports→dist) — §6 + design-note.
- **`mis.loop.infinite_true` `{timedOut:true}` re-key = DEFERRED to M4** (timedOut is ambiguous across
  infinite-loop misconceptions; the offline isolated-signature harness can't model §7 precedence; zero
  detection change on the current corpus). It's an explicit **M4 action item** — design-note §5 + §7 below.

### Open debts & immediate next actions
1. ~~**Await M3b's green report, then integrate via the §4.1 runbook.**~~ **DONE** — M3b integrated `ee79120`
   (288 tests; both defining gates green; no contract change). The build core M0–M3b is complete.
2. ~~**M4 → M5-persist → M5-client.**~~ **ALL DONE** — M4 `406b069`+`cf7daa7`, M5-persist `4e8eca5`,
   M5-client `19d8eea`. **The full M0–M5 slice is integrated; no build streams remain.** A spawned
   follow-up tracks a latent `@trellis/sandbox/src/local-cpython.ts` `isTimeout` type fragility + the
   per-package `shims.d.ts` cleanup now that network is available (non-blocking tech debt).
3. **Networked-browser real-Pyodide session (clears M3a + M3b + M5 + the M4 `timedOut` re-key together).**
   All deferred on the same blocker — a *networked browser* (real Pyodide load): M3a (`worker.terminate()`,
   line extraction, mem-cap, `PYODIDE_VERSION` 0.27.2 CDN pin, pygame-ce), M3b (`parseAndMatch` + live
   `evaluate` ladder under real Pyodide; 21-fixture differential with real-Pyodide executor), M5 (whole-slice
   in-browser walkthrough + real IndexedDB reload), and now **M4's `timedOut` re-key** (apply `{timedOut:true}`
   to `loops.taxonomy.yaml` + decide harness-precedence vs. carve-out + verify end-to-end vs. the watchdog —
   the engine `matchedSpecificity` precedence is already on `main`). **Full launch prompt + debt ledger:
   `docs/coordination/REAL-PYODIDE-VERIFICATION.md`** (now 5 debts incl. M5-persist's `nativeDriver`).
   **✅ NOW FULLY UNBLOCKED** — Stream G integrated `19d8eea`, so all 5 debts (incl. Debt 5, the whole-slice)
   are on `main`. This is THE remaining action to call the M0–M5 slice fully verified. Run it in a networked
   browser, rooted at `main` @ `19d8eea`+.
4. ~~**Optional tidy:** `packages/authoring/ORCHESTRATOR-REPORT.md` rode onto `main` via the M1 merge.~~
   **DONE** — removed (it was fully superseded by the §7 board + this handoff's integration record).

### Hard-won gotchas surfaced this session (save yourself the rediscovery)
- The differential oracle `harness.py` **silently ignores unknown AstQuery keys** — keep it in lockstep with
  any content query-form change, or it over-matches without failing. The §4.1 hold-and-escalate rule exists
  for exactly this kind of cross-implementation drift.
- **Lockfile churn on merges:** never hand-resolve a `pnpm-lock.yaml` conflict — regenerate with `pnpm install`
  (works offline from the store). Codified in §4.1.
- The **§4.1 integration runbook** (validated on M2/M3a/M1) is the repeatable spine — follow it every merge.

---

## 0. First moves on arrival
1. Confirm rooting: `pwd` = `/Users/alan/Desktop/Trellis`, `git branch --show-current` = `main`.
2. `git worktree list` and `git log --oneline -12` — see what's merged and which streams exist.
3. Reproduce the baseline: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"` then
   `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build` (expect **212 tests** green across
   schema/engine/sandbox/authoring) + a native-ESM import check of each `dist/src/index.js`. Also confirm the
   content references: `python3 content/validate.py` and `python3 content/verify/harness.py` (both PASS).
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
  (`Bundle`/`Graph`/`RunResult`/`Sandbox`) as TypeBox. 37 tests. Two integration-era fixes: the
  paramless `ElemSpec` split (§6.4) and `exports`→`dist` (node-runnable consumers).
- **M1 — `@trellis/authoring`** ✅ (`a04c082`): YAML→Bundle compiler + the seven §13.2 gates (1–6 live,
  cross-checked against `harness.py` on all 21 fixtures; 7 = M4 stub) + the §6.3/spine/RE2 lints +
  `trellis lint|build|grade` CLI. 76 tests.
- **M2 — `@trellis/engine`** ✅ (`f5a1ad8`): pure core — resolver/navigation/stepMachine/`detect`/
  non-build `diagnose`/`applyDiagnosis`/targeting. Purity ESLint-enforced. 76 tests.
- **M3a — `@trellis/sandbox`** ✅ (`1c05031`): Pyodide worker host — watchdog `terminate()` kill switch +
  warm pool, mock-verified. **Real-Pyodide verification deferred (no network).** 23 tests.
- **Frozen contract**: the integration seam. Treat as immutable; a change lands HERE on `main` first,
  then streams rebase. (See §5.)
- **Content workstream** (authored by a parallel session, committer "PartlyWhole", now idle): the
  `authoring-trellis-content` skill (`.claude/skills/`) + a 7-node beginner-Python corpus
  (`content/`) + Python reference validators (`content/validate.py`, `content/verify/harness.py`).
- **Design hardening**: §6.3/§7 grammar gaps pinned; proving-slice realigned (string_concat = spine,
  `random` = the extension). See the spec's §1 note and `docs/design-notes/2026-06-08-astquery-grammar-gaps.md`.

## 3. The parallel streams you coordinate
Each stream is a SEPARATE Claude Desktop session whose workspace folder is its worktree (so cwd/git/pnpm
are correctly scoped — a session rooted in the main repo is the failure mode that bit M1 once; the
git-excluded `START-HERE.md` self-check in each worktree guards against it). Streams report status to you;
they never edit `docs/coordination/**`. You merge to `main`.

| Stream | Milestone | Status | Worktree / branch | Owns (writes) |
|---|---|---|---|---|
| A | M1 `@trellis/authoring` compiler | ✅ integrated `a04c082` (worktree removed) | — | `packages/authoring/**` |
| B | M2 `@trellis/engine` pure core | ✅ integrated `f5a1ad8` (worktree removed) | — | `packages/engine/**` |
| C | M3a `@trellis/sandbox` host | ✅ integrated `1c05031` · **Pyodide verify deferred** (worktree removed) | — | `packages/sandbox/**` |
| D | M3b build ladder | ✅ integrated `ee79120` (worktree removable) | `../trellis-m3b` / `m3b-build-ladder` | `packages/engine/**` (`evaluate`) + `packages/sandbox/**` (`parseAndMatch`) |
| E | M4 misconceptions + hints | ✅ integrated `406b069` (+ Escalation B `cf7daa7`; worktree removable) | `../trellis-m4` / `m4-misconceptions-hints` | `packages/engine/**` (§9 ladder) + `packages/authoring/**` (gates 5–7) |
| F | M5-persist `@trellis/persist` | ✅ integrated `4e8eca5` (worktree removable; `nativeDriver` real-browser verify deferred) | `../trellis-m5-persist` / `m5-persist` | `packages/persist/**` (new) |
| G | M5-client `@trellis/client` | ✅ integrated `19d8eea` (worktree removable; in-browser verify deferred) | `../trellis-m5-client` / `m5-client` | `packages/client/**` (new) |

A/B/C/D were independent/sequential and are all in `main` (A/B/C worktrees cleaned; D's removable). **The
live front is now E ∥ F** — two NEW concurrent streams off `main` @ `a056037`, set up this session with
worktrees + git-excluded `START-HERE.md` briefs. They have **disjoint write paths** (E = engine+authoring,
F = a new `packages/persist/**`), so they integrate independently; only `pnpm-lock.yaml` is shared. **Key
parallelization insight:** M5 splits into `@trellis/persist` (schema-only dep → parallel with M4 NOW) and
`@trellis/client` (needs engine+M4+persist → Stream G, after E+F). The spec's `M4 → M5` arrow understated
this. **Intra-stream parallelism:** each stream EXECUTES via `subagent-driven-development` (fan out over
disjoint files; serialize the `index.ts` barrel) — briefed in each `START-HERE.md`.

**✅ M4 integrated `406b069`; ⚠️ the `timedOut` re-key is now a real-Pyodide-session task (NOT done).**
Stream E delivered the engine §7 `matchedSpecificity` precedence (the prerequisite — `detect-precedence.test.ts`,
on `main`, 21-fixture differential unchanged) and turned on gates 5–7 (Escalation B golden landed `cf7daa7`,
non-vacuous). **Escalation A — the content re-key of `mis.loop.infinite_true` onto `{timedOut:true}` — was
HELD, not applied.** Per design-note §5 (its own pinned requirement) the re-key must be verified end-to-end
against the **real Pyodide watchdog**; M4 only had the local-CPython twin (no network), and applying it
offline would force papering-over the harness (it over-matches the `no_update`-shaped notTrigger, which also
times out). **The re-key is reassigned to the networked-browser verification session** — fold it into that
session's scope alongside the M3a/M3b/M5 Pyodide debts. The engine side is ready and waiting; zero
corpus-detection change in the interim.

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

### 4.1 Integration runbook (the repeatable spine — validated on M2/M3a/M1)

Run this for every stream merge. It's generic; the per-stream milestone gate slots into step 3.
Set `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"` first.

0. **Pre-flight — verify, don't trust the report.**
   - Scope: `git diff --stat main...<branch>` = only the stream's `packages/<pkg>/**` + its plan doc + `pnpm-lock.yaml`.
   - Contract/content/shared-docs clean: `git diff --name-only main...<branch> -- packages/schema content/ docs/ turbo.json .eslintrc.cjs pnpm-workspace.yaml` is **empty**.
   - Rebased onto current `main`: `git merge-base --is-ancestor main <branch>` → yes. **If not, bounce it back** — never merge a stale base (it re-introduces pre-fix contract/content).
1. **Merge.** FF if rebased: `git merge --ff-only <branch>`. Else `git merge --no-ff <branch> -m "Integrate Stream X — <pkg>"`.
2. **Lockfile.** `pnpm install --prefer-offline` then `pnpm install --frozen-lockfile` (proves consistency with all manifests). **On a `pnpm-lock.yaml` merge conflict, do NOT hand-merge** — regenerate: `pnpm install` → `git add pnpm-lock.yaml` → finish the commit. (This is the only expected conflict given disjoint packages.)
3. **Full gate on the merged result.** `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build`; then a native-ESM import of the new package's `dist/src/index.js` (cycle/deadlock check); then the **stream's milestone gate** (its plan's acceptance criterion). Paste real output — no success claim without it.
4. **No-drift check.** `git diff <pre-merge-main-sha>..HEAD -- packages/schema` is empty (the rebase didn't sneak a contract edit in).
5. **Record.** `PARALLEL-STREAMS.md` §7 board → ✅ integrated @ `<sha>`; add the package to §2 ("what's DONE on main"). Commit the board update.
6. **Unblock downstream** (§7) once the milestone's dependents have their inputs.

**Hold-and-escalate, don't paper over:** if a stream's cross-implementation differential (e.g. a TS matcher vs the Python `harness.py` on the §6.3 fixtures) disagrees, that's a spec/contract ambiguity — pause integration and pin it (§5), don't merge around it.

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
(turn on §13.2 gates 5–7; **also re-key `mis.loop.infinite_true` onto `{ timedOut: true }`** against the
real sandbox + live `detect()` precedence — deferred from the AST-query hardening, see
`docs/design-notes/2026-06-08-astquery-grammar-gaps.md` §5 "M4 ACTION ITEM") → `M5` presentation slice
(React `CellRunner` + IndexedDB persist + static fetch). Each gets its own plan (`writing-plans`) on its
own branch/worktree. M6 (telemetry), M6.5
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
