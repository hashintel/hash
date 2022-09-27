import { ProsemirrorNode, Schema } from "prosemirror-model";
import { Decoration, EditorView } from "prosemirror-view";
import { RenderPortal } from "../usePortals";
import { MentionView } from "./MentionView";

// Reason for adding `_decorations`:
// https://github.com/DefinitelyTyped/DefinitelyTyped/pull/57384#issuecomment-1018936089
export const mentionNodeView =
  (renderPortal: RenderPortal, accountId: string) =>
  (
    currentNode: ProsemirrorNode<Schema>,
    currentView: EditorView<Schema>,
    getPos: () => number,
    _decorations: Decoration[],
  ) => {
    if (typeof getPos === "boolean") {
      throw new Error("Invalid config for nodeview");
    }

    return new MentionView(
      currentNode,
      currentView,
      getPos,
      renderPortal,
      accountId,
    );
  };
