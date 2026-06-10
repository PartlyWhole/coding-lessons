// §11.4 — capture policy. Defaults are privacy-first: no raw editor text, ever, unless a
// future surface flips captureEditorText explicitly. `enabled: false` is the master switch:
// attach() never subscribes anything (the Recorder simply does not exist on the bus).
export interface CapturePolicy {
  enabled: boolean;
  captureEditorText: boolean;
  idleThresholdMs: number;
  editorDebounceMs: number;
}

export const DEFAULT_CAPTURE_POLICY: CapturePolicy = {
  enabled: true,
  captureEditorText: false,
  idleThresholdMs: 90_000,
  editorDebounceMs: 400,
};

// FNV-1a 32-bit over UTF-16 code units, hex. The shared editor-buffer fingerprint: the
// client's editor_change emit site and telemetry's editDistanceProxy (D4) must agree on
// ONE hash so "same hash → distance 0" is meaningful. Not cryptographic — a content
// equality fingerprint only; raw text never leaves the page (§11.4).
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
