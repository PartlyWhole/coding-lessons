// M6 sanctioned emit sites (orchestrator write-set extension E1/E2/E3): emit-only
// additions — zero behavior change to the components. Each suite below asserts BOTH the
// new emit and that the pre-existing observable behavior is unchanged.
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import type { Bundle, Cell, BuildStep } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { hashText, DEFAULT_CAPTURE_POLICY } from "@trellis/telemetry";
import { createEventBus } from "../src/eventBus.js";
import type { UiEvent } from "../src/eventBus.js";
import { useCellRunner } from "../src/runner/useCellRunner.js";
import { PygameStage } from "../src/steps/PygameStage.js";
import type { ClientPygameRuntime } from "../src/types.js";

const noSandbox: BuildSandbox = {
  run: async () => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }),
  parseAndMatch: async () => [],
};

function buildFixture(): { bundle: Bundle; cell: Cell } {
  const cell: Cell = {
    id: "c1",
    nodeId: "n1",
    title: "Mini",
    certifies: ["skill.x"],
    steps: [
      {
        id: "b",
        kind: "build",
        prompt: "write it",
        skills: ["skill.x"],
        language: "python",
        starterCode: "x = 1",
        evaluator: {},
      } as unknown as Cell["steps"][number],
    ],
  };
  const bundle = {
    contentVersion: "v1",
    skills: { "skill.x": { id: "skill.x", title: "X", description: "", misconceptions: [], upstream: [] } },
    nodes: {},
    cells: { c1: cell },
    misconceptions: {},
    producers: {},
    requirements: {},
  } as unknown as Bundle;
  return { bundle, cell };
}

const fx = { newId: () => crypto.randomUUID(), now: () => new Date().toISOString(), learnerId: "L" };

afterEach(() => {
  vi.useRealTimers();
});

describe("E2 — debounced editor_change emit at the setBuildCode boundary", () => {
  it("a typing burst → exactly ONE editor_change after editorDebounceMs, carrying length+hash of the LATEST buffer (never raw text)", async () => {
    const { bundle, cell } = buildFixture();
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    bus.subscribe((e) => seen.push(e));

    const { result } = renderHook(() => useCellRunner({ cell, bundle, sandbox: noSandbox, bus, effects: fx }));
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));

    vi.useFakeTimers();
    act(() => {
      result.current.setBuildCode("x = 1\ny");
      result.current.setBuildCode("x = 1\nyz");
      result.current.setBuildCode("x = 1\nyz = 3");
    });
    // behavior unchanged: buildCode state updated immediately on every call
    expect(result.current.buildCode).toBe("x = 1\nyz = 3");
    // no emit yet (debounced)
    expect(seen.filter((e) => e.t === "editor_change")).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_CAPTURE_POLICY.editorDebounceMs);
    });
    const edits = seen.filter((e) => e.t === "editor_change");
    expect(edits).toHaveLength(1); // one per burst, not per keystroke
    expect(edits[0]).toEqual({
      t: "editor_change",
      stepId: "b",
      length: "x = 1\nyz = 3".length,
      hash: hashText("x = 1\nyz = 3"),
    });
    // privacy: the event carries no raw text field at all
    expect(JSON.stringify(edits[0])).not.toContain("yz = 3");
  });

  it("a second burst after the first emit produces a second emit; keystrokes within the window keep deferring", async () => {
    const { bundle, cell } = buildFixture();
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    bus.subscribe((e) => seen.push(e));

    const { result } = renderHook(() => useCellRunner({ cell, bundle, sandbox: noSandbox, bus, effects: fx }));
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));

    vi.useFakeTimers();
    act(() => result.current.setBuildCode("a"));
    act(() => vi.advanceTimersByTime(399));
    act(() => result.current.setBuildCode("ab")); // re-debounces
    act(() => vi.advanceTimersByTime(399));
    expect(seen.filter((e) => e.t === "editor_change")).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    expect(seen.filter((e) => e.t === "editor_change")).toHaveLength(1);

    act(() => result.current.setBuildCode("abc"));
    act(() => vi.advanceTimersByTime(400));
    const edits = seen.filter((e) => e.t === "editor_change") as Extract<UiEvent, { t: "editor_change" }>[];
    expect(edits).toHaveLength(2);
    expect(edits.map((e) => e.length)).toEqual([2, 3]);
  });

  it("unmount with a pending debounce never emits after teardown", async () => {
    const { bundle, cell } = buildFixture();
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    bus.subscribe((e) => seen.push(e));

    const { result, unmount } = renderHook(() => useCellRunner({ cell, bundle, sandbox: noSandbox, bus, effects: fx }));
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));

    vi.useFakeTimers();
    act(() => result.current.setBuildCode("pending"));
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(seen.filter((e) => e.t === "editor_change")).toHaveLength(0);
  });
});

