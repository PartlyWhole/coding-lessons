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
| **D** | M3b — build ladder | `m3b-build-ladder` | `packages/engine/**` (`evaluate`) + `packages/sandbox/**` (`parseAndMatch`) | `@trellis/schema`, `content/**`, `content/verify/harness.py` |
| **E** | M4 — misconceptions + hints | `m4-misconceptions-hints` | `packages/engine/**` (§9 ladder) + `packages/authoring/**` (gates 5–7) | `@trellis/schema`, `content/**`, `content/verify/harness.py`. ⚠️ `timedOut` re-key of `content/**`+`harness.py` is **orchestrator-owned** (coordinated — see §7) |
| **F** | M5-persist — `@trellis/persist` | `m5-persist` | `packages/persist/**` (new) | `@trellis/schema` ONLY |
| **G** | M5-client — `@trellis/client` | `m5-client` *(not yet launched)* | `packages/client/**` (new) | `@trellis/schema`, `@trellis/engine` (+M4 ladder), `@trellis/persist` |

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
                              D: M3b build-ladder ✅ integrated ee79120
                                          │
            ┌─────────────────────────────┴─────────────────────────────┐
            ▼ (run concurrently — disjoint paths, both off main now)     ▼
   E: M4 misconceptions/hints (engine+authoring)            F: M5-persist @trellis/persist (schema-only dep)
            └─────────────────────────────┬─────────────────────────────┘
                                          ▼ (after E + F integrate)
                              G: M5-client @trellis/client (React; needs engine+M4 ladder + persist)
