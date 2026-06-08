# Authoring brief — Beginner Python arc (descent output, P0–P3)

This is the shared, authoritative descent for the beginner-Python curriculum. It was produced by
following `.claude/skills/authoring-trellis-content/SKILL.md` phases P0–P3. Node-authors: treat the
skill ids, misconception ids, and DAG below as FIXED — do not invent new skill ids or change edges.
Author the cells/steps/evaluators (P4–P6) and the taxonomy for the skills YOUR node owns, then
self-run P7 (`reference/verification-gates.md`).

## P0 · Goals (learner-observable)

Top capstone: *the learner can build a small interactive program that talks to the user, makes
decisions, and repeats — culminating in a number-guessing game.* Each node has a sub-goal:

- **output:** print text to the screen.
- **string_concat:** join pieces of text (and text + a number) into one message.
- **variables:** store a value in a named box and reuse it.
- **input:** read what the user types, store it, and use it in a reply (a conversation bot).
- **random:** get a random number.
- **conditionals:** make the program choose a response based on a value (a Magic-8 Ball).
- **loops:** repeat until the user wins (the guessing game).

## P1 · Atom catalogue (→ Skill ids), grouped by the node that OWNS (teaches) them

| Node (file) | track | Skills it teaches |
|---|---|---|
| `output` | spine (root) | `skill.output.print_literal`, `skill.string.literal` |
| `string_concat` | spine | `skill.string.concat`, `skill.string.concat_str_num` |
| `variables` | spine | `skill.var.assign`, `skill.var.use` |
| `input` | spine | `skill.input.read`, `skill.input.store`, `skill.type.int_input` |
| `random` | extension | `skill.random.randint` |
| `conditionals` | spine | `skill.bool.compare`, `skill.cond.if_else`, `skill.cond.elif_chain` |
| `loops` | spine | `skill.loop.while`, `skill.loop.termination` |

Skill one-liners (use as `description`):
- `print_literal` — call `print(...)` on a string literal to display text.
- `string.literal` — text in quotes; spaces/dashes/symbols are characters.
- `string.concat` — join string literals with `+`; spacing must be inside the quotes.
- `string.concat_str_num` — joining text and a number needs conversion (`str()` / f-string); `+` won't coerce.
- `var.assign` — store a value in a named box: `name = value` (name left, value right).
- `var.use` — use a variable's stored value (unquoted name = the value; quoted = literal text).
- `input.read` — `input("prompt")` reads a line the user types.
- `input.store` — capture `input()`'s result in a variable so it can be reused.
- `type.int_input` — `input()` returns a string; convert with `int()` before number comparison/math.
- `random.randint` — `import random`; `random.randint(a, b)` returns a random int in `[a, b]` inclusive.
- `bool.compare` — compare values with `==`, `!=`, `<`, `>` to get True/False.
- `cond.if_else` — run exactly one of two blocks (colon + indentation; branches are mutually exclusive).
- `cond.elif_chain` — chain conditions with `elif`; checked top-down, first true wins, `else` is the fallback.
- `loop.while` — repeat an indented block while a condition stays True.
- `loop.termination` — make a loop end: a `break`, or a condition that becomes False (avoid the infinite loop).

## P2 · Misconceptions (FIXED ids + detection signature). SyntaxError-shaped ones are detected at recognize/recall, NOT build-step AST.

**output**
- `mis.print.no_call` — wrote the text but never called `print` → output mismatch / AST `{not:{node:Call,where:{calls:print}}}`.
- `mis.print.unquoted` — text without quotes → `runError: runtime` (NameError). (Pure syntax-ish; also offer a recognize distractor.)

**string_concat**
- `mis.concat.missing_space` — `"Hi"+name` → "HiAlan"; spacing left out of the quotes → behavioral `testFailure` on the spaced expected output.
- `mis.concat.plus_in_quotes` — put `+` inside the quotes so it's literal text → behavioral `testFailure`.
- `mis.concat.str_num` — `"n: " + 7` → `runError: runtime` (TypeError) OR AST `implicit_coerce` (BinOp joining a string Constant and a numeric Constant/Name). The marquee one.

