import "@tldraw/tldraw/editor.css";
import "@tldraw/tldraw/ui.css";

import {
  EntityRootType,
  Subgraph,
} from "@blockprotocol/graph/dist/cjs/temporal/main";
import { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import { AccountId, EntityId } from "@local/hash-subgraph";
import { TldrawEditorConfig, useApp } from "@tldraw/editor";
import { TLShapeUtilFlag } from "@tldraw/editor/src/lib/app/shapeutils/TLShapeUtil";
import { getEmbedInfo } from "@tldraw/editor/src/lib/utils";
import { toDomPrecision } from "@tldraw/primitives";
import {
  App,
  createShapeId,
  defineShape,
  HTMLContainer,
  MenuGroup,
  menuItem,
  TLBaseShape,
  TLBoxTool,
  TLBoxUtil,
  Tldraw,
  TLOpacityType,
  toolbarItem,
  useDefaultHelpers,
} from "@tldraw/tldraw";
import { TLEmbedShape } from "@tldraw/tlschema";
import { defineMigrations } from "@tldraw/tlstore";
import { useDialogs } from "@tldraw/ui";
import { createRef, useMemo, useRef, useState } from "react";
import * as React from "react";
import { createPortal } from "react-dom";

import {
  BlockContext,
  BlockContextProvider,
  BlockContextType,
} from "../../../blocks/page/block-context";
import { BlocksMap } from "../../../blocks/page/create-editor-view";
import { BlockSuggester } from "../../../blocks/page/create-suggester/block-suggester";
import {
  BlockLoader,
  BlockLoaderProps,
} from "../../../components/block-loader/block-loader";
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
    w: number;
    h: number;
    opacity: TLOpacityType;
  } & Partial<BlockLoaderProps>
>;

const WrappedBlockSuggester = () => {
  const app = useApp();

  return <BlockSuggester onChange={(blockMeta) => console.log(blockMeta)} />;
};

class BlockUtil extends TLBoxUtil<BlockShape> {
  static type = "bpBlock";

  override canUnmount = () => false;
  override canResize = (shape: TLEmbedShape) => true;

  override hideSelectionBoundsBg = (shape) => !this.canResize(shape);
  override hideSelectionBoundsFg = (shape) => !this.canResize(shape);

  override canEdit = () => true;

  defaultProps() {
    return {
      opacity: "1" as const,
      w: 600,
      h: 150,
      blockComponentId: undefined,
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
    console.log("THIS", this);

    const bounds = this.bounds(shape);

    const { opacity: _opacity, w, h, ...blockLoaderProps } = shape.props;

    console.log(this.getEditingBounds(shape));

    console.log({ shape });

    return (
      <HTMLContainer id={shape.id} style={{ pointerEvents: "all" }}>
        {blockLoaderProps.blockMetadata ? (
          <BlockContextProvider key={blockLoaderProps.wrappingEntityId}>
            <BlockLoader
              {...blockLoaderProps}
              onBlockLoaded={() =>
                console.log(`Loaded block ${blockLoaderProps.wrappingEntityId}`)
              }
            />
          </BlockContextProvider>
        ) : (
          <BlockSuggester
            onChange={(_variant, blockMeta) => {
              this.app.updateShapes([
                {
                  ...shape,
                  props: {
                    ...shape.props,
                    blockMetadata: blockMeta,
                  },
                },
              ]);
            }}
          />
        )}
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
  const [showBlockSelector, setShowBlockSelector] = useState(false);
  const handleMount = (app: App) => {
    for (const page of app.pages) {
      const shapes = app.getShapesInPage(page.id);
      app.deleteShapes(shapes.map((shape) => shape.id));
    }

    console.log({ contents });

    app.createShapes(
      contents.map((blockEntity, index) => ({
        id: createShapeId(),
        type: "bpBlock",
        x: 50,
        y: index * 200 + 50,
        props: {
          blockEntityId:
            blockEntity.blockChildEntity.metadata.recordId.entityId,
          blockEntityTypeId: blockEntity.blockChildEntity.metadata.entityTypeId,
          wrappingEntityId: blockEntity.metadata.recordId.entityId,
          blockMetadata: blocks[blockEntity.componentId]!.meta,
          readonly: false,
        },
      })),
    );
    //
    // app.enableReadOnlyMode();
  };

  return (
    <div style={{ height: "100%" }}>
      {/* {showBlockSelector && ( */}
      {/*  <BlockSuggester */}
      {/*    onChange={(block) => { */}
      {/*      console.log(block); */}
      {/*    }} */}
      {/*  /> */}
      {/* )} */}
      <Tldraw
        config={config}
        onMount={handleMount}
        overrides={{
          tools(app, tools, { addDialog }) {
            // In order for our custom tool to show up in the UI...
            // We need to add it to the tools list. This "toolItem"
            // has information about its icon, label, keyboard shortcut,
            // and what to do when it's selected.
            // eslint-disable-next-line no-param-reassign
            tools.bpBlock = {
              id: "bpBlock",
              icon: "twitter",
              label: "Block" as any,
              kbd: "b",
              readonlyOk: false,
              onSelect: () => {
                addDialog({ component: WrappedBlockSuggester });
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
