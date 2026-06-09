# Trellis — UI/UX Design Brief

**For:** an external design-focused Claude session (no repo access — this brief is self-contained).
**From:** the Trellis orchestrator. **Date:** 2026-06-09.
**Codebase state:** the full functional slice is built and tested (392 tests green). The UI is
**deliberately unstyled** — components render semantic HTML with classNames and there is **no CSS in the
project at all** yet. You are designing the visual + experiential layer for a working skeleton.

---

## 1. What Trellis is (product context)

Trellis is a **deterministic, fully-static CS teaching platform** for **absolute-beginner Python
learners**. Everything runs in the browser — Python code is executed and graded client-side (Pyodide/
WebAssembly); there is **no backend, no accounts, no server** (the app is served as static files). All
learner state lives in the browser (IndexedDB) and survives reloads.

**The product thesis:** when a beginner's code is wrong, Trellis doesn't just say "wrong" — it
**diagnoses the specific misconception** (e.g. *"you tried to glue a string to a number with `+`"*),
explains it in authored feedback, and offers a **4-level hint ladder** the learner pulls one level at a
time. A wrong answer is a *teachable moment*, not a failure. The emotional register of the whole UI
should serve that: **encouraging, calm, low-anxiety, never shaming.**

Audience: think "first three weeks of learning Python" — possibly young, possibly career-switchers.
Reading code in a monospace editor is new to them. Cognitive load is the enemy.

## 2. The learning model in UX terms

- Content is organized as **concept nodes** (e.g. *Output*, *Variables*, *String Concatenation*, with
  optional extensions like *Random*). Each node contains **cells** (small lessons); each cell is a short
  **sequence of steps**.
- **Five step kinds**, each a different interaction:
  | Kind | Learner does | Evaluated? |
  |---|---|---|
  | `watch` | reads a worked example + its output | no — just "continue" |
  | `predict` | types what they think the code will print | yes (normalized text match) |
  | `recognize` | picks from multiple-choice options (distractors map to misconceptions) | yes |
  | `recall` | types a short free answer | yes (pattern match) |
  | `build` | **writes real Python in a code editor**, runs/graded in-browser | yes (the marquee) |
- Exactly **one step is active at a time**; completing it releases the next. Earlier steps remain
  viewable read-only (the "peek-back" panel reconstructs them from history).
- Mastery is tracked per-skill behind the scenes; nodes unlock when prerequisite skills cross
  thresholds ("you just unlocked Random"). *(The current slice renders one cell; a course-map/node-graph
  view is future scope — a directional concept for it is welcome but optional.)*

## 3. The screen you're designing (component inventory — these exist and work)

One core screen: **the Cell Runner** — a learner working through one cell's steps.

- **`CellRunner`** — the page shell. Renders the active step, the feedback band, the hint panel, the
  peek-back panel. When the learner advances, the old step view is *fully replaced* (deliberate state
  reset — see §4).
- **Step views** (one per kind above). `watch` shows code + captured output; `predict`/`recall` have a
  text input; `recognize` renders choice buttons; `build` hosts the editor.
- **`EditorPane`** — CodeMirror 6, Python. Supports **locked regions** (parts of the starter code the
  learner cannot edit — visually these need a clear "this is scaffolding" treatment).
- **`FeedbackPanel`** — appears after evaluation, **color-coded by attribution** (§5). Shows a short
  label + authored feedback text.
- **`HintPanel`** — the 4-level ladder (§4). A "Show a hint" button; revealed hints stack as a list;
  level 4 ("Show full solution") requires an explicit confirm ("Show the full solution? Confirm/Cancel")
  and then renders the solution code.
- **`PeekBackPanel`** — read-only history of completed steps in this cell (what was asked, what the
  learner submitted, how it was judged).
- **App states:** initial `Loading…`; a load-failure alert; and (coming) a **"warming…"** state while
  the Python runtime boots in a worker (cold start is seconds — this wait needs honest, calm treatment,
  e.g. "getting Python ready" — it happens once per session).

