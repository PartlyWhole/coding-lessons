import type { Bundle, Diagnosis, Hint } from "@trellis/schema";

// §9.2 — the learner-dosed ladder state. `revealedThrough` is the highest level
// currently visible (0 = nothing shown yet). Pure data + a counter; no model in the loop.
export interface HintState {
  ladderKey: string;
  revealedThrough: 0 | 1 | 2 | 3 | 4;
}

// Empty key: a `pass` (or no-ladder) state — nothing to reveal.
export const NO_LADDER = "";

export function initialHintState(): HintState {
  return { ladderKey: NO_LADDER, revealedThrough: 0 };
}

export interface LadderOptions {
  // Required to advance into level 4 (revealCode / full solution).
  confirmRevealCode?: boolean;
  // §9.2: on a repeat of the SAME misconception, start one level higher so a stuck
  // learner isn't forced to re-read level 1. Schema carries no `autoEscalate` field, so
  // this is a driver option, not authored content.
  autoEscalate?: boolean;
}

// §9.1 — the frozen `Skill` has no `hintLadder` field, so the generic fallback ladders
// (used when attribution is mismatch/syntax/runtime) are engine defaults, keyed by
// attribution so a syntax error gets syntax-flavored nudges. Minimal and content-free;
// supersede with authored skill ladders if/when the schema grows that field.
export const GENERIC_LADDERS: Record<"syntax" | "runtime" | "mismatch", Hint[]> = {
  syntax: [
    { level: 1, body: "Your code didn't run — Python reported a syntax error. Read the message and look at the line it names." },
    { level: 2, body: "Syntax errors are usually a missing colon `:`, an unbalanced bracket/quote, or wrong indentation. Check the named line and the one above it." },
    { level: 3, body: "Re-type the named line carefully: every `(` needs a `)`, every opening quote needs a closing quote, and a block header (`if`/`for`/`while`/`def`) ends in `:`." },
    { level: 4, body: "Compare your line against a minimal correct example of the same construct and fix the mismatch." },
  ],
  runtime: [
    { level: 1, body: "Your code started but crashed while running. Read the error type and the line it points at." },
    { level: 2, body: "A runtime error means the line is valid Python but did something impossible — e.g. mixing incompatible types, or using a name before it's defined." },
    { level: 3, body: "Trace the values on the failing line by hand: what is each variable, and what type is it, at the moment the line runs?" },
    { level: 4, body: "Fix the operation on the failing line so the types and names are valid, then re-run." },
  ],
  mismatch: [
    { level: 1, body: "Your code ran, but the output didn't match what was expected. Compare them side by side." },
    { level: 2, body: "Look for a small difference: spacing, capitalisation, a missing/extra character, or computing a slightly different value." },
    { level: 3, body: "Re-read the prompt's exact wording for what to print/return, then make your output match it character-for-character." },
    { level: 4, body: "Adjust the computation or the literal so the produced output equals the expected output exactly." },
  ],
};

// §9.2 — which ladder a Diagnosis points at.
export function ladderKeyFor(diag: Diagnosis): string {
  if (diag.attribution === "pass") return NO_LADDER;
  if (diag.attribution === "misconception") {
    return diag.misconceptionId ?? "generic:misconception";
  }
  return `generic:${diag.attribution}`;
}

// The ladder data for a key. Misconception key → authored ladder; `generic:<attr>` →
// engine default; empty/unknown → empty.
export function ladderFor(key: string, bundle: Bundle): Hint[] {
  if (key === NO_LADDER) return [];
  if (key.startsWith("generic:")) {
    const attr = key.slice("generic:".length);
    return GENERIC_LADDERS[attr as keyof typeof GENERIC_LADDERS] ?? GENERIC_LADDERS.mismatch;
  }
  return bundle.misconceptions[key]?.hintLadder ?? [];
}

// §9.2 — sync the ladder to a new Diagnosis. Changing misconception resets to the new
// ladder at level 0; repeating the same one (with autoEscalate) raises the floor by one,
// bounded at 3 so the solution is never auto-revealed, and only after at least one pull.
// NOTE: this is intentionally ladder-agnostic (it has no ladder to clamp against). The
// bump to 2|3 assumes the standard 4-level ladder; the frozen `Hint.level` union (1..4)
// and the v1 corpus (every ladder is 4 levels) guarantee that. If a future ladder is
// shorter than 3 levels, `visibleHints` still just shows all of it (no crash) — but the
// floor could point past the last hint, so re-clamp here against the ladder length then.
export function syncLadder(prev: HintState, diag: Diagnosis, opts: LadderOptions = {}): HintState {
  const key = ladderKeyFor(diag);
  if (key !== prev.ladderKey) return { ladderKey: key, revealedThrough: 0 };
  if (opts.autoEscalate && prev.revealedThrough >= 1 && prev.revealedThrough < 3) {
    return { ladderKey: key, revealedThrough: (prev.revealedThrough + 1) as HintState["revealedThrough"] };
  }
  return prev;
}

// §9.2 — one press reveals exactly one more level. Level 4 (the last, the revealCode
// solution) requires an explicit confirm. Never exceeds the ladder's length.
export function pullHint(state: HintState, ladder: Hint[], opts: LadderOptions = {}): HintState {
  const max = ladder.length; // 0..4 for v1 content
  const next = state.revealedThrough + 1;
  if (next > max) return state;
  if (next >= 4 && !opts.confirmRevealCode) return state; // solution behind a confirm
  return { ladderKey: state.ladderKey, revealedThrough: next as HintState["revealedThrough"] };
}

// §9.2 — the learner sees levels 1..revealedThrough.
export function visibleHints(state: HintState, ladder: Hint[]): Hint[] {
  return ladder.filter((h) => h.level <= state.revealedThrough);
}
