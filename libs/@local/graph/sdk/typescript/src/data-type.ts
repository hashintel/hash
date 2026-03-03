import type { DataTypeRootType, Subgraph } from "@blockprotocol/graph";
import type {
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  DistributiveOmit,
  DistributiveReplaceProperties,
  ExclusiveUnion,
} from "@local/advanced-types/distribute";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  DataTypeConversionTargets as GraphApiDataTypeConversionTargets,
  DataTypeWithMetadata as DataTypeWithMetadataGraphApi,
  GraphApi,
  HasPermissionForDataTypesParams,
  QueryDataTypesParams as QueryDataTypesParamsGraphApi,
  QueryDataTypesResponse as QueryDataTypesResponseGraphApi,
  QueryDataTypeSubgraphParams as QueryDataTypeSubgraphParamsGraphApi,
  QueryDataTypeSubgraphResponse as QueryDataTypeSubgraphResponseGraphApi,
} from "@local/hash-graph-client";
import type { ActionName } from "@rust/hash-graph-authorization/types";

import type { AuthenticationContext } from "./authentication-context.js";
import type { HashEntity, SerializedSubgraph } from "./entity.js";
import type { DataTypeConversionTargets } from "./ontology.js";
import {
  deserializeGraphVertices,
  mapGraphApiSubgraphToSubgraph,
  serializeGraphVertices,
} from "./subgraph.js";

export const hasPermissionForDataTypes = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  params: Subtype<
    HasPermissionForDataTypesParams,
    {
      dataTypeIds: VersionedUrl[];
      action: Subtype<
        ActionName,
        "viewDataType" | "updateDataType" | "archiveDataType"
      >;
    }
  >,
): Promise<VersionedUrl[]> =>
  graphAPI
    .hasPermissionForDataTypes(authentication.actorId, params)
    .then(({ data: permitted }) => permitted as VersionedUrl[]);

export type QueryDataTypesParams = Omit<
  QueryDataTypesParamsGraphApi,
  "after"
> & {
  after?: VersionedUrl;
};

export type QueryDataTypesResponse = Omit<
  QueryDataTypesResponseGraphApi,
  "dataTypes" | "cursor"
> & {
  dataTypes: DataTypeWithMetadata[];
  cursor?: VersionedUrl;
};

const mapGraphApiDataTypesToDataTypes = (
  dataTypes: DataTypeWithMetadataGraphApi[],
) => dataTypes as unknown as DataTypeWithMetadata[];

export const queryDataTypes = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: QueryDataTypesParams,
): Promise<QueryDataTypesResponse> =>
  graphApi
    .queryDataTypes(authentication.actorId, params)
    .then(({ data: response }) => ({
      ...response,
      dataTypes: mapGraphApiDataTypesToDataTypes(response.dataTypes),
      cursor: response.cursor as VersionedUrl | undefined,
    }));

export type QueryDataTypeSubgraphParams = ExclusiveUnion<
  DistributiveReplaceProperties<
    QueryDataTypeSubgraphParamsGraphApi,
    {
      after?: VersionedUrl;
    }
  >
>;

export type QueryDataTypeSubgraphResponse = DistributiveOmit<
  QueryDataTypeSubgraphResponseGraphApi,
  "subgraph" | "cursor"
> & {
  subgraph: Subgraph<DataTypeRootType, HashEntity>;
  cursor?: VersionedUrl;
};

export type SerializedQueryDataTypeSubgraphResponse = DistributiveOmit<
  QueryDataTypeSubgraphResponse,
  "subgraph"
> & {
  subgraph: SerializedSubgraph<DataTypeRootType>;
};

export const queryDataTypeSubgraph = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: QueryDataTypeSubgraphParams,
): Promise<QueryDataTypeSubgraphResponse> =>
  graphApi
    .queryDataTypeSubgraph(authentication.actorId, params)
    .then(({ data: response }) => ({
      ...response,
      subgraph: mapGraphApiSubgraphToSubgraph(response.subgraph),
      cursor: response.cursor as VersionedUrl | undefined,
    }));

export const serializeQueryDataTypeSubgraphResponse = (
  response: QueryDataTypeSubgraphResponse,
): SerializedQueryDataTypeSubgraphResponse => ({
  ...response,
  subgraph: {
    roots: response.subgraph.roots,
    vertices: serializeGraphVertices(response.subgraph.vertices),
    edges: response.subgraph.edges,
    temporalAxes: response.subgraph.temporalAxes,
  },
});

export const deserializeQueryDataTypeSubgraphResponse = (
  response: SerializedQueryDataTypeSubgraphResponse,
): QueryDataTypeSubgraphResponse => ({
  ...response,
  subgraph: {
    roots: response.subgraph.roots,
    vertices: deserializeGraphVertices(response.subgraph.vertices),
    edges: response.subgraph.edges,
    temporalAxes: response.subgraph.temporalAxes,
  },
});

const mapGraphApiDataTypeConversions = (
  conversions: Record<
    string,
    Record<string, GraphApiDataTypeConversionTargets>
  >,
) =>
  conversions as Record<
    VersionedUrl,
    Record<VersionedUrl, DataTypeConversionTargets>
  >;

export const findDataTypeConversionTargets = (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: { dataTypeIds: VersionedUrl[] },
): Promise<
  Record<VersionedUrl, Record<VersionedUrl, DataTypeConversionTargets>>
> =>
  graphApi
    .findDataTypeConversionTargets(authentication.actorId, params)
    .then(({ data }) => mapGraphApiDataTypeConversions(data.conversions));

export const getDataTypeById = async (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: Omit<
    QueryDataTypesParams,
    "filter" | "includeCount" | "after" | "limit"
  > & { dataTypeId: VersionedUrl },
): Promise<DataTypeWithMetadata | null> => {
  const { dataTypeId, ...rest } = params;

  const { dataTypes } = await queryDataTypes(graphApi, authentication, {
    ...rest,
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: dataTypeId }],
    },
  });

  return dataTypes[0] ?? null;
};

export const getDataTypeSubgraphById = async (
  graphApi: GraphApi,
  authentication: AuthenticationContext,
  params: DistributiveOmit<
    QueryDataTypeSubgraphParamsGraphApi,
    "filter" | "includeCount" | "after" | "limit"
  > & { dataTypeId: VersionedUrl },
): Promise<Subgraph<DataTypeRootType> | null> => {
  const { dataTypeId, ...rest } = params;

  const { subgraph } = await queryDataTypeSubgraph(graphApi, authentication, {
    ...rest,
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: dataTypeId }],
    },
  });

  if (subgraph.roots.length === 0) {
    return null;
  }

  return subgraph;
};
