import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Smoke } from "../src/Smoke.js";

describe("toolchain smoke", () => {
  it("renders JSX, holds React state, and reacts to a click under happy-dom", async () => {
    render(<Smoke />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toBe("count: 0");
    await userEvent.click(btn);
    expect(btn.textContent).toBe("count: 1");
  });
});
