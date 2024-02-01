import type {
  EntityEmbedding,
  EntityStructuralQuery,
  EntityTypeStructuralQuery,
  GraphApi,
} from "@local/hash-graph-client";
import type {
  AccountId,
  Entity,
  EntityRootType,
  EntityTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
  Timestamp,
} from "@local/hash-subgraph";
import {
  getEntities,
  getPropertyTypes,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

export const createGraphActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async getEntitiesByQuery(params: {
    authentication: {
      actorId: AccountId;
    };
    query: EntityStructuralQuery;
  }): Promise<Subgraph<EntityRootType>> {
    return graphApiClient
      .getEntitiesByQuery(params.authentication.actorId, {
        query: params.query,
      })
      .then((response) =>
        mapGraphApiSubgraphToSubgraph(response.data.subgraph),
      );
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
