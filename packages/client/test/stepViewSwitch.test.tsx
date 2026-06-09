import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Step } from "@trellis/schema";
import { StepView } from "../src/steps/StepView.js";

const handlers = { onAdvance: vi.fn(), onSubmit: vi.fn(), onBuildChange: vi.fn(), onBuildSubmit: vi.fn() };

describe("StepView switch", () => {
  it("routes watch to the watch view", () => {
    const step: Step = { id: "w", kind: "watch", prompt: "p", skills: [], body: "the body" } as Step;
    render(<StepView step={step} disabled={false} buildCode="" {...handlers} />);
    expect(screen.getByText("the body")).toBeTruthy();
  });
  it("routes build to the build view (editor present)", () => {
    const step: Step = { id: "b", kind: "build", prompt: "p", skills: [], language: "python", starterCode: "code_here", evaluator: {} } as unknown as Step;
    const { container } = render(<StepView step={step} disabled={false} buildCode="code_here" {...handlers} />);
    expect(container.querySelector(".cm-content")).toBeTruthy();
  });
});
