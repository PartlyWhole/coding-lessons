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
