import type { EntityTypeRootType, Subgraph } from "@blockprotocol/graph";
import type {
  ActorEntityUuid,
  ClosedEntityType,
  ClosedMultiEntityType,
  EntityTypeWithMetadata,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type {
  DistributiveOmit,
  DistributiveReplaceProperties,
  ExclusiveUnion,
} from "@local/advanced-types/distribute";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  ClosedEntityType as ClosedEntityTypeGraphApi,
  ClosedMultiEntityTypeMap as ClosedMultiEntityTypeMapGraphApi,
  EntityTypeResolveDefinitions as EntityTypeResolveDefinitionsGraphApi,
  EntityTypeWithMetadata as EntityTypeWithMetadataGraphApi,
  GetClosedMultiEntityTypesParams as GetClosedMultiEntityTypesParamsGraphApi,
  GetClosedMultiEntityTypesResponse as GetClosedMultiEntityTypesResponseGraphApi,
  GraphApi,
  HasPermissionForEntityTypesParams,
  QueryEntityTypesParams as QueryEntityTypesParamsGraphApi,
  QueryEntityTypesResponse as QueryEntityTypesResponseGraphApi,
  QueryEntityTypeSubgraphParams as QueryEntityTypeSubgraphParamsGraphApi,
  QueryEntityTypeSubgraphResponse as QueryEntityTypeSubgraphResponseGraphApi,
} from "@local/hash-graph-client";
import type { ActionName } from "@rust/hash-graph-authorization/types";

import type { AuthenticationContext } from "./authentication-context.js";
import type { HashEntity, SerializedSubgraph } from "./entity.js";
import type {
  ClosedMultiEntityTypesDefinitions,
  EntityTypeResolveDefinitions,
} from "./ontology.js";
import {
  deserializeGraphVertices,
  mapGraphApiSubgraphToSubgraph,
  serializeGraphVertices,
} from "./subgraph.js";

export const hasPermissionForEntityTypes = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  params: Subtype<
    HasPermissionForEntityTypesParams,
    {
      entityTypeIds: VersionedUrl[];
      action: Subtype<
        ActionName,
        | "viewEntityType"
        | "updateEntityType"
        | "archiveEntityType"
        | "instantiate"
      >;
    }
  >,
): Promise<VersionedUrl[]> =>
  graphAPI
    .hasPermissionForEntityTypes(authentication.actorId, params)
    .then(({ data: permitted }) => permitted as VersionedUrl[]);

export type QueryEntityTypesParams = Omit<
  QueryEntityTypesParamsGraphApi,
  "after"
> & {
  after?: VersionedUrl;
};

export type QueryEntityTypesResponse = Omit<
  QueryEntityTypesResponseGraphApi,
  | "closedEntityTypes"
  | "entityTypes"
  | "cursor"
  | "definitions"
  | "webIds"
  | "editionCreatedByIds"
> & {
  closedEntityTypes?: ClosedEntityType[];
  entityTypes: EntityTypeWithMetadata[];
  cursor?: VersionedUrl;
  definitions?: EntityTypeResolveDefinitions;
  webIds?: Record<WebId, number>;
  editionCreatedByIds?: Record<ActorEntityUuid, number>;
};

const mapGraphApiEntityTypesToEntityTypes = (
  entityTypes: EntityTypeWithMetadataGraphApi[],
) => entityTypes as unknown as EntityTypeWithMetadata[];

export const mapGraphApiClosedEntityTypesToClosedEntityTypes = (
  closedEntityTypes: ClosedEntityTypeGraphApi[],
) => closedEntityTypes as ClosedEntityType[];

export const queryEntityTypes = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: QueryEntityTypesParams,
): Promise<QueryEntityTypesResponse> =>
  graphApi
    .queryEntityTypes(authentication.actorId, params)
    .then(({ data: response }) => ({
      ...response,
      closedEntityTypes: response.closedEntityTypes
        ? mapGraphApiClosedEntityTypesToClosedEntityTypes(
            response.closedEntityTypes,
          )
        : undefined,
      definitions: response.definitions as
        | EntityTypeResolveDefinitions
        | undefined,
      entityTypes: mapGraphApiEntityTypesToEntityTypes(response.entityTypes),
      cursor: response.cursor as VersionedUrl | undefined,
      webIds: response.webIds as Record<WebId, number> | undefined,
      editionCreatedByIds: response.editionCreatedByIds as
        | Record<ActorEntityUuid, number>
        | undefined,
    }));

export type QueryEntityTypeSubgraphParams = ExclusiveUnion<
  DistributiveReplaceProperties<
    QueryEntityTypeSubgraphParamsGraphApi,
    {
      after?: VersionedUrl;
    }
  >
>;

export type QueryEntityTypeSubgraphResponse = DistributiveOmit<
  QueryEntityTypeSubgraphResponseGraphApi,
  "subgraph" | "cursor" | "webIds" | "editionCreatedByIds"
