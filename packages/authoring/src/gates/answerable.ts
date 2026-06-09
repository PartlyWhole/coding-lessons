// Gate 8: every choice-mode predict step must be ANSWERABLE. The engine compares the
// learner's chosen CHOICE ID against step.expected (engine diagnose.ts compareNonBuild:
// when step.choices exists, the compared value IS sub.choiceId) — so unless some choice
// id satisfies matchesAccepted(expected, id), no learner can ever pass the step.
// Golden precedent: commit 0884bf3 fixed three corpus steps whose expected.normalized
// listed only the prose label (e.g. "HiAlan"), never a choice id.
import type { Loaded } from "../raw-types.js";
import type { GateIssue } from "./types.js";
import { matchesAccepted, type AcceptedLike } from "./non-build-match.js";

const G = "8-answerable";

interface ChoiceLike {
  id: string;
  misconception?: string;
}

export function gateAnswerable(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const s of c.steps) {
        if (s.kind !== "predict") continue;
        const choices = s["choices"] as ChoiceLike[] | undefined;
        if (!choices || choices.length === 0) continue; // text-mode predict: free text, not ids
        const expected = (s["expected"] as AcceptedLike | undefined) ?? {};
        if (!choices.some((ch) => matchesAccepted(expected, ch.id))) {
          issues.push({
            gate: G,
            level: "error",
            message:
              `${s.id}: unanswerable choice-mode predict — no choice id matches expected ` +
              `(the engine compares the chosen CHOICE ID, not the label; add the correct ` +
              `choice id to expected.normalized; ids: ${choices.map((ch) => ch.id).join(", ")})`,
          });
        }
      }
    }
  }
  return issues;
}
