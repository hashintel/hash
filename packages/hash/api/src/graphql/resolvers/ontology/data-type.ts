import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  IdentifiedDataType,
  QueryGetDataTypeArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { DataTypeModel } from "../../../model";
import { NIL_UUID } from "../../../model/util";

export const getAllLatestDataTypes: Resolver<
  Promise<IdentifiedDataType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const allLatestDataTypeModels = await DataTypeModel.getAllLatest(graphApi, {
    /** @todo Replace with User from the request */
    accountId: NIL_UUID,
  }).catch((err: AxiosError) => {
    throw new ApolloError(`${err.response?.data}`, "GET_ALL_ERROR");
  });

  return allLatestDataTypeModels.map(
    (dataType) =>
      <IdentifiedDataType>{
        createdBy: dataType.accountId,
        dataTypeVersionedUri: dataType.schema.$id,
        schema: dataType.schema,
      },
  );
};

export const getDataType: Resolver<
  Promise<IdentifiedDataType>,
  {},
  GraphQLContext,
  QueryGetDataTypeArgs
> = async (_, { dataTypeVersionedUri }, { dataSources }) => {
  const { graphApi } = dataSources;

  const dataTypeModel = await DataTypeModel.get(graphApi, {
    versionedUri: dataTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(`${err.response?.data}`, "GET_ERROR");
  });

  return {
    createdBy: dataTypeModel.accountId,
    dataTypeVersionedUri: dataTypeModel.schema.$id,
    schema: dataTypeModel.schema,
  };
};
