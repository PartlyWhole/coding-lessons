import { useState } from "react";
import type { RecallStep } from "@trellis/schema";
import type { StepAnswer } from "../types.js";

export interface RecallStepViewProps {
  step: RecallStep;
  disabled: boolean;
  onSubmit: (answer: StepAnswer) => void;
}

// Submits the raw text (the engine's normalize() handles trimming/casing in matching).
export function RecallStepView({ step, disabled, onSubmit }: RecallStepViewProps): React.ReactElement {
  const [text, setText] = useState("");
  return (
    <section aria-label="recall step">
      <div className="prompt">{step.prompt}</div>
      <input
        type="text"
        aria-label="answer"
        placeholder="Type your answer…"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" disabled={disabled} onClick={() => onSubmit({ kind: "recall", text })}>
        Submit
      </button>
    </section>
  );
}
