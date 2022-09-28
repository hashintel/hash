import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedDataType,
  QueryGetDataTypeArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { DataTypeModel } from "../../../model";
import { mapDataTypeModelToGQL } from "./model-mapping";

export const getAllLatestDataTypes: ResolverFn<
  Promise<PersistedDataType[]>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources, user }) => {
  const { graphApi } = dataSources;

  const allLatestDataTypeModels = await DataTypeModel.getAllLatest(graphApi, {
    accountId: user.entityId,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve all latest data types. ${err.response?.data}`,
      "GET_ALL_ERROR",
    );
  });

  return allLatestDataTypeModels.map(mapDataTypeModelToGQL);
};

export const getDataType: ResolverFn<
  Promise<PersistedDataType>,
  {},
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (_, { dataTypeVersionedUri }, { dataSources }) => {
  const { graphApi } = dataSources;

  const dataTypeModel = await DataTypeModel.get(graphApi, {
    dataTypeId: dataTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve data type. ${err.response?.data}`,
      "GET_ERROR",
    );
  });

  return mapDataTypeModelToGQL(dataTypeModel);
};
