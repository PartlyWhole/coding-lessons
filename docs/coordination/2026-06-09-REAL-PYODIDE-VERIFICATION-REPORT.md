# Real-Pyodide Verification Report — 2026-06-09

**Session:** real-pyodide-verification (worktree `/Users/alan/Desktop/trellis-verify`, branch
`real-pyodide-verification` off `main` @ `5bb4a56`). **Status: ALL FIVE DEBTS RUN.**
Evidence JSON lives in `verification/evidence/`; every harness page + runner is committed under
`verification/` (standalone npm dir, outside the pnpm workspace — the lockfile is untouched).
Environment: headless Chromium (Playwright), assets served by `python -m http.server 8765` at the
repo root (no server logic), network available (jsDelivr CDN). Real Pyodide 0.27.2 = CPython
**3.12.7**; local twin/oracle = CPython 3.9.6 — **no observable `ast`/behavior skew** on this corpus
(49/49 differential agreement).

Baseline reproduced before any change: 392/392 workspace tests, `pnpm -r typecheck/lint/build`
green, `content/validate.py` PASS, `harness.py` gates 5+6 PASS. Re-verified green after all changes.

---

## Debt 1 — M3a `@trellis/sandbox` host: **CONFIRMED (11/13), 2 findings**

Evidence: `verification/evidence/debt1.json` (harness `verification/debt1.js`).

| Check | Result |
|---|---|
| CDN pin 0.27.2 resolves + first real load | ✅ HTTP 200, `PYODIDE_VERSION="0.27.2"` |
| Cold start: `warming` observable, budget | ✅ `{warming:2,ready:0}` at create → ready; warmup **1241 ms** (≪ 30 s) |
| `Sandbox.run` stdout/stderr/contract | ✅ `print` → stdout exact; returnValue 5 via entrypoint; stdin round-trip |
| Fresh namespace per call on a REUSED warm worker | ✅ `x=42` then `print(x)` → `NameError` |
| Watchdog kill switch | ✅ `while True` → `worker.terminate()` at **2001 ms**, `timedOut:true`, NOT a hung tab; replacement spawned (`{warming:1,ready:1,total:2}`); next run fine |
| Syntax + runtime error type/line | ✅ syntax line 1; `ZeroDivisionError` line 2 (real tracebacks) |
| Warm pool hides latency | ✅ warm run 3 ms vs 1241 ms cold |
| pygame-ce wheel + seam smoke | ✅ `loadPackage("pygame-ce")` → pygame-ce **2.4.1** (SDL 2.28.4) imports |
| **Finding A — js FFI** | ⚠️ `import js` / `import pyodide_js` **ARE importable from learner code** (JsProxy reachable → worker-scope `fetch` reachable). The host boundary is structured-clone-only as claimed, but "NO js FFI reachable from learner code" is false as stated. Fix = RUN_HARNESS/worker logic → **escalated, not fixed**. |
| **Finding B — memory cap** | ⚠️ NOT enforced: 600 MB allocated under `memoryMb:256`. Matches the documented deferral in `pyodide-worker.ts` ("to be tuned under real-Pyodide verification"). **Escalated.** |

## Debt 2 — M3b differential + live ladder: **CONFIRMED**

Evidence: `verification/evidence/debt2.json` + debt2b run (harnesses `debt2.js`, `debt2b.js`).

- **21-fixture differential with real Pyodide as executor** (`parseAndMatch` runs Python `ast`
  IN the worker): **15 build-bearing misconceptions, 49/49 fixtures agree** with harness.py.
  No version skew surfaced (Pyodide CPython 3.12.7 vs oracle 3.9.6).
- **§4 acceptance through the live ladder**: f-string AND `str()` coercion → `correct/pass`;
  `"text" + number` → `attribution:"misconception"`, `misconceptionId:"mis.concat.str_num"`.
