import type { SkillState, Bundle } from "@trellis/schema";
import type { StoreSpec } from "./idb/types.js";

export const DB_NAME = "trellis";
export const DB_VERSION = 1;

export const STORES = {
  learnerSkill: "learner_skill",
  diagnosis: "diagnosis",
  behavioralEvent: "behavioral_event",
  meta: "meta",
  contentCache: "content_cache",
} as const;

// §3.10 object stores + the START-HERE content_cache.
export const STORE_SPECS: StoreSpec[] = [
  { name: STORES.learnerSkill, keyPath: "skillId", indexes: [{ name: "by_lastSeen", keyPath: "lastSeen" }] },
  { name: STORES.diagnosis, keyPath: "id", indexes: [{ name: "by_submittedAt", keyPath: "submittedAt" }] },
  { name: STORES.behavioralEvent, keyPath: "id", indexes: [{ name: "by_step_ts", keyPath: ["stepId", "ts"] }] },
  { name: STORES.meta, keyPath: "key" },
  { name: STORES.contentCache, keyPath: "contentVersion" },
];

// learner_skill value = SkillState plus its key (§3.10: "SkillState (+ skillId)").
export type StoredSkillState = SkillState & { skillId: string };

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface ContentCacheRecord {
  contentVersion: string;
  bundle: Bundle;
}

export const META_KEYS = {
  learnerId: "learnerId",
  contentVersion: "contentVersion",
} as const;
