import { ProsemirrorNode } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { RenderPortal } from "../usePortals";
import { MentionView } from "./MentionView";

export const mentionNodeView =
  (renderPortal: RenderPortal, accountId: string) =>
  (
    currentNode: ProsemirrorNode,
    currentView: EditorView,
    getPos: () => number,
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
