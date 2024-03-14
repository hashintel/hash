import {
  isHashTextBlock,
  paragraphBlockComponentId,
} from "@local/hash-isomorphic-utils/blocks";
import type { ProsemirrorManager } from "@local/hash-isomorphic-utils/prosemirror-manager";
import { Selection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export const cleanUpTitle = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export const focusEditorBeginning = async (
  view?: EditorView,
  manager?: ProsemirrorManager,
  addParagraphBlock = false,
) => {
  if (!view) {
    return;
  }

  const { state } = view;

  let newSelection = Selection.atStart(state.doc);
  const selectedNode = view.state.doc.nodeAt(newSelection.from - 1);
  const isTextNode = selectedNode && isHashTextBlock(selectedNode.type.name);

  let tr = state.tr;

  /**
   * if the first block in the document is not a text block
   * we create a new paragraph at the top
   * */
  if (addParagraphBlock && !isTextNode) {
    const newTransaction = (
      await manager?.insertBlock(paragraphBlockComponentId, null, 0)
    )?.tr;

    if (newTransaction) {
      tr = newTransaction;
      newSelection = Selection.atStart(tr.doc);
    }
  }

  tr = tr.setSelection(newSelection);
  view.dispatch(tr);

  /**
   * if we don't wait with setImmediate here, new view selection does not work correctly,
   * and we land focus on 2nd node instead of 1st on editor
   * */
  setImmediate(() => {
    view.focus();
  });
};
