import * as React from "react";

export function CodeBlock({ children, output, style }) {
  return (
    <div style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-2)", ...style }}>
      <pre className="code" style={{ background: "var(--code-bg)", color: "var(--code-ink)", fontFamily: "var(--font-code)",
        fontSize: "var(--text-code)", lineHeight: 1.7, fontVariantLigatures: "none", margin: 0,
        padding: "16px 20px", overflowX: "auto", tabSize: 4 }}>{children}</pre>
      {output !== undefined && (
        <div style={{ background: "var(--code-bg-deep)", padding: "10px 20px 14px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", fontWeight: 800, letterSpacing: ".14em",
            color: "var(--code-comment)", marginBottom: "4px", textTransform: "uppercase" }}>Output</div>
          <pre style={{ fontFamily: "var(--font-code)", fontSize: "var(--text-code)", color: "var(--code-ink)",
            margin: 0, whiteSpace: "pre" }}>{output}</pre>
        </div>
      )}
    </div>
  );
}
