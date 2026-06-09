import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WatchStep, PredictStep, RecognizeStep, RecallStep } from "@trellis/schema";
import { WatchStepView } from "../src/steps/WatchStepView.js";
import { PredictStepView } from "../src/steps/PredictStepView.js";
import { RecognizeStepView } from "../src/steps/RecognizeStepView.js";
import { RecallStepView } from "../src/steps/RecallStepView.js";

const base = { id: "s", prompt: "Do the thing", skills: ["sk"] };

describe("WatchStepView", () => {
  it("shows body + prompt and advances on Continue", async () => {
    const step: WatchStep = { ...base, kind: "watch", body: "Strings are text in quotes." };
    const onAdvance = vi.fn();
    render(<WatchStepView step={step} onAdvance={onAdvance} />);
    expect(screen.getByText(/Strings are text in quotes/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("renders the body through the tiny markdown subset (⚑ Greenhouse)", () => {
    const step: WatchStep = {
      ...base, kind: "watch",
      body: "Glue with `+` to **tie strings**.\n\n    print(\"a\" + \"b\")\n\nDone.",
    };
    const { container } = render(<WatchStepView step={step} onAdvance={vi.fn()} />);
    const body = container.querySelector(".body")!;
    expect(body.querySelector("code")!.textContent).toBe("+");
    expect(body.querySelector("strong")!.textContent).toBe("tie strings");
    expect(body.querySelector("pre.code")!.textContent).toBe('print("a" + "b")');
  });
});

describe("RecognizeStepView", () => {
  it("submits the selected choice id", async () => {
    const step: RecognizeStep = {
      ...base, kind: "recognize", correctChoiceId: "b",
      choices: [{ id: "a", label: "First" }, { id: "b", label: "Second" }],
    };
    const onSubmit = vi.fn();
    render(<RecognizeStepView step={step} disabled={false} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("Second"));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "recognize", choiceId: "b" });
  });
});

describe("RecallStepView", () => {
  it("submits trimmed free text", async () => {
    const step: RecallStep = { ...base, kind: "recall", accepted: { normalized: ["x"] } };
    const onSubmit = vi.fn();
    render(<RecallStepView step={step} disabled={false} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox"), "  hello  ");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "recall", text: "  hello  " });
  });

  it("has placeholder copy on the answer input (⚑ Greenhouse)", () => {
    const step: RecallStep = { ...base, kind: "recall", accepted: { normalized: ["x"] } };
    render(<RecallStepView step={step} disabled={false} onSubmit={vi.fn()} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).placeholder).toBe("Type your answer…");
  });
});

describe("PredictStepView", () => {
  it("renders code read-only and submits a free-text prediction when no choices", async () => {
    const step: PredictStep = {
      ...base, kind: "predict", code: "print(1+1)", reveal: "run-and-show",
      expected: { normalized: ["2"] },
    };
    const onSubmit = vi.fn();
    render(<PredictStepView step={step} disabled={false} onSubmit={onSubmit} />);
    expect(screen.getByText(/print\(1\+1\)/)).toBeTruthy();
    await userEvent.type(screen.getByRole("textbox"), "2");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "predict", text: "2" });
  });

  it("submits a choice id when the predict step has choices", async () => {
    const step: PredictStep = {
      ...base, kind: "predict", code: "x", reveal: "run-and-show",
      expected: { normalized: ["a"] },
      choices: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }],
    };
    const onSubmit = vi.fn();
    render(<PredictStepView step={step} disabled={false} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("Beta"));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "predict", choiceId: "b" });
  });

  it("has the approved placeholder copy on the free-text input (⚑ Greenhouse)", () => {
    const step: PredictStep = {
      ...base, kind: "predict", code: "print(1)", reveal: "run-and-show", expected: { normalized: ["1"] },
    };
    render(<PredictStepView step={step} disabled={false} onSubmit={vi.fn()} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).placeholder).toBe("Type exactly what gets printed…");
  });

  it("disables the submit button while disabled (EVALUATING)", () => {
    const step: PredictStep = { ...base, kind: "predict", code: "x", reveal: "run-and-show", expected: {} };
    render(<PredictStepView step={step} disabled={true} onSubmit={vi.fn()} />);
    expect((screen.getByRole("button", { name: /submit/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
