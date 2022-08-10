import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";

import {
  IdentifiedDataType,
  MutationCreateDataTypeArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { DataTypeModel } from "../../../model";

export const createDataType: Resolver<
  Promise<IdentifiedDataType>,
  {},
  GraphQLContext,
  MutationCreateDataTypeArgs
> = async (_, { accountId, dataType }, { dataSources }) => {
  const { graphApi } = dataSources;

  const createdDataType = await DataTypeModel.create(graphApi, {
    accountId,
    schema: dataType as any,
  }).catch((err: AxiosError) => {
    throw new ApolloError(`${err.response?.data}`, "CREATION_ERROR");
  });

  return {
    createdBy: accountId,
    dataTypeVersionedUri: createdDataType.schema.$id,
    schema: createdDataType.schema,
  };
};
