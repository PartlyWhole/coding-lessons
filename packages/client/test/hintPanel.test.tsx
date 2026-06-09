import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Hint } from "@trellis/schema";
import type { HintState } from "@trellis/engine";
import { HintPanel } from "../src/hints/HintPanel.js";

const ladder: Hint[] = [
  { level: 1, body: "Hint one" },
  { level: 2, body: "Hint two" },
  { level: 3, body: "Hint three" },
  { level: 4, body: "Full solution", revealCode: "return 'x' + str(n)" },
];

describe("HintPanel (§9.2)", () => {
  it("shows nothing revealed at level 0 and a pull button", () => {
    render(<HintPanel ladder={ladder} state={{ ladderKey: "k", revealedThrough: 0 }} onPull={vi.fn()} />);
    expect(screen.queryByText("Hint one")).toBeNull();
    expect(screen.getByRole("button", { name: /show.*hint/i })).toBeTruthy();
  });

  it("renders levels 1..revealedThrough", () => {
    render(<HintPanel ladder={ladder} state={{ ladderKey: "k", revealedThrough: 2 }} onPull={vi.fn()} />);
    expect(screen.getByText("Hint one")).toBeTruthy();
    expect(screen.getByText("Hint two")).toBeTruthy();
    expect(screen.queryByText("Hint three")).toBeNull();
  });

  it("calls onPull() for a normal (non-level-4) pull", async () => {
    const onPull = vi.fn();
    render(<HintPanel ladder={ladder} state={{ ladderKey: "k", revealedThrough: 1 }} onPull={onPull} />);
    await userEvent.click(screen.getByRole("button", { name: /show.*hint/i }));
    expect(onPull).toHaveBeenCalledWith(); // no confirm arg for level 2
  });

  it("requires a confirm before pulling level 4, then calls onPull({confirmRevealCode:true})", async () => {
    const onPull = vi.fn();
    render(<HintPanel ladder={ladder} state={{ ladderKey: "k", revealedThrough: 3 }} onPull={onPull} />);
    await userEvent.click(screen.getByRole("button", { name: /full solution/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onPull).toHaveBeenCalledWith({ confirmRevealCode: true });
  });

  it("hides the pull button when the ladder is exhausted", () => {
    render(<HintPanel ladder={ladder} state={{ ladderKey: "k", revealedThrough: 4 }} onPull={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /show.*hint|full solution/i })).toBeNull();
    expect(screen.getByText("Full solution")).toBeTruthy();
  });

  it("renders nothing when the ladder is empty (a pass / NO_LADDER)", () => {
    const { container } = render(<HintPanel ladder={[]} state={{ ladderKey: "", revealedThrough: 0 }} onPull={vi.fn()} />);
    expect(container.querySelector("button")).toBeNull();
  });
});
