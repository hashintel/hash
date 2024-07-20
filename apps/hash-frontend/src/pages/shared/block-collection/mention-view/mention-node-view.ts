import type { Node } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import type { OwnedById } from "@local/hash-graph-types/web";

import type { RenderPortal } from "../block-portals";

import { MentionView } from "./mention-view";

export const mentionNodeView =
  (renderPortal: RenderPortal, ownedById: OwnedById) =>
  (currentNode: Node, currentView: EditorView, getPos: () => number) => {
    if (typeof getPos === "boolean") {
      throw new TypeError("Invalid config for nodeview");
    }

    return new MentionView(
      currentNode,
      currentView,
      getPos,
      renderPortal,
      ownedById,
    );
  };
