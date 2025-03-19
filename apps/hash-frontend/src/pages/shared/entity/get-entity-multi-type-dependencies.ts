import {
  type Entity,
  type EntityId,
  type VersionedUrl,
} from "@blockprotocol/type-system";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getIncomingLinkAndSourceEntities,
  getLeftEntityForLinkEntity,
  getOutgoingLinkAndTargetEntities,
  getRightEntityForLinkEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";

import type { DraftLinksToCreate } from "./shared/use-draft-link-state";

const addEntityTypeIdsToSet = (
  uniqueJoinedMultiEntityTypeIds: Set<string>,
  entity: Entity,
) => {
  const joinedMultiTypeIds = entity.metadata.entityTypeIds.toSorted().join(",");
  uniqueJoinedMultiEntityTypeIds.add(joinedMultiTypeIds);
};

/**
 * Get the set of unique multi-type ids that are referenced by the entity,
 * including its own entityTypeIds, those of any existing incoming/outgoing links (and their targets/sources),
 * and those of any links marked for creation (i.e. the user has selected one but not yet created it).
 */
export const getEntityMultiTypeDependencies = ({
  draftLinksToCreate,
  entityId,
  entityTypeIds,
  entitySubgraph,
}: {
  /**
   * The links marked for creation from the draft entity
   */
  draftLinksToCreate: DraftLinksToCreate;
  /**
   * The entityId of the entity
   */
  entityId: EntityId;
  /**
   * The entityTypeIds of the entity itself
   */
  entityTypeIds: VersionedUrl[];
  /**
   * The subgraph of the entity, including its outgoing and incoming links
   */
  entitySubgraph: Subgraph<EntityRootType> | null;
}): VersionedUrl[][] => {
  const entity = entitySubgraph ? getRoots(entitySubgraph)[0] : null;

  const uniqueJoinedMultiEntityTypeIds = new Set<string>();

  if (entity?.linkData && entitySubgraph) {
    const rightEntity = getRightEntityForLinkEntity(entitySubgraph, entityId);

    if (rightEntity?.[0]) {
      addEntityTypeIdsToSet(uniqueJoinedMultiEntityTypeIds, rightEntity[0]);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `Right entity with for link entity ${entityId} not found in subgraph`,
      );
    }

    const leftEntity = getLeftEntityForLinkEntity(entitySubgraph, entityId);

    if (leftEntity?.[0]) {
      addEntityTypeIdsToSet(uniqueJoinedMultiEntityTypeIds, leftEntity[0]);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `Left entity for link entity ${entityId} not found in subgraph`,
      );
    }
  }

  for (const { linkEntity, rightEntity } of [
    ...(entitySubgraph
      ? getOutgoingLinkAndTargetEntities(entitySubgraph, entityId)
      : []),
    ...draftLinksToCreate.map((link) => ({
      linkEntity: [link.linkEntity],
      rightEntity: [link.rightEntity],
    })),
  ]) {
    const linkEntityRevision = linkEntity[0];

    if (linkEntityRevision) {
      addEntityTypeIdsToSet(uniqueJoinedMultiEntityTypeIds, linkEntityRevision);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`Link entity not found in subgraph`);
    }

    const rightEntityRevision = rightEntity[0];

    if (rightEntityRevision) {
      addEntityTypeIdsToSet(
        uniqueJoinedMultiEntityTypeIds,
        rightEntityRevision,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn(`Right entity not found in subgraph`);
    }
  }

  const incomingLinkAndSourceEntities = entitySubgraph
    ? getIncomingLinkAndSourceEntities(entitySubgraph, entityId)
    : [];

  for (const { linkEntity, leftEntity } of incomingLinkAndSourceEntities) {
    const linkEntityRevision = linkEntity[0];

    if (linkEntityRevision) {
      addEntityTypeIdsToSet(uniqueJoinedMultiEntityTypeIds, linkEntityRevision);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`Link entity not found in subgraph`);
    }

    const leftEntityRevision = leftEntity[0];

    if (leftEntityRevision) {
      addEntityTypeIdsToSet(uniqueJoinedMultiEntityTypeIds, leftEntityRevision);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`Left entity not found in subgraph`);
    }
  }

  return [
    entityTypeIds,
    ...Array.from(uniqueJoinedMultiEntityTypeIds).map((joinedMultiTypeIds) =>
      joinedMultiTypeIds
        .split(",")
        .map((multiTypeId) => multiTypeId as VersionedUrl),
    ),
  ];
};
