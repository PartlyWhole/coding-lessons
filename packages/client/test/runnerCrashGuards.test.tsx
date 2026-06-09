// Stream L hotfix regression tests — production crash: a predict step in FEEDBACK receiving a
// second "submit" (double-click; the views' Submit buttons re-enable in FEEDBACK) made the
// engine's fail-fast stepMachine throw inside the React reducer, unmounting the app; the unmount
// closed IndexedDB under an in-flight persistDiagnosis → unhandled InvalidStateError.
import { describe, it, expect, vi, afterEach } from "vitest";
import { StrictMode } from "react";
import { fireEvent, render, renderHook, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import type { TrellisDb } from "@trellis/persist";
import { createEventBus } from "../src/eventBus.js";
import type { UiEvent } from "../src/eventBus.js";
import { useCellRunner } from "../src/runner/useCellRunner.js";
import { CellRunner } from "../src/CellRunner.js";

const noSandbox: BuildSandbox = {
  run: async () => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }),
  parseAndMatch: async () => [],
};

// Mirrors the production crash site: a free-text predict step (text input + Submit button).
function predictFixture(): { bundle: Bundle; cell: Cell } {
  const cell: Cell = {
    id: "c1", nodeId: "n1", title: "Mini", certifies: ["skill.x"],
    steps: [
      { id: "p", kind: "predict", prompt: "what prints?", skills: ["skill.x"],
        code: "print(1)", expected: { normalized: ["1"] }, reveal: "run-and-show" } as Cell["steps"][number],
      { id: "w2", kind: "watch", prompt: "tail watch", skills: ["skill.x"], body: "tail" } as Cell["steps"][number],
    ],
  };
  const bundle = {
    contentVersion: "v1",
    skills: { "skill.x": { id: "skill.x", title: "X", description: "", misconceptions: [], upstream: [] } },
    nodes: {}, cells: { c1: cell }, misconceptions: {}, producers: {}, requirements: {},
  } as unknown as Bundle;
  return { bundle, cell };
}

let n = 0;
const fx = { newId: () => `d${n++}`, now: () => "2026-01-01T00:00:00Z", learnerId: "L" };

function makeArgs(overrides: Partial<Parameters<typeof useCellRunner>[0]> = {}) {
  const { bundle, cell } = predictFixture();
  const bus = createEventBus();
  const seen: UiEvent[] = [];
  bus.subscribe((e) => seen.push(e));
  return { args: { cell, bundle, sandbox: noSandbox, bus, effects: fx, ...overrides }, seen };
}

const submissions = (seen: UiEvent[]): UiEvent[] => seen.filter((e) => e.t === "submission");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCellRunner dispatch guards (live-site crash repro)", () => {
  it("a second submit landing in FEEDBACK is a no-op, not a StepTransitionError", async () => {
    const { args, seen } = makeArgs();
    const { result } = renderHook(() => useCellRunner(args));
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));

    await act(async () => {
      await result.current.submitNonBuild({ kind: "predict", text: "1" });
    });
    expect(result.current.phase).toBe("FEEDBACK");

    // Production repro: double-click — the second submit arrives while in FEEDBACK.
    await act(async () => {
      await result.current.submitNonBuild({ kind: "predict", text: "1" });
    });

    expect(result.current.phase).toBe("FEEDBACK");
    expect(submissions(seen).length).toBe(1);
  });

  it("two same-tick submits (race: grade closes over stale state) evaluate exactly once", async () => {
    const { args, seen } = makeArgs();
    const { result } = renderHook(() => useCellRunner(args));
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));

    await act(async () => {
      // Fired in the same tick, before any re-render can disable anything.
      const p1 = result.current.submitNonBuild({ kind: "predict", text: "1" });
      const p2 = result.current.submitNonBuild({ kind: "predict", text: "1" });
      await Promise.all([p1, p2]);
    });

    expect(result.current.phase).toBe("FEEDBACK");
    expect(submissions(seen).length).toBe(1);
  });

  it("retry outside FEEDBACK is a no-op (double-fire safety)", async () => {
    const { args } = makeArgs();
    const { result } = renderHook(() => useCellRunner(args));
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));

    act(() => result.current.retry()); // ACTIVE: machine would throw
    expect(result.current.phase).toBe("ACTIVE");
  });

  it("double advance fires exactly one step_release and lands on the next step", async () => {
    const { args, seen } = makeArgs();
    const { result } = renderHook(() => useCellRunner(args));
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));

    await act(async () => {
      await result.current.submitNonBuild({ kind: "predict", text: "1" });
    });
    expect(result.current.lastDiagnosis!.correct).toBe(true);

    act(() => {
      result.current.advance();
      result.current.advance(); // double-click Continue: second lands on the next step's ACTIVE
    });

    expect(result.current.step.id).toBe("w2");
    expect(result.current.phase).toBe("ACTIVE");
    expect(seen.filter((e) => e.t === "step_release").length).toBe(1);
  });

  it("survives a StrictMode double-run of the mount enter effect", async () => {
    const { args } = makeArgs();
    const { result } = renderHook(() => useCellRunner(args), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));
    expect(result.current.step.id).toBe("p");
  });

  it("a persistDiagnosis hitting a closing db warns instead of rejecting unhandled", async () => {
    const closingDb = {
      conn: {
        close: () => {},
        tx: () => {
          throw new DOMException("The database connection is closing.", "InvalidStateError");
        },
      },
      learnerId: "L",
      getMeta: async () => undefined,
      setMeta: async () => {},
      close: () => {},
    } as unknown as TrellisDb;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { args } = makeArgs({ db: closingDb });
    const { result } = renderHook(() => useCellRunner(args));
    await waitFor(() => expect(result.current.phase).toBe("ACTIVE"));

    // Must resolve (caller does `void submitNonBuild(...)` — a rejection here is unhandled).
    await act(async () => {
      await expect(result.current.submitNonBuild({ kind: "predict", text: "1" })).resolves.toBeUndefined();
    });
    expect(result.current.phase).toBe("FEEDBACK");
    expect(warn).toHaveBeenCalled();
  });
});

