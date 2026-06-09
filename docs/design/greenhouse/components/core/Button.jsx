import * as React from "react";

export function Button({ variant = "primary", size = "md", disabled = false, children, style, ...rest }) {
  const sm = size === "sm";
  const base = {
    fontFamily: "var(--font-ui)", fontWeight: 800,
    fontSize: sm ? "14.5px" : "16px", letterSpacing: ".01em",
    borderRadius: "var(--radius-md)", padding: sm ? "8px 16px" : "12px 26px",
    cursor: disabled ? "default" : "pointer", border: 0,
  };
  const look = variant === "ghost"
    ? { color: disabled ? "var(--ink-faint)" : "var(--accent-ink)", background: "transparent",
        border: "2px solid var(--line-strong)", fontSize: sm ? "13.5px" : "15px", padding: sm ? "7px 14px" : "9px 18px" }
    : disabled
      ? { color: "var(--ink-faint)", background: "var(--surface-sunken)", boxShadow: "none" }
      : { color: "#fff", background: "var(--accent)", boxShadow: "0 3px 0 var(--accent-deep)" };
  return (
    <button type="button" disabled={disabled} style={{ ...base, ...look, ...style }} {...rest}>{children}</button>
  );
}
