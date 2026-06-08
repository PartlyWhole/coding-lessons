# The step ladder (P5)

A cell takes a learner from "lacks the atom" to "certified" by walking an ordered sequence of steps.
The ladder is a micro-ascent: install → provoke → consolidate → certify. Not every cell needs every
rung, but the *order* is fixed when present, and the guiding rule is **motivation precedes
mechanism** — the learner should feel the *need* for an idea before being shown how it works.

## The five rungs

### `watch` — install the idea
Plainly state the fundamental. No evaluation. This is the expert speaking. Keep it to the one idea
the cell is about. Use `carryContext` to mark what must survive into later steps' peek-back (§5.3) —
e.g. a `watch` that installs "strings are text in quotes" sets `carryContext` so it reappears during
a later `build`.

### `predict` — provoke the fault-line (highest-value rung)
Show a snippet whose effect is hidden; ask the learner to commit a prediction; then **always**
run-and-reveal (`reveal: "run-and-show"`). The wrong-predict-then-correct-run sequence is the most
valuable telemetry signal in the system (§11.3). **Design the snippet so the tempting wrong
prediction maps to a known misconception** — wire it through a `choice` distractor carrying the
`misconception` id, or through `expected.misconceptionMap` for free-text. This is where the learner
discovers the need ("wait, why did that error?") just before the mechanism is taught.

### `recognize` / `recall` — consolidate, and catch syntax-shaped errors
Low-stakes practice. **This is the only place you can reliably detect misconceptions that manifest as
Python `SyntaxError`** (e.g. `if x = 10:`, `=>` operator, `;` for `:`), because the build-step AST
layer can't see them — `ast.parse` throws before producing a tree. Put those misconceptions here:
- `recognize`: distractor `Choice`s each carry a `misconception` id.
- `recall`: `accepted.misconceptionMap` maps a wrong normalized input to a misconception.

### `build` — certify by recomposing the goal
The learner writes code that achieves the P0 goal. Author the evaluator ladder run→test→ast→property:

1. **run** — `timeoutMs`/`memoryMb`, and `entrypoint` (the function the tests call). Omit
   `entrypoint` for top-level programs graded on stdout.
2. **tests** — concrete cases. **Include boundary cases** (the off-by-one trap) and at least one
   `hidden: true` case. Pick the `comparator` deliberately (`deep-equal` default; `float-close` for
   numerics; `set-equal` for order-insensitive).
3. **ast** — named `queries` whose `tag` your misconception signatures consume. AST tags never fail a
   passing solution; they only attribute failing ones (or trigger opt-in style feedback).
4. **property** — **almost always include this.** A reference-impl `referenceImpl` is the oracle that
   lets correct-but-unanticipated solutions pass (an f-string vs `str()` both work). Generators bound
   the input domain; `seed` makes it reproducible. Without a property/oracle, a fixed test set
   silently rejects valid alternative solutions and misses bugs a fixed start would miss
   ("forgot to clamp at the boundary").

Use `acceptedVariants` to bless a structural form you don't want flagged (e.g. a guard-clause with
two `return`s and no literal `else`, or a list comprehension).

## Worked ladder (the build rung, string-concat)
```yaml
- kind: build
  language: python
  prompt: "Print 'age: 7' using the variable age."
  starterCode: "age = 7\n# print here\n"
  evaluator:
    run:   { timeoutMs: 2000, memoryMb: 256 }
    tests: { cases: [ { input: null, expected: "age: 7\n" } ] }
    ast:
      queries:
        - { tag: implicit_coerce,
            query: { node: BinOp,
                     where: { childMatches: { node: Constant, where: { attr: value, eq: 7 } } } } }
    property:
      referenceImpl: "def sol(age): return f'age: {age}'"
      generators: [ { param: age, type: int, min: 0, max: 999 } ]
      numCases: 50
      seed: 1234
```

## Worked `predict` rung (free-text + MC)
`predict` grades **the learner's prediction text** (not the program output) with the same
normalized/pattern logic as `recall`; then it runs the code and reveals the real result regardless.
So `expected` is what the learner should *predict*.
```yaml
- kind: predict
  prompt: "score is 40. What does this print?"
  code: |
    score = 40
    if score >= 50:
        print("pass")
    else:
        print("fail")
  choices:                              # omit for pure free-text
    - { id: a, label: "fail" }
    - { id: b, label: "pass" }
    - { id: c, label: "pass\nfail", misconception: mis.cond.both_branches_run }  # the "both run" trap
  expected: { normalized: ["fail"] }    # the correct prediction
  reveal: run-and-show
```

## Choosing rungs
- A pure-concept lesson with a predictable trap → `watch` + `predict` + `build`.
- A lesson dominated by syntax-shaped errors → add `recognize`/`recall` to catch them.
- A purely expressive task ("draw something you like", §17.4) → `build` with no `tests`/`property`,
  run-only + style/AST feedback, never a pass/fail on output.
