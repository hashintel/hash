import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityMetadata } from "@local/hash-graph-types/entity";
import type {
  EntityRevisionId,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";

export const updateDraftEntitySubgraph = (
  entity: Entity,
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]],
  currentSubgraph: Subgraph<EntityRootType>,
) => {
  /**
   * @todo - This is a problem, subgraphs should probably be immutable, there will be a new identifier
   *   for the updated entity. This version will not match the one returned by the data store.
   *   For places where we mutate elements, we should probably store them separately from the subgraph to
   *   allow for optimistic updates without being incorrect.
   */
  const metadata = JSON.parse(
    JSON.stringify(entity.metadata),
  ) as EntityMetadata;
  metadata.entityTypeIds = entityTypeIds;

  const newEntityRevisionId = new Date().toISOString() as EntityRevisionId;
  metadata.temporalVersioning.decisionTime.start.limit = newEntityRevisionId;
  metadata.temporalVersioning.transactionTime.start.limit = newEntityRevisionId;

  const newEntity = new Entity({
    ...entity.toJSON(),
    metadata,
  } as SerializedEntity);

  return {
    ...currentSubgraph,
    roots: [
      {
        baseId: newEntity.metadata.recordId.entityId,
        revisionId: newEntityRevisionId,
      },
    ],
    vertices: {
      ...currentSubgraph.vertices,
      [newEntity.metadata.recordId.entityId]: {
        ...currentSubgraph.vertices[newEntity.metadata.recordId.entityId],
        [newEntityRevisionId]: {
          kind: "entity",
          inner: newEntity,
        },
      },
    },
  };
};
