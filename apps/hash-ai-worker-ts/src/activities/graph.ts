import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import type {
  EntityQueryCursor,
  GetDataTypeSubgraphRequest,
  GetEntitySubgraphRequest,
  GetEntityTypeSubgraphParams,
  GetPropertyTypeSubgraphRequest,
  GraphApi,
  UpdateDataTypeEmbeddingParams,
  UpdateEntityEmbeddingsParams,
  UpdateEntityTypeEmbeddingParams,
  UpdatePropertyTypeEmbeddingParams,
} from "@local/hash-graph-client";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  mapGraphApiEntityToEntity,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";
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
      .getEntities("00000000-0000-0000-0000-000000000000", {
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
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
      })
      .then(({ data: response }) =>
        response.entities.map((entity) => {
          const mappedEntity = mapGraphApiEntityToEntity(entity, null, true);
          const entity_uuid = extractEntityUuidFromEntityId(
            mappedEntity.metadata.recordId.entityId,
          );
          return entity_uuid as Uuid as AccountId;
        }),
      );
  },

  async getDataTypesSubgraph(params: {
    authentication: {
      actorId: AccountId;
    };
    request: GetDataTypeSubgraphRequest;
  }): Promise<Subgraph<DataTypeRootType>> {
    return graphApiClient
      .getDataTypeSubgraph(params.authentication.actorId, params.request)
      .then(({ data: response }) =>
        mapGraphApiSubgraphToSubgraph(
          response.subgraph,
          params.authentication.actorId,
        ),
      );
  },

  async getPropertyTypesSubgraph(params: {
    authentication: {
      actorId: AccountId;
    };
    request: GetPropertyTypeSubgraphRequest;
  }): Promise<Subgraph<PropertyTypeRootType>> {
    return graphApiClient
      .getPropertyTypeSubgraph(params.authentication.actorId, params.request)
      .then(({ data: response }) =>
        mapGraphApiSubgraphToSubgraph(
          response.subgraph,
          params.authentication.actorId,
        ),
      );
  },

  async getEntityTypesSubgraph(params: {
    authentication: {
      actorId: AccountId;
    };
    request: GetEntityTypeSubgraphParams;
  }): Promise<Subgraph<EntityTypeRootType>> {
    return graphApiClient
      .getEntityTypeSubgraph(params.authentication.actorId, params.request)
      .then(({ data: response }) =>
        mapGraphApiSubgraphToSubgraph(
          response.subgraph,
          params.authentication.actorId,
        ),
      );
  },

  async getEntitySubgraph(params: {
    authentication: {
      actorId: AccountId;
    };
    request: GetEntitySubgraphRequest;
  }): Promise<EntityQueryResponse> {
    return graphApiClient
      .getEntitySubgraph(params.authentication.actorId, params.request)
      .then(({ data: response }) => ({
        subgraph: mapGraphApiSubgraphToSubgraph(
          response.subgraph,
          params.authentication.actorId,
        ),
        cursor: response.cursor,
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
