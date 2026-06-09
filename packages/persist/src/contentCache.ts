// ContentVersion is a TypeBox value in @trellis/schema, not a TS type → use `string`.
// Bundle is exported BOTH as a type and as a TypeBox schema value; import the value as BundleSchema.
import type { Bundle } from "@trellis/schema";
import { assertValid, Bundle as BundleSchema } from "@trellis/schema";
import type { TrellisDb } from "./db.js";
import { STORES, META_KEYS } from "./schema.js";
import type { ContentCacheRecord } from "./schema.js";

export interface LoadBundleOptions {
  /** Immutable static URL for this contentVersion's compiled bundle. */
  url: string;
  /** The version we expect; the cache is keyed by it (immutable URL → cache-forever, §3.10). */
  contentVersion: string;
  /** Injectable fetch (defaults to globalThis.fetch) — lets tests avoid the network. */
  fetchImpl?: typeof fetch;
}

/**
 * Load the compiled Bundle for `contentVersion`, serving from the content_cache store when present
 * and re-fetching only when the version is absent (cache-bust on change, §3.10). On a miss it does a
 * plain static `fetch`, validates against the frozen Bundle schema, caches it, and updates the meta
 * contentVersion pointer.
 */
export async function loadBundle(db: TrellisDb, opts: LoadBundleOptions): Promise<Bundle> {
  const cached = (await db.conn.tx([STORES.contentCache], "readonly", async (tx) =>
    tx.store(STORES.contentCache).get(opts.contentVersion),
  )) as ContentCacheRecord | undefined;

  if (cached !== undefined && cached.contentVersion === opts.contentVersion) {
    return cached.bundle;
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(opts.url);
  if (!res.ok) throw new Error(`loadBundle: fetch ${opts.url} failed (${res.status})`);
  const json: unknown = await res.json();
  const bundle: Bundle = assertValid(BundleSchema, json) as Bundle;
  if (bundle.contentVersion !== opts.contentVersion) {
    throw new Error(`loadBundle: version mismatch — asked ${opts.contentVersion}, got ${bundle.contentVersion}`);
  }

  await db.conn.tx([STORES.contentCache, STORES.meta], "readwrite", async (tx) => {
    await tx.store(STORES.contentCache).put({ contentVersion: opts.contentVersion, bundle } satisfies ContentCacheRecord);
    await tx.store(STORES.meta).put({ key: META_KEYS.contentVersion, value: opts.contentVersion });
  });

  return bundle;
}
