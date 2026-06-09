# Real-Pyodide Verification Session — launch prompt + debt ledger

**Owner:** orchestrator. **Status:** SCHEDULED — run **after Stream G (M5-client) integrates**, in a
**networked environment with a real browser**. A single pass clears all five deferred real-Pyodide debts.

## Why this session exists
Every prior Trellis session ran **offline** (no network → no real Pyodide/WASM, no real browser
IndexedDB). So several units were built + verified against faithful **stand-ins** and their real-environment
verification was explicitly deferred. This session runs them for real and either CONFIRMS each with evidence
or files/fixes the defect. The stand-ins (local-CPython twin, `memoryDriver`, `detect-precedence.test.ts`)
mean nothing is *broken* in the interim — this pass *confirms* they matched reality.

## The five debts (current as of `main` @ `753f223`, 5 packages, 350 tests)
1. **M3a `@trellis/sandbox` host** — real Pyodide load (CDN pin `PYODIDE_VERSION` 0.27.2), `Sandbox.run`
   contract, watchdog `worker.terminate()` kill switch, error line extraction, memory cap, warm pool,
   pygame-ce wheel/seam. *(highest-risk unit)*
2. **M3b `evaluate` + `parseAndMatch`** — the 21-fixture differential with **real Pyodide as the executor**
   (offline ran vs the local-CPython twin); the live ladder; determinism.
3. **M4 `mis.loop.infinite_true` `timedOut` re-key** — the engine §7 `matchedSpecificity` precedence is
   ALREADY on `main` (`detect-precedence.test.ts`); this finishes the deferred content/harness half from
   design-note §5, which genuinely needs a real watchdog + a harness-precedence decision (NOT mechanical).
4. **M5-persist `nativeDriver`** — the DOM-IndexedDB driver, verified offline only via `memoryDriver`;
   confirm atomicity/rollback/reload against **real browser IndexedDB**.
5. **M5-client whole-slice acceptance** — the in-browser learner walkthrough with real Pyodide grading +
   real IndexedDB reload, served from `python -m http.server`. **Requires Stream G on `main`** (gate the run).

Debts 1–4 are runnable the moment a networked browser exists; **Debt 5 needs G integrated** — which is why
the recommended plan is one pass after G lands.

---

## LAUNCH PROMPT (paste into a session in a networked environment with a real browser, rooted at the Trellis repo)

