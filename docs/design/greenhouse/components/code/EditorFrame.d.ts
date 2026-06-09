import * as React from "react";
/** Static mock of the CodeMirror EditorPane: gutters, locked lines (dashed rail + lock), active line, console. For PRODUCTION use trellis-editor-theme.ts instead. */
export interface EditorLine {
  /** line content; pass colored spans for syntax */
  code?: React.ReactNode;
  locked?: boolean;
  active?: boolean;
}
export interface EditorFrameProps {
  lines?: EditorLine[];
  output?: string;
  /** EVALUATING treatment: dims to 75% */
  disabled?: boolean;
  style?: React.CSSProperties;
}
export declare function EditorFrame(props: EditorFrameProps): JSX.Element;
