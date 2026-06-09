# Trellis — Build Orchestrator Handoff

**Purpose:** onboard a fresh agent into the **build-orchestrator** role.
**As of:** `main` @ `8b114c0` (2026-06-09, evening — end of the escalations/design/deploy session).
Re-verify on arrival.
**Previous handoffs — TWO, both in `docs/coordination/archive/`, both still load-bearing context
(this file supersedes them as "current state", not as history):**
1. `archive/2026-06-09-ORCHESTRATOR-HANDOFF.md` — the verification/escalation era. Uniquely holds:
   the full verification-merge review story (Debt-3 re-key scrutiny criteria), the original
   escalation triage, the M4 Escalation-A precedent ("hold-and-escalate, don't paper over" — the
   canonical refusal of a stream's "just adjust the fixture"), the M5-split parallelization lens
   (reuse when sequencing M6+), and the frozen-contract change protocol (§5: additive seams beat
   schema edits — demand that standard).
2. `archive/2026-06-08-ORCHESTRATOR-HANDOFF.md` — the build era. Uniquely holds: streams A–D
   history, the original environment constraints (offline-era workarounds you must NOT
   reintroduce, e.g. ambient shims), the §13.2 authoring-gates origin, the TypeBox/ElemSpec and
   dist-exports schema sagas, and the original gotcha derivations.
Read BOTH on arrival (skim is fine; know what's in them). The §1 runbook below is inlined from
the 2026-06-09 handoff so day-to-day operation never depends on an archive.

> You are the BUILD ORCHESTRATOR — not a stream, not a verifier, not the content author. You do
> NOT implement packages or author curriculum yourself — sessions do that in their own worktrees
> and report to you. You own: `main` (THE ONLY MERGER — see the two-orchestrator model below),
> the frozen contract (`@trellis/schema`), `docs/**` (except the content track's own docs),
> root config / CI, and integration review (§4.1). Root at `/Users/alan/Desktop/Trellis` on
> `main` (confirm `pwd` + `git branch --show-current` FIRST).

---

## State snapshot (2026-06-09 evening, `main` @ `8b114c0`)

### 🚀 THE PRODUCT IS LIVE: https://partlywhole.github.io/coding-lessons/
Public repo **`PartlyWhole/coding-lessons`** (created today; local repo now has `origin`).
**Every `main` push auto-deploys** via `.github/workflows/deploy-pages.yml` (corepack pnpm →
`pnpm -r build` → site = `packages/client/index.html` + `dist/app/**` → Pages). A CI workflow also
runs the full gate on every push. **Merging = publishing** — weigh that at every §4.1 step 5.
Pages works because of two frozen design facts: static-only M5 contract, and the watchdog uses
`worker.terminate()` (NO SharedArrayBuffer → no COOP/COEP headers, which Pages can't set).

### The slice: integrated, real-Pyodide-verified, hardened, designed. **458 tests.**
schema 37 · persist 19 · authoring 97 · engine 168 · sandbox 65 · client 72. All gates green
(typecheck/lint/test/build, native-ESM probes, `validate.py`, `harness.py`, authoring CLI lint).

**CI workflow fixed @ `83cc9ab` (2026-06-09 night, on-arrival finding):** the CI workflow had
NEVER passed — its root scripts routed through turbo, whose `^build` graph hard-fails on the
dev-only engine↔sandbox test-dependency cycle (present since M3b/M4; benign at runtime, probes
prove the production graph acyclic). Fix: CI now runs the validated `pnpm -r` gate, **build
first** (fresh checkouts need schema's `dist` types), rehearsed green in a fresh clone before
pushing. First-ever green CI run confirmed (3m38s). Follow-ups queued in §2.

Today's five streams, all integrated + worktrees pruned (full rows: `PARALLEL-STREAMS.md` §7):
- **H** — `evaluate` routes `!ran`/`timedOut` through `detect()` (watchdog kills + module-level
  errors now get misconception coaching); `canonicalDiagnosis` (determinism = byte-identical
  **modulo `signals.wallMs`** — decided + mechanically encoded; see
  `docs/design-notes/2026-06-09-wallms-determinism.md`).
- **I′** — real esbuild static host (zero `node:` specifiers, asserted at build), browser-safe
  `@trellis/sandbox` conditional exports, **the Greenhouse design integrated** (see Design state).
- **J** — sandbox hardening: js-FFI import-blocked from learner code (blocklist armed per run in
  RUN_HARNESS; honest scope: the adversarial boundary remains the worker); `memoryMb` enforced
  **preemptively** (worker-scope `WebAssembly.Memory.prototype.grow` guard) + recycle wire flag.
  Real-browser debt1 evidence 13/13.
- **K** — authoring gates **8-answerable** + **9-correct-miscon** (mirror `diagnose.ts` matching;
  mutation-tested with the historical corpus bugs as goldens). Gate 9 caught **4 more** real
  mis-tags on arrival → fixed (user-approved) @ `aacf0ce`; gate now strict, corpus clean.
- **L 🔥** — live-crash hotfix (user hit it on the deployed site): Submit re-enabled in FEEDBACK +
  unguarded dispatch → stepMachine threw in the React reducer. Fix: `claimTransition` ref-guard
  probing the engine's own machine at every user-triggerable dispatch site; IDB teardown race
  caught. The engine's fail-fast machine is CORRECT and stayed untouched.

### Design state
The **Greenhouse** design system is approved, shipped in the client, and published as the system
of record: `docs/design/greenhouse/` (tokens, component cards, 25-artboard mockups, UI kit) +
`docs/design/2026-06-09-design-handback.md` (the implementation contract; its ⚑ list is DONE).
The brief (`docs/design/2026-06-09-ui-design-brief.md`) §4 frozen semantics still bind all client
work. Attribution register: **misconception = warm amber, never error-red** — non-negotiable.
11 state screenshots: `verification/evidence/greenhouse-*.png` (+ `live-pages-boot.png`).

### ⚖️ THE TWO-ORCHESTRATOR MODEL (new — read carefully)
A peer **CONTENT ORCHESTRATOR** now owns the curriculum track: roadmap, authoring sessions
(via the `authoring-trellis-content` skill), and content quality. Its handoff:
`docs/coordination/CONTENT-ORCHESTRATOR-HANDOFF.md`. Division of authority:
- **You remain the ONLY merger to `main`.** The content orchestrator hands you finished branches
  (content-only diffs); you review via §4.1 (content edition: validators + authoring CLI lint +
  harness + affected package tests) and merge. Never both edit the same path concurrently.
- Content paths (`content/**`) move from "orchestrator-owned" to **content-track-owned**; you
  still apply *mechanical/emergency* content fixes when a build stream's gate demands it, but
  route curriculum decisions through the content orchestrator (who escalates taste/product calls
  to the user, same as you).
- `content/verify/harness.py` + `content/validate.py` sit on the SEAM: signature-grammar/oracle
  changes are YOURS (lockstep with engine semantics — gotcha #5); curriculum-content changes
  inside fixtures are the content track's. When in doubt, coordinate explicitly.
- The content orchestrator does NOT touch `packages/**`, `docs/coordination/PARALLEL-STREAMS.md`
  (yours), root config, or the deploy workflow.

## 0. First moves on arrival
1. `pwd` = `/Users/alan/Desktop/Trellis`; branch = `main`; `git worktree list` (expect main only,
   plus any content-track worktrees like `../trellis-content`); `git log --oneline -15` (state may
   have advanced); `git fetch && git status` (there is a REMOTE now — check you're not behind).
2. Reproduce the baseline: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"`,
   then `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build` — expect **458**.
   Probes: `node -e "import('./packages/<p>/dist/src/index.js')"` for schema/engine/sandbox/
   authoring/persist + `node packages/client/test/esm-probe.mjs`. Content:
   `python3 content/validate.py` + `python3 content/verify/harness.py` +
   `node packages/authoring/dist/src/cli.js lint content` (all PASS).
3. Check the live site is healthy (it deploys from `main`): assets 200 at
   `https://partlywhole.github.io/coding-lessons/` and `gh run list --repo
   PartlyWhole/coding-lessons --limit 3` green.
4. Read, in order: this file → `PARALLEL-STREAMS.md` (§7 board — you own it) →
   `CONTENT-ORCHESTRATOR-HANDOFF.md` (your peer's charter) → **both archived handoffs**
   (`archive/2026-06-09-…` then `archive/2026-06-08-…` — see the lineage note up top for what
   each uniquely holds) → design-notes as needed → `TECHNICAL_DESIGN.md` (do not re-litigate).
   Invoke `superpowers:using-superpowers`.

## 1. The operating loop (inlined — no archive needed for day-to-day operation)

### 1.1 The stream pattern (how to launch ANY working session, including small spawned tasks)
Every session gets: a worktree off current `main` (`git worktree add -b <branch> ../<dir> main`),
a **git-excluded `START-HERE.md`** inside it (`.git/info/exclude` already lists it; worktrees
share it) containing IN ORDER: rooting self-check FIRST (pwd + branch MUST match, else STOP —
the defense against a spawned session switching the main repo's branch under you, which has
actually happened), ownership paths (exact write set; everything else read-only → escalate),
defining gates (the green bar, with pasted-output requirement), guardrails (frozen schema, no
shared-doc edits, commit identity, rebase-before-report, do-not-merge), and escalation triggers.
Then a short launch prompt pointing at that file. **HARD RULE (cost three sessions today):
START-HEREs MUST mandate running the ~6-min repo gate in the FOREGROUND — backgrounded gates
make agent sessions exit prematurely; the working resume pattern is a continuation agent into
the same worktree with an explicit "no backgrounding; report before exit".**

### 1.2 The §4.1 integration runbook (the repeatable spine — validated on 13 merges to date)
Set `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"` first.
0. **Pre-flight — verify, don't trust.** Scope: `git diff --stat main...<branch>` = only the
   owned paths + plan doc + (if deps changed) `pnpm-lock.yaml`. Guarded paths clean:
   `git diff --name-only main...<branch> -- packages/schema content/ docs/coordination
   turbo.json .eslintrc.cjs pnpm-workspace.yaml` **empty** (exceptions: the branch's own plan
   under `docs/superpowers/plans/`; an orchestrator-sanctioned content/seam change is reviewed
   LINE-BY-LINE instead). Rebased: `git merge-base --is-ancestor main <branch>` — if not,
   rebase it yourself (disjoint paths rebase clean) or bounce it.
1. **Merge.** Confirm `git branch --show-current` = `main` FIRST ("already up to date" while
   HEAD moved = you're ON the branch). Then `git merge --ff-only <branch>`.
2. **Lockfile.** `pnpm install` then `pnpm install --frozen-lockfile` (consistency proof).
   Conflict → regenerate, NEVER hand-merge.
3. **Full gate on the merged result.** `pnpm -r typecheck && lint && test && build` + native-ESM
   probes (5× `dist` import + client `esm-probe.mjs`) + `python3 content/validate.py` +
   `python3 content/verify/harness.py` + `node packages/authoring/dist/src/cli.js lint content`
   + **reproduce the branch's DEFINING gate yourself** (browser harnesses in `verification/`;
   `npm ci` there once; scripts honor `TRELLIS_PORT`). Paste real output — no success claims
   without it.
4. **No-drift.** `git diff <pre-merge-sha>..HEAD -- packages/schema` empty (plus any path the
   branch shouldn't touch).
5. **Record + publish.** Update the §7 board (+ this file's snapshot if material); commit as
   `-c user.name='Trellis' -c user.email='noreply@anthropic.com'`; **`git push` = DEPLOY** —
   only push on green.
6. **Prune** the branch/worktree; unblock downstream.

**Hold-and-escalate, don't paper over:** a cross-implementation differential disagreement
(TS/Pyodide vs `harness.py`) is a spec ambiguity — pin it, don't merge around it. Precedent:
the held M4 re-key (archived 2026-06-09 handoff, "Decisions" section).

### 1.3 Standing rules
- Escalate to the user, don't guess: product/curriculum/contract calls, anything outward-facing.
- The frozen contract changes ONCE on `main` (test-first), then everything rebases; additive
  seams beat schema edits (M3b/M4/M5 + all five of today's streams shipped with ZERO schema changes).

## 2. Work queue (nothing in flight at handoff)
1. **Content track: FULL CURRICULUM REBUILD in flight** (user-redirected, 2026-06-09 night;
   see `CONTENT-ROADMAP.md` + `INTER-ORCHESTRATOR-PROTOCOL.md` §6). Kid-focused, capstone =
   building a 2D pygame game. **No handover branches imminent** — process/philosophy being
   user-validated first; the live corpus stays in-tree and gate-covered meanwhile. Two
   capability requests queued (protocol §6): rich-media `watch` steps (await specs; design ⚑ +
   likely additive schema/client seam) and M6.5 pygame timing (capstone dependency — M6 vs
   M6.5 ordering becomes a user call once the rebuild roadmap lands). The §4.1 content-edition
   bar is unchanged when branches do arrive.
2. **Polish queue** (small, design-adjacent): backtick rendering in feedback/hint bodies (needs a
   design ⚑ sign-off — could go back to the design session); hint-button-persists-after-syntax-
   error (frozen-behavior UX question for the user, eventually).
3. **Port gates 8/9 into `validate.py`** — yours (oracle seam), cheap, keeps Python coverage
   matched to the TS gates.
4. **Break the engine↔sandbox test-dep cycle properly** — move the 3 cross-package test files
   (`engine/test/m4-concat-e2e.test.ts`, `sandbox/test/differential.test.ts`,
   `sandbox/test/acceptance.test.ts`) into an integration-test package depending on both;
   restores turbo's task graph (root `pnpm typecheck/lint/test/build` scripts work again).
   Small, parallel-safe, low priority.
5. **Bump CI actions off Node 20 runtime** — GitHub forces Node 24 from 2026-06-16 (annotation
   on every run); non-breaking, but bump `actions/*`+`pnpm/action-setup` majors when convenient.
6. **§7 downstream chain:** **M6 telemetry** (seams ready: client EventBus emit sites + persist
   `behavioral_event`/`appendEvents`; a Recorder subscriber attaches with zero emit-site changes;
   define the ownership seam before launching parallel to anything client-side) → **M6.5 pygame**
   (wheel smoke proven in debt1; `runtime?:"pygame"` + `lockedRegions` seams preserved) →
   **M7 hardening** (service-worker/offline + a11y audit; the design kept the a11y baseline).

## 3. Hard-won gotchas (additions to the archived list — read BOTH)
1. **Foreground the gate in agent sessions** (see §1). Resume pattern that works: re-dispatch a
   continuation agent into the same worktree with explicit "no backgrounding; report before exit".
2. **Merging = publishing.** The site deploys from `main` on push. Hold pushes until the merged
   gate is green; consider what a half-landed feature looks like publicly.
3. **Ports:** parallel browser-harness sessions collide on 8765 — `verification/` scripts accept
   `TRELLIS_PORT`; assign per-stream ports in START-HEREs.
4. `verification/` is a standalone npm dir (its own package-lock; `npm ci` inside it; OUTSIDE the
   pnpm workspace). It holds the reusable Playwright harnesses + all evidence JSON/PNGs.
5. The four historical content mis-tag bugs (and 3 unanswerable predicts) are now PERMANENT
   golden fixtures in authoring gates 8/9 — if a gate fires on new content, it's almost certainly
   a real bug; bounce it to the content track, don't relax the gate.
6. Archived-handoff gotchas all still apply: corepack PATH, lockfile regenerate-never-hand-merge,
   harness.py silently ignores unknown AstQuery keys (lockstep updates!), ESM-cycle probes,
   engine purity ESLint, gitignored `bundle.json`, mutation-test new gates, branch-switch defense.

## 4. Reference index
- `archive/2026-06-09-ORCHESTRATOR-HANDOFF.md` — **previous handoff #1** (verification/escalation
  era: review precedents, escalation history, contract-change protocol, M5-split lens).
- `archive/2026-06-08-ORCHESTRATOR-HANDOFF.md` — **previous handoff #2** (build era: streams A–D,
  original constraints, schema sagas, gotcha origins).
- `PARALLEL-STREAMS.md` — rules + §7 board (you own it; streams report, never edit).
- `CONTENT-ORCHESTRATOR-HANDOFF.md` — the peer track's charter.
- `2026-06-09-REAL-PYODIDE-VERIFICATION-REPORT.md` — the verification evidence base.
- `docs/design/2026-06-09-design-handback.md` + `docs/design/greenhouse/` — design contract + system.
- `docs/design-notes/` — wallMs determinism; astquery grammar gaps (§5 = the timedOut saga).
- `docs/superpowers/plans/` — every stream's plan (incl. today's H/I′/J/K/L).
- `verification/` — browser harnesses (debt1/debt2/debt3/debt4/run-debt5/run-l-crash-repro) + evidence.
- Auto-memory (`~/.claude/projects/-Users-alan-Desktop-Trellis/memory/`) — index + status files
  (deployment.md has the Pages/CI facts).
