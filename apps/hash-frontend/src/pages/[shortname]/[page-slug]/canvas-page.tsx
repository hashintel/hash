import "@tldraw/tldraw/editor.css";
import "@tldraw/tldraw/ui.css";

import { useMutation } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { CanvasPosition } from "@local/hash-graphql-shared/graphql/types";
import { updatePageContents } from "@local/hash-graphql-shared/queries/page.queries";
import { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import { BaseUrl, EntityId, OwnedById } from "@local/hash-subgraph";
import { TldrawEditorConfig, useApp } from "@tldraw/editor";
import { Matrix2d, toDomPrecision } from "@tldraw/primitives";
import {
  App,
  createShapeId,
  createShapeValidator,
  defineShape,
  DialogProps,
  HTMLContainer,
  MenuGroup,
  menuItem,
  setPropsForNextShape,
  TLBaseShape,
  TLBoxTool,
  TLBoxUtil,
  Tldraw,
  TLOpacityType,
  toolbarItem,
} from "@tldraw/tldraw";
import { T } from "@tldraw/tlvalidate";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import { BlockContextProvider } from "../../../blocks/page/block-context";
import { BlocksMap } from "../../../blocks/page/create-editor-view";
import { BlockSuggester } from "../../../blocks/page/create-suggester/block-suggester";
import { usePageContext } from "../../../blocks/page/page-context";
import {
  BlockLoader,
  BlockLoaderProps,
} from "../../../components/block-loader/block-loader";
import {
  PageContentItem,
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
} from "../../../graphql/api-types.gen";
import { apolloClient } from "../../../lib/apollo-client";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { useRouteNamespace } from "../shared/use-route-namespace";

type CanvasPageBlockProps = {
  contents: PageContentItem[];
  blocks: BlocksMap;
};

type JsonSerializableBlockLoaderProps = Omit<
  BlockLoaderProps,
  "onBlockLoaded" | "editableRef"
>;

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

const defaultWidth = 600;
const defaultHeight = 200;

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
  });
};

const BlockCreationDialog = ({ onClose }: DialogProps) => {
  const [creatingEntity, setCreatingEntity] = useState(false);

  const app = useApp();

  const { routeNamespace } = useRouteNamespace();

  const { accountId } = routeNamespace ?? {};

  const { pageEntityId } = usePageContext();

  const [updatePageContentsFn] = useMutation<
    UpdatePageContentsMutation,
    UpdatePageContentsMutationVariables
  >(updatePageContents);

  const createBlock = useCallback(
    async (blockMeta: HashBlockMeta) => {
      const position = app.getShapesInPage(app.pages[0]!.id).length;

      const blockEntityTypeId = blockMeta.schema as VersionedUrl;

      const width = defaultWidth;
      const height = defaultHeight;

      const x = app.viewportPageCenter.x - width / 2;
      const y = app.viewportPageCenter.y - height / 2;

      const { data } = await updatePageContentsFn({
        variables: {
          entityId: pageEntityId,
          actions: [
            {
              insertBlock: {
                componentId: blockMeta.componentId,
                entity: {
                  // @todo this should be 'blockEntityTypeId' above but external types not fully supported
                  entityTypeId:
                    "http://localhost:3000/@system-user/types/entity-type/text/v/1",
                  entityProperties: {},
                },
                ownedById: accountId as OwnedById,
                position,
                canvasPosition: {
                  "https://blockprotocol.org/@hash/types/property-type/width-in-pixels/":
                    width,
                  "https://blockprotocol.org/@hash/types/property-type/height-in-pixels/":
                    height,
                  "https://blockprotocol.org/@hash/types/property-type/x-position/":
                    x,
                  "https://blockprotocol.org/@hash/types/property-type/y-position/":
                    y,
                  "https://blockprotocol.org/@hash/types/property-type/rotation-in-rads/": 0,
                },
              },
            },
          ],
        },
      });

      if (!data) {
        throw new Error("No data returned from updatePageContents");
      }

      const { page } = data.updatePageContents;

      const newBlock = page.contents.find(
        (contentItem) =>
          contentItem.linkEntity.linkData?.leftToRightOrder === position,
      )!.rightEntity;

      const wrappingEntityId = newBlock.metadata.recordId.entityId;
      const blockEntityId =
        newBlock.blockChildEntity.metadata.recordId.entityId;

      const blockId = createShapeId();

      const blockShape = {
        id: blockId,
        type: "bpBlock",
        x,
        y,
        props: {
          w: width,
          h: height,
          firstCreation: true,
          opacity: "1" as const,
          indexPosition: position,
          pageEntityId,
          blockLoaderProps: {
            blockEntityId,
            blockEntityTypeId,
            blockMetadata: blockMeta,
            readonly: false,
            wrappingEntityId,
          } satisfies JsonSerializableBlockLoaderProps,
        },
      };

      app.createShapes([blockShape]);
      onClose();
    },
    [accountId, app, onClose, pageEntityId, updatePageContentsFn],
  );

  return creatingEntity ? (
    <div style={{ padding: 60 }}>Creating block...</div>
  ) : (
    <BlockSuggester
      onChange={async (_variant, blockMeta) => {
        setCreatingEntity(true);
        try {
          await createBlock(blockMeta);
        } catch (err) {
          setCreatingEntity(false);
        }
      }}
    />
  );
};

class BlockUtil extends TLBoxUtil<BlockShape> {
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
      w: defaultWidth,
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
          <BlockLoader {...blockLoaderProps} onBlockLoaded={onBlockLoaded} />
        </BlockContextProvider>
      </HTMLContainer>
    );
  }
}

