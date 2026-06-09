// artboards-feedback.jsx — Section 4: evaluating + the four feedback attributions

function EvaluatingBoard() {
  return (
    <Frame>
      <Shell step={4} total={4} kind="Build" title="Tying strings together with +">
        <div className="active-step">
          <section aria-label="build step">
            <div className="prompt">Write greet(name) so it returns a greeting like&nbsp; <code>Hi Alan!</code> — the word "Hi", then a space, then the name, then an exclamation mark. Glue the pieces with +.</div>
            <EdMock disabled lines={[
              { locked: true, src: <span><K>def</K> <F>greet</F>(name):</span> },
              { locked: true, src: <span>    <Cm># join "Hi", a space, the name, and "!" into one string</Cm></span> },
              { src: <span>    <K>return</K> <S>"Hi "</S> + name + <S>"!"</S></span> },
            ]} />
            <button type="button" disabled style={{ transform: "translateY(2px)" }}>Run &amp; check</button>
          </section>
        </div>
      </Shell>
      <SpecNote>EVALUATING phase (disabled=true). NO spinner, NO pulse, NO "thinking" — grading is deterministic and sub-second once warm. The button stays depressed &amp; disabled, editor dims to 75%, and the band arrives. If grading ever exceeds 400ms (cold edge case), nothing animates — the wait is simply short.</SpecNote>
    </Frame>
  );
}

function PassBoard() {
  return (
    <Frame>
      <Shell step={4} total={4} kind="Build" title="Tying strings together with +">
        <div className="active-step">
          <section aria-label="build step">
            <div className="prompt">Write greet(name) so it returns a greeting like&nbsp; <code>Hi Alan!</code> — the word "Hi", then a space, then the name, then an exclamation mark. Glue the pieces with +.</div>
            <EdMock lines={[
              { locked: true, src: <span><K>def</K> <F>greet</F>(name):</span> },
              { locked: true, src: <span>    <Cm># join "Hi", a space, the name, and "!" into one string</Cm></span> },
              { src: <span>    <K>return</K> <S>"Hi "</S> + name + <S>"!"</S></span> },
            ]} />
            <button type="button">Run &amp; check</button>
          </section>
        </div>
        <Feedback kind="pass" label="Correct" />
        <button type="button">Continue</button>
      </Shell>
      <SpecNote>pass — celebrate briefly, get out of the way. Band: green triad, check disc pops once (scale .3→1.18→1, 420ms spring) — the product's single moment of delight. No confetti, no streaks. Label only (one line max); Continue is the loudest element and takes keyboard focus. Also covers unanticipated-but-correct solutions: same treatment, no "unusual solution!" commentary.</SpecNote>
    </Frame>
  );
}

function MisconceptionBoard() {
  return (
    <Frame>
      <Shell step={4} total={4} kind="Build" title="When text meets a number">
        <div className="active-step">
          <section aria-label="build step">
            <div className="prompt">Write announce(number) so it returns a line like&nbsp; <code>Your random number is: 7</code> — the label, then the number turned into text. Use <code>str(...)</code> or an f-string.</div>
            <EdMock lines={[
              { locked: true, src: <span><K>def</K> <F>announce</F>(number):</span> },
              { locked: true, src: <span>    <Cm># join the label with the number (which is NOT text yet!)</Cm></span> },
              { src: <span>    <K>return</K> <S>"Your random number is: "</S> + number</span> },
            ]} />
            <button type="button">Run &amp; check</button>
          </section>
        </div>
        <Feedback kind="misconception" label="Let's look closer" title="Glued text directly to a number — expected Python to auto-convert">
          That's the big one! <code>"text" + number</code> crashes with a TypeError — Python will not secretly turn a number into text. You have to convert it yourself: wrap the number in <code>str(...)</code>, as in <code>"Your random number is: " + str(number)</code>, or use an f-string: <code>f"Your random number is: {"{number}"}"</code>. Both turn the number into text first.
        </Feedback>
        <Hints items={[]} action="Show a hint" />
        <button type="button">Try again</button>
      </Shell>
      <SpecNote>misconception — THE product's heart. Warm amber, never red: surface #FCF2DF is the creamiest of the four (closest to the page — the page leaning in, not an alert landing on it). Magnifier disc + Baloo "Let's look closer" + the diagnosis NAMED in a chip (⚑ approved addition: bundle.misconceptions[id].title). Authored feedback at full body size — this is teaching content, not an error string. Hint ladder at level 0 below.</SpecNote>
    </Frame>
  );
}

function MismatchBoard() {
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
            <fieldset disabled>
              <Choice name="m1" checked>Hi Alan</Choice>
              <Choice name="m1">HiAlan</Choice>
              <Choice name="m1">Hi name</Choice>
            </fieldset>
            <button type="button" disabled>Submit</button>
          </section>
        </div>
        <Feedback kind="mismatch" label="Not quite" reveal="Expected: HiAlan" />
        <button type="button">Try again</button>
      </Shell>
      <SpecNote>mismatch — wrong with no diagnosis. The QUIETEST band: olive triad, soft tilde icon, no body copy beyond the reveal. The predict run-and-show reveal (.feedback-reveal) is mono — it is program output. Choices stay visible but disabled (55%) so the learner can see what they picked. No shame copy, ever.</SpecNote>
    </Frame>
  );
}

function RuntimeBoard() {
  return (
    <Frame>
      <Shell step={5} total={5} kind="Build" title="Teach the computer your name">
        <div className="active-step">
          <section aria-label="build step">
            <div className="prompt">Write the conversation bot. Ask <code>What's your name? </code> with <code>input</code>, store the answer, then print <code>Hi &lt;name&gt;!</code> (one space after "Hi", a "!" at the end).</div>
            <EdMock lines={[
              { locked: true, src: <span><Cm># Ask for the name and store it, then greet.</Cm></span> },
              { src: <span>name = <F>int</F>(<F>input</F>(<S>"What's your name? "</S>))</span> },
              { src: <span><F>print</F>(<S>"Hi "</S> + name + <S>"!"</S>)</span> },
            ]} />
            <button type="button">Run &amp; check</button>
          </section>
        </div>
        <Feedback kind="runtime" label="Runtime error" errChip="ValueError · line 2" errMsg="invalid literal for int() with base 10: 'Alan'" />
        <button type="button">Try again</button>
      </Shell>
      <SpecNote>runtime — the code didn't finish, and NO misconception signature fired (this learner cargo-culted int(input(...)) from the numbers lesson onto a name — plausible, but outside the bot cell's taxonomy: both its misconceptions key on AST tags, not run errors). Raw-error treatment is the safety net: calm crimson, "!" disc (never a warning triangle), mono chip "Type · line N", interpreter message verbatim (⚑ flagged addition — FeedbackPanel doesn't render error details yet; data is on the Diagnosis). No traceback; the line number is the actionable part. NOTE: no hint button — ladders belong to misconceptions, so an undiagnosed error has none (HintPanel returns null on an empty ladder).</SpecNote>
    </Frame>
  );
}

function SyntaxBoard() {
  return (
    <Frame>
      <Shell step={4} total={4} kind="Build" title="Tying strings together with +">
        <div className="active-step">
          <section aria-label="build step">
            <div className="prompt">Write greet(name) so it returns a greeting like&nbsp; <code>Hi Alan!</code> — the word "Hi", then a space, then the name, then an exclamation mark. Glue the pieces with +.</div>
            <EdMock lines={[
              { locked: true, src: <span><K>def</K> <F>greet</F>(name):</span> },
              { locked: true, src: <span>    <Cm># join "Hi", a space, the name, and "!" into one string</Cm></span> },
              { src: <span>    <K>return</K> <S>"Hi "</S> + name <S>"!"</S></span> },
            ]} />
            <button type="button">Run &amp; check</button>
          </section>
        </div>
        <Feedback kind="syntax" label="Syntax error" errChip="SyntaxError · line 3" errMsg="invalid syntax" />
        <button type="button">Try again</button>
      </Shell>
      <SpecNote>syntax — same crimson family as runtime (both = "the code didn't run"), distinguished only by label + error type. No hint button here either: no diagnosis, no ladder. Optional editor affordance: a subtle red underline on the offending span via CM6 decoration — line-level only, no squiggle-storm.</SpecNote>
    </Frame>
  );
}

Object.assign(window, { EvaluatingBoard, PassBoard, MisconceptionBoard, MismatchBoard, RuntimeBoard, SyntaxBoard });
