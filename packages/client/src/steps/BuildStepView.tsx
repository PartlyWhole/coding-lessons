import type { BuildStep } from "@trellis/schema";
import type { ClientPygameRuntime } from "../types.js";
import { EditorPane } from "../editor/EditorPane.js";
import { PygameStage } from "./PygameStage.js";

export interface BuildStepViewProps {
  step: BuildStep;
  code: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onSubmit: () => void;
  /** M6.5 §17.3 — optional injected pygame player. Absent → frozen behavior below. */
  pygameRuntime?: ClientPygameRuntime;
}

export function BuildStepView({ step, code, disabled, onChange, onSubmit, pygameRuntime }: BuildStepViewProps): React.ReactElement {
  // The single pygame injection point: a pygame step with an injected runtime renders
  // the stage; every other combination is the existing (frozen) build view.
  if (step.runtime === "pygame" && pygameRuntime != null) {
    return (
      <PygameStage
        step={step}
        code={code}
        disabled={disabled}
        onChange={onChange}
        onSubmit={onSubmit}
        runtime={pygameRuntime}
      />
    );
  }
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
