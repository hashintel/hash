import { Selection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

export const cleanUpTitle = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export const focusEditorBeginning = (view?: EditorView) => {
  if (!view) {
    return;
  }

  const { state } = view;

  const newSelection = Selection.atStart(state.doc);

  const tr = state.tr.setSelection(newSelection);
  view.dispatch(tr);

  /**
   * if we don't wait with setImmediate here, new view selection does not work correctly,
   * and we land focus on 2nd node instead of 1st on editor
   * */
  setImmediate(() => {
    view.focus();
  });
};
