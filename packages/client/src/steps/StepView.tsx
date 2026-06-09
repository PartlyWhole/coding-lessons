import type { Step } from "@trellis/schema";
import type { StepAnswer } from "../types.js";
import { WatchStepView } from "./WatchStepView.js";
import { PredictStepView } from "./PredictStepView.js";
import { RecognizeStepView } from "./RecognizeStepView.js";
import { RecallStepView } from "./RecallStepView.js";
import { BuildStepView } from "./BuildStepView.js";

export interface StepViewProps {
  step: Step;
  disabled: boolean;
  buildCode: string;
  onAdvance: () => void;
  onSubmit: (answer: StepAnswer) => void;
  onBuildChange: (code: string) => void;
  onBuildSubmit: () => void;
}

export function StepView(props: StepViewProps): React.ReactElement {
  const { step, disabled, buildCode, onAdvance, onSubmit, onBuildChange, onBuildSubmit } = props;
  switch (step.kind) {
    case "watch":
      return <WatchStepView step={step} onAdvance={onAdvance} />;
    case "predict":
      return <PredictStepView step={step} disabled={disabled} onSubmit={onSubmit} />;
    case "recognize":
      return <RecognizeStepView step={step} disabled={disabled} onSubmit={onSubmit} />;
    case "recall":
      return <RecallStepView step={step} disabled={disabled} onSubmit={onSubmit} />;
    case "build":
      return <BuildStepView step={step} code={buildCode} disabled={disabled} onChange={onBuildChange} onSubmit={onBuildSubmit} />;
  }
}
