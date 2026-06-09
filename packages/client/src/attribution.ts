import type { Attribution } from "@trellis/schema";

export interface AttributionStyle {
  label: string;
  color: string; // CSS color for the FEEDBACK band
}

// §5.1 — attribution-colored FEEDBACK. Pass is green; misconception is amber (a teachable
// moment, not an error); syntax/runtime are red (the code didn't run); mismatch is yellow.
const STYLES: Record<Attribution, AttributionStyle> = {
  pass: { label: "Correct", color: "#1a7f37" },
  misconception: { label: "Let's look closer", color: "#bf8700" },
  syntax: { label: "Syntax error", color: "#cf222e" },
  runtime: { label: "Runtime error", color: "#cf222e" },
  mismatch: { label: "Not quite", color: "#9a6700" },
};

export function attributionStyle(a: Attribution): AttributionStyle {
  return STYLES[a];
}
