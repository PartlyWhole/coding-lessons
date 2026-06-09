# Trellis — Design Handback Bundle (v1, 2026-06-09)

From the design session, for the implementing coding session. Pairs with the original
brief bundle (`docs/design/2026-06-09-ui-design-brief.md`, repo main @ 8a2b667).

Contents: (1) implementation notes incl. every flagged markup addition; (2) the three
drop-in code files. The HTML mockups (Visual Direction.html, Cell Runner.html + its JSX
artboard files) ship separately as a zip — they are reference, not for the repo.

## Implementation notes — read before styling

1. **Drop-in files:** `trellis-tokens.css` (tokens incl. dark via `.theme-dark`),
   `trellis-ui.css` (all component CSS, keyed to existing classNames),
   `trellis-editor-theme.ts` (CodeMirror 6 theme — import `trellisEditor` into
   EditorPane's extensions).
2. **Fonts:** Baloo 2 / Nunito Sans / JetBrains Mono — self-host via Fontsource woff2
   (static-hosting constraint). Weights: Baloo 700; Nunito 400/600/800; JBM 400/500/700.
3. **attribution.ts:** update the placeholder hexes to the `--attr-*-ink` token values
   (pass #1A7F4B · misconception #9C6310 · mismatch #7E6A14 · syntax/runtime #BE4039).
   These still feed the peek-back outcome dots.
4. **⚑ Markup additions** (all approved by design review; none touch frozen semantics):
   - FeedbackPanel: replace the inline borderLeft/color style with
     `className={"feedback feedback--" + diagnosis.attribution}`.
   - FeedbackPanel: render the diagnosed misconception's title as
     `<span className="feedback-misconception-title">` (data:
     `bundle.misconceptions[id].title`).
   - FeedbackPanel: for syntax/runtime, render `<span className="feedback-error-chip">`
     ("TypeError · line 3") and `<p className="feedback-error-message">` (interpreter
     one-liner) from the Diagnosis error info. No tracebacks.
   - CellRunner: add the cell header — `.cell-eyebrow` (step count + `.cell-kind-badge`)
     and `.cell-progress` pips (`.pip`, `.is-done`, `.is-now`). Data already in scope.
   - TrellisApp: wrap app states — `.app-state.app-loading` / `.app-warming` (new
     "Getting Python ready…" + `.warm-bar` markup per the canvas) / `.app-error` on the
     existing role="alert" (headline + reassurance copy + existing message demoted to mono).
   - WatchStepView: render `step.body` with a tiny markdown subset (bold, inline code,
     indented code → terrarium block with optional output strip).
   - Text inputs: add placeholder copy (predict: "Type exactly what gets printed…").
5. **Hint ladders only exist for diagnosed misconceptions** — raw syntax/runtime/mismatch
   show no hint button (HintPanel already returns null on an empty ladder; don't add one).
6. **Motion:** all recipes are in trellis-ui.css behind
   `@media (prefers-reduced-motion: no-preference)`. No spinners anywhere; the EVALUATING
   phase is just disabled controls + depressed button.
7. **Reference mockups:** `design/Cell Runner.html` (25 artboards, every state, SPEC
   annotations) and `design/Visual Direction.html` (system rationale).

════════════════════════════════════════════════════════════════
FILE: packages/client/src/styles/trellis-tokens.css
════════════════════════════════════════════════════════════════
```
/* ============================================================
   TRELLIS DESIGN TOKENS — approved direction "Greenhouse" v1
   Accent: B · Bluebell (approved 2026-06-09)
   This file is implementation-ready: drop into the client as-is.
   ============================================================ */
:root {
  /* ---- Type families (self-host via Fontsource: baloo-2, nunito-sans, jetbrains-mono) ---- */
  --font-display: "Baloo 2", "Nunito Sans", system-ui, sans-serif;
  --font-ui: "Nunito Sans", system-ui, -apple-system, sans-serif;
  --font-code: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;

  /* ---- Type scale ---- */
  --text-display: 28px;   /* .cell-title */
  --text-title: 20px;     /* .prompt */
  --text-body: 17px;      /* prose, feedback body, hints */
  --text-small: 14.5px;   /* peek-back, captions, meta */
  --text-micro: 12.5px;   /* eyebrows, badges */
  --text-code: 15px;      /* editor + code blocks */
  --leading-body: 1.65;
  --leading-code: 1.7;

  /* ---- Warm neutrals ---- */
  --paper: #FBF9F5;
  --surface: #FFFFFF;
  --surface-sunken: #F4F0E9;
  --ink: #3B362E;
  --ink-soft: #6F675C;
  --ink-faint: #A39A8B;
  --line: #E9E3D8;
  --line-strong: #D8D0C1;

  /* ---- Semantic attribution palette (FINAL — approved) ----
     Update packages/client/src/attribution.ts colors to the -ink values. */
  --attr-pass-ink: #1A7F4B;
  --attr-pass-surface: #E9F6EE;
  --attr-pass-border: #BFE3CD;
  --attr-misconception-ink: #9C6310;
  --attr-misconception-surface: #FCF2DF;
  --attr-misconception-border: #EFD9AB;
  --attr-mismatch-ink: #7E6A14;
  --attr-mismatch-surface: #F7F3DD;
  --attr-mismatch-border: #E4DAAA;
  --attr-error-ink: #BE4039;
  --attr-error-surface: #FBEDEB;
  --attr-error-border: #F1CCC7;

  /* ---- Accent — Bluebell ---- */
  --accent: #5263D8;
  --accent-deep: #3F4FB8;
  --accent-tint: #ECEFFC;
  --accent-ink: #3A48A8;

  /* ---- Code / editor — the dark terrarium ---- */
  --code-bg: #242B39;
  --code-bg-deep: #1B212C;
  --code-ink: #E9EDF6;
  --code-line-number: #5C677E;
  --code-keyword: #92B3FF;
  --code-string: #FFD08E;
  --code-number: #8BD9B9;
  --code-builtin: #C0AFFF;
  --code-comment: #8290A8;
  --code-active-line: rgba(255,255,255,0.045);
  --code-selection: rgba(146,179,255,0.28);
  --code-locked-bg: rgba(255,255,255,0.055);
  --code-locked-edge: #5C677E;
  --codechip-bg: #F1EDE4;
  --codechip-ink: #50483C;

  /* ---- Spacing (4px base) ---- */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-12: 48px; --space-16: 64px;

  /* ---- Shape ---- */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 22px;
  --radius-pill: 999px;

  /* ---- Elevation ---- */
  --shadow-1: 0 1px 2px rgba(59,54,46,.05), 0 2px 10px rgba(59,54,46,.06);
  --shadow-2: 0 2px 6px rgba(59,54,46,.07), 0 10px 28px rgba(59,54,46,.10);

  /* ---- Motion ---- */
  --dur-fast: 140ms;
  --dur-base: 240ms;
  --dur-slow: 420ms;
  --ease-out-soft: cubic-bezier(.22,.9,.3,1);
  --ease-spring: cubic-bezier(.34,1.56,.64,1);
}

/* ============================================================
   DARK MODE — token values only (approved scope: spec, no mockups).
   Apply by adding .theme-dark to <html>. The editor terrarium keeps
   its own palette in both modes (it is already dark).
   ============================================================ */
.theme-dark {
  --paper: #1E232E;
  --surface: #272D3A;
  --surface-sunken: #20252F;
  --ink: #ECEAE4;
  --ink-soft: #B3AEA3;
  --ink-faint: #7C766A;
  --line: #353C4B;
  --line-strong: #465063;

  --attr-pass-ink: #6FCF9A;
  --attr-pass-surface: #1F3A2C;
  --attr-pass-border: #2E5740;
  --attr-misconception-ink: #E8B855;
  --attr-misconception-surface: #3C3120;
  --attr-misconception-border: #5C4A2C;
  --attr-mismatch-ink: #CFC069;
  --attr-mismatch-surface: #35311D;
  --attr-mismatch-border: #514B2B;
  --attr-error-ink: #F09289;
  --attr-error-surface: #3E2624;
  --attr-error-border: #5E3833;

  --accent: #8B99F2;
  --accent-deep: #5263D8;
  --accent-tint: #2C3354;
  --accent-ink: #AEB8F7;

  --codechip-bg: #323A4A;
  --codechip-ink: #D8DCE8;

  --shadow-1: 0 1px 2px rgba(0,0,0,.25), 0 2px 10px rgba(0,0,0,.25);
  --shadow-2: 0 2px 6px rgba(0,0,0,.3), 0 10px 28px rgba(0,0,0,.35);
}
```

════════════════════════════════════════════════════════════════
FILE: packages/client/src/styles/trellis-ui.css
════════════════════════════════════════════════════════════════
```
/* ============================================================
   TRELLIS UI — component CSS keyed to the EXISTING classNames
   (CellRunner.tsx, StepView*, FeedbackPanel, HintPanel,
   PeekBackPanel). Requires trellis-tokens.css.

   Selectors marked [NEW] need a small markup addition (each one
   was approved or is flagged in the canvas spec notes).
   Selectors marked [CHANGE] need a one-line component change
   (e.g. attribution as data-attr instead of inline style).
   Everything else styles the DOM as it exists today.
   ============================================================ */

/* ---------------- Page & shell ---------------- */
body { background: var(--paper); margin: 0; }

.cell-runner {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-10) var(--space-6) 96px;
  font-family: var(--font-ui);
  font-size: var(--text-body);
  line-height: var(--leading-body);
  color: var(--ink);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* [NEW] step-position eyebrow + progress pips. Additive presentational
   elements; data (step index / cell.steps.length) is already in runner props. */
.cell-eyebrow {
  display: flex; align-items: center; gap: var(--space-3); white-space: nowrap;
  font-size: var(--text-micro); font-weight: 800;
  letter-spacing: .12em; text-transform: uppercase; color: var(--ink-faint);
}
.cell-kind-badge {
  background: var(--accent-tint); color: var(--accent-ink);
  border-radius: var(--radius-pill); padding: 3px 12px; letter-spacing: .1em;
}
.cell-progress { display: flex; gap: 6px; align-items: center; }
.cell-progress .pip { width: 22px; height: 8px; border-radius: var(--radius-pill); background: var(--line-strong); opacity: .6; }
.cell-progress .pip.is-done { background: var(--accent); opacity: 1; }
.cell-progress .pip.is-now { width: 34px; background: var(--accent); opacity: .45; }

.cell-title {
  font-family: var(--font-display); font-weight: 700;
  font-size: var(--text-display); line-height: 1.25;
  margin: 0; letter-spacing: -.1px;
}

/* ---------------- Active step card ---------------- */
.active-step > section {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  padding: var(--space-8);
  box-shadow: var(--shadow-1);
  display: flex; flex-direction: column; gap: var(--space-5);
}

.prompt { font-size: var(--text-title); font-weight: 800; line-height: 1.45; }
.prompt code, .body code, .peek-carry code, .feedback code, .hint-body code {
  font-family: var(--font-code); font-size: .88em; font-weight: 500;
  background: var(--codechip-bg); color: var(--codechip-ink);
  border-radius: 6px; padding: 1.5px 6px;
}
.body { color: var(--ink); }
.body p { margin: 0 0 var(--space-3); }
.body p:last-child { margin-bottom: 0; }
.body strong { font-weight: 800; }

/* ---------------- Code blocks (predict/watch) ---------------- */
.cell-runner pre.code, .hint-solution {
  background: var(--code-bg); color: var(--code-ink);
  font-family: var(--font-code); font-size: var(--text-code);
  line-height: var(--leading-code); font-variant-ligatures: none;
  border-radius: var(--radius-lg); padding: var(--space-4) var(--space-5);
  margin: 0; overflow-x: auto; box-shadow: var(--shadow-2);
  tab-size: 4;
}

/* ---------------- Choices (recognize / predict-with-choices) ----------------
   Styles the existing fieldset > label > input[type=radio] markup. */
.cell-runner fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.cell-runner fieldset label {
  display: flex; align-items: center; gap: var(--space-3);
  background: var(--surface); border: 2px solid var(--line-strong);
  border-radius: var(--radius-lg); padding: 14px 18px;
  font-size: 16px; cursor: pointer;
  transition: border-color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast);
}
.cell-runner fieldset label:hover { border-color: var(--accent); transform: translateY(-1px); }
.cell-runner fieldset label:has(input:checked) { border-color: var(--accent); background: var(--accent-tint); }
.cell-runner fieldset label code { font-size: 14.5px; background: rgba(255,255,255,.7); }
.cell-runner fieldset input[type="radio"] {
  appearance: none; -webkit-appearance: none; margin: 0; flex: none;
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--line-strong); background: var(--surface);
  display: grid; place-items: center; cursor: pointer;
}
.cell-runner fieldset input[type="radio"]:checked { border-color: var(--accent); }
.cell-runner fieldset input[type="radio"]:checked::after {
  content: ""; width: 11px; height: 11px; border-radius: 50%; background: var(--accent);
}
.cell-runner fieldset:disabled label { opacity: .55; cursor: default; transform: none; }
.cell-runner fieldset:disabled label:hover { border-color: var(--line-strong); }

/* ---------------- Text inputs (predict free-text / recall) ---------------- */
.cell-runner input[type="text"] {
  font-family: var(--font-code); font-size: 16px; color: var(--ink);
  background: var(--surface); border: 2px solid var(--line-strong);
  border-radius: var(--radius-md); padding: 12px 16px;
  width: 100%; max-width: 440px; box-sizing: border-box;
}
.cell-runner input[type="text"]::placeholder { color: var(--ink-faint); font-family: var(--font-ui); }
.cell-runner input[type="text"]:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-tint);
}
.cell-runner input[type="text"]:disabled { background: var(--surface-sunken); color: var(--ink-faint); }

/* ---------------- Buttons ----------------
   Primary = the step's action (Submit / Run & check / Continue) and the
   runner-level Continue / Try again (direct child of .cell-runner).
   Ghost = everything in an <aside> (hints, peek-back). */
.cell-runner button {
  font-family: var(--font-ui); font-weight: 800; font-size: 16px;
  letter-spacing: .01em; border: 0; border-radius: var(--radius-md);
  padding: 12px 26px; cursor: pointer; align-self: flex-start;
}
.cell-runner section button, .cell-runner > button {
  color: #fff; background: var(--accent);
  box-shadow: 0 3px 0 var(--accent-deep);
  transition: transform var(--dur-fast) var(--ease-out-soft), box-shadow var(--dur-fast);
}
.cell-runner section button:hover:not(:disabled), .cell-runner > button:hover { transform: translateY(-1px); box-shadow: 0 4px 0 var(--accent-deep); }
.cell-runner section button:active:not(:disabled), .cell-runner > button:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--accent-deep); }
.cell-runner section button:disabled {
  background: var(--surface-sunken); color: var(--ink-faint);
  box-shadow: none; cursor: default;
}
.cell-runner aside button {
  color: var(--accent-ink); background: transparent;
  border: 2px solid var(--line-strong); font-size: 15px; padding: 9px 18px;
  box-shadow: none;
  transition: border-color var(--dur-fast), background var(--dur-fast);
}
.cell-runner aside button:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-tint); }
.cell-runner aside button:disabled { color: var(--ink-faint); cursor: default; }
.cell-runner button:focus-visible, .cell-runner input:focus-visible, .cell-runner label:has(input:focus-visible) {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

/* ---------------- FeedbackPanel ----------------
   [CHANGE] FeedbackPanel currently sets inline borderLeft/color from
   attribution.ts. Replace with: className={`feedback feedback--${diagnosis.attribution}`}
   (and update attribution.ts hex values to the --attr-*-ink tokens for
   the places that still read them, e.g. peek-back dots). */
.feedback {
  border-radius: var(--radius-lg);
  border: 1px solid var(--fb-border);
  background: var(--fb-surface);
  padding: var(--space-4) var(--space-5) var(--space-4) 56px;
  position: relative;
}
.feedback::before { /* icon disc — pure CSS, no markup needed */
  content: ""; position: absolute; left: 18px; top: 17px;
  width: 26px; height: 26px; border-radius: 50%;
  background-color: var(--fb-ink);
  background-image: var(--fb-icon);
  background-repeat: no-repeat; background-position: center;
}
.feedback--pass, .feedback--misconception, .feedback--mismatch,
.feedback--syntax, .feedback--runtime { color: var(--ink); }
.feedback--pass    { --fb-ink: var(--attr-pass-ink); --fb-surface: var(--attr-pass-surface); --fb-border: var(--attr-pass-border);
  --fb-icon: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'); }
.feedback--misconception { --fb-ink: var(--attr-misconception-ink); --fb-surface: var(--attr-misconception-surface); --fb-border: var(--attr-misconception-border);
  --fb-icon: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="6.7" cy="6.7" r="4.2" stroke="white" stroke-width="2.1"/><path d="M10.2 10.2L14 14" stroke="white" stroke-width="2.4" stroke-linecap="round"/></svg>'); }
.feedback--mismatch { --fb-ink: var(--attr-mismatch-ink); --fb-surface: var(--attr-mismatch-surface); --fb-border: var(--attr-mismatch-border);
  --fb-icon: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 6.2c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0M3 10.4c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0" stroke="white" stroke-width="1.9" stroke-linecap="round"/></svg>'); }
.feedback--syntax, .feedback--runtime { --fb-ink: var(--attr-error-ink); --fb-surface: var(--attr-error-surface); --fb-border: var(--attr-error-border);
  --fb-icon: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3.2v6" stroke="white" stroke-width="2.4" stroke-linecap="round"/><circle cx="8" cy="12.4" r="1.4" fill="white"/></svg>'); }

.feedback-label {
  display: block; font-family: var(--font-display); font-weight: 700;
  font-size: 17px; line-height: 1.55; color: var(--fb-ink);
}
/* [NEW — approved] the diagnosed misconception's title, rendered as a chip.
   Markup: <span className="feedback-misconception-title">{title}</span>
   right after .feedback-label. Data: bundle.misconceptions[id].title. */
.feedback-misconception-title {
  display: inline-block; font-size: 13px; font-weight: 700;
  color: var(--fb-ink); background: rgba(255,255,255,.65);
  border: 1px solid var(--fb-border); border-radius: var(--radius-pill);
  padding: 3px 12px; margin: 4px 0 2px;
}
.feedback-misconception { margin: 6px 0 0; font-size: 15.5px; line-height: 1.6; }
.feedback-reveal { margin: 8px 0 0; font-family: var(--font-code); font-size: 13.5px; color: var(--ink-soft); }
/* [NEW — flagged] error detail for syntax/runtime: type + line chip and the
   short interpreter message. Data exists on Diagnosis (error type, line, message). */
.feedback-error-chip {
  display: inline-block; font-family: var(--font-code); font-size: 12.5px;
  font-weight: 700; color: var(--attr-error-ink);
  background: rgba(255,255,255,.7); border-radius: var(--radius-pill);
  padding: 2px 10px; margin: 6px 8px 2px 0;
}
.feedback-error-message { margin: 4px 0 0; font-family: var(--font-code); font-size: 13.5px; color: var(--ink); }

/* feedback arrival */
@media (prefers-reduced-motion: no-preference) {
  .feedback { animation: fbIn var(--dur-base) var(--ease-out-soft) backwards; }
  .feedback--pass::before { animation: fbPop var(--dur-slow) var(--ease-spring) 120ms backwards; }
}
@keyframes fbIn { from { opacity: 0; transform: translateY(8px); } }
@keyframes fbPop { 0% { transform: scale(.3); } 70% { transform: scale(1.18); } 100% { transform: scale(1); } }

/* ---------------- HintPanel ---------------- */
.cell-runner aside[aria-label="hints"] { display: flex; flex-direction: column; gap: var(--space-3); }
ol.hints { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); counter-reset: hint; }
.hint {
  counter-increment: hint;
  display: grid; grid-template-columns: 26px 1fr; gap: var(--space-3);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4);
  font-size: 15.5px; line-height: 1.6;
}
.hint::before {
  content: counter(hint); font-weight: 800; font-size: 12.5px;
  width: 22px; height: 22px; border-radius: 50%; margin-top: 2px;
  background: var(--accent-tint); color: var(--accent-ink);
  display: grid; place-items: center;
}
.hint-body { align-self: center; white-space: pre-line; }
.hint-solution { margin-top: var(--space-2); font-size: 14px; }
.hint.hint-4 { border-color: var(--accent); }
@media (prefers-reduced-motion: no-preference) {
  .hint:last-child { animation: hintIn var(--dur-base) var(--ease-out-soft) backwards; }
}
@keyframes hintIn { from { opacity: 0; transform: translateY(6px); } }

/* level-4 confirm row */
.confirm {
  display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
  background: var(--surface-sunken); border: 1px solid var(--line);
  border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4);
  font-weight: 700; font-size: 15px;
}
.cell-runner .confirm button { font-size: 14.5px; padding: 8px 16px; }
.cell-runner .confirm button:first-of-type {
  color: #fff; background: var(--accent); border: 0;
  box-shadow: 0 2px 0 var(--accent-deep);
}
.cell-runner .confirm button:last-of-type {
  color: var(--ink-soft); background: transparent;
  border: 2px solid var(--line-strong);
}

/* ---------------- PeekBackPanel ---------------- */
.peek-back { border-top: 1px dashed var(--line-strong); padding-top: var(--space-4); margin-top: var(--space-2); }
.peek-entries { list-style: none; margin: var(--space-3) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.peek-entry {
  display: grid; grid-template-columns: 14px 1fr auto; gap: 10px; align-items: start;
  background: var(--surface-sunken); border-radius: var(--radius-md);
  padding: 10px 14px; font-size: var(--text-small); color: var(--ink-soft);
}
.peek-outcome { font-size: 10px; line-height: 1.9; }
.peek-entry > div { grid-column: 2; }
.peek-entry .peek-prompt { font-weight: 700; color: var(--ink); grid-row: 1; }
.peek-entry:not(:has(.peek-outcome)) .peek-prompt { grid-column: 1 / 3; }
.peek-carry { font-size: 13.5px; margin-top: 2px; }
/* kind chip from the existing kind-{kind} class */
.peek-entry::after {
  grid-column: 3; grid-row: 1;
  font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;
  color: var(--ink-faint); background: var(--surface);
  border: 1px solid var(--line); border-radius: var(--radius-pill);
  padding: 2px 10px;
}
.peek-entry.kind-watch::after { content: "watch"; }
.peek-entry.kind-predict::after { content: "predict"; }
.peek-entry.kind-recognize::after { content: "recognize"; }
.peek-entry.kind-recall::after { content: "recall"; }
.peek-entry.kind-build::after { content: "build"; }

/* ---------------- Cell complete ---------------- */
.cell-complete {
  background: var(--attr-pass-surface); border: 1px solid var(--attr-pass-border);
  color: var(--attr-pass-ink); border-radius: var(--radius-lg);
  font-family: var(--font-display); font-weight: 700; font-size: 19px;
  text-align: center; padding: var(--space-5);
}
@media (prefers-reduced-motion: no-preference) {
  .cell-complete { animation: fbIn var(--dur-base) var(--ease-out-soft) backwards, fbPopSoft var(--dur-slow) var(--ease-spring) 120ms backwards; }
}
@keyframes fbPopSoft { 0% { transform: scale(.96); } 70% { transform: scale(1.015); } 100% { transform: scale(1); } }

/* ---------------- Step replacement transition ----------------
   .active-step is keyed by step id — a fresh mount each advance.
   Recipe: add class below to .active-step; old step needs no exit
   animation (unmount is instant; the entrance carries the motion). */
@media (prefers-reduced-motion: no-preference) {
  .active-step { animation: stepIn var(--dur-base) var(--ease-out-soft) 80ms backwards; }
}
@keyframes stepIn { from { opacity: 0; transform: translateY(14px); } }

/* ---------------- App states ----------------
   [NEW] wrappers: TrellisApp's bare <div>Loading…</div> and the alert
   need classNames: .app-state.app-loading / .app-warming / .app-error */
.app-state {
  min-height: 60vh; display: grid; place-content: center; justify-items: center;
  gap: var(--space-4); text-align: center; font-family: var(--font-ui);
  color: var(--ink); padding: var(--space-10);
}
.app-state .app-status { font-family: var(--font-display); font-weight: 700; font-size: 21px; }
.app-state .app-sub { font-size: var(--text-small); color: var(--ink-soft); max-width: 38ch; }
.warm-bar { width: 220px; height: 8px; border-radius: var(--radius-pill); background: var(--surface-sunken); overflow: hidden; position: relative; }
.warm-bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 38%; border-radius: var(--radius-pill); background: var(--accent); animation: warmSlide 1.3s var(--ease-out-soft) infinite alternate; }
@keyframes warmSlide { to { left: 62%; } }
@media (prefers-reduced-motion: reduce) { .warm-bar i { animation: none; width: 100%; opacity: .35; } }
.app-error[role="alert"] {
  background: var(--attr-error-surface); border: 1px solid var(--attr-error-border);
  border-radius: var(--radius-lg); padding: var(--space-5) var(--space-6);
  max-width: 480px; text-align: left; display: block;
}
.app-error .app-status { color: var(--attr-error-ink); font-size: 18px; }
.app-error code { font-family: var(--font-code); font-size: 13.5px; }

/* ---------------- EditorPane / CodeMirror theme ----------------
   The real implementation themes CodeMirror via EditorView.theme() —
   see design/trellis-editor-theme.ts for the COMPLETE, drop-in code
   (theme + HighlightStyle + locked-region styling contract).
   Below: the same treatment for the static mocks in this canvas. */
.editor-pane { border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-2); }
.editor-pane .ed-body { background: var(--code-bg); font-family: var(--font-code); font-size: var(--text-code); line-height: var(--leading-code); padding: var(--space-3) 0; font-variant-ligatures: none; }
.ed-line { display: grid; grid-template-columns: 50px 1fr; }
.ed-num { text-align: right; padding-right: 16px; color: var(--code-line-number); user-select: none; font-size: 13px; padding-top: 1px; }
.ed-src { color: var(--code-ink); white-space: pre; padding-right: 16px; }
.ed-line.active { background: var(--code-active-line); }
.ed-line.locked { background: var(--code-locked-bg); position: relative; }
.ed-line.locked .ed-src { opacity: .72; }
.ed-line.locked::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: repeating-linear-gradient(to bottom, var(--code-locked-edge) 0 5px, transparent 5px 9px); }
.ed-line.locked .ed-num::after { content: "🔒"; font-size: 9px; margin-left: 4px; position: relative; top: -1px; }
.tok-kw { color: var(--code-keyword); } .tok-str { color: var(--code-string); }
.tok-num { color: var(--code-number); } .tok-fn { color: var(--code-builtin); }
.tok-com { color: var(--code-comment); font-style: italic; }
.ed-caret { display: inline-block; width: 2px; height: 1.1em; background: var(--accent); vertical-align: text-bottom; border-radius: 1px; }
.ed-console { background: var(--code-bg-deep); padding: var(--space-3) var(--space-4) var(--space-4) 50px; border-top: 1px solid rgba(255,255,255,.06); }
.ed-console-label { font-family: var(--font-ui); font-size: 11px; font-weight: 800; letter-spacing: .14em; color: var(--code-comment); margin-bottom: 4px; text-transform: uppercase; }
.ed-console-out { font-family: var(--font-code); font-size: var(--text-code); color: var(--code-ink); white-space: pre; margin: 0; }
.editor-pane.is-disabled { opacity: .75; }
.editor-pane.is-disabled .ed-src { opacity: .85; }

/* ---------------- Responsive ---------------- */
@media (max-width: 880px) {
  .cell-runner { padding: var(--space-6) var(--space-5) 72px; }
  .active-step > section { padding: var(--space-5); }
}
@media (max-width: 560px) {
  :root { --text-display: 24px; --text-title: 18px; }
  .cell-runner { padding: var(--space-4) var(--space-4) 64px; gap: var(--space-4); }
  .active-step > section { padding: var(--space-4); border-radius: var(--radius-lg); }
  /* code gets the full width of the phone */
  .cell-runner pre.code, .editor-pane { margin-left: calc(-1 * var(--space-4)); margin-right: calc(-1 * var(--space-4)); border-radius: 0; }
  .cell-runner section button, .cell-runner > button { align-self: stretch; text-align: center; }
}
```

════════════════════════════════════════════════════════════════
FILE: packages/client/src/editor/trellis-editor-theme.ts
════════════════════════════════════════════════════════════════
```
// trellis-editor-theme.ts — CodeMirror 6 theme for the Trellis EditorPane.
// Drop into packages/client/src/editor/ alongside EditorPane.tsx.
//
// Pairs with trellis-tokens.css: every color is a var() reference with a
// light-mode hex fallback, so the theme follows the token sheet (including
// .theme-dark) with no second theme object. The terrarium is intentionally
// the same dark surface in BOTH page modes — only the caret / selection /
// focus ring flow from --accent, which .theme-dark re-points automatically
// (#5263D8 light → #8B99F2 dark).
//
// Usage in EditorPane.tsx:
//   import { trellisEditor } from "./trellis-editor-theme.js";
//   ...
//   extensions: [
//     lineNumbers(),
//     ...trellisEditor,          // theme + syntax highlighting
//     history(), keymap.of([...]), python(),
//     lockedRegionsExtension(lockedRegions),  // see notes at bottom
//     ...
//   ]

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const trellisEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--code-bg, #242B39)",
      color: "var(--code-ink, #E9EDF6)",
      borderRadius: "var(--radius-lg, 16px)",
      boxShadow:
        "var(--shadow-2, 0 2px 6px rgba(59,54,46,.07), 0 10px 28px rgba(59,54,46,.10))",
      fontSize: "var(--text-code, 15px)",
    },
    ".cm-scroller": {
      fontFamily:
        'var(--font-code, "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace)',
      lineHeight: "var(--leading-code, 1.7)",
      borderRadius: "inherit", // keep the rounded corners on the scroll surface
      padding: "12px 0",
    },
    ".cm-content": {
      caretColor: "var(--accent, #5263D8)",
      fontVariantLigatures: "none", // beginners must see the real characters they typed
    },
    "&.cm-focused": {
      outline: "2px solid var(--accent, #5263D8)",
      outlineOffset: "2px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--accent, #5263D8)",
      borderLeftWidth: "2px",
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "var(--code-selection, rgba(146,179,255,0.28))",
      },
    ".cm-activeLine": {
      backgroundColor: "var(--code-active-line, rgba(255,255,255,0.045))",
    },

    // ---- gutter ----
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--code-line-number, #5C677E)",
      border: "none",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "44px",
      padding: "0 16px 0 8px",
      fontSize: "13px",
      textAlign: "right",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--code-ink, #E9EDF6)",
    },

    // ---- locked regions ("rails of the trellis") ----
    // lockedRegionsExtension should attach Decoration.line({ class: "cm-lockedLine" })
    // to every line inside a LineRange, and a GutterMarker whose toDOM element
    // carries class "cm-lockedGutter" on those lines' number gutter.
    ".cm-lockedLine": {
      // faint fill + 3px dashed left rail, drawn as a layered background
      backgroundColor: "var(--code-locked-bg, rgba(255,255,255,0.055))",
      backgroundImage:
        "repeating-linear-gradient(to bottom, var(--code-locked-edge, #5C677E) 0 5px, transparent 5px 9px)",
      backgroundSize: "3px 100%",
      backgroundRepeat: "no-repeat",
      cursor: "default", // arrow, not text-beam: "not yours to edit"
    },
    ".cm-lockedLine span": {
      opacity: "0.72", // dim the locked source, keep syntax hues legible
    },
    ".cm-lockedGutter": {
      cursor: "default",
    },
    ".cm-lockedGutter::after": {
      content: '"🔒"', // swap for assets/lock.svg if the unicode glyph renders inconsistently
      fontSize: "9px",
      marginLeft: "4px",
      position: "relative",
      top: "-1px",
    },

    // syntax/runtime error affordance (optional, see Cell Runner spec §04):
    // a line-level underline decoration, never a squiggle-storm.
    ".cm-errorLine": {
      textDecoration: "underline wavy #F09289 1.5px",
      textUnderlineOffset: "4px",
    },
  },
  { dark: true } // the terrarium is dark in both page modes
);

// ---- syntax highlighting — deliberately FEW hues for beginners ----
// 4 token colors + comments; everything else stays --code-ink.
// All ≥ 4.5:1 on --code-bg #242B39. Strings are the warmest token on
// purpose: strings are the hero type in week one.
export const trellisHighlightStyle = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword],
    color: "var(--code-keyword, #92B3FF)",
  },
  {
    tag: [t.string, t.special(t.string), t.docString, t.character],
    color: "var(--code-string, #FFD08E)",
  },
  {
    tag: [t.number, t.integer, t.float, t.bool, t.null],
    color: "var(--code-number, #8BD9B9)",
  },
  {
    // built-ins (print, input, str, int, len) and learner-defined functions
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.definition(t.function(t.variableName)),
      t.standard(t.variableName),
    ],
    color: "var(--code-builtin, #C0AFFF)",
  },
  {
    tag: [t.comment, t.lineComment, t.blockComment],
    color: "var(--code-comment, #8290A8)",
    fontStyle: "italic",
  },
  // everything else — operators, punctuation, plain variable names — stays ink.
  // (No entry needed; unstyled tokens inherit .cm-content color.)
  {
    tag: t.invalid,
    // literal hex, not var(--attr-error-ink): that token is for light surfaces
    // and would fail contrast on the dark terrarium.
    color: "#F09289",
  },
]);

// ---- the one import EditorPane needs ----
export const trellisEditor = [
  trellisEditorTheme,
  syntaxHighlighting(trellisHighlightStyle),
];

/* ============================================================
   lockedRegionsExtension — styling contract (behavior already exists)
   ------------------------------------------------------------
   The existing extension blocks edits; for the visual treatment above
   it additionally needs to provide, per locked LineRange:

   1. Decoration.line({ class: "cm-lockedLine" }) for each line
      (RangeSet rebuilt in a ViewPlugin or StateField).
   2. A line-number GutterMarker subclass whose toDOM() returns
      `Object.assign(document.createElement("span"),
                     { className: "cm-lockedGutter" })`
      — the lock glyph itself comes from the ::after rule in the theme.
   3. (already true) EditorState.changeFilter rejecting changes that
      touch locked ranges — silently, no shake, no toast. The dashed
      rail + lock + dimmed text carry the message; rejection feedback
      would punish exploration.
   ============================================================ */
```

