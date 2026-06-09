import * as React from "react";
/** Text answer input (predict / recall). Mono by default — learners type program output. */
export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  disabled?: boolean;
  /** max-width in px; use ~200 for one-word recall answers */
  width?: number;
  style?: React.CSSProperties;
}
export declare function TextInput(props: TextInputProps): JSX.Element;
