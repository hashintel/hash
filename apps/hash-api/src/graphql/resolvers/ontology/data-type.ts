import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  mapGraphApiSubgraphToSubgraph,
  serializeSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  DataTypeRootType,
  SerializedSubgraph,
} from "@local/hash-subgraph";
import { getDataTypeSubgraphById } from "../../../graph/ontology/primitive/data-type";
import type {
  QueryGetDataTypeArgs,
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
  { constrainsValuesOn, includeArchived },
  { dataSources, authentication },
) => {
  const { graphApi } = dataSources;

  const { data: response } = await graphApi.getDataTypeSubgraph(
    authentication.actorId,
    {
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
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
        /**
         * @see https://linear.app/hash/issue/H-2994
         * @todo - make these configurable once non-primitive data types are a thing.
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
