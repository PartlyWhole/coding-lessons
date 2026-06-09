// Gate 9: no misconception tag on a CORRECT answer. A misconception describes the belief
// that picks a WRONG answer; the engine only consults directMisconception when
// correct === false (engine diagnose.ts), so a tag on a correct choice — or a
// misconceptionMap key that itself matches the accepted answers — is dead/contradictory
// authoring. Golden precedent: commit d8f20b3 moved join_text#2's missing_space tag off
// the correct choice (b -> a).
import type { Loaded, RawStep } from "../raw-types.js";
import type { GateIssue } from "./types.js";
import { matchesAccepted, type AcceptedLike } from "./non-build-match.js";

const G = "9-correct-miscon";

interface ChoiceLike {
  id: string;
  misconception?: string;
}

export function gateCorrectChoiceMiscon(loaded: Loaded): GateIssue[] {
  const issues: GateIssue[] = [];
  const push = (message: string, level: "error" | "warn" = "error") =>
    issues.push({ gate: G, level, message });

  const checkMap = (s: RawStep, field: "accepted" | "expected", acc: AcceptedLike) => {
    for (const key of Object.keys(acc.misconceptionMap ?? {})) {
      if (matchesAccepted(acc, key)) {
        push(
          `${s.id}: ${field}.misconceptionMap key ${JSON.stringify(key)} matches the ` +
            `accepted answers — it tags a CORRECT answer and can never fire ` +
            `(directMisconception runs only on incorrect submissions)`,
        );
      }
    }
  };

  for (const n of Object.values(loaded.nodes)) {
    for (const c of n.cells) {
      for (const s of c.steps) {
        if (s.kind === "recognize") {
          const correct = s["correctChoiceId"] as string | undefined;
          const choices = (s["choices"] as ChoiceLike[] | undefined) ?? [];
          for (const ch of choices) {
            if (ch.misconception && ch.id === correct) {
              push(
                `${s.id}: misconception ${ch.misconception} on the CORRECT choice ` +
                  `${JSON.stringify(ch.id)} (correctChoiceId) — the tag must describe the ` +
                  `belief that picks a wrong choice`,
              );
            }
          }
        } else if (s.kind === "predict") {
          const expected = (s["expected"] as AcceptedLike | undefined) ?? {};
          const choices = s["choices"] as ChoiceLike[] | undefined;
          if (choices && choices.length > 0) {
            for (const ch of choices) {
              if (ch.misconception && matchesAccepted(expected, ch.id)) {
                push(
                  `${s.id}: misconception ${ch.misconception} on the CORRECT choice ` +
                    `${JSON.stringify(ch.id)} (its id matches expected) — the tag must ` +
                    `describe the belief that picks a wrong choice`,
                );
              }
            }
          }
          checkMap(s, "expected", expected);
        } else if (s.kind === "recall") {
          checkMap(s, "accepted", (s["accepted"] as AcceptedLike | undefined) ?? {});
        }
      }
    }
  }
  return issues;
}