- **Determinism**: 3× repeated `evaluate` → byte-identical Diagnosis **modulo `signals.wallMs`**,
  with the seeded property **counterexample `[3]` identical** across runs (planted-defect
  `is_one`; tests 3/0 passed, property failed). *Caveat:* the local twin pins `wallMs:0` by
  design; the real host stamps measured wall-clock, so literal byte-identity including `wallMs`
  is impossible under real Pyodide — flagged for the orchestrator to bless (or to spec wallMs
  out of the determinism contract).

## Debt 3 — M4 `timedOut` re-key + harness decision: **DONE — FOR ORCHESTRATOR REVIEW** (commit `a4fb601`)

- **Re-key applied** (`content/skills/loops.taxonomy.yaml`): `{ timedOut: true }` is the PRIMARY
  `any` branch of `mis.loop.infinite_true.signature`; field-scoped AST shape + `choice: b` kept.
- **HARNESS DECISION = design-note §5 option (a): teach harness.py §7 precedence.** Rationale:
  it keeps the oracle *faithful to the engine's attribution semantics* instead of bifurcating
  what gate 5 means; the discriminating `no_update`-shaped notTrigger is **kept** and now passes
  for the engine's reason (its timeout matches infinite_true's timedOut branch at rank 2 but
  LOSES to structural `no_update` at rank 0), not by deletion. Implementation mirrors
  `detect.ts`: `timedOut` signal (a subprocess timeout is timedOut, never `runError:runtime`),
  `matched_specificity`/`static_rank`/`detect_winner`, build fixtures assert attribution,
  signal needs unioned across the step's candidates. `differential.test.ts` (the TS mirror of
  gate 5) got the same decision: build fixtures assert `detect()` attribution.
- **End-to-end vs the REAL watchdog** (`verification/debt3.js`, all on real terminate() kills):
  1. genuine `while True:` killed at ~2001 ms → `detect()` → **mis.loop.infinite_true** ✅
  2. diverging non-True loop (no structural tag fires, ONLY `timedOut`) → **mis.loop.infinite_true
     via the new branch** ✅ (proves the re-key is live, not shadowed by the astTag)
  3. never-updating `while cond:` (also times out) → **mis.loop.no_update WINS**, infinite_true
     loses ✅ — the exact discrimination the offline isolated-signature harness couldn't model
- **Green under the choice**: gates 5+6 PASS (21/21 miscons), 392/392 workspace tests,
  authoring compile PASS with the re-keyed signature.
- **🔴 ESCALATION (engine-owned, NOT fixed here):** `evaluate()` maps `!signals.ran` (incl.
  `timedOut`) to `attribution:"runtime"` **without calling `detect()`** (evaluate.ts:97-99) —
  so the live ladder never surfaces `misconceptionId` for a watchdog-killed submission; the
  hint ladder/feedback for `mis.loop.infinite_true` is unreachable through `evaluate`. Repro:
  debt3 check 4 (`attribution:"runtime"`, `misconceptionId:null`, `timedOut:true`). The detect
  machinery itself is correct (checks 1–3 + `detect-precedence.test.ts`). Decide whether
  `evaluate` should run detect on `!ran`+`timedOut` (and possibly on module-level runtime
  errors, where the same routing applies).

## Debt 4 — M5-persist `nativeDriver`: **CONFIRMED (7/7)**

Evidence: `verification/evidence/debt4.json` (harness `debt4.js`), real browser IndexedDB.

- atomic `commitSubmission`: learner_skill + diagnosis + behavioral_event in ONE real txn ✅
- forced mid-txn fault (missing keyPath → real `DataError` after a successful first put) →
  native abort **rolled back all three stores** ✅, surfaced as a clean rejection with
  **zero unhandledrejection events** (the 4e8eca5 fix holds) ✅
- `appendEvents`/`recentEvents` round-trip incl. `by_step_ts` compound-index scan, newest-first ✅
- contentVersion cache: fetch 1× → cache hit 0× → version change re-fetch ✅
- close + reopen: learnerId stable, data survives ✅

## Debt 5 — M5-client whole-slice: **BEHAVIOR CONFIRMED; static-host wiring DEFECT; 3 content fixes**

Evidence: `verification/evidence/debt5.json` (runner `run-debt5.mjs`, host `verification/app/`).