```

**Why E ∥ F is safe:** M5 splits into two new packages with different deps — `@trellis/persist` needs
ONLY the frozen M0 schema (no engine, no M4), so it parallelizes with M4; `@trellis/client` needs the
engine step-machine + M4's hint ladder + persist, so it follows both. E and F have **disjoint write paths**
(engine+authoring vs. a new `packages/persist/**`); the only shared file is `pnpm-lock.yaml`.

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

### Content hardening — AST queries migrated to the `field` selector (2026-06-08)

- **`has_elif` and `infinite_true_no_break` migrated to §6.3 `field` forms** (flagged by Stream A). The
  over-matching `within`/`childMatches` heuristics are replaced by exact field-scoped detectors:
  `has_elif` → `{ node: If, field: { orelse: { node: If } } }`; `infinite_true_no_break` →
  `{ node: While, field: { test: { node: Constant, where: { attr: value, eq: true } } } }`.
  `content/verify/harness.py` now implements §6.3 rule 1 (it previously ignored `field` — which would
  silently over-match, so the harness update was mandatory, not cosmetic). Verified: validate.py PASS,
  harness gate 5+6 PASS, plus a direct precision check (old forms over-matched a nested-if/body-`True`;
  new forms don't). See `docs/design-notes/2026-06-08-astquery-grammar-gaps.md` §1.
- **`mis.loop.infinite_true` re-key onto `{ timedOut: true }` — SCHEDULED for M4** (not done now; the third
  item Stream A flagged). `timedOut` is ambiguous across infinite-loop misconceptions (a `while True:` and a
  never-updating `while cond:` both hang); the real engine disambiguates via §7 precedence, but the offline
  differential harness tests signatures in isolation — so doing it now is untestable-or-wrong **and** changes
  detection on the current corpus by exactly zero. It belongs at M4, where the real sandbox emits genuine
  `timedOut` and live `detect()` precedence makes it end-to-end verifiable. Tracked as an explicit M4 action
  item: design note §5 + ORCHESTRATOR-HANDOFF §7. For now the field-scoped AST shape is the detector and the
  watchdog timeout is the product backstop.
- Touches only `content/**` + `content/verify/harness.py` (orchestrator-owned tooling). **M1 rebase note:**
  its TS matcher already supports `field`; the rebase differential (TS vs harness on all 21 fixtures) is
  the cross-check that both implement §6.3 rule 1 identically.

## 7. Status board (orchestrator updates this — streams report, don't edit)

`main` @ `78e45a1`+ (2026-06-09 night). **🎉 ALL SIX VERIFICATION ESCALATIONS CLOSED — the slice is integrated, real-environment-verified, hardened, and LIVE at https://partlywhole.github.io/coding-lessons/** (public repo `PartlyWhole/coding-lessons`; every `main` push auto-deploys via `.github/workflows/deploy-pages.yml`). **Workspace = 458 tests** (schema 37 · persist 19 · authoring 97 · engine 168 · sandbox 65 · client 72). Streams H/I′/J/K/L all integrated same-day (rows below). Night-session updates: **CI workflow fixed + first-ever green run @ `83cc9ab`** (it had silently failed since creation on turbo's engine↔sandbox dev-cycle; now runs the validated `pnpm -r` gate build-first); **two-orchestrator sync protocol agreed + acked** (`INTER-ORCHESTRATOR-PROTOCOL.md` @ `d3a3a19`; content track redirected by the user to a FULL CURRICULUM REBUILD — kid-focused, pygame capstone — no handover imminent; two capability requests queued in protocol §6); **gates 8/9 ported into `validate.py` @ `b4671cc`** (mutation-tested, lockstep with the TS gates). Remaining queue: polish items (backtick rendering in feedback/hints — needs design ⚑ sign-off; hint-button-persists-after-syntax-error — frozen-behavior UX flag), engine↔sandbox test-cycle break + CI actions-runtime bump + (candidate) Python content gates in CI, then the §7 downstream chain (M6 telemetry → M6.5 pygame → M7 offline/a11y; M6/M6.5 ordering = user call once the content roadmap lands).

**Real-Pyodide verification session MERGED (2026-06-09, FF to `91fca31`)** — all 5 deferred debts ran in
a real networked browser (headless Chromium, jsDelivr CDN, `python -m http.server`); full report:
`docs/coordination/2026-06-09-REAL-PYODIDE-VERIFICATION-REPORT.md`, evidence under `verification/`.
Verdicts: **D1 M3a CONFIRMED** (11/13; CDN pin 0.27.2, real watchdog terminate+respawn, error lines,
warm pool, pygame-ce 2.4.1) · **D2 M3b CONFIRMED** (49/49 differential w/ real Pyodide 3.12.7 executor;
§4 acceptance; determinism mod `wallMs`) · **D3 `timedOut` re-key APPLIED+REVIEWED** (`a4fb601`:
`{timedOut:true}` primary branch; harness taught §7 attribution precedence — design-note §5 option (a);
`no_update` notTrigger KEPT, passes for the engine's reason; orchestrator reviewed the mirror rank-by-rank
vs `detect.ts`) · **D4 nativeDriver CONFIRMED** (7/7 vs real IndexedDB incl. real-abort rollback) ·
**D5 client behavior CONFIRMED** (9/9 walkthrough w/ real Pyodide grading + real reload) **but the
as-shipped static host cannot boot** (esc. 2). Plus 3 unanswerable choice-mode predicts fixed (`0884bf3`,
reviewed vs `diagnose.ts` semantics). `verification/app/` bundle = living repro for esc. 2; delete it when
the real client build step lands. **Six escalations are now the work queue** (report §Escalations):
(1) engine `evaluate` routes `!ran`/`timedOut` past `detect()` → re-keyed infinite_true unreachable in the
live ladder [BLOCKER]; (2) client static-host wiring needs a real build step + browser-safe sandbox entry +
workerUrl fix [BLOCKER]; (3) sandbox js-FFI reachable from learner code; (4) WASM mem-cap unenforced;
(5) `wallMs` vs byte-identical-Diagnosis determinism contract [user call]; (6) authoring lint gap
(unanswerable choice predicts) + `join_text#2` misconception-tag-on-correct-choice [content call].
Harness fidelity footnote for esc. 1: harness computes `tests` on timed-out fixtures, engine short-circuits
before tests — benign on this corpus (no `testFailure`-keyed loop candidate; 49/49 agreement), revisit with
the routing fix.
**Post-slice tooling cleanup landed** (`fdf0abb`): all four offline-era ambient `shims.d.ts` dropped for
real `@types/node`/`@types/js-yaml` (network now available); `local-cpython.ts` `isTimeout` narrowed via
`NodeJS.ErrnoException` (was masked by a shim mistyping `spawnSync.error`). Full gate re-verified green
against the real types — no masked errors surfaced.
Merged result verified green: **392 tests** (schema 37 + engine 159 + authoring 80 + sandbox 55 + persist
19 + **client 42**); typecheck/lint/build clean; native-ESM imports of all 6 `dist` clean (client barrel
has no init cycle); content oracle PASS. The marquee offline walkthrough runs end-to-end (UI → engine +
sandbox-twin grading → persist → reload survival). **No build streams remain.** The real-Pyodide
verification pass is ~~pending~~ **DONE and merged** (see above); next work = the 6 escalations, then the
design-implementation stream (UI deliverables), then M6 (telemetry), M6.5 (pygame), M7 (offline/a11y). Earlier checkpoints:
M0–M3b core 288 tests; +M4 = 331; +M5-persist = 350; typecheck/lint/build clean; native-ESM `import()` of each `dist/src/index.js` OK (the new
test-only sandbox→engine devDep adds no runtime cycle); `content/validate.py` + `content/verify/harness.py`
PASS. **M3b's two defining gates green & proven non-vacuous:** the 21-fixture differential (engine
`evaluate` + `parseAndMatch` over the local-CPython twin agrees with `harness.py` on all 15 build-bearing
misconceptions, oracle exits 0) and §4 acceptance (f-string + `str()` both pass; `str+number`→
`mis.concat.str_num`; byte-identical `Diagnosis` under fixed seed). Frozen-schema fixes (ElemSpec
`fec6b8f`, dist-exports `f9bcef6`) + the §6.3 `field`-selector content migration (`3a8bf73`) all landed;
**M3b made NO frozen-contract change** (it consumes an additive `BuildSandbox = Sandbox & { parseAndMatch }`,
the §15 `LanguageAnalyzer` seam realized without editing schema). **Next on the single-threaded critical
path: M4** (misconceptions/hints end-to-end; turn on §13.2 gates 5–7; the deferred `timedOut` re-key).
⚠️ Standing debt: real-Pyodide-in-WASM verification of `parseAndMatch` + the live ladder still needs a
networked browser (same posture as M3a — built/verified against the local CPython twin only).

| Stream | Status | Worktree / branch | Notes |
|---|---|---|---|
| readOnly-fix · chip session | ✅ **integrated** @ `77acf90` (2026-06-10) | merged; worktree pruned | The latent first-step-build read-only-editor bug FIXED per the settled semantics (legality in buttons + step machine; editor always typeable): EditorPane `readOnly` prop REMOVED (mount-frozen prop was the lie; Compartment prescribed in-code if ever genuinely needed), BuildStepView/PygameStage simplified, failing-first regression test. **Workspace = 534** (client 89→90). Orchestrator-verified: full gate + m65 browser gate 9/9 re-run + L crash-repro 4/4 re-run on the merged result (editor mount path touched → both browser harnesses re-proven). |
| M6.5 · pygame runtime | ✅ **integrated** @ `377e909` (2026-06-10) | merged; worktree pruned | The §17 two-runtime model SHIPPED (user-sequenced ahead of M6). NEW `@trellis/runtime` (main-thread player: §17.2 boot order, gameGen guard, rAF watchdog, await-less-loop AST pre-check) + sandbox graphical path (lazy pygame-ce wire field, D3 dummy-driver decorator w/ AST-over-learner-source, D1/D4 sim composition, `toHeadlessStep`) + client `PygameStage` (injection points only; brains untouched) + proving fixture. Schema seam pre-landed @ `532385c` (8 validity tests); plan: `docs/superpowers/plans/2026-06-10-trellis-m6.5-pygame.md`; A1 design note (headless-aware preamble; **real-browser finding: Pyodide SDL has no dummy video driver → offscreen-Surface form is the preamble of record**). **Workspace = 533** (schema 45 · persist 19 · sandbox 69 · authoring 97 · engine 162 · runtime 22 · integration-tests 30 · client 89). Defining gate ORCHESTRATOR-REPRODUCED in a real browser: **9/9** (canvas-alive, keyboard scoped, editor typeable, gameGen restart no stacked loops, frozen-playback headless grading, byte-identical canonicalDiagnosis ×2 pass+misconception, await-less refusal, warm-amber ladder); evidence `verification/evidence/m65-*`. pygame-ce fits the pooled 256MB cap (no runDedicated). Latent frozen-path bug flagged (first-step-build → read-only editor; no corpus trigger; chip spawned + polish queue). |
| cycle-break · workspace hygiene | ✅ **integrated** @ `1600fc9` (2026-06-10) | merged; worktree pruned | The dev-only engine↔sandbox test cycle BROKEN: new private `@trellis/integration-tests` package holds the 3 cross-boundary suites (m4-concat-e2e 6 · differential 17 · acceptance 4 = 27 tests) + `_fixtures.ts`, moved verbatim (import-path edits only, byte-compared at review); engine drops sandbox+authoring devDeps, sandbox drops engine devDep. **Turbo task graph restored** — root `pnpm typecheck/lint/test/build` all green for the first time since M3b. 458 total redistributed: schema 37 · persist 19 · authoring 97 · engine 162 · sandbox 44 · client 72 · integration-tests 27. Full merged gate green (turbo + pnpm -r + probes + content). |
| L · 🔥 client crash hotfix | ✅ **integrated** (2026-06-09) | merged; worktree pruned | LIVE-SITE crash FIXED. Root cause (failing-test-confirmed, corrected the initial triage): Submit button **re-enabled in FEEDBACK** (`disabled` only checked EVALUATING) + unguarded `grade()` dispatch → fail-fast stepMachine threw in the React reducer → tree unmount; collateral IDB closing-race unhandled rejection. Fix: `claimTransition` ref-based guard probing the engine's own stepMachine rules (no hardcoded legality, no swallowed errors) at every user-triggerable dispatch site (submit pre+post-await, retry, advance, mount-enter) + `disabled = phase !== "ACTIVE"` + synthetic-click early-returns + caught teardown persist. Engine untouched. Client 64→72 tests (+8 crash guards, failing-first); **workspace = 441**. Browser: crash-repro 4/4 (orchestrator-reproduced: zero pageErrors), walkthrough 8/8. |
| J · sandbox hardening | ✅ **integrated** (2026-06-09) | merged; worktree pruned | Escalations 3+4 RESOLVED. js-FFI: blocklist (static roots `js`/`pyodide_js`/`pyodide`/`_pyodide` + dynamic JsProxy sweep + registerJsModule registry) armed around each learner run in the shared RUN_HARNESS → clean ImportError; host machinery + warm-pool reuse intact; honest scope documented (import surface closed; adversarial boundary = the worker itself). Mem-cap: **PREEMPTIVE** grow-guard (`WebAssembly.Memory.prototype.grow` patched in worker scope — 600MB alloc fails at ~20MB heap) + watermark belt + mandatory recycle via internal `ResultMessage.recycle` wire flag (frozen RunResult untouched). Real-browser: debt1 **13/13** (checks 5+11 now strict), walkthrough 8/8. Sandbox 55→65 tests; **workspace = 433**. I′'s packaging seam untouched. |
| K · authoring lint | ✅ **integrated** (2026-06-09) | merged; worktree pruned | Escalation 6a RESOLVED. Gates **8-answerable** (choice-mode predicts must contain a winning choice id, mirroring `diagnose.ts` `matchesAccepted` via a local re2js matcher) + **9-correct-miscon** (no misconception tag on a correct choice; recognize + predict + misconceptionMap text-mode analogue), both mutation-tested against the real historical bugs as permanent goldens. **Gate 9 immediately caught 4 MORE real corpus bugs** (input.numbers#2, loops.guessing_game#2, variables.box#2, variables.use#2) — escalated properly, fixed by the orchestrator (user-approved) @ `aacf0ce`, then the gate went strict (allowlist deleted, corpus clean). Authoring 80→97 tests; **workspace = 458**. |
| H · evaluate routing | ✅ **integrated** @ `ed0d5e0` (2026-06-09) | merged; worktree pruned | Escalations 1+5 RESOLVED: `evaluate` routes `!ran`/`timedOut` through `detect()` (misconception wins; error-type fallback intact) — the re-keyed `infinite_true` + all runError-keyed signatures (e.g. `mis.var.undefined`) now reachable live on module-level faults (intended widening, corpus-confirmed); `canonicalDiagnosis` exported, all byte-identity assertions routed through it (modulo-wallMs per the design note). Engine 159→168 tests (+9, TDD'd); **workspace = 401**. Merged gate green: 401 tests, ESM probes, validate+harness PASS, schema no-drift. |
| I′ · client host + Greenhouse | ✅ **integrated** @ `b496f55` (2026-06-09) | merged; worktree pruned | Escalation 2 RESOLVED + Greenhouse SHIPPED. Real esbuild static host (`pnpm --filter @trellis/client build` = tsc + app bundle; sibling worker module; build-time zero-`node:`-specifier assert); sandbox browser entry via conditional exports (packaging only); workerUrl fixed; Fontsource self-hosted fonts. All ⚑ markup additions, final attribution hexes, CM6 trellisEditor theme, lockedRegions visual contract. Brain files (useCellRunner/grade/HintPanel) ZERO diff — frozen semantics intact. Client 42→64 tests; **workspace = 423**. Merged gate green incl. orchestrator-reproduced real-browser walkthrough (8/8, byte-identical evidence re-run) + 11 Greenhouse state screenshots (`verification/evidence/greenhouse-*.png`). Stale `verification/app/` repro deleted. Polish queue: backtick rendering in feedback/hints (needs design ⚑ sign-off); hint-button-persists-after-syntax-error (pre-existing frozen behavior, flagged). |
| A · M1 authoring | ✅ **integrated** @ `a04c082` | merged to `main` | Compiler + seven §13.2 gates (1–6 live, 7 M4-stub). **The TS matcher ↔ `harness.py` differential agrees on all 21 fixtures incl. the field forms** (real 12s run, no stub) — §6.3 rule 1 confirmed identical across implementations. CLI runs under plain node (`RESULT: PASS`, exit 0). 76 tests. Worktree `../trellis-m1` now mergeable/removable. |
| B · M2 engine | ✅ **integrated** @ `f5a1ad8` | merged to `main` | Gating diff (`var.assign` 0.59→locked, 0.60→available) + determinism proven; engine purity confirmed; 76 tests. |
| C · M3a sandbox | ✅ **integrated** @ `1c05031` · real-Pyodide verify **deferred** | merged to `main` | Host/watchdog/warm-pool proven vs a mock worker (23 tests). **Real Pyodide load, live `worker.terminate()`, line extraction, mem-cap, and `PYODIDE_VERSION` (0.27.2) CDN pin MUST be verified in a networked browser before M3a is verification-COMPLETE.** |
| E · M4 misconceptions+hints | ✅ **integrated** @ `406b069` · real-Pyodide verify **deferred** | merged to `main` (worktree `../trellis-m4` removable) | Extends engine (§9 hint ladder) + authoring (gates 5–7 live). Concat taxonomy `implicit_coercion`→`misconception`→feedback→4-level ladder, wired end-to-end and proven: marquee e2e (`'…: '+number`→`mis.concat.str_num`→authored feedback→one-level-per-press ladder, L4 behind confirm, `autoEscalate`, reset-on-new-misconception); gate 7 live + non-vacuous on real content (golden added, Escalation B `cf7daa7`); byte-identical `Diagnosis`. 331 tests (engine +39, authoring +4). No schema change. Dev-only engine↔sandbox test devDep (production graph acyclic, native-ESM confirms). **⚠️ Escalation A `timedOut` re-key HELD** — M4 built the engine §7 `matchedSpecificity` precedence (the prerequisite, on `main`), but the content re-key itself is reassigned to the **networked-browser verification session** (needs real Pyodide per design-note §5; applying offline would force harness papering-over). |
| F · M5-persist | ✅ **integrated** @ `4e8eca5` · `nativeDriver` real-browser verify **deferred** | merged to `main` (worktree `../trellis-m5-persist` removable) | NEW `@trellis/persist` package — IndexedDB stores (`learner_skill`/`diagnosis`/`behavioral_event`/`content_cache`), atomic `commitSubmission` txn (§3.10), `appendEvents`/`recentEvents` (M6 seam), static-fetch + `contentVersion` cache. **Zero new npm deps** — `idb`/`fake-indexeddb` failed offline (`ERR_PNPM_NO_OFFLINE_META`), so it ships a narrow `IdbConnection` interface with two drivers: `memoryDriver` (atomic staging/rollback, backs all 19 tests) + `nativeDriver` (thin DOM-IndexedDB wrapper, production, real-browser-verify deferred). Leaf-pure (imports schema + typebox only); lockfile drift = 13-line workspace entry. Defining gates green: atomicity (mid-txn fault rolls back all three stores), reload survival, content cache. |
| G · M5-client | ✅ **integrated** @ `19d8eea` · in-browser whole-slice verify **deferred** | merged to `main` (worktree `../trellis-m5-client` removable) | NEW `@trellis/client` — React 19 + CodeMirror 6. `CellRunner` (§5.2 keyed step replacement), step views (all 5 kinds), `EditorPane` + `lockedRegions`, attribution-colored `FeedbackPanel`, learner-dosed `HintPanel` (§9.2, M4 ladder), `PeekBackPanel` (§5.3), `useCellRunner` brain (engine `evaluate`/`diagnose` + §5.1 machine + persist `commitSubmission`), `loadBundle`+`contentVersion` cache, `EventBus` stub (§11.1). 42 tests. **Network was available in G's env** — used the spec's real React+CodeMirror stack (the `idb` offline-trap didn't apply). Top leaf (consumes schema/engine/persist/sandbox; nothing imports it). **Marquee offline walkthrough green** (UI→engine+sandbox-twin grading→persist→reload survival). ⚠️ Real-Pyodide in-browser grading + real-browser IndexedDB end-to-end **deferred** → real-Pyodide session (Debt 5). |
| D · M3b build ladder | ✅ **integrated** @ `ee79120` · real-Pyodide verify **deferred** | merged to `main` (worktree `../trellis-m3b` removable) | The build-evaluation ladder. **Not a disjoint package — EXTENDS `@trellis/engine` (adds `evaluate`: Run→Test→AST→Property, comparators, seeded property gen+shrink, build-path diagnose) AND `@trellis/sandbox` (the §6.3 `AstQuery` `parseAndMatch` in the worker).** Both already integrated, so it's the sequential build-out on M2+M3a; disjoint from M1 (authoring). **Does NOT depend on M1** — uses hand-authored fixtures + raw `content/`. Defining gate: the real detector agrees with `content/verify/harness.py` on all 21 fixtures. No network → real-Pyodide verify **deferred** (build vs mock sandbox + local CPython). |

## 8. Reference index

- `TECHNICAL_DESIGN.md` — architecture source of truth.
- `docs/superpowers/specs/2026-06-08-trellis-m0-m5-implementation-design.md` — M0–M5 impl spec (read §1 realignment).
- `docs/superpowers/plans/2026-06-08-trellis-m0-schema-foundation.md` — executed M0 plan + amendments.
- `docs/design-notes/2026-06-08-astquery-grammar-gaps.md` — §6.3 gaps (now pinned in the design).
- `.claude/skills/authoring-trellis-content/` — the content authoring skill.
- `content/validate.py`, `content/verify/harness.py` — Python gate reference impls (port to TS; keep as differential oracle).
