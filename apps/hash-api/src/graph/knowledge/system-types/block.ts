import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { BlockProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  EntityPropertiesObject,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
import {
  archiveEntity,
  createEntity,
  CreateEntityParams,
  getEntities,
  getEntityIncomingLinks,
  getEntityOutgoingLinks,
  getLatestEntityById,
} from "../primitive/entity";
import {
  createLinkEntity,
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
  isEntityLinkEntity,
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
    entity.metadata.entityTypeId !== systemTypes.entityType.block.entityTypeId
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemTypes.entityType.block.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  const { componentId } = simplifyProperties(
    entity.properties as BlockProperties,
  );

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
> = async (ctx, authentication, { entityId }) => {
  const entity = await getLatestEntityById(ctx, authentication, { entityId });

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
> = async (ctx, authentication, params) => {
  const { componentId, blockData, ownedById } = params;

  const properties: EntityPropertiesObject = {
    [extractBaseUrl(systemTypes.propertyType.componentId.propertyTypeId)]:
      componentId,
  };

  const entity = await createEntity(ctx, authentication, {
    ownedById,
    properties,
    entityTypeId: systemTypes.entityType.block.entityTypeId,
  });

  await createLinkEntity(ctx, authentication, {
    linkEntityTypeId: systemTypes.linkEntityType.hasData.linkEntityTypeId,
    leftEntityId: entity.metadata.recordId.entityId,
    rightEntityId: blockData.metadata.recordId.entityId,
    ownedById,
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
> = async (ctx, authentication, { block }) => {
  const outgoingBlockDataLinks = await getEntityOutgoingLinks(
    ctx,
    authentication,
    {
      entityId: block.entity.metadata.recordId.entityId,
      linkEntityTypeVersionedUrl:
        systemTypes.linkEntityType.hasData.linkEntityTypeId,
    },
  );

  const outgoingBlockDataLink = outgoingBlockDataLinks[0];

  if (!outgoingBlockDataLink) {
    throw new Error(
      `Block with entityId ${block.entity.metadata.recordId.entityId} does not have an outgoing blockData link`,
    );
  }

  return getLinkEntityRightEntity(ctx, authentication, {
    linkEntity: outgoingBlockDataLink,
  });
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
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const { block, newBlockDataEntity } = params;
  const outgoingBlockDataLinks = await getEntityOutgoingLinks(
    ctx,
    authentication,
    {
      entityId: block.entity.metadata.recordId.entityId,
      linkEntityTypeVersionedUrl:
        systemTypes.linkEntityType.hasData.linkEntityTypeId,
    },
  );

  const outgoingBlockDataLink = outgoingBlockDataLinks[0];

  if (!outgoingBlockDataLink) {
    throw new Error(
      `Block with entityId ${block.entity.metadata.recordId.entityId} does not have an outgoing block data link`,
    );
  }

  const existingBlockDataEntity = await getLinkEntityRightEntity(
    ctx,
    authentication,
    {
      linkEntity: outgoingBlockDataLink,
    },
  );

  if (
    existingBlockDataEntity.metadata.recordId.entityId ===
    newBlockDataEntity.metadata.recordId.entityId
  ) {
    throw new Error(
      `The block with entity id ${existingBlockDataEntity.metadata.recordId.entityId} already has a linked block data entity with entity id ${newBlockDataEntity.metadata.recordId.entityId}`,
    );
  }

  await archiveEntity(ctx, authentication, {
    entity: outgoingBlockDataLink,
  });

  await createLinkEntity(ctx, authentication, {
    linkEntityTypeId: systemTypes.linkEntityType.hasData.linkEntityTypeId,
    leftEntityId: block.entity.metadata.recordId.entityId,
    rightEntityId: newBlockDataEntity.metadata.recordId.entityId,
    ownedById: extractOwnedByIdFromEntityId(
      block.entity.metadata.recordId.entityId,
    ),
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
> = async (ctx, authentication, { block }) => {
  const blockCommentLinks = await getEntityIncomingLinks(ctx, authentication, {
    entityId: block.entity.metadata.recordId.entityId,
    linkEntityTypeId: systemTypes.linkEntityType.hasParent.linkEntityTypeId,
  });

  const commentEntities = await Promise.all(
    blockCommentLinks.map((linkEntity) =>
      getLinkEntityLeftEntity(ctx, authentication, { linkEntity }),
    ),
  );

  return commentEntities.map((entity) => getCommentFromEntity({ entity }));
};

/**
 * Get the page the block collection entity that contains the block, or null if
 * if the block is in not contained in a block collection.
 *
 * @param params.block - the block entity
 */
export const getBlockCollectionByBlock: ImpureGraphFunction<
  { block: Block },
  Promise<Entity | null>
> = async (context, authentication, { block }) => {
  const blockEntityUuid = extractEntityUuidFromEntityId(
    block.entity.metadata.recordId.entityId,
  );

  const matchingContainsLinks = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemTypes.linkEntityType.contains.linkEntityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              { path: ["rightEntity", "uuid"] },
              { parameter: blockEntityUuid },
            ],
          },
          generateVersionedUrlMatchingFilter(
            systemTypes.entityType.blockCollection.entityTypeId,
            { ignoreParents: false, pathPrefix: ["leftEntity"] },
          ),
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  }).then((subgraph) => getRoots(subgraph).filter(isEntityLinkEntity));

  /** @todo: account for blocks that are in multiple pages */

  const [matchingContainsLink] = matchingContainsLinks;

  if (matchingContainsLink) {
    const blockCollectionEntity = await getLatestEntityById(
      context,
      authentication,
      {
        entityId: matchingContainsLink.linkData.leftEntityId,
      },
    );

    return blockCollectionEntity;
  }

  return null;
};
