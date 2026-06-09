import * as React from "react";
/** Read-only terrarium code display (watch/predict). Pass output to dock a stdout console strip beneath. */
export interface CodeBlockProps {
  /** code content; pass spans with token colors for syntax highlighting */
  children?: React.ReactNode;
  /** captured stdout — renders the dark console strip */
  output?: string;
  style?: React.CSSProperties;
}
export declare function CodeBlock(props: CodeBlockProps): JSX.Element;
