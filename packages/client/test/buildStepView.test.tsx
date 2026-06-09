import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuildStep } from "@trellis/schema";
import { BuildStepView } from "../src/steps/BuildStepView.js";

const step: BuildStep = {
  id: "b", kind: "build", prompt: "Write announce()", skills: ["skill.x"], language: "python",
  starterCode: "def announce(number):\n    return ...", evaluator: {} as BuildStep["evaluator"],
};

describe("BuildStepView", () => {
  it("renders the prompt + an editor seeded with the current code and a Submit button", () => {
    const { container } = render(
      <BuildStepView step={step} code={step.starterCode} disabled={false} onChange={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText(/Write announce/)).toBeTruthy();
    expect(container.querySelector(".cm-content")!.textContent).toContain("def announce");
    expect(screen.getByRole("button", { name: /submit|run|check/i })).toBeTruthy();
  });

  it("calls onSubmit when the run/submit button is pressed", async () => {
    const onSubmit = vi.fn();
    render(<BuildStepView step={step} code={step.starterCode} disabled={false} onChange={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /submit|run|check/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
