import type { Bundle, Cell } from "@trellis/schema";
import { loadBundle, type TrellisDb } from "@trellis/persist";

export interface LoadCellOptions {
  url: string;
  contentVersion: string;
  cellId: string;
  fetchImpl?: typeof fetch;
}

// Load (or serve from the contentVersion cache) the compiled Bundle, then pick one cell.
export async function loadCellContent(db: TrellisDb, opts: LoadCellOptions): Promise<{ bundle: Bundle; cell: Cell }> {
  const bundle = await loadBundle(db, {
    url: opts.url,
    contentVersion: opts.contentVersion,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  const cell = bundle.cells[opts.cellId];
  if (cell === undefined) throw new Error(`loadCellContent: cell ${opts.cellId} not in bundle`);
  return { bundle, cell };
}
