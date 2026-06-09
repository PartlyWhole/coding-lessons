// StepId is a TypeBox value in @trellis/schema, not a TS type → use `string`.
import type { BehavioralEvent } from "@trellis/schema";
import type { TrellisDb } from "./db.js";
import { STORES } from "./schema.js";

/** Outbound telemetry seam (§11.1): batch-append behavioral events in one readwrite txn. */
export async function appendEvents(db: TrellisDb, events: BehavioralEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db.conn.tx([STORES.behavioralEvent], "readwrite", async (tx) => {
    for (const e of events) await tx.store(STORES.behavioralEvent).put(e);
  });
}

export interface RecentEventsQuery {
  /** Restrict to one step (per-step trigger evaluation, §11). */
  stepId?: string;
  /** Max events to return; default 50. */
  limit?: number;
}

/**
 * Recent behavioral events, newest-first (read-back seam for the future ProactiveScaffolder, §11.3).
 * When `stepId` is given, scans the by_step_ts index range for that step; otherwise reads all.
 */
export async function recentEvents(db: TrellisDb, query: RecentEventsQuery): Promise<BehavioralEvent[]> {
  const limit = query.limit ?? 50;
  const rows = (await db.conn.tx([STORES.behavioralEvent], "readonly", async (tx) => {
    const store = tx.store(STORES.behavioralEvent);
    if (query.stepId !== undefined) {
      // Compound key [stepId, ts]: bound to this stepId across all timestamps.
      return store.index("by_step_ts").getAll({ lower: [query.stepId], upper: [query.stepId, "￿"] });
    }
    return store.getAll();
  })) as BehavioralEvent[];

  // Newest-first by (ts, seq). ts is ISO-8601 so lexical compare = chronological.
  rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : b.seq - a.seq));
  return rows.slice(0, limit);
}
