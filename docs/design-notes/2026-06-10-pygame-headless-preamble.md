# Design note — the pygame locked preamble is headless-aware (§17.3/§17.6 amendment)

**Date:** 2026-06-10 · **Decided by:** build orchestrator, reviewing the M6.5 plan
(`docs/superpowers/plans/2026-06-10-trellis-m6.5-pygame.md`, decision D2 / ambiguity A1).

## The conflict

`TECHNICAL_DESIGN.md` §17.3/§17.6 show the locked preamble doing an **unconditional**
`from js import window` (to read `window.gameGen`). But §17.1's own rule — *grading never
happens on the main thread; the same source is re-run headlessly in the worker* — collides
with the merged escalation-3 hardening (Stream J, 2026-06-09): **the worker's js-FFI import
surface is deliberately blocked for learner-run code.** The literal §17 preamble would die
with an ImportError on every headless grading run.

## The decision

The locked preamble is authored **environment-aware**, gated on `TRELLIS_HEADLESS=1` (set by
the grading wrapper's one-line prefix, which also sets the SDL dummy drivers):

- Play (main thread): `from js import window`, keyboard scoping, `gameGen` capture, the
  async loop — exactly §17.3.
- Grade (worker): no `js` import, no loop start; the appended `__trellis_sim` harness calls
  the learner's entrypoints directly.

Rejected alternative: shimming a fake `js` module into the worker — it would re-open the
escalation-3 attack surface review for zero benefit.

## Why this is safe

- The preamble is **locked** (`lockedRegions`, §17.6) — learners cannot edit the gate.
- The worker sandbox's js-FFI blocklist stays fully armed; nothing is whitelisted.
- Determinism is unaffected: the headless path never touches `window`/real time/live input.
- §17's load-bearing properties all survive: single source plays AND grades; grading stays
  force-killable in the worker; play stays cooperative via `gameGen`.

## Consequences

- `TRELLIS_HEADLESS` joins the runtime/grader contract: the grading wrapper MUST set it; the
  main-thread runtime MUST NOT.
- Future pygame **content authoring** (the content track) inherits the preamble as given —
  authors never write the gate themselves; the authoring scaffold supplies it.
- `TECHNICAL_DESIGN.md` §17.3/§17.6 are amended by this note (do not re-literalize the
  unguarded preamble from the design text).
