import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { DataTypeRootType, Subgraph } from "@local/hash-subgraph";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-subgraph/stdlib";

import { getDataTypeSubgraphById } from "../../../graph/ontology/primitive/data-type";
import type {
  QueryGetDataTypeArgs,
  QueryQueryDataTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { graphQLContextToImpureGraphContext } from "../util";

export const queryDataTypes: ResolverFn<
  Promise<Subgraph>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryQueryDataTypesArgs
> = async (
  _,
  { constrainsValuesOn, includeArchived },
  { dataSources, authentication },
) => {
  const { graphApi } = dataSources;

  const { data } = await graphApi.getDataTypesByQuery(authentication.actorId, {
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
  });

  const subgraph = mapGraphApiSubgraphToSubgraph<DataTypeRootType>(data);

  return subgraph;
};

export const getDataType: ResolverFn<
  Promise<Subgraph>,
  Record<string, never>,
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (
  _,
  { dataTypeId, constrainsValuesOn, includeArchived },
  graphQLContext,
) =>
  getDataTypeSubgraphById(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
      dataTypeId,
      /** @todo - make these configurable once non-primitive data types are a thing https://app.asana.com/0/1200211978612931/1202464168422955/f */
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn,
      },
      temporalAxes: includeArchived
        ? fullTransactionTimeAxis
        : currentTimeInstantTemporalAxes,
    },
  );
