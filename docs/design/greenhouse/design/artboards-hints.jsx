// artboards-hints.jsx — Section 5: the hint ladder, levels 1 → 4
// Boards show the feedback + ladder zone only (the build card above is
// unchanged — see Section 4 misconception board for full context).
// Ladder content: mis.concat.str_num (the marquee misconception).

const strNumFeedback = (
  <Feedback kind="misconception" label="Let's look closer" title="Glued text directly to a number — expected Python to auto-convert">
    That's the big one! <code>"text" + number</code> crashes with a TypeError — Python will not secretly turn a number into text. You have to convert it yourself: wrap the number in <code>str(...)</code>, or use an f-string.
  </Feedback>
);

const H1 = { level: 1, body: "Read the error. What two kinds of things did you try to glue together with +?" };
const H2 = { level: 2, body: "Text and numbers are different types. + can join text-to-text, but not text-to-number. You must convert the number to text first." };
const H3 = { level: 3, body: 'Two ways to convert: "...: " + str(number) turns the number into text, or an f-string f"...: {number}" drops it straight in.' };

function LadderZone({ children }) {
  return (
    <div className="cell-runner" style={{ padding: "32px 24px 40px" }}>
      {children}
    </div>
  );
}

function Ladder1Board() {
  return (
    <Frame>
      <LadderZone>
        {strNumFeedback}
        <Hints items={[H1]} action="Show a hint" />
        <button type="button">Try again</button>
      </LadderZone>
      <SpecNote>Level 1 pulled. Hints are PULLED, one per press — the button simply stays put and the next level appends. Each hint row: numbered Bluebell-tint disc (the level), white card. Newest row fades in + rises 6px (240ms); earlier rows never move. Button label stays "Show a hint" through level 3.</SpecNote>
    </Frame>
  );
}

function Ladder3Board() {
  return (
    <Frame>
      <LadderZone>
        {strNumFeedback}
        <Hints items={[H1, H2, H3]} action="Show full solution" />
        <button type="button">Try again</button>
      </LadderZone>
      <SpecNote>Levels 1–3 visible: the ladder reads as a stack — a visible record of how much help was taken, with zero judgment attached. At level 3 the ghost button relabels to "Show full solution" (the existing copy). Auto-raised floors (repeat misconception) render identically: rows simply arrive already open — no callout.</SpecNote>
    </Frame>
  );
}

function Ladder4ConfirmBoard() {
  return (
    <Frame>
      <LadderZone>
        {strNumFeedback}
        <Hints items={[H1, H2, H3]} confirm />
        <button type="button">Try again</button>
      </LadderZone>
      <SpecNote>The level-4 gate (.confirm). An inline sunken row — deliberately NOT a modal: low ceremony, no dimmed page, no scary "are you sure?!". Confirm = small primary; Cancel = quiet outline. The question copy is existing markup ("Show the full solution?").</SpecNote>
    </Frame>
  );
}

function Ladder4Board() {
  return (
    <Frame>
      <LadderZone>
        {strNumFeedback}
        <Hints items={[H1, H2, H3, {
          level: 4,
          body: "Solution:",
          solution: 'def announce(number):\n    return "Your random number is: " + str(number)',
        }]} />
        <button type="button">Try again</button>
      </LadderZone>
      <SpecNote>Level 4 revealed: .hint-4 gets a Bluebell border (it's special, not shameful) and .hint-solution renders as a terrarium block — solutions are real code and look like it. The pull button disappears (ladder exhausted). "Try again" remains: reading the solution still means typing it yourself. Ladder resets if the diagnosis changes (frozen semantics) — visually: old rows unmount with the band, fresh band + level-0 ladder animate in.</SpecNote>
    </Frame>
  );
}

Object.assign(window, { Ladder1Board, Ladder3Board, Ladder4ConfirmBoard, Ladder4Board });
