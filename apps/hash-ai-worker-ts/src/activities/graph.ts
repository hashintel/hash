import {
  getDataTypes,
  getEntities,
  getEntityTypes,
  getPropertyTypes,
} from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  EntityQueryCursor,
  GraphApi,
  UpdateDataTypeEmbeddingParams,
  UpdateEntityEmbeddingsParams,
  UpdateEntityTypeEmbeddingParams,
  UpdatePropertyTypeEmbeddingParams,
} from "@local/hash-graph-client";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import {
  queryDataTypeSubgraph,
  type QueryDataTypeSubgraphParams,
  type SerializedQueryDataTypeSubgraphResponse,
  serializeQueryDataTypeSubgraphResponse,
} from "@local/hash-graph-sdk/data-type";
import type {
  CreateEntityParameters,
  QueryEntitySubgraphRequest,
  SerializedEntity,
  SerializedEntityRootType,
  SerializedQueryEntitySubgraphResponse,
  SerializedSubgraph,
} from "@local/hash-graph-sdk/entity";
import {
  HashEntity,
  queryEntities,
  queryEntitySubgraph,
  serializeQueryEntitySubgraphResponse,
} from "@local/hash-graph-sdk/entity";
import {
  queryEntityTypeSubgraph,
  type QueryEntityTypeSubgraphParams,
  type SerializedQueryEntityTypeSubgraphResponse,
  serializeQueryEntityTypeSubgraphResponse,
} from "@local/hash-graph-sdk/entity-type";
import { getInstanceAdminsTeam } from "@local/hash-graph-sdk/principal/hash-instance-admins";
import {
  queryPropertyTypeSubgraph,
  type QueryPropertyTypeSubgraphParams,
  type SerializedQueryPropertyTypeSubgraphResponse,
  serializeQueryPropertyTypeSubgraphResponse,
} from "@local/hash-graph-sdk/property-type";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

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
    return queryEntities(
      { graphApi: graphApiClient },
      { actorId: publicUserAccountId },
      {
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
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    ).then(({ entities }) =>
      entities.map((entity) => {
        const entity_uuid = extractEntityUuidFromEntityId(
          entity.metadata.recordId.entityId,
        );
        return entity_uuid as ActorEntityUuid;
      }),
    );
  },

  async queryDataTypesSubgraph(params: {
    authentication: AuthenticationContext;
    request: QueryDataTypeSubgraphParams;
  }): Promise<SerializedQueryDataTypeSubgraphResponse> {
    return queryDataTypeSubgraph(
      graphApiClient,
      params.authentication,
      params.request,
    ).then(serializeQueryDataTypeSubgraphResponse);
  },

  async queryPropertyTypesSubgraph(params: {
    authentication: AuthenticationContext;
    request: QueryPropertyTypeSubgraphParams;
  }): Promise<SerializedQueryPropertyTypeSubgraphResponse> {
    return queryPropertyTypeSubgraph(
      graphApiClient,
      params.authentication,
      params.request,
    ).then(serializeQueryPropertyTypeSubgraphResponse);
  },

  async queryEntityTypesSubgraph(params: {
    authentication: AuthenticationContext;
    request: QueryEntityTypeSubgraphParams;
  }): Promise<SerializedQueryEntityTypeSubgraphResponse> {
    return queryEntityTypeSubgraph(
      graphApiClient,
      params.authentication,
      params.request,
    ).then(serializeQueryEntityTypeSubgraphResponse);
  },

  async queryEntitySubgraph(params: {
    authentication: {
      actorId: ActorEntityUuid;
    };
    request: QueryEntitySubgraphRequest;
  }): Promise<SerializedQueryEntitySubgraphResponse> {
    return queryEntitySubgraph(
      { graphApi: graphApiClient },
      params.authentication,
      params.request,
    ).then(serializeQueryEntitySubgraphResponse);
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
    return getEntities(deserializeSubgraph(params.subgraph), false).map(
      (entity) => entity.toJSON(),
    );
  },

  async createEntity(
    authentication: AuthenticationContext,
    params: CreateEntityParameters,
  ) {
    return HashEntity.create(graphApiClient, authentication, params);
  },

  async getHashInstanceAdminAccountGroupId(authentication: {
    actorId: ActorEntityUuid;
  }) {
    return getInstanceAdminsTeam(
      { graphApi: graphApiClient },
      authentication,
    ).then(({ id }) => id);
  },
});
