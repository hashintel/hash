import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { DataTypeRootType, Subgraph } from "@local/hash-subgraph";

import { publicUserAccountId } from "../../../graph";
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
> = async (_, { constrainsValuesOn }, { dataSources, user }) => {
  const { graphApi } = dataSources;

  const { data: dataTypeSubgraph } = await graphApi.getDataTypesByQuery(
    user.accountId,
    {
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn,
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  return dataTypeSubgraph as Subgraph<DataTypeRootType>;
};

export const getDataType: ResolverFn<
  Promise<Subgraph>,
  {},
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (_, { dataTypeId, constrainsValuesOn }, { dataSources, user }) =>
  getDataTypeSubgraphById(
    dataSourcesToImpureGraphContext(dataSources),
    { actorId: user?.accountId ?? publicUserAccountId },
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
