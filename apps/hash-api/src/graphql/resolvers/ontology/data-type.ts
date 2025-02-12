import type { DataTypeConversionsMap } from "@local/hash-isomorphic-utils/data-types";
import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  mapGraphApiSubgraphToSubgraph,
  serializeSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { UserPermissionsOnDataType } from "@local/hash-isomorphic-utils/types";
import type {
  DataTypeRootType,
  SerializedSubgraph,
} from "@local/hash-subgraph";

import {
  checkPermissionsOnDataType,
  getDataTypeConversionTargets,
  getDataTypeSubgraphById,
} from "../../../graph/ontology/primitive/data-type";
import type {
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
        : { all: [] },
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
  Promise<DataTypeConversionsMap>,
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
