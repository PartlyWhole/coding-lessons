import { EditorState, RangeSet, RangeSetBuilder, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, lineNumberMarkers } from "@codemirror/view";
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

// ---- Greenhouse styling contract (design handback) — behavior is UNCHANGED. ----
// 1. Decoration.line({ class: "cm-lockedLine" }) on every line inside a LineRange;
// 2. a line-number GutterMarker whose toDOM is a span.cm-lockedGutter (the lock glyph
//    comes from the theme's ::after rule);
// 3. (below, pre-existing) the transactionFilter rejecting changes SILENTLY — no shake,
//    no toast: the dashed rail + lock + dimmed text carry the message.
const lockedLineDeco = Decoration.line({ class: "cm-lockedLine" });

class LockedGutterMarker extends GutterMarker {
  override toDOM(): Node {
    return Object.assign(document.createElement("span"), { className: "cm-lockedGutter" });
  }
}
const lockedGutterMarker = new LockedGutterMarker();

// Sorted, de-duplicated char offsets of every locked line start (clamped to the doc).
function lockedLineFroms(doc: Text, ranges: readonly LineRange[]): number[] {
  const froms = new Set<number>();
  for (const r of ranges) {
    const start = Math.max(1, Math.min(r.startLine, doc.lines));
    const end = Math.max(1, Math.min(r.endLine, doc.lines));
    for (let n = start; n <= end; n++) froms.add(doc.line(n).from);
  }
  return [...froms].sort((a, b) => a - b);
}

function buildDecoSet(doc: Text, ranges: readonly LineRange[]): RangeSet<Decoration> {
  const b = new RangeSetBuilder<Decoration>();
  for (const from of lockedLineFroms(doc, ranges)) b.add(from, from, lockedLineDeco);
  return b.finish();
}

function buildGutterSet(doc: Text, ranges: readonly LineRange[]): RangeSet<GutterMarker> {
  const b = new RangeSetBuilder<GutterMarker>();
  for (const from of lockedLineFroms(doc, ranges)) b.add(from, from, lockedGutterMarker);
  return b.finish();
}

// A transaction filter that cancels any document change overlapping a locked range (returns
// the transaction unchanged to allow it, or [] to cancel it — CodeMirror's documented
// contract), plus the visual contract above.
export function lockedRegionsExtension(ranges: readonly LineRange[]): Extension {
  if (ranges.length === 0) return [];
  return [
    EditorState.transactionFilter.of((tr) => {
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
    }),
    EditorView.decorations.compute(["doc"], (state) => buildDecoSet(state.doc, ranges)),
    lineNumberMarkers.compute(["doc"], (state) => buildGutterSet(state.doc, ranges)),
  ];
}
