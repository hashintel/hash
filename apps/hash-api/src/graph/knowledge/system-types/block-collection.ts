import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import {
  BlockDataProperties,
  ContainsProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";

import { PositionInput } from "../../../graphql/api-types.gen";
import { ImpureGraphFunction } from "../../context-types";
import { SYSTEM_TYPES } from "../../system-types";
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
  { blockCollectionEntityId: EntityId },
  Promise<{ linkEntity: LinkEntity<BlockDataProperties>; rightEntity: Block }[]>
> = async (ctx, authentication, { blockCollectionEntityId }) => {
  const outgoingBlockDataLinks = (await getEntityOutgoingLinks(
    ctx,
    authentication,
    {
      entityId: blockCollectionEntityId,
      linkEntityTypeVersionedUrl:
        SYSTEM_TYPES.linkEntityType.hasIndexedContent.schema.$id,
    },
  )) as LinkEntity<ContainsProperties>[];

  return await Promise.all(
    outgoingBlockDataLinks
      .sort((a, b) => {
        const { numericIndex: aNumericIndex } = simplifyProperties(
          a.properties,
        );
        const { numericIndex: bNumericIndex } = simplifyProperties(
          b.properties,
        );

        return (
          (aNumericIndex ?? 0) - (bNumericIndex ?? 0) ||
          a.metadata.recordId.entityId.localeCompare(
            b.metadata.recordId.entityId,
          ) ||
          a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
            b.metadata.temporalVersioning.decisionTime.start.limit,
          )
        );
      })
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
    blockCollectionEntity: Entity;
    block: Block;
    position: PositionInput;
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const {
    blockCollectionEntity,
    block,
    position: { canvasPosition, fractionalIndex },
  } = params;

  if (!canvasPosition && !fractionalIndex) {
    throw new Error(`One of fractionalIndex or canvasPosition must be defined`);
  }

  await createLinkEntity(ctx, authentication, {
    leftEntityId: blockCollectionEntity.metadata.recordId.entityId,
    rightEntityId: block.entity.metadata.recordId.entityId,
    linkEntityType: canvasPosition
      ? SYSTEM_TYPES.linkEntityType.hasSpatiallyPositionedContent
      : SYSTEM_TYPES.linkEntityType.hasIndexedContent,
    // assume that link to block is owned by the same account as the blockCollection
    ownedById: extractOwnedByIdFromEntityId(
      blockCollectionEntity.metadata.recordId.entityId,
    ),
    properties: canvasPosition || {
      [SYSTEM_TYPES.propertyType.fractionalIndex.metadata.recordId.baseUrl]:
        fractionalIndex,
    },
  });
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
    position: { fractionalIndex, canvasPosition },
    linkEntityId,
  } = params;

  if (!canvasPosition && !fractionalIndex) {
    throw new Error(`One of fractionalIndex or canvasPosition must be defined`);
  }

  const linkEntity = await getLatestEntityById(ctx, authentication, {
    entityId: linkEntityId,
  });

  if (!linkEntity.linkData) {
    throw new Error(`Entity with id ${linkEntityId} is not a link entity`);
  }

  await updateLinkEntity(ctx, authentication, {
    properties: canvasPosition || {
      [SYSTEM_TYPES.propertyType.fractionalIndex.metadata.recordId.baseUrl]:
        fractionalIndex,
    },
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
