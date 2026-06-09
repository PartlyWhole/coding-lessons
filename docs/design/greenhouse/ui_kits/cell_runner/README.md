# UI kit — Cell Runner

One interactive screen of the Trellis Cell Runner (the product's core view), built on
`styles.css` → `design/trellis-ui.css` with the client's real classNames — markup here
can be diffed against `packages/client/src/CellRunner.tsx` almost 1:1.

Interactions (fake, cosmetic): the state strip at top jumps between
build / evaluating / misconception / pass / complete; **Run & check** plays the real
sequence (depress → 450ms evaluating → misconception band arrives); the hint ladder
pulls levels 1–3, gates level 4 behind the inline confirm, and reveals the solution.

For the complete state matrix (all five step kinds, all four attributions, peek-back,
app states, phone), see the 25-artboard canvas at `design/Cell Runner.html`.
