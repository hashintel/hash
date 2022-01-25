import { ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { RenderPortal } from "../usePortals";
import { MentionDisplay } from "./MentionDisplay";

export class MentionView implements NodeView<Schema> {
  dom: HTMLSpanElement;

  constructor(
    public node: ProsemirrorNode<Schema>,
    public view: EditorView<Schema>,
    public getPos: () => number,
    public renderPortal: RenderPortal,
    public manager: ProsemirrorSchemaManager,
    public accountId: string,
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
        accountId={this.accountId}
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
