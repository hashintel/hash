import { VersionedUrl } from "@blockprotocol/type-system";
import { sortBlockCollectionLinks } from "@local/hash-isomorphic-utils/block-collection";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  HasSpatiallyPositionedContent,
  HasSpatiallyPositionedContentProperties,
} from "@local/hash-isomorphic-utils/system-types/canvas";
import {
  HasDataProperties,
  HasIndexedContentProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { EntityId, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";

import { PositionInput } from "../../../graphql/api-types.gen";
import { ImpureGraphFunction } from "../../context-types";
import {
  archiveEntity,
  getEntityOutgoingLinks,
  getLatestEntityById,
} from "../primitive/entity";
import {
  createLinkEntity,
  getLinkEntityRightEntity,
  updateLinkEntity,
} from "../primitive/link-entity";
import { Block, getBlockFromEntity } from "./block";

/**
 * Get the blocks in this blockCollection.
 *
 * @param params.blockCollection - the blockCollection
 */
export const getBlockCollectionBlocks: ImpureGraphFunction<
  {
    blockCollectionEntityId: EntityId;
    blockCollectionEntityTypeId: VersionedUrl;
  },
  Promise<{ linkEntity: LinkEntity<HasDataProperties>; rightEntity: Block }[]>
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
    | LinkEntity<HasSpatiallyPositionedContentProperties>[]
    | LinkEntity<HasIndexedContentProperties>[];

  return await Promise.all(
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
 * Insert a block into this blockCollection
 *
 * @param params.block - the block to insert in the blockCollection
 * @param params.position (optional) - the position of the block in the blockCollection
 * @param params.insertedById - the id of the account that is inserting the block into the blockCollection
 */
export const addBlockToBlockCollection: ImpureGraphFunction<
  {
    blockCollectionEntityId: EntityId;
    block: Block;
    position: PositionInput;
  },
  Promise<HasSpatiallyPositionedContent | HasIndexedContentProperties>
> = async (ctx, authentication, params) => {
  const {
    blockCollectionEntityId,
    block,
    position: { canvasPosition, indexPosition },
  } = params;

  if (!canvasPosition && !indexPosition) {
    throw new Error(`One of indexPosition or canvasPosition must be defined`);
  }

  const linkEntity: LinkEntity = await createLinkEntity(ctx, authentication, {
    leftEntityId: blockCollectionEntityId,
    rightEntityId: block.entity.metadata.recordId.entityId,
    linkEntityTypeId: canvasPosition
      ? systemLinkEntityTypes.hasSpatiallyPositionedContent.linkEntityTypeId
      : systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId,
    // assume that link to block is owned by the same account as the blockCollection
    ownedById: extractOwnedByIdFromEntityId(blockCollectionEntityId),
    properties: canvasPosition || indexPosition,
    relationships: [],
    inheritedPermissions: [
      "administratorFromWeb",
      "updateFromWeb",
      "viewFromWeb",
    ],
  });

  return linkEntity as unknown as
    | HasSpatiallyPositionedContent
    | HasIndexedContentProperties;
};

/**
 * Move a block in the blockCollection from one position to another.
 *
 * @param params.blockCollection - the blockCollection
 * @param params.currentPosition - the current position of the block being moved
 * @param params.newPosition - the new position of the block being moved
 * @param params.movedById - the id of the account that is moving the block
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

  if (!canvasPosition && !indexPosition) {
    throw new Error(`One of fractionalIndex or canvasPosition must be defined`);
  }

  const linkEntity = await getLatestEntityById(ctx, authentication, {
    entityId: linkEntityId,
  });

  if (!linkEntity.linkData) {
    throw new Error(`Entity with id ${linkEntityId} is not a link entity`);
  }

  await updateLinkEntity(ctx, authentication, {
    properties: canvasPosition || indexPosition,
    linkEntity: linkEntity as LinkEntity,
  });
};

/**
 * Remove a block from the blockCollection.
 *
 * @param params.linkEntityId - the EntityId of the link between the block collection and the block
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

  await archiveEntity(ctx, authentication, { entity: linkEntity });
};
