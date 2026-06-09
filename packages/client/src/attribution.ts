import type { Attribution } from "@trellis/schema";

export interface AttributionStyle {
  label: string;
  color: string; // CSS color for the FEEDBACK band
}

// §5.1 — attribution-colored FEEDBACK. Pass is green; misconception is amber (a teachable
// moment, not an error); syntax/runtime are red (the code didn't run); mismatch is yellow.
// Hexes are the FINAL Greenhouse --attr-*-ink token values (design handback 2026-06-09);
// they still feed the peek-back outcome dots.
const STYLES: Record<Attribution, AttributionStyle> = {
  pass: { label: "Correct", color: "#1A7F4B" },
  misconception: { label: "Let's look closer", color: "#9C6310" },
  syntax: { label: "Syntax error", color: "#BE4039" },
  runtime: { label: "Runtime error", color: "#BE4039" },
  mismatch: { label: "Not quite", color: "#7E6A14" },
};

export function attributionStyle(a: Attribution): AttributionStyle {
  return STYLES[a];
}
