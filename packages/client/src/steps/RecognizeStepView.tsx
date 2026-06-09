import { useState } from "react";
import type { RecognizeStep } from "@trellis/schema";
import type { StepAnswer } from "../types.js";

export interface RecognizeStepViewProps {
  step: RecognizeStep;
  disabled: boolean;
  onSubmit: (answer: StepAnswer) => void;
}

export function RecognizeStepView({ step, disabled, onSubmit }: RecognizeStepViewProps): React.ReactElement {
  const [choiceId, setChoiceId] = useState<string | null>(null);
  return (
    <section aria-label="recognize step">
      <div className="prompt">{step.prompt}</div>
      <fieldset disabled={disabled}>
        {step.choices.map((c) => (
          <label key={c.id}>
            <input
              type="radio"
              name={`recognize-${step.id}`}
              value={c.id}
              checked={choiceId === c.id}
              onChange={() => setChoiceId(c.id)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        disabled={disabled || choiceId === null}
        onClick={() => !disabled && choiceId !== null && onSubmit({ kind: "recognize", choiceId })}
      >
        Submit
      </button>
    </section>
  );
}
