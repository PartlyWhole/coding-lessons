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

## 1. No field-scoped predicates (the load-bearing gap) — ✅ RESOLVED (2026-06-08)

`AstQuery`/`AstPred` could match a node type and walk *all* descendants (`childMatches`) or *any*
ancestor (`within`), but could not target a **specific child field** (`While.test`, `If.orelse`,
`Call.func`, `Assign.targets`). Two shipped queries were therefore approximations:

- **`content/nodes/conditionals.yaml` — `has_elif`** was `{ node: If, within: { node: If } }`.
  In CPython an `elif` is a nested `If` in the outer `If`'s **`orelse`**. That query couldn't say
  "in `orelse`," so it *also* matched a legitimately nested `if` in a branch **body**. Over-matched.
- **`content/nodes/loops.yaml` — `infinite_true_no_break`** was `{ While, where: { childMatches:
  { Constant, where: { attr: value, eq: true } } } }`. The intent is "the `While`'s **test** is
  literally `True`," but `childMatches` matched a stray `True` *anywhere* under the loop
  (e.g. `while running: if found == True: ...`). Over-matched.

**Resolution:** the **`field` selector was added to `AstQuery`** (schema `e125a99`) and **both corpus
queries migrated** to it:
- `has_elif` → `{ node: If, field: { orelse: { node: If } } }`
- `infinite_true_no_break` → `{ node: While, field: { test: { node: Constant, where: { attr: value, eq: true } } } }`

`content/verify/harness.py` now implements §6.3 rule 1 (field-scoped matching: the named child field's
subtree must contain a match). Verified: the field forms match the real construct and reject the exact
over-matches the old forms allowed (a plain nested `if` in a branch body; a `True` in the loop body) —
gate 5 stays green on all 21 fixtures, including the `no_update` notTrigger that the over-matching
`infinite_true_no_break` would have wrongly caught. M1's TS matcher supports the same form; the M1
rebase differential is the final cross-check.

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

## 5. No `timedOut` primitive in `Signature` (§7) — ✅ primitive ADDED; ⚠️ corpus deliberately keeps AST as the detector

A genuine infinite loop's **robust, deterministic** signal is the worker watchdog timeout (§6.1,
§17.5). `Signature` originally offered only `runError: "syntax" | "runtime"`, so `mis.loop.infinite_true`
had to lean on the AST shape. **`{ timedOut: true }` was added to the `Signature` union and
`RawSignals.timedOut` is surfaced** (schema `e125a99`), so the primitive now *exists*.

**Decision (2026-06-08): `mis.loop.infinite_true` is NOT re-keyed onto `{ timedOut: true }`; it keeps
the (now field-scoped, gap 1) AST shape as its detector, with the watchdog timeout as the product
backstop.** Reason — `timedOut` is **ambiguous across infinite-loop misconceptions**: a `while True:`
with no break AND a never-updating `while cond:` (the `mis.loop.no_update` case) *both* hang and both
set `timedOut`. The real engine disambiguates via §7 detection **precedence** (specificity-ranked
first-match-wins), but the offline differential harness (`content/verify/harness.py`, gate 5) tests
each signature **in isolation**, so a bare `{ timedOut: true }` on `infinite_true` would wrongly fire
on the `no_update` notTrigger. Conversely the realistic input-reading `infinite_true` trigger EOFs
under finite scripted stdin and never times out offline, so `{ all: [timedOut, astTag] }` would fail to
fire there. Net: the **field-scoped AST shape is the correct offline-testable detector**; the runtime
timeout stays the product backstop, resolved by §7 precedence in the live engine — not by the content
signature.

**▶ M4 ACTION ITEM (scheduled, not dropped).** Re-key `mis.loop.infinite_true` onto the runtime fact
once M4 stands up the real sandbox + live `detect()` precedence (§13.2 gates 5–7 on the real detector):
add `{ timedOut: true }` as the primary `any` branch (AST shape as corroboration), and verify it
**end-to-end** against a genuinely non-terminating submission that the real Pyodide watchdog kills —
where §7 precedence (structural `no_update` outranks a bare runtime timeout) correctly disambiguates,
exactly the discrimination the offline isolated-signature harness cannot reproduce. Do NOT add it to the
content signature before then: in the offline harness it is untestable-or-wrong (see above), and it
changes detection on the current corpus by exactly zero. Owner: M4 stream. Cross-ref: ORCHESTRATOR-HANDOFF §7.

**▶ STATUS UPDATE (2026-06-09, M4 integrated `406b069`).** M4 (Stream E) BUILT the prerequisite — the
engine's §7 match-aware `detect` precedence (`matchedSpecificity`: the branch that actually fired ranks the
match), proven in `engine/test/detect-precedence.test.ts` (10 tests): a re-keyed `infinite_true` with a
`{timedOut:true}` branch correctly LOSES to structural `no_update` on a never-updating loop and WINS on a
true `while True:`. That machinery is on `main` and the 21-fixture differential is unchanged (backward-compatible).
**The content re-key itself remains HELD** — orchestrator decision, upholding this note's own requirement.
M4 was verified against the **local-CPython twin only (no network)**; this note demands the re-key be
verified end-to-end against the **real Pyodide watchdog**, and applying it offline would force exactly the
papering-over the §4.1 runbook forbids (the isolated-signature harness over-matches `infinite_true`'s
`no_update`-shaped notTrigger, which times out). **The re-key is therefore reassigned from "M4 stream" to
the networked-browser verification session** (real Pyodide present): apply `{ timedOut: true }` to
`content/skills/loops.taxonomy.yaml`, decide whether to teach `harness.py` precedence vs. carve out the
precedence-resolved case, and verify end-to-end against a watchdog-killed non-terminating submission. The
engine side is ready and waiting; zero corpus-detection change in the interim.

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
