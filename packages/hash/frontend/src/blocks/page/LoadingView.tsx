import { Box } from "@mui/material";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { NodeView } from "prosemirror-view";
import { BlockLoadingIndicator } from "../../components/RemoteBlock/RemoteBlock";

import { RenderPortal } from "./usePortals";

export const ProsemirrorLoadingState = () => {
  return (
    <Box mt={2.75}>
      {[1, 2, 3].map((num) => (
        <BlockLoadingIndicator sx={{ mb: 0.9 }} key={num} />
      ))}
    </Box>
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

    this.renderPortal(<ProsemirrorLoadingState />, this.dom);
    return true;
  }

  destroy() {
    this.renderPortal(null, this.dom);
  }
}
