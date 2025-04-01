import type {
  ActorEntityUuid,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  EntityQueryCursor,
  GetDataTypeSubgraphParams,
  GetEntitySubgraphRequest,
  GetEntityTypeSubgraphParams,
  GetPropertyTypeSubgraphParams,
  GraphApi,
  UpdateDataTypeEmbeddingParams,
  UpdateEntityEmbeddingsParams,
  UpdateEntityTypeEmbeddingParams,
  UpdatePropertyTypeEmbeddingParams,
} from "@local/hash-graph-client";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type {
  CreateEntityParameters,
  SerializedEntity,
} from "@local/hash-graph-sdk/entity";
import { Entity } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  deserializeSubgraph,
  mapGraphApiEntityToEntity,
  mapGraphApiSubgraphToSubgraph,
  serializeSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  DataTypeRootType,
  EntityTypeRootType,
  PropertyTypeRootType,
  SerializedEntityRootType,
  SerializedSubgraph,
} from "@local/hash-subgraph";
import {
  getDataTypes,
  getEntities,
  getEntityTypes,
  getPropertyTypes,
} from "@local/hash-subgraph/stdlib";

export type EntityQueryResponse = {
  subgraph: SerializedSubgraph<SerializedEntityRootType>;
  cursor?: EntityQueryCursor | null;
};

export const createGraphActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async getUserAccountIds(): Promise<ActorEntityUuid[]> {
    return graphApiClient
      .getEntities(publicUserAccountId, {
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
          return entity_uuid as ActorEntityUuid;
        }),
      );
  },

  async getDataTypesSubgraph(params: {
    authentication: {
      actorId: ActorEntityUuid;
    };
    request: GetDataTypeSubgraphParams;
  }): Promise<SerializedSubgraph<DataTypeRootType>> {
    return graphApiClient
      .getDataTypeSubgraph(params.authentication.actorId, params.request)
      .then(
        ({ data: response }) =>
          serializeSubgraph(
            mapGraphApiSubgraphToSubgraph(
              response.subgraph,
              params.authentication.actorId,
            ),
          ) as SerializedSubgraph<DataTypeRootType>,
      );
  },

  async getPropertyTypesSubgraph(params: {
    authentication: {
      actorId: ActorEntityUuid;
    };
    request: GetPropertyTypeSubgraphParams;
  }): Promise<SerializedSubgraph<PropertyTypeRootType>> {
    return graphApiClient
      .getPropertyTypeSubgraph(params.authentication.actorId, params.request)
      .then(
        ({ data: response }) =>
          serializeSubgraph(
            mapGraphApiSubgraphToSubgraph(
              response.subgraph,
              params.authentication.actorId,
            ),
          ) as SerializedSubgraph<PropertyTypeRootType>,
      );
  },

  async getEntityTypesSubgraph(params: {
    authentication: {
      actorId: ActorEntityUuid;
    };
    request: GetEntityTypeSubgraphParams;
  }): Promise<SerializedSubgraph<EntityTypeRootType>> {
    return graphApiClient
      .getEntityTypeSubgraph(params.authentication.actorId, params.request)
      .then(
        ({ data: response }) =>
          serializeSubgraph(
            mapGraphApiSubgraphToSubgraph(
              response.subgraph,
              params.authentication.actorId,
            ),
          ) as SerializedSubgraph<EntityTypeRootType>,
      );
  },

  async getEntitySubgraph(params: {
    authentication: {
      actorId: ActorEntityUuid;
    };
    request: GetEntitySubgraphRequest;
  }): Promise<EntityQueryResponse> {
    return graphApiClient
      .getEntitySubgraph(params.authentication.actorId, params.request)
      .then(({ data: response }) => ({
        subgraph: serializeSubgraph(
          mapGraphApiSubgraphToSubgraph(
            response.subgraph,
            params.authentication.actorId,
          ),
        ) as SerializedSubgraph<SerializedEntityRootType>,
        cursor: response.cursor,
      }));
  },

  async updateDataTypeEmbeddings(
    params: {
      authentication: {
        actorId: ActorEntityUuid;
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
        actorId: ActorEntityUuid;
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
        actorId: ActorEntityUuid;
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
        actorId: ActorEntityUuid;
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
    subgraph: SerializedSubgraph;
  }): Promise<DataTypeWithMetadata[]> {
    return getDataTypes(deserializeSubgraph(params.subgraph));
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubgraphPropertyTypes(params: {
    subgraph: SerializedSubgraph;
  }): Promise<PropertyTypeWithMetadata[]> {
    return getPropertyTypes(deserializeSubgraph(params.subgraph));
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubgraphEntityTypes(params: {
    subgraph: SerializedSubgraph;
  }): Promise<EntityTypeWithMetadata[]> {
    return getEntityTypes(deserializeSubgraph(params.subgraph));
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubgraphEntities(params: {
    subgraph: SerializedSubgraph;
  }): Promise<SerializedEntity[]> {
    return getEntities(deserializeSubgraph(params.subgraph)).map((entity) =>
      entity.toJSON(),
    );
  },

  async createEntity(
    authentication: AuthenticationContext,
    params: CreateEntityParameters,
  ) {
    return Entity.create(graphApiClient, authentication, params);
  },

  async getHashInstanceAdminAccountGroupId(authentication: {
    actorId: ActorEntityUuid;
  }) {
    return getHashInstanceAdminAccountGroupId(
      { graphApi: graphApiClient },
      authentication,
    );
  },
});
