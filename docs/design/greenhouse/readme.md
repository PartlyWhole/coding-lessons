# Trellis Design System — "Greenhouse"

The design system of record for **Trellis**, a deterministic, fully-static teaching
platform for absolute-beginner Python learners (runs entirely in-browser via
Pyodide/WASM; no backend, no accounts; state in IndexedDB). Approved v1, June 2026.

**Sources:** `uploads/trellis-design-handoff.md` (design brief + real component TSX +
content/taxonomy YAML, generated from the Trellis repo `main @ 8a2b667`). The client is
React 19 + CodeMirror 6, styled by plain CSS keyed to existing semantic classNames —
that architecture is the spine of this system: **`design/trellis-ui.css` is both the
component library and the implementation.**

## The product's heart (read this first)

A wrong answer in Trellis is a *teachable moment*. The engine diagnoses the specific
misconception and the UI's emotional register must honor that:

- `pass` → green, celebrate briefly, get out of the way
- `misconception` → **warm amber, "Let's look closer"** — curiosity, explicitly NOT
  error styling. The creamiest surface of the four; magnifier icon, never a triangle.
- `mismatch` → quiet olive "Not quite", no theatrics
- `syntax`/`runtime` → calm crimson, factual: error type + line, no blame

Never carry attribution by color alone — icon + label always travel with it.
Never imply randomness or "AI thinking": grading is mechanical, instant, deterministic.
No spinners, no pulses (sole exception: the once-per-session warm-up bar).

## Content fundamentals

- **Voice:** warm, direct second person ("You already know…", "Put the space inside
  the first piece"). The computer is a character — literal-minded, a bit greedy
  ("The computer is greedy — it does NOT sprinkle in spaces for you").
- **Metaphors over jargon:** + is *glue*; variables are *boxes that catch answers*;
  locked code is *the rails of the trellis*. Jargon appears only after the metaphor.
- **Never shaming:** "Close!", "That's the big one!", "Not quite" — error copy states
  facts (type + line), hint copy asks questions before giving answers.
- **Casing:** sentence case everywhere; UPPERCASE only for micro-eyebrows/badges.
- **Emoji:** none in UI copy. (Single exception: the 🔒 gutter glyph, see Iconography.)
- **Determinism in language:** "Run & check", "Getting Python ready…" — verbs that
  describe what actually happens.

## Visual foundations

- **Concept:** "Greenhouse" — a warm, light paper page where prose lives; a dark
  blue-slate **terrarium** (`--code-bg #242B39`, never pure black) where code lives.
  Code reads as a distinct, special place you peer into; captured stdout docks beneath
  it in a darker console strip ("what came out the bottom").
- **Color:** warm neutrals (cream-tinted, chroma ≈ 0.01–0.02); ONE accent (Bluebell
  `--accent #5263D8`) reserved for interactive-but-not-evaluative things (buttons,
  selection, focus, progress); the attribution palette is the loudest color on screen.
  Never use accent for judgments or attribution colors for interaction.
- **Type:** Baloo 2 (display: cell titles, feedback labels, big numbers — never body),
  Nunito Sans (all UI/reading; 400 body / 600 meta / 800 prompts & buttons),
  JetBrains Mono 15px with **ligatures disabled**. Body 17px / 1.65.
- **Backgrounds:** flat `--paper`; no gradients, no textures, no imagery. Cards are
  white, radius-xl (22px), 1px `--line` border, shadow-1.
- **Shadows:** two levels, warm umber. shadow-2 belongs to the editor + dialogs only.
- **Radii:** sm 8 (chips) · md 12 (buttons/inputs) · lg 16 (bands/editor/hints) ·
  xl 22 (step cards) · pill (badges/progress).
- **Buttons:** primary = Bluebell with a 3px hard under-shadow in `--accent-deep`,
  physically depresses on press (translateY 2px). Ghost = 2px `--line-strong` outline,
  accent-ink text, tint fill on hover. Hover: lift −1px / border→accent. Disabled:
  sunken fill, faint ink, no under-shadow.
- **Focus:** 2px accent outline, offset 2; inputs add a 3px `--accent-tint` halo.
- **Motion:** fade+rise entrances (240ms, `--ease-out-soft`); hover/press 140ms; the
  single spring is the pass check-pop (420ms). Nothing loops. Reduced-motion →
  plain fades. No exit animations (step replacement unmounts instantly by contract).
- **Feedback bands:** soft-filled rounded panels (fill + 1px border + icon disc +
  Baloo label). NEVER the left-border-accent-only pattern, never saturated fills.
- **Layout:** single centered 720px column; one thing at a time; DOM order = visual
  order = focus order. History (peek-back) is recessed behind a dashed divider.
- **Transparency/blur:** none. Honest flat surfaces.

## Iconography

Minimal, purpose-built inline SVG glyphs (stroke-based, round caps, drawn on a 16px
grid) — no icon font, no external set. The full set: check (pass), magnifier
(misconception — "let's look closer"), soft tilde-wave (mismatch), bang (error),
lock. They live as data-URIs inside `design/trellis-ui.css` (`.feedback::before`) and
inline in components. The lock currently renders as the 🔒 unicode glyph at 9px in
the editor gutter — acceptable, but an `assets/lock.svg` replacement is recommended
for cross-platform consistency (flagged). Do not import icon libraries; if a new
glyph is needed, draw it in the same 16-grid stroke style.

## Index

| Path | What it is |
|---|---|
| `styles.css` | Global CSS entry (imports everything below) |
| `tokens/*.css` | fonts, colors, typography, spacing, motion, dark-mode values |
| `design/trellis-ui.css` | **Component CSS keyed to the client's real classNames** (+ responsive + ⚑-flagged markup additions documented inline) |
| `design/trellis-tokens.css` | Single-file token sheet (repo-handoff copy of `tokens/*`) |
| `design/trellis-editor-theme.ts` | Drop-in CodeMirror 6 theme: `EditorView.theme()` + `HighlightStyle` + locked-region contract |
| `design/Visual Direction.html` | Approved direction doc (type, palette rationale, accent candidates, motion) |
| `design/Cell Runner.html` | **UI kit canvas: 25 artboards = every Cell Runner state** (§6.3 coverage) with SPEC annotations |
| `ui_kits/cell_runner/` | Interactive single-screen Cell Runner (state switcher) |
| `components/core/` | Button, TextInput, ChoiceOption, ProgressPips |
| `components/feedback/` | FeedbackBand, HintLadder |
| `components/code/` | CodeBlock, EditorFrame |
| `guidelines/*.html` | Foundation specimen cards (Design System tab) |
| `SKILL.md` | Agent-skill entry point |
| `uploads/trellis-design-handoff.md` | Source brief + product code + content (reference) |

## Rules for future design sessions

1. Frozen interaction semantics (brief §4) are contractual — style, never redesign.
2. The attribution palette's *meanings* are fixed; misconception ≠ error, always.
3. Use real authored content from the YAML in mockups, never lorem ipsum.
4. Key mockups to the client's existing classNames so CSS ports directly.
5. Body text ≥ 17px; code ≥ 15px mono with ligatures off; hit targets ≥ 44px.
