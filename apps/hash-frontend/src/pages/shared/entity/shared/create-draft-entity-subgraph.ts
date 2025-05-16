import type {
  EntityRevisionId,
  EntityRootType,
  Subgraph,
} from "@blockprotocol/graph";
import type { KnowledgeGraphEditionMap } from "@blockprotocol/graph/types";
import type {
  BaseUrl,
  EntityMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";

export const createDraftEntitySubgraph = ({
  currentSubgraph,
  entity,
  entityTypeIds,
  omitProperties,
}: {
  currentSubgraph: Subgraph<EntityRootType<HashEntity>> | undefined;
  entity: HashEntity;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  omitProperties: BaseUrl[];
}): Subgraph<EntityRootType<HashEntity>> => {
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

  const newEntity = Object.freeze(
    new HashEntity({
      ...entity.toJSON(),
      metadata,
      properties: newProperties,
    }),
  );

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
        ...(currentSubgraph?.vertices[
          newEntity.metadata.recordId.entityId
        ] as KnowledgeGraphEditionMap<HashEntity>),
        [newEntityRevisionId]: {
          kind: "entity",
          inner: newEntity,
        },
      },
    },
  };
};
