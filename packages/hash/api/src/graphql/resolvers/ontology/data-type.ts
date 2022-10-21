import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  Subgraph,
  QueryGetDataTypeArgs,
  ResolverFn,
  QueryGetAllLatestDataTypesArgs,
} from "../../apiTypes.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { mapSubgraphToGql } from "./model-mapping";

export const getAllLatestDataTypes: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestDataTypesArgs
> = async (_, { dataTypeResolveDepth }, { dataSources }) => {
  const { graphApi } = dataSources;

  const { data: dataTypeSubgraph } = await graphApi
    .getDataTypesByQuery({
      query: { eq: [{ path: ["version"] }, { literal: "latest" }] },
      graphResolveDepths: {
        dataTypeResolveDepth,
        propertyTypeResolveDepth: 0,
        linkTypeResolveDepth: 0,
        entityTypeResolveDepth: 0,
        linkTargetEntityResolveDepth: 0,
        linkResolveDepth: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest data types: ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return mapSubgraphToGql(dataTypeSubgraph);
};

export const getDataType: ResolverFn<
  Promise<Subgraph>,
  {},
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (_, { dataTypeId, dataTypeResolveDepth }, { dataSources }) => {
  const { graphApi } = dataSources;

  const { data: dataTypeSubgraph } = await graphApi
    .getDataTypesByQuery({
      query: {
        eq: [{ path: ["versionedUri"] }, { literal: dataTypeId }],
      },
      /** @todo - make these configurable once non-primitive data types are a thing https://app.asana.com/0/1200211978612931/1202464168422955/f */
      graphResolveDepths: {
        dataTypeResolveDepth,
        propertyTypeResolveDepth: 0,
        linkTypeResolveDepth: 0,
        entityTypeResolveDepth: 0,
        linkTargetEntityResolveDepth: 0,
        linkResolveDepth: 0,
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve data type [${dataTypeId}]: ${err.response?.data}`,
        "GET_ERROR",
      );
    });

  return mapSubgraphToGql(dataTypeSubgraph);
};
