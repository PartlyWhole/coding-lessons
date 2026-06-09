import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { memoryDriver, openTrellisDb } from "@trellis/persist";
import { loadCellContent } from "../src/app/loadContent.js";

function realBundleJson(): { json: unknown; contentVersion: string } {
  const out = "/tmp/trellis-client-bundle.json";
  execSync(`node ${process.cwd()}/../authoring/dist/src/cli.js build --out ${out} --content ${process.cwd()}/../../content`, { stdio: "ignore" });
  const json = JSON.parse(readFileSync(out, "utf8")) as { contentVersion: string };
  return { json, contentVersion: json.contentVersion };
}

describe("loadCellContent", () => {
  it("loads a Bundle via persist's contentVersion cache (injected fetch, no network) and finds a cell", async () => {
    const { json, contentVersion } = realBundleJson();
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => json })) as unknown as typeof fetch;
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const { bundle, cell } = await loadCellContent(db, {
      url: "/bundle.json", contentVersion, cellId: "cell.string_concat.text_plus_number", fetchImpl,
    });
    expect(bundle.contentVersion).toBe(contentVersion);
    expect(cell.id).toBe("cell.string_concat.text_plus_number");
    expect(cell.steps.some((s) => s.kind === "build")).toBe(true);
  });
});
