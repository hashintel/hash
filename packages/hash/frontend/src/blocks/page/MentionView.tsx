import { Schema } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import { ProsemirrorNode } from "../../../../shared/dist/node";
import { RenderPortal } from "./usePortals";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";

export class MentionView implements NodeView<Schema> {
  dom: HTMLSpanElement;

  constructor(
    public node: ProsemirrorNode<Schema>,
    public view: EditorView<Schema>,
    public getPos: () => number,
    public renderPortal: RenderPortal,
    public manager: ProsemirrorSchemaManager,
  ) {
    this.dom = document.createElement("span");
    this.dom.classList.add("mention-stuff");

    this.update(node);
  }

  update(node: ProsemirrorNode<Schema>) {
    if (node.type.name !== "mention") {
      return false;
    }

    this.node = node

    console.log("node ==> ", node)

    this.renderPortal(<>@mention!</>, this.dom);

    return true;
  }

  destroy() {
    this.renderPortal(null, this.dom);
    this.dom.remove();
  }
}
