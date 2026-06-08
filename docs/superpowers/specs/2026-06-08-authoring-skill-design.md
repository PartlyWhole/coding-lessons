# Design Spec — `authoring-trellis-content` Skill

**Status:** Approved design, ready to build · **Date:** 2026-06-08
**Author:** Architecture · **Scope:** A reusable, invokable skill that authors Trellis content methodically

---

## 1. Purpose

Create a skill — not a one-off content dump — whose job is to **author Trellis content
methodically**. When invoked, it drives Claude (as autonomous author) through a first-principles
procedure that *discovers* a learner's pathway and emits content that conforms to the Trellis
schema (`TECHNICAL_DESIGN.md` §3) and passes the §13.2 CI gates.

The intellectual core is a **bidirectional vector**:

- **Descent ("unpiece"):** from the highest abstraction (e.g. Python, Game Development) and a
  concrete *goal*, decompose downward — along an **abstraction axis** (Python → conditionals →
  `if/else`) and a **composition axis** (goal → the fundamental elements that compose it) — until
  reaching **atoms**.
- **Ascent ("piece together"):** recompose atoms upward into the learner's pathway — nodes, cells,
  and the step ladder that installs then certifies each atom toward the goal.

We *discover* (not invent) the pathway: the dependency relationships are latent in the structure of
the knowledge itself. Two perspectives are held simultaneously — the **expert's map** (drives the
descent) and the **learner's experience** (drives the ascent) — and reconciled by verification.

This design fuses three candidate approaches:

- **A (descent/ascent)** — the spine, mirroring the bidirectional vector.
- **B (misconception-first / fault-lines)** — *how* the descent finds atoms: decompose along the
  fault-lines where a competent-but-naive learner's model predictably diverges.
- **C (schema-bottom-up / artifact discipline)** — *how* the ascent and verification stay
  schema-valid and CI-passing.

---

## 2. Audience and form

- **Audience:** Claude as autonomous author (executable procedure with self-checks and gates), but
  legible to a human author.
- **Form:** an invokable `SKILL.md` (superpowers format) **plus** a companion `methodology.md` for
  the deeper "why," plus reference files and templates.
- **Home:** Trellis project skill at `.claude/skills/authoring-trellis-content/`.

### Artifact layout

```
.claude/skills/authoring-trellis-content/
├── SKILL.md                      # invokable procedure: the 8 phases as ordered gates
├── methodology.md                # companion "why": descent/ascent, fault-lines, expert↔learner duality
├── reference/
│   ├── schema-cheatsheet.md      # condensed §3 types the author needs at hand
│   ├── step-ladder.md            # watch→predict→recognize→recall→build patterns + when each
│   ├── misconception-patterns.md # signature recipes (AstQuery / runError / distractor) + fixture format
│   └── verification-gates.md     # the §13.2 gates as a self-run checklist
└── templates/
    ├── node.yaml                 # node + cells + steps + evaluators skeleton
    └── skill.taxonomy.yaml       # skill + misconceptions + hint ladders skeleton
```

---

## 3. The methodology — 8 phases (descent → ascent → verify)

The duality is threaded through every phase: at each step ask both *"does the expert's map say this
is structurally true?"* (descent) and *"does the learner have what they need, and feel why they need
it?"* (ascent).

### Descent — the expert's map ("unpiece")

- **P0 · Frame the goal.** State the target capability in *learner-observable* terms and set the
  altitude. ("The learner can print a label that joins fixed text with a numeric variable.")
- **P1 · Descend two axes.** Refine along *abstraction* (Python → conditionals → `if/else`) and
  *composition* (goal → the elements it is built from), recursing until reaching **atoms**.
  Stop-condition = Trellis's granularity rule (§3.2): an atom is the smallest unit that is
  independently certifiable **and** carries ≥1 distinct misconception. *(B folded in:* while
  descending, probe "where does a naive learner's model diverge here?" — each fault-line is a
  candidate atom boundary.)
- **P2 · Fault-lines → Misconceptions.** For each atom, enumerate predictable failures; each must
  have a **deterministically detectable signature** (`astTag` / `runError` / `testFailure` /
  `choice` / `recallEquals`, §7). If it can't be detected, refine until it can. Atomicity check:
  0 misconceptions → merge the atom away; >6 → split it.
- **P3 · Discover the DAG.** Draw "needs-before" edges (A before B iff B cannot be *demonstrated*
  without already wielding A), classify each `kind` (prerequisite / utility / track). Edges are
  *discovered* from the structure, never imposed. The induced skill-dependency graph must be acyclic
  (§4.2).

