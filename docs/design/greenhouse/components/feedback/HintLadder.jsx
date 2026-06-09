import * as React from "react";

export function HintLadder({ hints = [], solution, confirming = false, actionLabel = "Show a hint", showAction = true, onPull, onConfirm, onCancel }) {
  const ghost = { fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "15px", color: "var(--accent-ink)",
    background: "transparent", border: "2px solid var(--line-strong)", borderRadius: "var(--radius-md)",
    padding: "9px 18px", cursor: "pointer", alignSelf: "flex-start" };
  return (
    <aside aria-label="hints" style={{ display: "flex", flexDirection: "column", gap: "12px", fontFamily: "var(--font-ui)" }}>
      {hints.length > 0 && (
        <ol className="hints" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          {hints.map((body, i) => {
            const last = i === hints.length - 1;
            return (
              <li key={i} className={"hint hint-" + (i + 1)} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: "12px",
                background: "var(--surface)", border: "1px solid " + (last && solution ? "var(--accent)" : "var(--line)"),
                borderRadius: "var(--radius-lg)", padding: "12px 16px", fontSize: "15.5px", lineHeight: 1.6, color: "var(--ink)" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "50%", marginTop: "2px", fontWeight: 800, fontSize: "12.5px",
                  background: "var(--accent-tint)", color: "var(--accent-ink)", display: "grid", placeItems: "center" }}>{i + 1}</span>
                <div className="hint-body" style={{ alignSelf: "center", whiteSpace: "pre-line" }}>
                  {body}
                  {last && solution && <pre className="hint-solution" style={{ background: "var(--code-bg)", color: "var(--code-ink)",
                    fontFamily: "var(--font-code)", fontSize: "14px", lineHeight: 1.7, fontVariantLigatures: "none",
                    borderRadius: "var(--radius-lg)", padding: "12px 16px", margin: "8px 0 0", overflowX: "auto",
                    boxShadow: "var(--shadow-2)" }}>{solution}</pre>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {confirming ? (
        <div className="confirm" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
          background: "var(--surface-sunken)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)",
          padding: "12px 16px", fontWeight: 700, fontSize: "15px", color: "var(--ink)" }}>
          <span>Show the full solution?</span>
          <button type="button" onClick={onConfirm} style={{ fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "14.5px",
            color: "#fff", background: "var(--accent)", border: 0, borderRadius: "var(--radius-md)", padding: "8px 16px",
            boxShadow: "0 2px 0 var(--accent-deep)", cursor: "pointer" }}>Confirm</button>
          <button type="button" onClick={onCancel} style={{ fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "14.5px",
            color: "var(--ink-soft)", background: "transparent", border: "2px solid var(--line-strong)",
            borderRadius: "var(--radius-md)", padding: "8px 16px", cursor: "pointer" }}>Cancel</button>
        </div>
      ) : showAction && !solution ? (
        <button type="button" onClick={onPull} style={ghost}>{actionLabel}</button>
      ) : null}
    </aside>
  );
}
