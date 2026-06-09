import type { Diagnosis } from "@trellis/schema";

// The determinism contract (decided 2026-06-09, docs/design-notes/2026-06-09-wallms-determinism.md):
// a Diagnosis is byte-identical across re-evaluations of the same (submission, config, seed)
// MODULO `signals.wallMs`, which is non-semantic measurement telemetry (real sandboxes stamp
// real wall-clock; the offline twin pins 0). This helper mechanically encodes the carve-out:
// route EVERY byte-identity comparison of Diagnoses (tests, peek-back reconstruction, audit
// tooling, future analytics) through it instead of comparing naively.
//
// `wallMs` MUST NOT be an input to any grading, detection, mastery, or hint decision —
// timing-sensitive behavior would be a design change to escalate, not a read of this field.
export function canonicalDiagnosis(d: Diagnosis): Diagnosis {
  // Shallow-copy the record and the signals object only (the one field we rewrite lives
  // there); deeper structures are untouched and shared. No mutation of the input.
  return { ...d, signals: { ...d.signals, wallMs: 0 } };
}
