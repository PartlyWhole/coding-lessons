import type { IdbConnection, IdbDriver } from "./idb/types.js";
import { DB_NAME, DB_VERSION, STORE_SPECS, STORES, META_KEYS } from "./schema.js";
import type { MetaRecord } from "./schema.js";

export interface OpenOptions {
  /** uuid source for learnerId bootstrap; defaults to crypto.randomUUID. */
  idGen?: () => string;
}

export interface TrellisDb {
  readonly conn: IdbConnection;
  readonly learnerId: string;
  getMeta(key: string): Promise<unknown>;
  setMeta(key: string, value: unknown): Promise<void>;
  close(): void;
}

function defaultIdGen(): string {
  return crypto.randomUUID();
}

export async function openTrellisDb(driver: IdbDriver, opts: OpenOptions = {}): Promise<TrellisDb> {
  const idGen = opts.idGen ?? defaultIdGen;
  const conn = await driver.open(DB_NAME, DB_VERSION, STORE_SPECS);

  const getMeta = async (key: string): Promise<unknown> => {
    const rec = (await conn.tx([STORES.meta], "readonly", async (tx) =>
      tx.store(STORES.meta).get(key),
    )) as MetaRecord | undefined;
    return rec?.value;
  };
  const setMeta = async (key: string, value: unknown): Promise<void> => {
    await conn.tx([STORES.meta], "readwrite", async (tx) => {
      await tx.store(STORES.meta).put({ key, value } satisfies MetaRecord);
    });
  };

  // Bootstrap learnerId once (one learner per browser profile, §3.10).
  let learnerId = (await getMeta(META_KEYS.learnerId)) as string | undefined;
  if (learnerId === undefined) {
    learnerId = idGen();
    await setMeta(META_KEYS.learnerId, learnerId);
  }

  return {
    conn,
    learnerId,
    getMeta,
    setMeta,
    close: () => conn.close(),
  };
}
