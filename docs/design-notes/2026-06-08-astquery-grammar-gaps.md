# Design note — `AstQuery`/`Signature` grammar gaps (§6.3, §7)

**Status:** Findings for the schema/engine owners · **Date:** 2026-06-08
**Source:** surfaced by authoring + machine-verifying the beginner-Python content bundle
(`content/`), and by building a faithful §6.3 query interpreter (`content/verify/harness.py`).

Authoring real misconception detectors against §6.3 stressed the query/signature grammar and
exposed concrete under-specifications. Each is listed with the **exact shipped query/signature that
depends on it** and a proposed resolution. None blocks v1 content (the bundle routes around them and
passes its fixture gate under the *natural* reading of the grammar), but each is a place where the
**real matcher's behavior is currently a coin-flip the spec doesn't decide** — so pinning them before
M1/M3 prevents silently-wrong detectors in the field.

---

## 1. No field-scoped predicates (the load-bearing gap)

`AstQuery`/`AstPred` can match a node type and walk *all* descendants (`childMatches`) or *any*
ancestor (`within`), but cannot target a **specific child field** (`While.test`, `If.orelse`,
`Call.func`, `Assign.targets`). Two shipped queries are therefore approximations:

- **`content/nodes/conditionals.yaml` — `has_elif`** = `{ node: If, within: { node: If } }`.
  In CPython an `elif` is a nested `If` in the outer `If`'s **`orelse`**. This query can't say
  "in `orelse`," so it *also* matches a legitimately nested `if` in a branch **body**. Over-matches.
- **`content/nodes/loops.yaml` — `infinite_true_no_break`** = `{ While, where: { childMatches:
  { Constant, where: { attr: value, eq: true } } } }`. The intent is "the `While`'s **test** is
  literally `True`," but `childMatches` matches a stray `True` *anywhere* under the loop
  (e.g. `while running: if found == True: ...`). Over-matches.

**Proposed:** add a field selector, e.g.
`{ node: "While", field: { test: { node: "Constant", where: { attr: "value", eq: true } } } }`,
or an `inField: <name>` qualifier on `within`/`childMatches`. This is the single highest-value
addition — it converts both queries above from heuristics into exact detectors.

## 2. `not`/`all`/`any` live only at `AstQuery` level, not in `AstPred`

The natural authoring instinct is `where: { not: { childMatches: ... } }` — and we **wrote exactly
that** in an early `while_cond_no_update` (now fixed to `{ all: [ {node: While}, { not: {node:
Assign, within: {node: While}} } ] }`). Per §6.3, `AstPred` is only `{attr,eq} | {calls} |
{usesName} | {childMatches}` — combinators are not allowed inside `where`. A naive matcher that
ignores unknown `where` keys returns *true by default*, so the bug **passes silently** (it did, until
the verification harness caught it).

**Proposed:** the compiler MUST **reject** a `where` clause containing `not`/`all`/`any` with a clear
error, rather than silently accepting it. (Keep `AstPred` minimal; fail loudly on misuse.)

## 3. `within` / `childMatches` / `not` scoping is unstated

Is `within` satisfied by *any* ancestor or only the direct parent? Is `childMatches` *any*
descendant or a direct child? Is `not: {X}` evaluated over the whole submission or the current
subtree? The harness implemented the **natural reading** (any ancestor / any descendant / global
`not`), and the bundle's fixtures pass under it — but the spec should state it. The shipped
`while_cond_no_update` and `infinite_true_no_break` both depend on the global-`not` reading
(`not: {Break}` = "no `break` anywhere").

**Proposed:** specify, in §6.3, that `within`/`childMatches` are transitive (any ancestor/descendant)
and `not` is scoped to the query's current root, with the whole submission as the top-level root.

## 4. `count` scoping unstated

`count` ("= / >= / <= n matches") doesn't say whether it counts across the whole submission or within
a containing scope. **Not used in the shipped bundle** (authors avoided it on this advice), but pin it
before authors rely on it.

## 5. No `timedOut` primitive in `Signature` (§7) — the right infinite-loop signal is unspeakable

A genuine infinite loop's **robust, deterministic** signal is the worker watchdog timeout (§6.1,
§17.5). But `Signature` offers only `runError: "syntax" | "runtime"` — there is no way to key a
misconception on "it didn't terminate." So `mis.loop.infinite_true` must lean on the fragile AST
shape (gap 1) instead of the defined runtime fact. (In headless grading with finite scripted stdin
the loop happens to surface as a runtime `EOFError`, but that's incidental, not guaranteed.)

**Proposed:** add `{ timedOut: true }` to the `Signature` union and surface `RawSignals.timedOut`
(it already exists on `RunResult` as `timedOut`). Then infinite-loop misconceptions key on the
timeout, with the AST shape as corroboration — robust regardless of gap 1.

## 6. `Compare.ops` (list-valued attribute) matching is unspecified

How does `{ attr: "ops", eq: [...] }` match a `Compare` node whose `ops` is a *list* of operator
nodes — by operator class-name? by order? **Not relied on in the shipped bundle** (the `>`/`>=`,
`=`/`==`, `is`/`==` distinctions were all routed to `recognize`/`recall`, since these are also
SyntaxError-shaped for `=`), but a future "off-by-one operator" lesson will need it.

**Proposed:** specify that operator attributes match by class-name list (e.g. `["Gt"]`,
`["LtE"]`), and add a fixture to the matcher's own test suite.

---

## Authoring lesson (not a grammar gap — folded back into the skill instead)

The fixture harness also caught two signatures (`infinite_true`, `no_update`) that wired a
`recognize` distractor to a misconception in the **node** but forgot the matching `{ choice: … }`
branch in the **signature**, so the recognize path could never fire. That's an authoring oversight,
not a spec gap; the fix is a reminder in the authoring skill that a distractor's `misconception:`
link and the misconception's `signature` must agree. (Tracked as a skill improvement, gated on a
failing-test per the writing-skills discipline — not edited blindly here.)

## What this note is grounded in

- `content/verify/harness.py` — runs every misconception's `triggers`/`notTriggers` and every
  `referenceImpl` oracle through real CPython + a faithful §6.3 interpreter; **all 21 pass** under
  the natural grammar reading documented above.
- `content/validate.py` — bundle-level §13.2 gates 1–4 (schema-shape, referential integrity,
  DAG + upstream acyclicity, granularity, certifies/teaches closure); **PASS**.
- Not yet run: validation against the real `@trellis/schema` TypeBox types (gate 1, full) — that
  package does not export its schemas yet; this should run once it does.
