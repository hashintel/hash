import { CanvasProperties } from "@local/hash-graphql-shared/graphql/types";
import { updateBlockCollectionContents } from "@local/hash-graphql-shared/queries/block-collection.queries";
import { getEntityQuery } from "@local/hash-graphql-shared/queries/entity.queries";
import {
  UpdateBlockCollectionContentsMutation,
  UpdateBlockCollectionContentsMutationVariables,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
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

import { BlockLoader } from "../../../../components/block-loader/block-loader";
import { apolloClient } from "../../../../lib/apollo-client";
import { BlockContextProvider } from "../../../shared/block-collection/block-context";
import { blockCollectionContentsStaticVariables } from "../../../shared/block-collection-contents";
import { BlockCollectionContext } from "../../../shared/block-collection-context";
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
    linkEntityId: EntityId;
    pageEntityId: EntityId;
    blockLoaderProps: JsonSerializableBlockLoaderProps;
  }
>;

// Persist a block's new position in the database
const persistBlockPosition = ({
  linkEntityId,
  pageEntityId,
  canvasPosition,
}: {
  linkEntityId: EntityId;
  pageEntityId: EntityId;
  canvasPosition: CanvasProperties;
}) => {
  void apolloClient.mutate<
    UpdateBlockCollectionContentsMutation,
    UpdateBlockCollectionContentsMutationVariables
  >({
    variables: {
      actions: {
        moveBlock: {
          linkEntityId,
          position: { canvasPosition },
        },
      },
      entityId: pageEntityId,
    },
    mutation: updateBlockCollectionContents,
    refetchQueries: [
      {
        query: getEntityQuery,
        variables: {
          entityId: pageEntityId,
          ...blockCollectionContentsStaticVariables,
        },
      },
    ],
  });
};

// Defines the behaviour of our custom shape in TLDraw
export class BlockUtil extends TLBoxUtil<BlockShape> {
  static type = "bpBlock";

  // gather a shape's positional information into a flat object
  // they are split up in TLDraw because x, y and rotation are properties on every shape, whereas w and h are not
  static shapeToCanvasPosition = (shape: BlockShape): CanvasProperties => {
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
      linkEntityId: shape.props.linkEntityId,
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
       * These are intentionally dummy strings that should never be used,
       * because we supply them when creating a BlockShape
       */
      pageEntityId: "placeholder-123" as EntityId,
      linkEntityId: "placeholder-123" as EntityId,
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
          <BlockCollectionContext.Consumer>
            {(collectionContext) => (
              <BlockLoader
                {...blockLoaderProps}
                blockCollectionSubgraph={
                  collectionContext!.blockCollectionSubgraph
                }
                editableRef={null}
                onBlockLoaded={() => null}
                readonly
                userPermissionsOnEntities={
                  collectionContext!.userPermissionsOnEntities
                }
              />
            )}
          </BlockCollectionContext.Consumer>
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
