// Task 12 (D5 carve-out, orchestrator-approved): three_fail_streak's auto-advance wires to
// the EXISTING HintLadder pull path — visually identical to a learner pull, zero new visual
// language. All other scaffold actions stay headless until the E5 design ⚑ lands.
import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { memoryDriver, openTrellisDb, appendEvents, recentEvents, type TrellisDb } from "@trellis/persist";
import { attachTelemetry, DEFAULT_CAPTURE_POLICY, realClock, realIds } from "@trellis/telemetry";
import { createEventBus } from "../src/eventBus.js";
import { useCellRunner } from "../src/runner/useCellRunner.js";

const noSandbox: BuildSandbox = {
  run: async () => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }),
  parseAndMatch: async () => [],
};

function fixture(): { bundle: Bundle; cell: Cell } {
  const cell: Cell = {
    id: "c1",
    nodeId: "n1",
    title: "Mini",
    certifies: ["skill.x"],
    steps: [
      {
        id: "r",
        kind: "recognize",
        prompt: "pick",
        skills: ["skill.x"],
        correctChoiceId: "right",
        choices: [
          { id: "right", label: "Right" },
          { id: "wrong", label: "Wrong", misconception: "mis.x" },
        ],
      } as Cell["steps"][number],
    ],
  };
  const bundle = {
    contentVersion: "v1",
    skills: { "skill.x": { id: "skill.x", title: "X", description: "", misconceptions: ["mis.x"], upstream: [] } },
    nodes: {},
    cells: { c1: cell },
    misconceptions: {
      "mis.x": {
        id: "mis.x",
        skill: "skill.x",
        title: "m",
        signature: { choice: "wrong" },
        hintLadder: [
          { level: 1, body: "level one nudge" },
          { level: 2, body: "level two" },
        ],
        feedback: "fb",
      },
    },
    producers: {},
    requirements: {},
  } as unknown as Bundle;
  return { bundle, cell };
}

const fx = { newId: () => crypto.randomUUID(), now: () => new Date().toISOString(), learnerId: "L" };

async function setup(): Promise<{
  result: { current: ReturnType<typeof useCellRunner> };
  db: TrellisDb;
  detach: () => void;
}> {
  const { bundle, cell } = fixture();
  const bus = createEventBus();
  const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
  // The app shell attaches telemetry BEFORE CellRunner mounts (TrellisApp does this for
  // real); the recorder must be bus-subscriber #1 so submission rows flush before the
  // scaffolder's read (D5 read-after-write).
  const detach = attachTelemetry({
    bus,
    persist: { appendEvents: (ev) => appendEvents(db, ev), recentEvents: (q) => recentEvents(db, q) },
    clock: realClock,
    ids: realIds,
    policy: DEFAULT_CAPTURE_POLICY,
    learnerId: "L",
    target: { addEventListener: () => undefined, removeEventListener: () => undefined },
    isHidden: () => false,
  });
  const { result } = renderHook(() => useCellRunner({ cell, bundle, sandbox: noSandbox, bus, db, effects: fx }));
  await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));
  return { result, db, detach };
}

async function submitWrong(result: { current: ReturnType<typeof useCellRunner> }): Promise<void> {
  if (result.current.phase === "FEEDBACK") act(() => result.current.retry());
  await act(async () => {
    await result.current.submitNonBuild({ kind: "recognize", choiceId: "wrong" });
  });
}

describe("three_fail_streak → existing HintLadder pull path (Task 12 carve-out)", () => {
  it("three wrong submissions auto-advance the ladder by exactly ONE level; a fourth does NOT re-advance (dedupe)", async () => {
    const { result, db, detach } = await setup();

    await submitWrong(result);
    await submitWrong(result);
    expect(result.current.hintState.revealedThrough).toBe(0); // 2 wrongs: nothing proposed

    await submitWrong(result); // third wrong → rule fires → one auto pull
    await waitFor(() => expect(result.current.hintState.revealedThrough).toBe(1));

    await submitWrong(result); // fourth wrong: deduped — never re-advances
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.hintState.revealedThrough).toBe(1);

    detach();
    db.close();
  }, 20000);

  it("the auto-advance reuses pullHint semantics exactly: a learner pull after it continues from level 2", async () => {
    const { result, db, detach } = await setup();
    await submitWrong(result);
    await submitWrong(result);
    await submitWrong(result);
    await waitFor(() => expect(result.current.hintState.revealedThrough).toBe(1));
    act(() => result.current.pullHint());
    expect(result.current.hintState.revealedThrough).toBe(2); // existing ladder mechanics, one shared state
    detach();
    db.close();
  }, 20000);
});
