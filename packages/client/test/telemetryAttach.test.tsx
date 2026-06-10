// Task 11 — the app-shell telemetry attach (one-line seam, §11.1): rendering TrellisApp
// records behavioral_event rows through the REAL bus → recorder → buffer → persist chain
// (memoryDriver), with zero behavior change to the lesson itself.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuildSandbox } from "@trellis/engine";
import { memoryDriver, openTrellisDb, recentEvents } from "@trellis/persist";
import { TrellisApp } from "../src/app/TrellisApp.js";

const noSandbox: BuildSandbox = {
  run: async () => ({ ran: true, stdout: "", wallMs: 0, timedOut: false }),
  parseAndMatch: async () => [],
};

function realBundleJson(): { json: unknown; contentVersion: string } {
  const out = "/tmp/trellis-telemetry-attach-bundle.json";
  execSync(`node ${process.cwd()}/../authoring/dist/src/cli.js build --out ${out} --content ${process.cwd()}/../../content`, { stdio: "ignore" });
  const json = JSON.parse(readFileSync(out, "utf8")) as { contentVersion: string };
  return { json, contentVersion: json.contentVersion };
}

const CELL = "cell.string_concat.text_plus_number";

describe("TrellisApp telemetry attach (M6 §11.1 — one line, detach before close)", () => {
  it("a real walkthrough slice records behavioral_event rows (session_start sentinel → submission) with gap-free seq; unmount detaches cleanly", async () => {
    const { json, contentVersion } = realBundleJson();
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => json })) as unknown as typeof fetch;
    const driver = memoryDriver();

    const { unmount } = render(
      <TrellisApp bundleUrl="/bundle.json" contentVersion={contentVersion} cellId={CELL} sandbox={noSandbox} driver={driver} fetchImpl={fetchImpl} />,
    );

    // Step 1 (watch) → Continue → step 2 (predict, choice mode) → wrong answer → Submit.
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }, { timeout: 15000 }));
    await userEvent.click(await screen.findByLabelText(/It prints: Your random number is: 7/));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    // behavior unchanged: the same feedback band as before telemetry existed
    await waitFor(() => expect(screen.getByLabelText("feedback")).toBeTruthy(), { timeout: 15000 });

    // The submission row flushes immediately (D5 read-after-write) — no timers needed.
    const db2 = await openTrellisDb(driver, { idGen: () => "UNUSED" });
    let rows = await recentEvents(db2, { limit: 100 });
    await waitFor(async () => {
      rows = await recentEvents(db2, { limit: 100 });
      expect(rows.length).toBeGreaterThan(0);
    });
    rows = rows.slice().sort((a, b) => a.seq - b.seq);

    const types = rows.map((r) => r.type);
    expect(types[0]).toBe("session_start");
    expect(rows[0]!.stepId).toBe(""); // sentinel
    expect(types).toContain("step_enter");
    expect(types).toContain("submission");
    const sub = rows.find((r) => r.type === "submission")!;
    const p = sub.payload as Record<string, unknown>;
    expect(p["stepKind"]).toBe("predict");
    expect(p["correct"]).toBe(false);
    expect(sub.stepId).toBe(`${CELL}#2`);
    // gap-free seq from 0, single session, learnerId stamped from the db
    expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i));
    expect(new Set(rows.map((r) => r.sessionId)).size).toBe(1);
    expect(new Set(rows.map((r) => r.learnerId))).toEqual(new Set([db2.learnerId]));

    // detach-before-close: unmount must neither throw nor leave an unhandled rejection
    unmount();
    await new Promise((r) => setTimeout(r, 0));
    db2.close();
  }, 40000);
});
