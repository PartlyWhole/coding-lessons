import * as React from "react";

export function EditorFrame({ lines = [], output, disabled = false, style }) {
  return (
    <div className="editor-pane" style={{ borderRadius: "var(--radius-lg)", overflow: "hidden",
      boxShadow: "var(--shadow-2)", opacity: disabled ? .75 : 1, ...style }}>
      <div style={{ background: "var(--code-bg)", fontFamily: "var(--font-code)", fontSize: "var(--text-code)",
        lineHeight: 1.7, padding: "12px 0", fontVariantLigatures: "none" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 1fr",
            backgroundColor: l.active ? "var(--code-active-line)" : l.locked ? "var(--code-locked-bg)" : "transparent",
            backgroundImage: l.locked ? "repeating-linear-gradient(to bottom, var(--code-locked-edge) 0 5px, transparent 5px 9px)" : "none",
            backgroundSize: "3px 100%", backgroundRepeat: "no-repeat" }}>
            <span style={{ textAlign: "right", paddingRight: "16px", color: "var(--code-line-number)",
              userSelect: "none", fontSize: "13px", paddingTop: "1px" }}>
              {i + 1}{l.locked && <span style={{ fontSize: "9px", marginLeft: "3px" }}>{"\u{1F512}"}</span>}
            </span>
            <span style={{ color: "var(--code-ink)", whiteSpace: "pre", paddingRight: "16px", opacity: l.locked ? .72 : 1 }}>{l.code}</span>
          </div>
        ))}
      </div>
      {output !== undefined && (
        <div style={{ background: "var(--code-bg-deep)", padding: "10px 16px 14px 50px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", fontWeight: 800, letterSpacing: ".14em",
            color: "var(--code-comment)", marginBottom: "4px", textTransform: "uppercase" }}>Output</div>
          <pre style={{ fontFamily: "var(--font-code)", fontSize: "var(--text-code)", color: "var(--code-ink)",
            margin: 0, whiteSpace: "pre" }}>{output}</pre>
        </div>
      )}
    </div>
  );
}
