import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Diagnosis } from "@trellis/schema";
import { FeedbackPanel } from "../src/feedback/FeedbackPanel.js";

function diag(over: Partial<Diagnosis>): Diagnosis {
  return {
    id: "d", learnerId: "L", stepId: "s", contentVersion: "v", submittedAt: "t",
    correct: false, attribution: "misconception", signals: { ran: true, wallMs: 1 },
    skillDeltas: [], seed: 0, ...over,
  };
}

describe("FeedbackPanel (§5.1 attribution-colored, Greenhouse markup)", () => {
  it("shows a 'Correct' band classed feedback--pass with NO inline style", () => {
    render(<FeedbackPanel diagnosis={diag({ correct: true, attribution: "pass" })} />);
    const band = screen.getByLabelText("feedback");
    expect(band.textContent).toMatch(/correct/i);
    expect(band.className).toBe("feedback feedback--pass");
    expect(band.getAttribute("style")).toBeNull();
  });

  it("classes the band by attribution (misconception is NEVER error-styled)", () => {
    render(<FeedbackPanel diagnosis={diag({ attribution: "misconception", misconceptionId: "mis.concat.str_num" })} />);
    const band = screen.getByLabelText("feedback");
    expect(band.className).toBe("feedback feedback--misconception");
  });

  it("shows the authored misconception feedback and title chip when present", () => {
    render(
      <FeedbackPanel
        diagnosis={diag({ attribution: "misconception", misconceptionId: "mis.concat.str_num" })}
        misconceptionTitle="Gluing text to a number"
        misconceptionFeedback="You added a number to a string."
      />,
    );
    expect(screen.getByText(/added a number to a string/i)).toBeTruthy();
    const chip = screen.getByText("Gluing text to a number");
    expect(chip.className).toBe("feedback-misconception-title");
    expect(chip.tagName).toBe("SPAN");
  });

  it("shows the run-and-show reveal text for a predict step", () => {
    render(<FeedbackPanel diagnosis={diag({ attribution: "mismatch" })} revealText="The code printed: 2" />);
    expect(screen.getByText(/The code printed: 2/)).toBeTruthy();
  });

  it("renders the error chip (type · line) + interpreter one-liner for runtime errors", () => {
    render(
      <FeedbackPanel
        diagnosis={diag({
          attribution: "runtime",
          signals: {
            ran: false, wallMs: 1,
            runError: { type: "runtime", message: 'TypeError: can only concatenate str (not "int") to str', line: 3 },
          },
        })}
      />,
    );
    const chip = screen.getByText("TypeError · line 3");
    expect(chip.className).toBe("feedback-error-chip");
    const msg = screen.getByText(/can only concatenate str/);
    expect(msg.className).toBe("feedback-error-message");
  });

  it("falls back to SyntaxError for syntax errors whose message has no class name", () => {
    render(
      <FeedbackPanel
        diagnosis={diag({
          attribution: "syntax",
          signals: { ran: false, wallMs: 1, runError: { type: "syntax", message: "invalid syntax", line: 1 } },
        })}
      />,
    );
    expect(screen.getByText("SyntaxError · line 1")).toBeTruthy();
  });

  it("renders no error chip on pass/misconception", () => {
    const { container } = render(
      <FeedbackPanel diagnosis={diag({ correct: true, attribution: "pass" })} />,
    );
    expect(container.querySelector(".feedback-error-chip")).toBeNull();
    expect(container.querySelector(".feedback-error-message")).toBeNull();
  });
});
