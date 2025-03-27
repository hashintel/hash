import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import {
  currentTimestamp,
  extractOwnedByIdFromEntityId,
  generateTimestamp,
} from "@blockprotocol/type-system";
import type {
  Entity as GraphApiEntity,
  EntityVertex,
  EntityVertexId,
  KnowledgeGraphVertices,
} from "@local/hash-graph-client";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";

export const createInitialDraftEntitySubgraph = (
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]],
): Subgraph<EntityRootType<HashEntity>> => {
  const now = currentTimestamp();

  const draftEntityVertexId = {
    baseId: "draft~draft" as EntityId,
    revisionId: now,
  } satisfies EntityVertexId;

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
          actorType: "human",
          origin: {
            type: "api",
          },
        },
      },
    },
  };

  const entity = new HashEntity(serializedEntity);

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
              limit: generateTimestamp(new Date(0)),
            },
            end: { kind: "inclusive", limit: now },
          },
        },
      },
    } as const,
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
