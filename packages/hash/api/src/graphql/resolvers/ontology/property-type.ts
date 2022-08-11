import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";
import { PropertyType } from "@hashintel/hash-graph-client";

import {
  IdentifiedPropertyType,
  MutationCreatePropertyTypeArgs,
  MutationUpdatePropertyTypeArgs,
  QueryGetPropertyTypeArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { PropertyTypeModel } from "../../../model";
import { NIL_UUID } from "../../../model/util";

export const createPropertyType: Resolver<
  Promise<IdentifiedPropertyType>,
  {},
  GraphQLContext,
  MutationCreatePropertyTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { accountId } = params;
  const propertyType = params.propertyType as PropertyType;

  const createdPropertyTypeModel = await PropertyTypeModel.create(graphApi, {
    accountId,
    schema: propertyType,
  }).catch((err: AxiosError) => {
    if (err.response?.status === 409) {
      throw new ApolloError(
        `Property type with the same URI already exists. [URI=${propertyType.$id}]`,
        "CREATION_ERROR",
      );
    }

    throw new ApolloError(`Couldn't create property type.`, "CREATION_ERROR");
  });

  return {
    createdBy: accountId,
    propertyTypeVersionedUri: createdPropertyTypeModel.schema.$id,
    schema: createdPropertyTypeModel.schema,
  };
};

export const getAllLatestPropertyTypes: Resolver<
  Promise<IdentifiedPropertyType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const allLatestPropertyTypeModels = await PropertyTypeModel.getAllLatest(
    graphApi,
    {
      /** @todo Replace with User from the request */
      accountId: NIL_UUID,
    },
  ).catch((err: AxiosError) => {
    throw new ApolloError(`${err.response?.data}`, "GET_ALL_ERROR");
  });

  return allLatestPropertyTypeModels.map(
    (propertyType) =>
      <IdentifiedPropertyType>{
        createdBy: propertyType.accountId,
        propertyTypeVersionedUri: propertyType.schema.$id,
        schema: propertyType.schema,
      },
  );
};

export const getPropertyType: Resolver<
  Promise<IdentifiedPropertyType>,
  {},
  GraphQLContext,
  QueryGetPropertyTypeArgs
> = async (_, { propertyTypeVersionedUri }, { dataSources }) => {
  const { graphApi } = dataSources;

  const propertyTypeModel = await PropertyTypeModel.get(graphApi, {
    versionedUri: propertyTypeVersionedUri,
  }).catch((err: AxiosError) => {
    throw new ApolloError(`${err.response?.data}`, "GET_ERROR");
  });

  return {
    createdBy: propertyTypeModel.accountId,
    propertyTypeVersionedUri: propertyTypeModel.schema.$id,
    schema: propertyTypeModel.schema,
  };
};

export const updatePropertyType: Resolver<
  Promise<IdentifiedPropertyType>,
  {},
  GraphQLContext,
  MutationUpdatePropertyTypeArgs
> = async (_, params, { dataSources }) => {
  const { graphApi } = dataSources;
  const { accountId } = params;
  const propertyType = params.propertyType as PropertyType;

  const propertyTypeModel = await PropertyTypeModel.get(graphApi, {
    versionedUri: propertyType.$id,
  }).catch((err: AxiosError) => {
    throw new ApolloError(`${err.response?.data}`, "GET_ERROR");
  });

  const updatedPropertyTypeModel = await propertyTypeModel
    .update(graphApi, {
      accountId,
      schema: propertyType,
    })
    .catch((err: AxiosError) => {
      if (err.response?.status === 409) {
        throw new ApolloError(
          `Property type URI doesn't exist, unable to update. [URI=${propertyType.$id}]`,
          "CREATION_ERROR",
        );
      }
      throw new ApolloError(`Couldn't update property type.`, "CREATION_ERROR");
    });

  return {
    createdBy: updatedPropertyTypeModel.accountId,
    propertyTypeVersionedUri: updatedPropertyTypeModel.schema.$id,
    schema: updatedPropertyTypeModel.schema,
  };
};
