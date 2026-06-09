# Trellis — Orchestrator Handoff

**Purpose:** onboard a fresh agent into the **orchestrator** role for the Trellis build.
**As of:** `main` @ `8a2b667` (2026-06-09, end of the integration session). Re-verify on arrival.
**Previous handoff:** `docs/coordination/archive/2026-06-08-ORCHESTRATOR-HANDOFF.md` — the build-era
manual (streams A–D context, the original snapshot, full §-history). Read it for *how the slice was
built*; read THIS file for *where things stand and what you do next*. This file supersedes it.

> You are the ORCHESTRATOR, not a stream and not a verifier. You do NOT implement milestones or run
> verifications yourself — sessions do that in their own worktrees. You own `main`, the frozen contract
> (`@trellis/schema`), the coordination docs, integration review, and the downstream chain. Root your
> session at the MAIN repo: `/Users/alan/Desktop/Trellis` on branch `main` (confirm with `pwd` +
> `git branch --show-current`).

---

## State snapshot — read this first (2026-06-09, `main` @ `8a2b667`)

### 🎉 The full M0–M5 deterministic slice is INTEGRATED and offline-green
6 packages, **392 tests** (typecheck/lint/build clean; native-ESM imports clean; content oracle PASS).
**All build streams (A–G) are done; their worktrees and branches are pruned.** No code work is in flight
on `main`.

| Milestone | Package | Integrated @ | Tests | Notes |
|---|---|---|---|---|
| M0 | `@trellis/schema` | (base) | 37 | the frozen contract; `ElemSpec` split + dist-exports fixes (2026-06-08 era) |
| M1 | `@trellis/authoring` | `a04c082` | 80 | YAML→Bundle compiler; **all 7 §13.2 gates live** + gate-7 golden (`cf7daa7`); CLI |
| M2+M3b+M4 | `@trellis/engine` | `f5a1ad8`/`ee79120`/`406b069` | 159 | pure core + `evaluate` ladder (Run→Test→AST→Property) + §9 hint ladder + §7 match-aware `detect` precedence |
| M3a+M3b | `@trellis/sandbox` | `1c05031`/`ee79120` | 55 | Pyodide worker host + §6.3 `parseAndMatch` + local-CPython twin |
| M5-persist | `@trellis/persist` | `4e8eca5` | 19 | IndexedDB; atomic `commitSubmission`; zero-new-dep memory+native drivers |
| M5-client | `@trellis/client` | `19d8eea` | 42 | React 19 + CodeMirror 6; CellRunner/step views/hints/peek-back; EventBus stubbed; marquee offline walkthrough green |
| (tooling) | shims cleanup | `fdf0abb` | — | offline-era ambient `shims.d.ts` dropped for real `@types/node`; `isTimeout` narrowed; no masked errors surfaced |

**Environment change vs. the 2026-06-08 era: NETWORK IS NOW AVAILABLE** (confirmed during M5-client —
React/CodeMirror installed online; `@types` real). The archived handoff's "no network" warnings are
historical. Re-verify on arrival rather than assuming either way.

### The two LIVE tracks (both external to you — their outputs return to you)

**1. Real-Pyodide verification session — ✅ DONE, reviewed + MERGED (FF to `91fca31`, 2026-06-09).**
- All 5 debts ran in a real networked browser. Report:
  `docs/coordination/2026-06-09-REAL-PYODIDE-VERIFICATION-REPORT.md`; evidence under `verification/`.
- D1/D2/D4/D5-behavior CONFIRMED; the Debt-3 re-key landed (`a4fb601`, harness §7 precedence = design-note
  §5 option (a), `no_update` notTrigger kept) and was reviewed rank-by-rank vs `detect.ts`; 3 unanswerable
  choice-mode predicts fixed (`0884bf3`). Worktree `../trellis-verify` pruned.
- **Its 6 escalations are now the active work queue** — see the §7 board header in `PARALLEL-STREAMS.md`
  and the report's §Escalations. Blockers: (1) engine `evaluate` doesn't route `!ran`/`timedOut` through
  `detect()`; (2) the client static host can't boot without a real build step.