> & {
  subgraph: Subgraph<EntityTypeRootType, HashEntity>;
  cursor?: VersionedUrl;
  webIds?: Record<WebId, number>;
  editionCreatedByIds?: Record<ActorEntityUuid, number>;
};

export type SerializedQueryEntityTypeSubgraphResponse = DistributiveOmit<
  QueryEntityTypeSubgraphResponse,
  "subgraph"
> & {
  subgraph: SerializedSubgraph<EntityTypeRootType>;
};

export const queryEntityTypeSubgraph = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: QueryEntityTypeSubgraphParams,
): Promise<QueryEntityTypeSubgraphResponse> =>
  graphApi
    .queryEntityTypeSubgraph(authentication.actorId, params)
    .then(({ data: response }) => ({
      ...response,
      subgraph: mapGraphApiSubgraphToSubgraph(response.subgraph),
      cursor: response.cursor as VersionedUrl | undefined,
      webIds: response.webIds as Record<WebId, number> | undefined,
      editionCreatedByIds: response.editionCreatedByIds as
        | Record<ActorEntityUuid, number>
        | undefined,
    }));

export const serializeQueryEntityTypeSubgraphResponse = (
  response: QueryEntityTypeSubgraphResponse,
): SerializedQueryEntityTypeSubgraphResponse => ({
  ...response,
  subgraph: {
    roots: response.subgraph.roots,
    vertices: serializeGraphVertices(response.subgraph.vertices),
    edges: response.subgraph.edges,
    temporalAxes: response.subgraph.temporalAxes,
  },
});

export const deserializeQueryEntityTypeSubgraphResponse = (
  response: SerializedQueryEntityTypeSubgraphResponse,
): QueryEntityTypeSubgraphResponse => ({
  ...response,
  subgraph: {
    roots: response.subgraph.roots,
    vertices: deserializeGraphVertices(response.subgraph.vertices),
    edges: response.subgraph.edges,
    temporalAxes: response.subgraph.temporalAxes,
  },
});

export const getEntityTypeById = async (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: Omit<
    QueryEntityTypesParams,
    "filter" | "includeCount" | "after" | "limit"
  > & { entityTypeId: VersionedUrl },
): Promise<EntityTypeWithMetadata | null> => {
  const { entityTypeId, ...rest } = params;

  const { entityTypes } = await queryEntityTypes(graphApi, authentication, {
    ...rest,
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
    },
  });

  return entityTypes[0] ?? null;
};

export const getEntityTypeSubgraphById = async (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: DistributiveOmit<
    QueryEntityTypeSubgraphParamsGraphApi,
    "filter" | "includeCount" | "after" | "limit"
  > & { entityTypeId: VersionedUrl },
): Promise<Subgraph<EntityTypeRootType> | null> => {
  const { entityTypeId, ...rest } = params;

  const { subgraph } = await queryEntityTypeSubgraph(graphApi, authentication, {
    ...rest,
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
    },
  });

  if (subgraph.roots.length === 0) {
    return null;
  }

  return subgraph;
};

export type GetClosedMultiEntityTypesParams = Omit<
  GetClosedMultiEntityTypesParamsGraphApi,
  "entityTypeIds"
> & {
  entityTypeIds: VersionedUrl[][];
};

export type ClosedMultiEntityTypeMap = Omit<
  ClosedMultiEntityTypeMapGraphApi,
  "inner" | "schema"
> & {
  inner?: Record<VersionedUrl, ClosedMultiEntityTypeMap>;
  schema: ClosedMultiEntityType;
};

export const mapGraphApiClosedMultiEntityTypeMapToClosedMultiEntityTypeMap = (
  closedMultiEntityTypeMap: Record<
    VersionedUrl,
    ClosedMultiEntityTypeMapGraphApi
  >,
) => closedMultiEntityTypeMap as Record<VersionedUrl, ClosedMultiEntityTypeMap>;

export type GetClosedMultiEntityTypesResponse = Omit<
  GetClosedMultiEntityTypesResponseGraphApi,
  "entityTypes" | "definitions"
> & {
  entityTypes: Record<VersionedUrl, ClosedMultiEntityTypeMap>;
  definitions?: ClosedMultiEntityTypesDefinitions;
};

export const mapGraphApiEntityTypeResolveDefinitionsToEntityTypeResolveDefinitions =
  (entityTypeResolveDefinitions: EntityTypeResolveDefinitionsGraphApi) =>
    entityTypeResolveDefinitions as EntityTypeResolveDefinitions;

export const getClosedMultiEntityTypes = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: GetClosedMultiEntityTypesParams,
): Promise<GetClosedMultiEntityTypesResponse> =>
  graphApi
    .getClosedMultiEntityTypes(authentication.actorId, params)
    .then(({ data: response }) => ({
      entityTypes:
        mapGraphApiClosedMultiEntityTypeMapToClosedMultiEntityTypeMap(
          response.entityTypes,
        ),
      definitions: response.definitions
        ? mapGraphApiEntityTypeResolveDefinitionsToEntityTypeResolveDefinitions(
            response.definitions,
          )
        : undefined,
    }));