```
You are a VERIFICATION session — not a build stream. Everything you check is already
implemented and merged on main; your job is to run it in a real browser with network (the
environment every prior session lacked) and either CONFIRM each deferred claim with real
evidence or file/fix the defect. You have NETWORK here — Pyodide/WASM/pygame wheels and npm
deps that were unfetchable offline are now available. This single pass clears FIVE deferred
debts (M3a, M3b, M4 re-key, M5-persist nativeDriver, M5-client whole-slice).

SETUP
- Root at the Trellis repo on the LATEST main (pull first; it should be at/after Stream G's
  integration — 6 packages once G lands). Create a branch real-pyodide-verification off main so
  any fix/commit is isolated; do NOT commit directly to main — the orchestrator reviews + merges.
  export PATH="/opt/homebrew/lib/node_modules/corepack/shims:$PATH" before pnpm.
- Reproduce the offline baseline first (must already be green): pnpm -r typecheck/lint/test/
  build + python3 content/validate.py + python3 content/verify/harness.py. harness.py (CPython)
  REMAINS the differential oracle — real Pyodide must agree with it, not replace it.
- Invoke superpowers:using-superpowers and superpowers:verification-before-completion.
  Evidence before assertions: paste real console output / screenshots for every CONFIRM. If
  the work is large, author a short plan (superpowers:writing-plans) first.
- Drive a real browser with whatever is available: the Claude Preview / Claude-in-Chrome MCP
  tools (start a server, navigate, eval JS, read console + network, screenshot) or a headless
  browser (Playwright / vitest browser mode). Serve built assets with `python -m http.server`
  (no server logic — that's part of the M5 contract).

DEBT 1 — M3a @trellis/sandbox host (THE highest-risk unit; verify in a real Web Worker)
- Real Pyodide loads from the PINNED CDN at PYODIDE_VERSION 0.27.2 — confirm the exact pin
  resolves and loads (first real load; if the pin is wrong/stale, FIX it).
- Sandbox.run under real Pyodide: fresh namespace per call; stdout/stderr captured; structured-
  clone-only boundary with NO js FFI reachable from learner code.
- Watchdog kill switch: an infinite-loop submission triggers a real worker.terminate(),
  surfaces as a timeout (NOT a hung tab), and a replacement worker spins up.
- A syntax error and a runtime error report type + LINE NUMBER from real tracebacks.
- WebAssembly.Memory cap enforced; warm-pool hides respawn latency; cold-start "warming…"
  state observable and within budget.
- pygame-ce: confirm the wheel is fetchable and the runtime?:"pygame" seam loads (smoke only).

DEBT 2 — M3b engine evaluate + sandbox parseAndMatch (real Pyodide as the executor)
- Re-run the 21-fixture differential with parseAndMatch running real Python `ast` IN THE
  PYODIDE WORKER (offline it ran only against the local-CPython twin). MUST still agree with
  harness.py on all 15 build-bearing misconceptions. Watch for version skew between real
  Pyodide's CPython and the local python3 twin — if the ast differs, document it and escalate;
  do NOT silently relax the gate.
- The live evaluate ladder (Run→Test→AST→Property) runs end-to-end through real Pyodide; §4
  acceptance holds (f-string AND str() coercion pass; str+number → mis.concat.str_num).
- Determinism: same (submission, EvaluatorConfig, seed) → byte-identical Diagnosis + identical
  counterexample across repeated real-Pyodide runs.

DEBT 3 — M4 mis.loop.infinite_true timedOut re-key (the engine precedence is ALREADY on main;
this finishes the deferral from design-note §5 — the part that NEEDS real Pyodide)
- On the verification branch, apply the re-key to content/skills/loops.taxonomy.yaml: add
  `{ timedOut: true }` as the PRIMARY `any` branch of mis.loop.infinite_true.signature (keep the
  field-scoped AST shape `{ astTag: infinite_true_no_break }` as corroboration).
- Verify END-TO-END with the real watchdog: a genuinely non-terminating `while True:` that real
  Pyodide kills → live detect() attributes mis.loop.infinite_true; a never-updating `while cond:`
  that also times out → §7 matchedSpecificity makes structural mis.loop.no_update WIN (infinite_true
  loses). The engine machinery for this is on main (engine/test/detect-precedence.test.ts) — you
  are confirming it against a real timedOut signal, the discrimination the offline harness can't model.
- THE harness decision (this is why it was deferred, not a rubber-stamp): harness.py tests each
  signature IN ISOLATION, so a bare {timedOut:true} on infinite_true over-matches the no_update-
  shaped notTrigger (which also times out). Do NOT paper over it by deleting/altering that
  discriminating fixture. Choose ONE and justify it: (a) teach harness.py §7 precedence (rank
  matches by specificity, first-match-wins, like the engine) so it stays a faithful oracle; or
  (b) explicitly carve out that infinite_true's timedOut case is precedence-resolved and document
  that the offline differential covers signature-match while the live engine's precedence test
  covers attribution. Then re-run the 21-fixture differential and confirm it's green under your choice.
- This touches orchestrator-owned content/** + harness.py — keep it on the branch and flag it
  clearly for orchestrator review. If a precedence ambiguity surfaces, HOLD and escalate.

DEBT 4 — M5-persist nativeDriver (real browser IndexedDB; memoryDriver already proves the logic)
- Run @trellis/persist's nativeDriver against REAL browser IndexedDB (it's been typecheck/build-
  verified only — Node has no IndexedDB). Confirm: the atomic commitSubmission writes learner_skill
  + diagnosis + behavioral_event in ONE real transaction and a forced mid-txn fault rolls back all
  three; appendEvents/recentEvents round-trip; the contentVersion cache hits/busts; and the native
  abort path doesn't throw an unhandled rejection (the fix at 4e8eca5).

DEBT 5 — M5-client whole-slice acceptance (ONLY if Stream G / @trellis/client is on main; else
skip and say so in your report)
- Serve the built client via `python -m http.server` with NO server logic. Run the FULL learner
  walkthrough in a real browser: keyed step replacement, a build cell graded in-browser by real
  Pyodide, attribution-colored feedback, the pullable hint ladder (one level per press, level 4
  behind a confirm).
- Reload survival via REAL browser IndexedDB (not memoryDriver/fake): mastery + diagnosis history
  persist across a real page reload, round-trip identical.
- Content loads via static fetch of the bundle, cached by contentVersion (re-fetch on change).
- Confirm the EventBus emit sites fire with no subscriber attached (the M6 seam).

OUTCOME
- For each debt item: CONFIRMED (with pasted evidence) or DEFECT (minimal repro + root cause).
  Small env/config fixes (CDN pin, worker config, a wheel URL) may be committed on the branch;
  anything touching package logic or the frozen contract — STOP and escalate to the orchestrator.
- The M4 re-key (Debt 3) is a content/harness change for orchestrator review regardless — present
  your harness decision + the green differential, don't self-merge it.
- Write a verification report to the orchestrator and update the memory status files
  (m3a-sandbox-status, m3b-build-ladder-status, m5-persist-status) flipping each item from
  "deferred / mock-verified" to "real-Pyodide CONFIRMED @ <sha>" or "DEFECT: <summary>".
- Do NOT claim a debt cleared without real browser evidence. Partial is fine — report exactly
  what ran and what remains. Debts 1–4 can run as soon as a networked browser exists; Debt 5
  needs Stream G integrated first.
```

---

## Orchestrator notes (not part of the paste)
- **Recommended timing:** one pass **after G integrates** → clears all five in a single session. Running
  earlier clears only 1–4 and forces a second session for Debt 5.
- **Optional de-risk:** M3a is the highest-risk unit and G's in-browser wiring sits on it; if convenient,
  clear Debt 1 (±2) opportunistically before/while G is in flight. Not required — G builds against the M3a
  mock offline, so its code doesn't depend on real-Pyodide being confirmed first.
- **Bump the rooting line** ("at/after Stream G's integration — 6 packages") to the actual post-G `main`
  SHA when you launch it.
