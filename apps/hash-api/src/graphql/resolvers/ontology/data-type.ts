import type { DataTypeRootType } from "@blockprotocol/graph";
import type {
  DataTypeWithMetadata,
  OntologyTemporalMetadata,
} from "@blockprotocol/type-system";
import type { UserPermissionsOnDataType } from "@local/hash-graph-sdk/authorization";
import type { SerializedSubgraph } from "@local/hash-graph-sdk/entity";
import type { DataTypeFullConversionTargetsMap } from "@local/hash-graph-sdk/ontology";
import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  mapGraphApiSubgraphToSubgraph,
  serializeSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";

import {
  archiveDataType,
  checkPermissionsOnDataType,
  createDataType,
  getDataTypeConversionTargets,
  getDataTypeSubgraphById,
  unarchiveDataType,
  updateDataType,
} from "../../../graph/ontology/primitive/data-type";
import type {
  MutationArchiveDataTypeArgs,
  MutationCreateDataTypeArgs,
  MutationUnarchiveDataTypeArgs,
  MutationUpdateDataTypeArgs,
  QueryCheckUserPermissionsOnDataTypeArgs,
  QueryGetDataTypeArgs,
  QueryGetDataTypeConversionTargetsArgs,
  QueryQueryDataTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { graphQLContextToImpureGraphContext } from "../util";

export const queryDataTypes: ResolverFn<
  Promise<SerializedSubgraph>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryQueryDataTypesArgs
> = async (
  _,
  { constrainsValuesOn, filter, includeArchived, inheritsFrom, latestOnly },
  { dataSources, authentication },
) => {
  const { graphApi } = dataSources;

  const latestOnlyFilter = {
    equal: [{ path: ["version"] }, { parameter: "latest" }],
  };

  const { data: response } = await graphApi.getDataTypeSubgraph(
    authentication.actorId,
    {
      filter: latestOnly
        ? filter
          ? { all: [filter, latestOnlyFilter] }
          : latestOnlyFilter
        : (filter ?? { all: [] }),
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        inheritsFrom,
        constrainsValuesOn,
      },
      temporalAxes: includeArchived
        ? fullTransactionTimeAxis
        : currentTimeInstantTemporalAxes,
      includeDrafts: false,
    },
  );

  return serializeSubgraph(
    mapGraphApiSubgraphToSubgraph<DataTypeRootType>(
      response.subgraph,
      authentication.actorId,
    ),
  );
};

export const getDataType: ResolverFn<
  Promise<SerializedSubgraph>,
  Record<string, never>,
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (
  _,
  { dataTypeId, constrainsValuesOn, includeArchived },
  graphQLContext,
) =>
  serializeSubgraph(
    await getDataTypeSubgraphById(
      graphQLContextToImpureGraphContext(graphQLContext),
      graphQLContext.authentication,
      {
        dataTypeId,
        /** @todo - make these configurable once non-primitive data types are a thing
         * @see https://linear.app/hash/issue/H-2994
         */
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          constrainsValuesOn,
        },
        temporalAxes: includeArchived
          ? fullTransactionTimeAxis
          : currentTimeInstantTemporalAxes,
      },
    ),
  );

export const getDataTypeConversionTargetsResolver: ResolverFn<
  Promise<DataTypeFullConversionTargetsMap>,
  Record<string, never>,
  GraphQLContext,
  QueryGetDataTypeConversionTargetsArgs
> = async (_, { dataTypeIds }, graphQLContext) => {
  return await getDataTypeConversionTargets(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    { dataTypeIds },
  );
};

export const createDataTypeResolver: ResolverFn<
  Promise<DataTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateDataTypeArgs
> = async (_, params, { dataSources, authentication, provenance }) => {
  const { webId, conversions, dataType } = params;

  const createdDataType = await createDataType(
    {
      ...dataSources,
      provenance,
    },
    authentication,
    {
      webId,
      schema: dataType,
      conversions: conversions ?? {},
    },
  );

  return createdDataType;
};

export const updateDataTypeResolver: ResolverFn<
  Promise<DataTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateDataTypeArgs
> = async (_, params, graphQLContext) =>
  updateDataType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
      dataTypeId: params.dataTypeId,
      schema: params.dataType,
      conversions: {},
    },
  );

export const archiveDataTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchiveDataTypeArgs
> = async (_, params, graphQLContext) =>
  archiveDataType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    params,
  );

export const unarchiveDataTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUnarchiveDataTypeArgs
> = async (_, params, graphQLContext) =>
  unarchiveDataType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    params,
  );

export const checkUserPermissionsOnDataTypeResolver: ResolverFn<
  Promise<UserPermissionsOnDataType>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryCheckUserPermissionsOnDataTypeArgs
> = async (_, params, { dataSources, authentication, provenance }) =>
  checkPermissionsOnDataType(
    { ...dataSources, provenance },
    authentication,
    params,
  );
