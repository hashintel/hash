import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity ,
  LinkEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { sortBlockCollectionLinks } from "@local/hash-isomorphic-utils/block-collection";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { HasSpatiallyPositionedContent } from "@local/hash-isomorphic-utils/system-types/canvas";
import type { HasIndexedContent } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import type { PositionInput } from "../../../graphql/api-types.gen";
import type { ImpureGraphFunction } from "../../context-types";
import {
  getEntityOutgoingLinks,
  getLatestEntityById,
} from "../primitive/entity";
import {
  createLinkEntity,
  getLinkEntityRightEntity,
  updateLinkEntity,
} from "../primitive/link-entity";

import type { Block , getBlockFromEntity } from "./block";

/**
 * Get the blocks in this blockCollection.
 *
 * @param params.blockCollection - The blockCollection.
 */
export const getBlockCollectionBlocks: ImpureGraphFunction<
  {
    blockCollectionEntityId: EntityId;
    blockCollectionEntityTypeId: VersionedUrl;
  },
  Promise<
    {
      linkEntity: LinkEntity<HasSpatiallyPositionedContent | HasIndexedContent>;
      rightEntity: Block;
    }[]
  >
> = async (
  ctx,
  authentication,
  { blockCollectionEntityId, blockCollectionEntityTypeId },
) => {
  const isCanvas =
    blockCollectionEntityTypeId === systemEntityTypes.canvas.entityTypeId;

  const outgoingBlockDataLinks = (await getEntityOutgoingLinks(
    ctx,
    authentication,
    {
      entityId: blockCollectionEntityId,
      linkEntityTypeVersionedUrl: isCanvas
        ? systemLinkEntityTypes.hasSpatiallyPositionedContent.linkEntityTypeId
        : systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId,
    },
  )) as
    | LinkEntity<HasSpatiallyPositionedContent>[]
    | LinkEntity<HasIndexedContent>[];

  return Promise.all(
    outgoingBlockDataLinks
      .sort(sortBlockCollectionLinks)
      .map(async (linkEntity) => ({
        linkEntity,
        rightEntity: await getLinkEntityRightEntity(ctx, authentication, {
          linkEntity,
        }).then((entity) => getBlockFromEntity({ entity })),
      })),
  );
};

/**
 * Insert a block into this blockCollection.
 *
 * @param params.block - The block to insert in the blockCollection.
 * @param params.position - (optional) - the position of the block in the blockCollection.
 * @param params.insertedById - The id of the account that is inserting the block into the blockCollection.
 */
export const addBlockToBlockCollection: ImpureGraphFunction<
  {
    blockCollectionEntityId: EntityId;
    block: Block;
    position: PositionInput;
  },
  Promise<Entity<HasSpatiallyPositionedContent | HasIndexedContent>>
> = async (ctx, authentication, params) => {
  const {
    blockCollectionEntityId,
    block,
    position: { canvasPosition, indexPosition },
  } = params;

  const linkEntity: LinkEntity = await createLinkEntity<
    HasSpatiallyPositionedContent | HasIndexedContent
  >(ctx, authentication, {
    // assume that link to block is owned by the same account as the blockCollection
    ownedById: extractOwnedByIdFromEntityId(blockCollectionEntityId),
    properties: mergePropertyObjectAndMetadata<
      HasSpatiallyPositionedContent | HasIndexedContent
    >(canvasPosition || indexPosition, undefined),
    linkData: {
      leftEntityId: blockCollectionEntityId,
      rightEntityId: block.entity.metadata.recordId.entityId,
    },
    entityTypeId: canvasPosition
      ? systemLinkEntityTypes.hasSpatiallyPositionedContent.linkEntityTypeId
      : systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId,
    relationships: createDefaultAuthorizationRelationships(authentication),
  });

  return linkEntity as
    | Entity<HasSpatiallyPositionedContent>
    | Entity<HasIndexedContent>;
};

/**
 * Move a block in the blockCollection from one position to another.
 *
 * @param params.blockCollection - The blockCollection.
 * @param params.currentPosition - The current position of the block being moved.
 * @param params.newPosition - The new position of the block being moved.
 * @param params.movedById - The id of the account that is moving the block.
 */
export const moveBlockInBlockCollection: ImpureGraphFunction<
  {
    linkEntityId: EntityId;
    position: PositionInput;
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const {
    position: { indexPosition, canvasPosition },
    linkEntityId,
  } = params;

  const linkEntity = await getLatestEntityById(ctx, authentication, {
    entityId: linkEntityId,
  });

  await updateLinkEntity(ctx, authentication, {
    propertyPatches: [
      {
        op: "replace",
        path: [],
        property: mergePropertyObjectAndMetadata(
          indexPosition || canvasPosition,
        ),
      },
    ],
    linkEntity: new LinkEntity(linkEntity),
  });
};

/**
 * Remove a block from the blockCollection.
 *
 * @param params.linkEntityId - The EntityId of the link between the block collection and the block.
 */
export const removeBlockFromBlockCollection: ImpureGraphFunction<
  {
    linkEntityId: EntityId;
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const { linkEntityId } = params;

  const linkEntity = await getLatestEntityById(ctx, authentication, {
    entityId: linkEntityId,
  });

  await linkEntity.archive(ctx.graphApi, authentication);
};
