import { Schema } from "prosemirror-model";
import { Selection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

// TODO: Improve page title validation and use it when creating pages.
// Alternatively, we can validate on server-side only and handle mutation errors.
export const isValidPageTitle = (value: string): boolean =>
  Boolean(value.length);

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
