import {
  AccountId,
  Entity,
  EntityId,
  extractOwnedByIdFromEntityId,
  PropertyObject,
} from "@local/hash-subgraph/main";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import {
  archiveEntity,
  createEntity,
  CreateEntityParams,
  getEntityIncomingLinks,
  getEntityOutgoingLinks,
  getLatestEntityById,
} from "../primitive/entity";
import {
  createLinkEntity,
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
} from "../primitive/link-entity";
import { Comment, getCommentFromEntity } from "./comment";

export type Block = {
  componentId: string;
  entity: Entity;
};

export const getBlockFromEntity: PureGraphFunction<
  { entity: Entity },
  Block
> = ({ entity }) => {
  if (
    entity.metadata.entityTypeId !== SYSTEM_TYPES.entityType.block.schema.$id
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.block.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const componentId = entity.properties[
    SYSTEM_TYPES.propertyType.componentId.metadata.recordId.baseUri
  ] as string;

  return {
    componentId,
    entity,
  };
};

/**
 * Get a system block entity by its entity id.
 *
 * @param params.entityId - the entity id of the block
 */
export const getBlockById: ImpureGraphFunction<
  { entityId: EntityId },
  Promise<Block>
> = async (ctx, { entityId }) => {
  const entity = await getLatestEntityById(ctx, { entityId });

  return getBlockFromEntity({ entity });
};

/**
 * Create a system block entity.
 *
 * @param params.componentId - the component id of the block
 * @param params.blockData - the linked block data entity
 *
 * @see {@link createEntity} for the documentation of the remaining parameters
 */
export const createBlock: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId"> & {
    componentId: string;
    blockData: Entity;
  },
  Promise<Block>
> = async (ctx, params) => {
  const { componentId, blockData, ownedById, actorId } = params;

  const properties: PropertyObject = {
    [SYSTEM_TYPES.propertyType.componentId.metadata.recordId.baseUri]:
      componentId,
  };

  const entity = await createEntity(ctx, {
    ownedById,
    properties,
    entityTypeId: SYSTEM_TYPES.entityType.block.schema.$id,
    actorId,
  });

  await createLinkEntity(ctx, {
    linkEntityType: SYSTEM_TYPES.linkEntityType.blockData,
    leftEntityId: entity.metadata.recordId.entityId,
    rightEntityId: blockData.metadata.recordId.entityId,
    ownedById,
    actorId,
  });

  return getBlockFromEntity({ entity });
};

/**
 * Get the linked block data entity of the block.
 *
 * @param params.block - the block
 */
export const getBlockData: ImpureGraphFunction<
  { block: Block },
  Promise<Entity>
> = async (ctx, { block }) => {
  const outgoingBlockDataLinks = await getEntityOutgoingLinks(ctx, {
    entity: block.entity,
    linkEntityType: SYSTEM_TYPES.linkEntityType.blockData,
  });

  const outgoingBlockDataLink = outgoingBlockDataLinks[0];

  if (!outgoingBlockDataLink) {
    throw new Error(
      `Block with entityId ${block.entity.metadata.recordId.entityId} does not have an outgoing blockData link`,
    );
  }

  return getLinkEntityRightEntity(ctx, { linkEntity: outgoingBlockDataLink });
};

/**
 * Update the linked block data entity of a block.
 *
 * @param params.block - the block
 * @param params.newBlockDataEntity - the new block data entity
 * @param params.actorId - the id of the account that is updating the block data entity
 */
export const updateBlockDataEntity: ImpureGraphFunction<
  {
    block: Block;
    newBlockDataEntity: Entity;
    actorId: AccountId;
  },
  Promise<void>
> = async (ctx, params) => {
  const { block, newBlockDataEntity, actorId } = params;
  const outgoingBlockDataLinks = await getEntityOutgoingLinks(ctx, {
    entity: block.entity,
    linkEntityType: SYSTEM_TYPES.linkEntityType.blockData,
  });

  const outgoingBlockDataLink = outgoingBlockDataLinks[0];

  if (!outgoingBlockDataLink) {
    throw new Error(
      `Block with entityId ${block.entity.metadata.recordId.entityId} does not have an outgoing block data link`,
    );
  }

  const existingBlockDataEntity = await getLinkEntityRightEntity(ctx, {
    linkEntity: outgoingBlockDataLink,
  });

  if (
    existingBlockDataEntity.metadata.recordId.entityId ===
    newBlockDataEntity.metadata.recordId.entityId
  ) {
    throw new Error(
      `The block with entity id ${existingBlockDataEntity.metadata.recordId.entityId} already has a linked block data entity with entity id ${newBlockDataEntity.metadata.recordId.entityId}`,
    );
  }

  await archiveEntity(ctx, { entity: outgoingBlockDataLink, actorId });

  await createLinkEntity(ctx, {
    linkEntityType: SYSTEM_TYPES.linkEntityType.blockData,
    leftEntityId: block.entity.metadata.recordId.entityId,
    rightEntityId: newBlockDataEntity.metadata.recordId.entityId,
    ownedById: extractOwnedByIdFromEntityId(
      block.entity.metadata.recordId.entityId,
    ),
    actorId,
  });
};

/**
 * Get the comment of a block.
 *
 * @param params.block - the block
 */
export const getBlockComments: ImpureGraphFunction<
  { block: Block },
  Promise<Comment[]>
> = async (ctx, { block }) => {
  const blockCommentLinks = await getEntityIncomingLinks(ctx, {
    entity: block.entity,
    linkEntityType: SYSTEM_TYPES.linkEntityType.parent,
  });

  const commentEntities = await Promise.all(
    blockCommentLinks.map((linkEntity) =>
      getLinkEntityLeftEntity(ctx, { linkEntity }),
    ),
  );

  return commentEntities.map((entity) => getCommentFromEntity({ entity }));
};
