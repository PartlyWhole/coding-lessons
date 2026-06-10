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

// M6.5 — pygame routing (the single injection point). Absent runtime → frozen behavior.
describe("BuildStepView pygame routing", () => {
  const pgStep: BuildStep = {
    ...step,
    id: "b.pg",
    runtime: "pygame",
  };
  const fakeRuntime = {
    boot: async () => {},
    start: async () => ({ ok: true }),
    restart: async () => ({ ok: true }),
    stop: () => {},
    dispose: () => {},
    setOnStall: () => {},
  };

  it("routes runtime:'pygame' + injected runtime to PygameStage (canvas present)", () => {
    const { container } = render(
      <BuildStepView
        step={pgStep}
        code={pgStep.starterCode}
        disabled={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        pygameRuntime={fakeRuntime}
      />,
    );
    expect(container.querySelector("canvas#canvas")).toBeTruthy();
  });

  it("renders the standard build view when no runtime is injected (frozen default)", () => {
    const { container } = render(
      <BuildStepView step={pgStep} code={pgStep.starterCode} disabled={false} onChange={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector(".cm-content")).toBeTruthy();
  });

  it("renders the standard build view for non-pygame steps even WITH a runtime injected", () => {
    const { container } = render(
      <BuildStepView
        step={step}
        code={step.starterCode}
        disabled={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        pygameRuntime={fakeRuntime}
      />,
    );
    expect(container.querySelector("canvas")).toBeNull();
  });
});
