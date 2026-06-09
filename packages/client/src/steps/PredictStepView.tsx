import { useState } from "react";
import type { PredictStep } from "@trellis/schema";
import type { StepAnswer } from "../types.js";

export interface PredictStepViewProps {
  step: PredictStep;
  disabled: boolean;
  onSubmit: (answer: StepAnswer) => void;
}

export function PredictStepView({ step, disabled, onSubmit }: PredictStepViewProps): React.ReactElement {
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const choices = step.choices ?? [];
  const hasChoices = choices.length > 0;
  const canSubmit = hasChoices ? choiceId !== null : true;

  const submit = (): void => {
    if (hasChoices) {
      if (choiceId !== null) onSubmit({ kind: "predict", choiceId });
    } else {
      onSubmit({ kind: "predict", text });
    }
  };

  return (
    <section aria-label="predict step">
      <div className="prompt">{step.prompt}</div>
      <pre className="code">{step.code}</pre>
      {hasChoices ? (
        <fieldset disabled={disabled}>
          {choices.map((c) => (
            <label key={c.id}>
              <input
                type="radio"
                name={`predict-${step.id}`}
                value={c.id}
                checked={choiceId === c.id}
                onChange={() => setChoiceId(c.id)}
              />
              {c.label}
            </label>
          ))}
        </fieldset>
      ) : (
        <input
          type="text"
          aria-label="prediction"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      <button type="button" disabled={disabled || !canSubmit} onClick={submit}>
        Submit
      </button>
    </section>
  );
}
