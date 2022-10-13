import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import { Subgraph, QueryGetDataTypeArgs, ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";

export const getAllLatestDataTypes: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const { data: dataTypeSubgraph } = await graphApi
    .getDataTypesByQuery({
      query: { eq: [{ path: ["version"] }, { literal: "latest" }] },
      /** todo - make these configurable once non-primitive data types are a thing https://app.asana.com/0/1200211978612931/1202464168422955/f */
      queryResolveDepths: {
        dataTypeResolveDepth: 0,
        propertyTypeResolveDepth: 0,
        linkTypeResolveDepth: 0,
        entityTypeResolveDepth: 0,
        entityResolveDepth: 0,
        linkResolveDepth: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest data types: ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return dataTypeSubgraph;
};

export const getDataType: ResolverFn<
  Promise<Subgraph>,
  {},
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (_, { dataTypeId }, { dataSources }) => {
  const { graphApi } = dataSources;

  const { data: dataTypeSubgraph } = await graphApi
    .getDataTypesByQuery({
      query: {
        eq: [{ path: ["versionedUri"] }, { literal: dataTypeId }],
      },
      /** todo - make these configurable once non-primitive data types are a thing https://app.asana.com/0/1200211978612931/1202464168422955/f */
      queryResolveDepths: {
        dataTypeResolveDepth: 0,
        propertyTypeResolveDepth: 0,
        linkTypeResolveDepth: 0,
        entityTypeResolveDepth: 0,
        entityResolveDepth: 0,
        linkResolveDepth: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve data type [${dataTypeId}]: ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return dataTypeSubgraph;
};
