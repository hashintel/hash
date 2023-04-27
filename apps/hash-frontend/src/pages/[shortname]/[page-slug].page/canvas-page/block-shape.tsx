import { CanvasPosition } from "@local/hash-graphql-shared/graphql/types";
import {
  getPageQuery,
  updatePageContents,
} from "@local/hash-graphql-shared/queries/page.queries";
import { EntityId } from "@local/hash-subgraph";
import { toDomPrecision } from "@tldraw/primitives";
import {
  createShapeValidator,
  defineShape,
  HTMLContainer,
  TLBaseShape,
  TLBoxTool,
  TLBoxUtil,
  TLOpacityType,
} from "@tldraw/tldraw";
import { T } from "@tldraw/tlvalidate";

import { BlockContextProvider } from "../../../../blocks/page/block-context";
import { BlockLoader } from "../../../../components/block-loader/block-loader";
import {
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
} from "../../../../graphql/api-types.gen";
import { apolloClient } from "../../../../lib/apollo-client";
import { defaultBlockWidth, JsonSerializableBlockLoaderProps } from "./shared";

type BlockShape = TLBaseShape<
  "bpBlock",
  {
    w: number;
    h: number;
    opacity: TLOpacityType;
    firstCreation: boolean;
    indexPosition: number;
    pageEntityId: EntityId;
    blockLoaderProps: Partial<JsonSerializableBlockLoaderProps>;
  }
>;

const persistBlockPosition = ({
  blockIndexPosition,
  pageEntityId,
  canvasPosition,
}: {
  blockIndexPosition: number;
  pageEntityId: EntityId;
  canvasPosition: CanvasPosition;
}) => {
  void apolloClient.mutate<
    UpdatePageContentsMutation,
    UpdatePageContentsMutationVariables
  >({
    variables: {
      actions: {
        moveBlock: {
          currentPosition: blockIndexPosition,
          newPosition: blockIndexPosition,
          canvasPosition,
        },
      },
      entityId: pageEntityId,
    },
    mutation: updatePageContents,
    refetchQueries: [
      { query: getPageQuery, variables: { entityId: pageEntityId } },
    ],
  });
};

export class BlockUtil extends TLBoxUtil<BlockShape> {
  static type = "bpBlock";

  override canEdit = () => false;

  // i.e. moving its position
  override onTranslateEnd = (_previous: BlockShape, current: BlockShape) => {
    BlockUtil.persistShapePosition(current);
  };

  override onResizeEnd = (_previous: BlockShape, current: BlockShape) => {
    BlockUtil.persistShapePosition(current);
  };

  override onRotateEnd = (_previous: BlockShape, current: BlockShape) => {
    BlockUtil.persistShapePosition(current);
  };

  static shapeToCanvasPosition = (shape: BlockShape): CanvasPosition => {
    return {
      "https://blockprotocol.org/@hash/types/property-type/x-position/":
        shape.x,
      "https://blockprotocol.org/@hash/types/property-type/y-position/":
        shape.y,
      "https://blockprotocol.org/@hash/types/property-type/width-in-pixels/":
        shape.props.w,
      "https://blockprotocol.org/@hash/types/property-type/height-in-pixels/":
        shape.props.h,
      "https://blockprotocol.org/@hash/types/property-type/rotation-in-rads/":
        shape.rotation,
    };
  };

  static persistShapePosition = (shape: BlockShape) => {
    persistBlockPosition({
      blockIndexPosition: shape.props.indexPosition,
      pageEntityId: shape.props.pageEntityId,
      canvasPosition: BlockUtil.shapeToCanvasPosition(shape),
    });
  };

  defaultProps() {
    return {
      opacity: "1" as const,
      w: defaultBlockWidth,
      h: 150,
      firstCreation: true,
      blockLoaderProps: {},
      indexPosition: 0,
      pageEntityId: "placeholder-123" as EntityId,
    };
  }

  indicator(shape: BlockShape) {
    return (
      <rect
        width={toDomPrecision(shape.props.w)}
        height={toDomPrecision(shape.props.h)}
        color="red"
      />
    );
  }

  render(shape: BlockShape) {
    const bounds = this.bounds(shape);

    const { opacity: _opacity, w, h, blockLoaderProps } = shape.props;

    const onBlockLoaded = () => {
      return;

      // @todo the intention of this is to set the width and height of the block based on its rendered size
      //    but the outer element of the block might be smaller than the content,
      //    if the block doesn't respect its container – needs more work
      if (shape.props.firstCreation) {
        const blockWrapper = document.getElementById(
          blockLoaderProps.wrappingEntityId,
        );
        if (!blockWrapper) {
          throw new Error(
            `No block element with id ${blockLoaderProps.wrappingEntityId} found in DOM`,
          );
        }
        this.app.updateShapes([
          {
            ...shape,
            props: {
              ...shape.props,
              w: blockWrapper.clientWidth,
              h: blockWrapper.clientHeight,
              firstCreation: false,
            },
          } satisfies BlockShape,
        ]);
      }
    };

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          pointerEvents: "all",
          width: bounds.width,
          height: bounds.height,
        }}
      >
        <BlockContextProvider key={blockLoaderProps.wrappingEntityId}>
          <BlockLoader
            {...blockLoaderProps}
            editableRef={null}
            onBlockLoaded={onBlockLoaded}
          />
        </BlockContextProvider>
      </HTMLContainer>
    );
  }
}

export const BlockShapeDef = defineShape<BlockShape, BlockUtil>({
  type: "bpBlock",
  getShapeUtil: () => BlockUtil,
  validator: createShapeValidator(
    "bpBlock",
    T.any,
    // T.object({
    //   w: T.number,
    //   h: T.number,
    //   firstCreation: T.boolean,
    //   opacity: T.string,
    //   indexPosition: T.number,
    //   pageEntityId: T.string,
    //   blockLoaderProps: T.any,
    // }),
  ),
});

export class BlockTool extends TLBoxTool {
  static id = "bpBlock";
  static initial = "idle";

  shapeType = "bpBlock";
}
