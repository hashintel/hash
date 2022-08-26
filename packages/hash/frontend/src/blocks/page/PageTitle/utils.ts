import { Schema } from "prosemirror-model";
import { Selection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

export const cleanUpTitle = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export const focusEditorBeginning = (view?: EditorView<Schema>) => {
  if (!view) return;

  const { state } = view;

  const newSelection = Selection.atStart(state.doc);

  const tr = state.tr.setSelection(newSelection);

  const newState = state.apply(tr);
  view.updateState(newState);

  setImmediate(() => {
    view.focus();
  });
};