const BlockShapeDef = defineShape<BlockShape, BlockUtil>({
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

class BlockTool extends TLBoxTool {
  static id = "bpBlock";
  static initial = "idle";

  shapeType = "bpBlock";
}

const config = new TldrawEditorConfig({
  shapes: [BlockShapeDef],
  allowUnknownShapes: true,
  tools: [BlockTool],
});

const FixedCanvas = ({ blocks, contents }: CanvasPageBlockProps) => {
  return (
    <div style={{ height: "100%", position: "relative" }}>
      <div
        style={{
          position: "relative",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgb(249, 250, 251)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          {contents.map(({ linkEntity, rightEntity: blockEntity }, index) => {
            const {
              "https://blockprotocol.org/@hash/types/property-type/x-position/":
                x,
              "https://blockprotocol.org/@hash/types/property-type/y-position/":
                y,
              "https://blockprotocol.org/@hash/types/property-type/width-in-pixels/":
                width,
              "https://blockprotocol.org/@hash/types/property-type/height-in-pixels/":
                height,
              "https://blockprotocol.org/@hash/types/property-type/rotation-in-rads/":
                rotation,
            } = linkEntity.properties;

            const matrix = Matrix2d.Compose(
              Matrix2d.Translate(x, y),
              Matrix2d.Rotate(rotation),
            );

            const blockLoaderProps = {
              blockEntityId:
                blockEntity.blockChildEntity.metadata.recordId.entityId,
              blockEntityTypeId:
                blockEntity.blockChildEntity.metadata.entityTypeId,
              wrappingEntityId: blockEntity.metadata.recordId.entityId,
              blockMetadata: blocks[blockEntity.componentId]!.meta,
              readonly: false,
            };

            return (
              <div
                key={linkEntity.metadata.recordId.entityId}
                style={{
                  width,
                  height,
                  transform: `matrix(${toDomPrecision(
                    matrix.a,
                  )}, ${toDomPrecision(matrix.b)}, ${toDomPrecision(
                    matrix.c,
                  )}, ${toDomPrecision(matrix.d)}, ${toDomPrecision(
                    matrix.e,
                  )}, ${toDomPrecision(matrix.f)})`,
                  transformOrigin: "top left",
                  position: "absolute",
                }}
              >
                <BlockContextProvider key={blockLoaderProps.wrappingEntityId}>
                  <BlockLoader
                    {...blockLoaderProps}
                    onBlockLoaded={() => null}
                  />
                </BlockContextProvider>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const CanvasPageBlock = ({ blocks, contents }: CanvasPageBlockProps) => {
  const { query } = useRouter();

  console.log({ contents });

  if (query.locked) {
    return <FixedCanvas blocks={blocks} contents={contents} />;
  }

  const handleMount = (app: App) => {
    for (const page of app.pages) {
      const shapes = app.getShapesInPage(page.id);
      app.deleteShapes(shapes.map((shape) => shape.id));
    }

    app.createShapes(
      contents.map(({ linkEntity, rightEntity: blockEntity }, index) => {
        const {
          "https://blockprotocol.org/@hash/types/property-type/x-position/": x,
          "https://blockprotocol.org/@hash/types/property-type/y-position/": y,
          "https://blockprotocol.org/@hash/types/property-type/width-in-pixels/":
            width,
          "https://blockprotocol.org/@hash/types/property-type/height-in-pixels/":
            height,
          "https://blockprotocol.org/@hash/types/property-type/rotation-in-rads/":
            rotation,
        } = linkEntity.properties as Partial<CanvasPosition>;

        return {
          id: createShapeId(),
          type: "bpBlock",
          x: x ?? 50,
          y: y ?? index * defaultHeight + 50,
          rotation: rotation ?? 0,
          props: {
            blockLoaderProps: {
              blockEntityId:
                blockEntity.blockChildEntity.metadata.recordId.entityId,
              blockEntityTypeId:
                blockEntity.blockChildEntity.metadata.entityTypeId,
              wrappingEntityId: blockEntity.metadata.recordId.entityId,
              blockMetadata: blocks[blockEntity.componentId]!.meta,
              readonly: false,
            },
            firstCreation: false,
            indexPosition: linkEntity.linkData?.leftToRightOrder ?? index,
            pageEntityId: linkEntity.linkData?.leftEntityId,
            h: height ?? 250,
            w: width ?? 600,
          },
        };
      }),
    );
  };

  return (
    <div style={{ height: "100%" }}>
      <Tldraw
        config={config}
        onMount={handleMount}
        overrides={{
          tools(_app, tools, { addDialog }) {
            // eslint-disable-next-line no-param-reassign
            tools.bpBlock = {
              id: "bpBlock",
              icon: "twitter",
              label: "Block" as any,
              kbd: "b",
              readonlyOk: false,
              onSelect: () => {
                addDialog({ component: BlockCreationDialog });
              },
            };

            return tools;
          },
          toolbar(_app, toolbar, { tools }) {
            toolbar.splice(1, 0, toolbarItem(tools.bpBlock!));
            return toolbar;
          },
          keyboardShortcutsMenu(_app, keyboardShortcutsMenu, { tools }) {
            const toolsGroup = keyboardShortcutsMenu.find(
              (group) => group.id === "shortcuts-dialog.tools",
            ) as MenuGroup;
            toolsGroup.children.push(menuItem(tools.bpBlock!));
            return keyboardShortcutsMenu;
          },
        }}
      />
    </div>
  );
};