**variables**
- `mis.var.assign_reversed` — `"Alan" = name` / `7 = x` → SyntaxError → detect at **recognize**.
- `mis.var.use_quoted` — `print("name")` prints the word, not the value → behavioral `testFailure` / AST (print of a Constant equal to the var name).
- `mis.var.undefined` — used a name before assigning → `runError: runtime` (NameError).

**input**
- `mis.input.not_stored` — called `input("...")` without assigning the result → AST (a bare `Expr` Call to `input`, not `within` an `Assign`).
- `mis.type.int_input` — compared/added `input()` (a string) to a number without `int()` → `runError: runtime` (TypeError) on the comparison/addition.

**random**
- `mis.random.no_import` — used `random.randint` without `import random` → `runError: runtime` (NameError) / AST (uses name `random` but no `Import`).
- `mis.random.range_off_by_one` — used `randint(1, 99)` for a 1–100 range, etc. → behavioral via property oracle.

**conditionals**
- `mis.bool.assign_for_eq` — `if x = 1:` → SyntaxError → detect at **recognize**.
- `mis.bool.is_for_eq` — `if x is 1:` used for value equality → **recognize** distractor / AST `Compare` with `Is`.
- `mis.cond.no_colon` — missing `:` on the header → SyntaxError → **recall**/**recognize**.
- `mis.cond.both_branches` — believes both `if` and `else` run → **predict** distractor.
- `mis.elif.assign_in_elif` — `elif number = 2:` (the arc's bug) → SyntaxError → **recognize**.
- `mis.elif.order_overlap` — overlapping conditions ordered so an earlier branch shadows a later one → behavioral `testFailure`.

**loops**
- `mis.loop.infinite_true` — `while True:` with no `break` → AST (`While` whose test is Constant `True` and contains no `Break`) — primary; timeout is the backstop.
- `mis.loop.no_update` — loop variable never reassigned in the body so the condition never flips → AST (`While` test names a var that is not a target of any `Assign`/`input` inside the body).

## P3 · The DAG (FIXED `requires` per node; every required skill HAS a producer above — no dangling refs)

```
output            requires: []                                                   teaches: print_literal, string.literal
string_concat     requires: string.literal(prereq), print_literal(utility)       teaches: string.concat, string.concat_str_num
variables         requires: string.literal(prereq), print_literal(utility)       teaches: var.assign, var.use
input             requires: var.assign(prereq), string.concat(utility),          teaches: input.read, input.store, type.int_input
                            print_literal(utility)
random  (ext)     requires: var.assign(track→variables), print_literal(utility)  teaches: random.randint
conditionals      requires: var.use(prereq), bool.compare is taught HERE,        teaches: bool.compare, cond.if_else, cond.elif_chain
                            print_literal(utility), random.randint(utility)
loops             requires: cond.elif_chain(prereq), input.store(utility),       teaches: loop.while, loop.termination
                            type.int_input(utility), bool.compare(utility)
```

Notes:
- `minMastery` 0.6 for prerequisite/track, 0.5 for utility (convention for this bundle).
- `random` is an `extension`: it MUST carry exactly one `kind: track` edge (to `var.assign`/variables).
- Each node's `cells[].certifies` ⊆ that node's `teaches`.
- The capstone projects (Magic-8 Ball in `conditionals`, guessing game in `loops`) are the final
  `build` cells that recompose the node's goal — keep the `pygame`-free, headless, stdin-scripted
  grading in mind (input is read via stdin; for a graded build, drive it with `tests` cases that feed
  `input` from stdin and assert stdout, per §6.2).

## Authoring conventions (all nodes)
- Files: `content/nodes/<node>.yaml` and `content/skills/<node>.taxonomy.yaml`.
- Ladder per cell: `watch` → `predict` (provoke a fault-line, `reveal: run-and-show`) →
  `recognize`/`recall` (catch syntax-shaped misconceptions) → `build` (certify; include a
  `property` reference-impl oracle unless purely expressive).
- Every misconception: `feedback` + 4-level `hintLadder` + `skillDeltas` + `triggers`/`notTriggers`
  fixtures. TRACE every fixture (a `notTriggers` that secretly fails a test case will wrongly fire).
- Keep the playful voice of the source arc in `prompt`/`body` text (the computer "demands snacks",
  Magic-8 Ball, etc.) — it motivates the learner.
