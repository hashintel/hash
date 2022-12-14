import { Node } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { AccountId } from "@hashintel/hash-shared/types";

import { RenderPortal } from "../usePortals";
import { MentionView } from "./MentionView";

export const mentionNodeView =
  (renderPortal: RenderPortal, accountId: AccountId) =>
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
