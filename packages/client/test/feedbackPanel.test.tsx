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

describe("FeedbackPanel (§5.1 attribution-colored)", () => {
  it("shows a green 'Correct' band on pass", () => {
    render(<FeedbackPanel diagnosis={diag({ correct: true, attribution: "pass" })} />);
    const band = screen.getByLabelText("feedback");
    expect(band.textContent).toMatch(/correct/i);
    expect(band.getAttribute("style") ?? "").toContain("1a7f37");
  });

  it("shows the authored misconception feedback when present", () => {
    render(
      <FeedbackPanel
        diagnosis={diag({ attribution: "misconception", misconceptionId: "mis.concat.str_num" })}
        misconceptionFeedback="You added a number to a string."
      />,
    );
    expect(screen.getByText(/added a number to a string/i)).toBeTruthy();
  });

  it("shows the run-and-show reveal text for a predict step", () => {
    render(<FeedbackPanel diagnosis={diag({ attribution: "mismatch" })} revealText="The code printed: 2" />);
    expect(screen.getByText(/The code printed: 2/)).toBeTruthy();
  });
});
