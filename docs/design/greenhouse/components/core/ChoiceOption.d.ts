import * as React from "react";
/** Whole-row tappable radio choice (recognize / predict-with-choices). Min 52px hit target. */
export interface ChoiceOptionProps {
  checked?: boolean;
  disabled?: boolean;
  /** render the label as an inline-code chip (recognize steps with code options) */
  code?: boolean;
  name?: string;
  children?: React.ReactNode;
  onChange?: () => void;
}
export declare function ChoiceOption(props: ChoiceOptionProps): JSX.Element;
