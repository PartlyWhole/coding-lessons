# Verification gates (P7)

Self-run all of these before declaring content done. The first seven mirror the §13.2 CI gates (the
compiler enforces them; you pre-flight them). The eighth is the pedagogical pass the compiler can't
check. Treat any failure as a return to the relevant phase, not a patch-in-place.

## The §13.2 gates

1. **Schema validity** — every entity matches its §3 type. Required fields present; enums correct
   (`track`, `kind`, `StepKind`, `comparator`, `SkillDelta.kind`).

2. **Referential integrity** — every `skill` / `misconception` / `cell` id resolves. **Every skill in
   a node's `requires` has a producer** — some node in this bundle `teaches` it (or it is genuinely
   taught by an already-existing upstream node). No dangling ids. *(This is the #1 baseline failure —
   check it at P3 and again here.)*

3. **Graph is a DAG** — the induced skill-dependency graph (§4.2) has no cycle; the spine is a single
   connected chain; every `extension` node `requires` exactly one `kind:"track"` edge to its parent.
   The same acyclicity check runs over `Skill.upstream`.

4. **Granularity lint** — every skill has ≥1 certifying step and ≥1 misconception; warn at >6
   misconceptions. (A skill with 0 misconceptions should have been merged at P2.)

5. **Misconception fixtures** — every misconception ships `triggers:` and `notTriggers:` samples; each
   `triggers` sample makes the signature fire, each `notTriggers` sample makes it not fire, when run
   through the real detector. See `misconception-patterns.md` for the shape. **Highest-value gate.**

6. **Reference-impl agreement** — every `build` step's `property.referenceImpl` passes its own fixed
   `tests`. The oracle must itself be correct before it can judge learners.

7. **Golden Diagnosis snapshots** — for the marquee misconceptions, attach an example submission with
   its expected `attribution` + `misconceptionId`; re-grading must reproduce it. Catches content
   regressions.

## Pedagogical pass (not machine-checked)

8. For each cell, confirm:
   - **Prerequisite-closure:** every step rests only on skills the learner already holds (taught
     earlier in this cell, or satisfied by the node's `requires`). No step secretly assumes an
     untaught skill.
   - **Need-before-mechanism:** the learner is led to *want* each new idea (usually via a `predict`
     that surfaces the fault-line) before its mechanism is taught in a later step.
   - **Goal recomposition:** the final `build` actually certifies the P0 goal — not a fragment of it,
     not something larger.
   - **Feedback is selected, not generated:** every misconception path lands on pre-authored
     `feedback` + a 4-level ladder; nothing relies on prose being produced at runtime.

## Quick self-check (run mentally before committing)
- [ ] Did I start from a P0 goal sentence, not a node?
- [ ] Atom list + DAG exist, and every `requires` skill has a producer?
- [ ] Every misconception detectable (no SyntaxError-via-AST), each with triggers/notTriggers?
- [ ] Every build step has a reference-impl property oracle (unless purely expressive)?
- [ ] Final build recomposes the stated goal?
