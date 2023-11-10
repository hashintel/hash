import "@tldraw/tldraw/editor.css";
import "@tldraw/tldraw/ui.css";

import { CanvasPosition } from "@local/hash-graphql-shared/graphql/types";
import {
  ComponentIdHashBlockMap,
  fetchBlock,
} from "@local/hash-isomorphic-utils/blocks";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box } from "@mui/material";
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

import { useUserBlocks } from "../../../blocks/user-blocks";
import { BlockCollectionContentItem } from "../../../graphql/api-types.gen";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";
import { TOP_CONTEXT_BAR_HEIGHT } from "../../shared/top-context-bar";
import { BlockCreationDialog } from "./canvas-page/block-creation-dialog";
import { BlockShapeDef, BlockTool } from "./canvas-page/block-shape";
import { LockedCanvas } from "./canvas-page/locked-canvas";
import { defaultBlockHeight, defaultBlockWidth } from "./canvas-page/shared";

const config = new TldrawEditorConfig({
  shapes: [BlockShapeDef],
  allowUnknownShapes: true,
  tools: [BlockTool],
});

export const CanvasPageBlock = ({
  contents,
}: {
  contents: BlockCollectionContentItem[];
}) => {
  const { query } = useRouter();

  const { value: initialBlocks } = useUserBlocks();

  const [blocks, setBlocks] = useState<ComponentIdHashBlockMap | null>(null);

  /**
   * This fetches the metadata for blocks that weren't included in the server-side fetch in [page-slug].page.tsx
   * @todo handle fetching of blocks in the document in getServerSideProps in [page-slug].page.tsx
   */
  useEffect(() => {
    const blocksMap = initialBlocks;
    void Promise.all(
      contents.map(async ({ rightEntity }) => {
        const { componentId } = rightEntity;
        if (!blocksMap[componentId]) {
          blocksMap[componentId] = await fetchBlock(componentId);
        }
      }),
    ).then(() => {
      setBlocks(blocksMap);
    });
  }, [contents, initialBlocks]);

  if (!blocks) {
    // loading metadata for blocks not included in our default list
    return null;
  }

  /** @see {@link TopContextBar} for how page status is set in the query */
  if (query.locked) {
    return <LockedCanvas blocks={blocks} contents={contents} />;
  }

  const handleMount = (app: App) => {
    /**
     * TLDraw maintains a localStorage entry for the canvas state. This wipes shapes from it,
     * but probably leaves some other unhelpful stuff in (zoom / pan settings?)
     * @todo figure out how to disable localStorage persistence entirely
     */
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
            indexPosition:
              linkEntity.properties[
                extractBaseUrl(
                  systemTypes.propertyType.numericIndex.propertyTypeId,
                )
              ] ?? index,
            pageEntityId: linkEntity.linkData?.leftEntityId,
            h: height ?? defaultBlockHeight,
            w: width ?? defaultBlockWidth,
          },
        };
      }),
    );
  };

  return (
    <Box
      sx={{
        height: `calc(100vh - ${HEADER_HEIGHT}px - ${TOP_CONTEXT_BAR_HEIGHT}px)`,
        width: "100%",
      }}
    >
      <Tldraw
        config={config}
        onMount={handleMount}
        overrides={{
          tools(_app, tools, { addDialog }) {
            // eslint-disable-next-line no-param-reassign
            tools.bpBlock = {
              id: "bpBlock",
              // at the moment custom icons appear to only be possible via overwriting an existing one (in public/icons)
              // @see https://docs.tldraw.dev/docs/ucg/usage#assets
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
            return toolbar.filter((item) =>
              ["select", "bpBlock", "hand", "eraser"].includes(item.id),
            );
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
    </Box>
  );
};
