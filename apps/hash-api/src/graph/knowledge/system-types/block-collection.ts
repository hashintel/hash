import { CanvasPosition } from "@local/hash-graphql-shared/graphql/types";
import { BlockDataProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import { UserInputError } from "apollo-server-errors";

import { SYSTEM_TYPES } from "../../system-types";
import { ImpureGraphFunction } from "../../util";
import { archiveEntity, getEntityOutgoingLinks } from "../primitive/entity";
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
  const outgoingBlockDataLinks = await getEntityOutgoingLinks(
    ctx,
    authentication,
    {
      entityId: blockCollectionEntityId,
      linkEntityTypeVersionedUrl:
        SYSTEM_TYPES.linkEntityType.contains.schema.$id,
    },
  );

  return await Promise.all(
    outgoingBlockDataLinks
      .sort(
        (a, b) =>
          (a.linkData.leftToRightOrder ?? 0) -
            (b.linkData.leftToRightOrder ?? 0) ||
          a.metadata.recordId.entityId.localeCompare(
            b.metadata.recordId.entityId,
          ) ||
          a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
            b.metadata.temporalVersioning.decisionTime.start.limit,
          ),
      )
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
    canvasPosition?: CanvasPosition;
    position?: number;
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const {
    position: specifiedPosition,
    canvasPosition,
    blockCollectionEntity,
    block,
  } = params;

  await createLinkEntity(ctx, authentication, {
    leftEntityId: blockCollectionEntity.metadata.recordId.entityId,
    rightEntityId: block.entity.metadata.recordId.entityId,
    linkEntityType: SYSTEM_TYPES.linkEntityType.contains,
    leftToRightOrder:
      specifiedPosition ??
      // if position is not specified and there are no blocks currently in the blockCollection, specify the index of the link is `0`
      ((
        await getBlockCollectionBlocks(ctx, authentication, {
          blockCollectionEntityId:
            blockCollectionEntity.metadata.recordId.entityId,
        })
      ).length === 0
        ? 0
        : undefined),
    // assume that link to block is owned by the same account as the blockCollection
    ownedById: extractOwnedByIdFromEntityId(
      blockCollectionEntity.metadata.recordId.entityId,
    ),
    properties: canvasPosition ?? {},
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
    blockCollectionEntity: Entity;
    canvasPosition?: CanvasPosition;
    currentPosition: number;
    newPosition: number;
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const {
    blockCollectionEntity,
    canvasPosition,
    currentPosition,
    newPosition,
  } = params;

  const contentLinks = await getEntityOutgoingLinks(ctx, authentication, {
    entityId: blockCollectionEntity.metadata.recordId.entityId,
    linkEntityTypeVersionedUrl: SYSTEM_TYPES.linkEntityType.contains.schema.$id,
  });

  if (currentPosition < 0 || currentPosition >= contentLinks.length) {
    throw new UserInputError(
      `invalid currentPosition: ${params.currentPosition}`,
    );
  }
  if (newPosition < 0 || newPosition >= contentLinks.length) {
    throw new UserInputError(`invalid newPosition: ${params.newPosition}`);
  }

  const linkEntity = contentLinks.find(
    ({ linkData }) => linkData.leftToRightOrder === currentPosition,
  );

  if (!linkEntity) {
    throw new Error(
      `Critical: could not find contents link with index ${currentPosition} for blockCollection with entityId ${blockCollectionEntity.metadata.recordId.entityId}`,
    );
  }

  await updateLinkEntity(ctx, authentication, {
    properties: {
      ...linkEntity.properties,
      ...canvasPosition,
    },
    linkEntity,
    leftToRightOrder: newPosition,
  });
};

/**
 * Remove a block from the blockCollection.
 *
 * @param params.blockCollection - the blockCollection
 * @param params.position - the position of the block being removed
 * @param params.actorId - the id of the account that is removing the block
 * @param params.allowRemovingFinal (optional) - whether or not removing the final block in the blockCollection should be permitted (defaults to `true`)
 */
export const removeBlockFromBlockCollection: ImpureGraphFunction<
  {
    blockCollectionEntity: Entity;
    position: number;

    allowRemovingFinal?: boolean;
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const {
    blockCollectionEntity,
    allowRemovingFinal = false,
    position,
  } = params;

  const contentLinkEntities = await getEntityOutgoingLinks(
    ctx,
    authentication,
    {
      entityId: blockCollectionEntity.metadata.recordId.entityId,
      linkEntityTypeVersionedUrl:
        SYSTEM_TYPES.linkEntityType.contains.schema.$id,
    },
  );

  /**
   * @todo currently the count of outgoing links are not the best indicator of a valid position
   *   as blockCollection saving could assume index positions higher than the number of blocks.
   *   Ideally we'd be able to atomically rearrange all blocks as we're removing/adding blocks.
   *   see: https://app.asana.com/0/1200211978612931/1203031430417465/f
   */

  const linkEntity = contentLinkEntities.find(
    (contentLinkEntity) =>
      contentLinkEntity.linkData.leftToRightOrder === position,
  );

  if (!linkEntity) {
    throw new Error(
      `Critical: could not find contents link with index ${position} for blockCollection with entity ID ${blockCollectionEntity.metadata.recordId.entityId}`,
    );
  }

  if (!allowRemovingFinal && contentLinkEntities.length === 1) {
    throw new Error("Cannot remove final block from blockCollection");
  }

  await archiveEntity(ctx, authentication, { entity: linkEntity });
};
