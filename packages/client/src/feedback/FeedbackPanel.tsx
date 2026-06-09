import type { Diagnosis } from "@trellis/schema";
import { attributionStyle } from "../attribution.js";

export interface FeedbackPanelProps {
  diagnosis: Diagnosis;
  misconceptionFeedback?: string; // authored Misconception.feedback (runner resolves it from the bundle)
  revealText?: string; // predict "run-and-show" reveal the runner builds
}

// §5.1 FEEDBACK — an attribution-colored band, plus the authored misconception feedback and/or
// the predict reveal when supplied.
export function FeedbackPanel({ diagnosis, misconceptionFeedback, revealText }: FeedbackPanelProps): React.ReactElement {
  const sty = attributionStyle(diagnosis.attribution);
  return (
    <div aria-label="feedback" className="feedback" style={{ borderLeft: `4px solid ${sty.color}`, color: sty.color }}>
      <strong className="feedback-label">{sty.label}</strong>
      {misconceptionFeedback !== undefined && <p className="feedback-misconception">{misconceptionFeedback}</p>}
      {revealText !== undefined && <p className="feedback-reveal">{revealText}</p>}
    </div>
  );
}
