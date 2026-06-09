import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import type { TrellisDb } from "@trellis/persist";
import type { EventBus } from "./eventBus.js";
import type { RunnerEffects } from "./runner/grade.js";
import { useCellRunner } from "./runner/useCellRunner.js";
import { StepView } from "./steps/StepView.js";
import { HintPanel } from "./hints/HintPanel.js";
import { FeedbackPanel } from "./feedback/FeedbackPanel.js";
import { PeekBackPanel } from "./peekback/PeekBackPanel.js";

export interface CellRunnerProps {
  cell: Cell;
  bundle: Bundle;
  sandbox: BuildSandbox;
  bus: EventBus;
  effects: RunnerEffects;
  db?: TrellisDb;
}

export function CellRunner(props: CellRunnerProps): React.ReactElement {
  const r = useCellRunner(props);
  const disabled = r.phase === "EVALUATING";
  const inFeedback = r.phase === "FEEDBACK";

  const misconceptionFeedback =
    inFeedback && r.lastDiagnosis?.misconceptionId !== undefined
      ? props.bundle.misconceptions[r.lastDiagnosis.misconceptionId]?.feedback
      : undefined;
  const revealText =
    inFeedback && r.step.kind === "predict"
      ? `Expected: ${r.step.expected.normalized?.join(", ") ?? "(see prompt)"}`
      : undefined;

  return (
    <div className="cell-runner">
      <h2 className="cell-title">{props.cell.title}</h2>

      {/* §5.2 — keyed by StepId: advancing remounts a fresh step component. */}
      <div key={r.step.id} className="active-step">
        <StepView
          step={r.step}
          disabled={disabled}
          buildCode={r.buildCode}
          onAdvance={r.advance}
          onSubmit={(answer) => {
            if (answer.kind !== "build") void r.submitNonBuild(answer);
          }}
          onBuildChange={r.setBuildCode}
          onBuildSubmit={() => void r.submitBuild()}
        />
      </div>

      {inFeedback && r.lastDiagnosis && (
        <>
          <FeedbackPanel
            diagnosis={r.lastDiagnosis}
            {...(misconceptionFeedback !== undefined ? { misconceptionFeedback } : {})}
            {...(revealText !== undefined ? { revealText } : {})}
          />
          <HintPanel ladder={r.ladder} state={r.hintState} onPull={r.pullHint} />
          {r.lastDiagnosis.correct || r.step.kind === "watch" ? (
            <button type="button" onClick={r.advance}>Continue</button>
          ) : (
            <button type="button" onClick={r.retry}>Try again</button>
          )}
        </>
      )}

      <PeekBackPanel entries={r.peekBack} onOpen={r.openPeekBack} />

      {r.isComplete && <div className="cell-complete">Cell complete ✓</div>}
    </div>
  );
}
