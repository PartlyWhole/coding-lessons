// artboards-core.jsx — Section 1 (layout anatomy) + Section 2 (app states)

// numbered annotation dot, placed in the left gutter of the anatomy mock
function Dot({ n, top }) {
  return (
    <span style={{
      position: "absolute", left: "-38px", top: top, width: "26px", height: "26px",
      borderRadius: "50%", background: "#39437E", color: "#fff", fontFamily: "var(--font-ui)",
      fontWeight: 800, fontSize: "13px", display: "grid", placeItems: "center", zIndex: 3,
    }}>{n}</span>
  );
}

function AnatomyNote({ n, title, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: "12px", alignItems: "start" }}>
      <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#39437E", color: "#fff", fontWeight: 800, fontSize: "13px", display: "grid", placeItems: "center" }}>{n}</span>
      <div style={{ fontSize: "13.5px", lineHeight: 1.55, color: "var(--ink)" }}>
        <strong style={{ display: "block" }}>{title}</strong>
        <span style={{ color: "var(--ink-soft)" }}>{children}</span>
      </div>
    </div>
  );
}

function AnatomyBoard() {
  return (
    <Frame>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "0" }}>
        <div style={{ position: "relative", paddingLeft: "44px" }}>
          <Shell step={4} total={4} kind="Build" title="When text meets a number">
            <div className="active-step" style={{ position: "relative" }}>
              <Dot n={1} top="-46px" />
              <Dot n={2} top="8px" />
              <section aria-label="build step">
                <div className="prompt" style={{ position: "relative" }}>
                  Write announce(number) so it returns a line like&nbsp; <code>Your random number is: 7</code> — the label, then the number turned into text. Use <code>str(...)</code> or an f-string.
                </div>
                <div style={{ position: "relative" }}>
                  <Dot n={3} top="14px" />
                  <EdMock lines={[
                    { locked: true, src: <span><K>def</K> <F>announce</F>(number):</span> },
                    { locked: true, src: <span>    <Cm># join the label with the number (which is NOT text yet!)</Cm></span> },
                    { active: true, src: <span>    <K>return</K> <S>"Your random number is: "</S> + number<Caret /></span> },
                  ]} />
                </div>
                <button type="button">Run &amp; check</button>
              </section>
            </div>
            <div style={{ position: "relative" }}>
              <Dot n={4} top="14px" />
              <Feedback kind="misconception" label="Let's look closer" title="Glued text directly to a number — expected Python to auto-convert">
                That's the big one! <code>"text" + number</code> crashes with a TypeError — Python will not secretly turn a number into text. You have to convert it yourself: wrap the number in <code>str(...)</code>, or use an f-string: <code>f"Your random number is: {"{number}"}"</code>.
              </Feedback>
            </div>
            <div style={{ position: "relative" }}>
              <Dot n={5} top="10px" />
              <Hints items={[{ level: 1, body: "Read the error. What two kinds of things did you try to glue together with +?" }]} action="Show a hint" />
            </div>
            <button type="button">Try again</button>
            <div style={{ position: "relative" }}>
              <Dot n={6} top="14px" />
              <PeekBack open={false} />
            </div>
          </Shell>
        </div>
        <div style={{ borderLeft: "2px dashed #B9C4F0", background: "#F6F8FE", padding: "28px 24px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "12px", letterSpacing: ".12em", textTransform: "uppercase", color: "#39437E" }}>Anatomy — single centered column, 720px</div>
          <AnatomyNote n={1} title="Cell header">Eyebrow (step count + kind badge), progress pips, then .cell-title in Baloo 2. ⚑ NEW elements — purely presentational; step index &amp; cell.steps.length already in runner scope.</AnatomyNote>
          <AnatomyNote n={2} title=".active-step card">White, radius-xl, shadow-1, 32px padding, 20px internal stack. One card = one thing to do. Remounts on advance (keyed) — entrance: fade + rise 14px, 240ms.</AnatomyNote>
          <AnatomyNote n={3} title=".editor-pane — the terrarium">Always shadow-2 (heaviest object on the page). Locked lines: dashed left rail + 🔒 in gutter + 72% text. Caret &amp; selection in Bluebell.</AnatomyNote>
          <AnatomyNote n={4} title=".feedback band">Soft fill, icon disc + Baloo label; amber = warm invitation, never red. Misconception title chip ⚑ approved addition. Sits directly under the card it judges.</AnatomyNote>
          <AnatomyNote n={5} title="Hint ladder">Ghost button — quieter than the primary action. Revealed hints stack as numbered rows; newest animates in.</AnatomyNote>
          <AnatomyNote n={6} title=".peek-back">Below everything, behind a dashed divider — history is reachable but visually subordinate. Expands in place.</AnatomyNote>
          <div style={{ fontSize: "12.5px", fontFamily: "var(--font-code)", color: "#39437E", background: "#EEF2FE", borderRadius: "10px", padding: "10px 14px", lineHeight: 1.6 }}>
            Column order = DOM order (no CSS reordering): title → step → feedback → hints → continue/retry → peek-back. Keyboard &amp; screen-reader flow matches visual flow.
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ---------------- App states ----------------
function LoadingBoard() {
  return (
    <Frame>
      <div className="app-state app-loading">
        <TGlyph />
        <div className="app-status">Loading…</div>
      </div>
      <SpecNote>TrellisApp's bare &lt;div&gt;Loading…&lt;/div&gt; → wrap as .app-state.app-loading (⚑ className addition only). Centered, no spinner — bundle fetch is fast; this state usually lasts &lt;300ms. Glyph is static.</SpecNote>
    </Frame>
  );
}

function WarmingBoard() {
  return (
    <Frame>
      <div className="app-state app-warming">
        <TGlyph />
        <div className="app-status">Getting Python ready…</div>
        <div className="warm-bar"><i></i></div>
        <div className="app-sub">First visit takes a few seconds. After this, checking your code is instant.</div>
      </div>
      <SpecNote>The once-per-session runtime warm-up. Honest copy, no fake percentages. The bar is the only looping animation in the product (it is genuinely waiting); reduced-motion swaps it for a static 35%-opacity fill. Determinism note: never say "thinking".</SpecNote>
    </Frame>
  );
}

function ErrorBoard() {
  return (
    <Frame>
      <div className="app-state">
        <div role="alert" className="app-error">
          <div className="app-status">Couldn't load this lesson</div>
          <p style={{ margin: "8px 0 4px", fontSize: "15px", lineHeight: 1.6 }}>
            Your progress is safe on this device. Check your connection and reload the page.
          </p>
          <p style={{ margin: 0 }}><code>Failed to load: bundle fetch failed (404)</code></p>
        </div>
      </div>
      <SpecNote>role="alert" kept. Calm error register (same crimson family as runtime errors — factual, not alarming). Headline + reassurance are ⚑ NEW copy; the existing "Failed to load: {"{message}"}" string stays, demoted to mono detail.</SpecNote>
    </Frame>
  );
}

Object.assign(window, { AnatomyBoard, LoadingBoard, WarmingBoard, ErrorBoard });
