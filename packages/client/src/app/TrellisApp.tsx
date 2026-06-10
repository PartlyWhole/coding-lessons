import { useEffect, useState } from "react";
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { openTrellisDb, nativeDriver, appendEvents, recentEvents, type IdbDriver, type TrellisDb } from "@trellis/persist";
import { attachTelemetry, realClock, realIds, DEFAULT_CAPTURE_POLICY, type ListenerTarget } from "@trellis/telemetry";
import { createEventBus } from "../eventBus.js";
import { CellRunner } from "../CellRunner.js";
import type { ClientPygameRuntime } from "../types.js";
import { loadCellContent } from "./loadContent.js";

export interface TrellisAppProps {
  bundleUrl: string;
  contentVersion: string;
  cellId: string;
  sandbox: BuildSandbox;
  /** ManagedSandbox.warmup — gates the ⚑ "Getting Python ready…" app-warming state.
      Omitted → no warming state (default behavior unchanged). */
  warmup?: () => Promise<void>;
  /** Test seam; production default is the real IndexedDB driver. */
  driver?: IdbDriver;
  /** Test seam; production default is globalThis.fetch (via loadBundle). */
  fetchImpl?: typeof fetch;
  /** M6.5 — optional pygame player (lazy main-thread Pyodide); absent → unchanged. */
  pygameRuntime?: ClientPygameRuntime;
}

const bus = createEventBus(); // single bus for the app; M6 telemetry subscribes below

// M6 §11.1 — visibilitychange is a document event, pagehide a window event; route each to
// its real target so the EventBuffer's close-flush triggers actually fire.
const domTarget: ListenerTarget = {
  addEventListener: (type, fn) => (type === "visibilitychange" ? document : window).addEventListener(type, fn),
  removeEventListener: (type, fn) => (type === "visibilitychange" ? document : window).removeEventListener(type, fn),
};

export function TrellisApp({ bundleUrl, contentVersion, cellId, sandbox, warmup, driver, fetchImpl, pygameRuntime }: TrellisAppProps): React.ReactElement {
  const [ready, setReady] = useState<{ bundle: Bundle; cell: Cell; db: TrellisDb } | null>(null);
  const [warm, setWarm] = useState<boolean>(warmup === undefined);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let db: TrellisDb | null = null;
    let detachTelemetry: (() => void) | null = null;
    (async () => {
      try {
        db = await openTrellisDb(driver ?? nativeDriver());
        // M6 §11.1 — THE one-line telemetry seam: subscribe the recorder to the existing
        // bus. Zero emit-site involvement; a telemetry failure can never break the lesson
        // (bus swallows; buffer flush warn-and-drops on a closing db).
        const tdb = db;
        detachTelemetry = attachTelemetry({
          bus,
          persist: { appendEvents: (ev) => appendEvents(tdb, ev), recentEvents: (q) => recentEvents(tdb, q) },
          clock: realClock,
          ids: realIds,
          policy: DEFAULT_CAPTURE_POLICY,
          learnerId: db.learnerId,
          target: domTarget,
          isHidden: () => document.visibilityState === "hidden",
        });
        const { bundle, cell } = await loadCellContent(db, {
          url: bundleUrl,
          contentVersion,
          cellId,
          ...(fetchImpl ? { fetchImpl } : {}),
        });
        setReady({ bundle, cell, db });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    // Warm the Python runtime concurrently with the content load. A warmup failure must
    // never strand the learner here — the run path surfaces real errors at grade time.
    if (warmup !== undefined) {
      warmup().then(
        () => setWarm(true),
        () => setWarm(true),
      );
    }
    return () => {
      detachTelemetry?.(); // flush precedes close (M5 teardown lesson: never unhandled-reject)
      db?.close();
    };
    // injectables (warmup/driver/fetchImpl) are mount-stable by contract — deps unchanged
  }, [bundleUrl, contentVersion, cellId]);

  // ⚑ Greenhouse app states: calm, centered, no spinners anywhere.
  if (err !== null) {
    return (
      <div className="app-state">
        <div role="alert" className="app-error">
          <div className="app-status">{"Couldn't load this lesson"}</div>
          <p className="app-sub">Your progress is safe on this device. Check your connection and reload the page.</p>
          <p>
            <code>Failed to load: {err}</code>
          </p>
        </div>
      </div>
    );
  }
  if (ready === null) {
    return (
      <div className="app-state app-loading">
        <div className="app-status">Loading…</div>
      </div>
    );
  }
  if (!warm) {
    return (
      <div className="app-state app-warming">
        <div className="app-status">Getting Python ready…</div>
        <div className="warm-bar">
          <i />
        </div>
        <div className="app-sub">First visit takes a few seconds. After this, checking your code is instant.</div>
      </div>
    );
  }
  return (
    <CellRunner
      {...(pygameRuntime !== undefined ? { pygameRuntime } : {})}
      cell={ready.cell}
      bundle={ready.bundle}
      sandbox={sandbox}
      bus={bus}
      db={ready.db}
      effects={{ newId: () => crypto.randomUUID(), now: () => new Date().toISOString(), learnerId: ready.db.learnerId }}
    />
  );
}
