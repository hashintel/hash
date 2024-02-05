import type {
  EntityEmbedding,
  EntityQueryCursor,
  EntityStructuralQuery,
  EntityTypeStructuralQuery,
  GraphApi,
} from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  AccountId,
  Entity,
  EntityRootType,
  EntityTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
  Timestamp,
  Uuid,
} from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getEntities,
  getPropertyTypes,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

export type EntityQueryResponse = {
  subgraph: Subgraph<EntityRootType>;
  cursor?: EntityQueryCursor | null;
};

export const createGraphActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async getUserAccountIds(): Promise<AccountId[]> {
    return graphApiClient
      .getEntitiesByQuery("00000000-0000-0000-0000-000000000000", {
        query: {
          filter: {
            all: [
              {
                equal: [
                  { path: ["type", "baseUrl"] },
                  { parameter: systemEntityTypes.user.entityTypeBaseUrl },
                ],
              },
            ],
          },
          graphResolveDepths: zeroedGraphResolveDepths,
          includeDrafts: true,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      })
      .then((response) => {
        const subgraph: Subgraph<EntityRootType> =
          mapGraphApiSubgraphToSubgraph(response.data.subgraph);
        return subgraph.roots.map(
          (root) =>
            extractEntityUuidFromEntityId(root.baseId) as Uuid as AccountId,
        );
      });
  },

  async getEntitiesByQuery(params: {
    authentication: {
      actorId: AccountId;
    };
    query: EntityStructuralQuery;
    limit?: number;
    cursor?: EntityQueryCursor;
  }): Promise<EntityQueryResponse> {
    return graphApiClient
      .getEntitiesByQuery(params.authentication.actorId, {
        query: params.query,
        limit: params.limit,
        cursor: params.cursor,
      })
      .then((response) => ({
        subgraph: mapGraphApiSubgraphToSubgraph(response.data.subgraph),
        cursor: response.data.cursor,
      }));
  },

  async getEntityTypesByQuery(params: {
    authentication: {
      actorId: AccountId;
    };
    query: EntityTypeStructuralQuery;
  }): Promise<Subgraph<EntityTypeRootType>> {
    return graphApiClient
      .getEntityTypesByQuery(params.authentication.actorId, params.query)
      .then((response) => mapGraphApiSubgraphToSubgraph(response.data));
  },

  async updateEntityEmbeddings(params: {
    authentication: {
      actorId: AccountId;
    };
    embeddings: EntityEmbedding[];
    updatedAtTransactionTime: Timestamp;
    updatedAtDecisionTime: Timestamp;
  }): Promise<void> {
    await graphApiClient
      .updateEntityEmbeddings(params.authentication.actorId, {
        embeddings: params.embeddings,
        reset: true,
        updatedAtTransactionTime: params.updatedAtTransactionTime,
        updatedAtDecisionTime: params.updatedAtDecisionTime,
      })
      .then((response) => response.data);
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubgraphEntities(params: { subgraph: Subgraph }): Promise<Entity[]> {
    return getEntities(params.subgraph);
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubgraphPropertyTypes(params: {
    subgraph: Subgraph;
  }): Promise<PropertyTypeWithMetadata[]> {
    return getPropertyTypes(params.subgraph);
  },
});
