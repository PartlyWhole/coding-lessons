import * as React from "react";
/**
 * Attribution-colored feedback band. Meaning is contractual: pass=green,
 * misconception=warm amber (NEVER error styling), mismatch=quiet olive,
 * syntax/runtime=calm crimson with a mono "Type · line N" chip.
 * @startingPoint section="Feedback" subtitle="The four attribution bands" viewport="640x420"
 */
export interface FeedbackBandProps {
  attribution?: "pass" | "misconception" | "mismatch" | "syntax" | "runtime";
  /** override the default label (Correct / Let's look closer / …) */
  label?: string;
  /** the diagnosed misconception's title, rendered as a chip */
  misconceptionTitle?: string;
  /** e.g. "ValueError · line 2" */
  errorChip?: string;
  /** interpreter one-liner, verbatim */
  errorMessage?: string;
  /** predict run-and-show reveal, e.g. "Expected: HiAlan" */
  reveal?: string;
  /** authored feedback body */
  children?: React.ReactNode;
}
export declare function FeedbackBand(props: FeedbackBandProps): JSX.Element;
