# Design note — module-level runtime faults keep `ran: true` (E-15 finding of record)

**Date:** 2026-06-10 · **Origin:** the seam-asks stream's E-15 investigation, verified
empirically against the real `RUN_HARNESS` via the local-CPython twin; orchestrator-reviewed
at the `99cba79` integration. **Audience:** content authors/orchestrators reconciling
E-15-withheld fixtures; future engine work.

## The fact

A module-level runtime fault in learner code (e.g. `pront("hi")` → NameError at exec time)
returns **`ran: true`** from `run-harness.py` — the run *executed*; it raised. The engine's
`evaluate` therefore does NOT short-circuit: it **proceeds to the test runner**, producing
BOTH `runError: "runtime"` AND a populated `tests` block (failed cases). Raw evidence was
pasted in the seam-asks session; the executable proof is
`packages/authoring/test/e15-crashed-run.differential.test.ts`.

What DOES short-circuit (`evaluate.ts:39-52`, the bare-run check): `!ran` / `timedOut` —
i.e. **watchdog kills**, not runtime exceptions. `harness.py` now mirrors exactly that
(its E-15 change @ `99cba79`): timeout → no `tests`; runtime fault → tests still computed
(engine parity).

## What this reverses

The content track's withheld voice-memory fixture carried the comment "pront → NameError…
ENGINE-safe, runError short-circuits tests, tests never ran." **That premise is false in the
live engine.** Consequence: an F7-style gating signature of the form
`all: [<astTag>, testFailure]` **fires on a typo'd call** (runtime fault ⇒ failed tests ⇒
`testFailure` is true), mis-attributing a misconception the learner may not hold.

Reconciliation guidance for the corpus:
- Signatures that mean "the structure is wrong AND the run actually completed tests" must
  additionally exclude the fault case (e.g. `not: { runError: … }`-style discrimination, or
  re-key on what actually discriminates).
- Signatures that mean "it crashed at module level" should key on `runError: runtime` —
  NOT on the absence of tests.
- The withheld fixtures stay withheld until re-designed; the harness now tells the truth
  either way, so a re-authored fixture is verifiable end-to-end.

## Known inconsistency flagged (not fixed — engine frozen)

`packages/engine/test/evaluate.test.ts:187-188` mocks a module-level runtime error as
`ran: false` — the engine's own test model disagrees with its real sandbox harness. Queued
(handoff §2 polish item): fix the mock when the engine next opens, and re-verify Stream H's
"`!ran` routes through detect()" claim against the true semantics at the same time.
