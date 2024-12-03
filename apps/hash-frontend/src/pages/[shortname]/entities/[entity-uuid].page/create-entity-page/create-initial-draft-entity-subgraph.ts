import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity as GraphApiEntity } from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type {
  EntityRevisionId,
  EntityRootType,
  EntityVertex,
  EntityVertexId,
  KnowledgeGraphVertices,
  Subgraph,
} from "@local/hash-subgraph";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

export const createInitialDraftEntitySubgraph = (
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]],
): Subgraph<EntityRootType> => {
  const now = new Date().toISOString() as Timestamp;

  const draftEntityVertexId: EntityVertexId = {
    baseId: "draft~draft" as EntityId,
    revisionId: now as EntityRevisionId,
  };
  const creator = extractOwnedByIdFromEntityId(draftEntityVertexId.baseId);

  const serializedEntity: GraphApiEntity = {
    properties: {},
    metadata: {
      recordId: {
        entityId: draftEntityVertexId.baseId,
        editionId: now,
      },
      entityTypeIds,
      temporalVersioning: {
        decisionTime: {
          start: {
            kind: "inclusive",
            limit: now,
          },
          end: {
            kind: "unbounded",
          },
        },
        transactionTime: {
          start: {
            kind: "inclusive",
            limit: now,
          },
          end: {
            kind: "unbounded",
          },
        },
      },
      archived: false,
      provenance: {
        createdAtDecisionTime: now,
        createdAtTransactionTime: now,
        createdById: creator,
        edition: {
          createdById: creator,
        },
      },
    },
  };

  const entity = new Entity(serializedEntity);

  return {
    depths: {
      ...zeroedGraphResolveDepths,
      hasLeftEntity: { incoming: 1, outgoing: 1 },
      hasRightEntity: { incoming: 1, outgoing: 1 },
    },
    edges: {},
    roots: [draftEntityVertexId],
    temporalAxes: {
      initial: currentTimeInstantTemporalAxes,
      resolved: {
        pinned: {
          axis: "transactionTime",
          timestamp: now,
        },
        variable: {
          axis: "decisionTime",
          interval: {
            start: {
              kind: "inclusive",
              limit: new Date(0).toISOString() as Timestamp,
            },
            end: { kind: "inclusive", limit: now },
          },
        },
      },
    } as const,
    // @ts-expect-error -- Vertices expects OntologyVertices to be present. @todo overhaul subgraph
    vertices: {
      [draftEntityVertexId.baseId]: {
        [draftEntityVertexId.revisionId]: {
          kind: "entity",
          inner: entity,
        } as const satisfies EntityVertex,
      },
    } satisfies KnowledgeGraphVertices,
  };
};