describe("E1 — run emit from PygameStage's Run button", () => {
  function stageRuntime(): ClientPygameRuntime {
    return {
      boot: async () => undefined,
      start: async () => ({ ok: true }),
      restart: async () => ({ ok: true }),
      stop: () => undefined,
      dispose: () => undefined,
      setOnStall: () => undefined,
    } as unknown as ClientPygameRuntime;
  }
  const step = {
    id: "b",
    kind: "build",
    prompt: "make it move",
    skills: ["skill.x"],
    language: "python",
    runtime: "pygame",
    starterCode: "import pygame",
    evaluator: {},
  } as unknown as BuildStep;

  it("pressing Run calls onRun exactly once per press (and Run & check does NOT)", async () => {
    const onRun = vi.fn();
    const onSubmit = vi.fn();
    render(
      <PygameStage step={step} code="x" disabled={false} onChange={() => undefined} onSubmit={onSubmit} onRun={onRun} runtime={stageRuntime()} />,
    );
    const runBtn = screen.getByRole("button", { name: "Run" });
    await act(async () => {
      runBtn.click();
    });
    expect(onRun).toHaveBeenCalledTimes(1);
    const checkBtn = screen.getByRole("button", { name: /Run & check/ });
    await act(async () => {
      checkBtn.click();
    });
    expect(onRun).toHaveBeenCalledTimes(1); // submit path is a submission, not a run press
    expect(onSubmit).toHaveBeenCalledTimes(1); // behavior unchanged
  });

  it("disabled Run press neither runs nor emits; omitting onRun changes nothing (prop optional)", async () => {
    const onRun = vi.fn();
    const { unmount } = render(
      <PygameStage step={step} code="x" disabled={true} onChange={() => undefined} onSubmit={() => undefined} onRun={onRun} runtime={stageRuntime()} />,
    );
    const runBtn = screen.getByRole("button", { name: "Run" }) as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
    await act(async () => {
      runBtn.click();
    });
    expect(onRun).not.toHaveBeenCalled();
    unmount();
    // no-onRun render must not crash
    render(
      <PygameStage step={step} code="x" disabled={false} onChange={() => undefined} onSubmit={() => undefined} runtime={stageRuntime()} />,
    );
    expect(screen.getByRole("button", { name: "Run" })).not.toBeNull();
  });
});

describe("E3 — focus emit (window focus/blur → {t:'focus', stepId, focused})", () => {
  it("window blur then focus emits focused:false then focused:true for the ACTIVE step; listeners removed on unmount", async () => {
    const { bundle, cell } = buildFixture();
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    bus.subscribe((e) => seen.push(e));

    const { result, unmount } = renderHook(() => useCellRunner({ cell, bundle, sandbox: noSandbox, bus, effects: fx }));
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));

    act(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    const focuses = seen.filter((e) => e.t === "focus") as Extract<UiEvent, { t: "focus" }>[];
    expect(focuses).toEqual([
      { t: "focus", stepId: "b", focused: false },
      { t: "focus", stepId: "b", focused: true },
    ]);

    unmount();
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(seen.filter((e) => e.t === "focus")).toHaveLength(2); // nothing after unmount
  });
});
