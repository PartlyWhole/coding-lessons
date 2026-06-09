import { useEffect, useState } from "react";
import type { Bundle, Cell } from "@trellis/schema";
import type { BuildSandbox } from "@trellis/engine";
import { openTrellisDb, nativeDriver, type TrellisDb } from "@trellis/persist";
import { createEventBus } from "../eventBus.js";
import { CellRunner } from "../CellRunner.js";
import { loadCellContent } from "./loadContent.js";

export interface TrellisAppProps {
  bundleUrl: string;
  contentVersion: string;
  cellId: string;
  sandbox: BuildSandbox;
}

const bus = createEventBus(); // single stubbed bus for the app (M6 attaches a subscriber here)

export function TrellisApp({ bundleUrl, contentVersion, cellId, sandbox }: TrellisAppProps): React.ReactElement {
  const [ready, setReady] = useState<{ bundle: Bundle; cell: Cell; db: TrellisDb } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let db: TrellisDb | null = null;
    (async () => {
      try {
        db = await openTrellisDb(nativeDriver());
        const { bundle, cell } = await loadCellContent(db, { url: bundleUrl, contentVersion, cellId });
        setReady({ bundle, cell, db });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => db?.close();
  }, [bundleUrl, contentVersion, cellId]);

  if (err !== null) return <div role="alert">Failed to load: {err}</div>;
  if (ready === null) return <div>Loading…</div>;
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
