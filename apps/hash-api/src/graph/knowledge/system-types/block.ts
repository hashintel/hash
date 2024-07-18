import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type {
  CreateEntityParameters,
  Entity,
} from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { contentLinkTypeFilter } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  Block as BlockEntity,
  HasData,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";

import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import {
  createEntity,
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
import type { Comment } from "./comment";
import { getCommentFromEntity } from "./comment";

export type Block = {
  componentId: string;
  entity: Entity<BlockEntity>;
};

function assertBlockEntity(
  entity: Entity,
): asserts entity is Entity<BlockEntity> {
  if (entity.metadata.entityTypeId !== systemEntityTypes.block.entityTypeId) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.block.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }
}

export const getBlockFromEntity: PureGraphFunction<
  { entity: Entity },
  Block
> = ({ entity }) => {
  assertBlockEntity(entity);

  const { componentId } = simplifyProperties(entity.properties);

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
  Pick<CreateEntityParameters, "ownedById"> & {
    componentId: string;
    blockData: Entity;
  },
  Promise<Block>
> = async (ctx, authentication, params) => {
  const { componentId, blockData, ownedById } = params;

  const entity = await createEntity<BlockEntity>(ctx, authentication, {
    ownedById,
    properties: {
      value: {
        "https://hash.ai/@hash/types/property-type/component-id/": {
          value: componentId,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      },
    },
    entityTypeId: systemEntityTypes.block.entityTypeId,
    relationships: createDefaultAuthorizationRelationships(authentication),
  });

  await createLinkEntity<HasData>(ctx, authentication, {
    ownedById,
    properties: { value: {} },
    linkData: {
      leftEntityId: entity.metadata.recordId.entityId,
      rightEntityId: blockData.metadata.recordId.entityId,
    },
    entityTypeId: systemLinkEntityTypes.hasData.linkEntityTypeId,
    relationships: createDefaultAuthorizationRelationships(authentication),
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
        systemLinkEntityTypes.hasData.linkEntityTypeId,
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
        systemLinkEntityTypes.hasData.linkEntityTypeId,
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

  await outgoingBlockDataLink.archive(ctx.graphApi, authentication);

  await createLinkEntity(ctx, authentication, {
    ownedById: extractOwnedByIdFromEntityId(
      block.entity.metadata.recordId.entityId,
    ),
    properties: { value: {} },
    linkData: {
      leftEntityId: block.entity.metadata.recordId.entityId,
      rightEntityId: newBlockDataEntity.metadata.recordId.entityId,
    },
    entityTypeId: systemLinkEntityTypes.hasData.linkEntityTypeId,
    relationships: createDefaultAuthorizationRelationships(authentication),
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
    linkEntityTypeId: systemLinkEntityTypes.hasParent.linkEntityTypeId,
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
  { block: Block; includeDrafts?: boolean },
  Promise<Entity | null>
> = async (context, authentication, params) => {
  const { block, includeDrafts = false } = params;

  const blockEntityUuid = extractEntityUuidFromEntityId(
    block.entity.metadata.recordId.entityId,
  );

  const matchingContainsLinks = await getEntities(context, authentication, {
    filter: {
      all: [
        contentLinkTypeFilter,
        {
          equal: [
            { path: ["rightEntity", "uuid"] },
            { parameter: blockEntityUuid },
          ],
        },
        generateVersionedUrlMatchingFilter(
          systemEntityTypes.blockCollection.entityTypeId,
          { ignoreParents: false, pathPrefix: ["leftEntity"] },
        ),
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts,
  }).then((entities) => entities.filter(isEntityLinkEntity));

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
