import "@tldraw/tldraw/editor.css";
import "@tldraw/tldraw/ui.css";

import { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import { AccountId, EntityId } from "@local/hash-subgraph";
import { getEmbedInfo } from "@tldraw/editor/src/lib/utils";
import { toDomPrecision } from "@tldraw/primitives";
import {
  App,
  defineShape,
  TLBaseShape,
  TLBoxUtil,
  Tldraw,
} from "@tldraw/tldraw";
import { TLEmbedShape } from "@tldraw/tlschema";
import { useMemo } from "react";
import * as React from "react";

import { BlocksMap } from "../../../blocks/page/create-editor-view";
import { PageThread } from "../../../components/hooks/use-page-comments";

type CanvasPageBlockProps = {
  contents: BlockEntity[];
  blocks: BlocksMap;
  pageComments: PageThread[];
  accountId: AccountId;
  entityId: EntityId;
};

type BlockShape = TLBaseShape<
  "bpBlock",
  {
    blockType: string;
    w: number;
    h: number;
    opacity: string;
    type: "bpBlock";
  }
>;

class BlockComponent extends TLBoxUtil<BlockShape> {
  defaultProps() {
    return {
      opacity: "1",
      w: 100,
      h: 100,
      blockType: "unknown",
    };
  }

  indicator(shape: BlockShape) {
    return (
      <rect
        color="red"
        width={toDomPrecision(shape.props.w)}
        height={toDomPrecision(shape.props.h)}
        rx={8}
        ry={8}
      />
    );
  }

  render() {
    return <div>hello</div>;
  }
}
defineShape({
  type: "bpBlock",
  getShapeUtil: () => BlockComponent<BlockShape, BlockShape>,
});

export const CanvasPageBlock = ({ blocks, contents }: CanvasPageBlockProps) => {
  const handleMount = (app: App) => {
    app.createShapes([BlockComponent]);
  };

  return (
    <div style={{ height: "100%" }}>
      <Tldraw />
    </div>
  );
};
