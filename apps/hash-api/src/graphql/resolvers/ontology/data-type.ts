import { DataTypeRootType, Subgraph } from "@local/hash-subgraph";

import {
  QueryGetDataTypeArgs,
  QueryQueryDataTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";

export const queryDataTypes: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryQueryDataTypesArgs
> = async (_, { constrainsValuesOn }, { dataSources }) => {
  const { graphApi } = dataSources;

  const { data: dataTypeSubgraph } = await graphApi.getDataTypesByQuery({
    filter: {
      equal: [{ path: ["version"] }, { parameter: "latest" }],
    },
    graphResolveDepths: {
      inheritsFrom: { outgoing: 0 },
      constrainsValuesOn,
      constrainsPropertiesOn: { outgoing: 0 },
      constrainsLinksOn: { outgoing: 0 },
      constrainsLinkDestinationsOn: { outgoing: 0 },
      isOfType: { outgoing: 0 },
      hasLeftEntity: { incoming: 0, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 0 },
    },
    temporalAxes: {
      pinned: {
        axis: "transactionTime",
        timestamp: null,
      },
      variable: {
        axis: "decisionTime",
        interval: {
          start: null,
          end: null,
        },
      },
    },
  });

  return dataTypeSubgraph as Subgraph<DataTypeRootType>;
};

export const getDataType: ResolverFn<
  Promise<Subgraph>,
  {},
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (_, { dataTypeId, constrainsValuesOn }, { dataSources }) => {
  const { graphApi } = dataSources;

  const { data: dataTypeSubgraph } = await graphApi.getDataTypesByQuery({
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: dataTypeId }],
    },
    /** @todo - make these configurable once non-primitive data types are a thing https://app.asana.com/0/1200211978612931/1202464168422955/f */
    graphResolveDepths: {
      inheritsFrom: { outgoing: 0 },
      constrainsValuesOn,
      constrainsPropertiesOn: { outgoing: 0 },
      constrainsLinksOn: { outgoing: 0 },
      constrainsLinkDestinationsOn: { outgoing: 0 },
      isOfType: { outgoing: 0 },
      hasLeftEntity: { incoming: 0, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 0 },
    },
    temporalAxes: {
      pinned: {
        axis: "transactionTime",
        timestamp: null,
      },
      variable: {
        axis: "decisionTime",
        interval: {
          start: null,
          end: null,
        },
      },
    },
  });

  return dataTypeSubgraph as Subgraph<DataTypeRootType>;
};
