import * as React from "react";
/** The 4-level hint ladder. Hints are PULLED one per press; level 4 is gated behind an inline confirm. No ladder without a diagnosed misconception. */
export interface HintLadderProps {
  /** revealed hint bodies, in level order */
  hints?: string[];
  /** level-4 solution code; when set, renders inside the last hint and hides the pull button */
  solution?: string;
  /** show the inline level-4 confirm row */
  confirming?: boolean;
  /** "Show a hint" (levels 1–3) or "Show full solution" (level 4 gate) */
  actionLabel?: string;
  showAction?: boolean;
  onPull?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}
export declare function HintLadder(props: HintLadderProps): JSX.Element;
