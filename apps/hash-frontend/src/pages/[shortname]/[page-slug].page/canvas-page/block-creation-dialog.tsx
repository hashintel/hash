import { useMutation } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system/dist/cjs-slim/index-slim";
import {
  getPageQuery,
  updatePageContents,
} from "@local/hash-graphql-shared/queries/page.queries";
import { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import { OwnedById } from "@local/hash-subgraph";
import { useApp } from "@tldraw/editor";
import { createShapeId, DialogProps } from "@tldraw/tldraw";
import { useCallback, useState } from "react";

import { BlockSuggester } from "../../../../blocks/page/create-suggester/block-suggester";
import { usePageContext } from "../../../../blocks/page/page-context";
import {
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
} from "../../../../graphql/api-types.gen";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import {
  defaultBlockHeight,
  defaultBlockWidth,
  JsonSerializableBlockLoaderProps,
} from "./shared";

export const BlockCreationDialog = ({ onClose }: DialogProps) => {
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

      const width = defaultBlockWidth;
      const height = defaultBlockHeight;

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
        refetchQueries: [
          { query: getPageQuery, variables: { entityId: pageEntityId } },
        ],
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
