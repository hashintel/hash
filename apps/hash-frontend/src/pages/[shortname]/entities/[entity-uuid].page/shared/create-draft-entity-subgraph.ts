import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityMetadata } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type {
  EntityRevisionId,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";

export const createDraftEntitySubgraph = ({
  currentSubgraph,
  entity,
  entityTypeIds,
  omitProperties,
}: {
  currentSubgraph: Subgraph<EntityRootType> | undefined;
  entity: Entity;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  omitProperties: BaseUrl[];
}) => {
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

  const newProperties = Object.fromEntries(
    Object.entries(entity.properties).filter(
      ([key, _]) => !omitProperties.includes(key as BaseUrl),
    ),
  );

  const newEntity = new Entity({
    ...entity.toJSON(),
    metadata,
    properties: newProperties,
  });

  return {
    depths: {
      ...zeroedGraphResolveDepths,
      hasLeftEntity: { incoming: 1, outgoing: 1 },
      hasRightEntity: { incoming: 1, outgoing: 1 },
    },
    edges: {},
    temporalAxes: {
      initial: currentTimeInstantTemporalAxes,
      resolved: {
        pinned: {
          axis: "transactionTime",
          timestamp: newEntityRevisionId,
        },
        variable: {
          axis: "decisionTime",
          interval: {
            start: {
              kind: "inclusive",
              limit: newEntityRevisionId,
            },
            end: { kind: "inclusive", limit: newEntityRevisionId },
          },
        },
      },
    } as const,
    ...currentSubgraph,
    roots: [
      {
        baseId: newEntity.metadata.recordId.entityId,
        revisionId: newEntityRevisionId,
      },
    ],
    vertices: {
      ...currentSubgraph?.vertices,
      [newEntity.metadata.recordId.entityId]: {
        ...currentSubgraph?.vertices[newEntity.metadata.recordId.entityId],
        [newEntityRevisionId]: {
          kind: "entity",
          inner: newEntity,
        },
      },
    },
  };
};
