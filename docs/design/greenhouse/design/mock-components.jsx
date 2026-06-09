// mock-components.jsx — shared pieces for the Cell Runner canvas mockups.
// All product markup uses the REAL classNames from the client components,
// so design/trellis-ui.css doubles as the implementation spec.

// ---- syntax token helpers ----
function K({ children }) { return <span className="tok-kw">{children}</span>; }
function S({ children }) { return <span className="tok-str">{children}</span>; }
function Nm({ children }) { return <span className="tok-num">{children}</span>; }
function F({ children }) { return <span className="tok-fn">{children}</span>; }
function Cm({ children }) { return <span className="tok-com">{children}</span>; }
function Caret() { return <span className="ed-caret"></span>; }

// ---- artboard frame (paper background) ----
function Frame({ children, pad }) {
  return <div style={{ background: "var(--paper)", padding: pad === undefined ? 0 : pad, minHeight: "100%" }}>{children}</div>;
}

// ---- cell shell: eyebrow + pips + title (real .cell-runner markup) ----
function Shell({ step, total, kind, title, children, narrow }) {
  const pips = [];
  for (let i = 1; i <= total; i++) {
    pips.push(<span key={i} className={"pip" + (i < step ? " is-done" : i === step ? " is-now" : "")}></span>);
  }
  return (
    <div className="cell-runner" style={narrow ? { maxWidth: "none", padding: "24px 16px 48px" } : undefined}>
      <div className="cell-eyebrow">
        <span>Step {step} of {total}</span>
        <span className="cell-kind-badge">{kind}</span>
      </div>
      <div className="cell-progress">{pips}</div>
      <h2 className="cell-title">{title}</h2>
      {children}
    </div>
  );
}

// ---- editor mock ----
function EdMock({ lines, output, disabled }) {
  return (
    <div className={"editor-pane" + (disabled ? " is-disabled" : "")}>
      <div className="ed-body">
        {lines.map((l, i) => (
          <div key={i} className={"ed-line" + (l.locked ? " locked" : "") + (l.active ? " active" : "")}>
            <span className="ed-num">{i + 1}</span>
            <span className="ed-src">{l.src}</span>
          </div>
        ))}
      </div>
      {output !== undefined && (
        <div className="ed-console">
          <div className="ed-console-label">Output</div>
          <pre className="ed-console-out">{output}</pre>
        </div>
      )}
    </div>
  );
}

// ---- feedback band (real FeedbackPanel markup + approved additions) ----
function Feedback({ kind, label, title, errChip, errMsg, children, reveal }) {
  return (
    <div aria-label="feedback" className={"feedback feedback--" + kind} role="presentation">
      <strong className="feedback-label">{label}</strong>
      {title && <span className="feedback-misconception-title">{title}</span>}
      {errChip && <span className="feedback-error-chip">{errChip}</span>}
      {errMsg && <p className="feedback-error-message">{errMsg}</p>}
      {children && <p className="feedback-misconception">{children}</p>}
      {reveal && <p className="feedback-reveal">{reveal}</p>}
    </div>
  );
}

// ---- hint ladder (real HintPanel markup) ----
function Hints({ items, action, confirm, note }) {
  return (
    <aside aria-label="hints">
      {items.length > 0 && (
        <ol className="hints">
          {items.map((h, i) => (
            <li key={i} className={"hint hint-" + h.level}>
              <div className="hint-body">{h.body}</div>
              {h.solution && <pre className="hint-solution">{h.solution}</pre>}
            </li>
          ))}
        </ol>
      )}
      {confirm ? (
        <div className="confirm">
          <span>Show the full solution?</span>
          <button type="button">Confirm</button>
          <button type="button">Cancel</button>
        </div>
      ) : action ? (
        <button type="button">{action}</button>
      ) : null}
      {note}
    </aside>
  );
}

// ---- choice row (real fieldset/label/radio markup) ----
function Choice({ name, checked, children }) {
  return (
    <label>
      <input type="radio" name={name} defaultChecked={!!checked} />
      <span>{children}</span>
    </label>
  );
}

// ---- peek-back (real PeekBackPanel markup) ----
function PeekBack({ open, entries }) {
  return (
    <aside aria-label="peek-back" className="peek-back">
      <button type="button">{open ? "Hide review" : "Review earlier steps"}</button>
      {open && (
        <ol className="peek-entries">
          {entries.map((e, i) => (
            <li key={i} className={"peek-entry kind-" + e.kind}>
              {e.outcome && <span className="peek-outcome" style={{ color: "var(--attr-" + e.outcome + "-ink)" }}>●</span>}
              <div className="peek-prompt">{e.prompt}</div>
              {e.carry && <div className="peek-carry">{e.carry}</div>}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

// ---- spec note (annotation, visually distinct from product UI) ----
function SpecNote({ children }) {
  return (
    <div style={{
      margin: "0", padding: "12px 16px", display: "flex", gap: "10px", alignItems: "flex-start",
      background: "#EEF2FE", borderTop: "2px dashed #B9C4F0",
      fontFamily: "var(--font-code)", fontSize: "12px", lineHeight: 1.65, color: "#39437E",
    }}>
      <span style={{ fontWeight: 700, background: "#39437E", color: "#fff", borderRadius: "4px", padding: "1px 7px", fontSize: "10.5px", letterSpacing: ".08em", flex: "none", marginTop: "2px" }}>SPEC</span>
      <div>{children}</div>
    </div>
  );
}

// ---- trellis glyph (brand mark for app states / course map) ----
function TGlyph({ size }) {
  const s = size || 34;
  return (
    <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: Math.round(s / 10) + "px", width: s + "px", height: s + "px", transform: "rotate(45deg)" }}>
      <span style={{ borderRadius: "22%", background: "var(--accent)" }}></span>
      <span style={{ borderRadius: "22%", background: "#57A773" }}></span>
      <span style={{ borderRadius: "22%", background: "#57A773", opacity: .55 }}></span>
      <span style={{ borderRadius: "22%", background: "var(--accent)", opacity: .55 }}></span>
    </div>
  );
}

Object.assign(window, { K, S, Nm, F, Cm, Caret, Frame, Shell, EdMock, Feedback, Hints, Choice, PeekBack, SpecNote, TGlyph });
