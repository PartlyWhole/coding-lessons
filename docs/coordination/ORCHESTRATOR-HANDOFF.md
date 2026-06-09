# Trellis — Build Orchestrator Handoff

**Purpose:** onboard a fresh agent into the **build-orchestrator** role.
**As of:** `main` @ `8b114c0` (2026-06-09, evening — end of the escalations/design/deploy session).
Re-verify on arrival.
**Previous handoffs:** `archive/2026-06-09-ORCHESTRATOR-HANDOFF.md` (the verification/escalation
era — read for how today's state was reached) → `archive/2026-06-08-…` (the build era). This file
supersedes both.

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
4. Read: this file → `PARALLEL-STREAMS.md` (§7 board — you own it) →
   `CONTENT-ORCHESTRATOR-HANDOFF.md` (know your peer's charter) → design-notes as needed →
   `TECHNICAL_DESIGN.md` (do not re-litigate). Invoke `superpowers:using-superpowers`.

## 1. The operating loop (unchanged spine, new edges)
- Streams: one worktree + one branch + one git-excluded `START-HERE.md` each (§2 of the archived
  2026-06-09 handoff has the full pattern; `.git/info/exclude` already covers `START-HERE.md`).
  **NEW HARD RULE for START-HEREs:** sessions MUST run the repo gate in the FOREGROUND — three
  agent sessions today exited prematurely after backgrounding the ~6-min gate.
- Integration: the §4.1 runbook (archived handoff §4.1 — verbatim still correct): pre-flight
  scope/rebase checks → ff-only merge → frozen-lockfile proof → full gate on the merged result →
  reproduce the branch's DEFINING gate yourself (browser harnesses live in `verification/`;
  `npm ci` there once; scripts honor `TRELLIS_PORT`) → no-drift → record on the §7 board → PUSH
  (= deploy) → prune. Verify, don't trust — reproduce gates, read diffs line-by-line on
  contract/content-adjacent changes.
- Commit identity on `main`: `-c user.name='Trellis' -c user.email='noreply@anthropic.com'`.
- Escalate to the user, don't guess: product/curriculum/contract calls, anything outward-facing.

## 2. Work queue (nothing in flight at handoff)
1. **Content track ramp-up** — the content orchestrator's first branches will arrive for §4.1
   review (content edition). Expect new nodes/cells; the bar: validators + CLI lint (gates 1–9)
   + harness + 458 workspace tests stay green; bundle compiles; walkthrough unaffected.
2. **Polish queue** (small, design-adjacent): backtick rendering in feedback/hint bodies (needs a
   design ⚑ sign-off — could go back to the design session); hint-button-persists-after-syntax-
   error (frozen-behavior UX question for the user, eventually).
3. **Port gates 8/9 into `validate.py`** — yours (oracle seam), cheap, keeps Python coverage
   matched to the TS gates.
4. **§7 downstream chain:** **M6 telemetry** (seams ready: client EventBus emit sites + persist
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
- `PARALLEL-STREAMS.md` — rules + §7 board (you own it; streams report, never edit).
- `CONTENT-ORCHESTRATOR-HANDOFF.md` — the peer track's charter.
- `2026-06-09-REAL-PYODIDE-VERIFICATION-REPORT.md` — the verification evidence base.
- `docs/design/2026-06-09-design-handback.md` + `docs/design/greenhouse/` — design contract + system.
- `docs/design-notes/` — wallMs determinism; astquery grammar gaps (§5 = the timedOut saga).
- `docs/superpowers/plans/` — every stream's plan (incl. today's H/I′/J/K/L).
- `verification/` — browser harnesses (debt1/debt2/debt3/debt4/run-debt5/run-l-crash-repro) + evidence.
- Auto-memory (`~/.claude/projects/-Users-alan-Desktop-Trellis/memory/`) — index + status files
  (deployment.md has the Pages/CI facts).
