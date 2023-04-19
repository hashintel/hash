import "@tldraw/tldraw/editor.css";
import "@tldraw/tldraw/ui.css";

import {
  EntityRootType,
  Subgraph,
} from "@blockprotocol/graph/dist/cjs/temporal/main";
import { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import { AccountId, EntityId } from "@local/hash-subgraph";
import { TldrawEditorConfig } from "@tldraw/editor";
import { getEmbedInfo } from "@tldraw/editor/src/lib/utils";
import { toDomPrecision } from "@tldraw/primitives";
import {
  App,
  createShapeId,
  defineShape,
  MenuGroup,
  menuItem,
  TLBaseShape,
  TLBoxTool,
  TLBoxUtil,
  Tldraw,
  TLOpacityType,
  toolbarItem,
} from "@tldraw/tldraw";
import { TLEmbedShape } from "@tldraw/tlschema";
import { defineMigrations } from "@tldraw/tlstore";
import { useMemo, useState } from "react";
import * as React from "react";

import {
  BlockContext,
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

class BlockComponent extends TLBoxUtil<BlockShape> {
  static type = "bpBlock";

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
      />
    );
  }

  render(shape) {
    console.log("THIS", this);

    const bounds = this.bounds(shape);

    const { opacity: _opacity, w, h, ...blockLoaderProps } = shape.props;

    const [error, setError] = useState(false);
    const [blockSubgraph, setBlockSubgraph] = useState<
      Subgraph<EntityRootType> | undefined
    >();

    const blockContext = useMemo<BlockContextType>(
      () => ({
        id: blockLoaderProps.blockEntityId,
        error,
        setError,
        blockSubgraph,
        setBlockSubgraph,
      }),
      [
        blockLoaderProps.blockEntityId,
        error,
        setError,
        blockSubgraph,
        setBlockSubgraph,
      ],
    );

    console.log({ shape });

    // this.app.updateShapes([
    //   {
    //     id: shape.id,
    //     ...shape,
    //     props: {
    //       ...shape.props,
    //       newProp: 100,
    //     },
    //   },
    // ]);

    return (
      <div
        style={{
          height: h,
          width: w,
          outline: "3px solid blue",
        }}
      >
        {/* <BlockSuggester */}
        {/*  onChange={(...args) => { */}
        {/*    console.log(args); */}
        {/*  }} */}
        {/* /> */}
        <BlockContext.Provider value={blockContext}>
          <BlockLoader {...blockLoaderProps} />
        </BlockContext.Provider>
      </div>
    );
  }
}

const BpBlockShapeDef = defineShape<BlockShape, BlockComponent>({
  type: "bpBlock",
  getShapeUtil: () => BlockComponent,
});

class BlockTool extends TLBoxTool {
  static id = "bpBlock";
  static initial = "idle";

  shapeType = "bpBlock";
}

const config = new TldrawEditorConfig({
  shapes: [BpBlockShapeDef],
  allowUnknownShapes: true,
  tools: [BlockTool],
});

export const CanvasPageBlock = ({ blocks, contents }: CanvasPageBlockProps) => {
  const handleMount = (app: App) => {
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
          // editableRef: () => null,
          // onBlockLoader: () => null,
          wrappingEntityId: blockEntity.metadata.recordId.entityId,
          blockMetadata: blocks[blockEntity.componentId]!.meta,
          readonly: false,
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
          tools(app, tools) {
            // In order for our custom tool to show up in the UI...
            // We need to add it to the tools list. This "toolItem"
            // has information about its icon, label, keyboard shortcut,
            // and what to do when it's selected.
            // eslint-disable-next-line no-param-reassign
            tools.bpBlock = {
              id: "bpBlock",
              icon: "twitter",
              label: "Block" as any,
              kbd: "c",
              readonlyOk: false,
              onSelect: () => {
                app.setSelectedTool("bpBlock", {
                  props: { props: { bar: 10 } },
                });
              },
            };
            return tools;
          },
          toolbar(_app, toolbar, { tools }) {
            // The toolbar is an array of items. We can add it to the
            // end of the array or splice it in, then return the array.
            toolbar.splice(4, 0, toolbarItem(tools.bpBlock!));
            return toolbar;
          },
          keyboardShortcutsMenu(_app, keyboardShortcutsMenu, { tools }) {
            // Same for the keyboard shortcuts menu, but this menu contains
            // both items and groups. We want to find the "Tools" group and
            // add it to that before returning the array.
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
