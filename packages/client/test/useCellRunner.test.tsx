import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { memoryDriver, openTrellisDb } from "@trellis/persist";
import { createEventBus } from "../src/eventBus.js";
import type { UiEvent } from "../src/eventBus.js";
import { useCellRunner } from "../src/runner/useCellRunner.js";

const noSandbox: BuildSandbox = {
  run: async () => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }),
  parseAndMatch: async () => [],
};

function bundleAndCell(): { bundle: Bundle; cell: Cell } {
  const cell: Cell = {
    id: "c1", nodeId: "n1", title: "Mini", certifies: ["skill.x"],
    steps: [
      { id: "w", kind: "watch", prompt: "watch", skills: ["skill.x"], body: "body", carryContext: "remember me" } as Cell["steps"][number],
      { id: "r", kind: "recognize", prompt: "pick", skills: ["skill.x"],
        correctChoiceId: "right",
        choices: [{ id: "right", label: "Right" }, { id: "wrong", label: "Wrong", misconception: "mis.x" }],
      } as Cell["steps"][number],
    ],
  };
  const bundle = {
    contentVersion: "v1",
    skills: { "skill.x": { id: "skill.x", title: "X", description: "", misconceptions: ["mis.x"], upstream: [] } },
    nodes: {}, cells: { c1: cell },
    misconceptions: { "mis.x": { id: "mis.x", skill: "skill.x", title: "m", signature: { choice: "wrong" }, hintLadder: [{ level: 1, body: "h" }], feedback: "fb" } },
    producers: {}, requirements: {},
  } as unknown as Bundle;
  return { bundle, cell };
}

let idCounter = 0;
const fx = { newId: () => `d${idCounter++}`, now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

describe("useCellRunner", () => {
  it("walks watch → recognize, keys the active step, materializes peek-back, persists, and emits events", async () => {
    idCounter = 0;
    const { bundle, cell } = bundleAndCell();
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const driver = memoryDriver();
    const db = await openTrellisDb(driver, { idGen: () => "L" });

    const { result } = renderHook(() =>
      useCellRunner({ cell, bundle, sandbox: noSandbox, bus, db, effects: fx }),
    );

    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));
    expect(result.current.step.id).toBe("w");

    act(() => result.current.advance());
    await waitFor(() => expect(result.current.step.id).toBe("r"));
    expect(result.current.peekBack.map((p) => p.stepId)).toEqual(["w"]);
    expect(result.current.peekBack[0]!.carryContext).toBe("remember me");

    await act(async () => {
      await result.current.submitNonBuild({ kind: "recognize", choiceId: "wrong" });
    });
    expect(result.current.phase).toBe("FEEDBACK");
    expect(result.current.lastDiagnosis!.attribution).toBe("misconception");
    expect(result.current.ladder.length).toBeGreaterThan(0);

    act(() => result.current.pullHint());
    expect(result.current.hintState.revealedThrough).toBe(1);

    act(() => result.current.retry());
    expect(result.current.phase).toBe("ACTIVE");
    await act(async () => {
      await result.current.submitNonBuild({ kind: "recognize", choiceId: "right" });
    });
    expect(result.current.lastDiagnosis!.correct).toBe(true);
    act(() => result.current.advance());
    expect(result.current.isComplete).toBe(true);

    const kinds = seen.map((e) => e.t);
    expect(kinds).toContain("step_enter");
    expect(kinds).toContain("submission");
    expect(kinds).toContain("step_release");
  });
});
