import * as React from "react";

export function ChoiceOption({ checked = false, disabled = false, code = false, name = "choice", children, onChange }) {
  const body = code
    ? <code style={{ fontFamily: "var(--font-code)", fontSize: "14.5px",
        background: checked ? "rgba(255,255,255,.7)" : "var(--codechip-bg)",
        color: "var(--codechip-ink)", borderRadius: "6px", padding: "1.5px 6px" }}>{children}</code>
    : <span>{children}</span>;
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: "12px", position: "relative",
      background: checked ? "var(--accent-tint)" : "var(--surface)",
      border: "2px solid " + (checked ? "var(--accent)" : "var(--line-strong)"),
      borderRadius: "var(--radius-lg)", padding: "14px 18px", fontSize: "16px",
      fontFamily: "var(--font-ui)", color: "var(--ink)",
      cursor: disabled ? "default" : "pointer", opacity: disabled ? .55 : 1,
    }}>
      <span style={{ width: "22px", height: "22px", borderRadius: "50%", flex: "none", boxSizing: "border-box",
        border: "2px solid " + (checked ? "var(--accent)" : "var(--line-strong)"),
        background: "var(--surface)", display: "grid", placeItems: "center" }}>
        {checked && <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: "var(--accent)" }} />}
      </span>
      <input type="radio" name={name} checked={checked} disabled={disabled}
        onChange={onChange || (() => {})} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      {body}
    </label>
  );
}
