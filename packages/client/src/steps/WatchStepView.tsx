import type { WatchStep } from "@trellis/schema";

export interface WatchStepViewProps {
  step: WatchStep;
  onAdvance: () => void;
}

// §5.1 — watch steps are passive: render the body, then advance (no submit, no ladder).
export function WatchStepView({ step, onAdvance }: WatchStepViewProps): React.ReactElement {
  return (
    <section aria-label="watch step">
      <div className="prompt">{step.prompt}</div>
      <div className="body">{step.body}</div>
      <button type="button" onClick={onAdvance}>
        Continue
      </button>
    </section>
  );
}
