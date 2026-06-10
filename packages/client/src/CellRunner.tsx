import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import type { TrellisDb } from "@trellis/persist";
import type { EventBus } from "./eventBus.js";
import type { ClientPygameRuntime } from "./types.js";
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
  /** M6.5 — optional pygame player; absent → behavior identical to today. */
  pygameRuntime?: ClientPygameRuntime;
}

export function CellRunner(props: CellRunnerProps): React.ReactElement {
  const r = useCellRunner(props);
  // ⚑ Hotfix: inputs/submit are live ONLY while the step is ACTIVE. The old check
  // (`phase === "EVALUATING"`) re-enabled the Submit button in FEEDBACK — the second click
  // of a double-click landed there and crashed the engine machine ("retry" re-enables).
  const disabled = r.phase !== "ACTIVE";
  const inFeedback = r.phase === "FEEDBACK";

  const diagnosedMisconception =
    inFeedback && r.lastDiagnosis?.misconceptionId !== undefined
      ? props.bundle.misconceptions[r.lastDiagnosis.misconceptionId]
      : undefined;
  const misconceptionFeedback = diagnosedMisconception?.feedback;
  const misconceptionTitle = diagnosedMisconception?.title;
  const revealText =
    inFeedback && r.step.kind === "predict"
      ? `Expected: ${r.step.expected.normalized?.join(", ") ?? "(see prompt)"}`
      : undefined;

  const stepIndex = props.cell.steps.findIndex((s) => s.id === r.step.id);

  return (
    <div className="cell-runner">
      {/* ⚑ Greenhouse cell header — presentational only; data already in scope. */}
      <div className="cell-eyebrow">
        <span>
          Step {stepIndex + 1} of {props.cell.steps.length}
        </span>
        <span className="cell-kind-badge">{r.step.kind}</span>
      </div>
      <div className="cell-progress">
        {props.cell.steps.map((s, i) => (
          <span key={s.id} className={`pip${i < stepIndex ? " is-done" : i === stepIndex ? " is-now" : ""}`} />
        ))}
      </div>
      <h2 className="cell-title">{props.cell.title}</h2>

      {/* §5.2 — keyed by StepId: advancing remounts a fresh step component. */}
      <div key={r.step.id} className="active-step">
        <StepView
          {...(props.pygameRuntime !== undefined ? { pygameRuntime: props.pygameRuntime } : {})}
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
            {...(misconceptionTitle !== undefined ? { misconceptionTitle } : {})}
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
