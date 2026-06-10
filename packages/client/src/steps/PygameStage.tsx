import { useEffect, useRef, useState } from "react";
import type { BuildStep } from "@trellis/schema";
import type { StallEvent } from "@trellis/runtime";
import type { ClientPygameRuntime } from "../types.js";
import { EditorPane } from "../editor/EditorPane.js";
import { attributionStyle } from "../attribution.js";

export interface PygameStageProps {
  step: BuildStep;
  code: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onSubmit: () => void;
  /** M6 E1 — telemetry-only: called once per Run press (incl. stall Reset). Optional;
      absent → behavior identical. The submit path is a submission, not a run press. */
  onRun?: () => void;
  runtime: ClientPygameRuntime;
}

// §17.3 — the pygame play surface. Owns NO grading/hint logic: it wraps canvas +
// EditorPane + the runtime lifecycle mapped onto the step machine (mount→boot+start,
// Run→restart, submit→stop THEN grade, unmount→dispose). Grading stays headless in
// the worker (runner/grade.ts); the Greenhouse §5/§9 semantics are untouched.
export function PygameStage({ step, code, disabled, onChange, onSubmit, onRun, runtime }: PygameStageProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;
  // A play-path notice rendered in the FROZEN feedback register: refusals are
  // syntax-flavored (§17.5 — a deterministic rejection), play errors runtime-flavored.
  const [notice, setNotice] = useState<{ kind: "syntax" | "runtime"; text: string } | null>(null);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    let alive = true;
    runtime.setOnStall((_e: StallEvent) => {
      if (alive) setStalled(true);
    });
    (async () => {
      if (canvasRef.current === null) return;
      await runtime.boot(canvasRef.current);
      if (!alive) return;
      const r = await runtime.start(codeRef.current);
      if (alive && !r.ok) {
        setNotice(
          r.refusal !== undefined
            ? { kind: "syntax", text: r.refusal }
            : { kind: "runtime", text: r.error ?? "The game could not start." },
        );
      }
    })().catch(() => {
      // boot failures surface on the next Run; never throw across the React boundary
    });
    return () => {
      alive = false;
      runtime.dispose(); // generation bump kills the loop (§17.3 row 4)
    };
    // mount-once: the step remounts under a new key on advance (§5.2); runtime is
    // mount-stable by contract (created once in main.tsx)
  }, []);

  async function run(): Promise<void> {
    if (disabled) return;
    onRun?.(); // M6 E1 — telemetry announce only; everything below is unchanged
    setStalled(false);
    setNotice(null);
    const r = await runtime.restart(codeRef.current);
    if (!r.ok) {
      setNotice(
        r.refusal !== undefined
          ? { kind: "syntax", text: r.refusal }
          : { kind: "runtime", text: r.error ?? "The game could not start." },
      );
    }
  }

  return (
    <section aria-label="pygame build step">
      <div className="prompt">{step.prompt}</div>
      {/* §17.2 — id="canvas" matches SDL_EMSCRIPTEN_KEYBOARD_ELEMENT="#canvas" in the
          locked preamble; tabIndex scopes keyboard capture to the focused canvas so
          the editor stays typeable. */}
      <canvas id="canvas" tabIndex={0} className="pygame-canvas" ref={canvasRef} />
      {stalled && (
        <div role="status" className="pygame-stall">
          <span>The game stopped responding — </span>
          <button type="button" onClick={() => void run()}>
            Reset
          </button>
        </div>
      )}
      {/* The editor is always typeable (no readOnly — see EditorPane); submission legality
          is governed by the buttons + step machine, never the editor (Task 14 finding). */}
      <EditorPane
        value={code}
        onChange={onChange}
        {...(step.lockedRegions ? { lockedRegions: step.lockedRegions } : {})}
      />
      {notice !== null && (
        <div aria-label="feedback" className={`feedback feedback--${notice.kind}`}>
          <strong className="feedback-label">{attributionStyle(notice.kind).label}</strong>
          <p className="feedback-error-message">{notice.text}</p>
        </div>
      )}
      <button type="button" disabled={disabled} onClick={() => void run()}>
        Run
      </button>
      {/* Guard mirrors BuildStepView: no submit may fire while disabled. The runtime
          stops BEFORE grading starts — playback never overlaps the worker run. */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setNotice(null); // a stale play-path notice must not sit beside grading feedback
          runtime.stop();
          onSubmit();
        }}
      >
        Run &amp; check
      </button>
    </section>
  );
}
