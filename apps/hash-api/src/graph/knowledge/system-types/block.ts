import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { contentLinkTypeFilter } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { BlockProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

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
  if (entity.metadata.entityTypeId !== systemEntityTypes.block.entityTypeId) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.block.entityTypeId,
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
  Omit<
    CreateEntityParams,
    "properties" | "entityTypeId" | "relationships" | "inheritedPermissions"
  > & {
    componentId: string;
    blockData: Entity;
  },
  Promise<Block>
> = async (ctx, authentication, params) => {
  const { componentId, blockData, ownedById } = params;

  const properties: BlockProperties = {
    "https://hash.ai/@hash/types/property-type/component-id/": componentId,
  };

  const entity = await createEntity(ctx, authentication, {
    ownedById,
    properties,
    entityTypeId: systemEntityTypes.block.entityTypeId,
    relationships: [],
    inheritedPermissions: [
      "administratorFromWeb",
      "updateFromWeb",
      "viewFromWeb",
    ],
  });

  await createLinkEntity(ctx, authentication, {
    linkEntityTypeId: systemLinkEntityTypes.hasData.linkEntityTypeId,
    leftEntityId: entity.metadata.recordId.entityId,
    rightEntityId: blockData.metadata.recordId.entityId,
    ownedById,
    relationships: [],
    inheritedPermissions: [
      "administratorFromWeb",
      "updateFromWeb",
      "viewFromWeb",
    ],
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

  await archiveEntity(ctx, authentication, {
    entity: outgoingBlockDataLink,
  });

  await createLinkEntity(ctx, authentication, {
    linkEntityTypeId: systemLinkEntityTypes.hasData.linkEntityTypeId,
    leftEntityId: block.entity.metadata.recordId.entityId,
    rightEntityId: newBlockDataEntity.metadata.recordId.entityId,
    ownedById: extractOwnedByIdFromEntityId(
      block.entity.metadata.recordId.entityId,
    ),
    relationships: [],
    inheritedPermissions: [
      "administratorFromWeb",
      "updateFromWeb",
      "viewFromWeb",
    ],
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
    query: {
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
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
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
