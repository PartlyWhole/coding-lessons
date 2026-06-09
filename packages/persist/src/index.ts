// Public API of @trellis/persist (the browser-local data layer).

// Drivers — production (browser) and in-memory (tests / offline gates).
export { nativeDriver } from "./idb/native.js";
export { memoryDriver, FaultController } from "./idb/memory.js";
export type {
  IdbDriver,
  IdbConnection,
  IdbTxnHandle,
  IdbStoreHandle,
  IdbIndexHandle,
  StoreSpec,
  IndexSpec,
  KeyRange,
  Mode,
} from "./idb/types.js";

// Schema / store metadata.
export {
  DB_NAME,
  DB_VERSION,
  STORES,
  STORE_SPECS,
  META_KEYS,
} from "./schema.js";
export type { StoredSkillState, MetaRecord, ContentCacheRecord } from "./schema.js";

// Open + high-level operations.
export { openTrellisDb } from "./db.js";
export type { TrellisDb, OpenOptions } from "./db.js";
export { commitSubmission } from "./commitSubmission.js";
export type { SubmissionWrite } from "./commitSubmission.js";
export { loadLearnerModel, readDiagnoses } from "./learnerModel.js";
export { appendEvents, recentEvents } from "./events.js";
export type { RecentEventsQuery } from "./events.js";
export { loadBundle } from "./contentCache.js";
export type { LoadBundleOptions } from "./contentCache.js";
