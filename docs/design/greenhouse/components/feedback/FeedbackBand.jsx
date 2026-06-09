import * as React from "react";

const ICONS = {
  pass: <path d="M3 8.5l3.2 3.2L13 5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  misconception: <g fill="none"><circle cx="6.7" cy="6.7" r="4.2" stroke="white" strokeWidth="2.1" /><path d="M10.2 10.2L14 14" stroke="white" strokeWidth="2.4" strokeLinecap="round" /></g>,
  mismatch: <path d="M3 6.2c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0M3 10.4c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0" stroke="white" strokeWidth="1.9" strokeLinecap="round" fill="none" />,
  bang: <g><path d="M8 3.2v6" stroke="white" strokeWidth="2.4" strokeLinecap="round" /><circle cx="8" cy="12.4" r="1.4" fill="white" /></g>,
};
const LABELS = { pass: "Correct", misconception: "Let's look closer", mismatch: "Not quite", syntax: "Syntax error", runtime: "Runtime error" };

export function FeedbackBand({ attribution = "pass", label, misconceptionTitle, errorChip, errorMessage, reveal, children }) {
  const tone = attribution === "syntax" || attribution === "runtime" ? "error" : attribution;
  const v = (n) => "var(--attr-" + tone + "-" + n + ")";
  const icon = tone === "error" ? ICONS.bang : ICONS[attribution];
  return (
    <div className={"feedback feedback--" + attribution} aria-label="feedback" style={{
      borderRadius: "var(--radius-lg)", border: "1px solid " + v("border"), background: v("surface"),
      padding: "16px 20px 16px 56px", position: "relative", fontFamily: "var(--font-ui)", color: "var(--ink)",
    }}>
      <span aria-hidden="true" style={{ position: "absolute", left: "18px", top: "17px", width: "26px", height: "26px",
        borderRadius: "50%", background: v("ink"), display: "grid", placeItems: "center" }}>
        <svg width="14" height="14" viewBox="0 0 16 16">{icon}</svg>
      </span>
      <strong className="feedback-label" style={{ display: "block", fontFamily: "var(--font-display)",
        fontWeight: 700, fontSize: "17px", lineHeight: 1.55, color: v("ink") }}>{label || LABELS[attribution]}</strong>
      {misconceptionTitle && <span className="feedback-misconception-title" style={{ display: "inline-block",
        fontSize: "13px", fontWeight: 700, color: v("ink"), background: "rgba(255,255,255,.65)",
        border: "1px solid " + v("border"), borderRadius: "999px", padding: "3px 12px", margin: "4px 0 2px" }}>{misconceptionTitle}</span>}
      {errorChip && <span className="feedback-error-chip" style={{ display: "inline-block", fontFamily: "var(--font-code)",
        fontSize: "12.5px", fontWeight: 700, color: v("ink"), background: "rgba(255,255,255,.7)",
        borderRadius: "999px", padding: "2px 10px", margin: "6px 8px 2px 0" }}>{errorChip}</span>}
      {errorMessage && <p className="feedback-error-message" style={{ margin: "4px 0 0", fontFamily: "var(--font-code)", fontSize: "13.5px" }}>{errorMessage}</p>}
      {children && <p className="feedback-misconception" style={{ margin: "6px 0 0", fontSize: "15.5px", lineHeight: 1.6 }}>{children}</p>}
      {reveal && <p className="feedback-reveal" style={{ margin: "8px 0 0", fontFamily: "var(--font-code)", fontSize: "13.5px", color: "var(--ink-soft)" }}>{reveal}</p>}
    </div>
  );
}
