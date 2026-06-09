import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Bundle, Cell } from "@trellis/schema";
import { createLocalSandbox } from "@trellis/sandbox";
import { memoryDriver, openTrellisDb, loadLearnerModel, readDiagnoses } from "@trellis/persist";
import { createEventBus } from "../src/eventBus.js";
import { CellRunner } from "../src/CellRunner.js";

function realBundle(): Bundle {
  const out = "/tmp/trellis-walkthrough-bundle.json";
  execSync(`node ${process.cwd()}/../authoring/dist/src/cli.js build --out ${out} --content ${process.cwd()}/../../content`, { stdio: "ignore" });
  return JSON.parse(readFileSync(out, "utf8")) as Bundle;
}

let n = 0;
const fx = { newId: () => `diag-${n++}`, now: () => "2026-01-01T00:00:00Z", learnerId: "L" };
const sandbox = createLocalSandbox();

describe("MARQUEE offline walkthrough (string_concat str_num) — real engine+sandbox(twin)+persist", () => {
  it("submit a build step → feedback renders; mastery+history persist and survive a reload", async () => {
    n = 0;
    const bundle = realBundle();
    const cell: Cell = bundle.cells["cell.string_concat.text_plus_number"]!;
    const buildStep = cell.steps.find((s) => s.kind === "build")!;
    const driver = memoryDriver();
    const db = await openTrellisDb(driver, { idGen: () => "L" });
    const buildOnly: Cell = { ...cell, steps: [buildStep] };

    render(<CellRunner cell={buildOnly} bundle={bundle} sandbox={sandbox} bus={createEventBus()} db={db} effects={fx} />);

    expect(await screen.findByLabelText("build step")).toBeTruthy();

    // Submit the (incomplete) starter → a non-pass FEEDBACK band appears.
    await userEvent.click(screen.getByRole("button", { name: /run.*check/i }));
    await waitFor(() => expect(screen.getByLabelText("feedback")).toBeTruthy(), { timeout: 20000 });

    const hist = await readDiagnoses(db);
    expect(hist.length).toBeGreaterThanOrEqual(1);
    const model = await loadLearnerModel(db, bundle.contentVersion);
    expect(Object.keys(model.skills).length).toBeGreaterThanOrEqual(1);
    db.close();

    // SIMULATED RELOAD: reopen from the same driver → mastery + history survive identically.
    const db2 = await openTrellisDb(driver, { idGen: () => "SHOULD-NOT-BE-USED" });
    expect(db2.learnerId).toBe("L");
    const hist2 = await readDiagnoses(db2);
    const model2 = await loadLearnerModel(db2, bundle.contentVersion);
    expect(hist2).toEqual(hist);
    expect(model2).toEqual(model);
  }, 40000);
});
