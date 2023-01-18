import { Box } from "@mui/material";
import { Node } from "prosemirror-model";
import { NodeView } from "prosemirror-view";

import { BlockLoadingIndicator } from "../../components/remote-block/remote-block";
import { RenderPortal } from "./block-portals";

export const ProsemirrorLoadingState = () => {
  return (
    <Box mt={3.75}>
      {[1, 2, 3].map((num) => (
        <BlockLoadingIndicator
          key={num}
          sx={{
            /**
             * 30px is space between blocks
             * @see https://github.com/hashintel/hash/blob/ea0dacf87b6a120986081803a541cdb27ff85b02/apps/hash-frontend/src/blocks/page/style.module.css#L22
             */
            mb: "30px",
          }}
        />
      ))}
    </Box>
  );
};

export class LoadingView implements NodeView {
  dom: HTMLDivElement;

  constructor(node: Node, private renderPortal: RenderPortal) {
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