**2. External UI/UX design — brief delivered, deliverables will return.**
- Self-contained brief: `docs/design/2026-06-09-ui-design-brief.md` (committed). An upload bundle
  (brief + client TSX + 2 content nodes/taxonomies for real copy) was generated at
  `~/Desktop/trellis-design-handoff.md` (v2, disposable snapshot — regenerate from the same file list
  rather than trusting a stale copy).
- The client UI is deliberately unstyled (semantic classNames, **zero CSS in repo**); the brief freezes
  the §5/§9 interaction semantics and the attribution color *mapping* (amber-not-red misconception
  register) while leaving all presentation open.
- **When designs return:** scaffold an implementation stream (worktree + START-HERE, pattern below)
  owning `packages/client/**` presentation only, with the green bar = 42 client tests + the marquee
  walkthrough; fold the design deliverables into its brief. It can run ∥ other tracks (disjoint paths).

### Decisions made this session (durably recorded; know them before touching content/engine)
- **`timedOut` re-key HELD, engine half SHIPPED** — the M4 stream asked to re-key
  `mis.loop.infinite_true` onto `{timedOut:true}` + "adjust the harness fixture." HELD per design-note
  §5's own requirement (needs the real Pyodide watchdog; the offline isolated-signature harness
  over-matches the `no_update` notTrigger, and "adjusting" that fixture = papering over). M4's engine §7
  `matchedSpecificity` precedence (the prerequisite) IS on `main` (`detect-precedence.test.ts`).
  The re-key is now verification-session Debt 3. Full status: design-note §5 "STATUS UPDATE".
- **Gate-7 golden added on real content** (`cf7daa7`, orchestrator-applied Escalation B) — proven
  non-vacuous by mutation (wrong id → gate error; revert → PASS).
- **M5 split insight** (validated): `@trellis/persist` depends only on M0 schema → ran ∥ M4; the spec's
  serial `M4 → M5` arrow was pessimistic. Reuse this lens when sequencing M6+.
- **Shims dropped for real `@types`** (`fdf0abb`) — the offline-era per-package ambient `.d.ts` pattern
  is gone; don't reintroduce it now that network exists.

---

## 0. First moves on arrival
1. Confirm rooting: `pwd` = `/Users/alan/Desktop/Trellis`, branch = `main`.
2. `git worktree list` (expect exactly: main repo + `../trellis-verify`) and `git log --oneline -15`
   (state may have advanced past `8a2b667` — the snapshot above is as-of-writing, not gospel).
3. Check the verification track: `git -C ../trellis-verify log --oneline -5` + `status --short`.
4. Reproduce the baseline: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"` then
   `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build` — expect **392 tests**
   (schema 37 · persist 19 · authoring 80 · engine 159 · sandbox 55 · client 42). Native-ESM check:
   `node -e "import('./packages/<p>/dist/src/index.js')"` for schema/engine/sandbox/authoring/persist,
   and `node packages/client/test/esm-probe.mjs` for the browser-targeted client. Content oracle:
   `python3 content/validate.py` + `python3 content/verify/harness.py` (both PASS).
5. Read, in order: this file → `docs/coordination/PARALLEL-STREAMS.md` (the sync doc you OWN; §7 board)
   → `docs/coordination/REAL-PYODIDE-VERIFICATION.md` → the archived handoff (for build-era depth) →
   `TECHNICAL_DESIGN.md` as needed. Invoke `superpowers:using-superpowers`.

## 1. The project in one paragraph
Trellis is a deterministic, fully-static (no-backend) CS teaching platform graded in-browser by Pyodide.
The design is settled in `TECHNICAL_DESIGN.md`; we do NOT re-litigate it. Work happens in parallel
streams — one stream = one worktree = one branch = one Claude session — that report to the orchestrator,
who merges. Methodology = the superpowers skills (`writing-plans` → `subagent-driven-development` →
`finishing-a-development-branch` inside a stream; the §4.1 runbook at every merge).

## 2. The stream pattern (how to launch any future session)
Every working session gets: a worktree off current `main` (`git worktree add -b <branch> ../<dir> main`),
a **git-excluded `START-HERE.md`** inside it (rooting self-check FIRST — pwd + branch MUST match; then
ownership paths, defining gates, guardrails, escalation rules), and a short launch prompt pointing at
that file. Worktrees share the main repo's `.git/info/exclude`, which already lists `START-HERE.md`.
**This applies to ALL sessions including small spawned tasks** — see gotcha #1 in §8 for why.

