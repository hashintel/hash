import { Selection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { useBlockView } from "../block-view";
import { useUserBlocks } from "../../user-blocks";
import { InsertBlock } from "../insert-block";
import { ProsemirrorManager } from "@local/hash-isomorphic-utils/prosemirror-manager";
import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";

export const cleanUpTitle = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export const focusEditorBeginning = (
  view?: EditorView,
  manager?: ProsemirrorManager,
) => {
  if (!view) {
    return;
  }

  const { state } = view;

  // Insert block at the beggining of the document
  // manager
  //   ?.insertBlock(paragraphBlockComponentId, null, 0)
  //   .then(({ tr }) => view.dispatch(tr));

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
