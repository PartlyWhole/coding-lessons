import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import type { LineRange } from "@trellis/schema";
import { lockedRegionsExtension } from "./lockedRegions.js";
import { trellisEditor } from "./trellis-editor-theme.js";

export interface EditorPaneProps {
  value: string;
  onChange: (next: string) => void;
  lockedRegions?: LineRange[];
}

// CodeMirror 6 mounted in a ref. Created once on mount; an external `value` change is
// reconciled by dispatching a doc-replacing transaction. The updateListener reports learner
// edits up via onChange. lockedRegions wires the §3.4 pygame seam.
//
// Deliberately NO readOnly prop: the editor stays typeable; submission legality lives in the
// buttons + step machine (§5.1 — retry preserves the buffer, resubmit cancels in-flight).
// A mount-frozen readOnly prop once baked the FIRST step's transient PENDING `disabled` into
// the editor permanently (auto-enter to ACTIVE is a post-mount effect in useCellRunner); see
// the cellRunner regression test. If a read-only editor is ever genuinely needed, add the
// prop back reconciled via a CM Compartment, not baked at mount.
export function EditorPane({ value, onChange, lockedRegions = [] }: EditorPaneProps): React.ReactElement {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (host.current === null) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        ...trellisEditor, // Greenhouse terrarium theme + beginner-few-hues highlighting
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        python(),
        lockedRegionsExtension(lockedRegions),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // Mount-once: lockedRegions are fixed per step (the step remounts under a new key, §5.2).
  }, []);

  // Reconcile an external value change without losing focus.
  useEffect(() => {
    const v = view.current;
    if (v === null) return;
    const current = v.state.doc.toString();
    if (current !== value) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div className="editor-pane" ref={host} />;
}
