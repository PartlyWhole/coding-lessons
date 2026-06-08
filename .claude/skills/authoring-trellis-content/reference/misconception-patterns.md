# Misconception signatures, AST recipes, and fixtures (P2 / P7)

A misconception is real only if its `signature` is **deterministically detectable** (§7). This file
gives vetted signature recipes, the AST query language, the syntax-error gap, and the fixture shape
the §13.2.5 gate requires. When a recipe's exact matcher semantics are uncertain, the **fixtures are
the source of truth** — the compiler runs them through the real detector, so a wrong query fails the
build rather than shipping silently.

## Signature grammar (§7)
```ts
type Signature =
  | { astTag: string }                          // an AstConfig query matched
  | { runError: "syntax" | "runtime" }
  | { testFailure: { caseIndex?: number; gotEquals?: Json } }
  | { propertyFailed: true }
  | { choice: string }                          // recognize: a distractor was chosen
  | { recallEquals: string }                    // recall: a specific wrong input
  | { all: Signature[] } | { any: Signature[] } | { not: Signature };
```
Matching is first-match-wins within a skill; AST/structural signatures rank above run/test errors
(specificity). So prefer an `astTag` (or `all:[astTag, testFailure]`) over a bare `testFailure` when
you can — it is more diagnostic and wins ties.

## AstQuery language (§6.3)
```ts
type AstQuery =
  | { node: string; where?: AstPred; within?: AstQuery; count?: {op:"="|">="|"<="; n:number} }
  | { not: AstQuery } | { all: AstQuery[] } | { any: AstQuery[] };
type AstPred =
  | { attr: string; eq: Json }   // attribute equals a literal
  | { calls: string }            // a Call to a named function, e.g. "print"
  | { usesName: string }         // references an identifier
  | { childMatches: AstQuery };  // some descendant matches
```
`node` is a Python `ast` node type: `Call`, `BinOp`, `Compare`, `For`, `While`, `If`, `Return`,
`Constant`, `Name`, `Assign`, … Matching is linear in AST size.

### Vetted recipes
```yaml
# Omitted a required call (e.g. never calls print)
missing_print:        { not: { node: Call, where: { calls: print } } }

# Hardcoded the expected output instead of computing it
hardcoded_output:
  node: Return
  where: { childMatches: { node: Constant, where: { attr: value, eq: "Hello, World!" } } }

# Returned a specific constant literal (e.g. the example value)
returns_example_literal:
  node: Constant
  where: { attr: value, eq: 7 }
  within: { node: Return }

# Used a loop where recursion was required (no self-call inside the loop)
loop_instead_of_recursion:
  all: [ { node: For }, { not: { node: Call, where: { calls: "$self" } } } ]

# Reads no keyboard input (game step: never references any K_* constant)
reads_no_input:       { not: { usesName: K_LEFT } }   # repeat in an `any` for each key you accept
```

**`count` scoping is unpinned.** Whether `count` counts matches across the whole submission or within
a containing scope is not guaranteed by the design. Don't rely on a bare `count` query alone — pair it
with a behavioral signal (e.g. `{ all: [ { astTag: two_ifs_no_else }, { testFailure: {...} } ] }`) and
let the fixtures prove the reading before you trust it.

### Operator-shaped checks (`>` vs `>=`, `is` vs `==`) — handle with care
The `Compare` node stores its operators in a **list** (`ops`). Whether `{attr: ops, eq: [...]}`
matches by operator class-name, and the exact list encoding, is **not pinned down in the design** —
do **not** guess and ship. Two safe options:
1. **Prefer the behavioral signal.** A `>` where `>=` was needed *fails the boundary test case*. Make
   the signature `{ all: [ { astTag: strict_gt }, { testFailure: { caseIndex: 0 } } ] }` where
   `caseIndex: 0` is the boundary case — the test failure carries the detection and the tag only
   corroborates. If the tag turns out non-matching, the fixture gate tells you and you fall back to
   the bare `testFailure`.
2. **Confirm the tag with fixtures.** Write the `strict_gt` query in the form you believe correct and
   let `triggers`/`notTriggers` prove it against the real `ast` walker before relying on it.

## The SyntaxError gap (critical)
A Python `SyntaxError` — `if x = 10:`, `=>` / `=<`, `;` instead of `:`, `{ }` blocks — **cannot be
AST-attributed.** `ast.parse` throws before producing a tree, so there is no `astTag` to match; the
only build-step signal is `{ runError: "syntax" }`, which yields the generic `syntax` attribution
(§8) and the skill's *generic* hint ladder — not targeted feedback.

**To give targeted feedback for a syntax-shaped misconception, detect it at a `recognize`/`recall`
step**, where you control the input space:
```yaml
# = instead of ==  → catch it as a recognize distractor, not via build AST
- id: mis.cond.assign_in_condition
  skill: skill.cond.compare_eq
  signature: { choice: b }            # the "if x = 10:" choice
  ...
# ; instead of :   → catch it via recall misconceptionMap / recallEquals
- id: mis.cond.semicolon_for_colon
  signature: { recallEquals: ";" }
```
You may *also* keep a `{ runError: syntax }` misconception as a coarse backstop on the build step, but
do not expect it to distinguish *which* syntax mistake was made.

## Fixture shape (§13.2.5) — REQUIRED on every misconception
The compiler replays these through the real detector and asserts the signature fires for every
`triggers` sample and fires for **none** of the `notTriggers` samples. This is the highest-value
gate — it makes authored detection self-testing. Shape:
```yaml
triggers:
  - { stepKind: build,     code: "def grade(s):\n    if s > 60:\n        return 'pass'\n    return 'fail'" }
  - { stepKind: recognize, choice: b }
  - { stepKind: recall,    input: ";" }
notTriggers:
  - { stepKind: build,     code: "def grade(s):\n    if s >= 60:\n        return 'pass'\n    return 'fail'" }
  - { stepKind: recognize, choice: a }
```
Rules:
- Provide **at least one** `triggers` and **at least one** `notTriggers` per misconception.
- `build` samples are full submissions run through run→test→ast→property; the resulting `RawSignals`
  are fed to the signature.
- Field keys per step kind: `build` → `code`; `recognize` → `choice` (the engine reads it as
  `chosenChoiceId`); `recall` → `input` (read as `recallInput`). Use these exact YAML keys.
- The `notTriggers` for a misconception should include the *correct* answer and, ideally, a
  *different wrong* answer that a sibling misconception owns — proving the signatures don't overlap.

**TRACE every fixture; do not eyeball it.** A fixture is executable — write each sample only after you
have mentally run (or actually run) it through the signature. The trap that caught a tester: a
`notTriggers` build sample (`if score >= 70`) that *secretly fails the boundary test case* will fire a
signature keyed on `{ testFailure: { caseIndex: 0 } }` — so the sample meant to *not* trigger does
trigger, and gate §13.2.5 fails. For every `build` sample, confirm what `tests`/`ast`/`property`
actually produce for it; for a `notTriggers`, the correct answer must pass cleanly.
