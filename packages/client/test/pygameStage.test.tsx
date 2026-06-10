import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuildStep } from "@trellis/schema";
import type { StallEvent } from "@trellis/runtime";
import { PygameStage } from "../src/steps/PygameStage.js";
import type { ClientPygameRuntime } from "../src/types.js";

const step: BuildStep = {
  id: "b.pg",
  kind: "build",
  prompt: "Move the sprout",
  skills: ["skill.x"],
  language: "python",
  runtime: "pygame",
  starterCode: "def update(state, events, dt):\n    return state",
  evaluator: { run: { timeoutMs: 4000, memoryMb: 256 } } as BuildStep["evaluator"],
};

interface FakeRuntime extends ClientPygameRuntime {
  ops: string[];
  stall: (e: StallEvent) => void;
  refuseNext: boolean;
}

function makeFakeRuntime(): FakeRuntime {
  let onStall: (e: StallEvent) => void = () => {};
  const rt: FakeRuntime = {
    ops: [],
    refuseNext: false,
    stall: (e) => onStall(e),
    async boot() {
      rt.ops.push("boot");
    },
    async start(src: string) {
      rt.ops.push(`start:${src}`);
      if (rt.refuseNext) return { ok: false, refusal: "This loop never yields to the browser — add `await asyncio.sleep(1/60)` inside it so the page stays responsive." };
      return { ok: true };
    },
    async restart(src: string) {
      rt.ops.push(`restart:${src}`);
      if (rt.refuseNext) return { ok: false, refusal: "This loop never yields to the browser — add `await asyncio.sleep(1/60)` inside it so the page stays responsive." };
      return { ok: true };
    },
    stop() {
      rt.ops.push("stop");
    },
    dispose() {
      rt.ops.push("dispose");
    },
    setOnStall(fn) {
      onStall = fn;
    },
  };
  return rt;
}

function renderStage(rt: FakeRuntime, opts: { disabled?: boolean; onSubmit?: () => void } = {}) {
  const onSubmit = opts.onSubmit ?? vi.fn();
  const utils = render(
    <PygameStage
      step={step}
      code={step.starterCode}
      disabled={opts.disabled ?? false}
      onChange={vi.fn()}
      onSubmit={onSubmit}
      runtime={rt}
    />,
  );
  return { ...utils, onSubmit };
}

describe("PygameStage (§17.3 lifecycle)", () => {
  it("renders a focusable canvas#canvas, the editor, a Run button and the submit button", async () => {
    const rt = makeFakeRuntime();
    const { container } = renderStage(rt);
    const canvas = container.querySelector("canvas#canvas")!;
    expect(canvas).toBeTruthy();
    expect(canvas.getAttribute("tabindex")).toBe("0");
    expect(container.querySelector(".cm-content")!.textContent).toContain("def update");
    expect(screen.getByRole("button", { name: /^run$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /run & check/i })).toBeTruthy();
  });

  it("mount on ACTIVE → boot() then start(starterCode), in order", async () => {
    const rt = makeFakeRuntime();
    renderStage(rt);
    await waitFor(() => expect(rt.ops).toEqual(["boot", `start:${step.starterCode}`]));
  });

  it("Run → restart(currentCode)", async () => {
    const rt = makeFakeRuntime();
    renderStage(rt);
    await waitFor(() => expect(rt.ops).toContain("boot"));
    await userEvent.click(screen.getByRole("button", { name: /^run$/i }));
    expect(rt.ops).toContain(`restart:${step.starterCode}`);
  });

  it("a precheck refusal renders in the syntax-attribution slot (frozen register; no new style)", async () => {
    const rt = makeFakeRuntime();
    renderStage(rt);
    await waitFor(() => expect(rt.ops).toContain("boot"));
    rt.refuseNext = true;
    await userEvent.click(screen.getByRole("button", { name: /^run$/i }));
    const slot = await screen.findByText(/never yields to the browser/);
    expect(slot.closest(".feedback")!.className).toContain("feedback--syntax");
  });

  it("submit → stop() BEFORE onSubmit()", async () => {
    const rt = makeFakeRuntime();
    const order: string[] = [];
    const onSubmit = vi.fn(() => order.push("onSubmit"));
    rt.stop = () => {
      rt.ops.push("stop");
      order.push("stop");
    };
    renderStage(rt, { onSubmit });
    await waitFor(() => expect(rt.ops).toContain("boot"));
    await userEvent.click(screen.getByRole("button", { name: /run & check/i }));
    expect(order).toEqual(["stop", "onSubmit"]);
  });

  it("no submit and no Run while disabled", async () => {
    const rt = makeFakeRuntime();
    const onSubmit = vi.fn();
    renderStage(rt, { disabled: true, onSubmit });
    const run = screen.getByRole("button", { name: /^run$/i }) as HTMLButtonElement;
    const submit = screen.getByRole("button", { name: /run & check/i }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(submit.disabled).toBe(true);
  });

  it("a prop-identity-only re-render (fresh onRun/onChange/onSubmit closures, as a parent re-render during typing produces) never re-fires the runtime lifecycle — no second start, no dispose (§17.3 mount-once; M6 bounce-review pin)", async () => {
    const rt = makeFakeRuntime();
    const { rerender } = render(
      <PygameStage
        step={step}
        code={step.starterCode}
        disabled={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onRun={vi.fn()}
        runtime={rt}
      />,
    );
    await waitFor(() => expect(rt.ops).toEqual(["boot", `start:${step.starterCode}`]));
    rerender(
      <PygameStage
        step={step}
        code={step.starterCode + "\n# edited"}
        disabled={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onRun={vi.fn()} // new identity every render — must not defeat mount-once
        runtime={rt}
      />,
    );
    await act(async () => {});
    expect(rt.ops).toEqual(["boot", `start:${step.starterCode}`]); // no restart, no dispose
  });

  it("unmount → dispose() (generation bump kills the loop)", async () => {
    const rt = makeFakeRuntime();
    const { unmount } = renderStage(rt);
    await waitFor(() => expect(rt.ops).toContain("boot"));
    unmount();
    expect(rt.ops).toContain("dispose");
  });

  it("a stall shows the non-modal Reset affordance; Reset calls restart", async () => {
    const rt = makeFakeRuntime();
    renderStage(rt);
    await waitFor(() => expect(rt.ops).toContain("boot"));
    act(() => rt.stall({ blownBudgetMs: 900, consecutive: 3 }));
    const reset = await screen.findByRole("button", { name: /reset/i });
    expect(screen.getByText(/stopped responding/i)).toBeTruthy();
    await userEvent.click(reset);
    expect(rt.ops.filter((o) => o.startsWith("restart:")).length).toBe(1);
  });
});
