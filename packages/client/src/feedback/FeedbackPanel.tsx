import type { Diagnosis } from "@trellis/schema";
import { attributionStyle } from "../attribution.js";

export interface FeedbackPanelProps {
  diagnosis: Diagnosis;
  misconceptionTitle?: string; // authored Misconception.title — the ⚑ approved chip
  misconceptionFeedback?: string; // authored Misconception.feedback (runner resolves it from the bundle)
  revealText?: string; // predict "run-and-show" reveal the runner builds
}

// "TypeError · line 3" — error class from the interpreter one-liner when present,
// else a type-derived fallback. No tracebacks (handback §4).
function errorChip(runError: { type: "syntax" | "runtime"; message: string; line?: number }): string {
  const cls =
    /^([A-Za-z_]\w*Error)\b/.exec(runError.message)?.[1] ??
    (runError.type === "syntax" ? "SyntaxError" : "Error");
  return runError.line !== undefined ? `${cls} · line ${runError.line}` : cls;
}

// §5.1 FEEDBACK — attribution carried by `feedback feedback--{attribution}` (Greenhouse
// trellis-ui.css keys surface/border/ink off it), plus the authored misconception title +
// feedback, the syntax/runtime error chip + message, and/or the predict reveal.
export function FeedbackPanel({ diagnosis, misconceptionTitle, misconceptionFeedback, revealText }: FeedbackPanelProps): React.ReactElement {
  const sty = attributionStyle(diagnosis.attribution);
  const isError = diagnosis.attribution === "syntax" || diagnosis.attribution === "runtime";
  const runError = isError ? diagnosis.signals.runError : undefined;
  return (
    <div aria-label="feedback" className={`feedback feedback--${diagnosis.attribution}`}>
      <strong className="feedback-label">{sty.label}</strong>
      {misconceptionTitle !== undefined && <span className="feedback-misconception-title">{misconceptionTitle}</span>}
      {runError !== undefined && <span className="feedback-error-chip">{errorChip(runError)}</span>}
      {runError !== undefined && <p className="feedback-error-message">{runError.message}</p>}
      {misconceptionFeedback !== undefined && <p className="feedback-misconception">{misconceptionFeedback}</p>}
      {revealText !== undefined && <p className="feedback-reveal">{revealText}</p>}
    </div>
  );
}
