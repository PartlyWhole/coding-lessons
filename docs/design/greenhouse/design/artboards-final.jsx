// artboards-final.jsx — Section 6: peek-back & completion · Section 7: phone · Section 8: course map

const botEntries = [
  { kind: "watch", prompt: "The computer wants to talk back", carry: <span><code>input("prompt")</code> shows the prompt and returns the line the user typed.</span> },
  { kind: "predict", outcome: "pass", prompt: "The user types Alan. What does this program print after the prompt?" },
  { kind: "watch", prompt: "Catch the answer in a box", carry: <span>Store input so you can reuse it: <code>name = input("...")</code>.</span> },
  { kind: "recognize", outcome: "misconception", prompt: "Which line keeps the answer?" },
];

function PeekClosedBoard() {
  return (
    <Frame>
      <div className="cell-runner" style={{ padding: "32px 24px 40px" }}>
        <PeekBack open={false} />
      </div>
      <SpecNote>Collapsed (default). A quiet ghost button behind a dashed divider — present, never competing with the active step. Disabled (faint) while the cell has no history. Opening it is a struggle signal the runner records; the UI must NOT make it feel monitored — no badge, no counter.</SpecNote>
    </Frame>
  );
}

function PeekOpenBoard() {
  return (
    <Frame>
      <div className="cell-runner" style={{ padding: "32px 24px 40px" }}>
        <PeekBack open entries={botEntries} />
      </div>
      <SpecNote>Expanded. Entries are sunken (recessed = the past), read-only, in step order: outcome dot in the final attribution ink (update attribution.ts hexes to the --attr-*-ink tokens), bold .peek-prompt, .peek-carry summary, kind chip from the existing kind-* class (CSS ::after, no markup change). Watch entries have no dot. Expand: height auto + fade, 240ms.</SpecNote>
    </Frame>
  );
}

function CompleteBoard() {
  return (
    <Frame>
      <Shell step={4} total={4} kind="Build" title="Teach the computer your name">
        <div className="cell-complete">Cell complete ✓</div>
        <PeekBack open={false} />
      </Shell>
      <SpecNote>.cell-complete — the cell's closing note: pass-green band in Baloo, gentle pop (scale .96→1.015→1, 420ms spring). All four pips now solid Bluebell. Bigger celebration belongs to the future course map (node unlocks), not here — cells finish often.</SpecNote>
    </Frame>
  );
}

function PhoneBoard() {
  return (
    <Frame>
      <div style={{ maxWidth: "390px" }}>
        <Shell narrow step={2} total={4} kind="Predict" title="Tying strings together with +">
          <div className="active-step">
            <section aria-label="predict step">
              <div className="prompt" style={{ fontSize: "18px" }}>The computer is about to greet Alan. What gets printed?</div>
              <div style={{ margin: "0 -16px" }}>
                <div className="editor-pane" style={{ borderRadius: 0 }}>
                  <div className="ed-body">
                    <div className="ed-line"><span className="ed-num">1</span><span className="ed-src">name = <S>"Alan"</S></span></div>
                    <div className="ed-line"><span className="ed-num">2</span><span className="ed-src"><F>print</F>(<S>"Hi"</S> + name)</span></div>
                  </div>
                </div>
              </div>
              <fieldset>
                <Choice name="ph1">Hi Alan</Choice>
                <Choice name="ph1" checked>HiAlan</Choice>
                <Choice name="ph1">Hi name</Choice>
              </fieldset>
              <button type="button" style={{ alignSelf: "stretch", textAlign: "center" }}>Submit</button>
            </section>
          </div>
        </Shell>
      </div>
      <SpecNote>≤560px (stretch goal, handled by the two @media blocks in trellis-ui.css): display 24px / prompt 18px, card padding 16px, code blocks &amp; editor go full-bleed (negative margin, radius 0), primary button stretches full-width. Choice rows already exceed the 44px hit target. Tablet (560–880px) keeps the desktop layout with tightened padding.</SpecNote>
    </Frame>
  );
}

