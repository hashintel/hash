import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  PersistedDataType,
  QueryGetDataTypeArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { DataTypeModel } from "../../../model";
import { nilUuid } from "../../../model/util";
import { dataTypeModelToGQL } from "./model-mapping";

export const getAllLatestDataTypes: Resolver<
  Promise<PersistedDataType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const allLatestDataTypeModels = await DataTypeModel.getAllLatest(graphApi, {
    /** @todo Replace with User from the request */
    accountId: nilUuid,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve all latest data types. ${err.response?.data}`,
      "GET_ALL_ERROR",
    );
  });

  return allLatestDataTypeModels.map((dataTypeModel) =>
    dataTypeModelToGQL(dataTypeModel),
  );
};

export const getDataType: Resolver<
  Promise<PersistedDataType>,
  {},
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (_, { dataTypeVersionedUri }, { dataSources }) => {
  const { graphApi } = dataSources;

  const dataTypeModel = await DataTypeModel.get(graphApi, {
    versionedUri: dataTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(
      `Unable to retrieve data type. ${err.response?.data}`,
      "GET_ERROR",
    );
  });

  return dataTypeModelToGQL(dataTypeModel);
};
