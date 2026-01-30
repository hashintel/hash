import type { PropertyTypeRootType, Subgraph } from "@blockprotocol/graph";
import type {
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  DistributiveOmit,
  DistributiveReplaceProperties,
  ExclusiveUnion,
} from "@local/advanced-types/distribute";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  GraphApi,
  HasPermissionForPropertyTypesParams,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataGraphApi,
  QueryPropertyTypesParams as QueryPropertyTypesParamsGraphApi,
  QueryPropertyTypesResponse as QueryPropertyTypesResponseGraphApi,
  QueryPropertyTypeSubgraphParams as QueryPropertyTypeSubgraphParamsGraphApi,
  QueryPropertyTypeSubgraphResponse as QueryPropertyTypeSubgraphResponseGraphApi,
} from "@local/hash-graph-client";
import type { ActionName } from "@rust/hash-graph-authorization/types";

import type { AuthenticationContext } from "./authentication-context.js";
import type { HashEntity, SerializedSubgraph } from "./entity.js";
import {
  deserializeGraphVertices,
  mapGraphApiSubgraphToSubgraph,
  serializeGraphVertices,
} from "./subgraph.js";

export const hasPermissionForPropertyTypes = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  params: Subtype<
    HasPermissionForPropertyTypesParams,
    {
      propertyTypeIds: VersionedUrl[];
      action: Subtype<
        ActionName,
        "viewPropertyType" | "updatePropertyType" | "archivePropertyType"
      >;
    }
  >,
): Promise<VersionedUrl[]> =>
  graphAPI
    .hasPermissionForPropertyTypes(authentication.actorId, params)
    .then(({ data: permitted }) => permitted as VersionedUrl[]);

export type QueryPropertyTypesParams = Omit<
  QueryPropertyTypesParamsGraphApi,
  "after"
> & {
  after?: VersionedUrl;
};

export type QueryPropertyTypesResponse = Omit<
  QueryPropertyTypesResponseGraphApi,
  "propertyTypes" | "cursor"
> & {
  propertyTypes: PropertyTypeWithMetadata[];
  cursor?: VersionedUrl;
};

const mapGraphApiPropertyTypesToPropertyTypes = (
  propertyTypes: PropertyTypeWithMetadataGraphApi[],
) => propertyTypes as unknown as PropertyTypeWithMetadata[];

export const queryPropertyTypes = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: QueryPropertyTypesParams,
): Promise<QueryPropertyTypesResponse> =>
  graphApi
    .queryPropertyTypes(authentication.actorId, params)
    .then(({ data: response }) => ({
      ...response,
      propertyTypes: mapGraphApiPropertyTypesToPropertyTypes(
        response.propertyTypes,
      ),
      cursor: response.cursor as VersionedUrl | undefined,
    }));

export type QueryPropertyTypeSubgraphParams = ExclusiveUnion<
  DistributiveReplaceProperties<
    QueryPropertyTypeSubgraphParamsGraphApi,
    {
      after?: VersionedUrl;
    }
  >
>;

export type QueryPropertyTypeSubgraphResponse = DistributiveOmit<
  QueryPropertyTypeSubgraphResponseGraphApi,
  "subgraph" | "cursor"
> & {
  subgraph: Subgraph<PropertyTypeRootType, HashEntity>;
  cursor?: VersionedUrl;
};

export type SerializedQueryPropertyTypeSubgraphResponse = DistributiveOmit<
  QueryPropertyTypeSubgraphResponse,
  "subgraph"
> & {
  subgraph: SerializedSubgraph<PropertyTypeRootType>;
};

export const queryPropertyTypeSubgraph = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: QueryPropertyTypeSubgraphParams,
): Promise<QueryPropertyTypeSubgraphResponse> =>
  graphApi
    .queryPropertyTypeSubgraph(authentication.actorId, params)
    .then(({ data: response }) => ({
      ...response,
      subgraph: mapGraphApiSubgraphToSubgraph(response.subgraph),
      cursor: response.cursor as VersionedUrl | undefined,
    }));

export const serializeQueryPropertyTypeSubgraphResponse = (
  response: QueryPropertyTypeSubgraphResponse,
): SerializedQueryPropertyTypeSubgraphResponse => ({
  ...response,
  subgraph: {
    roots: response.subgraph.roots,
    vertices: serializeGraphVertices(response.subgraph.vertices),
    edges: response.subgraph.edges,
    temporalAxes: response.subgraph.temporalAxes,
  },
});

export const deserializeQueryPropertyTypeSubgraphResponse = (
  response: SerializedQueryPropertyTypeSubgraphResponse,
): QueryPropertyTypeSubgraphResponse => ({
  ...response,
  subgraph: {
    roots: response.subgraph.roots,
    vertices: deserializeGraphVertices(response.subgraph.vertices),
    edges: response.subgraph.edges,
    temporalAxes: response.subgraph.temporalAxes,
  },
});

export const getPropertyTypeById = async (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: Omit<
    QueryPropertyTypesParams,
    "filter" | "includeCount" | "after" | "limit"
  > & { propertyTypeId: VersionedUrl },
): Promise<PropertyTypeWithMetadata | null> => {
  const { propertyTypeId, ...rest } = params;

  const { propertyTypes } = await queryPropertyTypes(graphApi, authentication, {
    ...rest,
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: propertyTypeId }],
    },
  });

  return propertyTypes[0] ?? null;
};

export const getPropertyTypeSubgraphById = async (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: DistributiveOmit<
    QueryPropertyTypeSubgraphParamsGraphApi,
    "filter" | "includeCount" | "after" | "limit"
  > & { propertyTypeId: VersionedUrl },
): Promise<Subgraph<PropertyTypeRootType> | null> => {
  const { propertyTypeId, ...rest } = params;

  const { subgraph } = await queryPropertyTypeSubgraph(
    graphApi,
    authentication,
    {
      ...rest,
      filter: {
        equal: [{ path: ["versionedUrl"] }, { parameter: propertyTypeId }],
      },
    },
  );

  if (subgraph.roots.length === 0) {
    return null;
  }

  return subgraph;
};
