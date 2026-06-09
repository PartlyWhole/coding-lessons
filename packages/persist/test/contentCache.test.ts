import { describe, it, expect } from "vitest";
import { memoryDriver } from "../src/idb/memory.js";
import { openTrellisDb } from "../src/db.js";
import { loadBundle } from "../src/contentCache.js";
import type { Bundle } from "@trellis/schema";

function bundle(version: string): Bundle {
  return {
    contentVersion: version,
    skills: {}, nodes: {}, cells: {}, misconceptions: {},
    producers: {}, requirements: {},
  };
}

function countingFetch(body: Bundle) {
  let calls = 0;
  const fetchImpl = ((_url: string) => {
    calls += 1;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

describe("loadBundle", () => {
  it("fetches once, then serves from cache when contentVersion is unchanged", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const f = countingFetch(bundle("v1"));
    const first = await loadBundle(db, { url: "/content/v1.json", contentVersion: "v1", fetchImpl: f.fetchImpl });
    const second = await loadBundle(db, { url: "/content/v1.json", contentVersion: "v1", fetchImpl: f.fetchImpl });
    expect(first.contentVersion).toBe("v1");
    expect(second).toEqual(first);
    expect(f.calls()).toBe(1); // second load was a cache hit
  });

  it("re-fetches when contentVersion changes (cache-bust)", async () => {
    const db = await openTrellisDb(memoryDriver(), { idGen: () => "L" });
    const f1 = countingFetch(bundle("v1"));
    await loadBundle(db, { url: "/content/v1.json", contentVersion: "v1", fetchImpl: f1.fetchImpl });
    const f2 = countingFetch(bundle("v2"));
    const v2 = await loadBundle(db, { url: "/content/v2.json", contentVersion: "v2", fetchImpl: f2.fetchImpl });
    expect(v2.contentVersion).toBe("v2");
    expect(f2.calls()).toBe(1); // new version forced a fetch
  });

  it("survives reload: a cached bundle is served without fetching after reopen", async () => {
    const driver = memoryDriver();
    const db1 = await openTrellisDb(driver, { idGen: () => "L" });
    const f1 = countingFetch(bundle("v1"));
    await loadBundle(db1, { url: "/content/v1.json", contentVersion: "v1", fetchImpl: f1.fetchImpl });
    db1.close();

    const db2 = await openTrellisDb(driver, { idGen: () => "L" });
    const f2 = countingFetch(bundle("v1"));
    const got = await loadBundle(db2, { url: "/content/v1.json", contentVersion: "v1", fetchImpl: f2.fetchImpl });
    expect(got.contentVersion).toBe("v1");
    expect(f2.calls()).toBe(0); // served from the persisted content_cache
  });
});
