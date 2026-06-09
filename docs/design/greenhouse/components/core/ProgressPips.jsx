import * as React from "react";

export function ProgressPips({ step = 1, total = 4, kind }) {
  const pips = [];
  for (let i = 1; i <= total; i++) {
    const done = i < step, now = i === step;
    pips.push(<span key={i} style={{ width: now ? "34px" : "22px", height: "8px", borderRadius: "999px",
      background: done || now ? "var(--accent)" : "var(--line-strong)",
      opacity: done ? 1 : now ? .45 : .6 }} />);
  }
  return (
    <div style={{ fontFamily: "var(--font-ui)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12.5px", fontWeight: 800,
        letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: "8px", whiteSpace: "nowrap" }}>
        <span>Step {step} of {total}</span>
        {kind && <span style={{ background: "var(--accent-tint)", color: "var(--accent-ink)",
          borderRadius: "999px", padding: "3px 12px", letterSpacing: ".1em" }}>{kind}</span>}
      </div>
      <div style={{ display: "flex", gap: "6px" }}>{pips}</div>
    </div>
  );
}
