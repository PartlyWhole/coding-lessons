# Determinism contract vs `signals.wallMs` — DECIDED 2026-06-09 (user-approved)

**Decision: the determinism contract is "byte-identical Diagnosis MODULO `signals.wallMs`".**
(Verification escalation 5, `docs/coordination/2026-06-09-REAL-PYODIDE-VERIFICATION-REPORT.md`.)

## The fact pattern
- M3b's defining gate: same `(submission, EvaluatorConfig, seed)` → byte-identical `Diagnosis`.
- `Diagnosis.signals.wallMs` records measured execution time. The offline local-CPython twin pins
  `wallMs: 0` (by design — `local-cpython.test.ts` asserts it), so byte-identity held trivially in
  every offline run.
- Under real Pyodide the host stamps real wall-clock (Debt 2 evidence: `2001.7`, `2000.8`, …), so
  two identical runs differ in exactly that field. Everything semantic — attribution,
  misconceptionId, test results, the seeded property counterexample — was proven byte-identical
  across repeated real-Pyodide runs (`verification/evidence/debt2.json`).
- Nothing in grading reads `wallMs`: no branch of `detect`/`evaluate`/`computeDeltas` consults it.
  It is measurement telemetry riding along in the persisted record (useful diagnostic context,
  e.g. "this run nearly hit the watchdog").

## The contract, restated
Every field of `Diagnosis` MUST be byte-identical across re-evaluations of the same
`(submission, config, seed)` **except `signals.wallMs`**, which is explicitly excluded as
non-semantic measurement. `wallMs` MUST NOT be used as an input to any grading, detection,
mastery, or hint decision — if a future feature wants timing-sensitive behavior, that is a
design change to escalate, not a reading of this field.

## Respecting the asterisk (REQUIRED follow-through, not optional)
The carve-out must be **mechanically encoded**, not just documented:

1. **Engine (owner: the evaluate-routing stream / Stream H):** add a canonicalization helper —
   e.g. `canonicalDiagnosis(d)` returning `d` with `signals.wallMs` zeroed — and route EVERY
   byte-identity assertion through it (`determinism.test.ts`, the M3b §4 acceptance, any future
   golden). The tests must stop relying on the twin's pinned `wallMs:0` to pass; they should pass
   against a real-time sandbox too.
2. **Any consumer that compares stored Diagnoses** (peek-back reconstruction, future M6 analytics,
   audit tooling) must compare canonically, not naively. The helper is exported for this reason.
3. The twin keeps pinning `wallMs: 0` (still the right default for reproducible fixtures); this
   decision removes the *dependence* on that pin, it does not remove the pin.

## Rejected alternative
Spec `wallMs` out of `Diagnosis` entirely (zero it at construction; move timing to the M6
`behavioral_event` stream). Pristine literal byte-identity, but engine churn for a field nothing
semantic depends on, and it discards in-record diagnostic context. Revisitable at M6 if telemetry
wants to own timing outright.
