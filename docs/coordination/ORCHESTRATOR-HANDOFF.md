# Trellis — Build Orchestrator Handoff

**Purpose:** onboard a fresh agent into the **build-orchestrator** role.
**As of:** `main` @ `7d55813`+ (2026-06-10, after the M6-telemetry integration). Re-verify on arrival.

**Previous handoffs — THREE, all in `docs/coordination/archive/`, all still load-bearing
context (this file supersedes them as "current state", not as history):**
1. `archive/2026-06-08-ORCHESTRATOR-HANDOFF.md` — **the build era.** Uniquely holds: streams
   A–D history, the original environment constraints (offline-era workarounds you must NOT
   reintroduce, e.g. ambient shims), the §13.2 authoring-gates origin, the TypeBox/ElemSpec
   and dist-exports schema sagas, the original gotcha derivations.
2. `archive/2026-06-09-ORCHESTRATOR-HANDOFF.md` — **the verification/escalation era.**
   Uniquely holds: the verification-merge review story (Debt-3 re-key scrutiny criteria), the
   original escalation triage, the M4 Escalation-A precedent ("hold-and-escalate, don't paper
   over" — the canonical refusal of a stream's "just adjust the fixture"), the M5-split
   parallelization lens, the frozen-contract change protocol (§5: additive seams beat schema
   edits — demand that standard).
3. `archive/2026-06-09-evening-ORCHESTRATOR-HANDOFF.md` — **the deploy/two-orchestrator era.**
   Uniquely holds: the six-verification-escalation closure record (streams H/I′/J/K/L), the
   CI-was-never-green discovery + fix story, the Greenhouse design state of record, the
   original two-orchestrator model definition, and the first inlining of the runbook.

Read ALL THREE on arrival (skim is fine; know what each holds). The §1 runbook below is
re-inlined and updated so day-to-day operation never depends on an archive.

**The constitution:** the founding product + process principles are distilled in auto-memory
(`trellis-founding-principles` — loads with your session) and sourced from
`TECHNICAL_DESIGN.md` §1/§2/§12, the archives, `PARALLEL-STREAMS.md` §1, and the design brief
§4. The short form: determinism (no probabilistic inference in the request path; feedback
selected never generated); fully-static/no-backend is a hard global constraint (no
SharedArrayBuffer — it's WHY Pages works); pure engine / effectful adapters; misconception =
warm amber, NEVER error-red; one merger to `main`; frozen contract changes once test-first,
additive seams preferred; verify-don't-trust with self-reproduced gates; hold-and-escalate on
any cross-implementation disagreement; three-way lockstep oracles; TDD + mutation-tested
gates with historical bugs as permanent goldens; escalate product calls to the user with
durable decision notes. Cite the principle when you bounce work.

> You are the BUILD ORCHESTRATOR — not a stream, not a verifier, not the content author. You
> do NOT implement packages or author curriculum yourself — sessions do that in their own
> worktrees and report to you. You own: `main` (THE ONLY MERGER), the frozen contract
> (`@trellis/schema`), `docs/**` (except the content track's lanes), root config / CI /
> deploy, `content/validate.py` + `content/verify/harness.py` internals (the oracle seam),
> and integration review (§1.2). Root at `/Users/alan/Desktop/Trellis` on `main`
> (confirm `pwd` + `git branch --show-current` FIRST).

---

## State snapshot (2026-06-10, `main` @ `7d55813`)

### 🚀 LIVE: https://partlywhole.github.io/coding-lessons/ (repo `PartlyWhole/coding-lessons`)
Every `main` push runs CI (full pnpm gate + Python content gates) AND auto-deploys via
`.github/workflows/deploy-pages.yml`. **Merging = publishing** — weigh it at every push.

### The platform: **649 tests** (E-18 landed `c324d52`, 2026-06-10), all gates green, pygame-capable, telemetry live
schema 45 · engine 162 · persist 19 · sandbox 75 · authoring 144 · runtime 23 · telemetry 51 ·
client 100 · integration-tests 30. Root turbo scripts work (cycle broken 2026-06-10). The
canonical verification entrypoint is **`verification/run-all-gates.sh --browser`**
(exit-code-strict; runs the m6-telemetry 15-check + m65-pygame 9-check + crash-repro 4-check
Playwright harnesses).

### 2026-06-10 ledger (what landed today, in order)
- **CI fixed + hardened** (`83cc9ab`→`85d5b7c`): had NEVER passed (turbo dies on the dev-only
  engine↔sandbox test cycle); now `pnpm -r` build-first; actions on v6/v5 majors (Node-24
  ready); **Python content gates run in CI** (pyyaml installed BEFORE tests — authoring's
  dialect/differential suites spawn python3).
- **Gates 8/9 ported into `validate.py`** (`b4671cc`) — mutation-tested, lockstep with TS.
- **Two-orchestrator sync protocol agreed + acked** (`INTER-ORCHESTRATOR-PROTOCOL.md`):
  doc lanes, handover protocol, seam rules, §6 capability-request queue. THE peer-track
  interface — read it in full.
- **Cycle-break** (`1600fc9`): `@trellis/integration-tests` holds the 3 cross-package suites;
  turbo restored.
- **§17.4 `graphical` schema seam** (`532385c`, test-first) + **M6.5 pygame** (`377e909`):
  the two-runtime model SHIPPED — new `@trellis/runtime` (main-thread player: boot order,
  gameGen, rAF watchdog, await-less-loop AST pre-check), sandbox graphical headless-grading
  path, client `PygameStage`. Defining gate orchestrator-reproduced **9/9 in a real browser**.
  Key design note: `docs/design-notes/2026-06-10-pygame-headless-preamble.md` (headless-aware
  preamble; **Pyodide SDL has NO dummy video driver → offscreen-Surface form is the preamble
  of record**). pygame-ce fits the pooled 256MB cap.
- **readOnly chip fix** (`77acf90`): EditorPane `readOnly` prop removed — editor always
  typeable; legality lives in buttons + step machine (the settled semantics).
- **seam-asks** (`99cba79`): all four content-track escalations — E-14 Subscript+List node
  types (3-way lockstep), E-17 gate 10 graphical lint (TS + validate.py), E-16 §7
  attribution-mode in TS gate 5 (detect-winner mirror; 9 permanent goldens + live harness
  differential), E-15 harness watchdog-kill short-circuit. **Finding relayed to content:**
  module-level runtime faults keep `ran:true` in the real RUN_HARNESS → their F7 gating
  premise was wrong (protocol §6 row 4).
- **M6 telemetry (`7d55813`) — bounced once, then LANDED with a platform safety fix.**
  `@trellis/telemetry` (§11 complete: bus/recorder/idle/deriver/buffer/scaffolder; bus types
  moved here, client `eventBus.ts` is a re-export shim; CapturePolicy privacy defaults;
  scaffolder HEADLESS except the three_fail_streak hint-advance via the existing ladder) +
  the 3 sanctioned emit sites (run/editor_change/focus) + one-line app attach. **The bounce
  story matters:** my merged-result m65 re-run caught a stacked-pygame-loops failure; the fix
  session DISPROVED my emit-threading hypothesis and root-caused a PRE-EXISTING §17.3 race —
  shared Pyodide module globals let the new run's `GEN = int(window.gameGen)` re-bind the
  global the OLD loop polls; kill-on-restart was a ~20ms phase race (2/6 stacked even at
  pre-M6 main; every historical 9/9 on check b was luck). Fix: fresh globals namespace per
  start/restart in `packages/runtime` (sanctioned with proof) — the kill is now
  UNCONDITIONAL. Browser evidence regenerated: m6 15/15 + m65 9/9 deterministic.

### The content track (peer orchestrator — `../trellis-content`, branch `content-authoring`)
FULL CURRICULUM REBUILD (user-directed): their branch already carries the corpus swap —
**15 nodes · 27 skills · 86 misconceptions**, gate-green on their side; Acts 7–8 (pygame,
consuming the M6.5 authoring contract) in authoring now. **The full-corpus handover is the
next BIG review** (§2 item 2): exactly **24 build-owned tests pin the old corpus** and the
re-pin is YOUR half — their `content/rebuild/HANDOVER-NOTES.md` has the measured damage map
+ suggested re-pin equivalents. Their lane: `CONTENT-ROADMAP.md` (read, never edit).
Communication: protocol doc lanes; live session-messages need user approval (unsupervised
fallback = doc lane + ask the user to nudge).

## 0. First moves on arrival
1. `pwd` = `/Users/alan/Desktop/Trellis`; branch `main`; `git fetch && git status` (REMOTE —
   you may be behind); `git worktree list` (expect main + `../trellis-content`; plus any
   in-flight stream worktrees); `git log --oneline -15`.
2. Reproduce the baseline: `verification/run-all-gates.sh --browser` — expect **637** + m6 15/15 + m65
   9/9 + crash-repro 4/4. It is exit-code-strict and
   installs first; trust its verdict over ad-hoc one-liners.
3. Live site 200 + `gh run list --repo PartlyWhole/coding-lessons --limit 3` green.
4. Read, in order: this file → `PARALLEL-STREAMS.md` §7 board (you own it) →
   `INTER-ORCHESTRATOR-PROTOCOL.md` → `../trellis-content/docs/coordination/CONTENT-ROADMAP.md`
   + `content/rebuild/HANDOVER-NOTES.md` (their lanes, read-only) → the THREE archives (see
   lineage above) → `docs/design-notes/` as needed → `TECHNICAL_DESIGN.md` (do not
   re-litigate). Invoke `superpowers:using-superpowers`. The constitution memory loads itself.

## 1. The operating loop (inlined — no archive needed day-to-day)

### 1.1 The stream pattern (how to launch ANY working session)
Worktree off current `main` (`git worktree add -b <branch> ../<dir> main`) + a git-excluded
`START-HERE.md` containing IN ORDER: rooting self-check FIRST (pwd + branch MUST match, else
STOP), exact ownership write-set (everything else read-only → escalate), defining gates (the
green bar, pasted-output requirement), guardrails (frozen surfaces, commit identity,
rebase-before-report, never merge/push), escalation triggers. Launch prompt points at the
file. **Substantive milestones run TWO-PHASE: Phase 1 = plan only (`writing-plans`) ending in
a stop-and-report; you review the plan + land any escalated contract seam test-first on
`main`; Phase 2 = a continuation agent into the same worktree with your review verdicts.**
HARD RULES for agent sessions: FOREGROUND gates (backgrounded gates make sessions exit
early); sequential heavy suites (`--workspace-concurrency=1` — concurrent real-CPython suites
manufacture timeout flakes); exit-code-strict verification (never pipe a test/harness run
through grep/tail — three masking incidents to date); usage-limited agents die mid-task —
the resume pattern is a continuation agent into the same worktree with explicit inherited
state (commits are usually banked; forensically review dirty diffs, regenerate evidence
rather than trusting inherited artifacts).

### 1.2 The §4.1 integration runbook (validated on 18 merges + 1 bounce to date)
0. **Pre-flight — verify, don't trust.** Scope: `git diff --stat main...<branch>` = only the
   owned paths (+ plan doc + lockfile). Guarded paths byte-clean: `git diff --name-only
   main...<branch> -- packages/schema content/ docs/coordination turbo.json .eslintrc.cjs
   pnpm-workspace.yaml .github` empty (exceptions: the branch's own plan; an
   orchestrator-sanctioned seam change is reviewed LINE-BY-LINE instead — harness.py/
   validate.py diffs always are). Rebased: `git merge-base --is-ancestor main <branch>`.
   Review the diff yourself at the sharp edges (brain files, emit sites, oracle internals,
   moved tests byte-compared against originals).
1. **Merge.** Confirm `git branch --show-current` = `main` FIRST. `git merge --ff-only`.
2. **`pnpm install` IMMEDIATELY** (a branch may add workspace links; the battery's
   frozen-lockfile step proves consistency but node_modules must exist first).
3. **`verification/run-all-gates.sh --browser` on the merged result** + reproduce the
   branch's OWN defining gate yourself. **When `packages/client` is touched, ALL prior
   browser harnesses must re-pass** — this rule caught the M6 stacked-loop regression that
   every unit suite (594 green!) missed. Paste real output.
4. **No-drift:** `git diff <pre-merge-sha>..HEAD -- packages/schema <other frozen paths>` empty.
5. **Record + publish.** §7 board (+ this file if material); commit as
   `-c user.name='Trellis' -c user.email='noreply@anthropic.com'`; `git push` = DEPLOY —
   only on green; watch the CI run to completion (`gh run watch`).
6. **Prune** worktree/branch; unblock downstream.
**On a FAILED merged-result gate: BOUNCE, don't debug on `main`.** `git reset --hard
<pre-merge-sha>` (origin untouched), dispatch a fix continuation into the stream's worktree
with the failure evidence + your root-cause hypothesis, re-review on its return. Clean stale
untracked build output after an un-merge (`packages/<new-pkg>/dist` survives the reset and
will confuse probes).

### 1.3 Standing rules
- Escalate to the user, don't guess: product/curriculum/contract calls, anything outward-facing.
- Frozen contract changes ONCE on `main` (test-first), then everything rebases; additive
  seams beat schema edits (M3b/M4/M5, all five H–L streams, AND M6.5's graphical block).
- Decisions of record become design notes (`docs/design-notes/` — wallMs, headless-preamble).
- Cross-track: doc lanes per the protocol; capability requests through protocol §6.

## 2. Work queue (state at handoff — ONE staged integration, nothing else in flight)
0. ✅ **DONE @ `c324d52`** (2026-06-10, the successor's first §4.1 — full runbook walked:
   rebase `abc970b`→`c324d52`, line-by-line seam re-review, FF-merge, 649-test battery
   incl. `--browser` green, no-drift, push+CI watched, §6 row 8 flipped LANDED, worktree
   pruned). ~~integrate E-18~~ — branch `e18-node-vocab` @ `abc970b`, worktree
   `../trellis-e18` (START-HERE inside). Small, LOW-RISK, deliberately left for you as the
   clean-cut choice (predecessor reviewed the diff line-by-line — byte-identical lockstep
   table additions in `content/verify/harness.py` + `packages/sandbox/src/ast-query.ts`,
   plus tests only; stream gates ran green foreground at **649** = 637 + 12). Your job is
   the full §1.2: pre-flight, FF-merge, `run-all-gates.sh` (the START-HERE's own rule says
   no `--browser` needed for a table-only diff; run it anyway if you want the same
   belt-and-suspenders the predecessor did), no-drift, push, flip protocol §6 row 8 to
   LANDED (the content successor's mechanical-upgrade green light waits on you), board row,
   prune. A perfect first walk through the loop.
   ⚠️ The branch also carries the pinning test for protocol **§6 row 9** (the
   `within`/`field` 3-way divergence — pre-existing, found by E-18's differential). Row 9's
   semantics call is queued, NOT part of this merge.
1. **Test-suite speedup stream** — then. The plan of record:
   `docs/design-notes/2026-06-10-test-suite-runtime-analysis.md` (rev 2, committed
   @ `e597d90`): (1) concurrency cap (config-only, measured −60s; sweep before pinning, CI
   separately), (2) warm-server CPython twin in `local-cpython.ts` (NOT fork — macOS/pygame
   unsafe; more production-faithful than process-per-run), (3) batch the authoring gate
   bridge (163 spawns → ~2), (4) follow-on fixture-level gate cache (the lever that compounds
   with the content corpus). Acceptance = the differential suites stay green + before/after
   wall times. Sequenced BEFORE the corpus handover (gate latency relief is what the handover
   review leans on). The user's session chip for this was superseded by this queue item.
2. **Full-corpus handover review** (the rebuild swap; biggest review of the project). Their
   branch hands over 15/27/86 gate-green; YOUR half = re-pin the **24 build-owned tests**
   per `content/rebuild/HANDOVER-NOTES.md`'s map (counts, marquee str/num equivalents,
   walkthrough cell, regenerate the 21-fixture differential from the new taxonomies).
   §1.2 content edition + the full battery + live walkthrough on the new corpus. Merging =
   replacing the public curriculum — user sign-off before the push.
3. **M7 hardening** — service-worker/offline + a11y audit + §17.8 iOS device validation of
   both runtimes (now incl. pygame).
4. **Polish/design queue** (each needs a ⚑ or a user call): backtick rendering in
   feedback/hints (design ⚑); hint-button-persists-after-syntax-error (user UX call);
   proactive-scaffold affordance (design ⚑ — M6 ships it headless); persist delete-by-age
   retention API (M7-adjacent); engine `evaluate.test.ts:187` mocks `ran:false` for
   module-level errors — disagrees with the engine's own RUN_HARNESS (frozen; fix the test
   model when engine next opens, and re-verify Stream H's `!ran` routing claim then; the
   finding of record: `docs/design-notes/2026-06-10-module-fault-ran-true.md`);
   **`within`/`childMatches` `field`-key semantics divergence** (protocol §6 row 9 — a
   §6.3 design extension: align harness.py + sandbox `node_matches` with the authoring
   matcher, or declare the form out-of-vocabulary in all three; coordinate with content,
   whose `color_tuple_in_fill` recorded form depends on the answer).
5. **Capability watch** (protocol §6): rich-media `watch` steps — storyboard specs still
   pending from content; design ⚑ + likely additive schema seam when they arrive.

## 3. Hard-won gotchas (additions; the archived lists ALL still apply)
1. **Bounce, don't debug on `main`** — reset to pre-merge, fix in the stream's worktree (§1.2).
2. **Client touched → every browser harness re-runs.** Unit suites all-green is NOT evidence
   against cross-feature browser regressions (M6: 594 green, stacked loops anyway).
3. **Pipes mask exit codes** — three incidents (grep/tail swallowed pnpm + harness failures).
   `run-all-gates.sh` exists because of this; extend IT, don't write new one-liners.
4. **Concurrent heavy suites flake** — the two real-CPython suites starved each other into
   timeouts when run simultaneously. Sequential always (`--workspace-concurrency=1`).
5. **Install before gating a merge** (workspace links), and **clean stale untracked dist**
   after an un-merge.
6. **Usage-limited subagents**: long Phase-2 agents can die mid-task with work banked —
   continuation agent inherits the worktree; review dirty diffs forensically; REGENERATE
   evidence (the M6.5 interrupted session's "all five captured" evidence was not green).
7. **Pyodide SDL has no dummy video driver** — headless pygame uses the offscreen-Surface
   preamble (design note 2026-06-10). Don't re-introduce `SDL_VIDEODRIVER=dummy` +
   `set_mode` assumptions from §17's literal text.
8. **The module-level-fault truth**: RUN_HARNESS keeps `ran:true` on module-level runtime
   errors — the engine DOES run tests on them. Beware any signature/fixture/test-mock
   assuming otherwise (engine's own evaluate.test mock is wrong — queue item 5).
9. **m6/m65 harnesses self-serve; crash-repro needs an external repo-root server** (the
   battery script handles all three).
10. Archived gotchas still in force: corepack PATH, lockfile regenerate-never-hand-merge,
    harness.py ignores unknown AstQuery keys (3-way lockstep!), ESM-cycle probes, engine
    purity ESLint, gitignored `bundle.json`, mutation-test new gates, branch-switch defense,
    ports per stream (`TRELLIS_PORT`), `verification/` is its own npm dir.

## 4. Reference index
- The THREE archived handoffs (lineage at top) + `PARALLEL-STREAMS.md` (rules + §7 board).
- `INTER-ORCHESTRATOR-PROTOCOL.md` — the peer-track interface + §6 capability queue.
- `../trellis-content/.../CONTENT-ROADMAP.md` + `content/rebuild/HANDOVER-NOTES.md` — their lanes.
- `verification/run-all-gates.sh` — THE battery. `verification/` evidence + Playwright harnesses.
- `docs/design-notes/` — wallMs · astquery gaps (§5 timedOut saga) · pygame headless preamble ·
  test-suite runtime analysis (rev 2).
- `docs/design/greenhouse/` + design handback + brief §4 — the design system of record.
- `docs/superpowers/plans/` — every stream's plan (M6.5 + M6 are the two-phase exemplars).
- `TECHNICAL_DESIGN.md` — architecture source of truth (recommendation-first format).
- Auto-memory: `trellis-founding-principles` (the constitution) + deployment + content-rebuild
  direction + per-stream status files.
