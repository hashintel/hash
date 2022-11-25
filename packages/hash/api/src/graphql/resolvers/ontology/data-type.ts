import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import { Subgraph } from "@hashintel/hash-subgraph";
import {
  QueryGetDataTypeArgs,
  ResolverFn,
  QueryGetAllLatestDataTypesArgs,
} from "../../apiTypes.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";

export const getAllLatestDataTypes: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestDataTypesArgs
> = async (_, { constrainsValuesOn }, { dataSources }) => {
  const { graphApi } = dataSources;

  const { data: dataTypeSubgraph } = await graphApi
    .getDataTypesByQuery({
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      graphResolveDepths: {
        constrainsValuesOn,
        constrainsPropertiesOn: 0,
        constrainsLinksOn: 0,
        hasLeftEntity: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest data types: ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return dataTypeSubgraph as Subgraph;
};

export const getDataType: ResolverFn<
  Promise<Subgraph>,
  {},
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (_, { dataTypeId, constrainsValuesOn }, { dataSources }) => {
  const { graphApi } = dataSources;

  const { data: dataTypeSubgraph } = await graphApi
    .getDataTypesByQuery({
      filter: {
        equal: [{ path: ["versionedUri"] }, { parameter: dataTypeId }],
      },
      /** @todo - make these configurable once non-primitive data types are a thing https://app.asana.com/0/1200211978612931/1202464168422955/f */
      graphResolveDepths: {
        constrainsValuesOn,
        constrainsPropertiesOn: 0,
        constrainsLinksOn: 0,
        hasLeftEntity: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve data type [${dataTypeId}]: ${err.response?.data}`,
        "GET_ERROR",
      );
    });

  return dataTypeSubgraph as Subgraph;
};
