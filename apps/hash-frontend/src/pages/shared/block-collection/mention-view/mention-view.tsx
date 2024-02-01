import { OwnedById } from "@local/hash-subgraph";
import { Node } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";

import { RenderPortal } from "../block-portals";
import { MentionDisplay } from "./mention-display";

export class MentionView implements NodeView {
  dom: HTMLSpanElement;

  constructor(
    public node: Node,
    public view: EditorView,
    public getPos: () => number,
    public renderPortal: RenderPortal,
    public ownedById: OwnedById,
  ) {
    this.dom = document.createElement("span");
    this.dom.classList.add("mention-stuff");

    this.update(node);
  }

  update(node: Node) {
    if (node.type.name !== "mention") {
      return false;
    }

    this.node = node;

    this.renderPortal(
      <MentionDisplay
        mention={{
          kind: node.attrs.mentionType,
          entityId: node.attrs.entityId,
          propertyTypeBaseUrl: node.attrs.propertyTypeBaseUrl,
          linkEntityTypeBaseUrl: node.attrs.linkEntityTypeBaseUrl,
        }}
      />,
      this.dom,
    );

    return true;
  }

  destroy() {
    this.renderPortal(null, this.dom);
    this.dom.remove();
  }
}
