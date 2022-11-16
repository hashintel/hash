import { Node } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import { RenderPortal } from "../usePortals";
import { MentionDisplay } from "./MentionDisplay";

export class MentionView implements NodeView {
  dom: HTMLSpanElement;

  constructor(
    public node: Node,
    public view: EditorView,
    public getPos: () => number,
    public renderPortal: RenderPortal,
    public accountId: string,
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