### Ascent — the learner's pathway ("piece together")

- **P4 · Atoms → ConceptNodes.** Group atoms into nodes (skills certified together as one coherent
  capability), assign track (spine vs extension), order by the DAG, wire `requires`/`teaches`.
- **P5 · Nodes → Cells + the step ladder.** Per cell, sequence: `watch` (install the idea, set
  `carryContext`) → `predict` (provoke the misconception, then run-and-reveal — the §11 high-value
  signal) → `recognize`/`recall` (consolidate; distractors carry misconception ids) → `build`
  (certify by composing toward the goal; author the run→test→ast→property evaluator with a
  reference-impl oracle so correct-but-unanticipated solutions pass).
- **P6 · Feedback + hint ladders.** Per misconception: pre-authored `feedback` + 4-level ladder
  (nudge → sharper → worked → solution), `skillDeltas`, and `upstream` root-cause targeting.

### Reconcile

- **P7 · Verify.** Self-run the §13.2 gates — schema, referential integrity, DAG/spine/extension
  edge, granularity lint (1–6 misconceptions, ≥1 certifying step), **misconception fixtures**
  (`triggers:`/`notTriggers:` run through the real detector), reference-impl agreement, golden
  Diagnosis snapshots — **plus** a pedagogical pass: every step rests only on satisfied
  prerequisites, and the learner *discovers the need* for each atom (motivation precedes mechanism)
  before the final `build` recomposes the goal.

---

## 4. Phase → Trellis artifact mapping

| Phase | Produces | Schema (§) |
|---|---|---|
| P0 goal | altitude + capability statement | — |
| P1 descend | atoms | `Skill` (§3.2) |
| P2 fault-lines | misconceptions + signatures | `Misconception`, `Signature` (§3.5, §7) |
| P3 DAG | dependency edges | `Requirement`, `Skill.upstream` (§3.3) |
| P4 ascend | nodes | `ConceptNode` (§3.3) |
| P5 cells/ladder | cells, steps, evaluators | `Cell`, `Step`, `EvaluatorConfig` (§3.4, §3.6) |
| P6 feedback | feedback + hint ladders | `Hint`, `SkillDelta` (§3.5) |
| P7 verify | passing bundle | §13.2 gates |

---

## 5. Canonical worked example (embedded in the skill)

The skill carries the **Output → Variables spine + string-concat extension** (§16) as its worked
example, so the method is concrete and the templates are real. Atoms the method discovers:

- **node.output** (spine root) — `skill.output.print_literal`.
  Misconceptions: `mis.print.no_call` (writes `'Hello'` with no `print`),
  `mis.print.unquoted` (NameError — text without quotes).
- **node.variables** (spine) — `skill.var.assign`, `skill.var.use`.
  Misconceptions: `mis.var.assign_reversed` (`7 = age`), `mis.var.use_quoted`
  (`print("age")` prints the name), `mis.var.undefined` (use-before-assign → NameError).
- **node.string_concat** (extension, the multi-prereq node that proves gating) —
  `skill.string.literal`, `skill.string.concat_str_num`; `requires` var.assign + string.literal +
  var.use. Marquee misconception: `mis.concat.implicit_coercion` (`'age: ' + 7` → TypeError),
  matching the design's worked example (§13.1).

Content shape is YAML per §13.1 (`content/nodes/*.yaml`, `content/skills/*.taxonomy.yaml`) with
`triggers:`/`notTriggers:` fixtures and golden submissions so a slice authored by the skill would
pass the P7/§13.2 gates.

---

## 6. Success criteria

1. `SKILL.md` has correct frontmatter (`name`, `description` with explicit trigger conditions) and
   walks P0–P7 as ordered, checkable gates.
2. The companion + reference files give Claude everything needed to author without re-reading the
   full 1,700-line design each time (schema cheatsheet, step-ladder patterns, signature recipes,
   gate checklist).
3. The worked example is schema-shaped and would survive the §13.2 gates (in particular every
   misconception has a detectable signature and a `triggers`/`notTriggers` fixture).
4. The skill is self-contained and re-runnable on any new domain/goal, not just the proving slice.

---

## 7. Out of scope

- Building the actual `@trellis/authoring` compiler/validator (separate milestone, M1).
- A web authoring GUI (§13.3 v2).
- Authoring content beyond the proving slice (the skill enables it; this pass demonstrates it).
