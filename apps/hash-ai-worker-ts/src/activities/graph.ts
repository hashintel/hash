import {
  getDataTypes,
  getEntities,
  getEntityTypes,
  getPropertyTypes,
} from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  DataTypeWithMetadata,
  EntityId,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  EntityQueryCursor,
  GraphApi,
  UpdateDataTypeEmbeddingParams,
  UpdateEntityTypeEmbeddingParams,
  UpdatePropertyTypeEmbeddingParams,
} from "@local/hash-graph-client";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import {
  queryDataTypes,
  type QueryDataTypesParams,
  type QueryDataTypesResponse,
  queryDataTypeSubgraph,
  type QueryDataTypeSubgraphParams,
  type SerializedQueryDataTypeSubgraphResponse,
  serializeQueryDataTypeSubgraphResponse,
} from "@local/hash-graph-sdk/data-type";
import type {
  CreateEntityParameters,
  QueryEntitiesRequest,
  QueryEntitySubgraphRequest,
  SerializedEntity,
  SerializedEntityRootType,
  SerializedQueryEntitiesResponse,
  SerializedQueryEntitySubgraphResponse,
  SerializedSubgraph,
} from "@local/hash-graph-sdk/entity";
import {
  HashEntity,
  queryEntities,
  queryEntitySubgraph,
  serializeQueryEntitiesResponse,
  serializeQueryEntitySubgraphResponse,
} from "@local/hash-graph-sdk/entity";
import {
  queryEntityTypes,
  type QueryEntityTypesParams,
  type QueryEntityTypesResponse,
  queryEntityTypeSubgraph,
  type QueryEntityTypeSubgraphParams,
  type SerializedQueryEntityTypeSubgraphResponse,
  serializeQueryEntityTypeSubgraphResponse,
} from "@local/hash-graph-sdk/entity-type";
import * as actor from "@local/hash-graph-sdk/principal/actor";
import { getInstanceAdminsTeam } from "@local/hash-graph-sdk/principal/hash-instance-admins";
import {
  queryPropertyTypes,
  type QueryPropertyTypesParams,
  type QueryPropertyTypesResponse,
  queryPropertyTypeSubgraph,
  type QueryPropertyTypeSubgraphParams,
  type SerializedQueryPropertyTypeSubgraphResponse,
  serializeQueryPropertyTypeSubgraphResponse,
} from "@local/hash-graph-sdk/property-type";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

export type EntityQueryResponse = {
  subgraph: SerializedSubgraph<SerializedEntityRootType>;
  cursor?: EntityQueryCursor | null;
};

export const createGraphActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async getSystemMachineIds(params: {
    cursor?: EntityQueryCursor;
    limit?: number;
  }): Promise<{
    machineIds: EntityId[];
    cursor?: EntityQueryCursor | null;
  }> {
    const systemMachine = await actor.getMachineByIdentifier(
      graphApiClient,
      { actorId: publicUserAccountId },
      "h",
    );
    if (!systemMachine) {
      throw new Error("System machine not found");
    }

    const { entities, cursor } = await queryEntities(
      { graphApi: graphApiClient },
      { actorId: systemMachine.id },
      {
        filter: {
          all: [
            {
              equal: [
                { path: ["type", "baseUrl"] },
                { parameter: systemEntityTypes.machine.entityTypeBaseUrl },
              ],
            },
            {
              startsWith: [
                {
                  path: [
                    "properties",
                    systemPropertyTypes.machineIdentifier.propertyTypeBaseUrl,
                  ],
                },
                { parameter: "system-" },
              ],
            },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
        cursor: params.cursor,
        limit: params.limit,
      },
    );

    return {
      machineIds: entities.map((entity) => entity.metadata.recordId.entityId),
      cursor,
    };
  },

  async queryDataTypes(params: {
    authentication: AuthenticationContext;
    request: QueryDataTypesParams;
  }): Promise<QueryDataTypesResponse> {
    return queryDataTypes(
      graphApiClient,
      params.authentication,
      params.request,
    );
  },

  async queryDataTypeSubgraph(params: {
    authentication: AuthenticationContext;
    request: QueryDataTypeSubgraphParams;
  }): Promise<SerializedQueryDataTypeSubgraphResponse> {
    return queryDataTypeSubgraph(
      graphApiClient,
      params.authentication,
      params.request,
    ).then(serializeQueryDataTypeSubgraphResponse);
  },

  async queryPropertyTypes(params: {
    authentication: AuthenticationContext;
    request: QueryPropertyTypesParams;
  }): Promise<QueryPropertyTypesResponse> {
    return queryPropertyTypes(
      graphApiClient,
      params.authentication,
      params.request,
    );
  },

  async queryPropertyTypeSubgraph(params: {
    authentication: AuthenticationContext;
    request: QueryPropertyTypeSubgraphParams;
  }): Promise<SerializedQueryPropertyTypeSubgraphResponse> {
    return queryPropertyTypeSubgraph(
      graphApiClient,
      params.authentication,
      params.request,
    ).then(serializeQueryPropertyTypeSubgraphResponse);
  },

  async queryEntityTypes(params: {
    authentication: AuthenticationContext;
    request: QueryEntityTypesParams;
  }): Promise<QueryEntityTypesResponse> {
    return queryEntityTypes(
      graphApiClient,
      params.authentication,
      params.request,
    );
  },

  async queryEntityTypeSubgraph(params: {
    authentication: AuthenticationContext;
    request: QueryEntityTypeSubgraphParams;
  }): Promise<SerializedQueryEntityTypeSubgraphResponse> {
    return queryEntityTypeSubgraph(
      graphApiClient,
      params.authentication,
      params.request,
    ).then(serializeQueryEntityTypeSubgraphResponse);
  },

  async queryEntities(params: {
    authentication: {
      actorId: ActorEntityUuid;
    };
    request: QueryEntitiesRequest;
  }): Promise<SerializedQueryEntitiesResponse> {
    return queryEntities(
      { graphApi: graphApiClient },
      params.authentication,
      params.request,
    ).then(serializeQueryEntitiesResponse);
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
