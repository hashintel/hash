import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import type {
  DataTypeStructuralQuery,
  EntityQueryCursor,
  EntityStructuralQuery,
  EntityTypeStructuralQuery,
  GraphApi,
  PropertyTypeStructuralQuery,
  UpdateDataTypeEmbeddingParams,
  UpdateEntityEmbeddingsParams,
  UpdateEntityTypeEmbeddingParams,
  UpdatePropertyTypeEmbeddingParams,
} from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  AccountId,
  DataTypeRootType,
  DataTypeWithMetadata,
  Entity,
  EntityRootType,
  EntityTypeRootType,
  EntityTypeWithMetadata,
  PropertyTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
  Uuid,
} from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getDataTypes,
  getEntities,
  getEntityTypes,
  getPropertyTypes,
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
          includeDrafts: false,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      })
      .then((response) => {
        const subgraph: Subgraph<EntityRootType> =
          mapGraphApiSubgraphToSubgraph(response.data.subgraph, null);
        return subgraph.roots.map(
          (root) =>
            extractEntityUuidFromEntityId(root.baseId) as Uuid as AccountId,
        );
      });
  },

  async getDataTypesByQuery(params: {
    authentication: {
      actorId: AccountId;
    };
    query: DataTypeStructuralQuery;
  }): Promise<Subgraph<DataTypeRootType>> {
    return graphApiClient
      .getDataTypesByQuery(params.authentication.actorId, params.query)
      .then((response) =>
        mapGraphApiSubgraphToSubgraph(
          response.data,
          params.authentication.actorId,
        ),
      );
  },

  async getPropertyTypesByQuery(params: {
    authentication: {
      actorId: AccountId;
    };
    query: PropertyTypeStructuralQuery;
  }): Promise<Subgraph<PropertyTypeRootType>> {
    return graphApiClient
      .getPropertyTypesByQuery(params.authentication.actorId, params.query)
      .then((response) =>
        mapGraphApiSubgraphToSubgraph(
          response.data,
          params.authentication.actorId,
        ),
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
      .then((response) =>
        mapGraphApiSubgraphToSubgraph(
          response.data,
          params.authentication.actorId,
        ),
      );
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
        subgraph: mapGraphApiSubgraphToSubgraph(
          response.data.subgraph,
          params.authentication.actorId,
        ),
        cursor: response.data.cursor,
      }));
  },

  async updateDataTypeEmbeddings(
    params: {
      authentication: {
        actorId: AccountId;
      };
    } & UpdateDataTypeEmbeddingParams,
  ): Promise<void> {
    await graphApiClient
      .updateDataTypeEmbeddings(params.authentication.actorId, {
        dataTypeId: params.dataTypeId,
        embedding: params.embedding,
        reset: params.reset,
        updatedAtTransactionTime: params.updatedAtTransactionTime,
      })
      .then((response) => response.data);
  },

  async updatePropertyTypeEmbeddings(
    params: {
      authentication: {
        actorId: AccountId;
      };
    } & UpdatePropertyTypeEmbeddingParams,
  ): Promise<void> {
    await graphApiClient
      .updatePropertyTypeEmbeddings(params.authentication.actorId, {
        propertyTypeId: params.propertyTypeId,
        embedding: params.embedding,
        reset: params.reset,
        updatedAtTransactionTime: params.updatedAtTransactionTime,
      })
      .then((response) => response.data);
  },

  async updateEntityTypeEmbeddings(
    params: {
      authentication: {
        actorId: AccountId;
      };
    } & UpdateEntityTypeEmbeddingParams,
  ): Promise<void> {
    await graphApiClient
      .updateEntityTypeEmbeddings(params.authentication.actorId, {
        entityTypeId: params.entityTypeId,
        embedding: params.embedding,
        reset: params.reset,
        updatedAtTransactionTime: params.updatedAtTransactionTime,
      })
      .then((response) => response.data);
  },

  async updateEntityEmbeddings(
    params: {
      authentication: {
        actorId: AccountId;
      };
    } & UpdateEntityEmbeddingsParams,
  ): Promise<void> {
    await graphApiClient
      .updateEntityEmbeddings(params.authentication.actorId, {
        entityId: params.entityId,
        embeddings: params.embeddings,
        reset: params.reset,
        updatedAtTransactionTime: params.updatedAtTransactionTime,
        updatedAtDecisionTime: params.updatedAtDecisionTime,
      })
      .then((response) => response.data);
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubgraphDataTypes(params: {
    subgraph: Subgraph;
  }): Promise<DataTypeWithMetadata[]> {
    return getDataTypes(params.subgraph);
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubgraphPropertyTypes(params: {
    subgraph: Subgraph;
  }): Promise<PropertyTypeWithMetadata[]> {
    return getPropertyTypes(params.subgraph);
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubgraphEntityTypes(params: {
    subgraph: Subgraph;
  }): Promise<EntityTypeWithMetadata[]> {
    return getEntityTypes(params.subgraph);
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubgraphEntities(params: { subgraph: Subgraph }): Promise<Entity[]> {
    return getEntities(params.subgraph);
  },

  async createEntity(
    ...params: Parameters<typeof graphApiClient.createEntity>
  ) {
    return graphApiClient.createEntity(...params).then((result) => result.data);
  },

  async getHashInstanceAdminAccountGroupId(authentication: {
    actorId: AccountId;
  }) {
    return getHashInstanceAdminAccountGroupId(
      { graphApi: graphApiClient },
      authentication,
    );
  },
});
