import { useState } from "react";
import type { Hint } from "@trellis/schema";
import { type HintState, visibleHints } from "@trellis/engine";

export interface HintPanelProps {
  ladder: Hint[];
  state: HintState;
  onPull: (opts?: { confirmRevealCode: true }) => void;
}

// §9.2 — hints are PULLED, one level per press. Level 4 (the revealCode solution) is gated
// behind an explicit confirm. The runner owns the HintState mutation (calls pullHint); this
// panel only renders the visible hints and requests the next pull.
export function HintPanel({ ladder, state, onPull }: HintPanelProps): React.ReactElement | null {
  const [confirming, setConfirming] = useState(false);
  if (ladder.length === 0) return null;

  const shown = visibleHints(state, ladder);
  const nextLevel = state.revealedThrough + 1;
  const exhausted = nextLevel > ladder.length;
  const isLevel4 = nextLevel >= 4;

  return (
    <aside aria-label="hints">
      <ol className="hints">
        {shown.map((h) => (
          <li key={h.level} className={`hint hint-${h.level}`}>
            <div className="hint-body">{h.body}</div>
            {h.revealCode !== undefined && <pre className="hint-solution">{h.revealCode}</pre>}
          </li>
        ))}
      </ol>
      {!exhausted &&
        (isLevel4 ? (
          confirming ? (
            <div className="confirm">
              <span>Show the full solution?</span>
              <button type="button" onClick={() => { setConfirming(false); onPull({ confirmRevealCode: true }); }}>
                Confirm
              </button>
              <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)}>Show full solution</button>
          )
        ) : (
          <button type="button" onClick={() => onPull()}>Show a hint</button>
        ))}
    </aside>
  );
}
