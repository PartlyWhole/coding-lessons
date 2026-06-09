import { EditorState, type Extension, type Text } from "@codemirror/state";
import type { LineRange } from "@trellis/schema";

export interface Offset {
  from: number;
  to: number;
}

// §3.4 LineRange is 1-based inclusive. Map to {from,to} char offsets over the current doc.
export function lineRangesToOffsets(doc: Text, ranges: readonly LineRange[]): Offset[] {
  return ranges.map((r) => {
    const start = doc.line(r.startLine);
    const end = doc.line(r.endLine);
    return { from: start.from, to: end.to };
  });
}

// A transaction filter that cancels any document change overlapping a locked range. Returns
// the transaction unchanged to allow it, or [] to cancel it (CodeMirror's documented contract).
export function lockedRegionsExtension(ranges: readonly LineRange[]): Extension {
  if (ranges.length === 0) return [];
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    const locked = lineRangesToOffsets(tr.startState.doc, ranges);
    let blocked = false;
    tr.changes.iterChangedRanges((fromA, toA) => {
      for (const { from, to } of locked) {
        // half-open overlap test against the changed range in OLD doc coordinates
        if (fromA <= to && toA >= from) blocked = true;
      }
    });
    return blocked ? [] : tr;
  });
}