## 4. FROZEN interaction semantics — style these, do NOT redesign them

These are contractual product/engine decisions with tests behind them. Visual/experiential treatment is
fully open; the *behavior* is not.

1. **Hints are pulled, never pushed.** One level per button press. Levels stack visibly (1→2→3). Level 4
   reveals the full solution and is **gated behind an explicit confirm**. (After repeated misses on the
   same misconception the system may auto-raise the *floor* — more levels already open on next view.)
2. **Hint ladder resets when the misconception changes** — new diagnosis, fresh ladder.
3. **Attribution drives feedback color** (current palette is placeholder — you own the final one, but the
   *semantic mapping* stays):
   | Attribution | Meaning | Current placeholder | Register |
   |---|---|---|---|
   | `pass` | correct (incl. solutions we didn't anticipate) | green `#1a7f37` | celebrate, brief |
   | `misconception` | a *diagnosed, named* misunderstanding | amber `#bf8700` | **warm, curious — "Let's look closer." Explicitly NOT red/error styling. This is the product's heart.** |
   | `mismatch` | wrong but no specific diagnosis | yellow `#9a6700` | neutral "not quite" |
   | `syntax` / `runtime` | the code didn't run | red `#cf222e` | factual, with the error type + line |
4. **Step replacement is a full reset** — advancing unmounts the old step entirely (no stale input
   state). Design the *transition* (motion) but the old step does not persist except in peek-back.
5. **One active step per cell**; completed steps are read-only history; future steps are not previewable.
6. **Determinism is a product promise** — same submission always yields the same judgment. Avoid any UI
   language implying randomness or "AI is thinking" vibes; grading is mechanical and instant (sub-second
   once warm).

## 5. Constraints

- **Stack:** React 19 + CodeMirror 6. Deliverables must be implementable with **plain CSS (or CSS
  custom-property design tokens)** — no mandated UI framework, no Tailwind requirement (acceptable if
  proposed, but tokens + vanilla CSS port most cleanly).
- **Static hosting:** no server, so no server-rendered anything; fonts must be self-hostable or system.
- **Code is content:** Python source, captured stdout, and tracebacks appear constantly — the monospace
  treatment (sizes, contrast, light/dark of editor vs page) is a first-class design decision.
- **Accessibility baseline:** semantic HTML exists (`role="alert"`, `aria-label`d panels, real
  `<button>`s); don't regress it. Color must never be the *only* carrier of attribution meaning (pair
  with the label text, which already exists). Full a11y audit is a later milestone.
- **Leave room for:** a future pygame canvas step (graphical game output ~M6.5) and a course-map view.

## 6. What we'd like back (deliverables)

1. **A visual direction + design system**: typography (UI + code), spacing scale, full color system
   **including the final semantic attribution palette** (light mode required; dark mode welcome),
   design tokens as CSS custom properties.
2. **The Cell Runner screen layout** — where step content, editor, feedback band, hints, and peek-back
   live; responsive behavior (desktop-first; tablet worth considering; phone is a stretch goal).
3. **Every state designed**: loading / warming / active step (each of the five kinds) / evaluating /
   each feedback attribution / hint ladder at levels 0–4 incl. the level-4 confirm / peek-back expanded.
4. **Motion guidance** for step advance (the full-replacement transition) and feedback arrival.
5. **Deliverable form:** HTML/CSS mockups are ideal (they port directly); annotated frames/specs are
   fine. Component-level: a spec per inventory item in §3, keyed to the existing semantic classNames
   where convenient (`hints`, `hint hint-{level}`, `hint-body`, `hint-solution`, `confirm`, …).

## 7. Out of scope

Telemetry dashboards, the pygame canvas itself, accounts/auth (none exist by design), full a11y audit,
multi-language, mobile-native. Don't propose backend-dependent features — there is no backend, ever, in v1.
