import { Node } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { RenderPortal } from "../BlockPortals";
import { MentionView } from "./MentionView";

export const mentionNodeView =
  (renderPortal: RenderPortal, accountId: string) =>
  (currentNode: Node, currentView: EditorView, getPos: () => number) => {
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
