import * as React from "react";
/**
 * Trellis pressable button. Primary carries the 3px --accent-deep under-shadow
 * and depresses on press; ghost is the quiet outline used in asides (hints, peek-back).
 * @startingPoint section="Core" subtitle="Primary & ghost pressable buttons" viewport="420x140"
 */
export interface ButtonProps {
  variant?: "primary" | "ghost";
  size?: "md" | "sm";
  disabled?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}
export declare function Button(props: ButtonProps): JSX.Element;
