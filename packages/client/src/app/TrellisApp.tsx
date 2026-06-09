import { useEffect, useState } from "react";
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { openTrellisDb, nativeDriver, type IdbDriver, type TrellisDb } from "@trellis/persist";
import { createEventBus } from "../eventBus.js";
import { CellRunner } from "../CellRunner.js";
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
}

const bus = createEventBus(); // single stubbed bus for the app (M6 attaches a subscriber here)

export function TrellisApp({ bundleUrl, contentVersion, cellId, sandbox, warmup, driver, fetchImpl }: TrellisAppProps): React.ReactElement {
  const [ready, setReady] = useState<{ bundle: Bundle; cell: Cell; db: TrellisDb } | null>(null);
  const [warm, setWarm] = useState<boolean>(warmup === undefined);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let db: TrellisDb | null = null;
    (async () => {
      try {
        db = await openTrellisDb(driver ?? nativeDriver());
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
    return () => db?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- injectables are mount-stable
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
      cell={ready.cell}
      bundle={ready.bundle}
      sandbox={sandbox}
      bus={bus}
      db={ready.db}
      effects={{ newId: () => crypto.randomUUID(), now: () => new Date().toISOString(), learnerId: ready.db.learnerId }}
    />
  );
}
