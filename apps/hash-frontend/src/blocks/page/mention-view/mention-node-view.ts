import { AccountId } from "@local/hash-graphql-shared/types";
import { Node } from "prosemirror-model";
import { EditorView } from "prosemirror-view";

import { RenderPortal } from "../block-portals";
import { MentionView } from "./mention-view";

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