// Mirrors the deployed bundle's predict step (radio choices), for DOM-event-path tests.
function predictChoicesFixture(): { bundle: Bundle; cell: Cell } {
  const cell: Cell = {
    id: "c1", nodeId: "n1", title: "Mini", certifies: ["skill.x"],
    steps: [
      { id: "p", kind: "predict", prompt: "what happens?", skills: ["skill.x"],
        code: "print(1)", reveal: "run-and-show",
        choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        expected: { normalized: ["b"] } } as Cell["steps"][number],
      { id: "w2", kind: "watch", prompt: "tail watch", skills: ["skill.x"], body: "tail" } as Cell["steps"][number],
    ],
  };
  const bundle = {
    contentVersion: "v1",
    skills: { "skill.x": { id: "skill.x", title: "X", description: "", misconceptions: [], upstream: [] } },
    nodes: {}, cells: { c1: cell }, misconceptions: {}, producers: {}, requirements: {},
  } as unknown as Bundle;
  return { bundle, cell };
}

describe("CellRunner view-level guards", () => {
  it("same-tick double-click on Submit (real DOM event path) evaluates exactly once", async () => {
    n = 0;
    const { bundle, cell } = predictChoicesFixture();
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    render(<CellRunner cell={cell} bundle={bundle} sandbox={noSandbox} bus={bus} effects={fx} />);

    await userEvent.click(await screen.findByLabelText("B"));
    const submit = screen.getByRole("button", { name: /submit/i });
    // Two clicks dispatched in ONE tick — exactly what `btn.click(); btn.click();` does in
    // the browser repro. No re-render can disable the button in between.
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });

    await screen.findByLabelText("feedback");
    expect(submissions(seen).length).toBe(1);
  });

  it("disables the predict input + Submit in FEEDBACK; stray click/Enter cannot resubmit", async () => {
    n = 0;
    const { bundle, cell } = predictFixture();
    const bus = createEventBus();
    const seen: UiEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    render(<CellRunner cell={cell} bundle={bundle} sandbox={noSandbox} bus={bus} effects={fx} />);

    const input = await screen.findByLabelText("prediction");
    await userEvent.type(input, "1");
    const submit = screen.getByRole("button", { name: /submit/i });
    await userEvent.click(submit);
    await screen.findByLabelText("feedback");

    // FEEDBACK: the form controls must be disabled (the production bug left them enabled).
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    // Pathological double-fire anyway (synthetic events bypass the disabled attribute).
    fireEvent.click(submit);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    fireEvent.keyUp(input, { key: "Enter", code: "Enter" });
    await new Promise((r) => setTimeout(r, 0));

    expect(submissions(seen).length).toBe(1);
    expect(screen.getByLabelText("feedback")).toBeTruthy();
  });
});
