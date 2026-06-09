import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { createEventBus } from "../src/eventBus.js";
import { CellRunner } from "../src/CellRunner.js";

const noSandbox: BuildSandbox = { run: async () => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }), parseAndMatch: async () => [] };

function fixture(): { bundle: Bundle; cell: Cell } {
  const cell: Cell = {
    id: "c1", nodeId: "n1", title: "Mini", certifies: ["skill.x"],
    steps: [
      { id: "w", kind: "watch", prompt: "watch prompt", skills: ["skill.x"], body: "WATCH BODY MARKER" } as Cell["steps"][number],
      { id: "r", kind: "recognize", prompt: "pick one", skills: ["skill.x"], correctChoiceId: "right",
        choices: [{ id: "right", label: "Right" }, { id: "wrong", label: "Wrong", misconception: "mis.x" }] } as Cell["steps"][number],
    ],
  };
  const bundle = {
    contentVersion: "v1",
    skills: { "skill.x": { id: "skill.x", title: "X", description: "", misconceptions: ["mis.x"], upstream: [] } },
    nodes: {}, cells: { c1: cell },
    misconceptions: { "mis.x": { id: "mis.x", skill: "skill.x", title: "m", signature: { choice: "wrong" }, hintLadder: [{ level: 1, body: "first hint" }], feedback: "MISCONCEPTION FEEDBACK MARKER" } },
    producers: {}, requirements: {},
  } as unknown as Bundle;
  return { bundle, cell };
}

let n = 0;
const fx = { newId: () => `d${n++}`, now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

describe("CellRunner (§5.2 keyed step replacement)", () => {
  it("unmounts the watch step on advance and mounts the recognize step", async () => {
    n = 0;
    const { bundle, cell } = fixture();
    render(<CellRunner cell={cell} bundle={bundle} sandbox={noSandbox} bus={createEventBus()} effects={fx} />);
    expect(await screen.findByText("WATCH BODY MARKER")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.queryByText("WATCH BODY MARKER")).toBeNull());
    expect(screen.getByText("pick one")).toBeTruthy();
  });

  it("shows attribution feedback + the hint ladder after a wrong answer", async () => {
    n = 0;
    const { bundle, cell } = fixture();
    render(<CellRunner cell={cell} bundle={bundle} sandbox={noSandbox} bus={createEventBus()} effects={fx} />);
    await userEvent.click(await screen.findByRole("button", { name: /continue/i }));
    await userEvent.click(await screen.findByLabelText("Wrong"));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("MISCONCEPTION FEEDBACK MARKER")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /show.*hint/i }));
    expect(screen.getByText("first hint")).toBeTruthy();
  });
});
