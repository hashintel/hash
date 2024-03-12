import { useMutation } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system/dist/cjs-slim/index-slim";
import { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import { updateBlockCollectionContents } from "@local/hash-isomorphic-utils/graphql/queries/block-collection.queries";
import { extractEntityUuidFromEntityId, OwnedById } from "@local/hash-subgraph";
import { useApp } from "@tldraw/editor";
import { DialogProps } from "@tldraw/tldraw";
import { useCallback, useState } from "react";

import {
  UpdateBlockCollectionContentsMutation,
  UpdateBlockCollectionContentsMutationVariables,
} from "../../../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { BlockSuggester } from "../../../shared/block-collection/create-suggester/block-suggester";
import { usePageContext } from "../../../shared/block-collection/page-context";
import { getBlockCollectionContentsStructuralQueryVariables } from "../../../shared/block-collection-contents";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { BlockShape } from "./block-shape";
import { defaultBlockHeight, defaultBlockWidth } from "./shared";

// An interface for selecting a Block Protocol block and creating the entity it needs
export const BlockCreationDialog = ({ onClose }: DialogProps) => {
  const [creatingEntity, setCreatingEntity] = useState(false);

  const app = useApp();

  const { routeNamespace } = useRouteNamespace();

  const { accountId } = routeNamespace ?? {};

  const { pageEntityId } = usePageContext();

  const [updateBlockCollectionContentsFn] = useMutation<
    UpdateBlockCollectionContentsMutation,
    UpdateBlockCollectionContentsMutationVariables
  >(updateBlockCollectionContents);

  const createBlock = useCallback(
    async (blockMeta: HashBlockMeta) => {
      const blockEntityTypeId = blockMeta.schema as VersionedUrl;

      const width = defaultBlockWidth;
      const height = defaultBlockHeight;

      const x = app.viewportPageCenter.x - width / 2;
      const y = app.viewportPageCenter.y - height / 2;

      if (!accountId) {
        throw new Error(
          "No accountId available – possibly routeNamespace is not yet loaded",
        );
      }

      const { data } = await updateBlockCollectionContentsFn({
        variables: {
          entityId: pageEntityId,
          actions: [
            {
              insertBlock: {
                componentId: blockMeta.componentId,
                entity: {
                  entityTypeId: blockEntityTypeId,
                  entityProperties: {},
                },
                ownedById: accountId as OwnedById,
                position: {
                  // These defaults will be overridden when the user draws the shape on the canvas
                  canvasPosition: {
                    "https://hash.ai/@hash/types/property-type/width-in-pixels/":
                      width,
                    "https://hash.ai/@hash/types/property-type/height-in-pixels/":
                      height,
                    "https://hash.ai/@hash/types/property-type/x-position/": x,
                    "https://hash.ai/@hash/types/property-type/y-position/": y,
                    "https://hash.ai/@hash/types/property-type/rotation-in-rads/": 0,
                  },
                },
              },
            },
          ],
        },
        // temporary hack to keep page data consistent, in the absence of proper data subscriptions
        refetchQueries: [
          {
            query: structuralQueryEntitiesQuery,
            variables: getBlockCollectionContentsStructuralQueryVariables(
              extractEntityUuidFromEntityId(pageEntityId),
            ),
          },
        ],
      });

      if (!data) {
        throw new Error("No data returned from updateBlockCollectionContents");
      }

      const { blockCollection } = data.updateBlockCollectionContents;

      const newBlock = blockCollection.contents.sort((a, b) =>
        a.linkEntity.metadata.temporalVersioning.transactionTime.start.limit.localeCompare(
          b.linkEntity.metadata.temporalVersioning.transactionTime.start.limit,
        ),
      )[0]!;

      const wrappingEntityId = newBlock.rightEntity.metadata.recordId.entityId;
      const blockEntityId = newBlock.rightEntity.metadata.recordId.entityId;

      const blockShapeProps: BlockShape["props"] = {
        w: width,
        h: height,
        opacity: "1",
        pageEntityId,
        linkEntityId: newBlock.linkEntity.metadata.recordId.entityId,
        blockLoaderProps: {
          blockEntityId,
          blockEntityTypeId,
          blockMetadata: blockMeta,
          readonly: false,
          wrappingEntityId,
        },
      };

      onClose();

      /**
       * Set the bpBlock tool and pass the necessary entity and block meta props
       * The user will then draw a rectangle, with any updates to position from the defaults in the class
       * @see e.g. {@link BlockUtil#onTranslateEnd}
       */
      app.batch(() => {
        app.setSelectedTool("bpBlock");
        app.updateInstanceState(
          {
            propsForNextShape: {
              ...app.instanceState.propsForNextShape,
              ...blockShapeProps,
            },
          },
          true,
        );
      });
    },
    [accountId, app, onClose, pageEntityId, updateBlockCollectionContentsFn],
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
