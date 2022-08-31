import { Skeleton } from "@mui/material";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { NodeView } from "prosemirror-view";

import { RenderPortal } from "./usePortals";

const PageContentLoadingState = () => {
  return (
    <>
      {[1, 2, 3].map((num) => (
        <Skeleton key={num} animation="wave" height={50} />
      ))}
    </>
  );
};

export class LoadingView implements NodeView<Schema> {
  dom: HTMLDivElement;

  constructor(
    public node: ProsemirrorNode<Schema>,
    public renderPortal: RenderPortal,
  ) {
    this.dom = document.createElement("div");
    this.update(node);
  }

  update(node: ProsemirrorNode<Schema>) {
    if (node.type.name !== "loading") {
      return false;
    }

    this.renderPortal(<PageContentLoadingState />, this.dom);
    return true;
  }

  destroy() {
    this.renderPortal(null, this.dom);
  }
}
