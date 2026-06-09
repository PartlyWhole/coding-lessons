import type { BuildStep } from "@trellis/schema";
import { EditorPane } from "../editor/EditorPane.js";

export interface BuildStepViewProps {
  step: BuildStep;
  code: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onSubmit: () => void;
}

export function BuildStepView({ step, code, disabled, onChange, onSubmit }: BuildStepViewProps): React.ReactElement {
  return (
    <section aria-label="build step">
      <div className="prompt">{step.prompt}</div>
      <EditorPane value={code} onChange={onChange} {...(step.lockedRegions ? { lockedRegions: step.lockedRegions } : {})} readOnly={disabled} />
      {/* Guard mirrors PredictStepView: no submit may fire while disabled (synthetic events). */}
      <button type="button" disabled={disabled} onClick={() => !disabled && onSubmit()}>
        Run &amp; check
      </button>
    </section>
  );
}
