import { Schema } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { ProsemirrorNode } from "../../../../shared/dist/node";
import { RenderPortal } from "./usePortals";
import { MentionDisplay } from "../../components/Mention/MentionDisplay";

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

    this.node = node;

    this.renderPortal(
      <MentionDisplay
        entityId={node.attrs.entityId}
        mentionType={node.attrs.mentionType}
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
