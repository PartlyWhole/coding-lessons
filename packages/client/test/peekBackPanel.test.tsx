import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PeekBackEntry } from "../src/types.js";
import { PeekBackPanel } from "../src/peekback/PeekBackPanel.js";

const entries: PeekBackEntry[] = [
  { stepId: "s1", kind: "watch", promptSnapshot: "Watch this", carryContext: "Strings are quoted text" },
  { stepId: "s2", kind: "build", promptSnapshot: "Build announce()", outcome: { correct: true, attribution: "pass" } },
];

describe("PeekBackPanel (§5.3)", () => {
  it("is collapsed by default and shows a toggle", () => {
    render(<PeekBackPanel entries={entries} />);
    expect(screen.queryByText("Watch this")).toBeNull();
    expect(screen.getByRole("button", { name: /peek|history|review/i })).toBeTruthy();
  });

  it("expands to show snapshots + carryContext and calls onOpen", async () => {
    const onOpen = vi.fn();
    render(<PeekBackPanel entries={entries} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /peek|history|review/i }));
    expect(screen.getByText("Watch this")).toBeTruthy();
    expect(screen.getByText("Strings are quoted text")).toBeTruthy();
    expect(screen.getByText("Build announce()")).toBeTruthy();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders nothing useful to interact with when there are no released steps", () => {
    render(<PeekBackPanel entries={[]} />);
    const btn = screen.getByRole("button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