// ---------------- Course map — directional concept ----------------
function MapNode({ state, title, sub, x, y, w }) {
  const ring = state === "active";
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: w || 240,
      background: state === "locked" ? "var(--surface-sunken)" : "var(--surface)",
      border: ring ? "2.5px solid var(--accent)" : "1px solid var(--line)",
      borderRadius: "18px", padding: "14px 18px",
      boxShadow: state === "locked" ? "none" : "var(--shadow-1)",
      opacity: state === "locked" ? .75 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {state === "done" && (
          <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--attr-pass-ink)", flex: "none", display: "grid", placeItems: "center" }}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        )}
        {state === "locked" && <span style={{ fontSize: "11px" }}>🔒</span>}
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px", color: state === "locked" ? "var(--ink-faint)" : "var(--ink)" }}>{title}</span>
      </div>
      {sub && <div style={{ fontSize: "12.5px", color: "var(--ink-soft)", marginTop: "3px" }}>{sub}</div>}
      {ring && (
        <div style={{ display: "flex", gap: "5px", marginTop: "10px" }}>
          <span className="pip is-done" style={{ width: "26px", height: "7px", borderRadius: "99px", background: "var(--accent)", display: "inline-block" }}></span>
          <span style={{ width: "26px", height: "7px", borderRadius: "99px", background: "var(--line-strong)", opacity: .6, display: "inline-block" }}></span>
        </div>
      )}
    </div>
  );
}

function CourseMapBoard() {
  return (
    <Frame>
      <div style={{ position: "relative", height: "660px", fontFamily: "var(--font-ui)" }}>
        <div style={{ position: "absolute", left: "40px", top: "32px", display: "flex", alignItems: "center", gap: "12px" }}>
          <TGlyph size={26} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "22px" }}>Your trellis</span>
        </div>
        {/* vine spine */}
        <svg width="900" height="660" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
          <path d="M 330 120 C 330 170, 330 180, 330 230 C 330 290, 330 300, 330 350 C 330 410, 330 420, 330 470 C 330 530, 330 540, 330 580" stroke="#BFD9C8" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" fill="none" />
          <path d="M 450 370 C 530 370, 560 330, 600 320" stroke="#BFD9C8" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" fill="none" />
        </svg>
        <MapNode state="done" title="Output" sub="print(), strings on screen" x={210} y={88} />
        <MapNode state="done" title="Variables" sub="name = value" x={210} y={208} />
        <MapNode state="active" title="Gluing text together" sub="Cell 2 of 2 · When text meets a number" x={210} y={326} w={250} />
        <MapNode state="locked" title="The conversation bot — input()" sub="Unlocks after Gluing text" x={210} y={462} w={250} />
        <MapNode state="locked" title="Random" sub="Extension · unlocks with input()" x={600} y={282} w={210} />
        {/* unlock toast */}
        <div style={{
          position: "absolute", left: "560px", top: "120px", width: "270px",
          background: "var(--surface)", border: "1px solid var(--attr-pass-border)",
          borderRadius: "16px", padding: "14px 18px", boxShadow: "var(--shadow-2)",
        }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "15px", color: "var(--attr-pass-ink)" }}>New on the trellis</div>
          <div style={{ fontSize: "14px", color: "var(--ink)", marginTop: "2px" }}>You just unlocked <strong>Random</strong>.</div>
        </div>
      </div>
      <SpecNote>DIRECTIONAL ONLY (future scope, not in the current slice). The garden framing: nodes grow up a dotted vine; done = leaf-check, active = Bluebell ring + cell pips, locked = sunken card + lock with an honest unlock condition. Extensions branch sideways. Unlock moment = a toast here, not inside the cell flow. No percentage scores, no streak counters — mastery stays backstage.</SpecNote>
    </Frame>
  );
}

Object.assign(window, { PeekClosedBoard, PeekOpenBoard, CompleteBoard, PhoneBoard, CourseMapBoard });
