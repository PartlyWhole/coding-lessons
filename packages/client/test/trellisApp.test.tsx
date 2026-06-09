import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { render, screen, waitFor } from "@testing-library/react";
import type { BuildSandbox } from "@trellis/engine";
import { memoryDriver } from "@trellis/persist";
import { TrellisApp } from "../src/app/TrellisApp.js";

const noSandbox: BuildSandbox = {
  run: async () => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }),
  parseAndMatch: async () => [],
};

function realBundleJson(): { json: unknown; contentVersion: string } {
  const out = "/tmp/trellis-client-app-bundle.json";
  execSync(`node ${process.cwd()}/../authoring/dist/src/cli.js build --out ${out} --content ${process.cwd()}/../../content`, { stdio: "ignore" });
  const json = JSON.parse(readFileSync(out, "utf8")) as { contentVersion: string };
  return { json, contentVersion: json.contentVersion };
}

const CELL = "cell.string_concat.text_plus_number";

describe("TrellisApp app states (⚑ Greenhouse wrappers — loading / warming / error)", () => {
  it("wraps the loading state in .app-state.app-loading (no spinner)", () => {
    const { container } = render(
      <TrellisApp
        bundleUrl="/bundle.json"
        contentVersion="v"
        cellId={CELL}
        sandbox={noSandbox}
        driver={memoryDriver()}
        fetchImpl={(() => new Promise(() => {})) as unknown as typeof fetch /* never resolves */}
      />,
    );
    const wrap = container.querySelector(".app-state.app-loading")!;
    expect(wrap).not.toBeNull();
    expect(wrap.querySelector(".app-status")!.textContent).toBe("Loading…");
  });

  it("shows 'Getting Python ready…' (.app-warming, warm-bar, honest sub copy) until warmup resolves, then mounts the runner", async () => {
    const { json, contentVersion } = realBundleJson();
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => json })) as unknown as typeof fetch;
    let releaseWarmup!: () => void;
    const warmup = (): Promise<void> => new Promise((res) => { releaseWarmup = res; });

    const { container } = render(
      <TrellisApp
        bundleUrl="/bundle.json"
        contentVersion={contentVersion}
        cellId={CELL}
        sandbox={noSandbox}
        warmup={warmup}
        driver={memoryDriver()}
        fetchImpl={fetchImpl}
      />,
    );
    await waitFor(() => expect(container.querySelector(".app-state.app-warming")).not.toBeNull());
    const warming = container.querySelector(".app-state.app-warming")!;
    expect(warming.querySelector(".app-status")!.textContent).toBe("Getting Python ready…");
    expect(warming.querySelector(".warm-bar i")).not.toBeNull();
    expect(warming.querySelector(".app-sub")!.textContent).toMatch(/First visit takes a few seconds/);
    expect(container.textContent).not.toMatch(/thinking/i); // determinism register

    releaseWarmup();
    await waitFor(() => expect(screen.queryByText("Getting Python ready…")).toBeNull());
    expect(await screen.findByLabelText("watch step")).toBeTruthy();
  });

  it("skips the warming state when no warmup is supplied (default unchanged)", async () => {
    const { json, contentVersion } = realBundleJson();
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => json })) as unknown as typeof fetch;
    render(
      <TrellisApp
        bundleUrl="/bundle.json"
        contentVersion={contentVersion}
        cellId={CELL}
        sandbox={noSandbox}
        driver={memoryDriver()}
        fetchImpl={fetchImpl}
      />,
    );
    expect(await screen.findByLabelText("watch step")).toBeTruthy();
  });

  it("keeps role=alert on errors, adds the calm headline + reassurance, demotes the message to mono", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    const { container } = render(
      <TrellisApp
        bundleUrl="/bundle.json"
        contentVersion="v"
        cellId={CELL}
        sandbox={noSandbox}
        driver={memoryDriver()}
        fetchImpl={fetchImpl}
      />,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.className).toBe("app-error");
    expect(container.querySelector(".app-state")).not.toBeNull();
    expect(alert.querySelector(".app-status")!.textContent).toBe("Couldn't load this lesson");
    expect(alert.textContent).toMatch(/Your progress is safe on this device/);
    const code = alert.querySelector("code")!;
    expect(code.textContent).toMatch(/^Failed to load: /);
    expect(code.textContent).toMatch(/404/);
  });
});
