import "@tldraw/tldraw/editor.css";
import "@tldraw/tldraw/ui.css";

import { useMutation } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { updatePageContents } from "@local/hash-graphql-shared/queries/page.queries";
import { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import { OwnedById } from "@local/hash-subgraph";
import { TldrawEditorConfig, useApp } from "@tldraw/editor";
import { toDomPrecision } from "@tldraw/primitives";
import {
  App,
  createShapeId,
  defineShape,
  DialogProps,
  HTMLContainer,
  MenuGroup,
  menuItem,
  TLBaseShape,
  TLBoxTool,
  TLBoxUtil,
  Tldraw,
  TLOpacityType,
  toolbarItem,
} from "@tldraw/tldraw";
import { useCallback, useState } from "react";

import { BlockContextProvider } from "../../../blocks/page/block-context";
import { BlocksMap } from "../../../blocks/page/create-editor-view";
import { BlockSuggester } from "../../../blocks/page/create-suggester/block-suggester";
import { usePageContext } from "../../../blocks/page/page-context";
import {
  BlockLoader,
  BlockLoaderProps,
} from "../../../components/block-loader/block-loader";
import { useBlockProtocolCreateEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import {
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
} from "../../../graphql/api-types.gen";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { useRouteNamespace } from "../shared/use-route-namespace";

type CanvasPageBlockProps = {
  contents: BlockEntity[];
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
    blockLoaderProps: Partial<JsonSerializableBlockLoaderProps>;
  }
>;

const defaultWidth = 600;
const defaultHeight = 200;

const BlockCreationDialog = ({ onClose }: DialogProps) => {
  const [creatingEntity, setCreatingEntity] = useState(false);

  const app = useApp();
  const { authenticatedUser } = useAuthenticatedUser();
  console.log({ authenticatedUser });
  const { routeNamespace } = useRouteNamespace();
  console.log({ routeNamespace });

  const { accountId } = routeNamespace ?? {};

  const { pageEntityId } = usePageContext();

  const [updatePageContentsFn, { loading }] = useMutation<
    UpdatePageContentsMutation,
    UpdatePageContentsMutationVariables
  >(updatePageContents);

  const createBlock = useCallback(
    async (blockMeta: HashBlockMeta) => {
      const position = 0;

      const blockEntityTypeId = blockMeta.schema as VersionedUrl;

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
              },
            },
          ],
        },
      });

      if (!data) {
        throw new Error("No data returned from updatePageContents");
      }

      const { page } = data.updatePageContents;

      const newBlock = page.contents[position];

      const wrappingEntityId = newBlock!.metadata.recordId.entityId;
      const blockEntityId =
        newBlock!.blockChildEntity.metadata.recordId.entityId;

      const blockId = createShapeId();

      const width = defaultWidth;
      const height = defaultHeight;

      const blockShape = {
        id: blockId,
        type: "bpBlock",
        x: app.viewportPageCenter.x - width / 2,
        y: app.viewportPageCenter.y - height / 2,
        props: {
          w: width,
          h: height,
          firstCreation: true,
          opacity: "1" as const,
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
    "Creating entity..."
  ) : (
    <BlockSuggester
      onChange={async (_variant, blockMeta) => {
        setCreatingEntity(true);
        try {
          await createBlock(blockMeta);
        } catch (err) {
          console.log({ err });
          setCreatingEntity(false);
        }
        // app.setSelectedTool("bpBlock", { blockMeta });
      }}
    />
  );
};

class BlockUtil extends TLBoxUtil<BlockShape> {
  static type = "bpBlock";

  override canUnmount = () => false;

  override canEdit = () => true;

  defaultProps() {
    return {
      opacity: "1" as const,
      w: defaultWidth,
      h: 150,
      firstCreation: true,
      blockLoaderProps: {},
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
      // @todo the intention of this is to set the width and height of the block based on its rendered size
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
      <HTMLContainer id={shape.id} style={{ pointerEvents: "all" }}>
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

export const CanvasPageBlock = ({ blocks, contents }: CanvasPageBlockProps) => {
  const handleMount = (app: App) => {
    for (const page of app.pages) {
      const shapes = app.getShapesInPage(page.id);
      app.deleteShapes(shapes.map((shape) => shape.id));
    }

    app.createShapes(
      contents.map((blockEntity, index) => ({
        id: createShapeId(),
        type: "bpBlock",
        x: 50,
        y: index * defaultHeight + 50,
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
        },
      })),
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
