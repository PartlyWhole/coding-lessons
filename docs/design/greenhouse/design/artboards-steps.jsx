// artboards-steps.jsx — Section 3: the five step kinds, real content from
// content/nodes/string_concat.yaml and input.yaml

function WatchBoard() {
  return (
    <Frame>
      <Shell step={1} total={4} kind="Watch" title="Tying strings together with +">
        <div className="active-step">
          <section aria-label="watch step">
            <div className="prompt">The + that glues text</div>
            <div className="body">
              <p>You already know a string is text in quotes. Here is the trick: the same <code>+</code> you'd use on numbers also <strong>ties strings together</strong> end to end.</p>
              <EdMock
                lines={[{ src: <span><F>print</F>(<S>"This "</S> + <S>"is"</S> + <S>" cool!"</S>)</span> }]}
                output="This is cool!"
              />
              <p style={{ marginTop: "16px" }}>The computer is greedy — it does <strong>NOT</strong> sprinkle in spaces for you. Every space you want in the output has to live <strong>inside the quotes</strong>. Look closely: that's <code>"This "</code> with a space tucked in before the closing quote, and <code>" cool!"</code> with a space right after the opening quote. Leave them out and the words slam together.</p>
            </div>
            <button type="button">Continue</button>
          </section>
        </div>
        <PeekBack open={false} />
      </Shell>
      <SpecNote>watch = read &amp; continue, nothing evaluable. The worked example renders as a terrarium block with its captured stdout docked below — output is always "what came out the bottom." ⚑ step.body is markdown-ish text: render with a tiny md subset (bold, inline code, indented code → block). Peek-back button disabled state shown (no history yet): faint, no hover.</SpecNote>
    </Frame>
  );
}

function PredictBoard() {
  return (
    <Frame>
      <Shell step={2} total={4} kind="Predict" title="Tying strings together with +">
        <div className="active-step">
          <section aria-label="predict step">
            <div className="prompt">The computer is about to greet Alan. What gets printed?</div>
            <EdMock lines={[
              { src: <span>name = <S>"Alan"</S></span> },
              { src: <span><F>print</F>(<S>"Hi"</S> + name)</span> },
            ]} />
            <fieldset>
              <Choice name="p1">Hi Alan</Choice>
              <Choice name="p1" checked>HiAlan</Choice>
              <Choice name="p1">Hi name</Choice>
            </fieldset>
            <button type="button">Submit</button>
          </section>
        </div>
        <PeekBack open={false} />
      </Shell>
      <SpecNote>predict-with-choices. Code block is read-only display (pre.code treatment = terrarium, no gutter). Choice = whole-row tap target (min 52px), 2px border; selected = Bluebell border + tint fill + filled radio. Submit disabled (sunken gray, no under-shadow) until a choice is made.</SpecNote>
    </Frame>
  );
}

function PredictTextBoard() {
  return (
    <Frame>
      <Shell step={2} total={4} kind="Predict" title="Tying strings together with +">
        <div className="active-step">
          <section aria-label="predict step">
            <div className="prompt">What exactly does this print?</div>
            <EdMock lines={[
              { src: <span>name = <S>"Alan"</S></span> },
              { src: <span><F>print</F>(<S>"Hi"</S> + name)</span> },
            ]} />
            <input type="text" aria-label="prediction" placeholder="Type exactly what gets printed…" defaultValue="" />
            <button type="button">Submit</button>
          </section>
        </div>
      </Shell>
      <SpecNote>Free-text predict variant (no choices). Input is mono — the learner is typing program output, so it should look like output. Placeholder in UI font ⚑ (new attr). Matching is normalized by the engine; no live validation theatrics.</SpecNote>
    </Frame>
  );
}

function RecognizeBoard() {
  return (
    <Frame>
      <Shell step={4} total={5} kind="Recognize" title="Teach the computer your name">
        <div className="active-step">
          <section aria-label="recognize step">
            <div className="prompt">You want to remember what the user types so you can greet them by name. Which line keeps the answer?</div>
            <fieldset>
              <Choice name="r1" checked><code>name = input("What's your name? ")</code></Choice>
              <Choice name="r1"><code>input("What's your name? ")</code></Choice>
              <Choice name="r1"><code>input = "What's your name? "</code></Choice>
              <Choice name="r1"><code>name = "Alan"</code></Choice>
            </fieldset>
            <button type="button">Submit</button>
          </section>
        </div>
        <PeekBack open={false} />
      </Shell>
      <SpecNote>Code-flavored choices render as inline-code chips inside the row (14.5px mono on a white chip) — distinguishable from the terrarium: these are options to judge, not a program that ran. Distractors map to misconceptions invisibly; all rows look identical in weight (no tells).</SpecNote>
    </Frame>
  );
}

function RecallBoard() {
  return (
    <Frame>
      <Shell step={4} total={5} kind="Recall" title="When the answer is a number">
        <div className="active-step">
          <section aria-label="recall step">
            <div className="prompt">Fill the blank so age is a number you can do math with:</div>
            <EdMock lines={[
              { src: <span>age = <span style={{ background: "var(--code-selection)", borderRadius: "3px", padding: "0 2px" }}>____</span>(<F>input</F>(<S>"Your age? "</S>))</span> },
            ]} />
            <input type="text" aria-label="answer" defaultValue="int" style={{ maxWidth: "200px" }} />
            <button type="button">Submit</button>
          </section>
        </div>
        <PeekBack open={false} />
      </Shell>
      <SpecNote>recall = short typed answer. The blank in the code display gets the selection highlight so eye lands where the answer goes. Short input width (200px) signals "one word, not an essay." Engine normalizes case/whitespace — say so nowhere; just accept.</SpecNote>
    </Frame>
  );
}

function BuildBoard() {
  return (
    <Frame>
      <Shell step={4} total={4} kind="Build" title="Tying strings together with +">
        <div className="active-step">
          <section aria-label="build step">
            <div className="prompt">Write greet(name) so it returns a greeting like&nbsp; <code>Hi Alan!</code> — the word "Hi", then a space, then the name, then an exclamation mark. Glue the pieces with +.</div>
            <EdMock lines={[
              { locked: true, src: <span><K>def</K> <F>greet</F>(name):</span> },
              { locked: true, src: <span>    <Cm># join "Hi", a space, the name, and "!" into one string</Cm></span> },
              { active: true, src: <span>    <K>return</K> <S>""</S><Caret /></span> },
            ]} />
            <button type="button">Run &amp; check</button>
          </section>
        </div>
        <PeekBack open={false} />
      </Shell>
      <SpecNote>The marquee step. Editor = CodeMirror themed per the mapping block in trellis-ui.css. Locked scaffolding: dashed rail + gutter lock + dimmed text — "rails of the trellis," firmly not yours to edit (arrow cursor, edits rejected silently by the extension). Active line tint + Bluebell caret. Button copy stays "Run &amp; check" — it runs, it checks, deterministically.</SpecNote>
    </Frame>
  );
}

Object.assign(window, { WatchBoard, PredictBoard, PredictTextBoard, RecognizeBoard, RecallBoard, BuildBoard });
