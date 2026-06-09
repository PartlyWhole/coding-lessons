# Stream K — authoring lint gates 8 + 9 (escalation 6)

**Goal:** make the two real corpus bug classes (commits `0884bf3`, `d8f20b3`) impossible to author:

1. **Gate 8 `8-answerable`** (`src/gates/answerable.ts`): every choice-mode predict step must be
   answerable — at least one `choices[].id` must satisfy the engine's `matchesAccepted` against
   `step.expected`. Mirrors `packages/engine/src/diagnose.ts` `compareNonBuild` (predict with
   `choices` compares the chosen CHOICE ID).
2. **Gate 9 `9-correct-miscon`** (`src/gates/correct-choice-miscon.ts`): no misconception tag may
   sit on a correct answer:
   - recognize: no `misconception` on the choice whose id is `correctChoiceId`;
   - choice-mode predict: no `misconception` on any choice whose id matches `expected`
     (gate 8's matcher), and no `expected.misconceptionMap` key that matches `expected`;
   - text-mode analogue (cheap, included): recall `accepted.misconceptionMap` / text-mode
     predict `expected.misconceptionMap` keys that themselves match the accepted answers.
     Rationale: `directMisconception` is only consulted when `correct === false`, so such an
     entry is dead/contradictory authoring — same bug class.

**Placement justification:** numbered gates 8/9 (not lints) — they are error-level semantic
checks that mirror engine §8 matching, like gates 5–7 mirror grading; lints (`lint-*`) are
syntax/pattern hygiene. They are pure/structural (no exec), so they run unconditionally.

**Matcher mirror:** `src/gates/non-build-match.ts` — faithful copy of engine `normalize`
(trim/lowercase/collapse-ws; NOT `signature.ts norm`, which also strips a trailing period —
different §-semantics) + `matchesAccepted` using `re2js` (added to authoring deps, already in
the workspace lockfile via engine) for anchored full-match parity. Authoring deliberately does
not import `@trellis/engine`, so the mirror is local and commented with its source of truth.

**TDD:** tests first (`test/gates-answerable.test.ts`, `test/gates-correct-choice-miscon.test.ts`),
each gate mutation-tested by reproducing the exact historical bugs in fixtures:
- `0884bf3`: predict choices a/b/c with `expected.normalized: ["HiAlan"]` (no id) → gate 8 FAILS;
  with `["b", "HiAlan"]` → passes.
- `d8f20b3`: `join_text#2` shape with `misconception` on correct choice `b` → gate 9 FAILS;
  tag on `a` → passes.
- Both gates must pass on the real corpus (`content/`), proven via the existing
  corpus-loading test pattern and the CLI `lint` run.

**Out of scope / report items:** `content/validate.py` mirroring (orchestrator-owned — flagged
in report); any content edits (escalate instead).
