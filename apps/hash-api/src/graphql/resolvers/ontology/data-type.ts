import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { Subgraph } from "@local/hash-subgraph";
import { assertDataTypeRootedSubgraph,mapGraphApiSubgraphToSubgraph  } from "@local/hash-subgraph/stdlib";

import { getDataTypeSubgraphById } from "../../../graph/ontology/primitive/data-type";
import {
  QueryGetDataTypeArgs,
  QueryQueryDataTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
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
  });

  const subgraph = mapGraphApiSubgraphToSubgraph(data);

  assertDataTypeRootedSubgraph(subgraph);

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
