import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { Subgraph } from "@local/hash-subgraph";
import { DataTypeRootType } from "@local/hash-subgraph";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-subgraph/stdlib";

import { getDataTypeSubgraphById } from "../../../graph/ontology/primitive/data-type";
import type {
  QueryGetDataTypeArgs,
  QueryQueryDataTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { dataSourcesToImpureGraphContext } from "../util";

export const queryDataTypes: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryQueryDataTypesArgs
> = async (_, { constrainsValuesOn }, { dataSources, authentication }) => {
  const { graphApi } = dataSources;

  const { data } = await graphApi.getDataTypesByQuery(authentication.actorId, {
    filter: {
      equal: [{ path: ["version"] }, { parameter: "latest" }],
    },
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      constrainsValuesOn,
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: false,
  });

  const subgraph = mapGraphApiSubgraphToSubgraph<DataTypeRootType>(data);

  return subgraph;
};

export const getDataType: ResolverFn<
  Promise<Subgraph>,
  {},
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (
  _,
  { dataTypeId, constrainsValuesOn },
  { dataSources, authentication },
) =>
  getDataTypeSubgraphById(
    dataSourcesToImpureGraphContext(dataSources),
    authentication,
    {
      dataTypeId,
      /** @todo - make these configurable once non-primitive data types are a thing https://app.asana.com/0/1200211978612931/1202464168422955/f */
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn,
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );
