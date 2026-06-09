import { useState } from "react";
import type { PeekBackEntry } from "../types.js";
import { attributionStyle } from "../attribution.js";

export interface PeekBackPanelProps {
  entries: PeekBackEntry[];
  onOpen?: () => void; // runner emits the peek_back event (§11)
}

// §5.3 — read-only, reconstructed from released-step snapshots. Opening it is a weak struggle
// signal, so it notifies the runner via onOpen the first time it expands.
export function PeekBackPanel({ entries, onOpen }: PeekBackPanelProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const empty = entries.length === 0;

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next && onOpen) onOpen();
  };

  return (
    <aside aria-label="peek-back" className="peek-back">
      <button type="button" disabled={empty} onClick={toggle}>
        {open ? "Hide review" : "Review earlier steps"}
      </button>
      {open && (
        <ol className="peek-entries">
          {entries.map((e) => (
            <li key={e.stepId} className={`peek-entry kind-${e.kind}`}>
              {e.outcome && (
                <span
                  className="peek-outcome"
                  aria-label={`outcome ${e.outcome.attribution}`}
                  style={{ color: attributionStyle(e.outcome.attribution).color }}
                >
                  ●
                </span>
              )}
              <div className="peek-prompt">{e.promptSnapshot}</div>
              {e.carryContext !== undefined && <div className="peek-carry">{e.carryContext}</div>}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
