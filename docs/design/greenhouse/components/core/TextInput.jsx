import * as React from "react";

export function TextInput({ mono = true, disabled = false, width = 440, style, ...rest }) {
  return (
    <input type="text" disabled={disabled} style={{
      fontFamily: mono ? "var(--font-code)" : "var(--font-ui)", fontSize: "16px",
      color: disabled ? "var(--ink-faint)" : "var(--ink)",
      background: disabled ? "var(--surface-sunken)" : "var(--surface)",
      border: "2px solid var(--line-strong)", borderRadius: "var(--radius-md)",
      padding: "12px 16px", width: "100%", maxWidth: width + "px", boxSizing: "border-box",
      ...style }} {...rest} />
  );
}