## 3. Streams ledger (history — all integrated, worktrees pruned)
A·M1 `a04c082` → B·M2 `f5a1ad8` → C·M3a `1c05031` → D·M3b `ee79120` → E·M4 `406b069` →
F·M5-persist `4e8eca5` → G·M5-client `19d8eea` → shims `fdf0abb`. Per-stream detail: the §7 board in
`PARALLEL-STREAMS.md` and the archived handoff.

## 4. Your job (the orchestrator loop)
- Keep `PARALLEL-STREAMS.md` §7 board current (streams report; only you edit it).
- Review + merge incoming branches via §4.1. Verify, don't trust reports — reproduce their gates.
- Own cross-cutting decisions; **escalate to the user, don't guess**, on curriculum/contract/product calls.
- Apply orchestrator-owned changes yourself (`content/**`, `content/verify/harness.py`, `docs/**`,
  root config) — never let a stream edit shared paths; they escalate to you (the Escalation A/B pattern).

### 4.1 Integration runbook (the repeatable spine — validated on M2/M3a/M1/M3b/M4/M5×2/shims)
Set `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"` first.
0. **Pre-flight — verify, don't trust.** Scope: `git diff --stat main...<branch>` = only the owned
   paths + plan doc + `pnpm-lock.yaml`. Contract/content/shared-docs clean:
   `git diff --name-only main...<branch> -- packages/schema content/ docs/coordination turbo.json
   .eslintrc.cjs pnpm-workspace.yaml` **empty** (exception: a branch's own plan under
   `docs/superpowers/plans/` is fine; an orchestrator-sanctioned content change — e.g. the verification
   branch's Debt 3 — is reviewed line-by-line instead). Rebased: `git merge-base --is-ancestor main
   <branch>` → if not, rebase it (disjoint paths rebase clean) or bounce it.
1. **Merge.** `git merge --ff-only <branch>` (FF after rebase). **Confirm you are ON `main` first** —
   see gotcha #2.
2. **Lockfile.** `pnpm install` then `pnpm install --frozen-lockfile` (consistency proof). On a lockfile
   conflict: do NOT hand-merge — regenerate (`pnpm install` → `git add` → continue).
3. **Full gate on the merged result.** `pnpm -r typecheck && lint && test && build` + the native-ESM
   probes (§0.4) + the branch's own defining gates (run its key test files explicitly, with output) +
   `validate.py` + `harness.py`. Paste real output — no success claims without it.
4. **No-drift.** `git diff <pre-merge-sha>..HEAD -- packages/schema` empty (plus any other path the
   branch shouldn't touch).
5. **Record.** Update the §7 board + this file's snapshot if material; commit on `main` as
   `-c user.name='Trellis' -c user.email='noreply@anthropic.com'`.
6. **Unblock downstream**; prune the branch/worktree once merged (`git worktree remove`, `git branch -d`).

**Hold-and-escalate, don't paper over:** a cross-implementation differential disagreement (TS/Pyodide vs
`harness.py`) is a spec ambiguity — pin it, don't merge around it. Precedent: Escalation A (the held
re-key) is the canonical example of refusing a stream's "just adjust the fixture" request.

## 5. The frozen contract — change protocol
`@trellis/schema` changes land ONCE on `main` (test-first, acyclic module graph), then everything
rebases. No stream forks a shared type. Notably: M3b/M4/M5 all shipped with **zero** schema changes —
additive seams (`BuildSandbox = Sandbox & { parseAndMatch }`) beat contract edits; demand that standard.

## 6. The two pending return-paths (your near-term work queue)
1. **Verification report** → §4.1 review of `real-pyodide-verification` (Debt-3 diff hardest; evidence
   for every CONFIRMED; bounce weakened oracles) → merge → board + memory-file updates → worktree prune.
2. **Design deliverables** → scaffold the design-implementation stream (§2 pattern; owns
   `packages/client/**` presentation; 42 tests + marquee walkthrough stay green; frozen semantics per
   the brief §4) → on its green report, §4.1 again.
These two are independent of each other and can both be in flight at once.

## 7. Downstream chain (after the verification pass merges)
- **M6 telemetry** — the seams are ready and waiting: client `EventBus` emit sites (stubbed, no
  subscriber) + persist `behavioral_event` store + `appendEvents`/`recentEvents`. M6 attaches a
  `Recorder` subscriber with zero emit-site changes. Likely parallel-safe with the design-implementation
  stream IF ownership is split carefully (M6 wants a recorder module + maybe client wiring — decide the
  seam before launching both).
- **M6.5 pygame** — seams preserved: `runtime?: "pygame"`, CodeMirror `lockedRegions`, language-agnostic
  `evaluate` over `RunResult`+`astTags`; pygame-ce wheel smoke is part of verification Debt 1.
- **M7 hardening** — offline/service-worker + a11y audit (the design brief kept the a11y baseline).
- The **`timedOut` re-key** (old cross-refs point here as "M4 ACTION ITEM → §7"): now verification
  Debt 3 — see design-note §5 STATUS UPDATE and `REAL-PYODIDE-VERIFICATION.md`.

## 8. Hard-won gotchas (cost real time; read all of them)
1. **Spawned/secondary sessions may run IN the main repo and switch its branch under you** — happened
   with the shims task (it ran in `/Users/alan/Desktop/Trellis`, checked out its feature branch there).
   `main` the ref was unharmed (branch-only commit), but every git command you run is suddenly on their
   branch. Defense: worktree + START-HERE for everything (§2), and gotcha #2.
2. **"Already up to date" from `git merge` while HEAD moved = you're ON the branch you meant to merge.**
   Check `git branch --show-current` before merging; check `git reflog show main` on ANY unexplained ref
   state before proceeding. Never rationalize unexplained movement.
3. pnpm exists only via corepack: `export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH"`.
4. **Lockfile conflicts: regenerate, never hand-merge** (§4.1 step 2). Additive entries from disjoint
   streams usually auto-merge (E∥F did).
5. **`harness.py` silently ignores unknown AstQuery keys** (the §6.3 true-by-default trap) — any content
   query-form change REQUIRES a lockstep harness update, or it over-matches without failing.
6. **ESM cycle trap:** an import cycle passes Vitest but deadlocks native-ESM imports of built output.
   Probe every package's `dist` after build; the browser-targeted client has its own
   `test/esm-probe.mjs` (plain `node import()` of it works too, but the probe checks exports).
7. `@trellis/engine` purity is ESLint-enforced (no react/idb/pyodide/fetch *runtime* imports);
   `@types/*` devDeps are fine (types-only). Test-only workspace devDeps (engine↔sandbox) create a
   dev-only cycle warning — benign; the production graph must stay acyclic (the probe proves it).
8. Commit on `main` as `Trellis <noreply@anthropic.com>`; streams/sessions use their own names —
   interleaved committers are expected.
9. The authoring CLI's `build` writes `bundle.json` to cwd — it's gitignored; don't commit one.
10. Mutation-test your gates when you add them (the gate-7 golden was proven by breaking it first).
11. The Desktop design bundle is a stale-able snapshot — regenerate from the repo, don't re-send old.

## 9. Reference index
- `docs/coordination/archive/2026-06-08-ORCHESTRATOR-HANDOFF.md` — **the previous handoff** (build-era
  role manual + snapshot; the §4.1 origin; stream A–D history).
- `docs/coordination/PARALLEL-STREAMS.md` — the sync doc you own (rules, ownership, §7 status board).
- `docs/coordination/REAL-PYODIDE-VERIFICATION.md` — the 5-debt verification mission + launch prompt.
- `docs/design/2026-06-09-ui-design-brief.md` — the UI/UX brief (frozen semantics live in its §4).
- `docs/design-notes/2026-06-08-astquery-grammar-gaps.md` — §5 = the `timedOut` saga + STATUS UPDATE.
- `docs/superpowers/specs/2026-06-08-trellis-m0-m5-implementation-design.md` — the executed M0–M5 spec.
- `docs/superpowers/plans/` — every stream's committed plan (M3b/M4/M5-persist/M5-client etc.).
- `TECHNICAL_DESIGN.md` — architecture source of truth (do not re-litigate).
- `content/validate.py` + `content/verify/harness.py` — the Python reference validators / differential oracle.
- Auto-memory (`~/.claude/projects/-Users-alan-Desktop-Trellis/memory/`) — m3a/m3b/m5 status files; the
  verification session updates them when debts clear.
