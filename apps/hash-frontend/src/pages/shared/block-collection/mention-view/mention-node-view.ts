import type { WebId } from "@blockprotocol/type-system";
import type { Node } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

import type { RenderPortal } from "../block-portals";
import { MentionView } from "./mention-view";

export const mentionNodeView =
  (renderPortal: RenderPortal, webId: WebId) =>
  (currentNode: Node, currentView: EditorView, getPos: () => number) => {
    if (typeof getPos === "boolean") {
      throw new Error("Invalid config for nodeview");
    }

    return new MentionView(
      currentNode,
      currentView,
      getPos,
      renderPortal,
      webId,
    );
  };
