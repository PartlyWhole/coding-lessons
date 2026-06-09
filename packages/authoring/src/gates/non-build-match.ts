// Faithful mirror of the engine's §8 non-build matching, used by gates 8/9 to decide
// whether a value (a choice id, or a normalized text key) counts as a CORRECT answer.
//
// Source of truth: packages/engine/src/normalize.ts `normalize` and
// packages/engine/src/diagnose.ts `matchesAccepted`. Authoring deliberately does not
// import @trellis/engine (see grade.ts), so this is a local mirror — keep the two in
// sync. NOTE: this is intentionally NOT signature.ts `norm`, which additionally strips
// a trailing period (harness.py recallEquals semantics, a different contract).
import { RE2JS } from "re2js";

export interface AcceptedLike {
  normalized?: string[];
  patterns?: string[];
  misconceptionMap?: Record<string, string>;
}

// engine/src/normalize.ts: trim, lowercase, collapse whitespace runs to one space.
export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// engine/src/diagnose.ts matchesAccepted: normalized exact OR anchored RE2 full-match.
export function matchesAccepted(accepted: AcceptedLike, value: string): boolean {
  const norm = normalize(value);
  if (accepted.normalized && accepted.normalized.some((a) => normalize(a) === norm)) {
    return true;
  }
  if (accepted.patterns) {
    for (const p of accepted.patterns) {
      // Non-compiling patterns are lint-re2's finding; treat them as non-matching here.
      try {
        if (RE2JS.compile(p).matches(value)) return true;
      } catch {
        /* reported by lintRe2Patterns */
      }
    }
  }
  return false;
}
