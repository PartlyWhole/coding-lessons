# Stream L — hotfix plan: submit-in-FEEDBACK crash + IDB closing race

## Root cause (confirmed by reproduction, see test/runnerCrashGuards.test.tsx)

1. `packages/client/src/CellRunner.tsx` — `disabled = phase === "EVALUATING"` only. In
   FEEDBACK every Submit button re-enables. Non-build grading resolves within microtasks, so
   the second click of a double-click lands in FEEDBACK on an enabled button.
2. `packages/client/src/runner/useCellRunner.ts` — `grade()` dispatches `{type:"evaluating"}`
   with no phase guard → reducer runs `stepMachine(kind, FEEDBACK, "submit")` → the engine's
   (correct, frozen) fail-fast `StepTransitionError` is thrown inside the reducer during
   render → production React unmounts the tree.
3. Collateral: TrellisApp's effect cleanup `db?.close()` fires on unmount while the first
   `grade()` is still in flight; `persistDiagnosis` → `db.transaction` on a closing
   connection → `InvalidStateError`; callers use `void r.submitNonBuild(...)` so the
   rejection is unhandled.
4. Enter path: there is NO `<form>` and all buttons are `type="button"` — Enter in the
   predict/recall inputs cannot fire submit today. The live path is the re-enabled button.

## Dispatcher audit (same class of bug)

| dispatcher | machine event | unguarded risk | action |
|---|---|---|---|
| `grade` (submitNonBuild/submitBuild) | submit, diagnosis | THROWS in FEEDBACK (the live crash) | guard (race-safe ref claim) |
| `retry` | retry | throws if fired outside FEEDBACK (double-fire) | guard |
| `advance` | advance | throws on double-fire (second lands on next step's ACTIVE, non-watch) | guard |
| mount `enter` effect | enter | throws on double-run (e.g. StrictMode remount) | guard |
| `pullHint` | none (hintState only; engine pullHint is phase-independent) | none | audited, no change |
| `setBuildCode` | none | none | audited, no change |

## Fix (client boundary only; engine untouched)

- `useCellRunner`: a `machineRef` mirroring committed machine state, resynced every render, plus a
  `claimTransition(kind, event)` helper that PROBES the engine's own `stepMachine` rules
  against the CURRENT ref state and atomically claims the transition before dispatching —
  same-tick double-fires see the claimed phase and no-op. Applied to grade/retry/advance/enter.
  `persistDiagnosis` call wrapped: teardown race logs `console.warn`, never rejects unhandled.
- `CellRunner`: `disabled = phase !== "ACTIVE"` (covers FEEDBACK, not just EVALUATING).
- Views (Predict/Recall/Recognize/Build): submit handlers early-return when `disabled`
  (defense in depth; synthetic clicks on disabled buttons must not reach `onSubmit`).

## Verification

- Unit: `packages/client/test/runnerCrashGuards.test.tsx` (failing-first reproduction).
- Browser: `verification/run-l-crash-repro.mjs` — double-submit + Enter-spam on the predict
  step against the built, statically served app; zero pageerrors/unhandled rejections.
- `verification/run-debt5.mjs` walkthrough must stay 8/8; full repo gate green.
