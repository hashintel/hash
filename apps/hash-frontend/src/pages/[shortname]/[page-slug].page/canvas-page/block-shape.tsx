import { CanvasPosition } from "@local/hash-graphql-shared/graphql/types";
import {
  getPageQuery,
  updatePageContents,
} from "@local/hash-graphql-shared/queries/page.queries";
import { EntityId } from "@local/hash-subgraph";
import { toDomPrecision } from "@tldraw/primitives";
import {
  defineShape,
  HTMLContainer,
  TLBaseShape,
  TLBoxTool,
  TLBoxUtil,
  TLOpacityType,
} from "@tldraw/tldraw";

import { BlockContextProvider } from "../../../../blocks/page/block-context";
import { BlockLoader } from "../../../../components/block-loader/block-loader";
import {
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
} from "../../../../graphql/api-types.gen";
import { apolloClient } from "../../../../lib/apollo-client";
import {
  defaultBlockHeight,
  defaultBlockWidth,
  JsonSerializableBlockLoaderProps,
} from "./shared";

// Defines the string id and the 'props' available on our custom TLDraw shape
export type BlockShape = TLBaseShape<
  "bpBlock",
  {
    w: number;
    h: number;
    opacity: TLOpacityType;
    indexPosition: number;
    pageEntityId: EntityId;
    blockLoaderProps: JsonSerializableBlockLoaderProps;
  }
>;

// Persist a block's new position in the database
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

// Defines the behaviour of our custom shape in TLDraw
export class BlockUtil extends TLBoxUtil<BlockShape> {
  static type = "bpBlock";

  // gather a shape's positional information into a flat object
  // they are split up in TLDraw because x, y and rotation are properties on every shape, whereas w and h are not
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

  // Editing of block contents happens in 'locked' canvas view, not here
  override canEdit = () => false;

  override onTranslateEnd = (_previous: BlockShape, current: BlockShape) => {
    BlockUtil.persistShapePosition(current);
  };

  override onResizeEnd = (_previous: BlockShape, current: BlockShape) => {
    BlockUtil.persistShapePosition(current);
  };

  override onRotateEnd = (_previous: BlockShape, current: BlockShape) => {
    BlockUtil.persistShapePosition(current);
  };

  override defaultProps() {
    return {
      opacity: "1" as const,
      w: defaultBlockWidth,
      h: defaultBlockHeight,
      /**
       * we want blockLoaderProps to have required properties in the BlockShape definition, for type safety elsewhere.
       * we pass them when creating a BlockShape, so this default is never actually used
       */
      blockLoaderProps: {} as JsonSerializableBlockLoaderProps,
      /**
       * This is intentionally a dummy string that should never be used,
       * because we supply it in when creating a BlockShape
       */
      pageEntityId: "placeholder-123" as EntityId,
      indexPosition: 0,
    };
  }

  // We have to implement this method but the DOM element returned doesn't seem necessary in our usage
  override indicator() {
    return null;
  }

  override render(shape: BlockShape) {
    const bounds = this.bounds(shape);

    const {
      opacity: _opacity,
      w: _width,
      h: _height,
      blockLoaderProps,
    } = shape.props;

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          pointerEvents: "all",
          width: toDomPrecision(bounds.width),
          height: toDomPrecision(bounds.height),
        }}
      >
        <BlockContextProvider key={blockLoaderProps.wrappingEntityId}>
          <BlockLoader
            {...blockLoaderProps}
            editableRef={null}
            onBlockLoaded={() => null}
            readonly
          />
        </BlockContextProvider>
      </HTMLContainer>
    );
  }
}

// Defines our custom shape, using its type definition and class
export const BlockShapeDef = defineShape<BlockShape, BlockUtil>({
  type: "bpBlock",
  getShapeUtil: () => BlockUtil,
});

// Defines a custom tool used to draw our shape
export class BlockTool extends TLBoxTool {
  static id = "bpBlock";
  static initial = "idle";

  shapeType = "bpBlock";
}
