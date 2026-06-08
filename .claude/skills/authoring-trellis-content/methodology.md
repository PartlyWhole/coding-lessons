# Methodology — Why descent/ascent works

This is the "why" behind `SKILL.md`. Read it once to internalize the method; the SKILL file is the
operational checklist.

## The bidirectional vector

Knowledge has structure. A goal like *"print a greeting that includes a number"* is not a monolith —
it is **composed** of smaller capabilities (a string literal, a variable, coercion, `print`), and
each of those sits at some **altitude** of abstraction (Python → expressions → string operations).
Two directions of movement matter:

- **Downward / "unpiece" (analysis).** Take the goal apart along two axes — abstraction (what is this
  a special case of? what refines it?) and composition (what must be simultaneously true for this to
  be achievable?). Keep going until the parts are **atomic**: small enough that they can't usefully
  be taught more finely.
- **Upward / "piece together" (synthesis).** Reassemble the atoms into a *path a learner can walk* —
  one where every step rests on what came before, and where the learner is led to feel the *need* for
  each new atom before being shown its mechanism.

You discover, you don't invent. The dependency relations ("you can't concatenate a string and a
number until you know what a string is") are facts about the material, not authorial preferences. A
good pathway is the one the structure already implies; a bad one fights it.

## The two perspectives, held at once

- **The expert's map** drives the descent. The expert sees the whole territory, knows the
  destination, and can name the true atoms and the real dependencies. Without the expert view you
  get gaps (a step that secretly assumes an untaught skill) and false atoms (units that aren't really
  separable).
- **The learner's experience** drives the ascent. The learner has no map. They hold one idea at a
  time, build up slowly, and go predictably wrong in specific ways. Without the learner view you get
  a technically-correct dependency graph that is unwalkable — accurate but unmotivated, with concepts
  introduced before the learner can see why they'd want them.

Every phase asks both questions: *"is this structurally true?"* (expert) and *"can the learner take
this step, and do they feel why?"* (learner). P7 is where the two are reconciled against the gates.

## Why misconceptions define the atoms

The decisive insight that makes the descent terminate cleanly: **decompose along misconception
fault-lines.** A skill is worth isolating exactly when a learner can go wrong *there* in a way no
other skill explains. So the question "is this an atom?" is the same as "does a competent-but-naive
learner predictably diverge here, detectably?" This is why Trellis defines a Skill (§3.2) as the
smallest unit that is independently certifiable **and** carries ≥1 distinct misconception:

- An atom with **no** detectable misconception isn't pedagogically real — there's nothing to diagnose,
  nothing to give feedback on, nothing to certify against failure. Merge it into a sibling.
- An atom with **too many** (>6) misconceptions is hiding several skills inside one name. Split it.

Misconceptions are where the learner's model and the expert's model diverge. Finding them *is*
finding the joints of the knowledge.

## How the method maps onto Trellis

| Movement | Phase | Trellis artifact |
|---|---|---|
| Frame the goal | P0 | the capability the final `build` certifies |
| Descend to atoms | P1 | `Skill` (§3.2) |
| Find fault-lines | P2 | `Misconception` + `Signature` (§3.5, §7) |
| Discover dependencies | P3 | `Requirement[]`, `Skill.upstream` (§3.3) |
| Group atoms | P4 | `ConceptNode` (§3.3) |
| Sequence the ladder | P5 | `Cell`, `Step`, `EvaluatorConfig` (§3.4, §3.6) |
| Author feedback | P6 | `Hint`, `feedback`, `SkillDelta` (§3.5) |
| Reconcile | P7 | §13.2 gates pass |

The **step ladder** (watch→predict→recognize→recall→build) is itself a micro-ascent: `watch` delivers
the fundamental, `predict` exposes the fault-line, `recognize`/`recall` consolidate, and `build`
recomposes the atom into a usable, goal-directed capability. A cell is the smallest place where
"unpiece then piece together" happens end-to-end.

## A worked descent (the string-concat slice)

Goal (P0): *the learner can print `"age: 7"` by joining fixed text with a numeric variable.*

Descend (P1, composition axis): to do this the learner must simultaneously wield —
- a **string literal** (`"age: "`),
- a **variable** they can **assign** (`age = 7`) and **use** (read its value),
- the fact that **`+` will not coerce** a number to text,
- `print`.

Fault-lines (P2): the marquee divergence is *"`'age: ' + 7` should just work"* → `TypeError`
(`mis.concat.implicit_coercion`). That single detectable fault-line justifies
`skill.string.concat_str_num` as its own atom — distinct from "make a string" or "assign a variable,"
each of which has its *own* fault-lines.

Dependencies (P3): `concat_str_num` needs `string.literal` (prerequisite), `var.assign` (the
track/spine parent), and `var.use` (utility). That multi-prerequisite shape is *discovered* from the
composition, and it's exactly what makes this node a good test of real gating (§16).

Ascend (P4–P6): group into the spine (`node.output` → `node.variables`) plus the `node.string_concat`
extension; within each cell, run the ladder so the learner *predicts* `'age: ' + 7`, *sees* the
TypeError, and only then learns `str()` / f-strings — discovering the need before the mechanism.
