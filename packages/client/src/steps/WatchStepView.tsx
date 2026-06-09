import type { WatchStep } from "@trellis/schema";
import { TinyMarkdown } from "../markdown/tinyMarkdown.js";

export interface WatchStepViewProps {
  step: WatchStep;
  onAdvance: () => void;
}

// §5.1 — watch steps are passive: render the body, then advance (no submit, no ladder).
// ⚑ Greenhouse: step.body renders through the tiny markdown subset (bold, inline code,
// indented code → terrarium block).
export function WatchStepView({ step, onAdvance }: WatchStepViewProps): React.ReactElement {
  return (
    <section aria-label="watch step">
      <div className="prompt">{step.prompt}</div>
      <div className="body">
        <TinyMarkdown text={step.body} />
      </div>
      <button type="button" onClick={onAdvance}>
        Continue
      </button>
    </section>
  );
}
