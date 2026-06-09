import * as React from "react";
/** Cell-header eyebrow: "Step N of M" + kind badge + progress pips. */
export interface ProgressPipsProps {
  step?: number;
  total?: number;
  /** step kind badge text, e.g. "Predict" */
  kind?: string;
}
export declare function ProgressPips(props: ProgressPipsProps): JSX.Element;