**🔴 DEFECT (as-shipped static host cannot boot — app/package wiring, escalated):**
1. `packages/client/index.html` serves raw tsc output with bare specifiers; **react ships
   CJS-only** → unservable as browser ESM even with an import map. Reproduced: empty `#root`,
   `Failed to resolve module specifier "react/jsx-runtime"`. A bundling/vendoring build step is
   required by construction.
2. the `@trellis/sandbox` barrel eagerly re-exports the node-only CPython twin →
   `node:child_process` enters the browser module graph (needs a browser-safe subpath/barrel).
3. `makeSandbox.ts`'s workerUrl (`../../../sandbox/...`) resolves correctly from `src/` but not
   from the served `dist/src/app/` layout → 404 once (1) is fixed.

**Verification path:** `verification/build-app.mjs` (esbuild) bundles the REAL `main.tsx` into
static ESM assets (worker kept as a separate module file; `node:child_process` stubbed); serving
stayed `python -m http.server` — no server logic. With that one build step, the **full learner
walkthrough is green** (9/9):

- keyed step replacement (§5.2): old step node unmounted, fresh node mounted ✅
- build cell graded **in-browser by real Pyodide**; authored `mis.concat.str_num` feedback
  rendered, attribution-colored (misconception `rgb(191,135,0)` ≠ pass `rgb(26,127,55)`) ✅
- pullable hint ladder: counts `[0,1,2,3,4]` one per press; level 4 behind an explicit
  Confirm; revealCode shown ✅
- correct f-string retry → pass → **Cell complete ✓** ✅
- **REAL page reload**: mastery + diagnosis history round-trip identical (4 diagnoses;
  `skill.string.concat_str_num` mastery 0.845), learnerId stable ✅
- content via static fetch, **cached by contentVersion: exactly 1 bundle.json fetch across the
  reload** ✅
- EventBus emit sites fired throughout with NO subscriber; zero page errors ✅

**🔴 CONTENT FIX (committed `0884bf3`, for orchestrator review):** the engine compares a
choice-mode predict's chosen **ID** against `expected.normalized` (explicit + tested,
`diagnose.test.ts`). Three corpus predicts listed only prose → **unanswerable** (the learner can
never advance; the real walkthrough was blocked at step 2): `cell.string_concat.text_plus_number#2`,
`cell.string_concat.join_text#2`, `cell.conditionals.if_else#2`. Fixed by adding the correct id as
the first `normalized` entry. Invisible to every offline gate → **authoring lint gap**: flag
choice-mode predicts with `ids ∩ expected.normalized = ∅`.
*Also flagged (not changed):* `join_text#2` tags `mis.concat.missing_space` on the CORRECT choice
b ("HiAlan"); the learner who believes `+` adds a space picks a — likely mis-authored.

---

## Branch contents (all on `real-pyodide-verification`; never merged)

| Commit | What |
|---|---|
| `22edb92` | Debt 1 harness + evidence |
| `3392533` | Debt 2 harness + evidence |
| `a4fb601` | **Debt 3: content re-key + harness §7 precedence + differential.test.ts mirror** ← review focus |
| `4a81956` | Debt 4 harness + evidence |
| `0884bf3` | **Debt 5: 3 content predict fixes** + static-build verification host + evidence ← review focus |

## Escalations (decision needed, in priority order)

1. **engine `evaluate` routing**: `!ran`/`timedOut` (and module-level runtime errors) never reach
   `detect()` → re-keyed infinite_true unreachable through the live ladder (Debt 3, check 4).
2. **client static-host wiring**: needs a real build step (or vendored ESM deps) + browser-safe
   sandbox entry + corrected workerUrl (Debt 5 defects 1–3).
3. **sandbox js-FFI exposure** from learner code (Debt 1 finding A).
4. **WASM memory cap** unenforced (Debt 1 finding B — already documented in code).
5. **determinism contract**: bless wallMs nondeterminism under real Pyodide or spec it out (Debt 2).
6. **authoring lint gap**: unanswerable choice-mode predicts; + the `join_text#2` misconception-
   on-correct-choice authoring flag (Debt 5).
