import "@tldraw/tldraw/editor.css";
import "@tldraw/tldraw/ui.css";

import { CanvasPosition } from "@local/hash-graphql-shared/graphql/types";
import { fetchBlock } from "@local/hash-isomorphic-utils/blocks";
import { TldrawEditorConfig } from "@tldraw/editor";
import {
  App,
  createShapeId,
  MenuGroup,
  menuItem,
  Tldraw,
  toolbarItem,
} from "@tldraw/tldraw";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { BlocksMap } from "../../../blocks/page/create-editor-view";
import { BlockCreationDialog } from "./canvas-page/block-creation-dialog";
import { BlockShapeDef, BlockTool } from "./canvas-page/block-shape";
import { FixedCanvas } from "./canvas-page/locked-canvas";
import {
  CanvasProps,
  defaultBlockHeight,
  defaultBlockWidth,
} from "./canvas-page/shared";

const config = new TldrawEditorConfig({
  shapes: [BlockShapeDef],
  allowUnknownShapes: true,
  tools: [BlockTool],
});

export const CanvasPageBlock = ({
  blocks: initialBlocks,
  contents,
}: CanvasProps) => {
  const { query } = useRouter();
  const [blocks, setBlocks] = useState<BlocksMap | null>(null);

  useEffect(() => {
    const blocksMap = initialBlocks;
    void Promise.all(
      contents.map(async ({ rightEntity }) => {
        const { componentId } = rightEntity;
        if (!blocksMap[componentId]) {
          const blockMetadata = await fetchBlock(componentId);
          console.log("Fetched", { blockMetadata });
          if (!blockMetadata) {
            throw new Error(
              `Could not fetch metadata for block at ${componentId}`,
            );
          }
          blocksMap[componentId] = blockMetadata;
        }
      }),
    ).then(() => {
      setBlocks(blocksMap);
    });
  }, [contents, initialBlocks]);

  if (!blocks) {
    return null;
  }

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
          y: y ?? index * defaultBlockHeight + 50,
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
            h: height ?? defaultBlockHeight,
            w: width ?? defaultBlockWidth,
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
