import { ProsemirrorLoadingState } from "./prosemirror-loading-state";

import type { RenderPortal } from "./block-portals";
import type { Node } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";

export class LoadingView implements NodeView {
  dom: HTMLDivElement;

  constructor(
    node: Node,
    private renderPortal: RenderPortal,
  ) {
    this.dom = document.createElement("div");
    this.update(node);
  }

  update(node: Node) {
    if (node.type.name !== "loading") {
      return false;
    }

    this.renderPortal(<ProsemirrorLoadingState />, this.dom);
    return true;
  }

  destroy() {
    this.renderPortal(null, this.dom);
  }
}
