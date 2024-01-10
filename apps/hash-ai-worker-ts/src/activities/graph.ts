import type {
  EntityEmbedding,
  EntityTypeStructuralQuery,
  GraphApi,
} from "@local/hash-graph-client";
import type {
  AccountId,
  EntityTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getPropertyTypes,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

export const createGraphActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
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
  }): Promise<void> {
    await graphApiClient
      .updateEntityEmbeddings(params.authentication.actorId, {
        embeddings: params.embeddings,
        reset: true,
      })
      .then((response) => response.data);
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubgraphPropertyTypes(params: {
    subgraph: Subgraph;
  }): Promise<PropertyTypeWithMetadata[]> {
    return getPropertyTypes(params.subgraph);
  },
});
